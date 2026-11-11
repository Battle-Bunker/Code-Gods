/**
 * The mutation noise of hold rarity (docs/energy-model.md §8): one random mutation drawn with probability proportional
 * to 2^(−C), C its change cost (W + βW², docs/energy-model.md §4), over the type's single calls.
 *
 * Only the elementary mutators (and, for Int, every multiplier) are enumerated. A composite call changes more, so
 * costs more, and its mass is negligible: on a 4×4 board a call that changes two cells has C ≈ 29.7 bits against one
 * cell's 11.5, a factor 2^−18 per call; an Int add needing two digit adds ≈ 2^−19 each. Multipliers are all single
 * elementary-priced calls (×6 = ×2·×3 costs its prime factors), and ×4 (7.8 bits) weighs about as much as a digit add,
 * so every |m| ≤ MAX_MULTIPLIER is enumerated (the rest has mass below 1e-5 of the total).
 *
 * Under a distance cost model (structure/index.ts) the draw is over the generators' declared arguments instead, each
 * weighted by its own price: a small step is likelier than a far one. On an Int that is a digit add ±d at a place
 * (place + λ·d bits of W) or a multiplier ±m (1 + λ×·log2 m); on a string the same three moves at their distance-v1
 * prices. MAX_MULTIPLIER stays: under distance-v1 a multiplier above 1024 has W > 22.8 bits, C > 48.9, against 3.7
 * for ×2, so the multipliers left out weigh under 1e-10 of the total.
 *
 * The draw is exact for that distribution. A mutation that cannot apply (a multiplication out of range) leaves the
 * value as it is. Bump NOISE_VERSION whenever the costs or the distribution change: cached hold tables are keyed by it.
 */
import { CHANGE_BETA, changeCost } from "./mutators.ts";
import { gridArgs, gridElementaryCosts, gridFamilies } from "./grid/index.ts";
import { DEFAULT_COST_MODEL, locationBits, type CostModel } from "./structure/index.ts";
import type { GridValue } from "./grid/codec.ts";
import { COLOUR_COMPONENTS, SYMBOL_COMPONENTS } from "./grid/components.ts";
import { digitWork, multiplyWork } from "./int/index.ts";
import { placesOf } from "./int/mutators.ts";
import { stringArgs, stringElementaryCosts } from "./string/index.ts";
import type { Instantiation, Rng } from "./types.ts";

export const NOISE_VERSION = `noise-v1|beta=${CHANGE_BETA}`;
/**
 * The noise version of a cost model: hold tables are cached by it. set-v1 keeps NOISE_VERSION, so tables computed before
 * cost models existed stay valid; every other model has its own.
 */
export const noiseVersion = (model: CostModel = DEFAULT_COST_MODEL): string =>
  model === DEFAULT_COST_MODEL ? NOISE_VERSION : `${NOISE_VERSION}|cost=${model}`;
export const MAX_MULTIPLIER = 1024;

/** A uniform number in [0, 1) from an Rng (53 bits). */
const unit = (rng: Rng) => (rng.int(2 ** 26) * 2 ** 27 + rng.int(2 ** 27)) / 2 ** 53;
const weight = (C: number) => 2 ** -C;

/** One mutation of `value` (the type's decoded value), drawn ∝ 2^(−C). Never mutates its input. */
export type NoiseStep<V> = (value: V, rng: Rng) => V;

function gridNoise(inst: Instantiation, model: CostModel): NoiseStep<GridValue> {
  if (model !== "set-v1") return gridGeneratorNoise(inst, model);
  const t = gridArgs(inst);
  const C = COLOUR_COMPONENTS[t.colours].count, S = SYMBOL_COMPONENTS[t.symbols].count, w = gridElementaryCosts(inst);
  const colourMass = (C - 1) * weight(changeCost(w.colour)), symbolMass = (S - 1) * weight(changeCost(w.symbol));
  const pColour = colourMass / (colourMass + symbolMass);
  return (g, rng) => {
    const cells = g.size * g.size, i = rng.int(cells), sym = g.sym.slice(), col = g.col.slice();
    if (unit(rng) < pColour) col[i] = (col[i] + 1 + rng.int(C - 1)) % C;
    else sym[i] = (sym[i] + 1 + rng.int(S - 1)) % S;
    return { size: g.size, sym, col };
  };
}

/**
 * Grid noise under every other model: a uniform cell, then one argument of one family's generator drawn ∝ 2^(−C(w))
 * over the declared argument spaces (structure/index.ts Generator.args): the number by ±k (or ×m), the suit or the
 * colour to one of the others. An argument that cannot apply (9 + 1 on a slider) leaves the board as it is, like the
 * call it stands for.
 */
