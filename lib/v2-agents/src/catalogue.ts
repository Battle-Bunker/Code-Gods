/**
 * The one description the shipped agents are generated from (starters.ts): for every rule family, how an agent
 * scores a line y = mx + c itself (its main part and each tie-breaker, in both languages), and which moves can
 * improve each tie-breaker without spoiling the main part. Everything else (reading, trying moves in the agent's own
 * head, pricing the best and making the cheapest) is the same skeleton for every family.
 *
 * Scores mirror lib/v2-linear's families exactly (the starters test checks every one against the engine's evaluation
 * on sampled lines). Lines are read as y = mx + c, so these agents are for the whole-number and fraction boards of
 * one line per object, where every line has a gradient.
 */

/** A way to change the line, as the agent predicts it: the move and where it takes m and c. */
export interface Lens {
  readonly comment: string;
  readonly ts: string;
  readonly py: string;
  /** Lines to put before the move inside the loop over k (both languages), if the move needs a value of its own. */
  readonly pre?: { readonly ts: string; readonly py: string };
  /** The families whose rule parameters the move uses (the move is only offered to them). */
  readonly only?: readonly string[];
  /** A condition (both languages) under which the move is tried; it is skipped otherwise (the engine would refuse it). */
  readonly when?: { readonly ts: string; readonly py: string };
}

export const LENSES = {
  shift: { comment: "move the line up or down", ts: `[move("si.shift", { k }), m, Q.add(c, k)]`, py: `(move("si.shift", k=k), m, c + k)` },
  tilt: { comment: "make it steeper or flatter", ts: `[move("si.tilt", { k }), Q.add(m, k), c]`, py: `(move("si.tilt", k=k), m + k, c)` },
  step: { comment: "change the pattern's step, keeping y(1)", ts: `[move("seq.step", { k }), Q.add(m, k), Q.sub(c, k)]`, py: `(move("seq.step", k=k), m + k, c - k)` },
  turnAtMinusOne: {
    comment: "turn the line about its point at x = -1 (m and c both change by k)",
    ts: `[move("cart.pivot", { x0: -1, k }), Q.add(m, k), Q.add(c, k)]`, py: `(move("cart.pivot", x0=-1, k=k), m + k, c + k)`,
  },
  turnAtK: {
    comment: "turn the line about its point at x = k of the rule (y(k) stays put)",
    ts: `[move("cart.pivot", { x0: p.k, k }), Q.add(m, k), Q.sub(c, Q.mul(k, p.k))]`, py: `(move("cart.pivot", x0=p["k"], k=k), m + k, c - k * p["k"])`,
    only: ["crossing-check", "treasure"],
  },
  stretch: {
    comment: "multiply every output by f (m and c both)",
    pre: { ts: "const f = k > 0 ? k + 1 : k - 1;", py: "f = k + 1 if k > 0 else k - 1" },
    ts: `[move("mach.stretch", { f }), Q.mul(m, f), Q.mul(c, f)]`, py: `(move("mach.stretch", f=f), m * f, c * f)`,
  },
  // The beginner lenses (coordinator's call 23, 15 Nov): offered only where they serve the main part, so the other
  // families' Thorough starters keep their QUOTES for their own moves.
  zoom: {
    comment: "zoom from the origin by f: the y-intercept times f, the same gradient",
    // The same factor as the stretch's (one line in the loop when both are tried).
    pre: { ts: "const f = k > 0 ? k + 1 : k - 1;", py: "f = k + 1 if k > 0 else k - 1" },
    when: { ts: "!Q.isZero(c)", py: "c != 0" },   // through the origin a zoom changes nothing
    ts: `[move("basis.zoom", { f }), m, Q.mul(c, f)]`, py: `(move("basis.zoom", f=f), m, c * f)`,
    // Offered to no family while basis.zoom is out of line-q (a straight hill on Prime Landing, 15 Nov); it returns to
    // Smooth Intercept and Divisibility Ladder with the zoom.
    only: [],
  },
  turn: {
    comment: "turn the line about its y-intercept by the angle of a gradient k (the y-intercept stays put)",
    pre: { ts: "const den = Q.sub(1, Q.mul(m, k));", py: "den = 1 - m * k" },
    when: { ts: "!Q.isZero(den)", py: "den != 0" },   // a turn that would stand the line upright is refused
    ts: `[move("rot.turn", { centre: 0, turn: k }), Q.div(Q.add(m, k), den), c]`, py: `(move("rot.turn", centre=0, turn=k), (m + k) / den, c)`,
    only: ["prime-gradient", "same-on-both-rulers"],
  },
} satisfies Record<string, Lens>;
export type LensId = keyof typeof LENSES;

/** Code lines, in each language: compute values from m, c and the rule's numbers p. */
export interface Lines { readonly ts: readonly string[]; readonly py: readonly string[] }

export interface TieBreakerEntry {
  /** Lines to compute first (they may return null/None: no score). */
  readonly pre?: Lines;
  /** The tie-breaker's part of the score: one expression in each language, using the main part's values. */
  readonly ts: string;
  readonly py: string;
  /** In plain words, for the comment beside it. */
  readonly says: string;
  /** The moves that can raise this tie-breaker while the main part stays at its best. */
  readonly lenses: readonly LensId[];
  /** How far one change may go (k from 1 to steps, both ways). */
  readonly steps: number;
  /** The example's one "Try this:" change. */
  readonly tryThis: string;
}

export interface FamilyEntry {
  readonly family: string;
  /** Lines computing `main` (and the values the tie-breakers use); they may return null/None: no score. */
  readonly main: Lines;
  readonly mainSays: string;
  readonly tieBreakers: Readonly<Record<string, TieBreakerEntry>>;
  /** The Simple starter's moves (default: shift and tilt). */
  readonly simple?: readonly LensId[];
  /** The Thorough starter's moves (default: every lens offered to the family), where they would not fit the starting energy. */
  readonly thorough?: readonly LensId[];
  /** The score is written for whole-number lines only (line-z: y = mx + c with whole m and c). */
  readonly wholeLines?: boolean;
  /**
   * How the rule reads a vertical line x = c: lines computing `main` from `c` (the vertical line is x = c) (and the values the defined tie-breakers
   * use); `defined` lists the tie-breakers that still mean something there (the rest are undefined: the worst).
   * Without it, a vertical line scores nothing and a starter only tips it.
   */
  readonly vertical?: { readonly main: Lines; readonly defined?: readonly string[] };
  /**
   * A ladder with no top (design-principles.md 1 and 2): lines that add the step to the next rung up to `tries`, one
   * jump through the valley between rungs, priced by its size. Every starter but the naive one takes them.
   */
  readonly rungs?: Lines;
}

const neg = (ts: string) => `Q.neg(${ts})`;

/**
 * Same on Both Rulers' palindromes (the starters' copy of lib/v2-linear beginner-rulers.ts nearestPalindrome): the
 * palindromes starting and ending in p.d near y, of y's length and one digit either side; the nearest is among them.
 */
const PALS_TS = [
  "const pals = y => {   // the palindromes starting and ending in p.d nearest y: below and above it at its length, and one digit either side",
  "  const d = BigInt(p.d), w = Q.cmp(y, 0) <= 0 ? \"0\" : String(whole(Q.sub(y, Q.div(1, 2)))), L = w.length;   // w: y rounded down",
  "  const pal = (h, n) => { const t = String(h); return BigInt(t + t.slice(0, n >> 1).split(\"\").reverse().join(\"\")); };   // n digits from the first (n + 1)/2, h",
  "  const lo = n => d * 10n ** BigInt((n - 1) >> 1), hi = n => lo(n) + 10n ** BigInt((n - 1) >> 1) - 1n, h0 = BigInt(w.slice(0, (L + 1) >> 1));",
  "  const out = [pal(lo(L + 1), L + 1), ...[h0 - 1n, h0, h0 + 1n].map(h => pal(h < lo(L) ? lo(L) : h > hi(L) ? hi(L) : h, L))];",
  "  if (L > 1) out.push(pal(hi(L - 1), L - 1));",
  "  return out;",
  "};",
];
const PALS_PY = [
  "def pals(y):   # the palindromes starting and ending in p[\"d\"] nearest y: below and above it at its length, and one digit either side",
  "    w = str(0 if y <= 0 else whole(y - Fraction(1, 2)))   # y rounded down",
  "    L, d = len(w), p[\"d\"]",
  "    pal = lambda h, n: int(str(h) + str(h)[:n // 2][::-1])   # n digits from the first (n + 1) // 2, h",
  "    lo = lambda n: d * 10 ** ((n - 1) // 2)",
  "    hi = lambda n: lo(n) + 10 ** ((n - 1) // 2) - 1",
  "    h0 = int(w[:(L + 1) // 2])",
  "    out = [pal(lo(L + 1), L + 1)] + [pal(min(max(h, lo(L)), hi(L)), L) for h in (h0 - 1, h0, h0 + 1)]",
  "    return out + ([pal(hi(L - 1), L - 1)] if L > 1 else [])",
];
const PAL_SCORE_TS = [
  "const level = r => { const D = r.toString().length; let L = 0; while (((L + 1) * (L + 2)) / 2 <= D) L++; return Q.add(L, Q.div(Q.add(D - (L * (L + 1)) / 2, Q.div(Q.of(r), Q.of(10n ** BigInt(D)))), L + 1)); };   // levels of digits: level L needs L(L + 1)/2",
  ...PALS_TS,
  "const rungOf = y => {   // the nearest (the smaller on a tie): the nearest at or below y, or the nearest above",
  "  const w = Q.cmp(y, 0) <= 0 ? -1n : BigInt(whole(Q.sub(y, Q.div(1, 2)))), ps = pals(y);   // whole numbers at or below y are those at or below w",
  "  let a = null, b = null; for (const t of ps) { if (t <= w) { if (a === null || t > a) a = t; } else if (b === null || t < b) b = t; }",
  "  return a === null || Q.cmp(Q.sub(Q.of(b), y), Q.sub(y, Q.of(a))) < 0 ? b : a;",
  "};",
  "const onRung = (y, r) => (BigInt(whole(y)) === r ? level(r) : Q.neg(Q.sub(Q.abs(Q.sub(y, Q.of(r))), Q.div(1, 2))));   // on the rung when y rounds to it, else how far from rounding to it",
];
const PAL_SCORE_PY = [
  "level = lambda r: (lambda D, L: L + (D - L * (L + 1) // 2 + Fraction(r, 10 ** D)) / (L + 1))(len(str(r)), next(L for L in range(99) if (L + 1) * (L + 2) // 2 > len(str(r))))   # levels of digits: level L needs L(L + 1)/2",
  ...PALS_PY,
  "rung_of = lambda y: min(pals(y), key=lambda t: (abs(y - t), t))   # the nearest (the smaller on a tie)",
  "on_rung = lambda y, r: level(r) if whole(y) == r else -(abs(y - r) - Fraction(1, 2))   # on the rung when y rounds to it",
];

