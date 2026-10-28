/**
 * Mutator calls: wire parsing, the act cost model and applyCalls (docs/clean-implementation-plan.md §4.2).
 *
 * An agent changes an object ONLY by returning a list of calls to its type's closed set of mutators.
 * The engine validates the calls, applies them in order and charges the act's actual bit cost:
 *
 *   cost(call) = scope_mult · kind_mult · ( stepBase · log2 #available        which tool        (MDL)
 *                                         + describe · D(params)              which parameters  (MDL)
 *                                         + measure  · M(params)              runtime selection (Szilard)
 *                                         + erase    · E_pointwise            bits destroyed    (Landauer)
 *                                         + move     · motion )               how much moved    (thermo length)
 *   decision = the first three terms (paid on every act, even a failed one); act = Σ calls.
 *
 * E_pointwise = log2 |f⁻¹(f(x))| given the call (lib/grid-lab energy.py), so E over the spawn prior is
 * the Shannon erasure of mutators.py. motion = Σ_L Ē_L · B_L(x) / B_L,tot: Ē_L the call's expected
 * changed bits in layer L (its "speed", MutatorDef.expectedChange), B_L(x) the bits this call actually
 * changed, B_L,tot the layer's total bits (energy.py pointwise motion, per call); without an
 * expectedChange the call's own change is its speed, Σ_L B_L(x)² / B_L,tot (Int and string).
 * Calls that change nothing pay decision only. A failed act (bad JSON, unknown or unavailable mutator, bad params, a null
 * apply, more than MAX_CALLS calls, or no change at all) pays the decision bits of the calls parsed so
 * far, at least MIN_FAILED_ACT_BITS. Uniqueness against other objects is the engine's job.
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
 * Motion uses ObjectTypeDef.changedBits / layerBits as they are: Grid {symbol, colour}, Int {value},
 * string {text}. Availability is prelude.ts availableOf (constraints over inst.classes / inst.terms).
 */
import { availableOf } from "./prelude.ts";
import {
  MAX_CALLS, MIN_FAILED_ACT_BITS, MutatorError,
  type ActCost, type ActOutcome, type CostKnobs, type HelperDoc, type Instantiation,
  type MutatorCallWire, type MutatorDef, type ObjectTypeDef, type ObjectValue, type Rng,
} from "./types.ts";

/** lib/grid-lab/gridlab/mutators.py COST_KNOBS (the act-time subset). */
export const DEFAULT_COST_KNOBS: CostKnobs = Object.freeze({
  stepBase: 1, describe: 1, erase: 1, move: 0.35, measure: 1,
  scope: Object.freeze({ local: 1, line: 1, block: 1, region: 1, global: 1 }),
  kind: Object.freeze({ bijective: 1, overwrite: 1 }),
});

export const MAX_ACT_BYTES = 64 * 1024;

/** log2 x for x > 1, else 0 (mutators.py `_lg`). */
export const lg = (x: number): number => (x > 1 ? Math.log2(x) : 0);
export const mod = (a: number, m: number): number => ((a % m) + m) % m;

export function fail(message: string): never {
  throw new MutatorError(message);
}

// ------------------------------------------------------------------------------------------------
// cost of one call
// ------------------------------------------------------------------------------------------------

export function callMultiplier<P>(m: MutatorDef<any, P>, p: P, inst: Instantiation, knobs: CostKnobs): number {
  return knobs.scope[m.scopeOf?.(p, inst) ?? m.scope] * knobs.kind[m.kind];
}

/** Decision bits of one call: mult · (stepBase · log2 nAvailable + describe · D + measure · M). */
export function decisionBits<P>(m: MutatorDef<any, P>, p: P, inst: Instantiation, nAvailable: number,
  knobs: CostKnobs = DEFAULT_COST_KNOBS): number {
  return callMultiplier(m, p, inst, knobs) * (knobs.stepBase * lg(nAvailable) + knobs.describe * m.describeBits(p, inst)
    + knobs.measure * (m.measureBits?.(p, inst) ?? 0));
}

