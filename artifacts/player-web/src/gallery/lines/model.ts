/**
 * PROTOTYPE for docs/engine-v2/annotations-design.md (the storyboards of §9). A contributor is one layer of the dealt rule
 * shown as the chain of quantities it was computed from (§2). Every number here comes from v2-core's evaluation of the
 * real rule (annotate, partLadders, the mutators' real prices) and the calibrated line-z artefacts; only the per-family
 * reading of the lens values (`SPECS`) is written by hand here. The implementation (§11.1) replaces SPECS with the
 * rule's own reads of a `num` representation and a `target` mark, so nothing is hand-written per family.
 */
import {
  applyPriced, evaluateObject, isInvalid, levelOf, objectLadder, Qn, q, variantMutators, type Mutator, type ObjectType, type Q,
  type RuleFamily,
} from "@workspace/v2-core";
import {
  divisibilityLadder, intercept, isPrime, largestPrimeFactor, lineType, lineZ, nearbyPrimes, nearestSquareRoot, primeLanding,
  slope, smallestPrimeFactor, squareArea, treasure, wholeCrossing, yAt, type LineState,
} from "@workspace/v2-linear";
import { annotate, candidateArgs, chanceText, DEFAULT_BUDGET, fmtNum, fmtQ, partLadders, type Annotation, type RuleRef } from "@workspace/v2-views";

export type Role = "main" | "tb" | "told";
export const GLYPH: Record<Role, string> = { main: "●", tb: "◆", told: "◇" };
export type ViewId = "si" | "cart" | "tri" | "table" | "mach" | "seq";
export const VIEW_TITLE: Record<ViewId, string> = {
  si: "equation", cart: "graph", tri: "triangle", table: "table of values", mach: "function machine", seq: "growth pattern",
};
export const ALL_VIEWS: readonly ViewId[] = ["si", "cart", "tri", "table", "mach", "seq"];

/** Something a view draws for a contributor. Plane features are in world units. */
export type Feature =
  | { kind: "ytick"; y: number; label: string; strong?: boolean }
  | { kind: "xtick"; x: number; label: string; strong?: boolean }
  | { kind: "yband"; from: number; to: number; label?: string }
  | { kind: "xband"; from: number; to: number; label?: string }
  | { kind: "point"; x: number; y: number; label: string; ring?: boolean; hollow?: boolean }
  | { kind: "bracket"; x: number; y0: number; y1: number; label: string }
  | { kind: "region"; pts: [number, number][]; label: string }
  | { kind: "square"; x: number; y: number; side: number; label: string }
  | { kind: "leg"; axis: "x" | "y"; to: number; label: string };

/** Where a contributor shows in one view. */
export interface Anchor {
  /** Equation: the coefficient the badge sits on, and a note under it. */
  eq?: { el: "m" | "c"; note?: string };
  /** Table: the columns the rule reads and a verdict per column. */
  cells?: { x: number; mark?: "ok" | "no" | "target"; note?: string }[];
  /** Plane / triangle: features in world units. */
  fx?: Feature[];
  /** Machine: a stage or the output. */
  mach?: { at: "times" | "plus" | "fixed"; note?: string };
}

export interface Gauge {
  notches: string[];
  /** The thresholds as numbers (a distance or a size), aligned with the notches. */
  values: number[];
  /** Notches reached (0 … notches.length). */
  reached: number;
  sense: "min" | "max";
}

/** The lens as a magnified number line: the value, the references it is measured to, and the target band. */
export interface Ruler {
  value: number;
  valueLabel: string;
  refs: { at: number; label: string; strong?: boolean }[];
  band?: [number, number];
  bandLabel?: string;
}

export interface Contributor {
  role: Role;
  ruler?: Ruler;
  /** "c", "area", "x₀", "y(2)", "run". */
  name: string;
  /** The layer's title: "y-intercept close to a prime". */
  title: string;
  value: string;
  /** The chain, left to right: what you see → what the rule reads → how far → the target. */
  chain: string[];
  /** One sentence for a screen reader and the reading strip. */
  sentence: string;
  gauge: Gauge;
  top: boolean;
  /** "Next target: within 1" (null at the top). Prototype-internal: never shown (decision 23: no thresholds). */
  next: string | null;
  /** What the rule wants of this quantity, in words: "as close to a prime as possible", "the bigger the better". */
  aim: string;
  anchors: Partial<Record<ViewId, Anchor>>;
  /** Who it belongs to, for a told rule. */
  owner?: string;
}

