/**
 * Lenses and their whole-number mutations (owner decisions of 17 November). A turn pins ONE lens: a list of whole
 * numbers that describes the line. Every parameter is a pair of whole numbers (top, bottom), kept in lowest terms with
 * the bottom ≥ 1, mutated separately: "You can't add 1/2 to 1/3 but you can first multiply the denominator by 3 and then
 * add 4 to the numerator." No lens is privileged; a lens that is undefined for the line cannot be pinned.
 *
 * A turn's price (v2-core surprise.ts): each mutation's naming bits, plus the surprise of the lens's numbers' overall
 * change, plus the bits that name the lens.
 */
import { argBits, universalBits, gcd, physicsOf, turnSurprise, type ArgCode, type Call, type Invalid, type Mutator, type Rng, type Variant } from "@workspace/v2-core";
import { inDomain, lineParams, normalise, type Line, type LineState } from "./line.ts";
import { cfGameLens, peLens } from "./fractal-lenses.ts";

export interface Lens {
  readonly id: string;
  readonly title: string;
  /** Names of the whole numbers, in order. Pair lenses list top then bottom of each parameter. */
  readonly numbers: readonly string[];
  /** The parameters as (top index, bottom index) pairs; empty for a lens of plain whole numbers. */
  readonly pairs: readonly (readonly [number, number])[];
  readonly paramNames: readonly string[];
  read(l: Line): bigint[] | Invalid;
  build(n: readonly bigint[], before: Line): Line | Invalid;
}

const reduce = (t: bigint, b: bigint): [bigint, bigint] => {
  const g = gcd(t, b);
  return g === 0n ? [t, b] : [t / g, b / g];
};
const frac = (t: bigint, b: bigint): [bigint, bigint] => (b < 0n ? reduce(-t, -b) : reduce(t, b));

/** ⌊√n⌋ exactly at any size (Newton's method; a float start alone is off by millions past 2^106). */
function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = n < 2n ** 52n ? BigInt(Math.floor(Math.sqrt(Number(n)))) + 1n : 1n << BigInt(Math.ceil(n.toString(2).length / 2));
  for (;;) { const y = (x + n / x) >> 1n; if (y >= x) break; x = y; }
  while (x * x > n) x--;
  while ((x + 1n) * (x + 1n) <= n) x++;
  return x;
}

export const lenses: readonly Lens[] = [
  {
    id: "mc", title: "gradient and y-intercept: y = (p/q)x + r/s", numbers: ["gradient top", "gradient bottom", "y-intercept top", "y-intercept bottom"],
    pairs: [[0, 1], [2, 3]], paramNames: ["gradient", "y-intercept"],
    read: l => l.b === 0n ? { invalid: "a vertical line has no gradient" } : [...frac(-l.a, l.b), ...frac(-l.c, l.b)],
    build: ([p, q, r, s]) => normalise(-p! * s!, q! * s!, -r! * q!),
  },
  {
    id: "xy", title: "x-intercept and y-intercept: x/X + y/Y = 1", numbers: ["x-intercept top", "x-intercept bottom", "y-intercept top", "y-intercept bottom"],
    pairs: [[0, 1], [2, 3]], paramNames: ["x-intercept", "y-intercept"],
    read: l => l.a === 0n || l.b === 0n || l.c === 0n ? { invalid: "this line does not cross both axes at two distinct points" } : [...frac(-l.c, l.a), ...frac(-l.c, l.b)],
    build: ([xt, xb, yt, yb]) => xt === 0n || yt === 0n ? { invalid: "an intercept of 0 does not fix a line in this lens" } : normalise(xb! * yt!, yb! * xt!, -xt! * yt!),
  },
  {
    id: "abc", title: "the equation ax + by + c = 0 (no common factor)", numbers: ["a", "b", "c"], pairs: [], paramNames: [],
    read: l => [l.a, l.b, l.c],
    build: ([a, b, c]) => normalise(a!, b!, c!),
  },
  {
    id: "mA", title: "gradient and the signed area of the triangle with the axes", numbers: ["gradient top", "gradient bottom", "area top", "area bottom"],
    pairs: [[0, 1], [2, 3]], paramNames: ["gradient", "area"],
    // area = X·Y/2 = c²/(2ab) for ax + by + c = 0
    read: l => l.a === 0n || l.b === 0n ? { invalid: "a level or vertical line makes no triangle with the axes" } : [...frac(-l.a, l.b), ...frac(l.c * l.c, 2n * l.a * l.b)],
    build: ([p, q, at, ab], before) => {
      if (p === 0n) return { invalid: "a level line makes no triangle with the axes" };
      // line −p·x + q·y + c = 0: area = c² / (2·(−p)·q), so c² = −2pq·area
      const num = -2n * p! * q! * at!, den = ab!;
      if (num < 0n) return { invalid: "that area has the wrong sign for this gradient" };
      const sn = isqrt(num * den), sd = den;
      if (sn * sn !== num * den) return { invalid: "no line with whole-number coefficients has that gradient and area" };
      // c = ±sn/sd, keeping the side of the origin the line was on
      const sign = before.c < 0n ? -1n : 1n;
      return normalise(-p! * sd, q! * sd, sign * sn);
    },
  },
  // The continued-fraction and prime-exponent lenses (fractal-lenses.ts; the owner, 17 Nov: "a fractal space of values
  // where there are multiple directions to go towards greater complexity").
  cfGameLens,
  {
    id: "pe", title: peLens.title, numbers: peLens.numbers, pairs: [], paramNames: [],
    read: l => peLens.read(l) ?? { invalid: "a vertical line has no gradient" },
    build: n => peLens.build(n) ?? { invalid: "an exponent stays 0 or more, a bottom 1 or more, and 0 has no exponents" },
  },
];
export const lensById = (id: string): Lens | undefined => lenses.find(l => l.id === id);
/** The lenses a newborn line is drawn in (the first four: a draw of the new lenses' many numbers would be a different law). */
const NEWBORN_LENSES = lenses.slice(0, 4);

