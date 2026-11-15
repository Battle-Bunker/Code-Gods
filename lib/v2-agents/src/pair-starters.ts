/**
 * The shipped agents for pairs of lines (lib/v2-pair, docs/engine-v2/two-line-systems.md), on the grid's pattern
 * (grid-starters.ts): per dealt family and tie-breaker, an EXAMPLE and the SIMPLE, THOROUGH, BOLD and NAIVE starters,
 * in TypeScript and Python. An agent reads the pair once (`eqs`: a1·x + b1·y = e1 and a2·x + b2·y = e2), tries moves
 * in its own head with exact whole numbers and fractions (each move's result is the pair the engine would make, sorted,
 * equal lines refused), scores them as the engine does (test/pair.test.ts checks it on sampled pairs) and climbs for
 * points with `climb` (the line and grid starters' policy). Every program has exactly one "Try this:" comment.
 */
import type { RuleFamily } from "@workspace/v2-core";
import { pairPresets, pairType } from "@workspace/v2-pair";
import type { AgentKind, ShippedAgent, ShippedLanguage } from "./starters.ts";

const DEALT = new Set(pairPresets[0].rules.map(r => r.family));
const familyOf = (id: string): RuleFamily<unknown, unknown> => {
  const f = pairType.families.find(x => x.id === id);
  if (!f) throw new Error(`v2-pair has no family ${id}`);
  return f as RuleFamily<unknown, unknown>;
};

/** Is this a dealt pair family with shipped agents? */
export const isPairFamily = (id: string): boolean => DEALT.has(id) && !!PAIR_SCORES[id];
/** Is this a family of the pair type (described or not)? Such a family never falls through to the line catalogue. */
export const isPairTypeFamily = (id: string): boolean => pairType.families.some(f => f.id === id);

// ---------------------------------------------------------------- the exact library, in each language

/** Whole-number and fraction helpers, the canonical pair, and what the two equations give together. */
const LIB_TS = [
  "// Exact helpers. A line is [a, b, c] (whole numbers) for a·x + b·y + c = 0; a pair is two lines, sorted.",
  "const ab = x => (x < 0n ? -x : x);",
  "function gcd(x, y) { x = ab(x); y = ab(y); while (y) [x, y] = [y, x % y]; return x; }",
  "function line(a, b, c) {   // the line in its standard form, or null for no line",
  "  if (a === 0n && b === 0n) return null;",
  "  const g = gcd(gcd(a, b), c);",
  "  [a, b, c] = [a / g, b / g, c / g];",
  "  return b < 0n || (b === 0n && a < 0n) ? [-a, -b, -c] : [a, b, c];",
  "}",
  "function pair(L, M) {      // the pair sorted, or null when a line is missing or the two are the same",
  "  if (!L || !M) return null;",
  "  for (const i of [0, 1, 2]) if (L[i] !== M[i]) return L[i] < M[i] ? [L, M] : [M, L];",
  "  return null;",
  "}",
  "const q = (n, d) => Q.of(n, d);",
  "const floor = x => (x.n - ((x.n % x.d) + x.d) % x.d) / x.d;",
  "const nearest = x => floor(Q.add(x, q(1, 2)));   // the whole number nearest x (a half rounds up)",
  "const off = x => Q.abs(Q.sub(x, q(nearest(x))));   // how far x is from a whole number",
  "function spf(n) {          // the smallest prime factor (1 for 0 and ±1)",
  "  n = ab(n); if (n < 2n) return 1n; if (n % 2n === 0n) return 2n;",
  "  for (let d = 3n; d * d <= n && d <= 100000n; d += 2n) if (n % d === 0n) return d;",
  "  return n;",
  "}",
  "function omega(n) {        // how many prime factors, counting repeats",
  "  n = ab(n); if (n < 2n) return 0n; let k = 0n;",
  "  for (let d = 2n; d * d <= n && d <= 100000n; d += d === 2n ? 1n : 2n) while (n % d === 0n) { n /= d; k++; }",
  "  return n > 1n ? k + 1n : k;",
  "}",
  "const common = (x, y) => (x === 0n || y === 0n ? 0n : gcd(x, y));   // their greatest common factor (0 if either is 0)",
  "function facts(S) {        // what the two equations give together",
  "  const [[a1, b1, c1], [a2, b2, c2]] = S;",
  "  const D = a1 * b2 - a2 * b1, dot = a1 * a2 + b1 * b2, nx = b1 * c2 - b2 * c1, ny = c1 * a2 - c2 * a1;",
  "  const s = (b2 === 0n ? b1 !== 0n : b1 !== 0n && ab(a2) * b1 > ab(a1) * b2) ? 1 : 0;   // the steeper line",
  "  return { D, dot, nx, ny, s, o: 1 - s, x: D ? q(nx, D) : null, y: D ? q(ny, D) : null };",
  "}",
  "const yint = L => (L[1] === 0n ? null : q(-L[2], L[1]));",
  "const xint = L => (L[0] === 0n ? null : q(-L[2], L[0]));",
  "const ygap = S => (S[0][1] && S[1][1] ? Q.abs(Q.sub(yint(S[0]), yint(S[1]))) : null);",
];