export interface Move {
  words: string;
  price: number;
  after: LineState;
  levelAfter: number;
  /** The line's bits after the move (prototype: the calibrated table; the continuous valuation replaces it, decision 23). */
  bits: number;
  /** "y = 6x + 23". */
  equation: string;
  /** What each contributor does: "● exactly a prime". */
  effect: string;
}

export interface Reading {
  rule: RuleRef<LineState, unknown>;
  state: LineState;
  annotation: Annotation;
  level: number;
  top: number;
  bits: number;
  rarities: number[];
  contributors: Contributor[];
  views: ViewId[];
  primary: ViewId;
  /** The views the rule reads (family.depends): the switcher's chips; the rest go under "More views". */
  reads: ViewId[];
  /** The sentence that says how the two parts combine. */
  combine: string;
  moves: Move[];
  equation: string;
}

// ------------------------------------------------------------------ numbers

const N = (x: Q) => Qn.toNumber(x);
/** Wording rule: a fraction a 12-year-old cannot read (bottom number above 16) is written "≈ 6.00". */
const f = (x: Q) => (x.d > 16n ? `≈ ${fmtNum(Qn.toNumber(x))}` : fmtQ(x));
const fn = (x: number): string => {
  if (Number.isInteger(x)) return x < 0 ? `−${-x}` : String(x);
  for (let d = 2; d <= 64; d++) { const n = Math.round(x * d); if (Math.abs(n - x * d) < 1e-9) return fmtQ(q(n, d)); }
  return String(Math.round(x * 100) / 100);
};
const away = (d: Q, below: boolean, unit = "") => (Qn.isZero(d) ? "exactly" : `${f(d)}${unit} ${below ? "below" : "above"}`);

export function equation(s: LineState): string {
  const l = s.lines[0]!;
  const m = slope(l), c = intercept(l);
  const mx = Qn.eq(m, Qn.ONE) ? "x" : Qn.eq(m, q(-1)) ? "−x" : Qn.isZero(m) ? "" : `${f(m)}x`;
  if (!mx) return `y = ${f(c)}`;
  if (Qn.isZero(c)) return `y = ${mx}`;
  return `y = ${mx} ${c.n < 0n ? "−" : "+"} ${f(Qn.abs(c))}`;
}

// ------------------------------------------------------------------ rarities (line-z artefacts)

const ARTEFACTS = import.meta.glob("../../../../../lib/v2-valuation/artefacts/line-z/*/*.json", { eager: true, import: "default" }) as Record<string, { family: string; tieBreaker: string; rungs: { bits: number }[] }>;
export function raritiesOf(family: string, tb: string): number[] {
  const a = Object.values(ARTEFACTS).find(x => x.family === family && x.tieBreaker === tb);
  return a ? a.rungs.map(r => r.bits) : [];
}

// ------------------------------------------------------------------ gauges and wording

function gauge(rule: RuleRef<LineState, unknown>, i: number, rung: number | null): Gauge {
  const layers = [rule.family.main, rule.family.tieBreakers.find(t => t.id === rule.tieBreaker)!];
  const l = layers[i]!;
  const ts = l.thresholds(rule.params as never, rule.variant);
  // Whole-number lines drop fractional distance thresholds where the layer says so (partLadders is the truth).
  const ladder = partLadders(rule, 2)[i]!;
  const used = ladder.slice(1).map(r => r.score?.[0] ?? r.score?.[1]).filter(Boolean) as Q[];
  const list = used.length ? used.map(x => (l.sense === "min" ? Qn.neg(x) : x)) : ts;
  const notches = list.map(t => (l.sense === "min" ? (Qn.isZero(t) ? "exactly" : `within ${f(t)}`) : `≥ ${f(t)}`));
  return { notches, values: list.map(t => Qn.toNumber(t)), reached: rung ?? 0, sense: l.sense };
}

const nextOf = (g: Gauge): string | null => (g.reached >= g.notches.length ? null : g.notches[g.reached]!);

// ------------------------------------------------------------------ per-family readings (prototype; §11.1 replaces these)

