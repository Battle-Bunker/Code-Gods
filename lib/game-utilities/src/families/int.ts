/**
 * Int families: each returns its natural ordinal (a count, a length, a distance; bigger is better). Params come from small fixed lists so `canonical(support)` stays tiny, because
 * calibration enumerates it. Cards use the Int prelude (`digits(x)`, `from_digits(ds)` / `fromDigits(ds)`).
 */
import type { CardText } from "./card.ts";
import { pyCard, tsCard } from "./card.ts";
import { SCALAR, bestValue, defineFamilies } from "./define.ts";
import { choiceParam, intParam, valuesParam } from "../params.ts";
import type { FamilyContext } from "../types.ts";
import { solvedAnalytic } from "../analytic/hook.ts";

interface IntSpec { readonly min: number; readonly max: number }
const intFamily = defineFamilies<IntSpec>("Int", (ctx: FamilyContext) => ({
  min: Number(ctx.inst.args.min), max: Number(ctx.inst.args.max),
}));
const inRange = (s: IntSpec, x: number) => Number.isSafeInteger(x) && x >= s.min && x <= s.max;
/** Best in-range candidate (with ± versions), scored by the family's own card. */
function bestOf(id: string, p: any, s: IntSpec, ctx: FamilyContext, xs: readonly number[]): number {
  // Small domains: the best value outright. Large ones: the family's ideal shapes that fit.
  if (s.max - s.min <= 100_000) return bestValue(id, p, ctx, range(s.min, s.max)) as number;
  const ok = [...new Set([...xs, ...xs.map(x => -x), s.min, s.max, 0])].filter(x => inRange(s, x));
  return bestValue(id, p, ctx, ok) as number;
}
const card = (emoji: string, name: string, about: string, consts: CardText["consts"] = []): CardText =>
  ({ emoji, name, about, consts });
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
/** The allowed value nearest to a stored one (legacy readers: a removed value reads as its neighbour; the first of equals). */
const nearestOf = <T extends string | number>(allowed: readonly T[], v: T): T =>
  allowed.reduce((best, a) => (Math.abs(Number(a) - Number(v)) < Math.abs(Number(best) - Number(v)) ? a : best), allowed[0]);
const repeatNum = (digits: string, n: number) => Number(digits.repeat(Math.ceil(n / digits.length)).slice(0, n));

// --- Digit Devotee ---------------------------------------------------------------------------------
type DigitP = { digit: number };
const digitText = (p: DigitP) => card("🔢", "Digit Devotee",
  `You adore the digit ${p.digit}. Count the ${p.digit}s in x (the minus sign doesn't count). Each one scores 1 point.`, [["MY_DIGIT", p.digit]]);
const digitDevotee = intFamily<DigitP>({
  id: "digit-devotee", name: "Digit Devotee", emoji: "🔢", theme: "Loves one particular decimal digit.", shape: SCALAR,
  analytic: solvedAnalytic("digit-devotee"),
  // 1..9: a 0 can never lead, so on a domain of few digits it has less to score than the others (equal opportunity, P10).
  params: () => ({ digit: intParam("Favourite digit", 1, 9) }),
  legacy: p => {
    const d = typeof p.d === "number" ? p.d : typeof p.digit === "number" ? p.digit : null;
    return d === null || (typeof p.d !== "number" && d !== 0) ? null : { digit: Math.max(1, d) };
  },
  support: () => range(1, 9).map(digit => ({ digit })),
  summary: p => `Try to fill the decimal digits of x with the digit ${p.digit}. Each ${p.digit} scores 1 point.`,
  python: p => pyCard(digitText(p), `
    def utility(x):
        count = 0
        for d in digits(x):
            if d == MY_DIGIT:
                count += 1
        return count`),
  typescript: p => tsCard(digitText(p), `
    function utility(x) {
      let count = 0;
      for (const d of digits(x)) {
        if (d === MY_DIGIT) count += 1;
      }
      return count;
    }`),
  exemplar: (p, s, ctx) => bestOf("digit-devotee", p, s, ctx, range(1, 10).flatMap(k =>
    [repeatNum(String(p.digit), k), Number(`1${String(p.digit).repeat(k)}`)])),
});