const LIB_PY = [
  "# Exact helpers. A line is (a, b, c) (whole numbers) for a*x + b*y + c = 0; a pair is two lines, sorted.",
  "from fractions import Fraction as F",
  "from math import gcd",
  "",
  "",
  "def line(a, b, c):   # the line in its standard form, or None for no line",
  "    if a == 0 and b == 0:",
  "        return None",
  "    g = gcd(gcd(a, b), c)",
  "    a, b, c = a // g, b // g, c // g",
  "    return (-a, -b, -c) if b < 0 or (b == 0 and a < 0) else (a, b, c)",
  "",
  "",
  "def pair(L, M):   # the pair sorted, or None when a line is missing or the two are the same",
  "    if L is None or M is None or L == M:",
  "        return None",
  "    return (L, M) if L < M else (M, L)",
  "",
  "",
  "def nearest(x):   # the whole number nearest x (a half rounds up)",
  "    x = F(x)",
  "    return (2 * x.numerator + x.denominator) // (2 * x.denominator)",
  "",
  "",
  "def off(x):   # how far x is from a whole number",
  "    return abs(x - nearest(x))",
  "",
  "",
  "def spf(n):   # the smallest prime factor (1 for 0 and ±1)",
  "    n = abs(n)",
  "    if n < 2:",
  "        return 1",
  "    if n % 2 == 0:",
  "        return 2",
  "    d = 3",
  "    while d * d <= n and d <= 100000:",
  "        if n % d == 0:",
  "            return d",
  "        d += 2",
  "    return n",
  "",
  "",
  "def omega(n):   # how many prime factors, counting repeats",
  "    n, k, d = abs(n), 0, 2",
  "    if n < 2:",
  "        return 0",
  "    while d * d <= n and d <= 100000:",
  "        while n % d == 0:",
  "            n //= d",
  "            k += 1",
  "        d += 1 if d == 2 else 2",
  "    return k + 1 if n > 1 else k",
  "",
  "",
  "def common(x, y):   # their greatest common factor (0 if either is 0)",
  "    return 0 if x == 0 or y == 0 else gcd(x, y)",
  "",
  "",
  "def facts(S):   # what the two equations give together",
  "    (a1, b1, c1), (a2, b2, c2) = S",
  "    D, dot, nx, ny = a1 * b2 - a2 * b1, a1 * a2 + b1 * b2, b1 * c2 - b2 * c1, c1 * a2 - c2 * a1",
  "    s = 1 if (b1 != 0 if b2 == 0 else b1 != 0 and abs(a2) * b1 > abs(a1) * b2) else 0   # the steeper line",
  "    return {\"D\": D, \"dot\": dot, \"nx\": nx, \"ny\": ny, \"s\": s, \"o\": 1 - s, \"x\": F(nx, D) if D else None, \"y\": F(ny, D) if D else None}",
  "",
  "",
  "def yint(L):",
  "    return None if L[1] == 0 else F(-L[2], L[1])",
  "",
  "",
  "def xint(L):",
  "    return None if L[0] == 0 else F(-L[2], L[0])",
  "",
  "",
  "def ygap(S):",
  "    return abs(yint(S[0]) - yint(S[1])) if S[0][1] and S[1][1] else None",
];

// ---------------------------------------------------------------- each family's score, in each language

