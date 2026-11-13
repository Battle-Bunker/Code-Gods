"use node";
/**
 * The ONE place the engine reaches agent sandboxes (QuickJS for TypeScript, CPython-WASI on Node's WebAssembly for
 * Python). A 512 MiB Node action holds one language's pools comfortably, not every language's, so the tick, summon
 * examinations and probes hold none: `act` and `inspect` send the work to actions of the language's own
 * (runtime/acts.ts, which run it here with `actHere`/`inspectHere` on that instance's warm pool; runtime/compile.ts for
 * TypeScript compilation). Batches of one language go in one call, and the languages' calls run in parallel.
 * An action that runs a pool calls `bindRuntime(ctx)` first, so the Python bundle can load from file storage.
 */
import { LANGUAGE_SPECS, codecOf, isLanguage, defaultSettingsFor, instantiationOf, validateSettings, type GameSettings, type ObjectValue } from "@workspace/game-core";
import { objectType, withCommitClause } from "@workspace/game-types";
import { compilationKey, type ActResult, type ActSettings, type Compiled, type Inspection, type Language, type PricingVocab } from "@workspace/game-runtime";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { RETRY_AFTER_MS, notReadyMessage } from "../lib/sandboxes";
import type { StoredLanguage } from "../lib/language";
import { RUNTIME_ASSETS, runtimeFor, runtimeVersion } from "../runtime/node";
import { ACT_BATCH, PROGRAM_REFRESH_MS } from "../lib/programs";
import type { LanguageSandbox } from "../runtime/readiness";
export { bindRuntime, runtimeVersion } from "../runtime/node";

/**
 * Acts in flight per tick wave: one batch per language (ACT_BATCH), each in one call to its own action
 * (runtime/acts.ts), so a wave pays one round trip, not one per act.
 */
export const WORKERS = 16;

/** Runtime failures caused by the agent's own code; CONFIG is a server bug, CAPACITY/UNAVAILABLE are the host's. */
export const AGENT_FAULTS: ReadonlySet<string> = new Set(["COMPILE", "DOMAIN", "EXECUTION", "LIMIT"]);
export const isAgentFault = (error: unknown) =>
  !!error && typeof error === "object" && AGENT_FAULTS.has(String((error as { code?: unknown }).code));

const actSettingsCache = new Map<string, ActSettings>();
/** The runtime's view of a room: the instantiation's prelude and wire bound, never the full settings. */
export function actSettings(settings: GameSettings): ActSettings {
  const inst = instantiationOf(settings);
  const key = `${inst.key}\0${settings.interactionComputeMs}\0${settings.stepBudget}\0${settings.commitClause}`;
  let cached = actSettingsCache.get(key);
  if (!cached) {
    const base = objectType(inst.objectType).prelude(inst), parts = settings.commitClause ? withCommitClause(base) : base;
    cached = Object.freeze({
      objectType: inst.objectType, wireMaxLength: codecOf(settings).maxLength,
      interactionComputeMs: settings.interactionComputeMs, stepBudget: settings.stepBudget,
      prelude: { key: parts.hash, python: parts.python, js: parts.js, dts: parts.dts,
        pricing: parts.pricing as unknown as { python: PricingVocab; typescript: PricingVocab } },
    }) as ActSettings;
    if (actSettingsCache.size >= 64) actSettingsCache.delete(actSettingsCache.keys().next().value!);
    actSettingsCache.set(key, cached);
  }
  return cached;
}

/** A CONFIG failure is a server bug, never the agent's fault: logged, and reported as RUNTIME_CONFIG. */
function serverBug(error: unknown): never {
  if ((error as { code?: string })?.code === "CONFIG") {
    console.error("Runtime configuration error (server bug)", (error as Error).message);
    throw Object.assign(new Error("The game runtime is misconfigured"), { code: "RUNTIME_CONFIG" });
  }
  throw error;
}

/**
 * The source's description bits and literal moves, in the agent's own language (one the game allows: the caller
 * checks that). Never evaluates. TypeScript is priced by its compiling action (runtime/compile.ts), Python by an
 * action with Python's pool (runtime/acts.ts); this action holds no pool.
 */
