/**
 * Trusted request checks shared by the public API (index.mjs) and both engines; no submitted code runs
 * here. The runtime knows no object type: it checks the wire value generically (a safe integer, or an
 * ASCII string of at most wireMaxLength characters) and the shape of the trusted prelude. The host
 * re-validates objects with the type's codec and parses the encoded call list the guest returns.
 */
import { createHash } from "node:crypto";

export class RuntimeError extends Error {
  constructor(code, message) { super(message); this.name = "RuntimeError"; this.code = code; }
}
export const fail = (code, message) => { throw new RuntimeError(code, message); };

/** Grammar ids, one per language. */
export const GRAMMAR_IDS = Object.freeze({ python: "python-agent-v1", typescript: "typescript-agent-v1" });
/** Summon-price code per language (`complexityFunctionId`). */
export const COMPLEXITY_IDS = Object.freeze({ python: "ast-bits-v1", typescript: "ts-ast-bits-v1-uniform" });
/** -log2(Q_MOVE): the flag bits a literal move pays before log2(#available) + D(fields). */
export const MOVE_FLAG_BITS = 3;
export const STEP_BUDGET_DEFAULT = 500000;
export const STEP_BUDGET_MAX = 10000000;
export const WIRE_MAX_LENGTH = 1024;
export const PRELUDE_PART_MAX_BYTES = 65536;
export const CALLS_MAX_BYTES = 65536;
export const SOURCE_MAX_BYTES = 16384;
export const MAX_REQUEST_BYTES = 524288;
const VOCAB_FIELDS = ["api", "attrs", "params", "strings", "mutators", "areas"];
export const ascii = text => !/[^\x00-\x7f]/u.test(text);

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
/** A 64-bit seed as a decimal or 0x-hex string (the host derives one per act) -> BigInt. */
export function parseSeed(seed) {
  if (typeof seed !== "string" || !/^(0[xX][0-9a-fA-F]{1,16}|[0-9]{1,20})$/u.test(seed))
    fail("CONFIG", "The act needs a seed: a 64-bit decimal or 0x-hex string");
  if (BigInt(seed) >= 2n ** 64n) fail("CONFIG", "The act's seed must fit in 64 bits");
  return BigInt(seed);
}
/** The settings this package reads, copied so later caller mutation cannot race execution. */
export function normalize(settings) {
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
export function checkInput(input, settings) {
  const valid = typeof input === "number" ? Number.isSafeInteger(input)
    : typeof input === "string" && input.length <= settings.wireMaxLength && ascii(input);
  if (!valid) fail("DOMAIN", "Input is not a valid wire value for this room");
}
export function checkSource(source) {
  if (typeof source !== "string" || !source.isWellFormed() || Buffer.byteLength(source) > SOURCE_MAX_BYTES)
    fail("COMPILE", `Source must be at most ${SOURCE_MAX_BYTES} UTF-8 bytes`);
}
/** Collision-resistant identity of the exact trusted prelude text and pricing vocabulary (cache keys). */
export const preludeDigest = prelude => createHash("sha256")
  .update(JSON.stringify([prelude.python, prelude.js, prelude.dts, prelude.pricing])).digest("hex");
export const timeLimit = computeMs => `Time limit exceeded: the agent used more than its ${computeMs} ms compute budget for one interaction. Do less work per call.`;
export const stepLimit = steps => `Step limit exceeded: the agent took more than ${steps} steps. Do less work per call.`;

/** CPU (or, where Node lacks a per-thread clock, wall) milliseconds since `start()`. */
export function stopwatch() {
  if (typeof process.threadCpuUsage === "function") {
    const start = process.threadCpuUsage();
    return () => { const used = process.threadCpuUsage(start); return (used.user + used.system) / 1000; };
  }
  const start = performance.now();
  return () => performance.now() - start;
}

/** A small byte-bounded LRU for trusted compiler output. */
export class Lru {
  constructor(entries, bytes) { this.max = entries; this.maxBytes = bytes; this.map = new Map(); this.bytes = 0; }
  get size() { return this.map.size; }
  get(key) {
    const item = this.map.get(key);
    if (item) { this.map.delete(key); this.map.set(key, item); }
    return item?.value;
  }
  set(key, value, size) {
    if (size > this.maxBytes) return value;
    while (this.map.size && (this.map.size >= this.max || this.bytes + size > this.maxBytes)) {
      const [oldest, item] = this.map.entries().next().value;
      this.map.delete(oldest); this.bytes -= item.size;
    }
    this.map.set(key, { value, size }); this.bytes += size;
    return value;
  }
}

// --- Script mode (python-script-v1, typescript-script-v1): `main(data)` over host JSON, for analytics.
export const SCRIPT_GRAMMAR_IDS = Object.freeze({ python: "python-script-v1", typescript: "typescript-script-v1" });
export const SCRIPT_LIMITS = Object.freeze({
  /** Source, UTF-8 bytes. */
  sourceBytes: 65536,
  /** The input: JSON text the host passes, UTF-8 bytes. */
  inputBytes: 4 * 1024 * 1024,
  /** main's return value as JSON text, bytes (ASCII). */
  resultBytes: 1024 * 1024,
  /** Captured print / console.log text, UTF-8 bytes (clipped, never an error). */
  outputBytes: 256 * 1024,
  /** The CPU budget (ms): default and maximum. The hard wall is the budget plus scriptWallSlackMs(budget). */
  cpuMsDefault: 10000,
  cpuMsMax: 20000,
});
/** Wall-clock slack past a script's CPU budget before its worker is terminated. */
export const scriptWallSlackMs = cpuMs => Math.min(5000, Math.max(1000, Math.ceil(cpuMs / 2)));
/** The IPC request of one script: input + source + framing. */
export const SCRIPT_REQUEST_MAX_BYTES = SCRIPT_LIMITS.inputBytes + 2 * SCRIPT_LIMITS.sourceBytes + 65536;
export function checkScriptSource(source) {
  if (typeof source !== "string" || !source.isWellFormed() || source.includes("\0") || Buffer.byteLength(source) > SCRIPT_LIMITS.sourceBytes)
    fail("COMPILE", `A script must be NUL-free text of at most ${SCRIPT_LIMITS.sourceBytes} UTF-8 bytes`);
}
/**
 * The input is JSON text (the host serialises its datasets once): its size and encoding are checked here; the guest's
 * own decode (outside the budget) reports text that is not JSON as DOMAIN, so the host never parses it again.
 */
export function checkScriptInput(input) {
  if (typeof input !== "string" || !input.isWellFormed() || Buffer.byteLength(input) > SCRIPT_LIMITS.inputBytes)
    fail("DOMAIN", `A script's input must be JSON text of at most ${SCRIPT_LIMITS.inputBytes} bytes`);
}
/** {cpuMs, seed} with defaults, checked. */
export function scriptOptions({ cpuMs = SCRIPT_LIMITS.cpuMsDefault, seed = "0" } = {}) {
  if (!Number.isSafeInteger(cpuMs) || cpuMs < 1 || cpuMs > SCRIPT_LIMITS.cpuMsMax)
    fail("CONFIG", `A script's CPU budget must be 1–${SCRIPT_LIMITS.cpuMsMax} ms`);
  parseSeed(seed);
  return { cpuMs, seed };
}
export const scriptTimeLimit = cpuMs => `Time limit exceeded: the script used more than its ${cpuMs / 1000} s CPU budget. Do less work (fewer rows, a simpler loop) or ask for a larger budget.`;
/** Validates an engine's script result (both languages). */
export function checkScriptResult(result) {
  if (!result || Object.keys(result).sort().join() !== "cpuMs,output,outputTruncated,result,usedRandom"
      || typeof result.result !== "string" || result.result.length > SCRIPT_LIMITS.resultBytes || !ascii(result.result)
      || typeof result.output !== "string" || Buffer.byteLength(result.output) > SCRIPT_LIMITS.outputBytes
      || typeof result.outputTruncated !== "boolean" || typeof result.usedRandom !== "boolean"
      || typeof result.cpuMs !== "number" || !(result.cpuMs >= 0))
    throw new Error("Invalid script result");
  return { result: result.result, output: result.output, outputTruncated: result.outputTruncated, usedRandom: result.usedRandom, cpuMs: result.cpuMs };
}