interface Score {
  /** Lines computing the score from the pair S and f = facts(S), returning [main, tie-breaker] or null; `tie` names it. */
  readonly ts: readonly string[];
  readonly py: readonly string[];
  readonly mainSays: string;
  /** The moves that suit this family best (the example's and Thorough's), besides shift and tilt. */
  readonly lenses: readonly LensId[];
}

/** score(S, tie): the main part and the dealt tie-breaker, bigger better, exactly as the engine (null: no score). */
export const PAIR_SCORES: Readonly<Record<string, Score>> = {
  "whole-answer": {
    mainSays: "how far the answer is from whole numbers (closer is better)", lenses: ["slide", "combine"],
    ts: [
      "if (!f.D) return null;                                // parallel lines never cross",
      "const main = Q.neg(Q.add(off(f.x), off(f.y)));",
      "const X = nearest(f.x), Y = nearest(f.y);",
      "return [main, tie === \"peg-divisor\" ? q(common(ab(X) + ab(Y), f.D)) : q(-(X + Y))];",
    ],
    py: [
      "if not f[\"D\"]:   # parallel lines never cross",
      "    return None",
      "main = -(off(f[\"x\"]) + off(f[\"y\"]))",
      "X, Y = nearest(f[\"x\"]), nearest(f[\"y\"])",
      "return [main, F(common(abs(X) + abs(Y), f[\"D\"])) if tie == \"peg-divisor\" else F(-(X + Y))]",
    ],
  },
  "no-fractions": {
    mainSays: "how far the number you divide by is from 1 (closer is better)", lenses: ["combine", "slide"],
    ts: [
      "if (!f.D) return null;",
      "const t = ab(nearest(f.x)) + ab(nearest(f.y)), L = S[f.s];",
      "if (tie === \"answer-prime\") return [q(1n - ab(f.D)), q(spf(t))];",
      "return [q(1n - ab(f.D)), q(L[1] === 0n ? 0n : common(t, ab(L[0]) / L[1]))];",
    ],
    py: [
      "if not f[\"D\"]:",
      "    return None",
      "t, L = abs(nearest(f[\"x\"])) + abs(nearest(f[\"y\"])), S[f[\"s\"]]",
      "if tie == \"answer-prime\":",
      "    return [F(1 - abs(f[\"D\"])), F(spf(t))]",
      "return [F(1 - abs(f[\"D\"])), F(0 if L[1] == 0 else common(t, abs(L[0]) // L[1]))]",
    ],
  },
  "right-angle": {
    mainSays: "how far from a right angle (closer is better)", lenses: ["quarter", "reflect"],
    ts: [
      "if (!f.D) return null;",
      "const main = Q.neg(q(ab(f.dot), ab(f.D))), c = yint(S[f.s]);",
      "if (tie === \"prime-divisor\") return [main, q(spf(f.D))];",
      "return [main, q(c === null ? 0n : common(f.D, nearest(c)))];",
    ],
    py: [
      "if not f[\"D\"]:",
      "    return None",
      "main, c = -F(abs(f[\"dot\"]), abs(f[\"D\"])), yint(S[f[\"s\"]])",
      "if tie == \"prime-divisor\":",
      "    return [main, F(spf(f[\"D\"]))]",
      "return [main, F(0 if c is None else common(f[\"D\"], nearest(c)))]",
    ],
  },
  "forty-five": {
    mainSays: "how far from 45 degrees (closer is better)", lenses: ["reflect", "quarter"],
    ts: [
      "if (!f.D) return null;",
      "const d = ab(f.D), t = ab(f.dot), main = Q.neg(q(ab(d - t), d + t)), g = ygap(S);",
      "if (tie === \"smooth-divisor\") return [main, q(omega(f.D))];",
      "return [main, g === null ? null : q(common(f.D, nearest(g)))];",
    ],
    py: [
      "if not f[\"D\"]:",
      "    return None",
      "d, t, g = abs(f[\"D\"]), abs(f[\"dot\"]), ygap(S)",
      "main = -F(abs(d - t), d + t)",
      "if tie == \"smooth-divisor\":",
      "    return [main, F(omega(f[\"D\"]))]",
      "return [main, None if g is None else F(common(f[\"D\"], nearest(g)))]",
    ],
  },
  "double-gap": {
    mainSays: "how far the y-axis gap is from a whole number twice the x-axis gap (closer is better)", lenses: ["slide", "combine"],
    ts: [
      "if (S.some(L => L[0] === 0n || L[1] === 0n || L[2] === 0n)) return null;   // every intercept, none at (0, 0)",
      "const g = ygap(S), x = Q.abs(Q.sub(xint(S[0]), xint(S[1])));",
      "const main = Q.neg(Q.add(Q.abs(Q.sub(g, Q.mul(2, x))), off(g)));",
      "return [main, q(tie === \"gap-prime\" ? spf(nearest(g)) : common(nearest(g), f.D))];",
    ],
    py: [
      "if any(L[0] == 0 or L[1] == 0 or L[2] == 0 for L in S):   # every intercept, none at (0, 0)",
      "    return None",
      "g, x = ygap(S), abs(xint(S[0]) - xint(S[1]))",
      "main = -(abs(g - 2 * x) + off(g))",
      "return [main, F(spf(nearest(g)) if tie == \"gap-prime\" else common(nearest(g), f[\"D\"]))]",
    ],
  },
  "far-crossing": {
    mainSays: "how far the steeper line's x-intercept is from a whole number (closer is better)", lenses: ["slide"],
    ts: [
      "const r = xint(S[f.s]);",
      "if (r === null) return null;                          // a flat steeper line never meets the x-axis",
      "return [Q.neg(off(r)), q(tie === \"far-right\" ? nearest(r) : spf(nearest(r)))];",
    ],
    py: [
      "r = xint(S[f[\"s\"]])",
      "if r is None:   # a flat steeper line never meets the x-axis",
      "    return None",
      "return [-off(r), F(nearest(r) if tie == \"far-right\" else spf(nearest(r)))]",
    ],
  },
  "high-start": {
    mainSays: "how far the steeper line's y-intercept is from a whole number (closer is better)", lenses: ["slide"],
    ts: [
      "const L = S[f.s];",
      "if (L[1] === 0n) return null;                          // an upright steeper line has no y-intercept",
      "const c = q(-L[2], L[1]), h = nearest(c), m = floor(q(-L[0], L[1]));",
      "if (tie === \"steep-and-high\") return [Q.neg(off(c)), q(h < m ? h : m)];",
      "return [Q.neg(off(c)), q(omega(h === 0n || f.D === 0n ? 0n : gcd(h, f.D)))];",
    ],
    py: [
      "L = S[f[\"s\"]]",
      "if L[1] == 0:   # an upright steeper line has no y-intercept",
      "    return None",
      "c = F(-L[2], L[1])",
      "h, m = nearest(c), -L[0] // L[1]   # the y-intercept's nearest whole number; the gradient rounded down",
      "if tie == \"steep-and-high\":",
      "    return [-off(c), F(min(h, m))]",
      "return [-off(c), F(omega(0 if h == 0 or f[\"D\"] == 0 else gcd(h, f[\"D\"])))]",
    ],
  },
  "steep-ratio": {
    mainSays: "how far one gradient is from a whole number of times the other (closer is better)", lenses: ["combine"],
    ts: [
      "const A = S[f.s], B = S[f.o];",
      "if (A[1] === 0n || B[1] === 0n || B[0] === 0n) return null;   // two gradients, the gentler not flat",
      "const r = q(A[0] * B[1], A[1] * B[0]);",
      "let k = nearest(r); if (k < 2n && k > -2n) k = r.n < 0n ? -2n : 2n;   // at least 2 times, either way",
      "const main = Q.neg(Q.abs(Q.sub(r, q(k)))), g = ygap(S);",
      "if (tie === \"ratio-prime\") return [main, q(spf(k))];",
      "return [main, g === null ? null : q(common(k, nearest(g)))];",
    ],
    py: [
      "A, B = S[f[\"s\"]], S[f[\"o\"]]",
      "if A[1] == 0 or B[1] == 0 or B[0] == 0:   # two gradients, the gentler not flat",
      "    return None",
      "r = F(A[0] * B[1], A[1] * B[0])",
      "k = nearest(r)",
      "if -2 < k < 2:   # at least 2 times, either way",
      "    k = -2 if r < 0 else 2",
      "main, g = -abs(r - k), ygap(S)",
      "if tie == \"ratio-prime\":",
      "    return [main, F(spf(k))]",
      "return [main, None if g is None else F(common(k, nearest(g)))]",
    ],
  },
};