type Spec = (s: LineState, a: Annotation, rule: RuleRef<LineState, unknown>) => {
  views: ViewId[]; primary: ViewId;
  main: Omit<Contributor, "role" | "gauge" | "top" | "next" | "title" | "aim">;
  tb: Omit<Contributor, "role" | "gauge" | "top" | "next" | "title" | "aim">;
};

const primeChain = (x: Q) => {
  const ps = nearbyPrimes(x).slice(0, 2);
  return ps.map(p => ({ p, d: Qn.abs(Qn.sub(x, q(p))), below: Qn.cmp(q(p), x) < 0 }));
};

const SPECS: Record<string, Spec> = {
  "prime-landing": (s, _a, rule) => {
    const l = s.lines[0]!, c = intercept(l), m = slope(l);
    const ps = primeChain(c);
    const near = ps[0]!;
    const isTop = Qn.isZero(near.d);
    const tickFx: Feature[] = ps.map((x, i) => ({ kind: "ytick" as const, y: Number(x.p), label: `${x.p} · ${away(x.d, x.below)}`, strong: i === 0 }));
    const band: Feature[] = isTop ? [] : [{ kind: "yband" as const, from: Number(near.p) - 1, to: Number(near.p) + 1, label: "within 1" }];
    const lo = Math.min(N(c), ...ps.map(x => Number(x.p))), hi = Math.max(N(c), ...ps.map(x => Number(x.p)));
    const ruler: Ruler = { value: N(c), valueLabel: `c = ${f(c)}`, refs: primesIn(lo - 3, hi + 3).map(x => ({ at: x, label: String(x), strong: BigInt(x) === near.p })), band: isTop ? undefined : [Number(near.p) - 1, Number(near.p) + 1], bandLabel: "within 1" };
    const main = {
      name: "c", value: f(c), ruler,
      chain: [`c = ${f(c)}`, isTop ? `${f(c)} is a prime` : `nearest prime ${near.p}`, isTop ? "exactly" : `${f(near.d)} away`],
      sentence: isTop
        ? `Your rule reads the y-intercept c = ${f(c)}, where the line crosses the y-axis. ${f(c)} is a prime: exactly on target.`
        : `Your rule reads the y-intercept c = ${f(c)}, where the line crosses the y-axis. The nearest prime is ${near.p}, ${f(near.d)} ${near.below ? "below" : "above"}.`,
      anchors: {
        si: { eq: { el: "c" as const, note: isTop ? "a prime ✓" : `→ ${ps.map(x => `${x.p} (${away(x.d, x.below)})`).join(", ")}` } },
        cart: { fx: [{ kind: "point" as const, x: 0, y: N(c), label: `c = ${f(c)}`, ring: true } as Feature, ...tickFx, ...band] },
        table: { cells: [{ x: 0, note: isTop ? "prime ✓" : `→ ${near.p}` }] },
        mach: { mach: { at: "plus" as const, note: `+ ${f(c)}` } },
      },
    };
    let tb: Spec extends (...a: never[]) => infer R ? R extends { tb: infer T } ? T : never : never;
    if (rule.tieBreaker === "big-prime") {
      tb = {
        name: "the prime", value: String(near.p), chain: [`that prime (the nearest to c) = ${near.p}`], sentence: `The tie-breaker is that prime itself, ${near.p}: the bigger, the better.`,
        anchors: { si: { eq: { el: "c" as const, note: undefined } }, cart: { fx: [] } },
      };
    } else {
      const g = rule.tieBreaker === "m-gpf" ? largestPrimeFactor(m.n) : smallestPrimeFactor(m.n);
      const which = rule.tieBreaker === "m-gpf" ? "largest" : "smallest";
      tb = {
        name: "m", value: f(m), chain: [`m = ${f(m)}`, `${factorText(m.n)}`, `${which} prime factor ${g}`],
        sentence: `The tie-breaker reads the gradient m = ${f(m)} = ${factorText(m.n)}: its ${which} prime factor is ${g}.`,
        anchors: { si: { eq: { el: "m" as const, note: `= ${factorText(m.n)}` } }, cart: { fx: [] } },
      };
    }
    return { views: ["si", "cart", "table", "mach", "tri", "seq"], primary: "si", main, tb };
  },

  "square-area": (s, _a, rule) => {
    const l = s.lines[0]!, c = intercept(l), m = slope(l);
    const lx = Qn.abs(Qn.div(c, m)), ly = Qn.abs(c);
    const area = Qn.div(Qn.mul(lx, ly), q(2));
    const r = nearestSquareRoot(area), sq = q(r * r), d = Qn.abs(Qn.sub(area, sq));
    const xi = N(Qn.neg(Qn.div(c, m))), yi = N(c);
    const side = Number(r);
    // The square sits beside the triangle, on the far side of the y-axis, with its base on the x-axis.
    const sqx = xi < 0 ? 0.6 : -side - 0.6, sqy = yi < 0 ? -side : 0;
    const roots = [r - 1n, r, r + 1n].filter(x => x >= 0n).map(x => Number(x));
    const ruler: Ruler = { value: N(area), valueLabel: `area ${f(area)}`, refs: roots.map(x => ({ at: x * x, label: `${x * x} = ${x}²`, strong: BigInt(x) === r })), band: Qn.isZero(d) ? undefined : [Number(sq) - 0.25, Number(sq) + 0.25], bandLabel: "within ¼" };
    const main = {
      name: "area", value: f(area), ruler,
      chain: [`legs ${f(lx)} and ${f(ly)}`, `area ${f(lx)} × ${f(ly)} ÷ 2 ${f(area).startsWith("≈") ? "" : "= "}${f(area)}`, `nearest square ${r * r} = ${r} × ${r}`, Qn.isZero(d) ? "exactly" : `${f(d)} away`],
      sentence: `The line and the two axes make a triangle with legs ${f(lx)} and ${f(ly)}, so its area is ${f(area)}. The nearest square number is ${r * r} = ${r} × ${r}, ${Qn.isZero(d) ? "exactly" : `${f(d)} away`}.`,
      anchors: {
        tri: { fx: [
          { kind: "region" as const, pts: [[0, 0], [xi, 0], [0, yi]], label: `area ${f(area)}` } as Feature,
          { kind: "leg" as const, axis: "x" as const, to: xi, label: f(lx) }, { kind: "leg" as const, axis: "y" as const, to: yi, label: f(ly) },
          { kind: "square" as const, x: sqx, y: sqy, side, label: `${r} × ${r} = ${r * r}` },
        ] },
        cart: { fx: [{ kind: "point" as const, x: xi, y: 0, label: `leg ${f(lx)}`, ring: true }, { kind: "point" as const, x: 0, y: yi, label: `leg ${f(ly)}`, ring: true }] },
        si: { eq: { el: "c" as const, note: `leg ${f(ly)} = |c|; leg ${f(lx)} = |c ÷ m|` } },
      },
    };
    const which = rule.tieBreaker === "lpf" ? "largest" : rule.tieBreaker === "omega" ? "count" : "smallest";
    const val = which === "largest" ? largestPrimeFactor(r) : which === "smallest" ? smallestPrimeFactor(r) : null;
    const tb = {
      name: "root", value: String(r),
      chain: [`the square's side (its root) ${r}`, factorText(r) === "a prime" ? `${r} is a prime` : `${r} = ${factorText(r)}`, which === "count" ? `${factorText(r).split("×").length} prime factors` : `${which} prime factor ${val}`],
      sentence: `The tie-breaker reads the side of that square, ${r} (its root): ${factorText(r) === "a prime" ? `${r} is a prime` : `${r} = ${factorText(r)}`}, so ${which === "count" ? `it has ${factorText(r) === "a prime" ? 1 : factorText(r).split("×").length} prime factors` : `its ${which} prime factor is ${val}`}.`,
      anchors: { tri: { fx: [] } },
    };
    return { views: ["tri", "cart", "si", "table", "mach", "seq"], primary: "tri", main, tb };
  },

  "whole-crossing": (s, _a, rule) => {
    const l = s.lines[0]!, c = intercept(l), m = slope(l);
    const x = Qn.neg(Qn.div(c, m));
    const k = Qn.floor(Qn.add(x, q(1, 2)));
    const d = Qn.abs(Qn.sub(x, q(k)));
    const below = Qn.cmp(q(k), x) < 0;
    const kn = Number(k);
    const ruler: Ruler = { value: N(x), valueLabel: `x₀ = ${f(x)}`, refs: [kn - 1, kn, kn + 1].map(v => ({ at: v, label: fn(v), strong: v === kn })), band: Qn.isZero(d) ? undefined : [kn - 0.25, kn + 0.25], bandLabel: "within ¼" };
    const main = {
      name: "x₀", value: f(x), ruler,
      chain: [`0 = ${f(m)}x ${c.n < 0n ? "−" : "+"} ${f(Qn.abs(c))}`, `x₀ = ${f(x)}`, `nearest whole number ${k < 0n ? "−" + -k : k}`, Qn.isZero(d) ? "exactly" : `${f(d)} away`],
      sentence: `Your rule reads where the line crosses the x-axis: solving 0 = ${equation(s).slice(4)} gives x₀ = ${f(x)}. The nearest whole number is ${fmtQ(q(k))}, ${Qn.isZero(d) ? "exactly" : `${f(d)} to the ${below ? "left" : "right"}`}.`,
      anchors: {
        cart: { fx: [
          { kind: "point" as const, x: N(x), y: 0, label: `x₀ = ${f(x)}`, ring: true } as Feature,
          { kind: "xtick" as const, x: Number(k), label: `${fmtQ(q(k))} · ${Qn.isZero(d) ? "exactly" : `${f(d)} away`}`, strong: true },
          ...(Qn.isZero(d) ? [] : [{ kind: "xband" as const, from: Number(k) - 0.25, to: Number(k) + 0.25, label: "within ¼" }]),
        ] },
        si: { eq: { el: "c" as const, note: `0 = ${f(m)}x ${c.n < 0n ? "−" : "+"} ${f(Qn.abs(c))} → x₀ = ${f(x)}` } },
        table: { cells: [Number(Qn.floor(x)), Number(Qn.floor(x)) + 1].map(xx => ({ x: xx, note: xx === Number(Qn.floor(x)) ? "y < 0" : "y > 0" })) },
      },
    };
    const kk = k < 0n ? -k : k;
    const which = rule.tieBreaker === "k-spf" ? "smallest" : "largest";
    const val = rule.tieBreaker === "m-spf" ? smallestPrimeFactor(m.n) : which === "smallest" ? smallestPrimeFactor(kk) : largestPrimeFactor(kk);
    const tb = rule.tieBreaker === "m-spf"
      ? { name: "m", value: f(m), chain: [`m = ${f(m)}`, factorText(m.n), `smallest prime factor ${val}`], sentence: `The tie-breaker reads the gradient m = ${f(m)}: its smallest prime factor is ${val}.`, anchors: { si: { eq: { el: "m" as const } } } }
      : { name: "whole number", value: fmtQ(q(k)), chain: [`that whole number ${fmtQ(q(k))}`, factorText(kk) === "a prime" ? `${kk} is a prime` : `${kk} = ${factorText(kk)}`, `${which} prime factor ${val}`], sentence: `The tie-breaker reads that whole number, ${fmtQ(q(k))}: ${factorText(kk) === "a prime" ? `${kk} is a prime` : `${kk} = ${factorText(kk)}`}, so its ${which} prime factor is ${val}.`, anchors: { cart: { fx: [] } } };
    return { views: ["cart", "si", "table", "tri", "mach", "seq"], primary: "cart", main, tb };
  },

  treasure: (s, _a, rule) => {
    const p = rule.params as { k: number; T: number };
    const l = s.lines[0]!, m = slope(l);
    const y = yAt(l, q(p.k)), d = Qn.abs(Qn.sub(y, q(p.T))), below = Qn.cmp(y, q(p.T)) < 0;
    const ruler: Ruler = { value: N(y), valueLabel: `y(${p.k}) = ${f(y)}`, refs: [{ at: p.T, label: `treasure ${p.T}`, strong: true }], band: Qn.isZero(d) ? undefined : [p.T - Math.max(0, N(d) / 2), p.T + Math.max(0, N(d) / 2)], bandLabel: `within ${fn(N(d) / 2)}` };
    const main = {
      name: `y(${p.k})`, value: f(y), ruler,
      chain: [`x = ${p.k}`, `y(${p.k}) = ${f(m)} × ${p.k} + ${f(intercept(l))} = ${f(y)}`, `treasure ${p.T}`, Qn.isZero(d) ? "exactly" : `${f(d)} ${below ? "short" : "over"}`],
      sentence: `Your rule puts x = ${p.k} into the line: y(${p.k}) = ${f(y)}. The treasure is at ${p.T}, ${Qn.isZero(d) ? "hit exactly" : `${f(d)} ${below ? "higher" : "lower"}`}.`,
      anchors: {
        table: { cells: [{ x: p.k, mark: Qn.isZero(d) ? "ok" as const : "target" as const, note: Qn.isZero(d) ? `= ${p.T} ✓` : `target ${p.T} (${f(d)} ${below ? "short" : "over"})` }] },
        cart: { fx: [
          { kind: "point" as const, x: p.k, y: N(y), label: `y(${p.k}) = ${f(y)}`, ring: true } as Feature,
          { kind: "point" as const, x: p.k, y: p.T, label: `treasure (${p.k}, ${p.T})`, hollow: true },
          ...(Qn.isZero(d) ? [] : [{ kind: "bracket" as const, x: p.k, y0: N(y), y1: p.T, label: `${f(d)} ${below ? "short" : "over"}` }]),
        ] },
        si: { eq: { el: "m" as const, note: `y(${p.k}) = ${f(m)} × ${p.k} + ${f(intercept(l))} = ${f(y)}` } },
        mach: { mach: { at: "fixed" as const, note: `in ${p.k} → out ${f(y)}` } },
      },
    };
    const which = rule.tieBreaker === "m-gpf" ? "largest" : "smallest";
    const val = which === "largest" ? largestPrimeFactor(m.n) : smallestPrimeFactor(m.n);
    const tb = {
      name: "m", value: f(m), chain: [`m = ${f(m)}`, `${f(m)} = ${factorText(m.n)}`, `${which} prime factor ${val}`],
      sentence: `The tie-breaker reads the gradient m = ${f(m)} = ${factorText(m.n)}: its ${which} prime factor is ${val}.`,
      anchors: { si: { eq: { el: "m" as const, note: `= ${factorText(m.n)}` } }, table: { cells: [] } },
    };
    return { views: ["table", "cart", "si", "mach", "tri", "seq"], primary: "table", main, tb };
  },

  "divisibility-ladder": (s, _a, rule) => {
    const l = s.lines[0]!, m = slope(l);
    const cells: NonNullable<Anchor["cells"]> = [];
    let run = 0;
    for (let n = 1; n <= 12; n++) {
      const y = yAt(l, q(n));
      const ok = y.d === 1n && y.n % BigInt(n) === 0n;
      cells.push({ x: n, mark: ok ? "ok" as const : "no" as const, note: ok ? `÷ ${n} = ${f(Qn.div(y, q(n)))}` : `not a multiple of ${n}` });
      if (!ok) break;
      run++;
    }
    const stopAt = run + 1;
    const capped = run === 12;
    const stop = capped ? "the run is as long as the rule counts" : `y(${stopAt}) = ${f(yAt(l, q(stopAt)))} is not a multiple of ${stopAt}`;
    const main = {
      name: "run", value: String(run),
      chain: [`y(1) … y(${run}) ✓`, stop, `run ${run}`],
      sentence: `Your rule checks y(1) ÷ 1, y(2) ÷ 2, y(3) ÷ 3 … in turn. The first ${run} come out whole${capped ? ": the run is as long as the rule counts" : `; ${stop}, so the run is ${run}`}.`,
      anchors: { table: { cells }, si: { eq: { el: "m" as const, note: `each step adds ${f(m)}` } } },
    };
    const which = rule.tieBreaker === "m-gpf" ? "largest" : "smallest";
    const val = which === "largest" ? largestPrimeFactor(m.n) : smallestPrimeFactor(m.n);
    const tb = {
      name: "m", value: f(m), chain: [`m = ${f(m)}`, `${f(m)} = ${factorText(m.n)}`, `${which} prime factor ${val}`],
      sentence: `The tie-breaker reads the gradient m = ${f(m)} = ${factorText(m.n)}: its ${which} prime factor is ${val}.`,
      anchors: { si: { eq: { el: "m" as const, note: `= ${factorText(m.n)}` } } },
    };
    return { views: ["table", "si", "cart", "seq", "mach", "tri"], primary: "table", main, tb };
  },
};

