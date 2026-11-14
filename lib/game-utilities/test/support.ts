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

export const familiesOf = (inst: Instantiation) => FAMILIES.filter(f => f.objectType === inst.objectType && available(f, inst).ok);

/** Uniform spawns plus structured values that make ties and rare events common. */
export function sampleObjects(inst: Instantiation, rng: Rng, n: number, extra: readonly ObjectValue[] = []): ObjectValue[] {
  const def = objectType(inst.objectType), codec = def.codec(inst);
  const out: ObjectValue[] = Array.from({ length: n }, () => codec.encode(def.spawn(inst, rng)));
  if (inst.objectType === "Grid") {
    const { size, symbols, colours } = inst.args as { size: number; symbols: string; colours: string };
    const S = symbols === "cards" ? 52 : Number(symbols.slice(4)), C = inst.terms["colours.count"];
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