// ---------------------------------------------------------------- moves the agent tries in its own head

/** Each lens adds [plan, pair after] tries for line i (0 or 1; j the other); `k` lenses go inside the loop over k. */
interface Lens { readonly comment: string; readonly k: boolean; readonly ts: string; readonly py: readonly string[] }
const LENSES = {
  shift: {
    comment: "move a line up or down", k: true,
    ts: "if (L[1]) tries.push([move(\"si.shift\", { line, k }), pair(line_(L[0], L[1], L[2] - K * L[1]), M)]);",
    py: ["if L[1]:", "    tries.append((move(\"si.shift\", line=n, k=k), pair(line(L[0], L[1], L[2] - k * L[1]), M)))"],
  },
  tilt: {
    comment: "make a line steeper or flatter", k: true,
    ts: "if (L[1]) tries.push([move(\"si.tilt\", { line, k }), pair(line_(L[0] - K * L[1], L[1], L[2]), M)]);",
    py: ["if L[1]:", "    tries.append((move(\"si.tilt\", line=n, k=k), pair(line(L[0] - k * L[1], L[1], L[2]), M)))"],
  },
  combine: {
    comment: "add k times the other equation to this one (the answer stays)", k: true,
    ts: "{ const a = L[0] + K * M[0], b = L[1] + K * M[1], c = L[2] + K * M[2]; if ((a || b) && gcd(gcd(a, b), c) === 1n) tries.push([move(\"pair.combine\", { line, k }), pair(line_(a, b, c), M)]); }",
    py: [
      "a, b, c = L[0] + k * M[0], L[1] + k * M[1], L[2] + k * M[2]",
      "if (a or b) and gcd(gcd(a, b), c) == 1:",
      "    tries.append((move(\"pair.combine\", line=n, k=k), pair(line(a, b, c), M)))",
    ],
  },
  slide: {
    comment: "slide a line so the crossing moves k steps along the other line", k: true,
    ts: "if (f.D) { const g = gcd(M[0], M[1]), dx = K * M[1] / g, dy = -K * M[0] / g; tries.push([move(\"pair.slide\", { line, k }), pair(line_(L[0], L[1], L[2] - L[0] * dx - L[1] * dy), M)]); }",
    py: [
      "if f[\"D\"]:",
      "    g = gcd(M[0], M[1])",
      "    dx, dy = k * M[1] // g, -k * M[0] // g",
      "    tries.append((move(\"pair.slide\", line=n, k=k), pair(line(L[0], L[1], L[2] - L[0] * dx - L[1] * dy), M)))",
    ],
  },
  reflect: {
    comment: "reflect a line in the other line (the answer stays)", k: false,
    ts: "{ const n2 = M[0] * M[0] + M[1] * M[1], d = L[0] * M[0] + L[1] * M[1]; tries.push([move(\"pair.reflect\", { line }), pair(line_(n2 * L[0] - 2n * d * M[0], n2 * L[1] - 2n * d * M[1], n2 * L[2] - 2n * d * M[2]), M)]); }",
    py: [
      "n2, d = M[0] * M[0] + M[1] * M[1], L[0] * M[0] + L[1] * M[1]",
      "tries.append((move(\"pair.reflect\", line=n), pair(line(n2 * L[0] - 2 * d * M[0], n2 * L[1] - 2 * d * M[1], n2 * L[2] - 2 * d * M[2]), M)))",
    ],
  },
  quarter: {
    comment: "turn a line a quarter turn about the crossing", k: false,
    ts: "if (f.D) tries.push([move(\"pair.quarter\", { line }), pair(line_(-L[1] * f.D, L[0] * f.D, L[1] * f.nx - L[0] * f.ny), M)]);",
    py: [
      "if f[\"D\"]:",
      "    tries.append((move(\"pair.quarter\", line=n), pair(line(-L[1] * f[\"D\"], L[0] * f[\"D\"], L[1] * f[\"nx\"] - L[0] * f[\"ny\"]), M)))",
    ],
  },
} satisfies Record<string, Lens>;
type LensId = keyof typeof LENSES;

