/**
 * Families written for the dynamic energy measure (the owner, 16 Nov; docs/engine-v2/energy.md): each is a utility u of
 * the line y = mx + c, the readings it `reads`, and its own search heuristics. No tables, levels or tie-breakers:
 * precision is the utility's job ("If utility were sqrt of size of nearest power of k minus distance to that power
 * cubed then it really pays to be closer to the target power").
 *
 * The pool pulls in different directions on shared anchors (CLAUDE.md, decision 30). On the y-intercept c: Multiples
 * (bigger) against Unit Fraction (smaller) and Fine Bottom (fractions). On the gradient m: Prime Hug (bigger)
 * against Prime Sliver (smaller) and Next-door Bottom (fractions). On the x-crossing −c/m: Crossing Sliver (towards 0)
 * against Square Triangle (the area |c·X|/2 big). On a, b, c: Stepping Coefficients (big, in steps) against everything
 * that wants a small or simple gradient or intercept. Circle Kiss ties c to m (c² = R²(1 + m²)) and wants fine tilts.
 *
 * Every utility is exact at any size (whole-number arithmetic; a float only for a size or a penalty).
 */
import { gcd, q, Qn, ref, rng, type DynamicRule, type ElementValue, type ParamSpace, type Q, type Rng, type RuleFamily } from "@workspace/v2-core";
import type { LineState } from "./line.ts";
import { drawSuffix, isSuffix } from "./numbers.ts";
import { fromMC } from "./line.ts";
import { lensById, lensMoves } from "./lens-routes.ts";

const num = (v: ElementValue): Q | null => (v.kind === "number" ? v.q : null);
const abs = Math.abs, log2 = Math.log2;

/**
 * The work meter of the rules' own searches (17 Nov: every estimate's work is bounded by the work budget, candidate
 * generation included). The line estimator fills it per start from that start's share of the budget (energy.ts); each
 * utility a search scores costs one unit (as many as the estimator charges for scoring a state of the start's size), and
 * once it is empty the utilities read worst (−∞) and `cut` is set, so a search keeps
 * what it found and stops paying. Outside an estimate it never runs dry.
 */
export const searchMeter = { left: Infinity, cut: false, unit: 1 };
/** One utility's worth of search work (`unit`: the estimator's size cost of the state, energy.ts): false (and the meter
 *  marked cut) once the meter is empty. */
export function searchTick(): boolean {
  if (searchMeter.left <= 0) { searchMeter.cut = true; return false; }
  searchMeter.left -= searchMeter.unit;
  return true;
}
/** A target for a start: new values for the readings it names (the rest stay the start's). */
export interface LineTarget { readonly m?: Q; readonly c?: Q }
export interface DynamicLineSpec<P> {
  readonly id: string;
  readonly title: string;
  /** The goal card, in a 12-year-old's words. */
  card(p: P): string;
  /** The main part's title, short. */
  readonly goal: string;
  /** The lens its energy's starts are drawn in (energy.ts lensOfReads): "m"/"c" gradient and y-intercept, "X" the x- and
   * y-intercepts, "gen" a, b and c, "area" the gradient and signed area. */
  readonly reads: readonly ("m" | "c" | "X" | "gen" | "area")[];
  /** The utility of y = mx + c; NaN is the worst. */
  u(m: Q, c: Q, p: P): number;
  /** The same utility from the line's own a, b, c (primitive, b > 0), for a rule that reads them: it skips the round
   *  trip through two fractions (four gcds an evaluation; 17 Nov, estimator time). */
  readonly uABC?: (a: bigint, b: bigint, c: bigint, p: P) => number;
  /** Work units per evaluation of u against an estimate's budget (1 by default; DynamicRule.cost). */
  readonly cost?: number;
  /** Where u is read, for the views' focus mark: a representation and its element. */
  readonly focus: readonly [rep: string, el: string];
  readonly space: ParamSpace<P>;
  readonly peers: readonly P[];
  /** Whether its good states include lines with a whole gradient and y-intercept (dealt on the whole-number boards). */
  readonly whole?: boolean;
  readonly searches: readonly { readonly id: string; propose(m: Q, c: Q, uStar: number, p: P, r: Rng): readonly LineTarget[] }[];
}

