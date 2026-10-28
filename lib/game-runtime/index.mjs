import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

export class RuntimeError extends Error {
  constructor(code, message) { super(message); this.name = "RuntimeError"; this.code = code; }
}
const fail = (code, message) => { throw new RuntimeError(code, message); };

/** Grammar ids, one per language. */
export const GRAMMAR_IDS = Object.freeze({ python: "python-agent-v1", typescript: "typescript-agent-v1" });
/** Summon-price code per language (`complexityFunctionId`). */
export const COMPLEXITY_IDS = Object.freeze({ python: "ast-bits-v1", typescript: "ts-ast-bits-v1-uniform" });
/** -log2(Q_MOVE): the flag bits a literal move pays before log2(#available) + D(fields). */
export const MOVE_FLAG_BITS = 3;
export const STEP_BUDGET_DEFAULT = 500000;
export const STEP_BUDGET_MAX = 10000000;
const VOCAB_FIELDS = ["api", "attrs", "params", "strings", "mutators", "areas"];
export const WIRE_MAX_LENGTH = 1024;
export const PRELUDE_PART_MAX_BYTES = 65536;
export const CALLS_MAX_BYTES = 65536;
const MAX_REQUEST_BYTES = 524288;
const ascii = text => !/[^\x00-\x7f]/u.test(text);