type StarterKind = Exclude<AgentKind, "example">;
const KINDS: Record<StarterKind, { title: string; summary: string; tryThis: string; far: number; quotes: number }> = {
  simple: {
    title: "Simple", summary: "Shifts and tilts the two lines a little at a time, taking the change that raises your points most: good for your rule and for the other players too.",
    tryThis: "add the \"combine\" moves from the Thorough starter: adding one equation to the other keeps the answer where it is.", far: 1, quotes: 4,
  },
  thorough: {
    title: "Thorough", summary: "Like Simple, but it also uses the moves that use both lines (elimination, sliding along the other line, reflecting, quarter turns) and compares more prices.",
    tryThis: "change QUOTES = 6 to 2: fewer prices asked, but it may miss a cheaper plan.", far: 1, quotes: 6,
  },
  bold: {
    title: "Bold", summary: "Makes changes of 2 at a time, so it gets there in fewer moves, each twice the price of a single step.",
    tryThis: "change FAR = 2 to 1: single steps, the same price per step, but more turns to get there.", far: 2, quotes: 6,
  },
  naive: {
    title: "Naive (for learning)",
    summary: "Chases your rule on every pair, whatever it costs and whatever the others want. It is here to learn from: compare it with Simple.",
    tryThis: "summon it beside a friend's agent on the same pairs and watch your points: then switch to Simple.", far: 1, quotes: 8,
  },
};