/** A line rule family from a dynamic spec: its evaluate records u as the main term; `dynamic` carries it to the estimator. */
export function dynamicLine<P>(s: DynamicLineSpec<P>): RuleFamily<LineState, P> {
  const mc = (st: LineState): [Q, Q] | null => {
    const l = st.lines[0]!;
    return l.b === 0n ? null : [q(-l.a, l.b), q(-l.c, l.b)];
  };
  const dynamic: DynamicRule<LineState, P> = {
    reads: s.reads, ...(s.cost ? { cost: s.cost } : {}),
    u: (st, p) => { const l = st.lines[0]!; if (s.uABC) return l.b === 0n ? NaN : s.uABC(l.a, l.b, l.c, p); const x = mc(st); return x ? s.u(x[0], x[1], p) : NaN; },
    // The rule's candidates (energy.ts): the targets its searches propose, each a line one turn away.
    candidates: (st, uStar, p) => {
      const x = mc(st), r = rng("line-candidates");   // fixed per call, so a seeded estimate repeats
      return x ? s.searches.flatMap(h => h.propose(x[0], x[1], uStar, p, r).map(t => ({ lines: [fromMC(t.m ?? x[0], t.c ?? x[1])] }))) : [];
    },
  };
  return {
    id: s.id, title: s.title, card: p => s.card(p), params: [],
    dealable: v => ((v.params as { domain?: string } | undefined)?.domain === "Z" && !s.whole ? [] : s.peers), depends: [...new Set(["si", s.focus[0]])],
    main: { id: "utility", title: s.goal, rep: s.focus[0], sense: "max", sentence: p => s.card(p) },
    tieBreakers: [], keepsParams: true, space: s.space, dynamic,
    evaluate(ctx, p) {
      const mRef = ref("si", "m"), cRef = ref("si", "c"), mv = num(ctx.read(mRef)), cv = num(ctx.read(cRef));
      const at = ref(s.focus[0], s.focus[1]);
      if (s.focus[0] !== "si") ctx.read(at);
      const u = mv === null || cv === null ? NaN : s.u(mv, cv, p);
      ctx.term("utility", s.goal, Number.isFinite(u) ? q(BigInt(Math.round(u * 1e6)), 1000000n) : { undefined: mv === null ? "a vertical line has no gradient" : "too far from anything this rule can reach" }, [at]);
      ctx.mark({ kind: "focus", ref: at });
    },
  };
}

// ------------------------------------------------------------------ number helpers

const intRange = (lo: number, hi: number, hint: string, peers: number[]): { space: ParamSpace<{ k: number }>; peers: { k: number }[] } => ({
  peers: peers.map(k => ({ k })),
  space: {
    size: hi - lo + 1, hint,
    draw: r => ({ k: lo + r.below(hi - lo + 1) }),
    parse(text) { const k = Number(text.trim().replace(/^k\s*=\s*/, "")); return Number.isInteger(k) && k >= lo && k <= hi ? { k } : { invalid: `a whole number from ${lo} to ${hi}` }; },
    label: p => String(p.k),
  },
});
const suffixSpace: ParamSpace<{ suffix: string }> = {
  size: 4 + 40 + 400, hint: "the prime's last digits: 1 to 3 digits ending in 1, 3, 7 or 9 (e.g. 13 or 007)",
  draw: r => ({ suffix: drawSuffix(r) }),
  parse(text) { const s = text.trim().replace(/^suffix\s*=\s*/, ""); return isSuffix(s) ? { suffix: s } : { invalid: "1 to 3 digits, the last one 1, 3, 7 or 9" }; },
  label: p => p.suffix,
};

