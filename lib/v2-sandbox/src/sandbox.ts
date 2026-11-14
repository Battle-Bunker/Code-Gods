/**
 * The sandbox: run one agent act against a host, under the act's step budget, time cap and host-call cap.
 *
 *  - `execution: "inline"`: the engine runs on the calling thread. The step budget and the time cap (checked at
 *    QuickJS interrupts and at Python's every-10,000-steps clock read) stop agents that loop in their own code; a
 *    single native step that never returns (a catastrophic regex, `sum(range(10**12))`) blocks the thread.
 *  - `execution: "worker"` (for untrusted code): the engine runs in a worker thread, the host channel is a
 *    SharedArrayBuffer the worker blocks on (Atomics.wait) while this thread answers, and a hard wall terminates
 *    the worker `HARD_WALL_GRACE_MS` past the time cap; the next act starts a new worker (Python from the snapshot).
 *
 * An act's failures that are the agent's (COMPILE, EXECUTION, LIMIT) are results, with the transcript and the read
 * bits so far, so the engine can charge them; CONFIG and UNAVAILABLE are thrown.
 */
import { readFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { Channel, type AgentHost, type TranscriptEntry } from "./channel.ts";
import { SandboxError, LIMITS, actLimits, parseSeed, timeLimit, type ActLimits, type ErrorCode } from "./limits.ts";
import { transpile } from "./compile.ts";
import { loadBundle } from "./bundle.ts";
import type { Engine, ExecuteRequest } from "./engine.ts";
import type { PythonSnapshot } from "./python.ts";

export type Language = "python" | "typescript" | "javascript";

export interface SandboxOptions {
  language: Language;
  execution?: "inline" | "worker";
  /** The CPython bundle's bytes or path (Python only; default: lib/game-runtime/dist/python-runtime.bin.gz). */
  pythonBundle?: string | Uint8Array;
}

export interface ActRequest {
  /** The agent's source: Python, TypeScript or JavaScript, defining `agent(offer)`. */
  source: string;
  /** What the agent learns before it asks anything: which object it was offered (spec §6.1 step 1). */
  offer: { object: number };
  /** The act's seed (64-bit, decimal or 0x hex): the agent's randomness and nothing else. */
  seed: string | bigint;
  host: AgentHost;
  limits?: Partial<ActLimits>;
}

interface ActCommon {
  transcript: TranscriptEntry[];
  /** The sum of the receipts: read bits the act was charged, whatever its outcome. */
  readBits: number;
}
export type ActResult =
  | (ActCommon & { ok: true; calls: string; steps: number; usedRandom: boolean })
  | (ActCommon & { ok: false; code: Exclude<ErrorCode, "CONFIG" | "UNAVAILABLE">; error: string });

export interface Sandbox {
  readonly language: Language;
  act(request: ActRequest): Promise<ActResult>;
  close(): void;
}

export const HARD_WALL_GRACE_MS = 250;
/** A worker's trusted preparation of one act (compiling, shape-checking, the guest library) must finish in this. */
export const PREPARE_MS = 5000;
const PRELUDES = {
  python: () => readFileSync(new URL("../guest/codegods.py", import.meta.url), "utf8"),
  javascript: () => readFileSync(new URL("../guest/codegods.js", import.meta.url), "utf8"),
};

/** Validate and compile an act's inputs (an agent's compile error is a result, not a throw). */
function prepare(language: Language, request: ActRequest): { execute: ExecuteRequest; limits: ActLimits } | SandboxError {
  const limits = actLimits(request.limits);
  const seed = parseSeed(request.seed);
  if (!Number.isSafeInteger(request.offer?.object) || request.offer.object < 0) throw new SandboxError("CONFIG", "offer.object must be an object number");
  const offer = JSON.stringify(request.offer);
  if (offer.length > LIMITS.offerBytes) throw new SandboxError("CONFIG", `the offer is over ${LIMITS.offerBytes} bytes`);
  if (typeof request.source !== "string" || Buffer.byteLength(request.source) > LIMITS.sourceBytes) {
    return new SandboxError("COMPILE", `The agent's source must be text of at most ${LIMITS.sourceBytes} bytes`);
  }
  let source = request.source;
  if (language === "typescript") {
    try { source = transpile(source); } catch (error) { if (error instanceof SandboxError) return error; throw error; }
  }
  const prelude = language === "python" ? PRELUDES.python() : PRELUDES.javascript();
  return { execute: { source, prelude, offer, seed, stepBudget: limits.stepBudget, wallMs: limits.wallMs }, limits };
}

const failed = (error: SandboxError, channel: Channel | null): ActResult => {
  if (error.code === "CONFIG" || error.code === "UNAVAILABLE") throw error;
  return { ok: false, code: error.code, error: error.message, transcript: channel?.transcript ?? [], readBits: channel?.readBits ?? 0 };
};

export async function createSandbox(options: SandboxOptions): Promise<Sandbox> {
  const { language, execution = "inline" } = options;
  if (!["python", "typescript", "javascript"].includes(language)) throw new SandboxError("CONFIG", `unknown language ${language}`);
  if (execution === "worker") return new WorkerSandbox(language, options.pythonBundle);
  if (execution !== "inline") throw new SandboxError("CONFIG", "execution is inline or worker");
  let engine: Engine;
  try {
    if (language === "python") {
      const { PythonEngine } = await import("./python.ts");
      engine = new PythonEngine({ files: loadBundle(options.pythonBundle) });
    } else {
      const { QuickJSEngine } = await import("./quickjs.ts");
      engine = await QuickJSEngine.create();
    }
  } catch (error) {
    throw new SandboxError("UNAVAILABLE", `The ${language} sandbox could not start: ${String((error as Error)?.message ?? error).slice(0, 500)}`);
  }
  return {
    language,
    async act(request) {
      const prepared = prepare(language, request);
      if (prepared instanceof SandboxError) return failed(prepared, null);
      const channel = new Channel(request.host, prepared.limits.hostCallCap);
      try {
        const result = engine.execute(prepared.execute, { host: text => channel.call(text) });
        return { ok: true, ...result, transcript: channel.transcript, readBits: channel.readBits };
      } catch (error) {
        if (error instanceof SandboxError) return failed(error, channel);
        throw error;
      }
    },
    close() {},
  };
}

// --- Worker execution.
const HEADER = 2;   // Int32 slots: [0] state (0 idle, 1 request waiting, 2 reply ready), [1] byte length
export interface WorkerShared { control: Int32Array; data: Uint8Array }

type Pending = { channel: Channel; resolve(result: ActResult): void; reject(error: unknown): void; timer?: NodeJS.Timeout };

class WorkerSandbox implements Sandbox {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private pending: Pending | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private python: { module: WebAssembly.Module; files: Map<string, Uint8Array> | null; snapshot: PythonSnapshot | null } | null = null;
  private readonly shared: WorkerShared = {
    control: new Int32Array(new SharedArrayBuffer(4 * HEADER)),
    data: new Uint8Array(new SharedArrayBuffer(LIMITS.messageBytes)),
  };
  private closed = false;

  readonly language: Language;
  private readonly bundle?: string | Uint8Array;
  constructor(language: Language, bundle?: string | Uint8Array) { this.language = language; this.bundle = bundle; }

  act(request: ActRequest): Promise<ActResult> {
    const run = this.queue.then(() => this.run(request));
    this.queue = run.catch(() => undefined);
    return run;
  }

  close() {
    this.closed = true;
    const pending = this.pending;
    this.pending = null;
    this.kill();
    if (pending) { clearTimeout(pending.timer); pending.reject(new SandboxError("UNAVAILABLE", "The sandbox was closed")); }
  }

  private start(): Promise<void> {
    if (this.ready) return this.ready;
    let workerData: unknown;
    if (this.language === "python") {
      if (!this.python) {
        const files = loadBundle(this.bundle);
        this.python = { module: new WebAssembly.Module(files.get("python-reactor.wasm") as Uint8Array<ArrayBuffer>), files, snapshot: null };
      }
      const { module, files, snapshot } = this.python;
      workerData = { language: "python", shared: this.shared, python: snapshot ? { module, snapshot } : { module, files } };
    } else workerData = { language: "javascript", shared: this.shared };
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      workerData,
      resourceLimits: { maxOldGenerationSizeMb: this.language === "python" ? 96 : 64, stackSizeMb: 4 },
    });
    this.worker = worker;
    this.ready = new Promise<void>((resolve, reject) => {
      const startup = setTimeout(() => { reject(new SandboxError("UNAVAILABLE", "The sandbox worker did not start in 30 s")); this.kill(); }, 30_000);
      worker.on("message", message => {
        if (this.worker !== worker) return;   // a worker this sandbox already replaced
        if (message.type === "ready") {
          clearTimeout(startup);
          if (message.snapshot && this.python) { this.python.snapshot = message.snapshot; this.python.files = null; }
          resolve();
        } else if (message.type === "failed") { clearTimeout(startup); reject(new SandboxError("UNAVAILABLE", message.error)); this.kill(); }
        else this.onMessage(message);
      });
      worker.on("error", (error: Error) => { clearTimeout(startup); reject(new SandboxError("UNAVAILABLE", String(error?.message ?? error))); this.lost(worker, String(error?.message ?? error)); });
      worker.on("exit", () => { clearTimeout(startup); reject(new SandboxError("UNAVAILABLE", "The sandbox worker exited")); this.lost(worker, "The sandbox worker exited"); });
    });
    return this.ready;
  }

  private kill() {
    const worker = this.worker;
    this.worker = null; this.ready = null;
    void worker?.terminate();
  }
  /** The worker died with an act in flight: that act fails as an execution error (a crash, not a limit). */
  private lost(worker: Worker, reason: string) {
    if (this.worker !== worker) return;   // a worker this sandbox already replaced
    this.worker = null; this.ready = null;
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    clearTimeout(pending.timer);
    pending.resolve(failed(new SandboxError("EXECUTION", `The sandbox stopped: ${reason}`), pending.channel));
  }

  private onMessage(message: { type: string; ok?: boolean; result?: unknown; code?: ErrorCode; error?: string; wallMs?: number }) {
    const pending = this.pending;
    if (!pending) return;
    if (message.type === "execute") {
      // The hard wall: the guest's own checks get the time cap; a stuck native step gets a little more, then ends.
      clearTimeout(pending.timer);
      pending.timer = this.wall(pending, message.wallMs! + HARD_WALL_GRACE_MS, timeLimit(message.wallMs!));
    } else if (message.type === "host") {
      const { control, data } = this.shared;
      const request = new TextDecoder().decode(data.slice(0, control[1]));
      const reply = new TextEncoder().encode(pending.channel.call(request));
      data.set(reply);
      control[1] = reply.length;
      Atomics.store(control, 0, 2);
      Atomics.notify(control, 0);
    } else if (message.type === "result") {
      this.pending = null;
      clearTimeout(pending.timer);
      if (message.ok) {
        const result = message.result as { calls: string; steps: number; usedRandom: boolean };
        pending.resolve({ ok: true, ...result, transcript: pending.channel.transcript, readBits: pending.channel.readBits });
      } else {
        try { pending.resolve(failed(new SandboxError(message.code!, message.error!), pending.channel)); }
        catch (error) { pending.reject(error); }
      }
    }
  }

  private async run(request: ActRequest): Promise<ActResult> {
    if (this.closed) throw new SandboxError("UNAVAILABLE", "The sandbox is closed");
    const prepared = prepare(this.language, request);
    if (prepared instanceof SandboxError) return failed(prepared, null);
    await this.start();
    const channel = new Channel(request.host, prepared.limits.hostCallCap);
    return new Promise<ActResult>((resolve, reject) => {
      const pending: Pending = { channel, resolve, reject };
      pending.timer = this.wall(pending, PREPARE_MS, `The sandbox could not prepare the agent in ${PREPARE_MS} ms`);
      this.pending = pending;
      Atomics.store(this.shared.control, 0, 0);
      this.worker!.postMessage({ request: prepared.execute });
    });
  }

  /** End the act and its worker after `ms`, unless it has settled. */
  private wall(pending: Pending, ms: number, reason: string) {
    return setTimeout(() => {
      if (this.pending !== pending) return;
      this.pending = null;
      this.kill();
      pending.resolve(failed(new SandboxError("LIMIT", reason), pending.channel));
    }, ms);
  }
}
