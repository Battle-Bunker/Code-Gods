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
  turnAtT: {
    comment: "turn the line about its point at x = T (if it crosses y = x there, it still does)",
    ts: `[move("cart.pivot", { x0: p.T, k }), Q.add(m, k), Q.sub(c, Q.mul(k, p.T))]`, py: `(move("cart.pivot", x0=p["T"], k=k), m + k, c - k * p["T"])`,
    only: ["same-on-both-rulers"],
  },
  stretch: {
    comment: "multiply every output by f (m and c both)",
    pre: { ts: "const f = k > 0 ? k + 1 : k - 1;", py: "f = k + 1 if k > 0 else k - 1" },
    ts: `[move("mach.stretch", { f }), Q.mul(m, f), Q.mul(c, f)]`, py: `(move("mach.stretch", f=f), m * f, c * f)`,
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
  /**
   * The main part as a tie-breaker's partner when it is not `main` itself: a main layer whose top is not its best
   * value saturates there once a tie-breaker follows (v2-core evaluateSite), e.g. a run of primes counts up to 6.
   */
  readonly mainWithTie?: { readonly ts: string; readonly py: string };
  /** The score is written for whole-number lines only (line-z: y = mx + c with whole m and c). */
  readonly wholeLines?: boolean;
}

const neg = (ts: string) => `Q.neg(${ts})`;