// ------------------------------------------------------------------ 7–9: fine structure (owner, 17 Nov)
//
// "Rules in terms of the structure of rational numbers that grow in utility and energy in fine structure rather than
// magnitude." Each counts whole-number units of structure (digits, prime powers, continued-fraction terms), so a random
// start of the same size almost never qualifies, and each step deeper is rarer than the last.

const endSpace: ParamSpace<{ suffix: string }> = {
  size: 99, hint: "the digits the bottom should end in, repeated: 1 or 2 digits, not 0 alone (e.g. 3 or 25)",
  draw: r => ({ suffix: String(1 + r.below(99)) }),
  parse(text) { const s = text.trim(); return /^[0-9]{1,2}$/.test(s) && Number(s) > 0 ? { suffix: s } : { invalid: "1 or 2 digits, not 0" }; },
  label: p => p.suffix,
};
/** The suffix repeated to L digits, right-aligned ("25", 5 → "52525"). */
const repeated = (suffix: string, L: number): string => { let t = ""; while (t.length < L) t = suffix + t; return t.slice(t.length - L); };
/** How many of n's last decimal digits match the suffix repeated (counted from the right). */
export function matchedEnd(n: bigint, suffix: string): number {
  const ds = (n < 0n ? -n : n).toString(), want = repeated(suffix, ds.length);
  let k = 0;
  while (k < ds.length && ds[ds.length - 1 - k] === want[want.length - 1 - k]) k++;
  return k;
}
const babsQ = (x: bigint) => (x < 0n ? -x : x);
const log2Big = (n: bigint): number => { const L = n.toString(2).length; return L <= 52 ? log2(Number(n)) : log2(Number(n >> BigInt(L - 52))) + (L - 52); };
export const unitFraction = dynamicLine<{ suffix: string }>({
  id: "unit-fraction", title: "Unit Fraction", goal: "the y-intercept 1 over a whole number ending in the dealt digits, repeated", reads: ["c"], focus: ["si", "c"],
  space: endSpace, peers: [{ suffix: "3" }, { suffix: "25" }],
  card: ({ suffix }) => `Write the y-intercept as a fraction top/bottom in lowest terms. The top should be 1 (or −1): being d away costs d × d × d. The bottom's last digits should be ${suffix} repeated (…${repeated(suffix, 6)}): every last digit that matches, counting from the right until the first that does not, scores 1.`,
  u: (_m, c, { suffix }) => matchedEnd(c.d, suffix) - Number(babsQ(babsQ(c.n) - 1n) ** 3n),
  searches: [{ id: "end-in-the-pattern", propose: (_m, c, uStar, { suffix }) => {
    const need = Math.max(1, Math.ceil(uStar - 1e-9)), out: LineTarget[] = [], sign = c.n < 0n ? -1n : 1n;
    for (const L of [need, need + 1]) {
      const tail = BigInt(repeated(suffix, L)), mod = 10n ** BigInt(L), keep = (c.d / mod) * mod;
      for (const n of [keep + tail, tail, keep + mod + tail]) if (n > 0n) out.push({ c: q(sign, n) });
    }
    return out;
  } }],
});

/** The continued fraction of |x| (whole parts, at most 200). */
export function continuedFraction(x: Q): bigint[] {
  let n = babsQ(x.n), d = x.d;
  const out: bigint[] = [];
  while (d !== 0n) { out.push(n / d); [n, d] = [d, n % d]; }
  return out;
}
/** The value of the continued fraction [a0; a1, …]. */
export function fromContinued(as: readonly bigint[]): Q {
  let n = as[as.length - 1]!, d = 1n;
  for (let i = as.length - 2; i >= 0; i--) [n, d] = [as[i]! * n + d, n];
  return q(n, d);
}
/**
 * The single mutations of the given lenses (the climb's moves: small adds, small multiples, negate, swap, round) that
 * pass `ok`, cheapest naming first, at most `keep`. For a rule whose cheap routes go through a lens the estimator prices
 * but does not climb (the intercepts and area lenses; 17 Nov, estimator-accuracy.md).
 */
