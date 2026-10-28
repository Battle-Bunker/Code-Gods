/** Shared test helpers: covering instantiations, sampled objects, and the fixture builders the Python tests run on. */
import {
  GRID_COLOUR_SETS, GRID_SIZES, GRID_SYMBOL_SETS, instantiate, objectType, seededRng,
  type Instantiation, type ObjectValue, type Rng,
} from "@workspace/game-types";
import { FAMILIES, available, context, evaluator, type Draw } from "../src/index.ts";
import type { Ordinal, Params, UtilityFamily } from "../src/index.ts";

export { seededRng };

/** Every Grid instantiation (60). */
export const allGrids = (): Instantiation[] =>
  GRID_SIZES.flatMap(size => GRID_SYMBOL_SETS.flatMap(symbols => GRID_COLOUR_SETS.map(colours =>
    instantiate("Grid", { size, symbols, colours }))));

/**
 * A covering set of Grid instantiations: every symbol set × colour set once (sizes cycling 3..7), plus every size
 * on base10/rgby, plus odd-size cards for Royal Court and Mixable × cards. Every family is available in several.
 */
export function coveringGrids(): Instantiation[] {
  const out = new Map<string, Instantiation>();
  let i = 0;
  for (const symbols of GRID_SYMBOL_SETS) for (const colours of GRID_COLOUR_SETS) {
    const inst = instantiate("Grid", { size: GRID_SIZES[i++ % 5], symbols, colours });
    out.set(inst.key, inst);
  }
  for (const size of GRID_SIZES) { const inst = instantiate("Grid", { size, symbols: "base10", colours: "rgby" }); out.set(inst.key, inst); }
  for (const a of [{ size: 3, symbols: "cards", colours: "rgb" }, { size: 5, symbols: "cards", colours: "rainbow6" },
    { size: 7, symbols: "cards", colours: "rgby" }, { size: 4, symbols: "base16", colours: "rainbow6" }]) {
    const inst = instantiate("Grid", a);
    out.set(inst.key, inst);
  }
  return [...out.values()];
}

export const intInsts = (): Instantiation[] =>
  [{}, { min: 0, max: 9999 }, { min: -1000, max: 1000 }, { min: 0, max: 1 }, { min: 2147483000, max: 2147483647 }]
    .map(a => instantiate("Int", a));
export const stringInsts = (): Instantiation[] => [128, 16, 8, 5, 1, 0, 40].map(maxLength => instantiate("string", { maxLength }));

export const familiesOf = (inst: Instantiation) => FAMILIES.filter(f => f.objectType === inst.objectType && available(f, inst).ok);

/** Uniform spawns plus structured values that make ties and rare events common. */
export function sampleObjects(inst: Instantiation, rng: Rng, n: number, extra: readonly ObjectValue[] = []): ObjectValue[] {
  const def = objectType(inst.objectType), codec = def.codec(inst);
  const out: ObjectValue[] = Array.from({ length: n }, () => codec.encode(def.spawn(inst, rng)));
  if (inst.objectType === "Grid") {
    const { size, symbols, colours } = inst.args as { size: number; symbols: string; colours: string };
    const S = symbols === "cards" ? 52 : Number(symbols.slice(4)), C = colours === "rgb" ? 3 : colours === "rgby" ? 4 : 6;
    const NN = size * size, grid = (s: (i: number) => number, c: (i: number) => number) =>
      codec.encode({ size, sym: Uint8Array.from({ length: NN }, (_, i) => s(i)), col: Uint8Array.from({ length: NN }, (_, i) => c(i)) });
    for (let k = 0; k < Math.min(C, 3); k++) { const s = rng.int(S); out.push(grid(() => s, () => k)); }
    for (let k = 0; k < n / 2; k++) {
      const cs = [rng.int(C), rng.int(C)], ss = [rng.int(S), rng.int(S), rng.int(S)].slice(0, 2 + rng.int(2));
      out.push(grid(() => ss[rng.int(ss.length)], () => cs[rng.int(2)]));
    }
    // perturbations of the extra values (exemplars)
    for (const w of extra) {
      const g = codec.decode(w) as { sym: Uint8Array; col: Uint8Array };
      for (let k = 0; k < 10; k++) {
        const sym = g.sym.slice(), col = g.col.slice();
        for (let j = 0; j <= rng.int(size); j++) {
          const i = rng.int(NN);
          if (rng.int(2)) sym[i] = rng.int(S); else col[i] = rng.int(C);
        }
        out.push(codec.encode({ size, sym, col }));
      }
    }
  } else if (inst.objectType === "Int") {
    const { min, max } = inst.args as { min: number; max: number };
    for (const x of [min, max, 0, 1, -1, 7, 10, 100, 1431655765, -1431655766, 223092870, 73939133, 123456789, 2147483647, -2147483648]) {
      if (x >= min && x <= max) out.push(x);
    }
    for (let k = 0; k < n / 2; k++) out.push(min + rng.int(Math.min(max - min + 1, 1000)));
  } else {
    const L = Number(inst.args.maxLength);
    for (const s of ["", "a", "aa", "abcabcabc", "((()))", "(()", "the quick brown fox", "0123456789", "zyxw", "aeiou",
      "bakemoti", "xxkumano", "racecar", "999", "AAAA bb cc"]) if (s.length <= L) out.push(s);
    for (let k = 0; k < n / 2 && L > 0; k++) {
      const len = rng.int(L + 1), alpha = ["ab", "0123456789", "( )", "aeiou bkm"][rng.int(4)];
      out.push(Array.from({ length: len }, () => alpha[rng.int(alpha.length)]).join(""));
    }
  }
  return [...out, ...extra];
}

/** Draws to test per family and instantiation: the canonical support (when small) plus a few samples. */
export function drawsFor(f: UtilityFamily<any>, inst: Instantiation, rng: Rng, samples = 2): Params[] {
  const ctx = context(inst);
  return Array.from({ length: samples }, () => f.sample(rng, ctx));
}

export function ordinals(draw: Draw, inst: Instantiation, wires: readonly ObjectValue[]): Ordinal[] {
  const u = evaluator(draw, inst);
  return wires.map(w => u(w));
}
