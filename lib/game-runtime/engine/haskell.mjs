/**
 * haskell-agent-v1 on MicroHs (engine/haskell-bundle.mjs), on Node's own WebAssembly; synchronous like the
 * other engines. Two halves, as for TypeScript:
 *
 *  - HaskellCompiler: the player's source (a module body: optional imports, then declarations including
 *    `agent :: Obj -> [Call]`) + the room's generated `Room` module + a fixed `Main` -> a self-contained
 *    MicroHs combinator program (trusted compiler output, cached by the pool), and the summon price
 *    (hs-token-bits-v1-uniform, engine/hs-token-bits.mjs).
 *  - HaskellExecutor: one act = a fresh evaluator instance running that program: the input on stdin, the
 *    moves (JSON) on stdout, a deterministic reduction budget; then the room's trusted JavaScript
 *    constructors (QuickJS, engine/quickjs.mjs) turn the moves into the wire call list.
 *
 * Determinism: the evaluator is single-threaded graph reduction with a fixed heap; the virtual clock and the
 * seeded byte stream are the only time and entropy (engine/haskell-wasi.mjs). Steps: one step is
 * REDUCTIONS_PER_STEP reductions; the budget is checked every 10,000 reductions and exactly at the end.
 */
import { fail, stepLimit, timeLimit, stopwatch, CALLS_MAX_BYTES, Lru, preludeDigest } from "./domain.mjs";
import { runModule, MAXIMUM_PAGES, REUSE_PAGES } from "./haskell-wasi.mjs";
import { hsTokenBits } from "./hs-token-bits.mjs";

/** MicroHs reductions per step (a Python LINE event is roughly 10 to 30 reductions). */
export const REDUCTIONS_PER_STEP = 10;
/** Exit code of a run stopped by the reduction budget (scripts/build-haskell-bundle.mjs). */
export const STEP_EXIT = 86;
/** The compiler's own reduction ceiling (a trivial agent takes about 40 million; the counter is 32-bit). */
export const COMPILE_REDUCTIONS = 2_000_000_000;
/** A room's compilation cache (uncompressed: the bundle's compressor is the identity), at most this many bytes. */
const ROOM_CACHE_BYTES = 32 * 1024 * 1024;
/** Heap cells: the compiler needs room for the base package; an act gets a smaller fixed heap. */
const COMPILER_HEAP = "-H6M", ACT_HEAP = "-H2M";
const HEADER = "module Agent where\nimport Room\n";
const MAIN = `module Main(main) where
import Room (cgEncode, cgDecode)
import qualified Agent
main :: IO ()
main = getContents >>= \\s -> putStr (cgEncode (Agent.agent (cgDecode s)))
`;
const EXAMPLE = "\n\nagent :: Obj -> [Call]\nagent x = []";
const enc = s => new TextEncoder().encode(s);

/** Prelude names the Room module hides (agents hide them too, so the room's names win). */
export function hiddenPrelude(room) {
  const m = /^import Prelude hiding \(([^)]*)\)$/mu.exec(room);
  return m ? m[1].split(",").map(s => s.trim()).filter(Boolean) : [];
}

/** The Agent module text: the header (hiding what Room hides) then the player's source, and the header's line count. */
export function agentModule(source, room) {
  const hidden = hiddenPrelude(room);
  const header = HEADER + (hidden.length ? `import Prelude hiding (${hidden.join(", ")})\n` : "");
  return { text: header + source, lines: header.split("\n").length - 1 };
}

