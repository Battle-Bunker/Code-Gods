/**
 * Mutator calls: wire parsing, the change cost and applyCalls (docs/energy-model.md §4).
 *
 * An agent changes an object ONLY by returning a list of calls to its type's closed set of mutators. The engine
 * validates the calls, applies them in order and prices the act's change:
 *
 *   W      = Σ over the calls that change the value of ObjectTypeDef.callWork(before, after, call)
 *   change = W + CHANGE_BETA · W²
 *
 * callWork prices a call by the decomposition of its net effect into the type's ELEMENTARY mutators, each with its own
 * information cost w (the surprisal of its parameters under a maximum-entropy prior, plus the bits an overwrite erases):
 * Grid sets one cell's colour or symbol. A COMPOSITE mutator (paint a row, swap two cells) costs its decomposition, so it is never cheaper than its
 * elementary steps, and the quadratic term makes one big act cost more than the same steps spread over several acts:
 * prefer small incremental acts. A call that changes nothing adds nothing; a change undone later in the act still paid
 * for both steps. A failed act (bad JSON, unknown or unavailable mutator, bad params, a null apply, more than MAX_CALLS
 * calls, or no change at all) changes nothing and costs 0 here (it pays its reads: pricing/measure.ts actCharge).
 * Uniqueness against other objects is the engine's job.
 *
 * ── COORDINATION NOTE (Types worker: prelude generator and typeDefs) ─────────────────────────────
 * Call shape: a guest constructor returns {"__m": "<mutator id>", <param>: <JSON>, ...}; prelude.ts
 * __encode_calls turns the agent's calls into [[id, params], ...]. Wire params are plain JSON with
 * integer indices (Grid: mutators.py params, tuples as arrays, colour/symbol/rank/suit indices of
 * core.py); constructors turn kid inputs ("red", "K♥", cells, grid.rows[2]) into them.
 * Guest text is static per mutator and reads the base prelude's private tables (Grid: _SIZE, _CODES,
 * _SYMBOLS, _VALUES, _LETTERS, _COLOURS, _MIXES; JS with "__"). Shared Grid support (_M_* helpers and
 * the region builders row(), column(), square(), ring(), edge(), middle(), everything(),
 * busiest_line()) rides in the guest of `swap_cells`, the first and always-available Grid mutator,
 * so assemblePrelude needs nothing extra. Private helper names: _M_* (Python), __M_* (JS).
 * A mutator's describeBits / measureBits price a literal move at summon (engine pricing.ts summonPrice) and pick the
 * reference mixture's structured values (pricing/mixture.ts); erasureBits, scope and kind describe it as Grid Lab does.
 * Availability is prelude.ts availableOf (constraints over inst.classes / inst.terms).
 */
import { availableOf } from "./prelude.ts";
import { DEFAULT_COST_MODEL, type CostModel } from "./structure/index.ts";
import {
  MAX_CALLS, MutatorError,
  type ActCost, type ActOutcome, type HelperDoc, type Instantiation,
  type MutatorCallWire, type MutatorDef, type ObjectTypeDef, type ObjectValue, type Rng,
} from "./types.ts";

/**
 * β of change = W + β·W² (docs/energy-model.md §4.3): the code length under the maximum-entropy prior on W with a fixed
 * mean and mean square. 1/β = 20 bits is the scale at which the quadratic term equals the linear one, about two cell
 * colour changes on a 4×4 board: below it an act costs about its information, above it the square takes over.
 */
export const CHANGE_BETA = 0.05;
/** The change cost of an act whose elementary decomposition costs W bits. */
export const changeCost = (W: number): number => W + CHANGE_BETA * W * W;

/**
 * κ, the change/read ratio (docs/energy-model.md §2.1): how many bits of the object an agent may read for the price of
 * one bit of committed change. It is the economy's one free dimension of price (scaling every price together is the
 * same as scaling power): κ = 1 prices a bit read like a bit changed; κ → ∞ makes looking free. 32 is set by a rule,
 * not by feel: a complete look at the board costs less than the smallest change to it, on every shipped setup (the
 * binding case is Master, 7×7 cards, where κ must exceed 21.7; game-core/test/read-price.test.ts). A constant like
 * CHANGE_BETA, not a room setting, so every room prices alike.
 */
export const CHANGE_READ_RATIO = 32;
/** Energy bits charged per bit of information read: 1/κ. A committed change's bits are the unit. */
export const READ_PRICE = 1 / CHANGE_READ_RATIO;

export const MAX_ACT_BYTES = 64 * 1024;

/** log2 x for x > 1, else 0 (mutators.py `_lg`). */
export const lg = (x: number): number => (x > 1 ? Math.log2(x) : 0);
export const mod = (a: number, m: number): number => ((a % m) + m) % m;

export function fail(message: string): never {
  throw new MutatorError(message);
}

// ------------------------------------------------------------------------------------------------
// naming a call (summon-time literal moves, the reference mixture)
// ------------------------------------------------------------------------------------------------

/** Bits to name one call: log2 nAvailable (which tool) + D(params) + M(params). Not an act charge. */
export function decisionBits<P>(m: MutatorDef<any, P>, p: P, inst: Instantiation, nAvailable: number): number {
  return lg(nAvailable) + m.describeBits(p, inst) + (m.measureBits?.(p, inst) ?? 0);
}

// ------------------------------------------------------------------------------------------------
// wire parsing
// ------------------------------------------------------------------------------------------------

const isPlainObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;

/** The act's output (JSON text or an already-parsed array) as a list of raw entries; throws MutatorError. */
export function parseWire(wire: unknown): unknown[] {
  return parseAct(wire).list;
}