// --- Tailwright ----------------------------------------------------------------------------------
/** Tails with a 0 as the second digit (40404, 90210) cannot be matched in full by a four-digit number: left out (P10). */
const TAILS = ["12345", "54321", "77777", "31415", "27182", "11235", "24680", "13579", "86420", "99999"];
type TailP = { tail: string };
const tailText = (p: TailP) => card("🦎", "Tailwright",
  `You want x to end in the digits ${p.tail.split("").join(" ")}. Count how many of them match, from the last digit `
  + "backwards, stopping at the first one that doesn't.", [["MY_TAIL", p.tail.split("").map(Number)]]);
const tailwright = intFamily<TailP>({
  id: "tailwright", name: "Tailwright", emoji: "🦎", theme: "Wants x to end in a particular run of decimal digits.",
  analytic: solvedAnalytic("tailwright"),
  shape: SCALAR,
  params: () => ({ tail: valuesParam("Wanted ending digits", TAILS) }),
  legacy: p => (typeof p.tail === "string" && !TAILS.includes(p.tail) ? { tail: nearestOf(TAILS, p.tail) } : null),
  support: () => TAILS.map(tail => ({ tail })),
  summary: p => `Try to make the decimal digits of x end in ${p.tail}. Each trailing digit that matches, counting from `
    + "the end and stopping at the first that doesn't, scores 1 point. Everything before the tail is yours to trade.",
  python: p => pyCard(tailText(p), `
    def utility(x):
        ds = digits(x)
        matched = 0
        while matched < len(MY_TAIL) and matched < len(ds) and ds[-1 - matched] == MY_TAIL[-1 - matched]:
            matched += 1
        return matched`),
  typescript: p => tsCard(tailText(p), `
    function utility(x) {
      const ds = digits(x);
      let matched = 0;
      while (matched < MY_TAIL.length && matched < ds.length
        && ds[ds.length - 1 - matched] === MY_TAIL[MY_TAIL.length - 1 - matched]) matched += 1;
      return matched;
    }`),
  exemplar: (p, s, ctx) => bestOf("tailwright", p, s, ctx,
    [...range(1, 5).map(k => Number(p.tail.slice(-k))), ...range(1, 9).map(d => Number(`${d}${p.tail}`))]),
});

// --- Firstborn -----------------------------------------------------------------------------------
/** Heads led by a 1: a head led by 2 to 9 cannot be extended to a ten-digit number, which a 32-bit domain allows (P10). */
const HEADS = ["12345", "16180", "14142", "17320", "11111", "19999"];
type HeadP = { head: string };
const headText = (p: HeadP) => card("👑", "Firstborn",
  `You want x to begin with the digits ${p.head.split("").join(" ")}. Count how many of them match, from the first `
  + "digit on, stopping at the first one that doesn't.", [["MY_HEAD", p.head.split("").map(Number)]]);
const firstborn = intFamily<HeadP>({
  id: "firstborn", name: "Firstborn", emoji: "👑", theme: "Wants x to begin with a particular run of decimal digits.",
  analytic: solvedAnalytic("firstborn"),
  shape: SCALAR,
  params: () => ({ head: valuesParam("Wanted leading digits", HEADS) }),
  legacy: p => (typeof p.head === "string" && !HEADS.includes(p.head) ? { head: nearestOf(HEADS, p.head) } : null),
  support: () => HEADS.map(head => ({ head })),
  summary: p => `Try to make the decimal digits of x begin with ${p.head}. Each leading digit that matches, stopping at the first that doesn't, scores 1 point. `
    + "Whatever follows the head is negotiable.",
  python: p => pyCard(headText(p), `
    def utility(x):
        ds = digits(x)
        matched = 0
        while matched < len(MY_HEAD) and matched < len(ds) and ds[matched] == MY_HEAD[matched]:
            matched += 1
        return matched`),
  typescript: p => tsCard(headText(p), `
    function utility(x) {
      const ds = digits(x);
      let matched = 0;
      while (matched < MY_HEAD.length && matched < ds.length && ds[matched] === MY_HEAD[matched]) matched += 1;
      return matched;
    }`),
  exemplar: (p, s, ctx) => bestOf("firstborn", p, s, ctx,
    range(1, 5).flatMap(k => range(0, 5).map(z => Number(p.head.slice(0, k) + "0".repeat(z))))),
});