/** The settings this package reads, copied so later caller mutation cannot race IPC. */
function vocab(v) {
  if (!v || typeof v !== "object" || Object.keys(v).sort().join() !== [...VOCAB_FIELDS].sort().join()
      || !VOCAB_FIELDS.every(f => Array.isArray(v[f]) && v[f].length <= 4096
        && v[f].every(x => typeof x === "string" && x.length > 0 && x.length <= 128)))
    fail("CONFIG", "The room's prelude needs a pricing vocabulary (api, attrs, params, strings, mutators, areas)");
  return Object.fromEntries(VOCAB_FIELDS.map(f => [f, [...v[f]]]));
}
function pricing(p) {
  if (!p || typeof p !== "object" || Object.keys(p).some(k => k !== "python" && k !== "typescript"))
    fail("CONFIG", "The room's prelude needs a pricing vocabulary");
  const python = vocab(p.python);
  return { python, typescript: p.typescript === undefined ? python : vocab(p.typescript) };
}
/** A 64-bit seed as a decimal or 0x-hex string (the host derives one per act). */
function checkSeed(seed) {
  if (typeof seed !== "string" || !/^(0[xX][0-9a-fA-F]{1,16}|[0-9]{1,20})$/u.test(seed) || BigInt(seed) >= 2n ** 64n)
    fail("CONFIG", "The act needs a seed: a 64-bit decimal or 0x-hex string");
  return seed;
}
function normalize(settings) {
  const { objectType, wireMaxLength, interactionComputeMs = 5, stepBudget = STEP_BUDGET_DEFAULT, prelude } = settings ?? {};
  const text = part => typeof part === "string" && !part.includes("\0")
    && Buffer.byteLength(part) <= PRELUDE_PART_MAX_BYTES && part.isWellFormed();
  if (typeof objectType !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(objectType)
      || !Number.isSafeInteger(wireMaxLength) || wireMaxLength < 0 || wireMaxLength > WIRE_MAX_LENGTH
      || !Number.isSafeInteger(interactionComputeMs) || interactionComputeMs < 1 || interactionComputeMs > 1000
      || !Number.isSafeInteger(stepBudget) || stepBudget < 1 || stepBudget > STEP_BUDGET_MAX
      || !prelude || typeof prelude.key !== "string" || !/^[\x21-\x7e]{1,128}$/u.test(prelude.key)
      || !text(prelude.python) || !text(prelude.js) || !text(prelude.dts))
    fail("CONFIG", "Unsupported runtime settings");
  return { objectType, wireMaxLength, interactionComputeMs, stepBudget,
    prelude: { key: prelude.key, python: prelude.python, js: prelude.js, dts: prelude.dts,
      pricing: pricing(prelude.pricing) } };
}
/** Generic wire check only; the host re-validates objects with the type's codec. */
function checkInput(input, settings) {
  const valid = typeof input === "number" ? Number.isSafeInteger(input)
    : typeof input === "string" && input.length <= settings.wireMaxLength && ascii(input);
  if (!valid) fail("DOMAIN", "Input is not a valid wire value for this room");
}
function checkAct(result) {
  if (Object.keys(result).sort().join() !== "calls,ok,steps,usedRandom" || typeof result.calls !== "string"
      || result.calls.length > CALLS_MAX_BYTES || !ascii(result.calls) || typeof result.usedRandom !== "boolean"
      || !Number.isSafeInteger(result.steps) || result.steps < 0)
    throw new Error("Invalid act result");
  return { calls: result.calls, usedRandom: result.usedRandom, steps: result.steps };
}
const bits = x => typeof x === "number" && Number.isFinite(x) && x >= 0;
function checkInspection(result, language) {
  const { cost, astBytes, parts, literalMoves, literalMoveFallbackBits } = result;
  if (Object.keys(result).sort().join() !== "astBytes,cost,literalMoveFallbackBits,literalMoves,ok,parts"
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

/** A bounded process pool. Guest code executes only in Wasm, never in these hosts. */
export class GameRuntime {
  constructor({ language, workers = 1, queueLimit = 32, deadlineMs = 4000,
    startupMs = 30000, python = "python3" } = {}) {
    if (!["python", "typescript"].includes(language)) fail("CONFIG", "Unknown language");
    for (const n of [workers, queueLimit, deadlineMs, startupMs])
      if (!Number.isSafeInteger(n) || n < 1) fail("CONFIG", "Limits must be positive integers");
    if (workers > 16 || queueLimit > 1024 || deadlineMs > 30000 || startupMs > 120000)
      fail("CONFIG", "Unsupported service limits");
    // Resolve the trusted executable before removing PATH from the child.
    if (!python.includes("/")) {
      python = (process.env.PATH ?? "").split(delimiter).map(p => join(p, python)).find(existsSync) ?? python;
    }
    Object.assign(this, { language, workers, queueLimit, deadlineMs, startupMs, python });
    this.grammarId = GRAMMAR_IDS[language];
    this.queue = []; this.slots = []; this.closed = false;
  }
  async inspect(source, settings) { return this.request("inspect", source, normalize(settings)); }
  async act(source, input, settings, seed) {
    const normalized = normalize(settings);
    checkInput(input, normalized);
    return this.request("act", source, normalized, input, checkSeed(seed));
  }
  async validate(source, samples, settings, seeds) {
    if (!Array.isArray(samples) || samples.length < 1 || samples.length > 32)
      fail("DOMAIN", "Validation requires 1–32 samples");
    if (!Array.isArray(seeds) || seeds.length !== samples.length)
      fail("CONFIG", "Validation needs one seed per sample");
    const normalized = normalize(settings);
    samples.forEach(sample => checkInput(sample, normalized));
    seeds.forEach(checkSeed);
    const inspection = await this.request("inspect", source, normalized);
    const acts = [];
    for (let i = 0; i < samples.length; i++) acts.push(await this.request("act", source, normalized, samples[i], seeds[i]));
    return { inspection, acts };
  }
  request(mode, source, settings, input, seed) {
    if (typeof source !== "string" || Buffer.byteLength(source) > 16384)
      fail("COMPILE", "Source must be at most 16384 UTF-8 bytes");
    if (this.closed) fail("UNAVAILABLE", "Runtime is closed");
    if (this.queue.length + this.slots.filter(s => s.job).length >= this.queueLimit + this.workers)
      fail("CAPACITY", "Runtime capacity exhausted; retry later");
    return new Promise((resolve, reject) => {
      const job = { request: { mode, source, settings, input, seed }, resolve, reject };
      job.line = JSON.stringify(job.request) + "\n";
      if (Buffer.byteLength(job.line) > MAX_REQUEST_BYTES)
        return reject(new RuntimeError("CONFIG", "Runtime request exceeds 524288 bytes"));
      // Queue wait itself is bounded, including slow worker startup.
      job.timer = setTimeout(() => {
        const i = this.queue.indexOf(job);
        if (i >= 0) { this.queue.splice(i, 1); reject(new RuntimeError("CAPACITY", "Queue wait expired")); }
      }, this.startupMs + this.deadlineMs);
      this.queue.push(job); this.pump();
    });
  }
  pump() {
    if (this.closed) return;
    for (const slot of this.slots) {
      if (!slot.ready || slot.job || !this.queue.length) continue;
      const job = this.queue.shift(); clearTimeout(job.timer); slot.job = job;
      slot.timer = setTimeout(() => this.remove(slot, new RuntimeError("LIMIT", "Time limit exceeded: the sandbox did not answer before its hard deadline")),
        slot.executionPhases ? this.startupMs : this.deadlineMs);
      slot.child.stdin.write(job.line);
    }
    // Starting workers already reserve queued jobs. Grow only for actual
    // concurrent demand, not every request during a sequential startup probe.
    let starting = this.slots.filter(slot => !slot.ready).length;
    while (this.queue.length > starting && this.slots.length < this.workers) {
      this.start(); starting++;
    }
  }
  start() {
    const isPython = this.language === "python";
    const path = fileURLToPath(new URL(isPython ? "./python/runner.py" : "./typescript-worker.mjs", import.meta.url));
    const child = spawn(isPython ? this.python : process.execPath,
      isPython ? ["-u", path] : ["--max-old-space-size=192", path],
      { env: {}, stdio: ["pipe", "pipe", "pipe"] });
    const slot = { child, ready: false, buffer: "", bytes: 0, job: null, removed: false };
    this.slots.push(slot);
    slot.timer = setTimeout(() => this.remove(slot, new RuntimeError("UNAVAILABLE", "Worker startup timed out")),
      this.startupMs);
    child.on("error", () => this.remove(slot, new RuntimeError("UNAVAILABLE", "Runtime dependency unavailable")));
    child.on("exit", () => this.remove(slot, new RuntimeError("UNAVAILABLE", "Runtime worker exited")));
    child.stdin.on("error", () => this.remove(slot, new RuntimeError("UNAVAILABLE", "Runtime worker pipe closed")));
    child.stderr.on("data", data => {
      slot.bytes += data.length;
      if (slot.bytes > 65536) this.remove(slot, new RuntimeError("LIMIT", "Worker output exceeded limit"));
    });
    child.stdout.on("data", data => {
      slot.bytes += data.length;
      if (slot.bytes > 8 * 1024 * 1024) return this.remove(slot, new RuntimeError("LIMIT", "Worker output exceeded limit"));
      slot.buffer += data.toString("utf8");
      while (slot.buffer.includes("\n") && !slot.removed) {
      const newline = slot.buffer.indexOf("\n");
      const text = slot.buffer.slice(0, newline); slot.buffer = slot.buffer.slice(newline + 1);
      try {
        const result = JSON.parse(text);
        if (!slot.ready) {
          if (result.ready !== true) throw new Error("Bad startup");
          slot.executionPhases = result.executionPhases === true;
          slot.ready = true; clearTimeout(slot.timer); slot.bytes = 0; this.pump(); continue;
        }
        if (result.phase === "execute" && slot.executionPhases && slot.job && !slot.job.executing) {
          slot.job.executing = true;
          clearTimeout(slot.timer);
          // This is a wall-clock safety backstop, NOT the guest CPU meter.
          // Allow scheduling/IPC slack without giving a non-interruptible
          // builtin the full service timeout.
          slot.executionWallMs = Math.min(this.deadlineMs,
            Math.max(50, slot.job.request.settings.interactionComputeMs * 10));
          slot.timer = setTimeout(() => this.remove(slot, new RuntimeError("LIMIT", "Time limit exceeded: the agent ran past its hard deadline")),
            slot.executionWallMs);
          continue;
        }
        if (!slot.job || slot.buffer.length) throw new Error("Unexpected response");
        const job = slot.job;
        if (result.ok === false) {
          const error = new RuntimeError(
            ["COMPILE", "DOMAIN", "LIMIT", "EXECUTION", "CONFIG"].includes(result.code) ? result.code : "EXECUTION",
            String(result.error).slice(0, 1000));
          // The worker has disposed the fresh guest. Keep its trusted compiled
          // cache on ordinary guest errors; only malformed IPC/hard hangs kill it.
          clearTimeout(slot.timer); slot.job = null; slot.bytes = 0;
          job.reject(error); this.pump(); continue;
        }
        const value = job.request.mode === "inspect" ? checkInspection(result, this.language) : checkAct(result);
        clearTimeout(slot.timer); slot.job = null; slot.bytes = 0;
        job.resolve(value);
        this.pump();
      } catch (error) {
        this.remove(slot, error instanceof RuntimeError ? error : new RuntimeError("EXECUTION", "Invalid runtime response"));
      }
      }
    });
  }
  remove(slot, error) {
    if (slot.removed) return;
    slot.removed = true; clearTimeout(slot.timer); slot.child.kill("SIGKILL");
    this.slots = this.slots.filter(s => s !== slot);
    if (slot.job) slot.job.reject(error);
    // Missing dependencies should not create an endless respawn loop.
    if (!slot.ready) {
      for (const job of this.queue.splice(0)) { clearTimeout(job.timer); job.reject(error); }
    } else this.pump();
  }
  close() {
    this.closed = true;
    const error = new RuntimeError("UNAVAILABLE", "Runtime closed");
    for (const job of this.queue.splice(0)) { clearTimeout(job.timer); job.reject(error); }
    for (const slot of [...this.slots]) this.remove(slot, error);
  }
}

export const createRuntime = options => new GameRuntime(options);