function gridGeneratorNoise(inst: Instantiation, model: CostModel): NoiseStep<GridValue> {
  const fams = gridFamilies(inst, model);
  const kinds = fams.flatMap(f => f.generator.args.map(arg =>
    ({ family: f, arg, w: weight(changeCost(locationBits(f, fams.length) + (arg.bits + arg.erased))) })));
  const cum: number[] = [];
  let total = 0;
  for (const k of kinds) cum.push(total += k.w);
  return (g, rng) => {
    const i = rng.int(g.size * g.size), u = unit(rng) * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] > u) hi = mid; else lo = mid + 1; }
    const k = kinds[lo], out = { size: g.size, sym: g.sym.slice(), col: g.col.slice() };
    const to = k.arg.apply(k.family.get(g, i));
    if (to !== null) k.family.set(out, i, to);
    return out;
  };
}

function intNoise(inst: Instantiation, model: CostModel): NoiseStep<number> {
  const { min, max } = inst.args as { min: number; max: number }, W = max - min + 1, P = placesOf(inst);
  // Every candidate: a digit add (place, signed digit), or a multiplier; with its weight.
  const kinds: { add?: number; mul?: number; w: number }[] = [];
  // set-v1: every digit costs digitAddCost and ×m its prime factors, the weights (and so the stream) of before cost models.
  const dw = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => weight(changeCost(digitWork(inst, d, model))));
  for (let p = 0; p < P; p++) for (let d = 1; d <= 9; d++) for (const s of [1, -1]) kinds.push({ add: s * d * 10 ** p, w: dw[d] });
  for (let m = 2; m <= MAX_MULTIPLIER; m++) for (const s of [1, -1]) kinds.push({ mul: s * m, w: weight(changeCost(multiplyWork(m, model))) });
  const cum: number[] = [];
  let total = 0;
  for (const k of kinds) cum.push(total += k.w);
  return (x, rng) => {
    const u = unit(rng) * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] > u) hi = mid; else lo = mid + 1; }
    const k = kinds[lo];
    if (k.add !== undefined) return min + (((x - min + k.add) % W) + W) % W;
    const y = x * k.mul!;
    return y >= min && y <= max ? y : x;
  };
}

function stringNoise(inst: Instantiation, model: CostModel): NoiseStep<string> {
  const L = stringArgs(inst).maxLength, w = stringElementaryCosts(inst, model);
  const ws = weight(changeCost(w.set)), wi = weight(changeCost(w.insert)), wd = weight(changeCost(w.delete));
  return (x, rng) => {
    const n = x.length;
    const set = n * 127 * ws, ins = n < L ? (n + 1) * 128 * wi : 0, del = n * wd, total = set + ins + del;
    if (!(total > 0)) return x;
    const u = unit(rng) * total;
    if (u < set) {
      const i = rng.int(n), c = (x.charCodeAt(i) + 1 + rng.int(127)) % 128;
      return x.slice(0, i) + String.fromCharCode(c) + x.slice(i + 1);
    }
    if (u < set + ins) { const i = rng.int(n + 1); return x.slice(0, i) + String.fromCharCode(rng.int(128)) + x.slice(i); }
    const i = rng.int(n);
    return x.slice(0, i) + x.slice(i + 1);
  };
}

const memo = new Map<string, NoiseStep<unknown>>();
/** The noise step for an instantiation under a cost model (memoised). */
export function noiseStep(inst: Instantiation, model: CostModel = DEFAULT_COST_MODEL): NoiseStep<unknown> {
  const key = `${inst.key}|${model}`;
  let f = memo.get(key);
  if (!f) {
    f = (inst.objectType === "Grid" ? gridNoise(inst, model) : inst.objectType === "Int" ? intNoise(inst, model) : inst.objectType === "string" ? stringNoise(inst, model)
      : (() => { throw new Error(`no mutation noise for ${inst.objectType}`); })()) as NoiseStep<unknown>;
    memo.set(key, f);
  }
  return f;
}
/** `m` independent noise steps. */
export function noise<V>(inst: Instantiation, value: V, m: number, rng: Rng, model: CostModel = DEFAULT_COST_MODEL): V {
  const step = noiseStep(inst, model) as NoiseStep<V>;
  let v = value;
  for (let k = 0; k < m; k++) v = step(v, rng);
  return v;
}