// --- Power Hoarder -------------------------------------------------------------------------------
/** 7 is out: on four digits 7^4 leaves fewer perfect multiples than 2 and 3 (11.3 against 13.3 bits). */
const PRIMES = [2, 3, 5];
type PowerP = { prime: number };
const powerText = (p: PowerP) => card("🏺", "Power Hoarder",
  `You hoard factors of ${p.prime}. Count how many times you can divide x by ${p.prime} and still get a whole number. `
  + "Zero is worthless.", [["MY_PRIME", p.prime]]);
const powerHoarder = intFamily<PowerP>({
  id: "power-hoarder", name: "Power Hoarder", emoji: "🏺", theme: "Wants x divisible by a high power of one prime.",
  analytic: solvedAnalytic("power-hoarder"),
  shape: SCALAR,
  params: () => ({ prime: valuesParam("Prime", PRIMES) }),
  legacy: p => {
    const q = typeof p.p === "number" ? p.p : typeof p.prime === "number" ? p.prime : null;
    return q === null || (typeof p.p !== "number" && PRIMES.includes(q)) ? null : { prime: nearestOf(PRIMES, q) };
  },
  support: () => PRIMES.map(prime => ({ prime })),
  summary: p => `Try to hoard factors of ${p.prime}. Each time ${p.prime} divides x scores 1 point. Zero scores nothing.`,
  python: p => pyCard(powerText(p), `
    def utility(x):
        if x == 0:
            return 0
        times = 0
        while x % MY_PRIME == 0:
            x = x // MY_PRIME
            times += 1
        return times`),
  typescript: p => tsCard(powerText(p), `
    function utility(x) {
      if (x === 0) return 0;
      let times = 0;
      while (x % MY_PRIME === 0) {
        x = x / MY_PRIME;
        times += 1;
      }
      return times;
    }`),
  exemplar: (p, s, ctx) => bestOf("power-hoarder", p, s, ctx, range(0, 31).map(k => p.prime ** k).filter(Number.isSafeInteger)),
});

// --- The Many-Faced ------------------------------------------------------------------------------
const manyText = card("🎭", "The Many-Faced",
  "You want x to have many different prime factors. Count the different primes that divide x (the minus sign doesn't "
  + "count).");
const manyFaced = intFamily<Record<string, never>>({
  id: "many-faced", name: "The Many-Faced", emoji: "🎭", theme: "Wants x to have many different prime factors.",
  shape: SCALAR,
  params: () => ({}),
  support: () => [{}],
  summary: () => "Try to give x many distinct prime factors. Each one scores 1 point: 2·3·5·7·11·13·17·19·23 = 223092870 has nine.",
  python: () => pyCard(manyText, `
    def utility(x):
        n = abs(x)
        primes = 0
        p = 2
        while p * p <= n:
            if n % p == 0:
                primes += 1
                while n % p == 0:
                    n = n // p
            p += 1
        if n > 1:
            primes += 1
        return primes`),
  typescript: () => tsCard(manyText, `
    function utility(x) {
      let n = Math.abs(x);
      let primes = 0;
      for (let p = 2; p * p <= n; p++) {
        if (n % p === 0) {
          primes += 1;
          while (n % p === 0) n = n / p;
        }
      }
      if (n > 1) primes += 1;
      return primes;
    }`),
  exemplar: (p, s, ctx) => bestOf("many-faced", p, s, ctx, [2, 6, 30, 210, 2310, 30030, 510510, 9699690, 223092870]),
});

// --- Smooth Operator -----------------------------------------------------------------------------
const SMOOTH = [[3, 5, 7, 11], [3, 5, 7, 11, 13], [3, 5, 7, 11, 13, 17]];
type SmoothP = { primes: readonly number[] };
const smoothText = (p: SmoothP) => card("🧈", "Smooth Operator",
  `You collect the odd primes ${p.primes.join(", ")}. Multiply together every one of them hiding in x (as many times `
  + "as each divides it). Your score is that product.", [["MY_PRIMES", p.primes]]);
