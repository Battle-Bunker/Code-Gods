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
 * Under a distance cost model (structure/index.ts) the Grid draw is over the generators' arguments instead: a small
 * step is likelier than a far one.
 *
 * The draw is exact for that distribution. A mutation that cannot apply (a multiplication out of range) leaves the
 * value as it is. Bump NOISE_VERSION whenever the costs or the distribution change: cached hold tables are keyed by it.
 */
import { CHANGE_BETA, changeCost } from "./mutators.ts";
import { gridArgs, gridElementaryCosts, gridFamilies } from "./grid/index.ts";
import { DEFAULT_COST_MODEL, layerSize, siteWork, type CostModel } from "./structure/index.ts";
import type { GridValue } from "./grid/codec.ts";
import { COLOUR_COMPONENTS, SYMBOL_COMPONENTS } from "./grid/components.ts";
import { digitAddCost, multiplyCost } from "./int/index.ts";
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
  if (model !== "set-v1") return gridDistanceNoise(inst, model);
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
 * Grid noise under a distance model: a uniform cell, then one generator argument drawn ∝ 2^(−C(w)) over every family's
 * argument space (structure/index.ts): the number by ±k, the suit or the colour to one of the others. A number move
 * that leaves the range cannot apply and leaves the board as it is, like the `add` mutator it stands for.
 */
function gridDistanceNoise(inst: Instantiation, model: CostModel): NoiseStep<GridValue> {
  const t = gridArgs(inst), s = SYMBOL_COMPONENTS[t.symbols], fams = gridFamilies(inst, model);
  const kinds: { family: string; arg: number; w: number }[] = [];
  for (const f of fams) {
    const n = layerSize(f.generator.layer);
    // An argument is the offset it adds; on a slider both signs, on a categorical layer the n − 1 relabellings.
    const args = f.generator.id === "add" ? Array.from({ length: n - 1 }, (_, i) => [i + 1, -(i + 1)]).flat() : Array.from({ length: n - 1 }, (_, i) => i + 1);
    for (const arg of args) kinds.push({ family: f.id, arg, w: weight(changeCost(siteWork(f, fams.length, 0, Math.abs(arg)))) });
  }
  const cum: number[] = [];
  let total = 0;
  for (const k of kinds) cum.push(total += k.w);
  const R = s.rankCount, suits = s.suitNames?.length ?? 1, C = COLOUR_COMPONENTS[t.colours].count;
  return (g, rng) => {
    const i = rng.int(g.size * g.size), u = unit(rng) * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] > u) hi = mid; else lo = mid + 1; }
    const k = kinds[lo], sym = g.sym.slice(), col = g.col.slice();
    if (k.family === "colour") col[i] = (col[i] + k.arg) % C;
    else {
      const rank = s.ranks[sym[i]], suit = (sym[i] - rank) / R;
      if (k.family === "suit") sym[i] = ((suit + k.arg) % suits) * R + rank;
      else if (rank + k.arg >= 0 && rank + k.arg < R) sym[i] += k.arg;
      else if (f_cyclic(fams)) sym[i] = suit * R + (((rank + k.arg) % R) + R) % R;
    }
    return { size: g.size, sym, col };
  };
}
const f_cyclic = (fams: readonly { id: string; generator: { id: string } }[]) => fams.some(f => f.id === "rank" && f.generator.id === "turn");

function intNoise(inst: Instantiation): NoiseStep<number> {
  const { min, max } = inst.args as { min: number; max: number }, W = max - min + 1, P = placesOf(inst);
  // Every candidate: a digit add (place, signed digit), or a multiplier; with its weight.
  const kinds: { add?: number; mul?: number; w: number }[] = [];
  const dw = weight(changeCost(digitAddCost(inst)));
  for (let p = 0; p < P; p++) for (let d = 1; d <= 9; d++) for (const s of [1, -1]) kinds.push({ add: s * d * 10 ** p, w: dw });
  for (let m = 2; m <= MAX_MULTIPLIER; m++) for (const s of [1, -1]) kinds.push({ mul: s * m, w: weight(changeCost(multiplyCost(m))) });
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

function stringNoise(inst: Instantiation): NoiseStep<string> {
  const L = stringArgs(inst).maxLength, w = stringElementaryCosts(inst);
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
/** The noise step for an instantiation under a cost model (memoised). Int and string have one model. */
export function noiseStep(inst: Instantiation, model: CostModel = DEFAULT_COST_MODEL): NoiseStep<unknown> {
  const key = `${inst.key}|${model}`;
  let f = memo.get(key);
  if (!f) {
    f = (inst.objectType === "Grid" ? gridNoise(inst, model) : inst.objectType === "Int" ? intNoise(inst) : inst.objectType === "string" ? stringNoise(inst)
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