/** Maps a MicroHs diagnostic about Agent.hs back to the player's lines; others name the program as a whole. */
export function compileMessage(stderr, headerLines) {
  const text = stderr.replace(/^Warning: cannot find config file[^\n]*\n/gmu, "").trim();
  const m = /^\/?(?:src\/)?(Agent|Main|Room)\.hs:(\d+):(\d+): error: ([\s\S]*)$/mu.exec(text);
  if (!m) return text.slice(0, 1000) || "the program did not compile";
  const [, file, line, col, rest] = m;
  if (file === "Agent") {
    const shift = n => Number(n) - headerLines;
    const body = rest.replace(/^(\s*)(\d+)( \|)/gmu, (_, sp, n, bar) => `${sp}${shift(n)}${bar}`);
    const clash = /ambiguous value: (\S+) \[Room\.[^,\]]+,([\w.]+)\.[^.,\]]+\]/u.exec(rest);
    const hint = clash ? `\n(${clash[1]} is the room's move; import ${clash[2]} qualified, e.g. import qualified ${clash[2]} as L, to use its ${clash[1]} as L.${clash[1]})` : "";
    return `line ${shift(line)}, column ${col}: ${body.trim()}${hint}`.slice(0, 1000);
  }
  if (file === "Main") {
    if (/undefined value: Agent\.agent/u.test(rest)) return `an agent must define agent at the top level, like:${EXAMPLE}`;
    return `agent must take the room's object and return a list of moves (agent :: Obj -> [Call]): ${rest.split("\n")[0]}`.slice(0, 1000);
  }
  return `the room's Haskell helpers did not compile: ${rest.split("\n")[0]}`.slice(0, 1000);
}

export class HaskellCompiler {
  /** @param {{ compiler: WebAssembly.Module, files: Map<string, Uint8Array> }} assets (files: db/...) */
  constructor({ compiler, files }) {
    this.compiler = compiler;
    this.db = new Map([...files].filter(([path]) => path.startsWith("db/")));
    /** MicroHs compilation caches by room (prelude digest): the room's compiled modules, about 12 MB each. */
    this.roomCaches = new Lru(4, 64 * 1024 * 1024);
  }
  /** Summon price of a source in a room, without compiling. */
  inspect(source, settings) {
    if (/^\s*module\b/mu.test(source)) fail("COMPILE", "line 1: leave out the module header; an agent is just its imports and definitions");
    let priced;
    try { priced = hsTokenBits(source, settings.prelude.haskell, settings.prelude.pricing.typescript.strings); }
    catch (error) { fail("COMPILE", `SyntaxError: ${error.message}`); }
    const { parts, astBytes } = priced;
    return Object.freeze({ cost: parts.structure + parts.names + parts.literals + parts.moveFlags, astBytes, parts,
      literalMoves: [], literalMoveFallbackBits: [] });
  }
  /**
   * {inspection, js, roomCache?}: `js` is the compiled combinator program (latin1 text of its bytes). `roomCache`: the
   * room's compilation cache from elsewhere (another worker, storage), used when this compiler has none for the room;
   * a compilation that writes the room's cache returns it, and so does any when `wantRoomCache` (the caller has none).
   */
  compile(source, settings, roomCache, wantRoomCache = false) {
    const inspection = this.inspect(source, settings);
    const room = settings.prelude.haskell;
    if (typeof room !== "string" || !room) fail("CONFIG", "The room has no Haskell prelude");
    const agent = agentModule(source, room);
    const digest = preludeDigest(settings.prelude);
    const cached = this.roomCaches.get(digest) ?? (roomCache instanceof Uint8Array && roomCache.length ? roomCache : undefined);
    let mode = cached ? "read" : "write";
    let result = this.run(agent, room, mode, cached);
    // A cache the compiler could not use (it never should): compile without it, and replace it if that works. An
    // error in the agent's own module, or the agent exhausting the compiler's heap, is the agent's, not the cache's.
    if (mode === "read" && (result.trapped || result.failed && !/^\/?(?:src\/)?(Agent|Main)\.hs:|Out of memory|stack overflow/imu.test(result.errors))) {
      mode = "write";
      result = this.run(agent, room, mode);
    }
    // A Room module whose cache would not fit in ROOM_CACHE_BYTES: compile without a cache.
    if (mode === "write" && result.overflowed) result = this.run(agent, room, mode = "none");
    if (result.limit) fail("LIMIT", result.limit);
    if (result.failed) {
      if (/Out of memory|stack overflow/iu.test(result.errors)) fail("LIMIT", "The compiler ran out of memory compiling this agent");
      fail("COMPILE", compileMessage(result.errors, agent.lines));
    }
    // The first compilation in a room writes the cache: later ones skip compiling the Room module (about half the time).
    // The cache holds this agent's module too, which the compiler reuses only for exactly the same source.
    let written;
    if (mode === "write" && result.cache?.[0] === 0x71) {
      written = result.cache.subarray(1).slice();
      this.roomCaches.set(digest, written, written.length);
    } else if (mode === "read" && !this.roomCaches.get(digest)) this.roomCaches.set(digest, cached, cached.length);
    const held = written ?? (wantRoomCache && mode === "read" ? cached : undefined);
    return { inspection, js: Buffer.from(result.program).toString("latin1"), ...(held ? { roomCache: held } : {}) };
  }
  /**
   * One compiler run, reading the room's cache, writing it, or neither: {failed, errors, program, cache, overflowed},
   * or {limit} when the compiler ran out of reductions, or trapped (out of memory: also `trapped`).
   */
  run(agent, room, mode, cache) {
    const files = new Map([...this.db, ["src/Room.hs", enc(room)], ["src/Agent.hs", enc(agent.text)], ["src/Main.hs", enc(MAIN)],
      ...(mode === "read" ? [["cache/room.cache", cache]] : [])]);
    const cacheArgs = { read: ["-CR/cache/room.cache"], write: ["-CW/out/room.cache"], none: [] }[mode];
    let run;
    try {
      run = runModule(this.compiler, { files, stdoutMax: 64 * 1024, stderrMax: 64 * 1024, outMax: ROOM_CACHE_BYTES,
        args: ["mhs", "+RTS", COMPILER_HEAP, "-RTS", ...cacheArgs, "-a/db", "-i/src", "-o/out/agent.comb", "Main"] },
      COMPILE_REDUCTIONS, MAXIMUM_PAGES.compiler, REUSE_PAGES.compiler);
    } catch (error) {
      return { trapped: true, limit: `The compiler ran out of memory compiling this agent (${String(error?.message ?? error).slice(0, 200)})` };
    }
    if (run.code === STEP_EXIT) return { limit: "The agent took too long to compile" };
    const program = run.wasi.output("agent.comb");
    const errors = run.wasi.stderr.text() + run.wasi.stdout.text();
    return { failed: run.code !== 0 || !program || /error:/u.test(errors), errors, program, cache: run.wasi.output("room.cache"),
      overflowed: run.wasi.overflowed };
  }
}