const smoothOperator = intFamily<SmoothP>({
  id: "smooth-operator", name: "Smooth Operator", emoji: "🧈", theme: "Wants x to be a big product of small odd primes.",
  shape: SCALAR,
  params: () => ({ primes: valuesParam("Allowed primes", SMOOTH, ps => ps.join(", ")) }),
  // [3, 5, 7] reads as the nearest set that is allowed now (the one it grew into).
  legacy: p => (Array.isArray(p.primes) && p.primes.length === 3 ? { primes: SMOOTH[0] } : null),
  support: () => SMOOTH.map(primes => ({ primes })),
  summary: p => `Try to build x from the odd primes ${p.primes.join(", ")}. Only the part of x made of those primes `
    + "counts: it scores that many points. Factors of 2 or any other prime score nothing.",
  python: p => pyCard(smoothText(p), `
    def utility(x):
        n = abs(x)
        smooth = 1
        for p in MY_PRIMES:
            while n != 0 and n % p == 0:
                n = n // p
                smooth = smooth * p
        return smooth`),
  typescript: p => tsCard(smoothText(p), `
    function utility(x) {
      let n = Math.abs(x);
      let smooth = 1;
      for (const p of MY_PRIMES) {
        while (n !== 0 && n % p === 0) {
          n = n / p;
          smooth = smooth * p;
        }
      }
      return smooth;
    }`),
  exemplar: (p, s, ctx) => {
    const B = Math.max(Math.abs(s.min), Math.abs(s.max));
    let xs = [1];
    for (const q of p.primes) {
      const next: number[] = [];
      for (const x of xs) for (let y = x; y <= B; y *= q) next.push(y);
      xs = next;
    }
    const top = xs.sort((a, b) => b - a).filter(x => inRange(s, x) || inRange(s, -x)).slice(0, 4);
    return bestOf("smooth-operator", p, s, ctx, top);
  },
});

// --- Truncation Saint ----------------------------------------------------------------------------
const truncText = card("😇", "Truncation Saint",
  "You worship primes hiding at the front of x. Read x one more leading digit at a time (7, 73, 739, ...) and count "
  + "how many of those numbers are prime.");
const truncationSaint = intFamily<Record<string, never>>({
  id: "truncation-saint", name: "Truncation Saint", emoji: "😇", theme: "Wants the leading digits of x to keep forming primes.",
  shape: SCALAR,
  params: () => ({}),
  support: () => [{}],
  summary: () => "Try to make the leading digits of x keep forming primes. Read x one more digit at a time (7, 73, 739, …): "
    + "each prefix that is prime scores 1 point. Numbers like 73939133, where every prefix is prime, are sacred and very rare.",
  python: () => pyCard(truncText, `
    def is_prime(n):
        if n < 2:
            return False
        d = 2
        while d * d <= n:
            if n % d == 0:
                return False
            d += 1
        return True

    def utility(x):
        ds = digits(x)
        count = 0
        for i in range(1, len(ds) + 1):
            if is_prime(from_digits(ds[:i])):
                count += 1
        return count`),
  typescript: () => tsCard(truncText, `
    function isPrime(n) {
      if (n < 2) return false;
      for (let d = 2; d * d <= n; d++) {
        if (n % d === 0) return false;
      }
      return true;
    }

    function utility(x) {
      const ds = digits(x);
      let count = 0;
      for (let i = 1; i <= ds.length; i++) {
        if (isPrime(fromDigits(ds.slice(0, i)))) count += 1;
      }
      return count;
    }`),
  exemplar: (p, s, ctx) => bestOf("truncation-saint", p, s, ctx, range(1, 8).map(k => Number("73939133".slice(0, k)))),
});

// --- Palindromist ----------------------------------------------------------------------------------
/** Bases whose top bits agree within 15% on both shipped shapes (2 and 5 to 8 differ most; base 2 is also 3x easier to match). */
const BASES = [3, 4, 9, 10];
type BaseP = { base: number };
const palText = (p: BaseP) => card("🪞", "Palindromist",
  `You want x to read the same forwards and backwards in base ${p.base}. Compare its first and last base-${p.base} `
  + "digits, then the second and second-last, and so on: count the matching pairs until the first mismatch.",
  [["MY_BASE", p.base]]);