/** Read a line's numbers in a lens, canonical (pairs in lowest terms, bottoms ≥ 1). */
export function readLens(lens: Lens, l: Line): bigint[] | Invalid {
  return lens.read(l);
}

// ---------------------------------------------------------------- the mutations

export type MoveKind = "add" | "mul" | "div" | "neg" | "swap" | "round";
export interface MoveArgs {
  readonly lens: string;
  /** The number (add, mul, div, neg) or the parameter (swap, round) it acts on. */
  readonly at: number;
  /** add: the amount; mul/div: the factor. */
  readonly k: bigint;
}

function mutate(kind: MoveKind, lens: Lens, n: bigint[], at: number, k: bigint): bigint[] | Invalid {
  const out = [...n];
  const onNumber = kind === "add" || kind === "mul" || kind === "div" || kind === "neg";
  if (onNumber && (at < 0 || at >= n.length)) return { invalid: `the ${lens.id} lens has numbers 1 to ${n.length}` };
  if (!onNumber && (at < 0 || at >= lens.pairs.length)) return { invalid: lens.pairs.length ? `the ${lens.id} lens has parameters 1 to ${lens.pairs.length}` : `the ${lens.id} lens has no fractions to ${kind}` };
  switch (kind) {
    case "add": out[at] = n[at]! + k; break;
    case "mul": if (k < 2n) return { invalid: "multiply by a whole number of 2 or more" }; out[at] = n[at]! * k; break;
    case "div":
      if (k < 2n) return { invalid: "divide by a whole number of 2 or more" };
      if (n[at]! % k !== 0n) return { invalid: `${n[at]} is not a multiple of ${k}` };
      out[at] = n[at]! / k; break;
    case "neg": out[at] = -n[at]!; break;
    case "swap": { const [t, b] = lens.pairs[at]!; out[t] = n[b]!; out[b] = n[t]!; break; }
    case "round": {
      const [t, b] = lens.pairs[at]!;
      const num = 2n * n[t]! + n[b]!, den = 2n * n[b]!; // floor(t/b + 1/2)
      out[t] = num >= 0n ? num / den : -((-num + den - 1n) / den);
      out[b] = 1n; break;
    }
  }
  for (const [t, b] of lens.pairs) {
    if (out[b]! === 0n) return { invalid: `the ${lens.paramNames[lens.pairs.findIndex(p => p[1] === b)]}'s bottom cannot be 0` };
    if (kind !== "swap" && out[b]! < 0n) return { invalid: "a bottom stays 1 or more (negate the top instead)" };
    [out[t], out[b]] = frac(out[t]!, out[b]!);
  }
  return out;
}