export const CATALOGUE: readonly FamilyEntry[] = [
  {
    family: "prime-gradient",
    mainSays: "how far the gradient is from the nearest prime (closer is better)",
    main: {
      ts: [
        "const nearest = near(m, prime);                 // the prime nearest the gradient",
        "if (nearest === null) return null;              // none within 10,000: hopeless",
        `const main = ${neg("Q.abs(Q.sub(m, nearest))")};`,
      ],
      py: [
        "nearest = near(m, prime)                        # the prime nearest the gradient",
        "if nearest is None:                             # none within 10,000: hopeless",
        "    return None",
        "main = -abs(m - nearest)",
      ],
    },
    tieBreakers: {
      prime: { ts: "nearest", py: "nearest", says: "a bigger prime is better", lenses: ["tilt"], steps: 8, tryThis: "change FAR = 8 to 12 so it can jump past wider gaps between primes." },
      cPrime: {
        pre: { ts: ["const cp = near(c, prime);", "if (cp === null) return null;"], py: ["cp = near(c, prime)", "if cp is None:", "    return None"] },
        ts: neg("Q.abs(Q.sub(c, cp))"), py: "-abs(c - cp)", says: "the y-intercept close to a prime too",
        lenses: ["tilt", "shift"], steps: 4, tryThis: "remove the \"tilt\" line to see how much slower it gets with one lens.",
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
        lenses: ["shift", "tilt", "turnAtMinusOne"], steps: 4, tryThis: "add the \"stretch\" lens from the Thorough starter and see if it finds whole legs sooner.",
      },
      even: {
        ts: neg("Q.abs(Q.sub(legX, legY))"), py: "-abs(legX - legY)", says: "legs of equal length are best",
        lenses: ["shift", "tilt", "turnAtMinusOne"], steps: 4, tryThis: "change FAR = 4 to 2: smaller changes cost less, but does it still get there?",
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
        lenses: ["shift", "tilt", "turnAtMinusOne"], steps: 3, tryThis: "change FAR = 3 to 6 and watch the price of each move.",
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
        lenses: ["shift", "tilt", "turnAtK"], steps: 4, tryThis: "remove the \"turn\" line and see whether it still finds bigger crossings.",
      },
      whole: {
        ts: "-(x.d - 1n)", py: "-(x.denominator - 1)", says: "x(q) a whole number is best",
        lenses: ["shift", "tilt", "turnAtK"], steps: 4, tryThis: "change FAR = 4 to 2 to make every move cheaper.",
      },
    },
  },
  {
    family: "whole-intercept",
    mainSays: "how far the y-intercept is from a whole number (closer is better)",
    main: {
      ts: ["const n = whole(c);                             // the whole number nearest the y-intercept", `const main = ${neg("Q.abs(Q.sub(c, n))")};`, "const f = factors(n);                           // its prime factors, smallest first"],
      py: ["n = whole(c)                                    # the whole number nearest the y-intercept", "main = -abs(c - n)", "f = factors(n)                                  # its prime factors, smallest first"],
    },
    tieBreakers: {
      spf: {
        ts: "f.length ? f[0] : 1", py: "f[0] if f else 1", says: "a bigger smallest prime factor is better (a big prime is best)",
        lenses: ["shift"], steps: 8, tryThis: "change FAR = 8 to 3 and see how often it gets stuck.",
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
        lenses: ["shift", "tilt", "turnAtMinusOne", "stretch"], steps: 3, tryThis: "change FAR = 3 to 5 so it can reach bigger squares.",
      },
      lpf: {
        ts: "f.at(-1) ?? 1", py: "f[-1] if f else 1", says: "a root whose largest prime factor is big is better",
        lenses: ["shift", "tilt", "turnAtMinusOne"], steps: 4, tryThis: "add the \"stretch\" lens from the Thorough starter.",
      },
      spf: {
        ts: "f[0] ?? 1", py: "f[0] if f else 1", says: "a root whose smallest prime factor is big is better",
        lenses: ["shift", "tilt", "turnAtMinusOne"], steps: 4, tryThis: "add the \"stretch\" lens from the Thorough starter.",
      },
    },
  },
  // ---------------------------------------------------------------- the beginner pool (v2-linear beginner.ts)
  {
    family: "prime-staircase",
    mainSays: "how many different primes the pattern y(0), y(1), ... starts with (more is better)",
    mainWithTie: { ts: "Math.min(main, 6)", py: "min(main, 6)" },   // a run of 6 is the top; longer counts the same
    main: {
      ts: [
        "const run = [];                                 // the different primes it starts with",
        "let stopped = false, miss = null;               // miss: the first term that is not prime",
        "for (let n = 0; n < 12; n++) {                  // y(0) ... y(11)",
        "  const t = Q.add(Q.mul(m, n), c), isPrime = prime(t);",
        "  if (!stopped && isPrime && !run.some(r => Q.eq(r, t))) run.push(t); else stopped = true;",
        "  if (!isPrime && miss === null) miss = t;",
        "}",
        "const main = run.length;",
      ],
      py: [
        "run, stopped, miss = [], False, None            # miss: the first term that is not prime",
        "for n in range(12):                             # y(0) ... y(11)",
        "    t = m * n + c",
        "    is_prime = prime(t)",
        "    if not stopped and is_prime and t not in run:",
        "        run.append(t)                           # the different primes it starts with",
        "    else:",
        "        stopped = True",
        "    if not is_prime and miss is None:",
        "        miss = t",
        "main = len(run)",
      ],
    },
    tieBreakers: {
      "first-prime": {
        ts: "run.length ? run[0] : 0", py: "run[0] if run else 0", says: "a bigger first prime is better",
        lenses: ["shift", "step"], steps: 6, tryThis: "change FAR = 6 to 10 so it can jump to bigger primes.",
      },
      "last-prime": {
        ts: "run.length ? run[run.length - 1] : 0", py: "run[-1] if run else 0", says: "a bigger last prime is better",
        lenses: ["shift", "tilt", "step"], steps: 6, tryThis: "remove the \"step\" line and see whether it still finds long runs.",
      },
      "near-miss": {
        pre: { ts: ["const far = miss === null ? null : Q.abs(miss);"], py: ["far = None if miss is None else abs(miss)"] },
        ts: `far === null ? null : ${neg("Q.abs(Q.sub(far, near(far, prime)))")}`, py: "None if far is None else -abs(far - near(far, prime))",
        says: "the first term that is not prime should be close to a prime",
        lenses: ["shift", "tilt", "step"], steps: 4, tryThis: "change FAR = 4 to 2: cheaper moves, but does the run still grow?",
      },
      "step-back": {
        pre: { ts: ["const back = Q.abs(Q.sub(c, m));                // y(-1), ignoring its sign"], py: ["back = abs(c - m)                               # y(-1), ignoring its sign"] },
        ts: neg("Q.abs(Q.sub(back, near(back, prime)))"), py: "-abs(back - near(back, prime))",
        says: "y(-1) close to a prime is better",
        lenses: ["shift", "tilt", "step"], steps: 4, tryThis: "change FAR = 4 to 2: cheaper moves, but does it still find a prime y(-1)?",
      },
    },
  },
  {
    family: "treasure",
    mainSays: "how far y(k) is from T (closer is better)",
    main: {
      ts: [`const main = ${neg("Q.abs(Q.sub(Q.add(Q.mul(m, p.k), c), p.T))")};   // y(k) = m·k + c`],
      py: ["main = -abs(m * p[\"k\"] + c - p[\"T\"])           # y(k) = m*k + c"],
    },
    tieBreakers: {
      "prime-terms": {
        pre: {
          ts: ["const primes = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(x => Q.add(Q.mul(m, x), c)).filter(prime).map(Q.toString));   // y(1) ... y(8)"],
          py: ["primes = {m * x + c for x in range(1, 9) if prime(m * x + c)}   # y(1) ... y(8)"],
        },
        ts: "primes.size", py: "len(primes)", says: "more different primes among y(1) ... y(8) is better",
        lenses: ["shift", "tilt", "turnAtK"], steps: 6, tryThis: "change FAR = 6 to 30: a step of 30 through (2, 37) gives many primes.",
      },
      "prime-gradient": {
        ts: neg("Q.abs(Q.sub(m, near(m, prime)))"), py: "-abs(m - near(m, prime))", says: "a gradient close to a prime is better",
        lenses: ["shift", "tilt", "turnAtK"], steps: 4, tryThis: "remove the \"tilt\" line: turning about x = k keeps y(k) and changes the gradient.",
      },
      "square-start": {
        ts: neg("Q.abs(Q.sub(c, near(c, square)))"), py: "-abs(c - near(c, square))", says: "a y-intercept close to a square number is better",
        lenses: ["shift", "tilt", "turnAtK"], steps: 4, tryThis: "change FAR = 4 to 8 to reach squares further away.",
      },
    },
  },
  {
    family: "ruler",
    mainSays: "how far the distance from (0, 0), squared, is from a square number (closer is better)",
    simple: ["shift", "tilt", "turnAtMinusOne"],
    main: {
      ts: [
        "if (Q.isZero(m)) return null;                   // a flat line: the rule wants a sloping one",
        "const d2 = Q.div(Q.mul(c, c), Q.add(Q.mul(m, m), 1));   // the distance from (0, 0), squared",
        "const k = Math.max(root(near(d2, square)), 1);  // the nearest whole distance, at least 1",
        `const main = ${neg("Q.abs(Q.sub(d2, k * k))")};`,
      ],
      py: [
        "if m == 0:                                      # a flat line: the rule wants a sloping one",
        "    return None",
        "d2 = c * c / (m * m + 1)                        # the distance from (0, 0), squared",
        "k = max(root(near(d2, square)), 1)              # the nearest whole distance, at least 1",
        "main = -abs(d2 - k * k)",
      ],
    },
    tieBreakers: {
      far: { ts: "k", py: "k", says: "a bigger whole distance is better", lenses: ["shift", "tilt", "turnAtMinusOne", "stretch"], steps: 4, tryThis: "remove the \"stretch\" line: is moving as good as multiplying here?" },
      "prime-gradient": {
        ts: neg("Q.abs(Q.sub(m, near(m, prime)))"), py: "-abs(m - near(m, prime))", says: "a gradient close to a prime is better",
        lenses: ["shift", "tilt", "turnAtMinusOne"], steps: 4, tryThis: "change FAR = 4 to 6: can a prime gradient have a whole distance at all?",
      },
      "square-area": {
        pre: {
          ts: ["if (Q.isZero(c)) return [main, null];          // no triangle: the worst tie-breaker", "const area = Q.div(Q.mul(c, c), Q.mul(2, Q.abs(m)));"],
          py: ["if c == 0:                                      # no triangle: the worst tie-breaker", "    return [main, None]", "area = c * c / (2 * abs(m))"],
        },
        ts: neg("Q.abs(Q.sub(area, near(area, square)))"), py: "-abs(area - near(area, square))", says: "a triangle area close to a square number is better",
        lenses: ["shift", "tilt", "turnAtMinusOne"], steps: 4, tryThis: "change FAR = 4 to 2 and compare the energy it spends.",
      },
    },
  },
  {
    family: "exact-change",
    wholeLines: true,
    mainSays: "how far the number of ways to pay N with coins a and 1 is from the target (closer is better)",
    main: {
      ts: [
        "const a = Q.neg(m), N = c;                      // y = mx + c read as a·x + 1·y = N",
        "if (Q.cmp(a, 0) <= 0) return null;              // coins must be worth more than 0",
        "if (!Q.isInteger(m) || !Q.isInteger(c)) return null;   // this agent reads whole-number lines only",
        "if (Q.cmp(N, 0) >= 0 && whole(Q.sub(Q.div(N, a), Q.of(1, 2))) > 100000) return null;   // too many ways to count",
        "const ways = Q.cmp(N, 0) < 0 ? 0 : whole(Q.sub(Q.div(N, a), Q.of(1, 2))) + 1;   // x = 0, 1, ... while a·x ≤ N",
        `const main = ${neg("Q.abs(Q.sub(ways, p.ways))")};`,
      ],
      py: [
        "a, N = -m, c                                    # y = mx + c read as a*x + 1*y = N",
        "if a <= 0:                                      # coins must be worth more than 0",
        "    return None",
        "if m.denominator != 1 or c.denominator != 1:    # this agent reads whole-number lines only",
        "    return None",
        "if N >= 0 and N // a > 100000:                  # too many ways to count",
        "    return None",
        "ways = 0 if N < 0 else N // a + 1               # x = 0, 1, ... while a*x <= N",
        "main = -abs(ways - p[\"ways\"])",
      ],
    },
    tieBreakers: {
      "big-piles": {
        ts: "ways > 0 ? 0 : null", py: "0 if ways > 0 else None", says: "with a coin worth 1, paying all in ones always has an empty pile",
        lenses: ["shift", "tilt"], steps: 4, tryThis: "change FAR = 4 to 2 and watch the price of each move.",
      },
      "big-bill": {
        ts: "N", py: "N", says: "a bigger bill is better",
        lenses: ["shift", "tilt", "stretch"], steps: 3, tryThis: "remove the \"stretch\" line: can adding alone grow the bill and keep the ways?",
      },
      "prime-coins": {
        ts: `Q.sub(${neg("Q.abs(Q.sub(a, near(a, prime)))")}, 1)`, py: "-abs(a - near(a, prime)) - 1", says: "coins close to primes are better (the 1 is always 1 from 2)",
        lenses: ["shift", "tilt", "turnAtMinusOne"], steps: 4, tryThis: "remove the \"turn\" line and see how often it gets stuck.",
      },
    },
  },
  {
    family: "prime-landing",
    mainSays: "how far the y-intercept is from the nearest prime (closer is better)",
    main: {
      ts: ["const landing = near(c, prime);                 // the prime nearest the y-intercept", `const main = ${neg("Q.abs(Q.sub(c, landing))")};`],
      py: ["landing = near(c, prime)                        # the prime nearest the y-intercept", "main = -abs(c - landing)"],
    },
    tieBreakers: {
      "big-prime": { ts: "landing", py: "landing", says: "a bigger prime is better", lenses: ["shift"], steps: 8, tryThis: "change FAR = 8 to 12 so it can jump past wider gaps between primes." },
      "prime-gradient": {
        ts: neg("Q.abs(Q.sub(m, near(m, prime)))"), py: "-abs(m - near(m, prime))", says: "a gradient close to a prime too is better",
        lenses: ["shift", "tilt"], steps: 4, tryThis: "remove the \"tilt\" line to see how much slower it gets with one lens.",
      },
      "next-prime": {
        pre: { ts: ["const y1 = Q.abs(Q.add(m, c));                  // y(1) = m + c, ignoring its sign"], py: ["y1 = abs(m + c)                                 # y(1) = m + c, ignoring its sign"] },
        ts: neg("Q.abs(Q.sub(y1, near(y1, prime)))"), py: "-abs(y1 - near(y1, prime))", says: "y(1) close to a prime too is better",
        lenses: ["shift", "tilt"], steps: 4, tryThis: "change FAR = 4 to 2: cheaper moves, but does it still get there?",
      },
    },
  },
  {
    family: "same-on-both-rulers",
    mainSays: "how far the number the machine leaves unchanged is from T (closer is better)",
    main: {
      ts: [
        "if (Q.eq(m, 1)) return null;                    // × 1: no number stays unchanged",
        "const fixed = Q.div(c, Q.sub(1, m));            // where y = mx + c meets y = x",
        `const main = ${neg("Q.abs(Q.sub(fixed, p.T))")};`,
      ],
      py: [
        "if m == 1:                                      # x 1: no number stays unchanged",
        "    return None",
        "fixed = c / (1 - m)                             # where y = mx + c meets y = x",
        "main = -abs(fixed - p[\"T\"])",
      ],
    },
    tieBreakers: {
      steep: { ts: "Q.abs(Q.sub(m, 1))", py: "abs(m - 1)", says: "a gradient far from 1 is better", lenses: ["shift", "tilt", "turnAtT"], steps: 4, tryThis: "remove the \"turn\" line: can it get steep without losing T?" },
      "prime-start": {
        pre: { ts: ["const start = Q.abs(c);"], py: ["start = abs(c)"] },
        ts: neg("Q.abs(Q.sub(start, near(start, prime)))"), py: "-abs(start - near(start, prime))", says: "|c| close to a prime is better",
        lenses: ["shift", "tilt", "turnAtT"], steps: 4, tryThis: "change FAR = 4 to 8 and see which primes it finds.",
      },
      "whole-values": {
        pre: {
          ts: ["const values = new Set([...Array(11).keys()].map(i => Q.add(Q.mul(m, i - 5), c)).filter(Q.isInteger).map(Q.toString));   // y(-5) ... y(5)"],
          py: ["values = {m * x + c for x in range(-5, 6) if (m * x + c).denominator == 1}   # y(-5) ... y(5)"],
        },
        ts: "values.size", py: "len(values)", says: "more different whole numbers among y(-5) ... y(5) is better",
        lenses: ["shift", "tilt", "turnAtT"], steps: 4, tryThis: "change FAR = 4 to 2 and compare the energy it spends.",
      },
      "whole-lamp": {
        pre: { ts: ["const lamp = Q.div(m, Q.sub(m, 1));             // the lamp's height m/(m - 1)"], py: ["lamp = m / (m - 1)                              # the lamp's height m/(m - 1)"] },
        ts: neg("Q.abs(Q.sub(lamp, whole(lamp)))"), py: "-abs(lamp - whole(lamp))", says: "a lamp at a whole height is better",
        lenses: ["shift", "tilt", "turnAtT"], steps: 4, tryThis: "remove the \"turn\" line and watch the main part slip.",
      },
    },
  },
  {
    family: "pythagorean-area",
    mainSays: "how far the triangle's area is from A (closer is better)",
    simple: ["shift", "tilt", "turnAtMinusOne"],
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
      "slanted-square": {
        pre: { ts: ["const side2 = Q.add(Q.mul(legX, legX), Q.mul(legY, legY));   // the slanted side, squared"], py: ["side2 = legX * legX + legY * legY                # the slanted side, squared"] },
        ts: neg("Q.abs(Q.sub(side2, near(side2, square)))"), py: "-abs(side2 - near(side2, square))", says: "a slanted side whose square is a square number is better (3, 4, 5)",
        lenses: ["shift", "tilt", "turnAtMinusOne"], steps: 4, tryThis: "change FAR = 4 to 6: the 3-4-5 triangle is y = -4/3 x + 4, or y = -3/4 x + 3.",
      },
      "prime-height": {
        pre: { ts: ["const height = Q.abs(c);"], py: ["height = abs(c)"] },
        ts: neg("Q.abs(Q.sub(height, near(height, prime)))"), py: "-abs(height - near(height, prime))", says: "a prime height is better",
        lenses: ["shift", "tilt", "turnAtMinusOne"], steps: 4, tryThis: "remove the \"turn\" line and see how often it gets stuck.",
      },
      "whole-legs": {
        ts: `Q.neg(Q.add(Q.abs(Q.sub(legX, whole(legX))), Q.abs(Q.sub(legY, whole(legY)))))`, py: "-(abs(legX - whole(legX)) + abs(legY - whole(legY)))",
        says: "legs that are whole numbers are better",
        lenses: ["shift", "tilt", "turnAtMinusOne"], steps: 4, tryThis: "change FAR = 4 to 2 and compare the energy it spends.",
      },
    },
  },
];