export function lensNeighbours(m: Q, c: Q, ids: readonly ("xy" | "mA" | "abc" | "mc")[], ok: (t: LineTarget) => boolean, keep: number): LineTarget[] {
  const line = fromMC(m, c), moves: { t: LineTarget; bits: number }[] = [];
  for (const id of ids) {
    const lens = lensById(id), ns = lens.numbers(line);
    if (!ns) continue;
    for (const mv of lensMoves(lens, line, ns)) {
      if (!searchTick()) break;   // building each move's line is work too (the area lens's most of all)
      if (mv.to.b === 0n) continue;
      const t = { m: q(-mv.to.a, mv.to.b), c: q(-mv.to.c, mv.to.b) };
      if (ok(t)) moves.push({ t, bits: mv.bits });
    }
  }
  return moves.sort((x, y) => x.bits - y.bits).slice(0, keep).map(x => x.t);
}
// ------------------------------------------------------------------ 10. Stepping Coefficients, on a, b, c

/** a, b, c of ax + by + c = 0 in lowest whole numbers, b > 0 (y = mx + c is −m·x + y − c = 0). */
function abcOf(m: Q, c: Q): [bigint, bigint, bigint] {
  const L = m.d * c.d / gcd(m.d, c.d), a = -m.n * (L / m.d), b = L, cc = -c.n * (L / c.d), g = gcd(gcd(a < 0n ? -a : a, b), cc < 0n ? -cc : cc);
  return [a / g, b / g, cc / g];
}
const babs = (x: bigint) => (x < 0n ? -x : x);
const stepU = (a: bigint, b: bigint, c: bigint, d: number) => {
  if (!searchTick()) return -Infinity;
  // Exact at any size: the size from the bigint, each step's miss as a bigint (a float of it only past 2^53, where the
  // penalty is already vast).
  const top = [a, b, c].reduce((t, x) => (babs(x) > t ? babs(x) : t), 0n), D = BigInt(d);
  if (top === 0n) return NaN;
  return log2Big(top) - 2 * (Number(babs(b - a - D)) + Number(babs(c - b - D)));
};
const stepSpace: ParamSpace<{ k: number }> = {
  size: 60, hint: "d, a whole number from −30 to 30, not 0",
  draw: r => { const k = 1 + r.below(30); return { k: r.bit() ? k : -k }; },
  parse(text) { const k = Number(text.trim().replace(/^d\s*=\s*/, "")); return Number.isInteger(k) && k !== 0 && abs(k) <= 30 ? { k } : { invalid: "a whole number from −30 to 30, not 0" }; },
  label: p => String(p.k),
};
export const steppingCoefficients = dynamicLine<{ k: number }>({
  id: "stepping-coefficients", title: "Stepping Coefficients", goal: "a, b, c going up in equal steps of d", reads: ["gen"], focus: ["gen", "b"],
  space: stepSpace, peers: [{ k: 3 }, { k: -5 }],
  card: ({ k }) => `Write the line as a·x + b·y + c = 0 with whole numbers that share no factor (b positive). The three numbers should go up in steps of ${k}: b = a + ${k} and c = b + ${k}. Bigger numbers score more (the binary digits of the biggest of a, b, c); every unit a step is off costs 2.`,
  u(m, c, { k }) { const [a, b, cc] = abcOf(m, c); return stepU(a, b, cc, k); },
  uABC: (a, b, c, { k }) => stepU(a, b, c, k),
  searches: [{ id: "big-enough-steps", propose: (m, c, uStar, { k }) => {
    // a, a + d, a + 2d with gcd(a, d) = 1 (so they share no factor) and b = a + d > 0, the biggest at least 2^u*.
    const [a0] = abcOf(m, c), K = BigInt(k), out: LineTarget[] = [];
    const need = BigInt(Math.ceil(2 ** Math.min(1000, Math.max(0, uStar)) - 1e-9)) + 2n * babs(K);
    for (const base of [babs(a0), need]) for (const sign of [1n, -1n]) {
      for (let a = sign * (base > 1n ? base : 1n), i = 0; i < 40 && out.length < 4; a += sign, i++) {
        const b = a + K, cc = b + K;
        if (b <= 0n || gcd(babs(a), babs(K)) !== 1n || stepU(a, b, cc, k) < uStar - 1e-9) continue;
        out.push({ m: q(-a, b), c: q(-cc, b) });
        break;
      }
    }
    return out;
  } }, { id: "repair-one", propose: (m, c, uStar, { k }) => {
    // One number put back in step (a = b − d, b = a + d or c − d, c = b + d), and every single mutation of the
    // intercepts and area lenses (a swap there reorders a, b, c: the routes a larger search found; 17 Nov).
    const [a, b, cc] = abcOf(m, c), K = BigInt(k), out: LineTarget[] = [];
    const ok = (x: bigint, y: bigint, z: bigint) => y > 0n && stepU(x, y, z, k) >= uStar - 1e-9;
    // With a's and c's signs kept or flipped (a negate is a cheap mutation), and each one-number repair of that.
    for (const sa of [1n, -1n]) for (const sc of [1n, -1n]) {
      const A = sa * a, C = sc * cc;
      for (const [x, y, z] of [[A, b, C], [b - K, b, C], [A, A + K, C], [A, C - K, C], [A, b, b + K]] as const) if ((x !== a || z !== cc || y !== b) && ok(x, y, z)) out.push({ m: q(-x, y), c: q(-z, y) });
    }
    return [...out, ...lensNeighbours(m, c, ["xy"], t => { const [x, y, z] = abcOf(t.m!, t.c!); return ok(x, y, z); }, 8)];
  } }],
});