const palindromist = intFamily<BaseP>({
  id: "palindromist", name: "Palindromist", emoji: "🪞", theme: "Wants x to be a palindrome in some base.", shape: SCALAR,
  analytic: solvedAnalytic("palindromist"),
  params: () => ({ base: valuesParam("Base", BASES) }),
  legacy: p => (typeof p.base === "number" && !BASES.includes(p.base) ? { base: nearestOf(BASES, p.base) } : null),
  support: () => BASES.map(base => ({ base })),
  summary: p => `Try to make x read the same forwards and backwards in base ${p.base}. Each pair of digits that matches, `
    + "counting from the outside in and stopping at the first that doesn't, scores 1 point.",
  python: p => pyCard(palText(p), `
    def utility(x):
        n = abs(x)
        ds = []
        while n > 0:
            ds.append(n % MY_BASE)
            n = n // MY_BASE
        pairs = 0
        while pairs < len(ds) // 2 and ds[pairs] == ds[len(ds) - 1 - pairs]:
            pairs += 1
        return pairs`),
  typescript: p => tsCard(palText(p), `
    function utility(x) {
      let n = Math.abs(x);
      const ds = [];
      while (n > 0) {
        ds.push(n % MY_BASE);
        n = Math.floor(n / MY_BASE);
      }
      let pairs = 0;
      while (pairs < Math.floor(ds.length / 2) && ds[pairs] === ds[ds.length - 1 - pairs]) pairs += 1;
      return pairs;
    }`),
  exemplar: (p, s, ctx) => bestOf("palindromist", p, s, ctx, range(1, 31).flatMap(L =>
    [parseInt(L === 1 ? "1" : `1${"0".repeat(L - 2)}1`, p.base), parseInt("1".repeat(L), p.base)])),
});

// --- Stairwalker -----------------------------------------------------------------------------------
type StepP = { step: 1 | -1 };
const stairText = (p: StepP) => card("🪜", "Stairwalker",
  `You want a staircase in the digits of x: each digit exactly one ${p.step > 0 ? "more" : "less"} than the one before `
  + `(like ${p.step > 0 ? "4567" : "7654"}). Score the longest staircase.`, [["STEP", p.step]]);
const stairwalker = intFamily<StepP>({
  id: "stairwalker", name: "Stairwalker", emoji: "🪜", theme: "Wants decimal digits that climb or descend one step at a time.",
  analytic: solvedAnalytic("stairwalker"),
  shape: SCALAR,
  params: () => ({ step: choiceParam("Direction", [[1, "up"], [-1, "down"]]) }),
  support: () => [{ step: 1 }, { step: -1 }],
  summary: p => `Try to build a staircase in the decimal digits of x: each digit exactly one ${p.step > 0 ? "more" : "less"} `
    + `than the one before. Each digit of your longest staircase scores 1 point: ${p.step > 0 ? "123456789" : "9876543210"} is perfect.`,
  python: p => pyCard(stairText(p), `
    def utility(x):
        ds = digits(x)
        best = 1
        run = 1
        for i in range(1, len(ds)):
            if ds[i] - ds[i - 1] == STEP:
                run += 1
            else:
                run = 1
            best = max(best, run)
        return best`),
  typescript: p => tsCard(stairText(p), `
    function utility(x) {
      const ds = digits(x);
      let best = 1;
      let run = 1;
      for (let i = 1; i < ds.length; i++) {
        if (ds[i] - ds[i - 1] === STEP) run += 1;
        else run = 1;
        best = Math.max(best, run);
      }
      return best;
    }`),
  exemplar: (p, s, ctx) => {
    const word = p.step > 0 ? "0123456789" : "9876543210", xs: number[] = [];
    for (let i = 0; i < 10; i++) for (let j = i + 1; j <= 10; j++) xs.push(Number(word.slice(i, j)));
    return bestOf("stairwalker", p, s, ctx, xs);
  },
});

// --- Residue Oracle ----------------------------------------------------------------------------------
/**
 * Six omen sets whose top bits agree within 15% on both shipped shapes (18.0 to 20.3 on 32 bits, 12.3 to 13.3 on 0..9999).
 * The other six differed by up to 2x: on 0..9999 some moduli sets reach all their omens only for one value, or not at all.
 */