const KINDS: readonly { kind: MoveKind; title: string; hasK: boolean; signedK: boolean; onParam: boolean }[] = [
  { kind: "add", title: "add a whole number to one number", hasK: true, signedK: true, onParam: false },
  { kind: "mul", title: "multiply one number by a whole number", hasK: true, signedK: false, onParam: false },
  { kind: "div", title: "divide one number by a whole number (exactly)", hasK: true, signedK: false, onParam: false },
  { kind: "neg", title: "negate one number", hasK: false, signedK: false, onParam: false },
  { kind: "swap", title: "swap a parameter's top and bottom", hasK: false, signedK: false, onParam: true },
  { kind: "round", title: "round a parameter to a whole number", hasK: false, signedK: false, onParam: true },
];

function argCode(spec: (typeof KINDS)[number]): ArgCode<MoveArgs> {
  const count = (lensId: string) => { const l = lensById(lensId); return l ? (spec.onParam ? Math.max(1, l.pairs.length) : l.numbers.length) : 1; };
  return {
    bits: a => Math.log2(count(a.lens)) + (spec.hasK ? (spec.signedK ? argBits(a.k, true) : universalBits(a.k)) : 0),
    sample: (r: Rng) => {
      const lens = lenses[r.below(lenses.length)]!;
      const at = r.below(spec.onParam ? Math.max(1, lens.pairs.length) : lens.numbers.length);
      const mag = BigInt(1 + r.below(4));
      return { lens: lens.id, at, k: spec.kind === "add" ? (r.below(2) ? mag : -mag) : mag + 1n };
    },
    encode: a => ({ lens: a.lens, at: String(a.at + 1), ...(spec.hasK ? { k: String(a.k) } : {}) }),
    decode: (w: unknown) => {
      const o = (w ?? {}) as Record<string, unknown>;
      const lens = String(o.lens ?? "");
      if (!lensById(lens)) throw new Error(`lens must be one of ${lenses.map(l => l.id).join(", ")}`);
      const at = Number(o.at ?? 1) - 1;
      if (!Number.isInteger(at) || at < 0) throw new Error("at must be a whole number from 1");
      let k = 0n;
      if (spec.hasK) {
        const s = String(o.k ?? "");
        if (!/^-?\d+$/.test(s)) throw new Error("k must be a whole number");
        k = BigInt(s);
        if (!spec.signedK && k < 2n) throw new Error("the factor must be 2 or more");
        if (spec.kind === "add" && k === 0n) throw new Error("adding 0 changes nothing");
      }
      return { lens, at, k };
    },
  };
}

function lineAt(state: LineState, site: number): Line { return state.lines[site]!; }

export const lensMoves: readonly Mutator<LineState, MoveArgs>[] = KINDS.map(spec => ({
  id: spec.kind,
  reps: ["si", "gen", "cart", "tri"],
  title: spec.title,
  describe: (a: MoveArgs) => {
    const lens = lensById(a.lens);
    const what = spec.onParam ? lens?.paramNames[a.at] ?? `parameter ${a.at + 1}` : lens?.numbers[a.at] ?? `number ${a.at + 1}`;
    return spec.kind === "add" ? `add ${a.k} to the ${what} (${a.lens})` : spec.hasK ? `${spec.kind === "mul" ? "multiply" : "divide"} the ${what} by ${a.k} (${a.lens})` : `${spec.kind} the ${what} (${a.lens})`;
  },
  argHelp: () => ({
    lens: { label: "Which lens", hint: lenses.map(l => `${l.id}: ${l.title}`).join("; "), example: "mc", choices: Object.fromEntries(lenses.map(l => [l.id, l.title])) },
    at: { label: spec.onParam ? "Which parameter (1, 2)" : "Which number (1 = the first in the lens)", hint: "a whole number from 1", example: "1" },
    ...(spec.hasK ? { k: { label: spec.kind === "add" ? "How much to add" : "The factor", hint: spec.kind === "add" ? "a whole number, e.g. 3 or -2" : "a whole number of 2 or more", example: spec.kind === "add" ? "1" : "2" } } : {}),
  }),
  args: () => argCode(spec),
  perSite: true,
  apply(state: LineState, site: number, a: MoveArgs, variant: Variant) {
    const lens = lensById(a.lens);
    if (!lens) return { invalid: `no lens ${a.lens}` };
    const l = lineAt(state, site);
    const n = readLens(lens, l);
    if ("invalid" in n) return { invalid: `the ${lens.id} lens cannot be pinned: ${n.invalid}` };
    const m = mutate(spec.kind, lens, n, a.at, a.k);
    if ("invalid" in m) return m;
    const built = inDomain(lens.build(m, l), lineParams(variant));
    if ("invalid" in built) return built;

    return { lines: state.lines.map((x, i) => (i === site ? built : x)) };
  },
  inverse: { kind: "none", note: "turns are priced as a whole; there is no exact potential" },
}));