/** The commit clause an act may carry: commit only if it strictly raises the owner's payoff on the object. */
export type CommitClause = "if-improves";
/**
 * The act's output as its call list and its clause: a bare list `[[id, params], ...]`, or the commit-clause
 * object `{"calls": [...], "commit": "if-improves"}` (rooms with commitClause). Throws MutatorError.
 */
export function parseAct(wire: unknown): { list: unknown[]; commit?: CommitClause } {
  let parsed = wire;
  if (typeof wire === "string") {
    if (wire.length > MAX_ACT_BYTES) fail(`agent output is longer than ${MAX_ACT_BYTES} bytes`);
    if (!/^[\x00-\x7f]*$/.test(wire)) fail("agent output must be ASCII");
    try { parsed = JSON.parse(wire); } catch { fail("agent output is not JSON"); }
  }
  if (isPlainObject(parsed)) {
    const keys = Object.keys(parsed).sort().join(",");
    if (keys !== "calls,commit" || parsed.commit !== "if-improves") fail('a clause must look like {"calls": [...], "commit": "if-improves"}');
    if (!Array.isArray(parsed.calls)) fail("agent output must be a list of mutator calls");
    return { list: parsed.calls, commit: "if-improves" };
  }
  if (!Array.isArray(parsed)) fail("agent output must be a list of mutator calls");
  return { list: parsed };
}

export function parseCallShape(raw: unknown, i: number): MutatorCallWire {
  if (!Array.isArray(raw) || raw.length !== 2 || typeof raw[0] !== "string" || !isPlainObject(raw[1])) {
    fail(`call ${i + 1} must look like ["mutator_id", {params}]`);
  }
  return [raw[0], raw[1]];
}

/** Rejects fields outside `allowed`, and missing required ones. */
export function checkFields(raw: Readonly<Record<string, unknown>>, required: readonly string[], optional: readonly string[] = []): void {
  for (const k of Object.keys(raw)) if (!required.includes(k) && !optional.includes(k)) fail(`unknown parameter "${k}"`);
  for (const k of required) if (!(k in raw)) fail(`missing parameter "${k}"`);
}

/** A safe integer in [lo, hi]. */
export function intParam(raw: Readonly<Record<string, unknown>>, name: string, lo: number, hi: number): number {
  const v = raw[name];
  if (typeof v !== "number" || !Number.isSafeInteger(v)) fail(`"${name}" must be a whole number`);
  if (v < lo || v > hi) fail(`"${name}" must be between ${lo} and ${hi}`);
  return v;
}

// ------------------------------------------------------------------------------------------------
// applyCalls
// ------------------------------------------------------------------------------------------------

const NOTHING: ActCost = Object.freeze({ work: 0, total: 0 });

/**
 * Validate and apply an act's calls to `value` (wire form) and price its change. Never throws on agent input.
 * `wire` is the agent's output: the JSON text of MutatorCallWire[] (or the parsed array). `model` is the room's cost
 * model (settings.costModel; structure/index.ts): it changes what a change costs, never what a call does.
 */
export function applyCalls<V>(typeDef: ObjectTypeDef<V>, inst: Instantiation, value: ObjectValue, wire: unknown,
  model: CostModel = DEFAULT_COST_MODEL): ActOutcome {
  const avail = availableOf(typeDef.mutators, inst, model);
  const byId = new Map(avail.map(m => [m.id, m]));
  const codec = typeDef.codec(inst);
  let work = 0;
  const failed = (reason: string): ActOutcome => ({ ok: false, reason, cost: NOTHING });
  let x: V, enc: ObjectValue = value, commit: CommitClause | undefined;
  const calls: MutatorCallWire[] = [];
  try {
    x = codec.decode(value);
    const act = parseAct(wire);
    commit = act.commit;
    const list = act.list;
    for (let i = 0; i < list.length; i++) {
      if (i >= MAX_CALLS) return failed(`an act can make at most ${MAX_CALLS} calls`);
      const [id, raw] = parseCallShape(list[i], i);
      const m = byId.get(id);
      if (!m) return failed(typeDef.mutators.some(d => d.id === id)
        ? `"${id}" is not available for ${inst.key}` : `there is no mutator called "${id}"`);
      let p: unknown;
      try { p = m.parse(raw, inst); } catch (e) { return failed(`call ${i + 1} (${id}): ${(e as Error).message}`); }
      const y = m.apply(x, p, inst);
      if (y === null) return failed(`call ${i + 1} (${id}) cannot apply to this object`);
      const yEnc = codec.encode(y);
      if (yEnc !== enc) {
        work += typeDef.callWork(x, y, { id, params: p }, inst, model);
        x = y;
        enc = yEnc;
      }
      calls.push([id, raw]);
    }
  } catch (e) {
    return failed(e instanceof MutatorError ? e.message : `invalid act: ${(e as Error).message}`);
  }
  if (enc === value) return failed("no change");
  return { ok: true, value: enc, cost: { work, total: changeCost(work) }, calls, ...(commit ? { commit } : {}) };
}

// ------------------------------------------------------------------------------------------------
// guest prelude pieces
// ------------------------------------------------------------------------------------------------

/** HelperDoc for a mutator constructor. */
export function mdoc(python: string, typescript: string, kid: string, cls?: string): HelperDoc {
  const name = (s: string) => s.slice(0, s.indexOf("("));
  return { name: { python: name(python), typescript: name(typescript) }, signature: { python, typescript }, kid, ...(cls ? { class: cls } : {}), group: "mutator" };
}

/** JSON literal that is valid ASCII Python and JS source (non-ASCII escaped as \uXXXX). */
export function asciiJson(x: unknown): string {
  return JSON.stringify(x).replace(/[\u007f-\uffff]/g, ch => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"));
}

/** Uniform choice. */
export const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(xs.length)];
