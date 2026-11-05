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
 * The draw is exact for that distribution. A mutation that cannot apply (a multiplication out of range) leaves the
 * value as it is. Bump NOISE_VERSION whenever the costs or the distribution change: cached hold tables are keyed by it.
 */
import { CHANGE_BETA, changeCost } from "./mutators.ts";
import { gridArgs, gridElementaryCosts } from "./grid/index.ts";
import type { GridValue } from "./grid/codec.ts";
import { COLOUR_COMPONENTS, SYMBOL_COMPONENTS } from "./grid/components.ts";
import { digitAddCost, multiplyCost } from "./int/index.ts";
import { placesOf } from "./int/mutators.ts";
import { stringArgs, stringElementaryCosts } from "./string/index.ts";
import type { Instantiation, Rng } from "./types.ts";

export const NOISE_VERSION = `noise-v1|beta=${CHANGE_BETA}`;
export const MAX_MULTIPLIER = 1024;

/** A uniform number in [0, 1) from an Rng (53 bits). */
const unit = (rng: Rng) => (rng.int(2 ** 26) * 2 ** 27 + rng.int(2 ** 27)) / 2 ** 53;
const weight = (C: number) => 2 ** -C;

/** One mutation of `value` (the type's decoded value), drawn ∝ 2^(−C). Never mutates its input. */
export type NoiseStep<V> = (value: V, rng: Rng) => V;

function gridNoise(inst: Instantiation): NoiseStep<GridValue> {
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
/** The noise step for an instantiation (memoised). */
export function noiseStep(inst: Instantiation): NoiseStep<unknown> {
  let f = memo.get(inst.key);
  if (!f) {
    f = (inst.objectType === "Grid" ? gridNoise(inst) : inst.objectType === "Int" ? intNoise(inst) : inst.objectType === "string" ? stringNoise(inst)
      : (() => { throw new Error(`no mutation noise for ${inst.objectType}`); })()) as NoiseStep<unknown>;
    memo.set(inst.key, f);
  }
  return f;
}
/** `m` independent noise steps. */
export function noise<V>(inst: Instantiation, value: V, m: number, rng: Rng): V {
  const step = noiseStep(inst) as NoiseStep<V>;
  let v = value;
  for (let k = 0; k < m; k++) v = step(v, rng);
  return v;
}