export async function inspect(ctx: ActionCtx, source: string, language: Language, settings: GameSettings): Promise<Inspection> {
  validateSettings(settings);
  if (language === "typescript") return { ...(await compiledProgram(ctx, language, source, settings)).inspection };
  const reply = await ctx.runAction(internal.runtime.acts.inspect, { source, settings });
  if (!reply.ok) serverBug(Object.assign(new Error(reply.message), { code: reply.code }));
  return reply.inspection;
}
/** Python's inspection on this instance's pool (runtime/acts.ts only). */
export function inspectHere(source: string, settings: GameSettings): Promise<Inspection> {
  validateSettings(settings);
  return runtimeFor("python").inspect(source, actSettings(settings)).catch(serverBug);
}

/**
 * One deterministic act (frozen clock, `random` seeded with `seed`) of an agent in `language`: the UNTRUSTED encoded
 * call list. Run by an action with that language's pool (runtime/acts.ts); acts asked for together (a tick wave, an
 * examination's concurrent acts) go in one call per language.
 */
export function act(ctx: ActionCtx, source: string, language: StoredLanguage, input: ObjectValue, settings: GameSettings, seed: bigint, lane: ActLane = {}): Promise<ActResult> {
  // A past game's agent in a retired language (lib/language.ts) fails its acts as the agent's own fault.
  if (!isLanguage(language)) return Promise.reject(Object.assign(new Error(`${language} agents are no longer supported`), { code: "EXECUTION" }));
  return new Promise((resolve, reject) => {
    let queues = actQueues.get(ctx);
    if (!queues) actQueues.set(ctx, queues = new Map());
    let byLanguage = queues.get(settings);
    if (!byLanguage) queues.set(settings, byLanguage = new Map());
    let queue = byLanguage.get(language);
    if (!queue) {
      byLanguage.set(language, queue = []);
      // Everything asked for in this turn of the event loop, then one call per batch (the languages' in parallel).
      setImmediate(() => {
        byLanguage!.delete(language);
        for (let i = 0; i < queue!.length; i += ACT_BATCH) void sendActs(ctx, language, settings, queue!.slice(i, i + ACT_BATCH));
      });
    }
    queue.push({ source, input: input as string | number, seed: seed.toString(), lane, resolve, reject });
  });
}
/**
 * How an act queues for its sandbox (game-runtime RequestOptions). `lane`: who waits for it. A game's tick (the
 * default) goes first and gives each act the wave's `deadline` (past it nobody is waiting for the answer, so the
 * sandbox drops the act instead of running it late). "human": a person's validate or summon (the assistant's on a
 * person's behalf included), served right behind ticks. "background": an AI seat's examinations, after both.
 */
export type ActLane = { lane?: "human" | "background"; deadline?: number };
const PRIORITY = { tick: 0, human: 1, background: 2 } as const;
type ActRequest = { source: string; input: string | number; seed: string; lane: ActLane; resolve: (result: ActResult) => void; reject: (error: unknown) => void };
/** Acts waiting to be sent, per action, room settings and language. */
const actQueues = new WeakMap<ActionCtx, Map<GameSettings, Map<Language, ActRequest[]>>>();
async function sendActs(ctx: ActionCtx, language: Language, settings: GameSettings, batch: ActRequest[]): Promise<void> {
  let replies: Awaited<ReturnType<typeof ctx.runAction<typeof internal.runtime.acts.run>>>["replies"];
  try {
    // One lane per batch: the most urgent of its acts'; the earliest deadline.
    const deadlines = batch.flatMap(r => (r.lane.deadline !== undefined ? [r.lane.deadline] : []));
    const lane = batch.some(r => !r.lane.lane) ? undefined : batch.some(r => r.lane.lane === "human") ? "human" as const : "background" as const;
    ({ replies } = await ctx.runAction(internal.runtime.acts.run, { language, settings,
      requests: batch.map(({ source, input, seed }) => ({ source, input, seed })),
      ...(lane ? { lane } : {}), ...(deadlines.length ? { deadline: Math.min(...deadlines) } : {}) }));
  } catch (error) {
    // The call itself failed (the other action ran out of memory, or the deployment refused it): the host's failure.
    const failure = Object.assign(new Error(`The ${LANGUAGE_SPECS[language].label} runtime is unavailable: ${(error as Error)?.message ?? error}`), { code: "UNAVAILABLE" });
    for (const request of batch) request.reject(failure);
    return;
  }
  batch.forEach((request, i) => {
    const reply = replies[i];
    if (reply.ok) return request.resolve({ calls: reply.calls, usedRandom: reply.usedRandom, steps: reply.steps, readBits: reply.readBits ?? 0 });
    try { serverBug(Object.assign(new Error(reply.message), { code: reply.code, ...(reply.readBits !== undefined ? { readBits: reply.readBits } : {}) })); }
    catch (error) { request.reject(error); }
  });
}
/** One act on this instance's pool of its language (runtime/acts.ts only). */
export async function actHere(ctx: ActionCtx, source: string, language: Language, input: string | number, settings: GameSettings, seed: string, lane: ActLane = {}): Promise<ActResult> {
  const room = actSettings(settings);
  const options = { priority: PRIORITY[lane.lane ?? "tick"], ...(lane.deadline !== undefined ? { deadline: lane.deadline } : {}) };
  if (language === "typescript") {
    // The program first (another action compiles it), then this instance's pool runs it.
    const { js } = await compiledProgram(ctx, language, source, settings);
    return runtimeFor(language).actCompiled(source, js, input, room, seed, options).catch(serverBug);
  }
  return runtimeFor(language).act(source, input, room, seed, options).catch(serverBug);
}

