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
  /** The Thorough starter's moves (default: every lens offered to the family), where they would not fit the starting energy. */
  readonly thorough?: readonly LensId[];
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
      "c-spf": {
        pre: { ts: ["const fc = factors(c) ?? [];             // prime factors, smallest first ([] for 0, 1, -1 and fractions)"], py: ["fc = factors(c) or []               # prime factors, smallest first ([] for 0, 1, -1 and fractions)"] },
        ts: "fc[0] ?? 1", py: "fc[0] if fc else 1", says: "the y-intercept's smallest prime factor big is better",
        lenses: ["tilt", "shift"], steps: 3, tryThis: "change FAR = 3 to 2: shorter steps cost less; does it still reach a y-intercept with a bigger smallest factor?",
      },
      "c-gpf": {
        pre: { ts: ["const fc = factors(c) ?? [];             // prime factors, smallest first ([] for 0, 1, -1 and fractions)"], py: ["fc = factors(c) or []               # prime factors, smallest first ([] for 0, 1, -1 and fractions)"] },
        ts: "fc.at(-1) ?? 1", py: "fc[-1] if fc else 1", says: "the y-intercept's largest prime factor big is better",
        lenses: ["tilt", "shift"], steps: 3, tryThis: "change FAR = 3 to 2: shorter steps cost less; does it still reach a y-intercept with a bigger prime in it?",
      },
      prime: { ts: "nearest", py: "nearest", says: "a bigger prime is better", lenses: ["tilt"], steps: 3, tryThis: "change FAR = 3 to 2: shorter steps cost less; does it still jump past wider gaps between primes?" },
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
      ts: ["const n = whole(c);                             // the whole number nearest the y-intercept", `const main = ${neg("Q.abs(Q.sub(c, n))")};`, "const f = factors(n);                           // its prime factors, smallest first"],
      py: ["n = whole(c)                                    # the whole number nearest the y-intercept", "main = -abs(c - n)", "f = factors(n)                                  # its prime factors, smallest first"],
    },
    tieBreakers: {
      spf: {
        ts: "f.length ? f[0] : 1", py: "f[0] if f else 1", says: "a bigger smallest prime factor is better (a big prime is best)",
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
    mainSays: "how many different primes the pattern y(0), y(1), ... starts with (more is better)",
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
        lenses: ["shift", "step"], steps: 3, tryThis: "change FAR = 3 to 2: shorter steps cost less; does it still jump to bigger primes?",
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
      "m-spf": {
        pre: { ts: ["const fm = factors(m) ?? [];             // prime factors, smallest first ([] for 0, 1, -1 and fractions)"], py: ["fm = factors(m) or []               # prime factors, smallest first ([] for 0, 1, -1 and fractions)"] },
        ts: "fm[0] ?? 1", py: "fm[0] if fm else 1", says: "the gradient's smallest prime factor big is better",
        lenses: ["turnAtK", "tilt", "shift"], steps: 3, tryThis: "change FAR = 3 to 2: turning about x = k keeps the treasure and only changes the gradient.",
      },
      "m-gpf": {
        pre: { ts: ["const fm = factors(m) ?? [];             // prime factors, smallest first ([] for 0, 1, -1 and fractions)"], py: ["fm = factors(m) or []               # prime factors, smallest first ([] for 0, 1, -1 and fractions)"] },
        ts: "fm.at(-1) ?? 1", py: "fm[-1] if fm else 1", says: "the gradient's largest prime factor big is better",
        lenses: ["turnAtK", "tilt", "shift"], steps: 3, tryThis: "change FAR = 3 to 2: turning about x = k keeps the treasure and only changes the gradient.",
      },
      "prime-terms": {
        pre: {
          ts: ["const primes = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(x => Q.add(Q.mul(m, x), c)).filter(prime).map(Q.toString));   // y(1) ... y(8)"],
          py: ["primes = {m * x + c for x in range(1, 9) if prime(m * x + c)}   # y(1) ... y(8)"],
        },
        ts: "primes.size", py: "len(primes)", says: "more different primes among y(1) ... y(8) is better",
        lenses: ["shift", "tilt", "turnAtK"], steps: 3, tryThis: "change FAR = 3 to 2: shorter steps cost less (a step of n costs more than n steps of 1); does it still climb?",
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
      "m-spf": {
        pre: { ts: ["const fm = factors(m) ?? [];             // prime factors, smallest first ([] for 0, 1, -1 and fractions)"], py: ["fm = factors(m) or []               # prime factors, smallest first ([] for 0, 1, -1 and fractions)"] },
        ts: "fm[0] ?? 1", py: "fm[0] if fm else 1", says: "the gradient's smallest prime factor big is better",
        lenses: ["shift", "tilt"], steps: 3, tryThis: "change FAR = 3 to 2: tilting never moves the y-intercept, so the landing stays.",
      },
      "m-gpf": {
        pre: { ts: ["const fm = factors(m) ?? [];             // prime factors, smallest first ([] for 0, 1, -1 and fractions)"], py: ["fm = factors(m) or []               # prime factors, smallest first ([] for 0, 1, -1 and fractions)"] },
        ts: "fm.at(-1) ?? 1", py: "fm[-1] if fm else 1", says: "the gradient's largest prime factor big is better",
        lenses: ["shift", "tilt"], steps: 3, tryThis: "change FAR = 3 to 2: tilting never moves the y-intercept, so the landing stays.",
      },
      "big-prime": { ts: "landing", py: "landing", says: "a bigger prime is better", lenses: ["shift"], steps: 3, tryThis: "change FAR = 3 to 2: shorter steps cost less; does it still jump past wider gaps between primes?" },
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
      "m-spf": {
        pre: { ts: ["const fm = factors(m) ?? [];             // prime factors, smallest first ([] for 0, 1, -1 and fractions)"], py: ["fm = factors(m) or []               # prime factors, smallest first ([] for 0, 1, -1 and fractions)"] },
        ts: "fm[0] ?? 1", py: "fm[0] if fm else 1", says: "the gradient's smallest prime factor big is better",
        lenses: ["turnAtT", "tilt", "shift"], steps: 3, tryThis: "change FAR = 3 to 2: turning about x = T keeps the unchanged number and only changes the gradient.",
      },
      "m-gpf": {
        pre: { ts: ["const fm = factors(m) ?? [];             // prime factors, smallest first ([] for 0, 1, -1 and fractions)"], py: ["fm = factors(m) or []               # prime factors, smallest first ([] for 0, 1, -1 and fractions)"] },
        ts: "fm.at(-1) ?? 1", py: "fm[-1] if fm else 1", says: "the gradient's largest prime factor big is better",
        lenses: ["turnAtT", "tilt", "shift"], steps: 3, tryThis: "change FAR = 3 to 2: turning about x = T keeps the unchanged number and only changes the gradient.",
      },
      steep: { ts: "Q.abs(Q.sub(m, 1))", py: "abs(m - 1)", says: "a gradient far from 1 is better", lenses: ["shift", "tilt", "turnAtT"], steps: 3, tryThis: "remove the \"turn\" line: can it get steep without losing T?" },
    },
  },
  {
    family: "whole-crossing",
    mainSays: "how far the line's x-axis crossing is from a whole number (closer is better)",
    main: {
      ts: [
        "if (Q.isZero(m)) return null;                   // a flat line never crosses: the worst score",
        "const x = Q.neg(Q.div(c, m));                   // where y = mx + c crosses the x-axis",
        "const k = whole(x);                             // the whole number nearest the crossing",
        `const main = ${neg("Q.abs(Q.sub(x, k))")};`,
        "const fk = factors(k), fm = factors(m) ?? [];   // prime factors, smallest first ([] for 0, 1, -1)",
      ],
      py: [
        "if m == 0:                                      # a flat line never crosses: the worst score",
        "    return None",
        "x = -c / m                                      # where y = mx + c crosses the x-axis",
        "k = whole(x)                                    # the whole number nearest the crossing",
        "main = -abs(x - k)",
        "fk, fm = factors(k), factors(m) or []           # prime factors, smallest first ([] for 0, 1, -1)",
      ],
    },
    tieBreakers: {
      "k-spf": {
        ts: "fk[0] ?? 1", py: "fk[0] if fk else 1", says: "that whole number's smallest prime factor big is better",
        lenses: ["shift", "tilt"], steps: 3, tryThis: "change FAR = 3 to 2: shorter steps cost less; does it still reach crossings further out?",
      },
      "k-gpf": {
        ts: "fk.at(-1) ?? 1", py: "fk[-1] if fk else 1", says: "that whole number's largest prime factor big is better",
        lenses: ["shift", "tilt"], steps: 3, tryThis: "remove the \"tilt\" line: moving the line up and down alone walks the crossing in steps of 1/m.",
      },
      "m-spf": {
        ts: "fm[0] ?? 1", py: "fm[0] if fm else 1", says: "the gradient's smallest prime factor big is better",
        lenses: ["shift", "tilt"], steps: 3, tryThis: "change FAR = 3 to 2: shorter steps cost less (a step of n costs more than n steps of 1); does it still climb?",
      },
    },
  },
  {
    family: "divisibility-ladder",
    mainSays: "how many of y(1), y(2), y(3), ... in a row are multiples of 1, 2, 3, ... (more is better)",
    main: {
      ts: [
        "if (Q.isZero(c)) return null;                   // through (0, 0): the rule wants a line that is not",
        "let main = 0;",
        "for (let n = 1; n <= 12; n++) {                 // the run of n dividing y(n)",
        "  const y = Q.add(Q.mul(m, n), c);",
        "  if (!Q.isInteger(y) || !Q.isInteger(Q.div(y, n))) break;",
        "  main++;",
        "}",
        "const fm = factors(m) ?? [];                    // the gradient's prime factors ([] for 0, 1, -1)",
      ],
      py: [
        "if c == 0:                                      # through (0, 0): the rule wants a line that is not",
        "    return None",
        "main = 0",
        "for n in range(1, 13):                          # the run of n dividing y(n)",
        "    y = m * n + c",
        "    if y.denominator != 1 or y.numerator % n != 0:",
        "        break",
        "    main += 1",
        "fm = factors(m) or []                           # the gradient's prime factors ([] for 0, 1, -1)",
      ],
    },
    tieBreakers: {
      "m-spf": {
        ts: "fm[0] ?? 1", py: "fm[0] if fm else 1", says: "the gradient's smallest prime factor big is better",
        lenses: ["shift", "tilt"], steps: 3, tryThis: "change FAR = 3 to 2: shorter steps cost less (a step of n costs more than n steps of 1); does it still climb?",
      },
      "m-gpf": {
        ts: "fm.at(-1) ?? 1", py: "fm[-1] if fm else 1", says: "the gradient's largest prime factor big is better",
        lenses: ["shift", "tilt"], steps: 3, tryThis: "change FAR = 3 to 2: shorter steps cost less (a step of n costs more than n steps of 1); does it still climb?",
      },
      steep: {
        ts: "Q.abs(m)", py: "abs(m)", says: "a steeper gradient is better",
        lenses: ["shift", "tilt"], steps: 3, tryThis: "remove the \"shift\" line: tilting alone keeps c, and with it the run.",
      },
      "m-prime": {
        pre: { ts: ["const mp = near(m, prime);"], py: ["mp = near(m, prime)"] },
        ts: neg("Q.abs(Q.sub(m, mp))"), py: "-abs(m - mp)", says: "a gradient close to a prime is better",
        lenses: ["shift", "tilt"], steps: 3, tryThis: "remove the \"shift\" line: tilting alone keeps c, and with it the run.",
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
      "slanted-square": {
        pre: { ts: ["const side2 = Q.add(Q.mul(legX, legX), Q.mul(legY, legY));   // the slanted side, squared (Pythagoras)"], py: ["side2 = legX * legX + legY * legY            # the slanted side, squared (Pythagoras)"] },
        ts: neg("Q.abs(Q.sub(side2, near(side2, square)))"), py: "-abs(side2 - near(side2, square))", says: "a slanted side whose square is close to a square number is best",
        lenses: ["shift", "tilt", "turnAtMinusOne"], steps: 4, tryThis: "add the \"stretch\" lens from the Thorough starter and see if it finds a 3-4-5 triangle sooner.",
      },
      "prime-height": {
        ts: neg("Q.abs(Q.sub(legY, near(legY, prime)))"), py: "-abs(legY - near(legY, prime))", says: "a height close to a prime is better",
        lenses: ["shift", "tilt", "turnAtMinusOne"], steps: 4, tryThis: "change FAR = 4 to 8 so the height can jump to a prime further away.",
      },
      "whole-legs": {
        ts: neg("Q.add(Q.abs(Q.sub(legX, whole(legX))), Q.abs(Q.sub(legY, whole(legY))))"), py: "-(abs(legX - whole(legX)) + abs(legY - whole(legY)))", says: "legs close to whole numbers are best",
        lenses: ["shift", "tilt", "turnAtMinusOne"], steps: 4, tryThis: "change FAR = 4 to 2: smaller changes cost less, but does it still get there?",
      },
    },
  },
];