/** A size's ruler: the value among its natural values (primes, or whole numbers), the next few above it to aim at. */
function sizeRuler(name: string, value: string, primes: boolean): Ruler | undefined {
  const v = Number(value.replace("−", "-"));
  if (!Number.isFinite(v)) return undefined;
  const hi = Math.max(v + (primes ? 14 : 4), primes ? 13 : 6), lo = Math.max(primes ? 2 : 0, v - (primes ? 8 : 3));
  const refs = primes ? primesIn(lo, hi).map(x => ({ at: x, label: String(x), strong: x === v })) : Array.from({ length: hi - lo + 1 }, (_, k) => ({ at: lo + k, label: String(lo + k), strong: lo + k === v }));
  return { value: v, valueLabel: `${name}: ${value}`, refs, bandLabel: "bigger is better →" };
}

function primesIn(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let n = Math.max(2, Math.ceil(lo)); n <= hi; n++) if (isPrime(BigInt(n))) out.push(n);
  return out;
}

function factorText(n: bigint): string {
  let x = n < 0n ? -n : n;
  if (x < 2n) return x.toString();
  const out: bigint[] = [];
  for (let p = 2n; p * p <= x; p++) while (x % p === 0n) { out.push(p); x /= p; }
  if (x > 1n) out.push(x);
  return out.length === 1 ? "a prime" : out.join(" × ");
}