type KnownProgram = Compiled | { error: { code: string; message: string } };
/** This instance's compiled programs (and the agents' own compile failures), by compilationKey; the oldest go first. */
const programs = new (class {
  private map = new Map<string, { value: KnownProgram; size: number }>();
  private bytes = 0;
  constructor(private maxEntries: number, private maxBytes: number) {}
  get(key: string) {
    const item = this.map.get(key);
    if (item) { this.map.delete(key); this.map.set(key, item); }
    return item?.value;
  }
  set(key: string, value: KnownProgram, size: number) {
    const old = this.map.get(key);
    if (old) { this.map.delete(key); this.bytes -= old.size; }
    if (size > this.maxBytes) return;
    while (this.map.size && (this.map.size >= this.maxEntries || this.bytes + size > this.maxBytes)) {
      const [oldest, item] = this.map.entries().next().value!;
      this.map.delete(oldest); this.bytes -= item.size;
    }
    this.map.set(key, { value, size }); this.bytes += size;
  }
})(256, 16 * 1024 * 1024);
/**
 * `program` for this action's callers: always a promise, and a CONFIG failure of the compiling action is a server bug
 * (`serverBug`), never the agent's fault.
 */
function compiledProgram(ctx: ActionCtx, language: "typescript", source: string, settings: GameSettings): Promise<Compiled> {
  return Promise.resolve().then(() => program(ctx, language, source, settings)).catch(serverBug);
}
/** Lookups in flight, per action (never awaited by another action, whose context could outlive this one's). */
const pendingPrograms = new WeakMap<ActionCtx, Map<string, Promise<Compiled>>>();
const compileFailure = (error: { code: string; message: string }) => Object.assign(new Error(error.message), { code: error.code });
/**
 * A TypeScript agent's compiled program: from this instance, else the stored one (runtime/programs.ts), else
 * compiled by runtime/compile.ts in another action, so this action never holds a compiler beside its pools. The agent's
 * compile errors keep their codes (COMPILE, LIMIT); a host failure is never remembered.
 */
export function program(ctx: ActionCtx, language: "typescript", source: string, settings: GameSettings): Promise<Compiled> {
  const key = compilationKey(language, source, actSettings(settings));
  const known = programs.get(key);
  if (known) return "error" in known ? Promise.reject(compileFailure(known.error)) : Promise.resolve(known);
  let pending = pendingPrograms.get(ctx);
  if (!pending) pendingPrograms.set(ctx, pending = new Map());
  let program = pending.get(key);
  if (!program) {
    const remember = (value: KnownProgram) =>
      programs.set(key, value, "error" in value ? value.error.message.length + 64 : value.js.length + JSON.stringify(value.inspection).length);
    program = (async () => {
      const stored = await ctx.runQuery(internal.runtime.programs.get, { key });
      if (stored && stored.compiledAt < Date.now() - PROGRAM_REFRESH_MS) await ctx.runMutation(internal.runtime.programs.touch, { key });
      const reply = stored ? (stored.error ? { ok: false as const, ...stored.error } : { ok: true as const, inspection: stored.inspection, js: stored.js })
        : await ctx.runAction(internal.runtime.compile.compile, { language, source, settings });
      if (!reply.ok) {
        if (AGENT_FAULTS.has(reply.code)) remember({ error: { code: reply.code, message: reply.message } });
        throw compileFailure(reply);
      }
      const compiled = { inspection: reply.inspection, js: reply.js };
      remember(compiled);
      return compiled;
    })();
    pending.set(key, program);
    const settle = () => pending!.delete(key);
    program.then(settle, settle);
  }
  return program;
}