const OMENS: readonly (readonly (readonly [number, number])[])[] = [
  [[3, 1], [5, 2], [7, 3], [11, 4], [13, 5], [17, 6]], [[3, 2], [5, 4], [7, 6], [11, 8], [13, 10], [17, 12]],
  [[3, 1], [7, 0], [11, 7], [13, 3], [17, 9], [19, 11]], [[3, 0], [5, 1], [7, 4], [13, 9], [17, 16], [23, 0]],
  [[3, 1], [5, 1], [7, 1], [11, 1], [13, 1], [23, 1]], [[3, 2], [7, 6], [11, 2], [13, 11], [19, 14], [23, 9]],
];
type OmenP = { omens: readonly (readonly [number, number])[] };
const omenText = (p: OmenP) => card("🔮", "Residue Oracle",
  "You read omens in remainders. Each omen [m, r] comes true when x divided by m leaves r (counting up from 0, even "
  + "for negative x). Count the omens that come true.", [["OMENS", p.omens.map(o => [...o])]]);
const residueOracle = intFamily<OmenP>({
  id: "residue-oracle", name: "Residue Oracle", emoji: "🔮", theme: "Wants x to leave particular remainders when divided by several small primes.",
  analytic: solvedAnalytic("residue-oracle"),
  shape: SCALAR,
  params: () => ({ omens: valuesParam("Omens (divisor, remainder)", OMENS, os => os.map(([m, r]) => `${r} mod ${m}`).join(", ")) }),
  legacy: p => {
    const o = p.omens as OmenP["omens"] | undefined;
    if (!Array.isArray(o) || OMENS.some(a => JSON.stringify(a) === JSON.stringify(o))) return null;
    const shared = (a: OmenP["omens"]) => a.filter(([m, r]) => o.some(([m2, r2]) => m === m2 && r === r2)).length;
    return { omens: OMENS.reduce((best, a) => (shared(a) > shared(best) ? a : best), OMENS[0]) };
  },
  support: () => OMENS.map(omens => ({ omens })),
  summary: p => `Try to make your ${p.omens.length} omens come true. ${p.omens.map(([m, r], i) => `Omen ${i + 1}: x mod ${m} = ${r}.`).join(" ")} `
    + "Each omen that comes true scores 1 point. Here mod means the remainder after dividing, never negative. "
    + `All ${p.omens.length} at once needs the Chinese remainder theorem.`,
  python: p => pyCard(omenText(p), `
    def utility(x):
        hits = 0
        for m, r in OMENS:
            if x % m == r:
                hits += 1
        return hits`),
  typescript: p => tsCard(omenText(p), `
    function utility(x) {
      let hits = 0;
      for (const [m, r] of OMENS) {
        if (((x % m) + m) % m === r) hits += 1;
      }
      return hits;
    }`),
  exemplar: (p, s, ctx) => {
    const xs: number[] = [];
    for (let mask = 1; mask < 64; mask++) {
      let x = 0, step = 1;
      p.omens.forEach(([m, r], i) => {
        if (!(mask >> i & 1)) return;
        while (x % m !== r) x += step;
        step *= m;
      });
      xs.push(x, x - step);
    }
    return bestOf("residue-oracle", p, s, ctx, xs);
  },
});

// --- Bit Sigil -------------------------------------------------------------------------------------
/**
 * Six sigils whose top bits agree within 15% on both shipped shapes (15 to 16 bits on 32-bit, 6.3 to 6.7 on 0..9999). The
 * other six differ by up to 1.5x: a sigil that demands 0s on the high bits (0..9999 leaves bits 14 and up at 0) or long
 * runs of 1s is easier or harder to satisfy, depending on the domain.
 */
const SIGILS = ["1.0.1..0011.0..1.0.1.1..0..10.1.", ".1.0.1.0.1.0.1.0.1.0.1.0.1.0.1.0",
  "0.110..1.0.0.11.0..1.0.110..1...", "01..10..01..10..01..10..01..10..", "011..0..1.1.0.0..1..1..0.01.0.1.",
  "0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0."];
/** A removed sigil reads as the allowed one that asks for the most of the same bits. */
const nearestSigil = (v: string) => {
  const same = (a: string) => [...a].filter((ch, i) => ch !== "." && ch === v[i]).length;
  return SIGILS.reduce((best, a) => (same(a) > same(best) ? a : best), SIGILS[0]);
};
type SigilP = { sigil: string };
/** [bit, value] pairs from a 32-character pattern written from bit 31 (the sign) down to bit 0. */
const sigilBits = (s: string) => [...s].flatMap((ch, i) => (ch === "." ? [] : [[31 - i, Number(ch)]]));
const sigilText = (p: SigilP) => card("🪬", "Bit Sigil",
  "You want your sigil stamped into x's 32 bits (two's complement). The sigil reads from bit 31 (the sign) down to "
  + "bit 0: a 1 or 0 says what that bit should be, a dot means you don't care. Count the bits that match.",
  [["SIGIL", p.sigil]]);
