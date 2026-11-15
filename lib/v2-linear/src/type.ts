/** The line object type and its variants (spec §12). */
import type { ObjectType, Variant } from "@workspace/v2-core";
import { decodeLine, encodeLine, inDomain, lineBits, lineParams, normalise, type LineState } from "./line.ts";
import { representations } from "./representations.ts";
import { allMutators, lensMutators, mutators } from "./mutators.ts";
import { families } from "./families.ts";

const ALL_MUTATORS = mutators.map(m => m.id);
/**
 * The lens mutator in the beginner line set: rot.turn, which the owner asked for by name (decisions 25, 27, 28; the
 * coordinator's call 23, after docs/engine-v2/scripts/stretch-lens-pool-dynamics.md). basis.zoom joined with it and was
 * taken out the same day (the coordinator, 15 Nov): thirty zooms by 7 climbed Prime Landing 227 bits, a straight hill.
 * It returns when the "no straight hill" check passes for every dealt family against zoom, stretch and turn.
 */
const BEGINNER_LENSES = ["rot.turn"];
/** The others stay in the lines-lenses trial (coef.swap, basis.lean, basis.zoom, fold). */
const TRIAL_LENSES = lensMutators.map(m => m.id).filter(id => !BEGINNER_LENSES.includes(id));

export const lineZ: Variant = {
  id: "line-z", objectType: "line", mutators: ALL_MUTATORS, birthMixSteps: 64,
  params: { domain: "Z", linesPerObject: 1, argDomain: "Z" },
};
export const lineQ: Variant = {
  id: "line-q", objectType: "line", mutators: [...ALL_MUTATORS, ...BEGINNER_LENSES], birthMixSteps: 64,
  // The weighted which code: the turn keeps the price it was measured at (log2 20 = 4.32 bits, as on line-q-lenses),
  // and the nine share the rest (log2 (9 / 0.95) = 3.24 bits each).
  which: Object.fromEntries([...ALL_MUTATORS.map(id => [id, Math.log2(9 / 0.95)]), ...BEGINNER_LENSES.map(id => [id, Math.log2(20)])]),
  params: { domain: "Q", linesPerObject: 1, argDomain: "Q" },
};
/**
 * line-q with the other four lens mutators (lenses-and-mutators.md §5: a swap, a lean, a zoom, a fold) beside line-q's
 * ten. Dealt only by the lines-lenses preset. Same params, so the same law π ∝ 2^−φ: it reads line-q's values.
 */
export const lineQLenses: Variant = {
  id: "line-q-lenses", objectType: "line", mutators: [...lineQ.mutators, ...TRIAL_LENSES], birthMixSteps: 64, valuesOf: "line-q",
  // line-q's ten share 3/4 of the mass in line-q's proportions, the four share 1/4 (log2 16 = 4 bits each).
  which: Object.fromEntries([...lineQ.mutators.map(id => [id, lineQ.which![id]! + Math.log2(4 / 3)]), ...TRIAL_LENSES.map(id => [id, Math.log2(4 * TRIAL_LENSES.length)])]),
  params: { domain: "Q", linesPerObject: 1, argDomain: "Q" },
};
export const lineZ4: Variant = {
  id: "line-z4", objectType: "line", mutators: ALL_MUTATORS, birthMixSteps: 64,
  params: { domain: "Z", linesPerObject: 4, argDomain: "Z" },
};

export const lineType: ObjectType<LineState> = {
  id: "line",
  version: 1,
  variants: [lineZ, lineQ, lineZ4, lineQLenses],
  canonical(state, variant) {
    const p = lineParams(variant);
    if (state.lines.length !== p.linesPerObject) return { invalid: `this board has ${p.linesPerObject} line(s) per object` };
    const lines = [];
    for (const l of state.lines) {
      const n = inDomain(normalise(l.a, l.b, l.c), p);
      if ("invalid" in n) return n;
      lines.push(n);
    }
    return { lines };
  },
  encode: s => s.lines.map(encodeLine).join(";"),
  decode: w => ({ lines: w.split(";").map(decodeLine) }),
  readLength: (s, v) => {
    const p = lineParams(v);
    return s.lines.reduce((t, l) => t + lineBits(l, p), 0);
  },
  sites: s => s.lines.length,
  origin: v => ({ lines: Array.from({ length: lineParams(v).linesPerObject }, () => ({ a: 0n, b: 1n, c: 0n })) }), // y = 0
  *enumerate(v) {
    const p = lineParams(v);
    if (p.linesPerObject !== 1) return;
    if (p.domain === "Z") {
      // y = mx + c with |m| ≤ 40 and |c| ≤ 120.
      for (let m = -40n; m <= 40n; m++) for (let c = -120n; c <= 120n; c++) yield { lines: [{ a: -m, b: 1n, c: -c }] };
      return;
    }
    // Primitive triples with |a|, |b| ≤ 12 and |c| ≤ 60, each once.
    for (let a = -12n; a <= 12n; a++) for (let b = 0n; b <= 12n; b++) for (let c = -60n; c <= 60n; c++) {
      const n = normalise(a, b, c);
      if ("invalid" in n || n.a !== a || n.b !== b || n.c !== c) continue;
      yield { lines: [n] };
    }
  },
  representations,
  mutators: allMutators,
  families: [...families],
};
