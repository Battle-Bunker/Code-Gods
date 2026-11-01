/**
 * @workspace/game-runtime: isolated computational runtimes for agents (Python: CPython 3.15 WASI on
 * Node's WebAssembly; TypeScript: QuickJS-Wasm), as a bounded pool of worker_threads or in-process.
 * No child processes, no files read at run time except through the `assets` hook.
 */
import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  RuntimeError, fail, GRAMMAR_IDS, COMPLEXITY_IDS, CALLS_MAX_BYTES, MAX_REQUEST_BYTES,
  normalize, checkInput, checkSource, parseSeed, ascii, preludeDigest, Lru,
  SCRIPT_GRAMMAR_IDS, SCRIPT_REQUEST_MAX_BYTES, checkScriptSource, checkScriptInput, scriptOptions, scriptWallSlackMs, checkScriptResult, scriptTimeLimit,
} from "./engine/domain.mjs";
import { TYPESCRIPT_VERSION } from "./engine/typescript.mjs";
import { unpack, PYTHON_BUNDLE_SHA256 } from "./engine/bundle.mjs";
import workerSource from "./generated/worker-source.mjs";

export {
  RuntimeError, GRAMMAR_IDS, COMPLEXITY_IDS, MOVE_FLAG_BITS, STEP_BUDGET_DEFAULT, STEP_BUDGET_MAX, WIRE_MAX_LENGTH,
  PRELUDE_PART_MAX_BYTES, CALLS_MAX_BYTES, SCRIPT_GRAMMAR_IDS, SCRIPT_LIMITS,
} from "./engine/domain.mjs";
export { PYTHON_BUNDLE_SHA256 };
/** File name of the built Python bundle (dist/ in this package; the object uploaded to Convex storage). */
export const PYTHON_BUNDLE_FILE = "python-runtime.bin.gz";

function checkAct(result) {
  if (!result || Object.keys(result).sort().join() !== "calls,steps,usedRandom" || typeof result.calls !== "string"
      || result.calls.length > CALLS_MAX_BYTES || !ascii(result.calls) || typeof result.usedRandom !== "boolean"
      || !Number.isSafeInteger(result.steps) || result.steps < 0)
    throw new Error("Invalid act result");
  return { calls: result.calls, usedRandom: result.usedRandom, steps: result.steps };
}
const bits = x => typeof x === "number" && Number.isFinite(x) && x >= 0;
function checkInspection(result, language) {
  const { cost, astBytes, parts, literalMoves, literalMoveFallbackBits } = result ?? {};
  if (!result || Object.keys(result).sort().join() !== "astBytes,cost,literalMoveFallbackBits,literalMoves,parts"
      || !bits(cost) || !Number.isSafeInteger(astBytes) || astBytes < 0 || !parts
      || Object.keys(parts).sort().join() !== "literals,moveFlags,names,structure"
      || !Object.values(parts).every(bits) || !Array.isArray(literalMoves) || literalMoves.length > 4096
      || !Array.isArray(literalMoveFallbackBits) || literalMoveFallbackBits.length !== literalMoves.length
      || !literalMoveFallbackBits.every(bits)
      || !literalMoves.every(m => Array.isArray(m) && m.length === 2 && typeof m[0] === "string"
        && m[1] !== null && typeof m[1] === "object" && !Array.isArray(m[1])))
    throw new Error("Invalid inspection result");
  return { complexityFunctionId: COMPLEXITY_IDS[language], cost, astBytes, parts, literalMoves, literalMoveFallbackBits };
}

// --- Python runtime assets: loaded, verified and compiled once per process (a warm Convex instance).
const pythonHosts = new Map();
/** The default asset source: dist/python-runtime.bin.gz next to this package (absent inside a bundle). */
const packagedBundle = () => readFile(fileURLToPath(new URL(`./dist/${PYTHON_BUNDLE_FILE}`, import.meta.url)));
/**
 * Loads the Python bundle once per `assets` source: bytes, a path, or an async loader. Verifies the
 * pinned SHA-256 (bundle.mjs) and compiles the reactor once; workers share the compiled module and,
 * after the first worker's bootstrap, its initialized snapshot. Until then only the compressed bundle is
 * kept (`unpacked()` gives a fresh copy to transfer to the bootstrapping engine); afterwards nothing.
 */
