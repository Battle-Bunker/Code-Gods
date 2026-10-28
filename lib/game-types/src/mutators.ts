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
 * changed, B_L,tot the layer's total bits (energy.py pointwise motion, per call). Calls that change
 * nothing pay decision only. A failed act (bad JSON, unknown or unavailable mutator, bad params, a null
 * apply, more than MAX_CALLS calls, or no change at all) pays the decision bits of the calls parsed so
 * far, at least MIN_FAILED_ACT_BITS. Uniqueness against other objects is the engine's job.
 *
 * ── COORDINATION NOTE for the Types worker (prelude generator, typeDefs) ─────────────────────────
 * Call shape. A guest constructor returns a call object: Python dict / JS plain object
 *   {"__m": "<mutator id>", <param>: <JSON value>, ...}   e.g. {"__m": "paint", "kind": "line", "region": [0, 2], "colour": 0}
 * and __encode_calls(calls) turns the agent's return value (a list of calls, one call, or None/null)
 * into the JSON text of [[id, params], ...] (ASCII). ENCODE_CALLS_GUEST below is the reference text
 * of __encode_calls for both languages; mutatorPrelude() includes it.
 * Wire params are plain JSON with integer indices (Grid colour/symbol/rank/suit indices as in
 * lib/grid-lab core.py; tuples as arrays). Guest constructors turn kid inputs ("red", "K♥", cell
 * objects with .row/.col, grid.rows[2]) into those indices.
 * Prelude. mutatorPrelude(mutators, inst, support) returns {python, js, dts, helpers} for the
 * mutators available in `inst`: support code (per-instantiation tables + region builders such as
 * row(i), exported by each type module as gridGuestSupport / intGuestSupport / stringGuestSupport),
 * __encode_calls, then each available mutator's guest constructor. Private names: _M_* (Python),
 * __M_* (JS). Agent preludes only (cards never need them).
 * Motion layers (ObjectTypeDef.changedBits / layerBits must use these keys; reference
 * implementations are exported as GRID_MOTION, INT_MOTION, STRING_MOTION):
 *   Grid   {col: changed cells · log2 C, sym: changed cells · log2 S}; totals N² · log2 C, N² · log2 S
 *   Int    {digits: changed decimal places · log2 10 (+1 if the sign changed)}; total P · log2 10 (+1 if min < 0)
 *   string {chars: changed positions · 7}; total maxLength · 7
 * Terms read by `requires` (instTerms falls back to these when inst.terms lacks them):
 *   Grid "size", "colours.count", "symbols.count"; Int "bounds.size" (max−min+1), "bounds.digits" (P);
 *   string "length.max". Classes: the core.py names (Valued, Ranked, Numeral, Suited, Spectral, Mixable).
 */
import {
  MAX_CALLS, MIN_FAILED_ACT_BITS, MutatorError,
  type ActCost, type ActOutcome, type Constraint, type CostKnobs, type HelperDoc, type Instantiation,
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
// availability
// ------------------------------------------------------------------------------------------------

/** inst.terms plus the fallback terms the mutator modules rely on (see the coordination note). */
export function instTerms(inst: Instantiation): Readonly<Record<string, number>> {
  const a = inst.args as Record<string, number | string>;
  const derived: Record<string, number> = {};
  if (inst.objectType === "Grid") {
    derived.size = Number(a.size);
    derived["colours.count"] = { rgb: 3, rgby: 4, rainbow6: 6 }[String(a.colours)] ?? 0;
    derived["symbols.count"] = a.symbols === "cards" ? 52 : Number(String(a.symbols).slice(4));
  } else if (inst.objectType === "Int") {
    const lo = Number(a.min), hi = Number(a.max);
    derived["bounds.size"] = hi - lo + 1;
    derived["bounds.digits"] = String(Math.max(Math.abs(lo), Math.abs(hi))).length;
  } else if (inst.objectType === "string") {
    derived["length.max"] = Number(a.maxLength);
  }
  return { ...derived, ...inst.terms };
}

export function satisfies(c: Constraint, inst: Instantiation, terms = instTerms(inst)): boolean {
  if ("not" in c) return !satisfies(c.not, inst, terms);
  if ("has" in c) return inst.classes.includes(c.has);
  const v = terms[c.term];
  if (v === undefined) return false;
  if ("parity" in c) return mod(v, 2) === (c.parity === "odd" ? 1 : 0);
  return c.op === ">=" ? v >= c.value : c.op === "<=" ? v <= c.value : v === c.value;
}

export function availableMutators<M extends MutatorDef<any, any>>(mutators: readonly M[], inst: Instantiation): M[] {
  const terms = instTerms(inst);
  return mutators.filter(m => m.requires.every(c => satisfies(c, inst, terms)));
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
  const avail = availableMutators(typeDef.mutators, inst);
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

export interface GuestParts {
  readonly python: string;
  readonly js: string;
  readonly dts: string;
  readonly docs: readonly HelperDoc[];
}

/** Reference __encode_calls for both guests (the prelude generator may reuse it verbatim). */
export const ENCODE_CALLS_GUEST: GuestParts = {
  python: `import json as _M_JSON

def __encode_calls(calls):
    if calls is None:
        calls = []
    if isinstance(calls, dict):
        calls = [calls]
    out = []
    for c in calls:
        if not isinstance(c, dict) or not isinstance(c.get("__m"), str):
            raise TypeError("agent must return a list of mutator calls, like [paint(row(0), 'red')], not " + repr(c))
        out.append([c["__m"], {k: v for k, v in c.items() if k != "__m"}])
    return _M_JSON.dumps(out, separators=(",", ":"), ensure_ascii=True)
`,
  js: `function __encode_calls(calls) {
  if (calls == null) calls = [];
  if (!Array.isArray(calls)) calls = [calls];
  const out = calls.map(c => {
    if (c === null || typeof c !== "object" || typeof c.__m !== "string") {
      throw new TypeError("agent must return a list of mutator calls, like [paint(row(0), \\"red\\")]");
    }
    const { __m, ...params } = c;
    return [__m, params];
  });
  return JSON.stringify(out).replace(/[\\u007f-\\uffff]/g, ch => "\\\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"));
}
`,
  dts: `interface MutatorCall { readonly __m: string }
`,
  docs: [],
};

/** Support + __encode_calls + the guest constructors of the mutators available in `inst`. */
export function mutatorPrelude(mutators: readonly MutatorDef<any, any>[], inst: Instantiation, support: GuestParts): GuestParts {
  const parts = [support, ENCODE_CALLS_GUEST, ...availableMutators(mutators, inst).map(m => m.guest)];
  return {
    python: parts.map(p => p.python).join("\n"),
    js: parts.map(p => p.js).join("\n"),
    dts: parts.map(p => p.dts).join("\n"),
    docs: parts.flatMap(p => p.docs),
  };
}

/** HelperDoc for a mutator constructor. */
export function mdoc(python: string, typescript: string, kid: string, cls?: string): HelperDoc {
  const name = (s: string) => s.slice(0, s.indexOf("("));
  return { name: { python: name(python), typescript: name(typescript) }, signature: { python, typescript }, kid, class: cls, group: "mutator" };
}

/** JSON literal that is valid ASCII Python and JS source (non-ASCII escaped as \uXXXX). */
export function asciiJson(x: unknown): string {
  return JSON.stringify(x).replace(/[\u007f-￿]/g, ch => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"));
}

/** Uniform choice. */
export const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(xs.length)];