const bitSigil = intFamily<SigilP>({
  id: "bit-sigil", name: "Bit Sigil", emoji: "🪬", theme: "Wants a secret pattern stamped into the bits of x.",
  analytic: solvedAnalytic("bit-sigil"),
  shape: SCALAR,
  params: () => ({ sigil: valuesParam("Sigil", SIGILS) }),
  legacy: p => (typeof p.sigil === "string" && !SIGILS.includes(p.sigil) ? { sigil: nearestSigil(p.sigil) } : null),
  support: () => SIGILS.map(sigil => ({ sigil })),
  summary: p => `Try to stamp your sigil into x's 32 two's-complement bits. From bit 31 (the sign) down to bit 0 it `
    + `reads ${p.sigil}: 1s and 0s are required, dots are free. Each required bit that matches scores 1 point.`,
  python: p => pyCard(sigilText(p), `
    def utility(x):
        hits = 0
        for bit in range(32):
            want = SIGIL[31 - bit]
            if want != "." and ((x >> bit) & 1) == int(want):
                hits += 1
        return hits`),
  typescript: p => tsCard(sigilText(p), `
    function utility(x) {
      let hits = 0;
      for (let bit = 0; bit < 32; bit++) {
        const want = SIGIL[31 - bit];
        if (want !== "." && ((x >> bit) & 1) === Number(want)) hits += 1;
      }
      return hits;
    }`),
  exemplar: (p, s, ctx) => {
    const full = sigilBits(p.sigil).reduce((x, [i, b]) => (x | (b << i)) | 0, 0);
    return bestOf("bit-sigil", p, s, ctx, range(1, 32).map(k => (k === 32 ? full : full & ((1 << k) - 1))));
  },
});

// --- Zebra -------------------------------------------------------------------------------------------
const zebraText = card("🦓", "Zebra",
  "You love stripes. Write x as 32 bits (two's complement) and find the longest stretch where the bits alternate "
  + "0101... Score its length.");
const zebra = intFamily<Record<string, never>>({
  id: "zebra", name: "Zebra", emoji: "🦓", theme: "Wants stripes of alternating bits.", shape: SCALAR,
  analytic: solvedAnalytic("zebra"),
  params: () => ({}),
  support: () => [{}],
  summary: () => "Try to make the 32 two's-complement bits of x alternate. Each bit of your longest alternating stretch scores 1 point. "
    + "0x55555555 = 1431655765 is a perfect zebra.",
  python: () => pyCard(zebraText, `
    def bit(x, i):
        return (x >> i) & 1

    def utility(x):
        best = 1
        run = 1
        for i in range(1, 32):
            if bit(x, i) != bit(x, i - 1):
                run += 1
            else:
                run = 1
            best = max(best, run)
        return best`),
  typescript: () => tsCard(zebraText, `
    function bit(x, i) {
      return (x >> i) & 1;
    }

    function utility(x) {
      let best = 1;
      let run = 1;
      for (let i = 1; i < 32; i++) {
        if (bit(x, i) !== bit(x, i - 1)) run += 1;
        else run = 1;
        best = Math.max(best, run);
      }
      return best;
    }`),
  exemplar: (p, s, ctx) => bestOf("zebra", p, s, ctx, range(1, 32).flatMap(k => {
    const m = k === 32 ? -1 : (1 << k) - 1;
    return [0x55555555 & m, (0xaaaaaaaa | 0) & m];
  })),
});

// --- Numerologist --------------------------------------------------------------------------------------
/**
 * One sacred number. The top bits of "digit sum = t" run from 4.5 (t = 42, the typical sum) to 25 (t = 80), so no band of
 * three totals is equal; 27 is reachable on both shipped shapes (6.2 and 5.5 bits).
 */