// ------------------------------------------------------------------ 13. Prime Balance (fine structure), on c

const BALANCE_PRIMES = [2, 3, 5, 7, 11, 13];
const balanceSpace: ParamSpace<{ p: number; q: number }> = {
  size: 30, hint: "two different primes from 2, 3, 5, 7, 11, 13: p for the top, q for the bottom (e.g. 2 3)",
  draw: r => { const p = BALANCE_PRIMES[r.below(6)]!; let q = p; while (q === p) q = BALANCE_PRIMES[r.below(6)]!; return { p, q }; },
  parse(text) {
    const m = /^\s*(\d+)[\s,]+(\d+)\s*$/.exec(text), p = Number(m?.[1]), q = Number(m?.[2]);
    return m && BALANCE_PRIMES.includes(p) && BALANCE_PRIMES.includes(q) && p !== q ? { p, q } : { invalid: "two different primes from 2, 3, 5, 7, 11, 13" };
  },
  label: x => `${x.p} ${x.q}`,
};
/** How many times prime p divides n (n > 0), and what is left. */
function depth(n: bigint, p: number): [number, bigint] {
  const P = BigInt(p);
  let e = 0;
  while (n % P === 0n) { n /= P; e++; }
  return [e, n];
}
/** Twice the shallower depth, less the gap between the depths and the binary digits of what is left of top and bottom. */
export function primeBalanceU(c: Q, p: number, q: number): number {
  if (!searchTick()) return -Infinity;
  if (c.n === 0n) return NaN;
  const [ep, restT] = depth(babsQ(c.n), p), [eq, restB] = depth(c.d, q);
  return 2 * Math.min(ep, eq) - abs(ep - eq) - log2Big(restT) - log2Big(restB);
}
export const primeBalance = dynamicLine<{ p: number; q: number }>({
  id: "prime-balance", title: "Prime Balance", goal: "the y-intercept a power of p over the same power of q", reads: ["c"], focus: ["si", "c"],
  space: balanceSpace, peers: [{ p: 2, q: 3 }, { p: 5, q: 7 }],
  card: ({ p, q }) => `Write the y-intercept as a fraction top/bottom in lowest terms (ignore its sign). The top should be made of ${p}'s and the bottom of ${q}'s, the same number of each: ${p}/${q}, ${p * p}/${q * q}, ${p ** 3}/${q ** 3}, … Count the ${p}'s in the top and the ${q}'s in the bottom: you score twice the smaller count, lose 1 for each one the counts differ, and lose the binary digits of anything else left in the top or the bottom.`,
  u: (_m, c, { p, q }) => primeBalanceU(c, p, q),
  searches: [{ id: "balanced-powers", propose: (_m, c, uStar, { p, q: qq }) => {
    const need = Math.max(1, Math.ceil(uStar / 2 - 1e-9)), sign = c.n < 0n ? -1n : 1n;
    return [need, need + 1].map(e => ({ c: q(sign * BigInt(p) ** BigInt(e), BigInt(qq) ** BigInt(e)) }));
  } }],
});