const HOW_POINTS = [
  "What it does: reads the pair once (a small read), tries changes in its own head (thinking costs no energy, only",
  "time) and takes the change that raises your points most. Your points on a pair are your rarity there times the",
  "other players' rarity there added up, so a change that suits your rule but spoils the pair for the others can",
  "lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.",
];
const HOW_NAIVE = [
  "What it does: reads the pair once, tries changes in its own head, and pays for the best one for your rule on every",
  "pair it is offered, whatever it costs and whatever the other players think of it. It keeps fighting over a pair",
  "another player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn from;",
  "the other starters fix this.",
];

function lensesFor(kind: AgentKind, family: string): LensId[] {
  const own = PAIR_SCORES[family]!.lenses;
  const ids: LensId[] = kind === "simple" || kind === "naive" ? ["shift", "tilt"] : ["shift", "tilt", ...own, ...(kind === "thorough" ? (["combine", "slide", "reflect", "quarter"] as LensId[]) : [])];
  return [...new Set(ids)];
}

// ---------------------------------------------------------------- assembly

function scoreTs(family: string, tieBreaker: string): string[] {
  const s = PAIR_SCORES[family]!;
  return [
    ...LIB_TS,
    "",
    "// How good is the pair S for your rule? [main part, tie-breaker]: bigger is better, null is no score.",
    "function score(S, tie) {",
    "  const f = facts(S);",
    ...s.ts.map(l => `  ${l}`),
    `}   // main: ${s.mainSays}; tie-breaker: ${familyOf(family).tieBreakers.find(t => t.id === tieBreaker)!.title}`,
  ];
}
function scorePy(family: string, tieBreaker: string): string[] {
  const s = PAIR_SCORES[family]!;
  return [
    ...LIB_PY,
    "",
    "",
    "def score(S, tie):",
    `    # How good is the pair S for your rule? [main part, tie-breaker]: bigger is better, None is no score.`,
    `    # main: ${s.mainSays}; tie-breaker: ${familyOf(family).tieBreakers.find(t => t.id === tieBreaker)!.title}`,
    "    f = facts(S)",
    ...s.py.map(l => `    ${l}`),
  ];
}