/** Bits that name the turn's lens. */
export const LENS_BITS = Math.log2(lenses.length);

/**
 * The turn's surprise in its pinned lens, plus the lens's naming bits. Every call of a turn must pin the same lens.
 * The numbers are every line's numbers in the lens (lines it cannot be read on are left out).
 */
export function lineTurnSurprise(before: LineState, after: LineState, calls: readonly Call[], variant: Variant): number | Invalid {
  const ids = new Set(calls.map(c => String(c.args.lens ?? "")));
  if (ids.size !== 1) return { invalid: "a turn pins one lens: every mutation must name the same lens" };
  const lens = lensById([...ids][0]!);
  if (!lens) return { invalid: "unknown lens" };
  const crossed = new Map<string, boolean>();
  // Replay to find additive changes that carried a number through zero.
  let s = before;
  for (const c of calls) {
    const mv = lensMoves.find(m => m.id === c.mutator);
    if (!mv) continue;
    let a: MoveArgs;
    try { a = mv.args(variant).decode(c.args); } catch { continue; }
    const n0 = readLens(lens, s.lines[c.site]!);
    const next = mv.apply(s, c.site, a, variant);
    if ("invalid" in next) break;
    const n1 = readLens(lens, next.lines[c.site]!);
    if (c.mutator === "add" && !("invalid" in n0) && !("invalid" in n1)) {
      const x0 = n0[a.at]!, x1 = n1[a.at]!;
      if ((x0 < 0n && x1 > 0n) || (x0 > 0n && x1 < 0n)) crossed.set(`${c.site}:${a.at}`, true);
    }
    s = next;
  }
  const b: bigint[] = [], af: bigint[] = [], cr: boolean[] = [];
  before.lines.forEach((l, i) => {
    const n0 = readLens(lens, l), n1 = readLens(lens, after.lines[i]!);
    if ("invalid" in n0 || "invalid" in n1) return;
    n0.forEach((x, j) => { b.push(x); af.push(n1[j]!); cr.push(crossed.get(`${i}:${j}`) ?? false); });
  });
  return turnSurprise(physicsOf(variant).gravity, b, af, cr) + LENS_BITS;
}

/**
 * A newborn line: a lens drawn at random, its whole numbers drawn so each extra bit of size is a fixed factor rarer
 * (bit length L ≥ 1 with P(L) ∝ 2^(−rate·L), the game's newbornBitRate; uniform within the length; tops get a random sign, bottoms are ≥ 1). Lenses
 * that cannot build a line from the draw are redrawn.
 */
export function newbornLine(r: Rng, variant: Variant): Line {
  // Each extra bit of length is 2^rate times rarer (the game's physics setting newbornBitRate).
  const more = 2 ** -physicsOf(variant).newbornBitRate;
  const draw = (): bigint => {
    let L = 1;
    while (L < 40 && r.unit() < more) L++;
    const lo = 2 ** (L - 1);
    return BigInt(lo + r.below(lo));
  };
  for (let tries = 0; tries < 200; tries++) {
    const lens = NEWBORN_LENSES[r.below(NEWBORN_LENSES.length)]!;
    const bottoms = new Set(lens.pairs.map(p => p[1]));
    const n = lens.numbers.map((_, i) => {
      const v = draw();
      return bottoms.has(i) ? v : (r.below(2) ? v : -v);
    });
    for (const [t, b] of lens.pairs) [n[t], n[b]] = frac(n[t]!, n[b]!);
    const l = inDomain(lens.build(n, { a: 0n, b: 1n, c: 1n }), lineParams(variant));
    if (!("invalid" in l)) return l;
  }
  return { a: -1n, b: 1n, c: -1n };
}