// ------------------------------------------------------------------ 14. Recurrence Pair (fine structure), on m

/** The dealt recurrence x0 = 1, x1 = a, x(n+1) = a·x(n) + x(n−1), up to past `top`. */
function recurrence(a: number, top: bigint): bigint[] {
  const xs = [1n, BigInt(a)];
  while (xs[xs.length - 1]! <= top) xs.push(BigInt(a) * xs[xs.length - 1]! + xs[xs.length - 2]!);
  return xs;
}
/** The index n of the term nearest the gradient's bottom, less how far the bottom and the top are from x(n) and x(n+1). */
export function recurrenceU(m: Q, a: number): number {
  if (!searchTick()) return -Infinity;
  const t = babsQ(m.n), d = m.d, xs = recurrence(a, d * 2n + 2n);
  let n = 0;
  for (let i = 1; i < xs.length - 1; i++) if (babsQ(xs[i]! - d) < babsQ(xs[n]! - d)) n = i;
  return n - 2 * log2Big(1n + babsQ(d - xs[n]!)) - 2 * log2Big(1n + babsQ(t - xs[n + 1]!));
}
const recurrenceSpace: ParamSpace<{ k: number }> = {
  size: 6, hint: "a, a whole number from 1 to 6 (1: 1, 1, 2, 3, 5, 8, …; 2: 1, 2, 5, 12, 29, …)",
  draw: r => ({ k: 1 + r.below(6) }),
  parse(text) { const k = Number(text.trim().replace(/^a\s*=\s*/, "")); return Number.isInteger(k) && k >= 1 && k <= 6 ? { k } : { invalid: "a whole number from 1 to 6" }; },
  label: p => String(p.k),
};
export const recurrencePair = dynamicLine<{ k: number }>({
  id: "recurrence-pair", title: "Recurrence Pair", goal: "the gradient's top and bottom two neighbours in the dealt sequence", reads: ["m"], focus: ["si", "m"],
  space: recurrenceSpace, peers: [{ k: 1 }, { k: 2 }],
  card: ({ k }) => { const xs = recurrence(k, 10n ** 6n).slice(0, 7).join(", "); return `Make a list: start with 1 and ${k}, and each next number is ${k} times the last one plus the one before (${xs}, …). Write the gradient as a fraction top/bottom in lowest terms (ignore its sign): the bottom should be a number in the list and the top the next one. You score the bottom's place in the list (1 for ${k}, 2 for the next, …) and lose twice the binary digits of how far the bottom and the top are from those two numbers.`; },
  u: (m, _c, { k }) => recurrenceU(m, k),
  searches: [{ id: "neighbours", propose: (m, _c, uStar, { k }) => {
    const need = Math.max(1, Math.ceil(uStar - 1e-9)), sign = m.n < 0n ? -1n : 1n, out: LineTarget[] = [];
    let xs = [1n, BigInt(k)];
    while (xs.length < need + 3) xs = [...xs, BigInt(k) * xs[xs.length - 1]! + xs[xs.length - 2]!];
    for (const n of [need, need + 1]) out.push({ m: q(sign * xs[n + 1]!, xs[n]!) });
    return out;
  } }],
});