/**
 * Boot a language's sandbox on this instance and prove it: an empty agent must round-trip on a default instantiation.
 * A success is remembered for the instance's life; a failure reports why and is retried by the next call.
 */
const probes = new Map<Language, Promise<{ ok: true } | { ok: false; reason: string }>>();
export function probeLanguage(ctx: ActionCtx, language: Language): Promise<{ ok: true } | { ok: false; reason: string }> {
  let p = probes.get(language);
  if (!p) {
    p = (async () => {
      try {
        const settings = defaultSettingsFor("Int", [language]);
        const inst = instantiationOf(settings), T = objectType(inst.objectType);
        const { seededRng } = await import("@workspace/game-types");
        const value = T.codec(inst).encode(T.spawn(inst, seededRng(`code-gods:probe:${inst.key}`)));
        const result = await act(ctx, LANGUAGE_SPECS[language].emptyAgent, language, value, settings, 0n);
        if (result.calls !== "[]") throw new Error(`the probe agent returned ${result.calls.slice(0, 100)}`);
        return { ok: true as const };
      } catch (error) {
        console.warn(`Isolated ${language} runtime unavailable: ${(error as Error).message}`);
        probes.delete(language);
        return { ok: false as const, reason: (error as Error).message.slice(0, 500) };
      }
    })();
    probes.set(language, p);
  }
  return p;
}

/**
 * Each language's sandbox readiness for this code, scheduling the warm-ups that are due (runtime/readiness.ts ensure;
 * one mutation, no writes when all are ready). `keepWarm`: a proactive caller, which also refreshes a ready runtime
 * so a Node instance stays warm. Never boots anything itself: no caller waits on a sandbox.
 */
export async function ensureSandboxes(ctx: ActionCtx, languages: readonly Language[], keepWarm = false): Promise<LanguageSandbox[]> {
  const unique = [...new Set(languages)];
  if (!keepWarm) {
    // The common case (validate, summon, run_code): every language already booted at this version; a query says so.
    const found = await ctx.runQuery(internal.runtime.readiness.rows, { languages: unique });
    if (found.every(({ row }) => row?.state === "ready" && row.version === runtimeVersion(row.language))) {
      return found.map(({ language, row }) => ({ language, state: "ready" as const, ...(row!.readyAt !== undefined ? { readyAt: row!.readyAt } : {}) }));
    }
  }
  return ctx.runMutation(internal.runtime.readiness.ensure, {
    runtimes: unique.map(language => ({ language, version: runtimeVersion(language), ...(RUNTIME_ASSETS[language] ? { asset: RUNTIME_ASSETS[language]!.name } : {}) })),
    ...(keepWarm ? { keepWarm } : {}),
  });
}

/** The typed "not ready yet" answer of a function that needs a warm sandbox (validate, summon, run_code). */
export type NotReady = { language: Language; state: "warming" | "failed"; reason?: string; retryAfterMs: number; message: string };
/** null when `language`'s sandbox is ready; else why not (and a warm-up is scheduled if one is due). */
export async function sandboxGate(ctx: ActionCtx, language: Language): Promise<NotReady | null> {
  const [view] = await ensureSandboxes(ctx, [language]);
  if (view.state === "ready") return null;
  return { language, state: view.state, ...(view.reason ? { reason: view.reason } : {}), retryAfterMs: RETRY_AFTER_MS,
    message: notReadyMessage(LANGUAGE_SPECS[language].label, view) };
}