/** Unweighted motion of one call: Σ_L Ē_L · changed_L / total_L. */
export function motionBits<P>(m: MutatorDef<any, P>, p: P, inst: Instantiation,
  changed: Readonly<Record<string, number>>, totals: Readonly<Record<string, number>>): number {
  const speed = m.expectedChange?.(p, inst) ?? changed;
  let out = 0;
  for (const [layer, b] of Object.entries(changed)) {
    const tot = totals[layer] ?? 0;
    if (b > 0 && tot > 0) out += (speed[layer] ?? 0) * b / tot;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// wire parsing
// ------------------------------------------------------------------------------------------------

const isPlainObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;

/** The act's output (JSON text or an already-parsed array) as a list of raw entries; throws MutatorError. */
export function parseWire(wire: unknown): unknown[] {
  let list = wire;
  if (typeof wire === "string") {
    if (wire.length > MAX_ACT_BYTES) fail(`agent output is longer than ${MAX_ACT_BYTES} bytes`);
    if (!/^[\x00-\x7f]*$/.test(wire)) fail("agent output must be ASCII");
    try { list = JSON.parse(wire); } catch { fail("agent output is not JSON"); }
  }
  if (!Array.isArray(list)) fail("agent output must be a list of mutator calls");
  return list;
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

const cost = (decision: number, erasure: number, motion: number): ActCost =>
  ({ decision, erasure, motion, total: decision + erasure + motion });

/**
 * Validate and apply an act's calls to `value` (wire form) and price it. Never throws on agent input.
 * `wire` is the agent's output: the JSON text of MutatorCallWire[] (or the parsed array).
 */
export function applyCalls<V>(typeDef: ObjectTypeDef<V>, inst: Instantiation, value: ObjectValue, wire: unknown,
  knobs: CostKnobs = DEFAULT_COST_KNOBS): ActOutcome {
  const avail = availableOf(typeDef.mutators, inst);
  const byId = new Map(avail.map(m => [m.id, m]));
  const codec = typeDef.codec(inst);
  const totals = typeDef.layerBits(inst);
  let decision = 0, erasure = 0, motion = 0;
  const failed = (reason: string): ActOutcome => {
    const d = Math.max(MIN_FAILED_ACT_BITS, decision);
    return { ok: false, reason, cost: cost(d, 0, 0) };
  };
  let x: V, enc: ObjectValue = value;
  const calls: MutatorCallWire[] = [];
  try {
    x = codec.decode(value);
    const list = parseWire(wire);
    for (let i = 0; i < list.length; i++) {
      if (i >= MAX_CALLS) return failed(`an act can make at most ${MAX_CALLS} calls`);
      const [id, raw] = parseCallShape(list[i], i);
      const m = byId.get(id);
      if (!m) return failed(typeDef.mutators.some(d => d.id === id)
        ? `"${id}" is not available for ${inst.key}` : `there is no mutator called "${id}"`);
      let p: unknown;
      try { p = m.parse(raw, inst); } catch (e) { return failed(`call ${i + 1} (${id}): ${(e as Error).message}`); }
      const mult = callMultiplier(m, p, inst, knobs);
      decision += decisionBits(m, p, inst, avail.length, knobs);
      const y = m.apply(x, p, inst);
      if (y === null) return failed(`call ${i + 1} (${id}) cannot apply to this object`);
      const yEnc = codec.encode(y);
      if (yEnc !== enc) {
        erasure += mult * knobs.erase * m.erasureBits(x, p, inst);
        motion += mult * knobs.move * motionBits(m, p, inst, typeDef.changedBits(x, y, inst), totals);
        x = y;
        enc = yEnc;
      }
      calls.push([id, raw]);
    }
  } catch (e) {
    return failed(e instanceof MutatorError ? e.message : `invalid act: ${(e as Error).message}`);
  }
  if (enc === value) return failed("no change");
  return { ok: true, value: enc, cost: cost(decision, erasure, motion), calls };
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
