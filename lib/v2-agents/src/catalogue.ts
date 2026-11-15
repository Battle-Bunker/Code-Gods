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

export const CATALOGUE: readonly FamilyEntry[] = [
  {
    family: "prime-gradient",
    mainSays: "how far the gradient is from the nearest prime ending in the rule's digit (closer is better)",
    main: {
      ts: [
        "const s = p.side ?? 1;                          // 1, or −1 on the mirror: minus a prime",
        "const nearest = near(Q.mul(s, m), prime, p.ends);   // the prime ending in p.ends nearest the gradient (times s)",
        "if (nearest === null) return null;              // none within 10,000: hopeless",
        `const main = ${neg("Q.abs(Q.sub(Q.mul(s, m), nearest))")};`,
      ],
      py: [
        "s = p.get(\"side\", 1)                           # 1, or -1 on the mirror: minus a prime",
        "nearest = near(s * m, prime, p[\"ends\"])         # the prime ending in p[\"ends\"] nearest the gradient (times s)",
        "if nearest is None:                             # none within 10,000: hopeless",
        "    return None",
        "main = -abs(s * m - nearest)",
      ],
    },
    tieBreakers: {
      prime: { ts: "nearest", py: "nearest", says: "a bigger prime is better", lenses: ["tilt"], steps: 3, tryThis: "change FAR = 3 to 2: shorter steps cost less; does it still jump past wider gaps between primes?" },
      cPrime: {
        pre: { ts: ["const cp = near(Q.mul(s, c), prime, p.ends);   // the prime ending in p.ends nearest the y-intercept (times s)"], py: ["cp = near(s * c, prime, p[\"ends\"])         # the prime ending in p[\"ends\"] nearest the y-intercept (times s)"] },
        ts: neg("Q.abs(Q.sub(Q.mul(s, c), cp))"), py: "-abs(s * c - cp)", says: "a y-intercept close to such a prime too is better",
        lenses: ["shift", "tilt"], steps: 3, tryThis: "remove the \"tilt\" line: moving the line up and down never changes the gradient.",
      },
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
    thorough: ["shift", "tilt", "step", "turnAtK"],   // all of them would not fit the starting energy beside these tie-breakers
    mainSays: "how far y(k) is from T (closer is better)",
    main: {
      ts: [`const main = ${neg("Q.abs(Q.sub(Q.add(Q.mul(m, p.k), c), p.T))")};   // y(k) = m·k + c`],
      py: ["main = -abs(m * p[\"k\"] + c - p[\"T\"])           # y(k) = m*k + c"],
    },
    vertical: {
      main: {
        ts: [
          "const main = Q.neg(Q.abs(Q.sub(c, p.k)));      // how far across from (k, T) it passes",
        ],
        py: [
          "main = -abs(c - p[\"k\"])                        # how far across from (k, T) it passes",
        ],
      },
    },
    tieBreakers: {
      "prime-terms": {
        pre: {
          ts: ["const primes = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(x => Q.mul(p.T < 0 ? -1 : 1, Q.add(Q.mul(m, x), c))).filter(prime).map(Q.toString));   // y(1) ... y(8), minus them when T is below zero"],
          py: ["sg = -1 if p[\"T\"] < 0 else 1", "primes = {sg * (m * x + c) for x in range(1, 9) if prime(sg * (m * x + c))}   # y(1) ... y(8), minus them when T is below zero"],
        },
        ts: "primes.size", py: "len(primes)", says: "more different primes among y(1) ... y(8) is better",
        lenses: ["shift", "tilt", "turnAtK"], steps: 3, tryThis: "change FAR = 3 to 2: shorter steps cost less (a step of n costs more than n steps of 1); does it still climb?",
      },
      "prime-gradient": {
        pre: { ts: ["const mp = Q.mul(p.T < 0 ? -1 : 1, near(Q.mul(p.T < 0 ? -1 : 1, m), prime));   // the prime (minus a prime when T is below zero) nearest the gradient"], py: ["sg = -1 if p[\"T\"] < 0 else 1", "mp = sg * near(sg * m, prime)               # the prime (minus a prime when T is below zero) nearest the gradient"] },
        ts: neg("Q.abs(Q.sub(m, mp))"), py: "-abs(m - mp)", says: "a gradient close to a prime is better",
        lenses: ["turnAtK", "tilt", "shift"], steps: 3, tryThis: "change FAR = 3 to 2: turning about x = k keeps the treasure and only changes the gradient.",
      },
      "square-start": {
        pre: { ts: ["const sq = Q.mul(p.T < 0 ? -1 : 1, near(Q.mul(p.T < 0 ? -1 : 1, c), square));   // the square (minus a square when T is below zero) nearest the y-intercept"], py: ["sg = -1 if p[\"T\"] < 0 else 1", "sq = sg * near(sg * c, square)              # the square (minus a square when T is below zero) nearest the y-intercept"] },
        ts: neg("Q.abs(Q.sub(c, sq))"), py: "-abs(c - sq)", says: "a y-intercept close to a square number is better",
        lenses: ["turnAtK", "shift", "tilt"], steps: 3, tryThis: "remove the \"shift\" line: turning about x = k moves the y-intercept by k at a time and keeps the treasure.",
      },
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
    },
  },
  {
    family: "prime-landing",
    rungs: {
      ts: [
        "// The next rung up (the ladder has no top): the next prime ending in p.ends beyond where it lands, by a small tilt",
        "// that keeps the y-intercept (m = -c/X), or by a shift that keeps the gradient (c = -mX).",
        "if (!Q.isZero(m) && !Q.isZero(c)) {",
        "  const x = Q.mul(p.side ?? 1, Q.neg(Q.div(c, m)));",
        "  for (let t = Q.add(near(x, prime, p.ends), 10), i = 0; i < 100; t = Q.add(t, 10), i++) if (prime(t)) {",
        "    const to = Q.mul(p.side ?? 1, t);             // the landing that rounds to it (minus it, on the mirror)",
        "    tries.push([move(\"si.tilt\", { k: Q.sub(Q.neg(Q.div(c, to)), m) }), Q.neg(Q.div(c, to)), c]);",
        "    tries.push([move(\"si.shift\", { k: Q.sub(Q.neg(Q.mul(m, to)), c) }), m, Q.neg(Q.mul(m, to))]);",
        "    break;",
        "  }",
        "}",
      ],
      py: [
        "# The next rung up (the ladder has no top): the next prime ending in p[\"ends\"] beyond where it lands, by a small tilt",
        "# that keeps the y-intercept (m = -c/X), or by a shift that keeps the gradient (c = -mX).",
        "if m != 0 and c != 0:",
        "    x = p.get(\"side\", 1) * (-c / m)",
        "    t = near(x, prime, p[\"ends\"]) + 10",
        "    for _ in range(100):",
        "        if prime(t):",
        "            to = p.get(\"side\", 1) * t          # the landing that rounds to it (minus it, on the mirror)",
        "            tries.append((move(\"si.tilt\", k=-c / to - m), -c / to, c))",
        "            tries.append((move(\"si.shift\", k=-m * to - c), m, -m * to))",
        "            break",
        "        t += 10",
      ],
    },
    mainSays: "the prime ending in the rule's digit that where the line lands on the x-axis rounds to (bigger is better: a ladder with no top), else minus how far it is from rounding to one",
    main: {
      ts: [
        "if (Q.isZero(m)) return null;                   // a flat line never lands: the worst score",
        "const x = Q.mul(p.side ?? 1, Q.neg(Q.div(c, m)));   // where y = mx + c lands on the x-axis (minus that, on the mirror)",
        "const landing = near(x, prime, p.ends);         // the prime ending in p.ends nearest there: the rung",
        "const gap = Q.abs(Q.sub(x, landing));            // on the rung when it rounds there (within 1/2, ties up)",
        "const main = Q.cmp(Q.mul(2, gap), 1) < 0 || Q.eq(Q.sub(landing, x), Q.div(1, 2)) ? landing : Q.neg(Q.sub(gap, Q.div(1, 2)));",
      ],
      py: [
        "if m == 0:                                      # a flat line never lands: the worst score",
        "    return None",
        "x = p.get(\"side\", 1) * (-c / m)                # where y = mx + c lands on the x-axis (minus that, on the mirror)",
        "landing = near(x, prime, p[\"ends\"])             # the prime ending in p[\"ends\"] nearest there: the rung",
        "gap = abs(x - landing)                          # on the rung when it rounds there (within 1/2, ties up)",
        "main = landing if 2 * gap < 1 or landing - x == Fraction(1, 2) else -(gap - Fraction(1, 2))",
      ],
    },
    vertical: {
      main: {
        ts: [
          "const x = Q.mul(p.side ?? 1, c);                // it stands on the x-axis at x = c (minus that, on the mirror)",
          "const landing = near(x, prime, p.ends);         // the rung nearest there",
          "const gap = Q.abs(Q.sub(x, landing));",
          "const main = Q.cmp(Q.mul(2, gap), 1) < 0 || Q.eq(Q.sub(landing, x), Q.div(1, 2)) ? landing : Q.neg(Q.sub(gap, Q.div(1, 2)));",
        ],
        py: [
          "x = p.get(\"side\", 1) * c                      # it stands on the x-axis at x = c (minus that, on the mirror)",
          "landing = near(x, prime, p[\"ends\"])             # the rung nearest there",
          "gap = abs(x - landing)",
          "main = landing if 2 * gap < 1 or landing - x == Fraction(1, 2) else -(gap - Fraction(1, 2))",
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
    thorough: ["shift", "tilt", "step", "turnAtT"],   // all of them would not fit the starting energy beside these tie-breakers
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
    vertical: {
      main: {
        ts: [
          "const main = Q.neg(Q.abs(Q.sub(c, p.T)));      // x = c meets y = x at c",
        ],
        py: [
          "main = -abs(c - p[\"T\"])                        # x = c meets y = x at c",
        ],
      },
    },
    tieBreakers: {
      steep: { ts: "Q.abs(Q.sub(m, 1))", py: "abs(m - 1)", says: "a gradient far from 1 is better", lenses: ["shift", "tilt", "turnAtT"], steps: 3, tryThis: "remove the \"turn\" line: can it get steep without losing T?" },
      "prime-start": {
        pre: { ts: ["const start = Q.abs(c);                        // the y-intercept, ignoring its sign"], py: ["start = abs(c)                             # the y-intercept, ignoring its sign"] },
        ts: neg("Q.abs(Q.sub(start, near(start, prime)))"), py: "-abs(start - near(start, prime))", says: "a y-intercept (ignoring sign) close to a prime is better",
        lenses: ["turnAtT", "shift", "tilt"], steps: 3, tryThis: "change FAR = 3 to 2: turning about x = T keeps the unchanged number and moves the y-intercept.",
      },
      "whole-values": {
        pre: {
          ts: ["const wholes = new Set(Array.from({ length: 11 }, (_, i) => Q.add(Q.mul(m, i - 5), c)).filter(Q.isInteger).map(Q.toString));   // y(-5) ... y(5)"],
          py: ["wholes = {m * x + c for x in range(-5, 6) if (m * x + c).denominator == 1}   # y(-5) ... y(5)"],
        },
        ts: "wholes.size", py: "len(wholes)", says: "more different whole numbers among y(-5) ... y(5) is better",
        lenses: ["turnAtT", "tilt", "shift"], steps: 3, tryThis: "change FAR = 3 to 2: a whole gradient and y-intercept make every value whole.",
      },
      "whole-lamp": {
        pre: { ts: ["const lamp = Q.div(m, Q.sub(m, 1));            // the lamp's height m/(m - 1)"], py: ["lamp = m / (m - 1)                         # the lamp's height m/(m - 1)"] },
        ts: neg("Q.abs(Q.sub(lamp, whole(lamp)))"), py: "-abs(lamp - whole(lamp))", says: "a lamp height close to a whole number is better",
        lenses: ["turnAtT", "tilt", "shift"], steps: 3, tryThis: "remove the \"shift\" line: the lamp depends on the gradient alone.",
      },
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
    },
  },
  {
    family: "whole-crossing",
    mainSays: "how far the line's x-axis crossing is from a whole number leaving r when divided by q (closer is better)",
    main: {
      ts: [
        "if (Q.isZero(m)) return null;                   // a flat line never crosses: the worst score",
        "const x = Q.neg(Q.div(c, m));                   // where y = mx + c crosses the x-axis",
        "const t = Q.div(Q.sub(x, p.r), p.q), j = whole(t);",
        "let k = Q.add(p.r, Q.mul(p.q, j));   // the dealt number nearest",
        "if (Q.eq(Q.mul(2, Q.sub(j, t)), 1) && Q.cmp(Q.abs(Q.sub(k, p.q)), Q.abs(k)) <= 0) k = Q.sub(k, p.q);",
        `const main = ${neg("Q.abs(Q.sub(x, k))")};`,
        "const fk = factors(k), fm = factors(m) ?? [];   // prime factors, smallest first ([] for 0, 1, -1)",
      ],
      py: [
        "if m == 0:                                      # a flat line never crosses: the worst score",
        "    return None",
        "x = -c / m                                      # where y = mx + c crosses the x-axis",
        "t = (x - p[\"r\"]) / p[\"q\"]",
        "j = whole(t)",
        "k = p[\"r\"] + p[\"q\"] * j   # the dealt number nearest",
        "if 2 * (j - t) == 1 and abs(k - p[\"q\"]) <= abs(k):",
        "    k = k - p[\"q\"]",
        "main = -abs(x - k)",
        "fk, fm = factors(k), factors(m) or []           # prime factors, smallest first ([] for 0, 1, -1)",
      ],
    },
    vertical: {
      main: {
        ts: [
          "const t = Q.div(Q.sub(c, p.r), p.q), j = whole(t);",
          "let k = Q.add(p.r, Q.mul(p.q, j));   // the dealt number nearest",
          "if (Q.eq(Q.mul(2, Q.sub(j, t)), 1) && Q.cmp(Q.abs(Q.sub(k, p.q)), Q.abs(k)) <= 0) k = Q.sub(k, p.q);",
          "const main = Q.neg(Q.abs(Q.sub(c, k)));",
          "const fk = factors(k);                          // its prime factors, smallest first",
        ],
        py: [
          "t = (c - p[\"r\"]) / p[\"q\"]",
          "j = whole(t)",
          "k = p[\"r\"] + p[\"q\"] * j   # the dealt number nearest",
          "if 2 * (j - t) == 1 and abs(k - p[\"q\"]) <= abs(k):",
          "    k = k - p[\"q\"]",
          "main = -abs(c - k)",
          "fk = factors(k)                                 # its prime factors, smallest first",
        ],
      },
      defined: ["k-spf", "k-gpf"],
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
        "// The next rung up (the ladder has no top): one jump away from 0 through the valley between, priced by its size.",
        "const rung = Q.abs(c), up = Q.cmp(c, 0) < 0 ? -1 : 1, onRung = n => factors(n).every(f => p.primes.includes(Number(f)));",
        "const below = near(rung, n => n >= 2 && onRung(n));",
        "if (below !== null) for (let t = Q.add(below, 1), i = 0; i < 3000; t = Q.add(t, 1), i++) if (onRung(t)) { tries.push([move(\"si.shift\", { k: Q.sub(Q.mul(up, t), c) }), m, Q.mul(up, t)]); break; }",
      ],
      py: [
        "# The next rung up (the ladder has no top): one jump away from 0 through the valley between, priced by its size.",
        "up = -1 if c < 0 else 1",
        "below = near(abs(c), lambda n: n >= 2 and all(f in p[\"primes\"] for f in factors(n)))",
        "if below is not None:",
        "    t = below + 1",
        "    for _ in range(3000):",
        "        if all(f in p[\"primes\"] for f in factors(t)):",
        "            tries.append((move(\"si.shift\", k=up * t - c), m, up * t))",
        "            break",
        "        t += 1",
      ],
    },
    mainSays: "the y-intercept's size itself when it is made only of the rule's primes (bigger is better: a ladder with no top), else minus how far it is from the nearest such number",
    main: {
      ts: [
        "const a = Q.abs(c), s = near(a, n => n >= 2 && factors(n).every(f => p.primes.includes(Number(f))));   // the nearest rung",
        "if (s === null) return null;                    // none within 10,000: hopeless",
        "const main = Q.eq(a, s) ? a : Q.neg(Q.abs(Q.sub(a, s)));   // on a rung: the rung; else below every rung",
      ],
      py: [
        "a = abs(c)",
        "s = near(a, lambda n: n >= 2 and all(f in p[\"primes\"] for f in factors(n)))   # the nearest rung",
        "if s is None:                                   # none within 10,000: hopeless",
        "    return None",
        "main = a if a == s else -abs(a - s)             # on a rung: the rung; else below every rung",
      ],
    },
    tieBreakers: {
      "shared-factor": {
        pre: { ts: ["const wm = whole(Q.div(Q.sub(Q.mul(2, m), 1), 2));   // the gradient's whole part (rounded down)"], py: ["wm = whole((2 * m - 1) / 2)                # the gradient's whole part (rounded down)"] },
        ts: "common(Q.add(s, 1), wm)", py: "common(s + 1, wm)", says: "that number plus 1 sharing a bigger factor with the gradient's whole part is better",
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
