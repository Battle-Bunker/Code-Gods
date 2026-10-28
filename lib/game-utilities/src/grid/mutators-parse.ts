/**
 * Strict parsing of agent mutator calls: `[{"m": "<mutator id>", "p": {<Grid Lab params>}}, ...]`.
 *
 * The input is untrusted (it comes out of a player's sandbox), so everything is bounded: total
 * length, number of calls, keys per params object, array length, nesting depth and string length.
 * Errors are always a MutatorCallError; nothing else escapes.
 */
import type { ParamValue } from "./mutators-apply.ts";

export type MutatorErrorCode =
  | "bad_json"            // not JSON, or too long
  | "bad_shape"           // JSON, but not an array of {m, p} calls with plain values
  | "too_many_calls"
  | "unsupported_grid"    // no mutator table for this GridType
  | "bad_grid"            // the grid text does not decode for this GridType
  | "unavailable_mutator" // the mutator id is not available in this GridType
  | "invalid_params";     // the params are not in the mutator's shipped parameter space

export class MutatorCallError extends Error {
  readonly code: MutatorErrorCode;
  /** Index of the offending call in its list, when there is one. */
  readonly index: number | null;
  constructor(code: MutatorErrorCode, message: string, index: number | null = null) {
    super(index === null ? message : `call ${index}: ${message}`);
    this.name = "MutatorCallError";
    this.code = code;
    this.index = index;
  }
}

/** One mutator call: a Grid Lab mutator id and a Grid Lab param dict (tuples as arrays). */
export interface MutatorCall {
  m: string;
  p: Record<string, ParamValue>;
}

export const DEFAULT_MAX_CALLS = 8;
const LIMITS = { maxLength: 8192, maxKeys: 8, maxArray: 8, maxDepth: 3, maxString: 64, maxId: 32 };
const KEY = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

function value(v: unknown, depth: number, index: number): ParamValue {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new MutatorCallError("bad_shape", "numbers must be finite", index);
    return v;
  }
  if (typeof v === "string") {
    if (v.length > LIMITS.maxString) throw new MutatorCallError("bad_shape", "string too long", index);
    return v;
  }
  if (Array.isArray(v)) {
    if (depth >= LIMITS.maxDepth) throw new MutatorCallError("bad_shape", "params nested too deeply", index);
    if (v.length > LIMITS.maxArray) throw new MutatorCallError("bad_shape", "array too long", index);
    const out: ParamValue[] = [];
    for (let i = 0; i < v.length; i++) out.push(value(v[i], depth + 1, index));
    return out;
  }
  throw new MutatorCallError("bad_shape", "param values must be numbers, strings or arrays", index);
}

/** Validate one already-parsed call object; returns a fresh, plain copy. */
export function checkCall(raw: unknown, index: number): MutatorCall {
  if (!isPlainObject(raw)) throw new MutatorCallError("bad_shape", "each call must be an object", index);
  const keys = Object.keys(raw);
  if (keys.length !== 2 || !Object.hasOwn(raw, "m") || !Object.hasOwn(raw, "p")) {
    throw new MutatorCallError("bad_shape", 'a call has exactly the keys "m" and "p"', index);
  }
  const m = raw.m, p = raw.p;
  if (typeof m !== "string" || m.length === 0 || m.length > LIMITS.maxId) {
    throw new MutatorCallError("bad_shape", '"m" must be a mutator id', index);
  }
  if (!isPlainObject(p)) throw new MutatorCallError("bad_shape", '"p" must be an object', index);
  const pk = Object.keys(p);
  if (pk.length > LIMITS.maxKeys) throw new MutatorCallError("bad_shape", "too many params", index);
  const out: Record<string, ParamValue> = {};
  for (const k of pk) {
    if (!KEY.test(k) || FORBIDDEN.has(k)) throw new MutatorCallError("bad_shape", "bad param name", index);
    out[k] = value(p[k], 0, index);
  }
  return { m, p: out };
}

/** Parse and strictly validate an agent's call list (JSON text). */
export function parseCalls(json: string, opts: { maxCalls?: number } = {}): MutatorCall[] {
  const maxCalls = opts.maxCalls ?? DEFAULT_MAX_CALLS;
  if (typeof json !== "string" || json.length > LIMITS.maxLength) {
    throw new MutatorCallError("bad_json", `calls must be a JSON string of at most ${LIMITS.maxLength} characters`);
  }
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { throw new MutatorCallError("bad_json", "calls are not valid JSON"); }
  if (!Array.isArray(raw)) throw new MutatorCallError("bad_shape", "calls must be a JSON array");
  if (raw.length > maxCalls) throw new MutatorCallError("too_many_calls", `at most ${maxCalls} calls per act`);
  return raw.map((c, i) => checkCall(c, i));
}