function agentTs(kind: AgentKind, family: string, tieBreaker: string, far: number, quotes: number): string[] {
  const lenses = lensesFor(kind, family);
  const naive = kind === "naive";
  const out = [
    `const FAR = ${far};      // how far one change may go`,
    `const QUOTES = ${quotes};  // at most this many plans are priced (each price is a host call)`,
    `const TIE = ${JSON.stringify(tieBreaker)};   // your rule's tie-breaker`,
    ...(naive ? [] : [
      "const LEAVE = [];      // pairs you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them",
      "const PROTECT = [];    // pairs where you promised not to lower the others, e.g. [7]: only moves that keep them as well off",
    ]),
    "const line_ = line;    // (the moves below build lines with it)",
    "",
    "function agent(offer) {",
    ...(naive ? [] : [
      "  if (LEAVE.includes(offer.object)) return null;   // a deal: leave this pair alone",
      "  // A tug-of-war (another player taking back your gains on this pair, 3 times lately) burns energy on both",
      "  // sides: tell your owner, who can make a deal. (Leaving the pair instead gives it away: try it and compare.)",
      "  contested(offer, 3);",
    ]),
    "  const v = look(offer, \"eqs\");   // the two equations: a1·x + b1·y = e1 and a2·x + b2·y = e2",
    "  const S = [[v.a1.n, v.b1.n, -v.e1.n], [v.a2.n, v.b2.n, -v.e2.n]];   // as lines a·x + b·y + c = 0",
    "  const f = facts(S), tries = [];   // [plan, pair after]: changes tried in the agent's own head",
    "  for (const i of [0, 1]) {",
    "    const L = S[i], M = S[1 - i], line = String(i + 1);",
    "    for (let k = -FAR; k <= FAR; k++) {",
    kind === "bold" ? "      if (k * k < 4) continue;   // only steps of 2 (each costs two single steps)" : "      if (k === 0) continue;",
    "      const K = BigInt(k);",
  ];
  for (const id of lenses.filter(id => LENSES[id].k)) out.push(`      ${LENSES[id].ts}   // ${LENSES[id].comment}`);
  out.push("    }");
  for (const id of lenses.filter(id => !LENSES[id].k)) out.push(`    ${LENSES[id].ts}   // ${LENSES[id].comment}`);
  out.push(
    "  }",
    "  let options = tries.filter(([, S2]) => S2).map(([plan, S2]) => [plan, score(S2, TIE)]);   // each step and the score it reaches",
    ...(naive ? [
      "  let top = score(S, TIE), plans = [];",
      "  for (const [plan, s] of options) {",
      "    if (better(s, top)) { top = s; plans = [plan]; }               // a new best",
      "    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides",
      "  }",
      "  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip",
    ] : [
      "  // A promise: on these pairs, only steps that leave the other players at least as well off.",
      "  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));",
      "  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.",
      "  return climb(offer, options, score(S, TIE), QUOTES);",
    ]),
    "}",
  );
  return out;
}

function agentPy(kind: AgentKind, family: string, tieBreaker: string, far: number, quotes: number): string[] {
  const lenses = lensesFor(kind, family);
  const naive = kind === "naive";
  const out = [
    `FAR = ${far}      # how far one change may go`,
    `QUOTES = ${quotes}  # at most this many plans are priced (each price is a host call)`,
    `TIE = ${JSON.stringify(tieBreaker)}   # your rule's tie-breaker`,
    ...(naive ? [] : [
      "LEAVE = []      # pairs you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them",
      "PROTECT = []    # pairs where you promised not to lower the others, e.g. [7]: only moves that keep them as well off",
    ]),
    "",
    "",
    "def agent(offer):",
    ...(naive ? [] : [
      "    if offer.object in LEAVE:   # a deal: leave this pair alone",
      "        return None",
      "    # A tug-of-war (another player taking back your gains on this pair, 3 times lately) burns energy on both",
      "    # sides: tell your owner, who can make a deal. (Leaving the pair instead gives it away: try it and compare.)",
      "    contested(offer, 3)",
    ]),
    "    v = look(offer, \"eqs\")   # the two equations: a1*x + b1*y = e1 and a2*x + b2*y = e2",
    "    S = ((int(v[\"a1\"]), int(v[\"b1\"]), -int(v[\"e1\"])), (int(v[\"a2\"]), int(v[\"b2\"]), -int(v[\"e2\"])))   # as lines a*x + b*y + c = 0",
    "    f, tries = facts(S), []   # (plan, pair after): changes tried in the agent's own head",
    "    for i in (0, 1):",
    "        L, M, n = S[i], S[1 - i], str(i + 1)",
    "        for k in range(-FAR, FAR + 1):",
    ...(kind === "bold" ? ["            if k * k < 4:   # only steps of 2 (each costs two single steps)", "                continue"] : ["            if k == 0:", "                continue"]),
  ];
  for (const id of lenses.filter(id => LENSES[id].k)) { const l = LENSES[id]; out.push(`            # ${l.comment}`, ...l.py.map(x => `            ${x}`)); }
  for (const id of lenses.filter(id => !LENSES[id].k)) { const l = LENSES[id]; out.push(`        # ${l.comment}`, ...l.py.map(x => `        ${x}`)); }
  out.push(
    "    options = [(plan, score(S2, TIE)) for plan, S2 in tries if S2 is not None]   # each step and the score it reaches",
    ...(naive ? [
      "    top, plans = score(S, TIE), []",
      "    for plan, s in options:",
      "        if better(s, top):",
      "            top, plans = s, [plan]         # a new best",
      "        elif plans and not better(top, s):",
      "            plans.append(plan)             # as good as the best: the price decides",
      "    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip",
    ] : [
      "    # A promise: on these pairs, only steps that leave the other players at least as well off.",
      "    if offer.object in PROTECT:",
      "        options = [(plan, s) for plan, s in options if fair(offer, plan)]",
      "    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.",
      "    return climb(offer, options, score(S, TIE), QUOTES)",
    ]),
  );
  return out;
}