/** The trusted JavaScript that turns a Haskell program's moves into the room's calls (inside QuickJS). */
export function movesProgram(raw, vocab) {
  return `
const __HS_MOVES = ${JSON.stringify(raw)};
const __HS_MUTATORS = new Set(${JSON.stringify(vocab.mutators)});
const __HS_AREAS = new Set(${JSON.stringify(vocab.areas)});
function __hs_value(v) {
  if (Array.isArray(v)) return v.map(__hs_value);
  if (v !== null && typeof v === "object") {
    if (typeof v.__hs === "string") {
      if (!__HS_AREAS.has(v.__hs) || typeof globalThis[v.__hs] !== "function") throw new Error(v.__hs + " is not an area in this room");
      return globalThis[v.__hs](...v.args.map(__hs_value));
    }
    const out = {};
    for (const k of Object.keys(v)) out[k] = __hs_value(v[k]);
    return out;
  }
  return v;
}
function __hs_call(entry) {
  const name = entry[0];
  if (!__HS_MUTATORS.has(name) || typeof globalThis[name] !== "function") throw new Error(name + " is not a move in this room");
  return globalThis[name](...entry[1].map(__hs_value));
}
function agent(_object) {
  if (Array.isArray(__HS_MOVES)) return __HS_MOVES.map(__hs_call);
  return { __commit: __HS_MOVES.commit, calls: __HS_MOVES.calls.map(__hs_call) };
}
`;
}

/** The shape the Room module's encoder writes; anything else is the guest's own output, not moves. */
function checkMoves(raw) {
  const json = v => v === null || ["number", "string", "boolean"].includes(typeof v)
    || (Array.isArray(v) && v.every(json)) || (typeof v === "object" && Object.values(v).every(json));
  const list = calls => Array.isArray(calls) && calls.every(c => Array.isArray(c) && c.length === 2
    && typeof c[0] === "string" && Array.isArray(c[1]) && c[1].every(json));
  if (list(raw)) return raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).sort().join() === "calls,commit"
      && raw.commit === "if-improves" && list(raw.calls)) return raw;
  return null;
}