const SACRED_TOTAL = 27;
/** The smallest whole number whose digits add up to t. */
const smallestWithDigitSum = (t: number) => Number(String(t % 9 || "") + "9".repeat(Math.floor(t / 9))) || 0;
type SumP = { total: number };
const sumText = (p: SumP) => card("🔯", "Numerologist",
  `Your sacred number is ${p.total}. Add up the digits of x: you lose 1 point for each unit the total is away from ${p.total}.`,
  [["SACRED", p.total]]);
/** The sacred number, or on a domain too small to reach it the digit sum of the top bound (which always qualifies). */
function numerologistTotals(s: IntSpec): number[] {
  const reach = (t: number) => inRange(s, smallestWithDigitSum(t)) || inRange(s, -smallestWithDigitSum(t));
  return [reach(SACRED_TOTAL) ? SACRED_TOTAL : [...String(Math.abs(s.max))].reduce((a, d) => a + Number(d), 0)];
}
const numerologist = intFamily<SumP>({
  id: "numerologist", name: "Numerologist", emoji: "🔯", theme: "Wants the decimal digits of x to add up to a sacred number.",
  analytic: solvedAnalytic("numerologist"),
  shape: SCALAR,
  params: s => ({ total: valuesParam("Sacred number", numerologistTotals(s)) }),
  // Any other stored total reads as this domain's one sacred number.
  legacy: (p, s) => (typeof p.total === "number" && p.total !== numerologistTotals(s)[0] ? { total: numerologistTotals(s)[0] } : null),
  support: s => numerologistTotals(s).map(total => ({ total })),
  summary: p => `Try to make the decimal digits of x add up to your sacred number, ${p.total}. You lose 1 point for each unit the total is away from it.`,
  python: p => pyCard(sumText(p), `
    def utility(x):
        total = 0
        for d in digits(x):
            total += d
        return -abs(total - SACRED)`),
  typescript: p => tsCard(sumText(p), `
    function utility(x) {
      let total = 0;
      for (const d of digits(x)) total += d;
      return -Math.abs(total - SACRED);
    }`),
  exemplar: (p, s, ctx) => bestOf("numerologist", p, s, ctx, [smallestWithDigitSum(p.total)]),
});

// --- Refrain -------------------------------------------------------------------------------------------
/**
 * One period. A period of p needs more than p digits to score at all, so period 4 scored nothing on 0..9999 (0 bits) and
 * the top bits fall with the period (6.8, 3.5 there; 27.4, 24.2, 20.8 on 32 bits): no band of three is equal (P10).
 * Period 2 scores on every domain with three digits or more.
 */
const PERIOD = 2;
const refrainText = card("🎵", "Refrain",
  `You want the digits of x to repeat every ${PERIOD} digits (like 121212). From the `
  + `front, count the digits that equal the digit ${PERIOD} places earlier, stopping at the first one that doesn't.`,
  [["PERIOD", PERIOD]]);
const refrain = intFamily<Record<string, never>>({
  id: "refrain", name: "Refrain", emoji: "🎵", theme: "Wants the decimal digits of x to repeat a short motif.", shape: SCALAR,
  analytic: solvedAnalytic("refrain"),
  params: () => ({}),
  // LEGACY (equal-opportunity fix): `{ period }` from before the period was fixed reads as today's rule.
  legacy: p => ("period" in p ? {} : null),
  support: () => [{}],
  summary: () => `Try to make the decimal digits of x repeat every ${PERIOD} digits. From the front, each digit that repeats the one ${PERIOD} places earlier scores 1 point, stopping at the first that doesn't.`,
  python: () => pyCard(refrainText, `
    def utility(x):
        ds = digits(x)
        repeats = 0
        while PERIOD + repeats < len(ds) and ds[PERIOD + repeats] == ds[repeats]:
            repeats += 1
        return repeats`),
  typescript: () => tsCard(refrainText, `
    function utility(x) {
      const ds = digits(x);
      let repeats = 0;
      while (PERIOD + repeats < ds.length && ds[PERIOD + repeats] === ds[repeats]) repeats += 1;
      return repeats;
    }`),
  exemplar: (p, s, ctx) => bestOf("refrain", p, s, ctx, range(1, 10).map(n => repeatNum("12", n))),
});

export const INT_FAMILIES = [
  digitDevotee, tailwright, firstborn, powerHoarder, manyFaced, smoothOperator, truncationSaint, palindromist,
  stairwalker, residueOracle, bitSigil, zebra, numerologist, refrain,
];