function render(kind: AgentKind, familyId: string, tieBreaker: string, language: ShippedLanguage): ShippedAgent {
  const f = familyOf(familyId), tb = f.tieBreakers.find(t => t.id === tieBreaker);
  if (!tb || !PAIR_SCORES[familyId]) throw new Error(`${familyId} has no tie-breaker ${tieBreaker} with shipped agents`);
  const meta = kind === "example"
    ? { title: `Example: ${tb.title}`, summary: `Gets the main part right, then works on the tie-breaker (${tb.title}).`, tryThis: "change FAR = 1 to 2: bigger steps, each the price of two.", far: 1, quotes: 8 }
    : KINDS[kind];
  const header = [`${f.title} · ${meta.title}`, `Main part: ${f.main.title}. Tie-breaker: ${tb.title}.`, ...(kind === "naive" ? HOW_NAIVE : HOW_POINTS), `Try this: ${meta.tryThis}`];
  const ts = language === "typescript", c = ts ? "//" : "#";
  const lines = [
    ...header.map(l => `${c} ${l}`),
    ...(ts ? [""] : ["", ""]),
    ...(ts ? scoreTs(familyId, tieBreaker) : scorePy(familyId, tieBreaker)),
    ...(ts ? [""] : ["", ""]),
    ...(ts ? agentTs(kind, familyId, tieBreaker, meta.far, meta.quotes) : agentPy(kind, familyId, tieBreaker, meta.far, meta.quotes)),
  ];
  return { family: familyId, kind, tieBreaker, language, title: meta.title, summary: meta.summary, source: lines.join("\n") + "\n" };
}

export function pairExampleFor(family: string, tieBreaker: string, language: ShippedLanguage): ShippedAgent | null {
  return isPairFamily(family) && familyOf(family).tieBreakers.some(t => t.id === tieBreaker) ? render("example", family, tieBreaker, language) : null;
}

/**
 * The starters for a pair family, written for the dealt tie-breaker (as on grids: a pair's score takes more code than
 * a line's). Without one, the family's first tie-breaker.
 */
export function pairStartersFor(family: string, language: ShippedLanguage, tieBreaker?: string | null): ShippedAgent[] {
  if (!isPairFamily(family)) return [];
  const f = familyOf(family);
  if (tieBreaker && !f.tieBreakers.some(t => t.id === tieBreaker)) throw new Error(`${family} has no tie-breaker ${tieBreaker} with shipped agents`);
  const tb = tieBreaker || f.tieBreakers[0]!.id;
  return (["simple", "thorough", "bold", "naive"] as const).map(k => render(k, family, tb, language));
}

export function pairShippedAgents(): ShippedAgent[] {
  return pairType.families.filter(f => isPairFamily(f.id)).flatMap(f => (["typescript", "python"] as const).flatMap(language =>
    f.tieBreakers.flatMap(t => [render("example", f.id, t.id, language), ...pairStartersFor(f.id, language, t.id)])));
}

/** Just the library and `score` of a pair agent, for the test that checks it against the engine. */
export function pairScoreSource(family: string, tieBreaker: string, language: ShippedLanguage): string {
  return (language === "typescript" ? scoreTs(family, tieBreaker) : scorePy(family, tieBreaker)).join("\n") + "\n";
}