export function loadPythonRuntime(assets = packagedBundle) {
  let host = pythonHosts.get(assets);
  if (!host) {
    host = (async () => {
      const raw = typeof assets === "function" ? await assets()
        : typeof assets === "string" ? await readFile(assets) : assets;
      const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
      const module = await WebAssembly.compile(unpack(bytes).get("python-reactor.wasm"));
      return { bytes, unpacked() { const b = this.bytes; return unpack(b[0] === 0x1f && b[1] === 0x8b ? b : b.slice()); }, module, snapshot: null, bootstrapping: null };
    })();
    host.catch(() => pythonHosts.delete(assets));
    pythonHosts.set(assets, host);
  }
  return host;
}

/**
 * Absolute paths of the TypeScript compiler and QuickJS, resolved as this module's own `import()` would
 * (ESM resolution first: inside a Convex bundle, CommonJS resolution can fall through to a different,
 * globally installed copy). The engine refuses any TypeScript but the pinned version.
 */
export function typescriptPaths() {
  const require = createRequire(import.meta.url);
  const resolve = name => {
    try { return fileURLToPath(import.meta.resolve(name)); } catch { return require.resolve(name); }
  };
  return { typescript: resolve("typescript"), quickjs: resolve("quickjs-emscripten") };
}

const inlineTypeScript = new Map();
let inlineEngineModules;
const engines = () => (inlineEngineModules ??= Promise.all([import("./engine/python.mjs"), import("./engine/typescript.mjs")]));

/**
 * A bounded pool. execution "worker" (default): each engine in its own worker_thread, with a hard
 * wall that terminates a worker stuck past its deadline. "inline": one engine on the calling thread,
 * requests one at a time; there is no hard wall (the deterministic step budget and the engines'
 * post-checks still apply), so a native step that never returns blocks the thread.
 */