export const CATALOGUE: readonly FamilyEntry[] = [
  {
    family: "prime-gradient",
    simple: ["shift", "tilt", "turn"],
    rungs: {
      ts: [
        "// The next rung up (the ladder has no top): the next prime ending in p.ends above the gradient, by a tilt.",
        "{ const s = p.side ?? 1, x = Q.mul(s, m);",
        "  for (let t = Q.add(near(x, prime, p.ends) ?? p.ends, 10), i = 0; i < 100; t = Q.add(t, 10), i++) if (prime(t)) { tries.push([move(\"si.tilt\", { k: Q.sub(Q.mul(s, t), m) }), Q.mul(s, t), c]); break; } }",
      ],
      py: [
        "# The next rung up (the ladder has no top): the next prime ending in p[\"ends\"] above the gradient, by a tilt.",
        "s = p.get(\"side\", 1)",
        "t = (near(s * m, prime, p[\"ends\"]) or p[\"ends\"]) + 10",
        "for _ in range(100):",
        "    if prime(t):",
        "        tries.append((move(\"si.tilt\", k=s * t - m), s * t, c))",
        "        break",
        "    t += 10",
      ],
    },
    mainSays: "the prime ending in the rule's digit the gradient rounds to, in levels of digits (bigger is better: a ladder with no top), else minus how far it is from rounding to one",
    main: {
      ts: [
        "const level = r => { const D = Q.toString(r).length; let L = 0; while (((L + 1) * (L + 2)) / 2 <= D) L++; return Q.add(L, Q.div(Q.add(D - (L * (L + 1)) / 2, Q.div(r, Q.of(10n ** BigInt(D)))), L + 1)); };   // levels of digits: level L needs L(L + 1)/2",
        "const s = p.side ?? 1, x = Q.mul(s, m);          // the gradient, or minus it on the mirror",
        "const rung = near(x, prime, p.ends);             // the prime ending in p.ends nearest: the rung",
        "if (rung === null) return null;                 // none within 10,000: hopeless",
        "const gap = Q.abs(Q.sub(x, rung));               // on the rung when it rounds there (within 1/2, ties up)",
        "const main = Q.cmp(Q.mul(2, gap), 1) < 0 || Q.eq(Q.sub(rung, x), Q.div(1, 2)) ? level(rung) : Q.neg(Q.sub(gap, Q.div(1, 2)));",
      ],
      py: [
        "level = lambda r: (lambda D, L: L + (D - L * (L + 1) // 2 + Fraction(r, 10 ** D)) / (L + 1))(len(str(r)), next(L for L in range(99) if (L + 1) * (L + 2) // 2 > len(str(r))))   # levels of digits: level L needs L(L + 1)/2",
        "s = p.get(\"side\", 1)",
        "x = s * m                                       # the gradient, or minus it on the mirror",
        "rung = near(x, prime, p[\"ends\"])                # the prime ending in p[\"ends\"] nearest: the rung",
        "if rung is None:                                # none within 10,000: hopeless",
        "    return None",
        "gap = abs(x - rung)                             # on the rung when it rounds there (within 1/2, ties up)",
        "main = level(rung) if 2 * gap < 1 or rung - x == Fraction(1, 2) else -(gap - Fraction(1, 2))",
      ],
    },
    tieBreakers: {
      "shared-factor": {
        pre: { ts: ["const wc = whole(Q.sub(Q.abs(c), Q.div(1, 2)));   // the y-intercept's whole part, ignoring sign"], py: ["wc = whole(abs(c) - Fraction(1, 2))           # the y-intercept's whole part, ignoring sign"] },
        ts: "common(Q.add(rung, 1), wc)", py: "common(rung + 1, wc)", says: "take the number just after that prime: a bigger number dividing both it and the y-intercept's whole part is better",
        lenses: ["shift", "tilt"], steps: 3, tryThis: "remove the \"tilt\" line: moving the line up and down never changes the gradient, only the factor.",
      },
    },
  },
  {
    family: "triangle-area",
    simple: ["shift", "tilt", "turnAtMinusOne"],   // from y = 0 only a turn makes a triangle
    mainSays: "how far the triangle's area is from A (closer is better)",
    main: {
      ts: [
        "if (Q.isZero(m) || Q.isZero(c)) return null;    // no triangle: the worst score",
        "const legX = Q.abs(Q.div(c, m)), legY = Q.abs(c); // the triangle's base and height",
        "const area = Q.div(Q.mul(legX, legY), 2);",
        `const main = ${neg("Q.abs(Q.sub(area, p.A))")};`,
      ],
      py: [
        "if m == 0 or c == 0:                            # no triangle: the worst score",
        "    return None",
        "legX, legY = abs(c / m), abs(c)                 # the triangle's base and height",
        "area = legX * legY / 2",
        "main = -abs(area - p[\"A\"])",
      ],
    },
    tieBreakers: {
      legs: {
        ts: "-(legX.d + legY.d - 2n)", py: "-(legX.denominator + legY.denominator - 2)", says: "legs that are whole numbers are best",
        lenses: ["shift", "tilt", "turnAtMinusOne"], steps: 3, tryThis: "add the \"stretch\" lens from the Thorough starter and see if it finds whole legs sooner.",
      },
      even: {
        ts: neg("Q.abs(Q.sub(legX, legY))"), py: "-abs(legX - legY)", says: "legs of equal length are best",
        lenses: ["shift", "tilt", "turnAtMinusOne"], steps: 3, tryThis: "change FAR = 3 to 2: smaller changes cost less, but does it still get there?",
      },
    },
  },
  {
    family: "m-meets-c",
    mainSays: "how far apart the gradient and the y-intercept are (closer is better)",
    main: { ts: [`const main = ${neg("Q.abs(Q.sub(m, c))")};`], py: ["main = -abs(m - c)"] },
    tieBreakers: {
      size: {
        ts: "Q.abs(c)", py: "abs(c)", says: "a bigger y-intercept is better",
        lenses: ["shift", "tilt", "turnAtMinusOne", "stretch"], steps: 3, tryThis: "remove the \"stretch\" line: can turning alone make them meet at a big number?",
      },
      meetPrime: {
        pre: { ts: ["const cp = near(c, prime);", "if (cp === null) return null;"], py: ["cp = near(c, prime)", "if cp is None:", "    return None"] },
        ts: neg("Q.abs(Q.sub(c, cp))"), py: "-abs(c - cp)", says: "meeting at a prime is best",
        lenses: ["shift", "tilt", "turnAtMinusOne"], steps: 3, tryThis: "change FAR = 3 to 2: shorter steps cost less (a step of n costs more than n steps of 1); does it still climb?",
      },
    },
  },
  {
    family: "crossing-check",
    mainSays: "how far apart y(k) and x(q) are (closer is better)",
    main: {
      ts: [
        "if (Q.isZero(m)) return null;                   // a flat line never reaches height q",
        "const y = Q.add(Q.mul(m, p.k), c);              // y(k): the height at x = k",
        "const x = Q.div(Q.sub(p.q, c), m);              // x(q): where the line reaches height q",
        `const main = ${neg("Q.abs(Q.sub(y, x))")};`,
      ],
      py: [
        "if m == 0:                                      # a flat line never reaches height q",
        "    return None",
        "y = m * p[\"k\"] + c                              # y(k): the height at x = k",
        "x = (p[\"q\"] - c) / m                            # x(q): where the line reaches height q",
        "main = -abs(y - x)",
      ],
    },
    tieBreakers: {
      size: {
        ts: "Q.abs(x)", py: "abs(x)", says: "a bigger x(q) is better",
        lenses: ["shift", "tilt", "turnAtK"], steps: 3, tryThis: "remove the \"turn\" line and see whether it still finds bigger crossings.",
      },
      whole: {
        ts: "-(x.d - 1n)", py: "-(x.denominator - 1)", says: "x(q) a whole number is best",
        lenses: ["shift", "tilt", "turnAtK"], steps: 3, tryThis: "change FAR = 3 to 2 to make every move cheaper.",
      },
    },
  },
  {
    family: "whole-intercept",
    mainSays: "how far the y-intercept is from a whole number (closer is better)",
    main: {
      ts: [
        "const up = whole(c);                            // the whole number nearest the y-intercept (a half rounds up)",
        "const spf = k => (Q.isZero(k) ? 2 : (factors(k)[0] ?? 1));   // smallest prime factor: 2 for 0, 1 for 1 and -1",
        "const half = Q.eq(Q.sub(up, c), Q.of(1, 2));   // exactly halfway between two whole numbers?",
        "const n = half && spf(Q.sub(up, 1)) > spf(up) ? Q.sub(up, 1) : up;   // halfway: the one with the bigger smallest prime factor",
        `const main = ${neg("Q.abs(Q.sub(c, n))")};`,
        "const f = factors(n);                           // its prime factors, smallest first",
      ],
      py: [
        "up = whole(c)                                   # the whole number nearest the y-intercept (a half rounds up)",
        "spf = lambda k: 2 if k == 0 else (factors(k) or [1])[0]   # smallest prime factor: 2 for 0, 1 for 1 and -1",
        "half = up - c == Fraction(1, 2)                 # exactly halfway between two whole numbers?",
        "n = up - 1 if half and spf(up - 1) > spf(up) else up   # halfway: the one with the bigger smallest prime factor",
        "main = -abs(c - n)",
        "f = factors(n)                                  # its prime factors, smallest first",
      ],
    },
    tieBreakers: {
      spf: {
        ts: "spf(n)", py: "spf(n)", says: "a bigger smallest prime factor is better (a big prime is best)",
        lenses: ["shift"], steps: 3, tryThis: "change FAR = 3 to 2 and see how often it gets stuck.",
      },
      omega: {
        ts: "f.length", py: "len(f)", says: "more prime factors are better",
        lenses: ["shift", "stretch"], steps: 3, tryThis: "remove the \"stretch\" line: is adding as good as multiplying here?",
      },
    },
  },
  {
    family: "square-area",
    simple: ["shift", "tilt", "turnAtMinusOne"],
    mainSays: "how far the triangle's area is from a square number (closer is better)",
    main: {
      ts: [
        "if (Q.isZero(m) || Q.isZero(c)) return null;    // no triangle: the worst score",
        "const area = Q.div(Q.mul(c, c), Q.mul(2, Q.abs(m)));",
        "const sq = near(area, square);                  // the square number nearest the area",
        "if (sq === null) return null;                   // none within 10,000: hopeless",
        `const main = ${neg("Q.abs(Q.sub(area, sq))")};`,
        "const f = factors(root(sq));                    // the prime factors of that square's root",
      ],
      py: [
        "if m == 0 or c == 0:                            # no triangle: the worst score",
        "    return None",
        "area = c * c / (2 * abs(m))",
        "sq = near(area, square)                         # the square number nearest the area",
        "if sq is None:                                  # none within 10,000: hopeless",
        "    return None",
        "main = -abs(area - sq)",
        "f = factors(root(sq))                           # the prime factors of that square's root",
      ],
    },
    tieBreakers: {
      omega: {
        ts: "f.length", py: "len(f)", says: "more prime factors in the root are better",
        lenses: ["shift", "tilt", "turnAtMinusOne", "stretch"], steps: 3, tryThis: "change FAR = 3 to 2: shorter steps cost less; does it still reach bigger squares?",
      },
      lpf: {
        ts: "f.at(-1) ?? 1", py: "f[-1] if f else 1", says: "a root whose largest prime factor is big is better",
        lenses: ["shift", "tilt", "turnAtMinusOne"], steps: 3, tryThis: "add the \"stretch\" lens from the Thorough starter.",
      },
      spf: {
        ts: "f[0] ?? 1", py: "f[0] if f else 1", says: "a root whose smallest prime factor is big is better",
        lenses: ["shift", "tilt", "turnAtMinusOne"], steps: 3, tryThis: "add the \"stretch\" lens from the Thorough starter.",
      },
    },
  },
  // ---------------------------------------------------------------- the beginner pool (v2-linear beginner.ts)
  {
    family: "prime-staircase",
    thorough: ["shift", "tilt", "step", "turnAtMinusOne"],   // all of them would not fit the starting energy beside these tie-breakers
    rungs: {
      ts: [
        "// The next rung up (the run has no top): steps that are a multiple of 10 (every term keeps its last digit), and the",
        "// next prime ending in p.ends above the start; each one jump, priced by its size.",
        "for (let j = -3; j <= 3; j++) { const m2 = Q.mul(10, Q.add(whole(Q.div(m, 10)), j)); if (!Q.eq(m2, m)) tries.push([move(\"si.tilt\", { k: Q.sub(m2, m) }), m2, c]); }",
        "for (let t = Q.add(near(c, prime, p.ends), 10), i = 0; i < 100; t = Q.add(t, 10), i++) if (prime(t)) { tries.push([move(\"si.shift\", { k: Q.sub(t, c) }), m, t]); break; }",
      ],
      py: [
        "# The next rung up (the run has no top): steps that are a multiple of 10 (every term keeps its last digit), and the",
        "# next prime ending in p[\"ends\"] above the start; each one jump, priced by its size.",
        "for j in range(-3, 4):",
        "    m2 = 10 * (whole(m / 10) + j)",
        "    if m2 != m:",
        "        tries.append((move(\"si.tilt\", k=m2 - m), m2, c))",
        "t = near(c, prime, p[\"ends\"]) + 10",
        "for _ in range(100):",
        "    if prime(t):",
        "        tries.append((move(\"si.shift\", k=t - c), m, t))",
        "        break",
        "    t += 10",
      ],
    },
    mainSays: "how many different primes ending in the rule's digit the pattern y(0), y(1), ... starts with (more is better: a ladder with no top), plus a little for the term that breaks the run being near such a prime",
    main: {
      ts: [
        "const run = [];                                 // the different primes ending in p.ends it starts with",
        "let t = c;                                      // ends as the first term that breaks the run",
        "for (let n = 0; n < 256; n++) {                 // y(0), y(1), ...",
        "  t = Q.add(Q.mul(m, n), c);",
        "  if (Q.eq(t, near(t, prime, p.ends)) && !run.some(r => Q.eq(r, t))) run.push(t); else break;",
        "}",
        "const miss = Q.abs(t);                          // the breaking term, ignoring its sign",
        "const d = Q.abs(Q.sub(miss, near(miss, prime, p.ends)));",
        "const main = Q.add(run.length, Q.div(1, Q.add(2, d)));   // a longer run always wins; a near miss beats a far one",
      ],
      py: [
        "run, t = [], c                                  # run: the different primes ending in p[\"ends\"] it starts with",
        "for n in range(256):                            # y(0), y(1), ...",
        "    t = m * n + c",
        "    if t == near(t, prime, p[\"ends\"]) and t not in run:",
        "        run.append(t)",
        "    else:",
        "        break                                   # t is the first term that breaks the run",
        "miss = abs(t)                                   # ignoring its sign",
        "d = abs(miss - near(miss, prime, p[\"ends\"]))",
        "main = len(run) + Fraction(1) / (2 + d)        # a longer run always wins; a near miss beats a far one",
      ],
    },
    tieBreakers: {
      "shared-factor": {
        ts: "run.length >= 2 ? common(Q.sub(run.at(-1), 1), Q.sub(run[0], 1)) : 0", py: "common(run[-1] - 1, run[0] - 1) if len(run) >= 2 else 0",
        says: "the run's last prime minus 1 sharing a bigger factor with its first prime minus 1 is better (it starts again when the run grows)",
        lenses: ["shift", "tilt", "step"], steps: 3, tryThis: "remove the \"tilt\" line: can moving alone change the factor without breaking the run?",
      },
      "step-back": {
        pre: { ts: ["const back = Q.abs(Q.sub(c, m));               // y(-1), ignoring its sign"], py: ["back = abs(c - m)                          # y(-1), ignoring its sign"] },
        ts: neg("Q.abs(Q.sub(back, near(back, prime, p.ends)))"), py: "-abs(back - near(back, prime, p[\"ends\"]))", says: "y(-1) (ignoring sign) close to such a prime is better",
        lenses: ["shift", "tilt", "step"], steps: 3, tryThis: "remove the \"tilt\" line: does changing the step alone reach a prime one term back?",
      },
    },
  },
  {
    family: "treasure",
    simple: ["shift", "tilt"],
    rungs: {
      ts: [
        "// The next pile up (the ladder has no top): the coin pile just above y(k), by a shift or by a tilt.",
        "{ const s = p.side ?? 1, yk = Q.add(Q.mul(m, p.k), c), w = Q.mul(s, yk);",
        "  const h = Q.cmp(w, 1) < 0 ? 0 : whole(Q.sub(Q.div(Q.sub(root(Q.add(Q.mul(8, whole(w)), 1)), 1), 2), Q.div(1, 2)));   // the biggest pile's height up to y(k)",
        "  const d = Q.sub(Q.mul(s, Q.div(Q.mul(Q.add(h, 1), Q.add(h, 2)), 2)), yk);   // how far y(k) must move to the next pile",
        "  tries.push([move(\"si.shift\", { k: d }), m, Q.add(c, d)], [move(\"si.tilt\", { k: Q.div(d, p.k) }), Q.add(m, Q.div(d, p.k)), c]); }",
      ],
      py: [
        "# The next pile up (the ladder has no top): the coin pile just above y(k), by a shift or by a tilt.",
        "s = p.get(\"side\", 1)",
        "yk = m * p[\"k\"] + c",
        "h = 0 if s * yk < 1 else (root(8 * whole(s * yk) + 1) - 1) // 2   # the biggest pile's height up to y(k)",
        "d = s * Fraction((h + 1) * (h + 2), 2) - yk      # how far y(k) must move to the next pile",
        "tries.append((move(\"si.shift\", k=d), m, c + d))",
        "tries.append((move(\"si.tilt\", k=d / p[\"k\"]), m + d / p[\"k\"], c))",
      ],
    },
    mainSays: "the coin pile (1, 3, 6, 10, ...) y(k) rounds to, in levels of digits (bigger is better: a ladder with no top), else minus how far it is from rounding to one",
    main: {
      ts: [
        "const level = r => { const D = Q.toString(r).length; let L = 0; while (((L + 1) * (L + 2)) / 2 <= D) L++; return Q.add(L, Q.div(Q.add(D - (L * (L + 1)) / 2, Q.div(r, Q.of(10n ** BigInt(D)))), L + 1)); };   // levels of digits: level L needs L(L + 1)/2",
        "const s = p.side ?? 1, y = Q.mul(s, Q.add(Q.mul(m, p.k), c));   // y(k) = m·k + c, or minus it on the mirror",
        "const T = h => Q.div(Q.mul(h, Q.add(h, 1)), 2);   // the coin pile h coins high: h(h + 1)/2",
        "const hf = Q.cmp(y, 1) < 0 ? 1 : whole(Q.sub(Q.div(Q.sub(root(Q.add(Q.mul(8, whole(Q.sub(y, Q.div(1, 2)))), 1)), 1), 2), Q.div(1, 2)));   // the biggest pile's height up to y(k)",
        "const lo = T(hf), hi = T(Q.add(hf, 1)), up = Q.cmp(Q.sub(hi, y), Q.sub(y, lo)) < 0;",
        "const rung = up ? hi : lo, height = up ? Q.add(hf, 1) : hf;   // the coin pile nearest y(k) (the smaller on a tie): the rung",
        "const gap = Q.abs(Q.sub(y, rung));               // on the rung when it rounds there (within 1/2, ties up)",
        "const main = Q.cmp(Q.mul(2, gap), 1) < 0 || Q.eq(Q.sub(rung, y), Q.div(1, 2)) ? level(rung) : Q.neg(Q.sub(gap, Q.div(1, 2)));",
      ],
      py: [
        "level = lambda r: (lambda D, L: L + (D - L * (L + 1) // 2 + Fraction(r, 10 ** D)) / (L + 1))(len(str(r)), next(L for L in range(99) if (L + 1) * (L + 2) // 2 > len(str(r))))   # levels of digits: level L needs L(L + 1)/2",
        "s = p.get(\"side\", 1)",
        "y = s * (m * p[\"k\"] + c)                         # y(k) = m*k + c, or minus it on the mirror",
        "T = lambda h: h * (h + 1) // 2                   # the coin pile h coins high: h(h + 1)/2",
        "hf = 1 if y < 1 else (root(8 * whole(y - Fraction(1, 2)) + 1) - 1) // 2   # the biggest pile's height up to y(k)",
        "lo, hi = T(hf), T(hf + 1)",
        "rung, height = (hi, hf + 1) if hi - y < y - lo else (lo, hf)   # the coin pile nearest y(k) (the smaller on a tie): the rung",
        "gap = abs(y - rung)                              # on the rung when it rounds there (within 1/2, ties up)",
        "main = level(rung) if 2 * gap < 1 or rung - y == Fraction(1, 2) else -(gap - Fraction(1, 2))",
      ],
    },
    tieBreakers: {
      "shared-factor": {
        pre: { ts: ["const wm = whole(Q.sub(Q.abs(m), Q.div(1, 2)));   // the whole part of the gradient's size"], py: ["wm = whole(abs(m) - Fraction(1, 2))             # the whole part of the gradient's size"] },
        ts: "common(height, wm)", py: "common(height, wm)", says: "the pile is n coins high: a bigger number dividing both n and the gradient's whole part is better",
        lenses: ["tilt", "shift"], steps: 3, tryThis: "remove the \"shift\" line: a tilt changes the gradient and y(k) together; can it still find a pile?",
      },
    },
  },
  {
    family: "prime-landing",
    rungs: {
      ts: [
        "// Rungs (the ladder has no top): the nearest prime ending in p.ends, if the line does not round there yet, and",
        "// the next one beyond it. For each, the simplest gradient that lands there keeping c, and the simplest",
        "// y-intercept that lands there keeping m: anywhere that rounds to the rung will do.",
        "if (!Q.isZero(m) && !Q.isZero(c)) {",
        "  const s = p.side ?? 1, x = Q.mul(s, Q.neg(Q.div(c, m))), here = near(x, prime, p.ends);",
        "  let next = null;",
        "  for (let t = Q.add(here, 10), i = 0; i < 100 && next === null; t = Q.add(t, 10), i++) if (prime(t)) next = t;",
        "  for (const r of [here, next]) {",
        "    if (r === null) continue;",
        "    const a = Q.mul(s, Q.sub(r, Q.of(49, 100))), b = Q.mul(s, Q.add(r, Q.of(49, 100)));   // landings that round to r",
        "    const m2 = simplest(Q.neg(Q.div(c, a)), Q.neg(Q.div(c, b))), c2 = simplest(Q.neg(Q.mul(m, a)), Q.neg(Q.mul(m, b)));",
        "    if (!Q.eq(m2, m)) tries.push([move(\"si.tilt\", { k: Q.sub(m2, m) }), m2, c]);",
        "    if (!Q.eq(c2, c)) tries.push([move(\"si.shift\", { k: Q.sub(c2, c) }), m, c2]);",
        "  }",
        "}",
      ],
      py: [
        "# Rungs (the ladder has no top): the nearest prime ending in p[\"ends\"], if the line does not round there yet, and",
        "# the next one beyond it. For each, the simplest gradient that lands there keeping c, and the simplest",
        "# y-intercept that lands there keeping m: anywhere that rounds to the rung will do.",
        "if m != 0 and c != 0:",
        "    s = p.get(\"side\", 1)",
        "    here = near(s * (-c / m), prime, p[\"ends\"])",
        "    t, nxt = here + 10, None",
        "    for _ in range(100):",
        "        if prime(t):",
        "            nxt = t",
        "            break",
        "        t += 10",
        "    for r in (here, nxt):",
        "        if r is None:",
        "            continue",
        "        a, b = s * (r - Fraction(49, 100)), s * (r + Fraction(49, 100))   # landings that round to r",
        "        m2, c2 = simplest(-c / a, -c / b), simplest(-m * a, -m * b)",
        "        if m2 != m:",
        "            tries.append((move(\"si.tilt\", k=m2 - m), m2, c))",
        "        if c2 != c:",
        "            tries.append((move(\"si.shift\", k=c2 - c), m, c2))",
      ],
    },
    mainSays: "the prime ending in the rule's digit that where the line lands on the x-axis rounds to (bigger is better: a ladder with no top), else minus how far it is from rounding to one",
    main: {
      ts: [
        "const level = p => { const D = Q.toString(p).length; let L = 0; while (((L + 1) * (L + 2)) / 2 <= D) L++; return Q.add(L, Q.div(Q.add(D - (L * (L + 1)) / 2, Q.div(p, Q.of(10n ** BigInt(D)))), L + 1)); };   // levels of digits: level L needs L(L + 1)/2",
        "if (Q.isZero(m)) return null;                   // a flat line never lands: the worst score",
        "const x = Q.mul(p.side ?? 1, Q.neg(Q.div(c, m)));   // where y = mx + c lands on the x-axis (minus that, on the mirror)",
        "const landing = near(x, prime, p.ends);         // the prime ending in p.ends nearest there: the rung",
        "const gap = Q.abs(Q.sub(x, landing));            // on the rung when it rounds there (within 1/2, ties up)",
        "const main = Q.cmp(Q.mul(2, gap), 1) < 0 || Q.eq(Q.sub(landing, x), Q.div(1, 2)) ? level(landing) : Q.neg(Q.sub(gap, Q.div(1, 2)));",
      ],
      py: [
        "level = lambda p: (lambda D, L: L + (D - L * (L + 1) // 2 + Fraction(p, 10 ** D)) / (L + 1))(len(str(p)), next(L for L in range(99) if (L + 1) * (L + 2) // 2 > len(str(p))))   # levels of digits: level L needs L(L + 1)/2",
        "if m == 0:                                      # a flat line never lands: the worst score",
        "    return None",
        "x = p.get(\"side\", 1) * (-c / m)                # where y = mx + c lands on the x-axis (minus that, on the mirror)",
        "landing = near(x, prime, p[\"ends\"])             # the prime ending in p[\"ends\"] nearest there: the rung",
        "gap = abs(x - landing)                          # on the rung when it rounds there (within 1/2, ties up)",
        "main = level(landing) if 2 * gap < 1 or landing - x == Fraction(1, 2) else -(gap - Fraction(1, 2))",
      ],
    },
    vertical: {
      main: {
        ts: [
          "const level = p => { const D = Q.toString(p).length; let L = 0; while (((L + 1) * (L + 2)) / 2 <= D) L++; return Q.add(L, Q.div(Q.add(D - (L * (L + 1)) / 2, Q.div(p, Q.of(10n ** BigInt(D)))), L + 1)); };   // levels of digits: level L needs L(L + 1)/2",
          "const x = Q.mul(p.side ?? 1, c);                // it stands on the x-axis at x = c (minus that, on the mirror)",
          "const landing = near(x, prime, p.ends);         // the rung nearest there",
          "const gap = Q.abs(Q.sub(x, landing));",
          "const main = Q.cmp(Q.mul(2, gap), 1) < 0 || Q.eq(Q.sub(landing, x), Q.div(1, 2)) ? level(landing) : Q.neg(Q.sub(gap, Q.div(1, 2)));",
        ],
        py: [
          "level = lambda p: (lambda D, L: L + (D - L * (L + 1) // 2 + Fraction(p, 10 ** D)) / (L + 1))(len(str(p)), next(L for L in range(99) if (L + 1) * (L + 2) // 2 > len(str(p))))   # levels of digits: level L needs L(L + 1)/2",
          "x = p.get(\"side\", 1) * c                      # it stands on the x-axis at x = c (minus that, on the mirror)",
          "landing = near(x, prime, p[\"ends\"])             # the rung nearest there",
          "gap = abs(x - landing)",
          "main = level(landing) if 2 * gap < 1 or landing - x == Fraction(1, 2) else -(gap - Fraction(1, 2))",
        ],
      },
    },
    tieBreakers: {
      "shared-factor": {
        pre: { ts: ["const wc = whole(Q.div(Q.sub(Q.mul(2, c), 1), 2));   // the y-intercept's whole part (rounded down)"], py: ["wc = whole((2 * c - 1) / 2)                # the y-intercept's whole part (rounded down)"] },
        ts: "common(Q.sub(landing, 1), wc)", py: "common(landing - 1, wc)", says: "take the number just before that prime: a bigger number dividing both it and the y-intercept's whole part is better",
        lenses: ["shift", "tilt"], steps: 3, tryThis: "change FAR = 3 to 2: a shift by a whole number moves the landing by c's change over the gradient.",
      },
    },
  },
  {
    family: "same-on-both-rulers",
    simple: ["shift", "tilt", "turn"],
    thorough: ["shift", "tilt", "step", "turn"],
    rungs: {
      ts: [
        "// The next palindrome up (the ladder has no top): the smallest one above the unchanged number, by a shift or by a tilt.",
        "if (!Q.eq(m, 1)) {",
        ...PALS_TS.map(l => `  ${l}`),
        "  const s = p.side ?? 1, y = Q.mul(s, Q.div(c, Q.sub(1, m)));   // the unchanged number (minus it on the mirror)",
        "  const up = pals(y).filter(t => Q.cmp(Q.of(t), y) > 0).reduce((a, b) => (b < a ? b : a)), to = Q.mul(s, Q.of(up));",
        "  tries.push([move(\"si.shift\", { k: Q.sub(Q.mul(to, Q.sub(1, m)), c) }), m, Q.mul(to, Q.sub(1, m))]);   // keep m, move c",
        "  if (!Q.isZero(c)) tries.push([move(\"si.tilt\", { k: Q.sub(Q.sub(1, Q.div(c, to)), m) }), Q.sub(1, Q.div(c, to)), c]);   // keep c, move m",
        "}",
      ],
      py: [
        "# The next palindrome up (the ladder has no top): the smallest one above the unchanged number, by a shift or by a tilt.",
        "if m != 1:",
        ...PALS_PY.map(l => `    ${l}`),
        "    s = p.get(\"side\", 1)",
        "    y = s * c / (1 - m)                          # the unchanged number (minus it on the mirror)",
        "    to = s * min(t for t in pals(y) if t > y)",
        "    tries.append((move(\"si.shift\", k=to * (1 - m) - c), m, to * (1 - m)))   # keep m, move c",
        "    if c != 0:",
        "        tries.append((move(\"si.tilt\", k=1 - c / to - m), 1 - c / to, c))   # keep c, move m",
      ],
    },
    mainSays: "the palindrome starting and ending in d (d, dd, d0d, ...) that the number the machine leaves unchanged rounds to, in levels of digits (bigger is better: a ladder with no top), else minus how far it is from rounding to one",
    main: {
      ts: [
        "if (Q.eq(m, 1)) return null;                    // parallel to y = x: no number stays unchanged",
        ...PAL_SCORE_TS,
        "const s = p.side ?? 1, y = Q.mul(s, Q.div(c, Q.sub(1, m)));   // the unchanged number c/(1 - m), where the line meets y = x (minus it on the mirror)",
        "const rung = rungOf(y), main = onRung(y, rung);",
      ],
      py: [
        "if m == 1:                                      # parallel to y = x: no number stays unchanged",
        "    return None",
        ...PAL_SCORE_PY,
        "y = p.get(\"side\", 1) * c / (1 - m)              # the unchanged number c/(1 - m), where the line meets y = x (minus it on the mirror)",
        "rung = rung_of(y)",
        "main = on_rung(y, rung)",
      ],
    },
    vertical: {
      main: {
        ts: [...PAL_SCORE_TS, "const y = Q.mul(p.side ?? 1, c), main = onRung(y, rungOf(y));   // x = c meets y = x at c"],
        py: [...PAL_SCORE_PY, "y = p.get(\"side\", 1) * c                        # x = c meets y = x at c", "main = on_rung(y, rung_of(y))"],
      },
    },
    tieBreakers: {
      "shared-factor": {
        pre: {
          ts: ["const sum = [...rung.toString()].reduce((a, ch) => a + Number(ch), 0), wc = whole(Q.sub(Q.abs(c), Q.div(1, 2)));   // the palindrome's digits added up; the whole part of |c|"],
          py: ["total, wc = sum(int(ch) for ch in str(rung)), whole(abs(c) - Fraction(1, 2))   # the palindrome's digits added up; the whole part of |c|"],
        },
        ts: "common(sum, wc)", py: "common(total, wc)", says: "a bigger number dividing both the palindrome's digit sum and the y-intercept's whole part is better",
        lenses: ["shift", "tilt", "turn"], steps: 3, tryThis: "remove the \"tilt\" line: a turn keeps the y-intercept and moves the unchanged number; can it still find a palindrome?",
      },
    },
  },
  {
    family: "whole-crossing",
    // A stretch or zoom by 5 takes a level to the next (decision 25's shortcut).
    simple: ["shift", "tilt", "stretch"],
    rungs: {
      ts: [
        "// The next level up (the ladder has no top): the nearest number with one more 5, by a shift that keeps the gradient.",
        "if (!Q.isZero(m)) {",
        "  const x = Q.neg(Q.div(c, m));",
        "  let s = Q.of(5); while (Q.cmp(Q.abs(Q.div(x, s)), 1) > 0 && Q.isInteger(Q.div(x, s))) s = Q.mul(s, 5);   // one more 5 than x holds",
        "  const t = Q.add(p.r, Q.mul(5, whole(Q.div(Q.sub(Q.div(x, s), p.r), 5)))), to = Q.mul(s, t);",
        "  tries.push([move(\"si.shift\", { k: Q.sub(Q.neg(Q.mul(m, to)), c) }), m, Q.neg(Q.mul(m, to))]);",
        "}",
      ],
      py: [
        "# The next level up (the ladder has no top): the nearest number with one more 5, by a shift that keeps the gradient.",
        "if m != 0:",
        "    x, s = -c / m, 5",
        "    while abs(x / s) > 1 and (x / s).denominator == 1:   # one more 5 than x holds",
        "        s *= 5",
        "    to = s * (p[\"r\"] + 5 * whole((x / s - p[\"r\"]) / 5))",
        "    tries.append((move(\"si.shift\", k=-m * to - c), m, -m * to))",
      ],
    },
    mainSays: "the level of 5s the line's x-axis crossing holds when it is a whole number leaving r after its 5s are divided out (level L needs L(L + 1)/2 fives; more is better: a ladder with no top), else minus how far it is from the nearest such number",
    main: {
      ts: [
        "if (Q.isZero(m)) return null;                   // a flat line never crosses: the worst score",
        "const x = Q.neg(Q.div(c, m))                         // where y = mx + c crosses the x-axis;",
        "// The ladder: x = 5^j × t with t leaving r when divided by 5 (1, 5, 25, … times t). The nearest such number, any level,",
        "// in whole numbers: x = n/dd, and every distance is counted in 1/dd.",
        "const n = x.n, dd = x.d, r = BigInt(p.r), ab = v => (v < 0n ? -v : v), fl = (a, b) => (a - (((a % b) + b) % b)) / b;   // fl: rounded down",
        "let best = null;",
        "for (let j = 0, s = 1n; ; j++, s *= 5n) {",
        "  const D = dd * s;",
        "  let t = r + 5n * fl(2n * (n - r * D) + 5n * D, 10n * D);   // the nearest t leaving r at this level (halfway: up)",
        "  if (2n * (t * D - n) === 5n * D && ab(t - 5n) <= ab(t)) t -= 5n;   // halfway: the smaller",
        "  const dist = ab(n - s * t * dd);                 // the nearer wins; on a tie the higher level",
        "  if (best === null || dist <= best.dist) best = { j, t, dist };",
        "  if (s * dd - ab(n) > best.dist) break;           // every further level is farther",
        "}",
        "let L = 0; while (((L + 1) * (L + 2)) / 2 <= best.j) L++;   // level L needs L(L + 1)/2 fives (1, 3, 6, 10, …)",
        "const main = best.dist === 0n ? Q.add(L, Q.of(best.j - (L * (L + 1)) / 2, L + 1)) : Q.neg(Q.of(best.dist, dd));   // on the ladder: its level; else below them all",
      ],
      py: [
        "if m == 0:                                      # a flat line never crosses: the worst score",
        "    return None",
        "x = -c / m                                     # where y = mx + c crosses the x-axis",
        "# The ladder: x = 5^j × t with t leaving r when divided by 5 (1, 5, 25, ... times t). The nearest such number, any level,",
        "# in whole numbers: x = n/dd, and every distance is counted in 1/dd.",
        "n, dd, r = x.numerator, x.denominator, p[\"r\"]",
        "best, j, s = None, 0, 1",
        "while True:",
        "    D = dd * s",
        "    t = r + 5 * ((2 * (n - r * D) + 5 * D) // (10 * D))   # the nearest t leaving r at this level (halfway: up)",
        "    if 2 * (t * D - n) == 5 * D and abs(t - 5) <= abs(t):   # halfway: the smaller",
        "        t -= 5",
        "    dist = abs(n - s * t * dd)                  # the nearer wins; on a tie the higher level",
        "    if best is None or dist <= best[2]:",
        "        best = (j, t, dist)",
        "    if s * dd - abs(n) > best[2]:               # every further level is farther",
        "        break",
        "    j, s = j + 1, s * 5",
        "L = 0",
        "while (L + 1) * (L + 2) // 2 <= best[0]:      # level L needs L(L + 1)/2 fives (1, 3, 6, 10, ...)",
        "    L += 1",
        "main = L + Fraction(best[0] - L * (L + 1) // 2, L + 1) if best[2] == 0 else -Fraction(best[2], dd)   # on the ladder: its level; else below them all",
      ],
    },
    vertical: {
      main: {
        ts: [
          "const x = c                                          // it stands on the x-axis at x = c;",
          "// The ladder: x = 5^j × t with t leaving r when divided by 5 (1, 5, 25, … times t). The nearest such number, any level,",
          "// in whole numbers: x = n/dd, and every distance is counted in 1/dd.",
          "const n = x.n, dd = x.d, r = BigInt(p.r), ab = v => (v < 0n ? -v : v), fl = (a, b) => (a - (((a % b) + b) % b)) / b;   // fl: rounded down",
          "let best = null;",
          "for (let j = 0, s = 1n; ; j++, s *= 5n) {",
          "  const D = dd * s;",
          "  let t = r + 5n * fl(2n * (n - r * D) + 5n * D, 10n * D);   // the nearest t leaving r at this level (halfway: up)",
          "  if (2n * (t * D - n) === 5n * D && ab(t - 5n) <= ab(t)) t -= 5n;   // halfway: the smaller",
          "  const dist = ab(n - s * t * dd);                 // the nearer wins; on a tie the higher level",
          "  if (best === null || dist <= best.dist) best = { j, t, dist };",
          "  if (s * dd - ab(n) > best.dist) break;           // every further level is farther",
          "}",
          "let L = 0; while (((L + 1) * (L + 2)) / 2 <= best.j) L++;   // level L needs L(L + 1)/2 fives (1, 3, 6, 10, …)",
          "const main = best.dist === 0n ? Q.add(L, Q.of(best.j - (L * (L + 1)) / 2, L + 1)) : Q.neg(Q.of(best.dist, dd));   // on the ladder: its level; else below them all",
        ],
        py: [
          "x = c                                          # it stands on the x-axis at x = c",
          "# The ladder: x = 5^j × t with t leaving r when divided by 5 (1, 5, 25, ... times t). The nearest such number, any level,",
          "# in whole numbers: x = n/dd, and every distance is counted in 1/dd.",
          "n, dd, r = x.numerator, x.denominator, p[\"r\"]",
          "best, j, s = None, 0, 1",
          "while True:",
          "    D = dd * s",
          "    t = r + 5 * ((2 * (n - r * D) + 5 * D) // (10 * D))   # the nearest t leaving r at this level (halfway: up)",
          "    if 2 * (t * D - n) == 5 * D and abs(t - 5) <= abs(t):   # halfway: the smaller",
          "        t -= 5",
          "    dist = abs(n - s * t * dd)                  # the nearer wins; on a tie the higher level",
          "    if best is None or dist <= best[2]:",
          "        best = (j, t, dist)",
          "    if s * dd - abs(n) > best[2]:               # every further level is farther",
          "        break",
          "    j, s = j + 1, s * 5",
          "L = 0",
          "while (L + 1) * (L + 2) // 2 <= best[0]:      # level L needs L(L + 1)/2 fives (1, 3, 6, 10, ...)",
          "    L += 1",
          "main = L + Fraction(best[0] - L * (L + 1) // 2, L + 1) if best[2] == 0 else -Fraction(best[2], dd)   # on the ladder: its level; else below them all",
        ],
      },
    },
    tieBreakers: {
      "shared-factor": {
        pre: { ts: ["const t1 = (best.t < 0n ? -best.t : best.t) + 1n, wm = whole(Q.sub(Q.abs(m), Q.div(1, 2)));   // |t| + 1, and the gradient's whole part ignoring sign"], py: ["t1, wm = abs(best[1]) + 1, whole(abs(m) - Fraction(1, 2))   # |t| + 1, and the gradient's whole part ignoring sign"] },
        ts: "common(t1, wm)", py: "common(t1, wm)", says: "take that number with its 5s divided out, ignore its sign and add 1: a bigger number dividing both it and the gradient's whole part is better",
        lenses: ["shift", "tilt"], steps: 3, tryThis: "change FAR = 3 to 2: a stretch by 5 divides the gradient by 5; does the factor start again?",
      },
    },
  },
  {
    family: "divisibility-ladder",
    simple: ["shift", "tilt", "stretch"],
    mainSays: "how many of y(1), y(2), y(3), ... in a row are multiples of 1, 2, 3, ... (more is better, a ladder with no top; each extra counts for less: level L needs L(L + 1)/2)",
    main: {
      ts: [
        "if (Q.isZero(c)) return null;                   // through (0, 0): the rule wants a line that is not",
        "let run = 0, n = 1, y = Q.add(m, c);            // the run of n dividing y(n); it stops at n, with y = y(n)",
        "for (; Q.isInteger(y) && Q.isInteger(Q.div(y, n)); n++, y = Q.add(Q.mul(m, n), c)) run++;",
        "let lv = 0; while (((lv + 1) * (lv + 2)) / 2 <= run) lv++;   // level L needs L(L + 1)/2 of the run (1, 3, 6, 10, …)",
        "const main = Q.add(lv, Q.of(run - (lv * (lv + 1)) / 2, lv + 1));",
      ],
      py: [
        "if c == 0:                                      # through (0, 0): the rule wants a line that is not",
        "    return None",
        "run, n, y = 0, 1, m + c                         # the run of n dividing y(n); it stops at n, with y = y(n)",
        "while y.denominator == 1 and y.numerator % n == 0:",
        "    run, n = run + 1, n + 1",
        "    y = m * n + c",
        "lv = 0",
        "while (lv + 1) * (lv + 2) // 2 <= run:          # level L needs L(L + 1)/2 of the run (1, 3, 6, 10, ...)",
        "    lv += 1",
        "main = lv + Fraction(run - lv * (lv + 1) // 2, lv + 1)",
      ],
    },
    tieBreakers: {
      "next-rung": {
        ts: "Q.isInteger(y) ? common(y, n) : 0", py: "common(y, n) if y.denominator == 1 else 0", says: "where the run stops, at n: a bigger number dividing both n and y(n) is better (0 if y(n) is not whole)",
        lenses: ["shift", "tilt"], steps: 3, tryThis: "change FAR = 3 to 2: a shift by a multiple of the factor y(n) shares with n keeps it; does it reach the next rung?",
      },
    },
  },
  // ---------------------------------------------------------------- restored (v2-linear beginner.ts, decision 22)
  {
    family: "ruler",
    mainSays: "how far the distance from (0, 0), squared, is from a square number (closer is better)",
    main: {
      ts: [
        "if (Q.isZero(m)) return null;                   // a flat line: the rule wants a sloping one",
        "const d2 = Q.div(Q.mul(c, c), Q.add(Q.mul(m, m), 1));   // the distance from (0, 0), squared: c² / (m² + 1)",
        "const sq = near(d2, square) || 1;               // the square number nearest it (1 at the least)",
        `const main = ${neg("Q.abs(Q.sub(d2, sq))")};`,
        "const far = root(sq);                           // that square's root: a whole distance",
      ],
      py: [
        "if m == 0:                                      # a flat line: the rule wants a sloping one",
        "    return None",
        "d2 = c * c / (m * m + 1)                        # the distance from (0, 0), squared",
        "sq = near(d2, square) or 1                      # the square number nearest it (1 at the least)",
        "main = -abs(d2 - sq)",
        "far = root(sq)                                  # that square's root: a whole distance",
      ],
    },
    vertical: {
      main: {
        ts: [
          "const d2 = Q.mul(c, c);                         // its distance from (0, 0), squared",
          "const sq = near(d2, square) || 1;               // the square number nearest it (1 at the least)",
          "const main = Q.neg(Q.abs(Q.sub(d2, sq)));",
          "const far = root(sq);                           // that square's root: a whole distance",
        ],
        py: [
          "d2 = c * c                                      # its distance from (0, 0), squared",
          "sq = near(d2, square) or 1                      # the square number nearest it (1 at the least)",
          "main = -abs(d2 - sq)",
          "far = root(sq)                                  # that square's root: a whole distance",
        ],
      },
      defined: ["far"],
    },
    tieBreakers: {
      far: {
        ts: "far", py: "far", says: "a bigger whole distance is better",
        lenses: ["shift", "tilt", "turnAtMinusOne", "stretch"], steps: 4, tryThis: "change FAR = 4 to 8 so it can jump to a bigger square.",
      },
      "prime-gradient": {
        pre: { ts: ["const mp = near(m, prime);                  // the prime nearest the gradient"], py: ["mp = near(m, prime)                        # the prime nearest the gradient"] },
        ts: neg("Q.abs(Q.sub(m, mp))"), py: "-abs(m - mp)", says: "a gradient close to a prime is better",
        lenses: ["tilt", "shift", "turnAtMinusOne"], steps: 4, tryThis: "add the \"stretch\" lens from the Thorough starter: it scales the distance and the gradient together.",
      },
      "square-area": {
        pre: { ts: ["const area = Q.div(Q.mul(c, c), Q.mul(2, Q.abs(m)));   // the triangle cut off the axes (none when c = 0)"], py: ["area = c * c / (2 * abs(m))                # the triangle cut off the axes (none when c = 0)"] },
        ts: `Q.isZero(c) ? null : ${neg("Q.abs(Q.sub(area, near(area, square)))")}`, py: "None if c == 0 else -abs(area - near(area, square))", says: "a triangle whose area is close to a square number is better",
        lenses: ["shift", "tilt", "turnAtMinusOne"], steps: 4, tryThis: "change FAR = 4 to 6 so it can reach more squares.",
      },
    },
  },
  {
    family: "exact-change",
    thorough: ["shift", "tilt", "step", "turnAtMinusOne"],   // all of them would not fit the starting energy beside this score
    // Read y = mx + c as a·x + b·y = N (b the smallest whole number making b·m and b·c whole; a = -b·m, N = b·c): a way
    // to pay N with coins worth a and b is a point of the line with whole x, y ≥ 0.
    mainSays: "how far the number of ways to pay is from the target (closer is better)",
    main: {
      ts: [
        "if (Q.cmp(m, 0) >= 0) return null;              // a coin worth -m·b: the line must go downhill",
        "const X = Q.neg(Q.div(c, m));                   // where the line meets y = 0: x goes no further",
        "if (Q.cmp(X, 100001) >= 0) return null;         // too many ways to count: no score",
        "const b = m.d * Q.of(m.d, c.d).d;               // the coin b: the smallest whole number making b·m and b·c whole",
        "const ways = [];                                // each way to pay, as its x: the line's whole points with x, y ≥ 0",
        "for (let x = 0; Q.cmp(x, X) <= 0; x++) if (Q.isInteger(Q.add(Q.mul(m, x), c))) ways.push(x);",
        `const main = ${neg("Q.abs(ways.length - p.ways)")};`,
      ],
      py: [
        "if m >= 0:                                      # a coin worth -m*b: the line must go downhill",
        "    return None",
        "X = -c / m                                      # where the line meets y = 0: x goes no further",
        "if X >= 100001:                                 # too many ways to count: no score",
        "    return None",
        "b = m.denominator * Fraction(m.denominator, c.denominator).denominator   # the coin b: b*m and b*c whole",
        "ways = [x for x in range(X // 1 + 1) if (m * x + c).denominator == 1]   # the line's whole points with x, y >= 0",
        "main = -abs(len(ways) - p[\"ways\"])",
      ],
    },
    tieBreakers: {
      "big-piles": {
        // The first way has the fewest coins of a and the last the fewest of b: the smaller pile is smallest in one of them.
        pre: {
          ts: ["if (!ways.length) return [main, null];      // no way to pay: no piles", "const y = Q.add(Q.mul(m, ways.at(-1)), c);  // the fewest coins of b"],
          py: ["if not ways:                               # no way to pay: no piles", "    return [main, None]", "y = m * ways[-1] + c                       # the fewest coins of b"],
        },
        ts: "Q.cmp(ways[0], y) < 0 ? ways[0] : y", py: "min(ways[0], y)", says: "a bigger smaller pile, in every way to pay, is better",
        lenses: ["shift", "tilt", "stretch"], steps: 4, tryThis: "remove the \"stretch\" line: can moving and tilting alone grow the piles?",
      },
      "big-bill": {
        ts: "Q.mul(c, b)", py: "c * b", says: "a bigger bill N = b·c is better",
        lenses: ["shift", "tilt", "stretch"], steps: 4, tryThis: "change FAR = 4 to 8: a bigger bill needs a steeper line to keep the ways the same.",
      },
      "prime-coins": {
        pre: {
          ts: ["const off = x => Q.abs(Q.sub(x, near(x, prime)));   // how far x is from the nearest prime"],
          py: ["off = lambda x: abs(x - near(x, prime))    # how far x is from the nearest prime"],
        },
        ts: "Q.neg(Q.add(off(Q.mul(m, -b)), off(b)))", py: "-(off(-m * b) + off(b))", says: "both coins (a = -b·m and b) close to primes is better",
        lenses: ["tilt", "shift"], steps: 4, tryThis: "change FAR = 4 to 6 so the coins can jump to primes further away.",
      },
    },
  },
  {
    family: "pythagorean-area",
    simple: ["shift", "tilt", "turnAtMinusOne"],   // from y = 0 only a turn makes a triangle
    rungs: {
      ts: [
        "// The next rung up (the ladder has no top): the next prime ending in p.ends above the area, aiming at the middle of",
        "// its window (area t + 1/2), by a shift that keeps the gradient (c² = 2|m|·area, to the nearest half) or a tilt that",
        "// keeps the y-intercept (|m| = c²/(2·area), to the nearest half, third or quarter): the climb keeps whichever lands.",
        "if (!Q.isZero(m) && !Q.isZero(c)) {",
        "  const area = Q.div(Q.mul(c, c), Q.mul(2, Q.abs(m)));",
        "  for (let t = Q.add(near(area, prime, p.ends), 10), i = 0; i < 100; t = Q.add(t, 10), i++) if (prime(t)) {",
        "    const mid = Q.add(t, Q.div(1, 2));             // the middle of its window",
        "    const r = root(whole(Q.mul(8, Q.mul(Q.abs(m), mid))));   // 2·√(2|m|·mid), rounded down: c to the nearest half",
        "    for (const h of [r, Q.add(r, 1)]) {",
        "      const c2 = Q.mul(Q.cmp(c, 0) < 0 ? -1 : 1, Q.div(h, 2));",
        "      tries.push([move(\"si.shift\", { k: Q.sub(c2, c) }), m, c2]);",
        "    }",
        "    for (const d of [2, 3, 4]) {",
        "      const m2 = Q.mul(Q.cmp(m, 0) < 0 ? -1 : 1, Q.div(whole(Q.mul(d, Q.div(Q.mul(c, c), Q.mul(2, mid)))), d));",
        "      if (!Q.isZero(m2)) tries.push([move(\"si.tilt\", { k: Q.sub(m2, m) }), m2, c]);",
        "    }",
        "    break;",
        "  }",
        "}",
      ],
      py: [
        "# The next rung up (the ladder has no top): the next prime ending in p[\"ends\"] above the area, aiming at the middle of",
        "# its window (area t + 1/2), by a shift that keeps the gradient (c² = 2|m|·area, to the nearest half) or a tilt that",
        "# keeps the y-intercept (|m| = c²/(2·area), to the nearest half, third or quarter): the climb keeps whichever lands.",
        "if m != 0 and c != 0:",
        "    area = c * c / (2 * abs(m))",
        "    t = near(area, prime, p[\"ends\"]) + 10",
        "    for _ in range(100):",
        "        if prime(t):",
        "            mid = t + Fraction(1, 2)            # the middle of its window",
        "            r = root(whole(8 * abs(m) * mid))   # 2·√(2|m|·mid), rounded down: c to the nearest half",
        "            for h in (r, r + 1):",
        "                c2 = (-1 if c < 0 else 1) * Fraction(h, 2)",
        "                tries.append((move(\"si.shift\", k=c2 - c), m, c2))",
        "            for d in (2, 3, 4):",
        "                m2 = (-1 if m < 0 else 1) * Fraction(whole(d * (c * c / (2 * mid))), d)",
        "                if m2 != 0:",
        "                    tries.append((move(\"si.tilt\", k=m2 - m), m2, c))",
        "            break",
        "        t += 10",
      ],
    },
    mainSays: "the prime ending in the rule's digit that the triangle's area rounds down to, each extra digit counting for less (bigger is better: a ladder with no top), else minus how far the area is from rounding to one",
    main: {
      ts: [
        "if (Q.isZero(m) || Q.isZero(c)) return null;    // no triangle: the worst score",
        "const legX = Q.abs(Q.div(c, m)), legY = Q.abs(c); // the triangle's base and height",
        "const area = Q.div(Q.mul(legX, legY), 2);",
        "const x = Q.sub(area, Q.div(1, 2));             // the area rounds down to n when x rounds to n (ties up)",
        "const rung = near(x, prime, p.ends);            // the prime ending in p.ends nearest there: the rung",
        "const gap = Q.abs(Q.sub(x, rung));              // on the rung when the area rounds down to it",
        "const level = p => { const D = Q.toString(p).length; let L = 0; while (((L + 1) * (L + 2)) / 2 <= D) L++; return Q.add(L, Q.div(Q.add(D - (L * (L + 1)) / 2, Q.div(p, Q.of(10n ** BigInt(D)))), L + 1)); };   // levels of digits: level L needs L(L + 1)/2",
        "const main = Q.cmp(Q.mul(2, gap), 1) < 0 || Q.eq(Q.sub(rung, x), Q.div(1, 2)) ? level(rung) : Q.neg(Q.sub(gap, Q.div(1, 2)));",
      ],
      py: [
        "if m == 0 or c == 0:                            # no triangle: the worst score",
        "    return None",
        "legX, legY = abs(c / m), abs(c)                 # the triangle's base and height",
        "area = legX * legY / 2",
        "x = area - Fraction(1, 2)                       # the area rounds down to n when x rounds to n (ties up)",
        "rung = near(x, prime, p[\"ends\"])                # the prime ending in p[\"ends\"] nearest there: the rung",
        "gap = abs(x - rung)                             # on the rung when the area rounds down to it",
        "level = lambda p: (lambda D, L: L + (D - L * (L + 1) // 2 + Fraction(p, 10 ** D)) / (L + 1))(len(str(p)), next(L for L in range(99) if (L + 1) * (L + 2) // 2 > len(str(p))))   # levels of digits: level L needs L(L + 1)/2",
        "main = level(rung) if 2 * gap < 1 or rung - x == Fraction(1, 2) else -(gap - Fraction(1, 2))",
      ],
    },
    tieBreakers: {
      "shared-factor": {
        pre: {
          ts: ["const side2 = Q.add(Q.mul(legX, legX), Q.mul(legY, legY));   // the slanted side, squared (Pythagoras)", "const ws = whole(Q.div(Q.sub(Q.mul(2, side2), 1), 2));   // its whole part (rounded down)"],
          py: ["side2 = legX * legX + legY * legY            # the slanted side, squared (Pythagoras)", "ws = whole((2 * side2 - 1) / 2)              # its whole part (rounded down)"],
        },
        ts: "common(Q.sub(rung, 1), ws)", py: "common(rung - 1, ws)", says: "that prime minus 1 and the slanted side squared (rounded down): a bigger factor shared is better",
        lenses: ["shift", "tilt", "turnAtMinusOne"], steps: 3, tryThis: "change FAR = 3 to 2: a smaller shift keeps the area on its prime more often, and still moves the slanted side.",
      },
    },
  },
  // ---------------------------------------------------------------- the adversaries (v2-linear rational2.ts)
  {
    family: "smooth-crossing",
    mainSays: "how far the x-axis crossing is from a 7-smooth number (closer is better)",
    main: {
      ts: [
        "if (Q.isZero(m)) return null;                   // a flat line never crosses: the worst score",
        "const x = Q.neg(Q.div(c, m));                   // where y = mx + c crosses the x-axis",
        "const s0 = Q.isZero(x) ? 1 : near(Q.abs(x), smooth);   // the 7-smooth number nearest its size (1 for 0)",
        "if (s0 === null) return null;                // none within 10,000: hopeless",
        "const s = Q.cmp(x, 0) < 0 ? Q.neg(s0) : s0;   // the sign kept",
        "const main = Q.neg(Q.abs(Q.sub(x, s)));",
      ],
      py: [
        "if m == 0:                                      # a flat line never crosses: the worst score",
        "    return None",
        "x = -c / m                                      # where y = mx + c crosses the x-axis",
        "s0 = 1 if x == 0 else near(abs(x), smooth)   # the 7-smooth number nearest its size (1 for 0)",
        "if s0 is None:                              # none within 10,000: hopeless",
        "    return None",
        "s = -s0 if x < 0 else s0                # the sign kept",
        "main = -abs(x - s)",
      ],
    },
    vertical: {
      main: {
        ts: [
          "const s0 = Q.isZero(c) ? 1 : near(Q.abs(c), smooth);   // the 7-smooth number nearest its size (1 for 0)",
          "if (s0 === null) return null;                // none within 10,000: hopeless",
          "const s = Q.cmp(c, 0) < 0 ? Q.neg(s0) : s0;   // the sign kept",
          "const main = Q.neg(Q.abs(Q.sub(c, s)));",
        ],
        py: [
          "s0 = 1 if c == 0 else near(abs(c), smooth)   # the 7-smooth number nearest its size (1 for 0)",
          "if s0 is None:                              # none within 10,000: hopeless",
          "    return None",
          "s = -s0 if c < 0 else s0                # the sign kept",
          "main = -abs(c - s)",
        ],
      },
    },
    tieBreakers: {
      shared: {
        ts: "shared(s, whole(c))", py: "shared(s, whole(c))", says: "that smooth number sharing many prime factors with the whole number nearest the y-intercept is better",
        lenses: ["shift", "tilt"], steps: 3, tryThis: "remove the \"tilt\" line: moving the line up and down alone walks the crossing in steps of 1/m.",
      },
    },
  },
  {
    family: "smooth-intercept",
    // A stretch by a factor in the dealt primes takes a smooth intercept to another smooth rung (decision 25's shortcut).
    simple: ["shift", "tilt", "stretch"],
    rungs: {
      ts: [
        "// The next level up (the ladder has no top): one more of the dealt primes multiplied in, by a shift.",
        "if (Q.isInteger(c) && !Q.isZero(c)) for (const pr of p.primes) tries.push([move(\"si.shift\", { k: Q.mul(c, pr - 1) }), m, Q.mul(c, pr)]);",
      ],
      py: [
        "# The next level up (the ladder has no top): one more of the dealt primes multiplied in, by a shift.",
        "if c.denominator == 1 and c != 0:",
        "    for pr in p[\"primes\"]:",
        "        tries.append((move(\"si.shift\", k=c * (pr - 1)), m, c * pr))",
      ],
    },
    mainSays: "how many of the rule's primes the y-intercept (ignoring sign) is made of, in levels that each need one more than the last (more is better: a ladder with no top; of two with as many, the smaller), else minus how far it is from the nearest such number",
    main: {
      ts: [
        "const a = Q.abs(c), s = nearMadeOf(a, p.primes);   // the nearest rung: made only of the rule's primes",
        "let main = Q.neg(Q.abs(Q.sub(a, s)));           // off every rung: below them all",
        "if (Q.eq(a, s)) {                               // on a rung: the dealt primes multiplied (omega), in levels",
        "  const omega = factors(s).length; let level = 0;",
        "  while (((level + 1) * (level + 2)) / 2 <= omega) level++;   // level L needs L(L + 1)/2 of them",
        "  main = Q.add(level, Q.div(Q.add(omega - (level * (level + 1)) / 2, Q.div(1, Q.add(2, s))), level + 1));",
        "}",
      ],
      py: [
        "a = abs(c)",
        "s = near_made_of(a, p[\"primes\"])               # the nearest rung: made only of the rule's primes",
        "main = -abs(a - s)                              # off every rung: below them all",
        "if a == s:                                      # on a rung: the dealt primes multiplied (omega), in levels",
        "    omega, level = len(factors(s)), 0",
        "    while (level + 1) * (level + 2) // 2 <= omega:   # level L needs L(L + 1)/2 of them",
        "        level += 1",
        "    main = level + (omega - level * (level + 1) // 2 + Fraction(1, 2 + s)) / (level + 1)",
      ],
    },
    tieBreakers: {
      "shared-factor": {
        pre: { ts: ["const wm = whole(Q.div(Q.sub(Q.mul(2, m), 1), 2));   // the gradient's whole part (rounded down)"], py: ["wm = whole((2 * m - 1) / 2)                # the gradient's whole part (rounded down)"] },
        ts: "common(Q.add(s, 1), wm)", py: "common(s + 1, wm)", says: "take the number just after that number: a bigger number dividing both it and the gradient's whole part is better",
        lenses: ["tilt", "shift"], steps: 3, tryThis: "change FAR = 3 to 2: tilting never moves the y-intercept, so the rung stays.",
      },
    },
  },
  {
    family: "steep-and-tall",
    mainSays: "the smaller of the gradient and the y-intercept (bigger is better)",
    main: {
      ts: [
        "const main = Q.cmp(m, c) <= 0 ? m : c;          // the smaller of the two",
        "const fm = whole(Q.sub(m, Q.of(1, 2))), fc = whole(Q.sub(c, Q.of(1, 2)));   // each rounded down",
      ],
      py: [
        "main = min(m, c)                                # the smaller of the two",
        "fm, fc = m // 1, c // 1                         # each rounded down",
      ],
    },
    tieBreakers: {
      shared: {
        ts: "shared(fm, fc)", py: "shared(fm, fc)", says: "those two rounded down sharing many prime factors is better",
        lenses: ["shift", "tilt", "stretch"], steps: 3, tryThis: "remove the \"stretch\" line: is adding as good as multiplying here?",
      },
    },
  },
  {
    family: "smooth-gradient",
    mainSays: "how far the gradient is from a 7-smooth number (closer is better)",
    main: {
      ts: [
        "const s0 = Q.isZero(m) ? 1 : near(Q.abs(m), smooth);   // the 7-smooth number nearest its size (1 for 0)",
        "if (s0 === null) return null;                // none within 10,000: hopeless",
        "const s = Q.cmp(m, 0) < 0 ? Q.neg(s0) : s0;   // the sign kept",
        "const main = Q.neg(Q.abs(Q.sub(m, s)));",
      ],
      py: [
        "s0 = 1 if m == 0 else near(abs(m), smooth)   # the 7-smooth number nearest its size (1 for 0)",
        "if s0 is None:                              # none within 10,000: hopeless",
        "    return None",
        "s = -s0 if m < 0 else s0                # the sign kept",
        "main = -abs(m - s)",
      ],
    },
    tieBreakers: {
      shared: {
        ts: "shared(s, whole(c))", py: "shared(s, whole(c))", says: "that smooth number sharing many prime factors with the whole number nearest the y-intercept is better",
        lenses: ["tilt", "shift"], steps: 3, tryThis: "remove the \"tilt\" line: moving the line up and down never changes the gradient.",
      },
    },
  },
  {
    family: "smooth-square",
    simple: ["shift", "tilt", "turnAtMinusOne"],
    mainSays: "how far the triangle's area is from a square number (closer is better)",
    main: {
      ts: [
        "if (Q.isZero(m) || Q.isZero(c)) return null;    // no triangle: the worst score",
        "const area = Q.div(Q.mul(c, c), Q.mul(2, Q.abs(m)));",
        "const sq = near(area, square);                  // the square number nearest the area",
        "const main = Q.neg(Q.abs(Q.sub(area, sq)));",
      ],
      py: [
        "if m == 0 or c == 0:                            # no triangle: the worst score",
        "    return None",
        "area = c * c / (2 * abs(m))",
        "sq = near(area, square)                         # the square number nearest the area",
        "main = -abs(area - sq)",
      ],
    },
    tieBreakers: {
      shared: {
        ts: "shared(root(sq), whole(Q.neg(Q.div(c, m))))", py: "shared(root(sq), whole(-c / m))", says: "that square's root sharing many prime factors with the whole number nearest the x-axis crossing is better",
        lenses: ["shift", "tilt", "turnAtMinusOne", "stretch"], steps: 3, tryThis: "change FAR = 3 to 2: shorter steps cost less; does it still reach bigger squares?",
      },
    },
  },
  {
    family: "sunken-intercept",
    mainSays: "minus the y-intercept (lower is better)",
    main: {
      ts: [
        "const main = Q.neg(c);",
      ],
      py: [
        "main = -c",
      ],
    },
    tieBreakers: {
      shared: {
        ts: "shared(whole(c), Q.from(m).n)", py: "shared(whole(c), m.numerator)", says: "the whole number nearest the y-intercept sharing many prime factors with the gradient's top (in lowest terms) is better",
        lenses: ["shift", "tilt"], steps: 3, tryThis: "remove the \"tilt\" line: the gradient's top never changes, so which shares can it reach?",
      },
    },
  },
];