// ------------------------------------------------------------------ moves (§5)

function moveWords(m: Mutator<unknown, unknown>, args: Record<string, string>, before: LineState, after: LineState): string {
  const lb = before.lines[0]!, la = after.lines[0]!;
  const k = args.k ? Qn.parse(args.k) : null;
  switch (m.id) {
    case "si.shift": return `move the line ${k!.n > 0n ? "up" : "down"} ${f(Qn.abs(k!))}`;
    case "si.tilt": return `change the gradient to ${f(slope(la))}, keeping the y-intercept`;
    case "seq.step": return `change the gradient to ${f(slope(la))}, keeping y(1) = ${f(yAt(lb, Qn.ONE))}`;
    case "cart.pivot": return `turn the line about its point at x = ${f(Qn.parse(args.x0!))} to gradient ${f(slope(la))}`;
    case "cart.slide": return `slide the line to ${equation(after)}`;
    case "mach.stretch": return `multiply every output by ${f(Qn.parse(args.f!))}`;
    default: return `change the equation to ${equation(after)}`;
  }
}

/** Up to k distinct moves that raise the line's step, cheapest first (the implementation generalises improve.ts). */
export function moves(rule: RuleRef<LineState, unknown>, state: LineState, k = 3): Move[] {
  const { family, params, variant, tieBreaker } = rule;
  const ladder = objectLadder(lineType, family, params, variant, tieBreaker);
  const before = levelOf(evaluateObject(lineType, family, params, state, variant, tieBreaker).score, ladder);
  const ms = variantMutators(lineType as ObjectType<unknown>, variant);
  const cands: { m: Mutator<unknown, unknown>; a: unknown; base: number }[] = [];
  for (const m of ms) {
    const code = m.args(variant);
    for (const a of candidateArgs(code as never, `moves:${m.id}`, { ...DEFAULT_BUDGET, maxBits: 14 })) cands.push({ m, a, base: code.bits(a) });
  }
  cands.sort((x, y) => x.base - y.base);
  const found: Move[] = [];
  const seen = new Set<string>();
  let tried = 0;
  for (const c of cands) {
    if (tried++ > 2500) break;
    const r = applyPriced(lineType as ObjectType<unknown>, variant, state, c.m, 0, c.a);
    if (isInvalid(r)) continue;
    const after = r.result as LineState;
    const lv = levelOf(evaluateObject(lineType, family, params, after, variant, tieBreaker).score, ladder);
    if (lv <= before) continue;
    const key = lineType.encode(after);
    if (seen.has(key)) continue;
    seen.add(key);
    const args = c.m.args(variant).encode(c.a) as Record<string, string>;
    found.push({ words: moveWords(c.m, args, state, after), price: r.price.total, after, levelAfter: lv, bits: raritiesOf(family.id, tieBreaker as string)[lv] ?? 0, equation: equation(after), effect: "" });
  }
  // The price/step frontier: the cheapest move, then the cheapest that climbs higher than every cheaper one.
  found.sort((a, b) => a.price - b.price || b.levelAfter - a.levelAfter);
  const frontier: Move[] = [];
  for (const m of found) if (!frontier.length || m.levelAfter > frontier[frontier.length - 1]!.levelAfter) frontier.push(m);
  return frontier.slice(0, k);
}