export class HaskellExecutor {
  /** @param {{ evaluator: WebAssembly.Module, quickjs: { execute: Function } }} deps (quickjs: engine/quickjs.mjs) */
  constructor({ evaluator, quickjs }) { this.evaluator = evaluator; this.quickjs = quickjs; }
  /** One act: {calls, usedRandom, steps}. */
  execute({ program, settings, input, seed }, { onExecute = () => {} } = {}) {
    const { stepBudget, interactionComputeMs: computeMs } = settings;
    const files = new Map([["agent.comb", Buffer.from(program, "latin1")]]);
    onExecute();
    const cpu = stopwatch();
    let run;
    try {
      run = runModule(this.evaluator, { files, stdin: enc(typeof input === "number" ? String(input) : input), seed: BigInt(seed),
        stdoutMax: CALLS_MAX_BYTES * 2, stderrMax: 16 * 1024, args: ["agent", "+RTS", ACT_HEAP, "-r/agent.comb", "-RTS"] },
      stepBudget * REDUCTIONS_PER_STEP);
    } catch (error) {
      if (cpu() >= computeMs) fail("LIMIT", timeLimit(computeMs));
      fail("LIMIT", `The agent ran out of memory (${String(error?.message ?? error).slice(0, 200)})`);
    }
    const steps = Math.ceil(run.reductions / REDUCTIONS_PER_STEP);
    if (run.code === STEP_EXIT || steps > stepBudget) fail("LIMIT", stepLimit(stepBudget));
    if (cpu() >= computeMs) fail("LIMIT", timeLimit(computeMs));
    const errors = run.wasi.stderr.text();
    if (run.code !== 0) {
      if (/Out of memory|stack overflow|heap/iu.test(errors)) fail("LIMIT", "The agent ran out of memory");
      const thrown = /uncaught exception: ([\s\S]*)$/u.exec(errors);
      fail("EXECUTION", `agent threw an error: ${(thrown ? thrown[1] : errors || `exit ${run.code}`).trim().slice(0, 500)}`);
    }
    if (run.wasi.stdout.overflow) fail("LIMIT", `agent returned too many mutator calls (encoded output over ${CALLS_MAX_BYTES} bytes)`);
    let raw;
    try { raw = checkMoves(JSON.parse(run.wasi.stdout.text())); } catch { raw = null; }
    if (!raw) fail("DOMAIN", "agent must return a list of moves (the program printed something else)");
    // The room's own constructors (the TypeScript ones) validate and encode the moves. Trusted code over at most
    // 2 × CALLS_MAX_BYTES of moves: bounded work, outside the agent's steps (as Python's and JS's own encoders are).
    const vocab = settings.prelude.pricing.typescript;
    const encoded = this.quickjs.execute({ js: movesProgram(raw, vocab), preludeJs: settings.prelude.js, input,
      computeMs: Math.max(computeMs, 50), seed, stepBudget: 1_000_000 });
    return { calls: encoded.calls, usedRandom: run.wasi.usedEntropy, steps };
  }
}

/**
 * The engine a worker (or an inline pool) runs: `compiler` and/or `executor` by role. Requests: compile,
 * inspect, execute (a compiled program), act (compile, cached here, then execute).
 */
export function createHaskellEngine({ compiler, executor }) {
  const compiled = new Lru(32, 8 * 1024 * 1024);
  const compile = (source, settings, roomCache, wantRoomCache) => {
    const key = JSON.stringify([preludeDigest(settings.prelude), settings.objectType, source]);
    const hit = compiled.get(key);
    if (hit) return hit;
    const result = compiler.compile(source, settings, roomCache, wantRoomCache);
    compiled.set(key, { inspection: result.inspection, js: result.js }, Buffer.byteLength(key) + result.js.length + 4096);
    return result;
  };
  return {
    run(request, hooks) {
      const { mode, source, settings } = request;
      if (mode === "compile") return compile(source, settings, request.roomCache, request.wantRoomCache === true);
      if (mode === "inspect") return compile(source, settings).inspection;
      if (mode === "execute") return executor.execute({ program: request.js, settings, input: request.input, seed: request.seed }, hooks);
      if (mode === "act") return executor.execute({ program: compile(source, settings).js, settings, input: request.input, seed: request.seed }, hooks);
      if (mode === "script" || mode === "transpile") fail("CONFIG", "Haskell has no script mode");
      throw new Error("Unknown runner mode");
    },
  };
}