export class GameRuntime {
  constructor({ language, workers = 1, queueLimit = 32, deadlineMs = 4000, startupMs = 30000, prepareMs,
    execution = "worker", assets, typescriptFiles, compilerIdleMs = 60000 } = {}) {
    if (!["python", "typescript"].includes(language)) fail("CONFIG", "Unknown language");
    if (!["worker", "inline"].includes(execution)) fail("CONFIG", "execution must be \"worker\" or \"inline\"");
    prepareMs ??= language === "python" ? Math.min(3000, startupMs) : startupMs;
    for (const n of [workers, queueLimit, deadlineMs, startupMs, prepareMs])
      if (!Number.isSafeInteger(n) || n < 1) fail("CONFIG", "Limits must be positive integers");
    if (workers > 16 || queueLimit > 1024 || deadlineMs > 30000 || startupMs > 120000 || prepareMs > startupMs)
      fail("CONFIG", "Unsupported service limits");
    if (execution === "inline") workers = 1;
    Object.assign(this, { language, workers, queueLimit, deadlineMs, startupMs, prepareMs, execution, assets, typescriptFiles });
    this.grammarId = GRAMMAR_IDS[language];
    this.queue = []; this.slots = []; this.closed = false; this.nextId = 1;
    // TypeScript workers: one compiler worker (type-check, transpile, price; the TypeScript compiler is
    // the memory) and `workers` QuickJS-only execution workers. Trusted compiler output is cached here.
    this.role = arguments[0]?.role ?? (language === "typescript" && execution === "worker" ? "execute" : "full");
    if (this.role === "execute") {
      this.compiler = new GameRuntime({ language, workers: 1, queueLimit, deadlineMs, startupMs, prepareMs, typescriptFiles, role: "compile" });
      this.compiler.idleMs = compilerIdleMs;   // 0 keeps it running
      this.compiled = new Lru(128, 4 * 1024 * 1024);
      this.compiling = new Map();
    }
  }
  /** Trusted compiler output {inspection, js} for a TypeScript source (cached; one compilation in flight per key). */
  compile(source, settings) {
    checkSource(source);
    const key = JSON.stringify([GRAMMAR_IDS.typescript, COMPLEXITY_IDS.typescript, TYPESCRIPT_VERSION, settings.objectType,
      settings.prelude.key, preludeDigest(settings.prelude), source]);
    const cached = this.compiled.get(key);
    if (cached) return Promise.resolve(cached);
    if (!this.compiling.has(key)) {
      const pending = this.compiler.request("compile", source, settings).then(result => {
        const bytes = Buffer.byteLength(key) + Buffer.byteLength(result.js) + Buffer.byteLength(JSON.stringify(result.inspection));
        return this.compiled.set(key, result, bytes);
      }).finally(() => this.compiling.delete(key));
      this.compiling.set(key, pending);
    }
    return this.compiling.get(key);
  }
  async inspect(source, settings) {
    const normalized = normalize(settings);
    if (this.compiler) return { ...(await this.compile(source, normalized)).inspection };
    return this.request("inspect", source, normalized);
  }
  async act(source, input, settings, seed) {
    const normalized = normalize(settings);
    checkInput(input, normalized);
    parseSeed(seed);
    if (this.compiler) {
      const { js } = await this.compile(source, normalized);
      return this.request("execute", source, normalized, input, seed, js);
    }
    return this.request("act", source, normalized, input, seed);
  }
  async validate(source, samples, settings, seeds) {
    if (!Array.isArray(samples) || samples.length < 1 || samples.length > 32)
      fail("DOMAIN", "Validation requires 1–32 samples");
    if (!Array.isArray(seeds) || seeds.length !== samples.length)
      fail("CONFIG", "Validation needs one seed per sample");
    const normalized = normalize(settings);
    samples.forEach(sample => checkInput(sample, normalized));
    seeds.forEach(parseSeed);
    const inspection = await this.inspect(source, normalized);
    const acts = [];
    for (let i = 0; i < samples.length; i++) acts.push(await this.act(source, samples[i], normalized, seeds[i]));
    return { inspection, acts };
  }
  /**
   * One script (python-script-v1 / typescript-script-v1): `main(data)` over `input` (JSON text), in a fresh guest
   * with the agents' sandbox, a virtual clock and `random` / `Math.random` seeded by `seed`, within `cpuMs` of CPU
   * (the hard wall is that plus scriptWallSlackMs). Resolves {result (JSON text), output, outputTruncated, usedRandom, cpuMs}.
   */
  async script(source, input, options = {}) {
    checkScriptSource(source);
    checkScriptInput(input);
    const { cpuMs, seed } = scriptOptions(options);
    if (this.compiler) {
      const { js } = await this.transpile(source);
      return this.request("script", source, { cpuMs }, input, seed, js);
    }
    return this.request("script", source, { cpuMs }, input, seed);
  }
  /** A TypeScript script's trusted compiler output {js} (cached like agents' compilations). */
  transpile(source) {
    const key = JSON.stringify([SCRIPT_GRAMMAR_IDS.typescript, TYPESCRIPT_VERSION, source]);
    const cached = this.compiled.get(key);
    if (cached) return Promise.resolve(cached);
    if (!this.compiling.has(key)) {
      const pending = this.compiler.request("transpile", source, {}).then(result =>
        this.compiled.set(key, result, Buffer.byteLength(key) + Buffer.byteLength(result.js))).finally(() => this.compiling.delete(key));
      this.compiling.set(key, pending);
    }
    return this.compiling.get(key);
  }
  /** Starts (and warms) up to `count` workers ahead of demand; resolves when they are ready. */
  async warm(count = this.workers) {
    if (this.closed) fail("UNAVAILABLE", "Runtime is closed");
    while (this.slots.length < Math.min(count, this.workers)) this.start();
    await Promise.all([this.compiler?.warm(), ...this.slots.map(slot => slot.ready ? undefined : new Promise((resolve, reject) => {
      slot.onReady.push(resolve); slot.onFail.push(reject);
    }))]);
  }
  request(mode, source, settings, input, seed, js) {
    const scriptMode = mode === "script" || mode === "transpile";
    if (scriptMode) checkScriptSource(source); else checkSource(source);
    if (this.closed) fail("UNAVAILABLE", "Runtime is closed");
    if (this.queue.length + this.slots.filter(s => s.job).length >= this.queueLimit + this.workers)
      fail("CAPACITY", "Runtime capacity exhausted; retry later");
    return new Promise((resolve, reject) => {
      const job = { id: this.nextId++, request: { mode, source, settings, input, seed, js }, resolve, reject };
      const maxBytes = scriptMode ? SCRIPT_REQUEST_MAX_BYTES : MAX_REQUEST_BYTES;
      if (Buffer.byteLength(JSON.stringify(job.request)) > maxBytes)
        return reject(new RuntimeError("CONFIG", `Runtime request exceeds ${maxBytes} bytes`));
      // Queue wait itself is bounded, including slow worker startup.
      job.timer = setTimeout(() => {
        const i = this.queue.indexOf(job);
        if (i >= 0) { this.queue.splice(i, 1); reject(new RuntimeError("CAPACITY", "Queue wait expired")); }
      }, this.startupMs + (mode === "script" ? settings.cpuMs + scriptWallSlackMs(settings.cpuMs) : this.deadlineMs));
      this.queue.push(job); this.pump();
    });
  }
  pump() {
    if (this.closed) return;
    for (const slot of this.slots) {
      if (!slot.ready || slot.job || !this.queue.length) continue;
      const job = this.queue.shift(); clearTimeout(job.timer); slot.job = job;
      slot.timer = setTimeout(() => this.remove(slot, new RuntimeError("LIMIT", job.request.mode === "act" && this.language === "python"
        ? `Time limit exceeded: preparing the agent took longer than ${this.prepareMs / 1000} seconds`
        : job.request.mode === "script" ? `Time limit exceeded: preparing the script (compiling it, reading its input) took longer than ${this.prepareMs / 1000} seconds`
        : "Time limit exceeded: the sandbox did not answer before its hard deadline")), this.prepareMs);
      slot.send(job);
    }
    // Starting workers already reserve queued jobs. Grow only for actual
    // concurrent demand, not every request during a sequential startup probe.
    let starting = this.slots.filter(slot => !slot.ready).length;
    while (this.queue.length > starting && this.slots.length < this.workers) {
      this.start(); starting++;
    }
    // An idle pool with `idleMs` (the TypeScript compiler) stops its workers; the next request restarts one.
    clearTimeout(this.idleTimer);
    if (this.idleMs && !this.queue.length && this.slots.length && this.slots.every(slot => slot.ready && !slot.job)) {
      this.idleTimer = setTimeout(() => {
        for (const slot of [...this.slots]) if (slot.ready && !slot.job) this.remove(slot, new RuntimeError("UNAVAILABLE", "Idle worker stopped"));
      }, this.idleMs);
      this.idleTimer.unref?.();
    }
  }
  start() {
    const slot = { ready: false, job: null, removed: false, onReady: [], onFail: [] };
    this.slots.push(slot);
    slot.timer = setTimeout(() => this.remove(slot, new RuntimeError("UNAVAILABLE", "Worker startup timed out")), this.startupMs);
    const ready = () => {
      if (slot.removed) return;
      slot.ready = true; clearTimeout(slot.timer);
      for (const resolve of slot.onReady.splice(0)) resolve();
      this.pump();
    };
    const unavailable = error => this.remove(slot, new RuntimeError("UNAVAILABLE", `Runtime dependency unavailable: ${String(error?.message ?? error).slice(0, 300)}`));
    if (this.execution === "inline") this.startInline(slot, ready, unavailable);
    else this.startWorker(slot, ready, unavailable);
  }
  /** Validates an engine reply and settles the slot's job. */
  settle(slot, reply) {
    const job = slot.job;
    if (!job || reply.id !== job.id) throw new Error("Unexpected response");
    clearTimeout(slot.timer); slot.job = null;
    if (!reply.ok) {
      job.reject(new RuntimeError(["COMPILE", "DOMAIN", "LIMIT", "EXECUTION", "CONFIG"].includes(reply.code) ? reply.code : "EXECUTION",
        String(reply.error).slice(0, 1000)));
    } else {
      const { mode } = job.request, result = reply.result;
      if (mode === "inspect") job.resolve(checkInspection(result, this.language));
      else if (mode === "compile") {
        if (!result || Object.keys(result).sort().join() !== "inspection,js" || typeof result.js !== "string") throw new Error("Invalid compile result");
        job.resolve({ inspection: checkInspection(result.inspection, this.language), js: result.js });
      } else if (mode === "transpile") {
        if (!result || Object.keys(result).join() !== "js" || typeof result.js !== "string") throw new Error("Invalid transpile result");
        job.resolve({ js: result.js });
      } else if (mode === "script") job.resolve(checkScriptResult(result));
      else job.resolve(checkAct(result));
    }
    this.pump();
  }
  /** The execute phase started: the hard wall now bounds the budgeted guest work. */
  executing(slot) {
    if (!slot.job || slot.job.executing) return;
    slot.job.executing = true;
    clearTimeout(slot.timer);
    if (slot.job.request.mode === "script") {
      // A script's budget is CPU seconds; its wall adds slack for scheduling, then the worker is terminated.
      const { cpuMs } = slot.job.request.settings;
      slot.executionWallMs = cpuMs + scriptWallSlackMs(cpuMs);
      slot.timer = setTimeout(() => this.remove(slot, new RuntimeError("LIMIT", scriptTimeLimit(cpuMs))), slot.executionWallMs);
      return;
    }
    // This is a wall-clock safety backstop, NOT the guest CPU meter. Allow scheduling slack without
    // giving a non-interruptible builtin the full service timeout.
    slot.executionWallMs = Math.min(this.deadlineMs, Math.max(50, slot.job.request.settings.interactionComputeMs * 10));
    const computeMs = slot.job.request.settings.interactionComputeMs;
    slot.timer = setTimeout(() => this.remove(slot, new RuntimeError("LIMIT",
      `Time limit exceeded: the agent used more than its ${computeMs} ms compute budget for one interaction (it ran past its ${slot.executionWallMs} ms hard deadline). Do less work per call.`)),
    slot.executionWallMs);
  }
  async pythonWorkerData() {
    const host = await loadPythonRuntime(this.assets);
    if (!host.snapshot) {
      // One bootstrap per host: the first worker's snapshot is shared with the rest.
      if (host.bootstrapping) await host.bootstrapping.catch(() => {});
      if (!host.snapshot) {
        let done;
        host.bootstrapping = new Promise((resolve, reject) => { done = { resolve, reject }; });
        const files = host.unpacked();   // a fresh copy, transferred (not copied) to the bootstrapping worker
        return { data: { files, module: host.module }, transfer: [files.values().next().value.buffer], host, done };
      }
    }
    return { data: { module: host.module, snapshot: host.snapshot, files: new Map() } };
  }
  startWorker(slot, ready, unavailable) {
    const python = this.language === "python";
    const prepared = python ? this.pythonWorkerData() : Promise.resolve({ data: undefined });
    prepared.then(({ data, transfer, host, done }) => {
      if (slot.removed) { done?.reject(new Error("removed")); return; }
      let paths;
      if (!python) { try { paths = this.typescriptFiles ?? typescriptPaths(); } catch (error) { return unavailable(error); } }
      const worker = new Worker(workerSource, {
        eval: true, workerData: python ? { language: "python", python: data } : { language: "typescript", role: this.role, paths },
        env: {}, stdout: true, stderr: true, transferList: transfer,
        resourceLimits: { maxOldGenerationSizeMb: python ? 96 : this.role === "compile" ? 192 : 64 },
      });
      slot.worker = worker;
      slot.send = job => worker.postMessage({ id: job.id, request: job.request });
      slot.terminate = () => worker.terminate();
      // Guest code has no stdout; a worker's own console output is discarded.
      worker.stdout.resume(); worker.stderr.resume();
      worker.on("message", message => {
        try {
          if (message.type === "ready") {
            if (done) {
              // The snapshot replaces the bundle: drop its files (the compiled reactor stays).
              if (message.snapshot) { host.snapshot = message.snapshot; host.bytes = null; done.resolve(); }
              else done.reject(new Error("no snapshot"));
            }
            return ready();
          }
          if (message.type === "failed") { done?.reject(new Error(message.error)); return unavailable(message.error); }
          if (message.type === "execute") return message.id === slot.job?.id && this.executing(slot);
          this.settle(slot, message);
        } catch (error) {
          this.remove(slot, error instanceof RuntimeError ? error : new RuntimeError("EXECUTION", "Invalid runtime response"));
        }
      });
      worker.on("error", error => { done?.reject(error); slot.ready ? this.remove(slot, new RuntimeError("UNAVAILABLE", "Runtime worker failed")) : unavailable(error); });
      worker.on("exit", () => { done?.reject(new Error("exited")); this.remove(slot, new RuntimeError("UNAVAILABLE", "Runtime worker exited")); });
    }, unavailable);
  }
  startInline(slot, ready, unavailable) {
    (async () => {
      const [{ PythonEngine }, { createTypeScriptEngine }] = await engines();
      if (this.language === "python") {
        const host = await loadPythonRuntime(this.assets);
        const engine = new PythonEngine(host.snapshot ? { module: host.module, snapshot: host.snapshot, files: new Map() }
          : { files: host.unpacked(), module: host.module });
        if (!host.snapshot) { host.snapshot = engine.snapshot; host.bytes = null; }
        return engine;
      }
      // By file, never by package name: a bundler must not inline these (see `typescriptFiles`).
      const files = this.typescriptFiles ?? typescriptPaths();
      const key = JSON.stringify(files);
      if (!inlineTypeScript.has(key)) {
        inlineTypeScript.set(key, import(pathToFileURL(files.quickjs).href).then(quickjs => createTypeScriptEngine({
          ts: createRequire(pathToFileURL(files.typescript))(files.typescript), getQuickJS: quickjs.getQuickJS })));
      }
      return inlineTypeScript.get(key);
    })().then(engine => {
      slot.send = job => setImmediate(() => {
        if (slot.removed || slot.job !== job) return;
        let reply;
        try {
          const result = engine.run(job.request, { onExecute: () => this.executing(slot) });
          reply = { id: job.id, ok: true, result };
        } catch (error) {
          reply = { id: job.id, ok: false, code: error instanceof RuntimeError ? error.code : "EXECUTION", error: String(error?.message ?? error) };
        }
        if (slot.removed) return;
        clearTimeout(slot.timer);
        try { this.settle(slot, reply); } catch (error) { this.remove(slot, new RuntimeError("EXECUTION", String(error.message))); }
      });
      slot.terminate = () => {};
      ready();
    }, unavailable);
  }
  remove(slot, error) {
    if (slot.removed) return;
    slot.removed = true; clearTimeout(slot.timer); slot.terminate?.();
    this.slots = this.slots.filter(s => s !== slot);
    if (slot.job) slot.job.reject(error);
    for (const reject of slot.onFail.splice(0)) reject(error);
    // Missing dependencies should not create an endless respawn loop.
    if (!slot.ready) {
      for (const job of this.queue.splice(0)) { clearTimeout(job.timer); job.reject(error); }
    } else this.pump();
  }
  close() {
    clearTimeout(this.idleTimer);
    this.closed = true;
    const error = new RuntimeError("UNAVAILABLE", "Runtime closed");
    for (const job of this.queue.splice(0)) { clearTimeout(job.timer); job.reject(error); }
    for (const slot of [...this.slots]) this.remove(slot, error);
    this.compiler?.close();
  }
}

export const createRuntime = options => new GameRuntime(options);