// ------------------------------------------------------------------ reading

export const FAMILIES: Record<string, RuleFamily<LineState, any>> = {
  "prime-landing": primeLanding, "square-area": squareArea, "whole-crossing": wholeCrossing, treasure, "divisibility-ladder": divisibilityLadder,
};

export function ruleOf(family: string, tieBreaker: string, params: unknown = FAMILIES[family]!.dealable(lineZ)[0]): RuleRef<LineState, unknown> {
  return { type: lineType, family: FAMILIES[family]!, params, variant: lineZ, tieBreaker };
}

export function read(rule: RuleRef<LineState, unknown>, state: LineState, withMoves = true): Reading {
  const rarities = raritiesOf(rule.family.id, rule.tieBreaker as string);
  const a = annotate(rule, state, { rarities });
  const parts = a.sites[0]!.parts;
  const spec = SPECS[rule.family.id]!(state, a, rule);
  const titles = [rule.family.main.title, rule.family.tieBreakers.find(t => t.id === rule.tieBreaker)!.title];
  const contributors: Contributor[] = (["main", "tb"] as const).map((role, i) => {
    const g = gauge(rule, i, parts[i]?.rung ?? 0);
    const base = role === "main" ? spec.main : spec.tb;
    const top = g.reached >= g.notches.length;
    // Decision 23: no thresholds. A distance's ruler shows the value against the reference it is measured to (the
    // target is to be on it); a size's ruler shows the value among its natural values (the primes), bigger to the right.
    let ruler = base.ruler;
    const layer = i === 0 ? rule.family.main : rule.family.tieBreakers.find(t => t.id === rule.tieBreaker)!;
    if (ruler && layer.sense === "min") ruler = { ...ruler, band: undefined, bandLabel: "target: on it" };
    // A size's ruler reads the measured quantity itself (the largest prime factor 29, not m = 290).
    const measured = parts[i]?.value;
    if (!ruler && layer.sense === "max" && measured && "n" in measured) ruler = sizeRuler(layer.title.replace(/^(the|that) /, ""), fmtQ(measured), /prime/.test(layer.title));
    const aim = layer.sense === "min" ? "the closer, the better" : "the bigger, the better";
    const anchors = Object.fromEntries(Object.entries(base.anchors).map(([v, a]) => [v, a && a.fx ? { ...a, fx: a.fx.filter(x => x.kind !== "yband" && x.kind !== "xband") } : a])) as Contributor["anchors"];
    return { ...base, anchors, ruler, aim, role, title: titles[i]!, gauge: g, top, next: nextOf(g) };
  });
  const mainTop = contributors[0]!.top;
  const combine = mainTop
    ? "The main part is exactly on target, so now only the tie-breaker can make this line rarer."
    : "The main part counts first; the tie-breaker decides between lines that are equally good on the main part.";
  const ms = withMoves ? moves(rule, state) : [];
  for (const mv of ms) mv.effect = effectOf(rule, state, mv.after);
  return {
    rule, state, annotation: a, level: a.level, top: a.top, bits: rarities[a.level] ?? 0, rarities, contributors,
    views: spec.views, primary: spec.primary, reads: [spec.primary, ...(rule.family.depends as ViewId[]).filter(v => v !== spec.primary && spec.views.includes(v))], combine, moves: ms, equation: equation(state),
  };
}

/** What a move does to each contributor, in the gauge's words: "● exactly · ◆ 23 → 29". */
function effectOf(rule: RuleRef<LineState, unknown>, before: LineState, after: LineState): string {
  const r0 = read(rule, before, false), r1 = read(rule, after, false);
  const out: string[] = [];
  r0.contributors.forEach((c0, i) => {
    const c1 = r1.contributors[i]!;
    if (c1.value === c0.value) return;
    const on = c1.role === "main" && c1.top && c1.gauge.sense === "min" ? " (on target)" : "";
    out.push(`${GLYPH[c0.role]} ${c0.name} ${c0.value} → ${c1.value}${on}`);
  });
  return out.join(" · ");
}

export const bitsText = (b: number) => `${fmtNum(b)} bits`;
export const chance = (b: number) => `${chanceText(b)} by chance`;
export { fn };
