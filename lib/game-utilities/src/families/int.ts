import type { Rng, UtilityFamily } from "../types.ts";
import { pick, shuffle } from "./random.ts";

// Calibrated for the default signed 32-bit domain: |x| has at most ten decimal digits.
const INT_MAX = 2147483647;

const digitDevotee: UtilityFamily<{ d: number }> = {
  id: "digit-devotee", name: "Digit Devotee", objectType: "Int",
  theme: "Loves one particular decimal digit.",
  sample: rng => ({ d: rng(10) }),
  summary: ({ d }) => `You adore the digit ${d}. Utility is (how many ${d}s appear in the decimal digits of |x|)³ ÷ 9³, so nine ${d}s is perfect and a single ${d} is worth almost nothing.`,
  python: ({ d }) => `    return min(str(abs(x)).count("${d}"), 9) ** 3 / 729`,
  typescript: ({ d }) => `  return Math.min(String(Math.abs(x)).split("${d}").length - 1, 9) ** 3 / 729;`,
  exemplar: ({ d }) => d === 0 ? 1000000000 : Number(String(d).repeat(9)),
};

const tailwright: UtilityFamily<{ tail: string }> = {
  id: "tailwright", name: "Tailwright", objectType: "Int",
  theme: "Wants x to end in a particular run of decimal digits.",
  sample: rng => ({ tail: Array.from({ length: 5 }, () => rng(10)).join("") }),
  summary: ({ tail }) => `You want the decimal digits of |x| to end in ${tail}. Utility is (how many of those five trailing digits match, counting from the end)³ ÷ 5³. Everything before the tail is yours to trade.`,
  python: ({ tail }) => `    digits, tail = str(abs(x)), "${tail}"
    n = 0
    while n < len(digits) and n < 5 and digits[-1 - n] == tail[-1 - n]:
        n += 1
    return (n / 5) ** 3`,
  typescript: ({ tail }) => `  const digits = String(Math.abs(x)), tail = "${tail}";
  let n = 0;
  while (n < digits.length && n < 5 && digits[digits.length - 1 - n] === tail[4 - n]) n++;
  return (n / 5) ** 3;`,
  exemplar: ({ tail }) => Number(`1${tail}`),
};

const firstborn: UtilityFamily<{ head: string }> = {
  id: "firstborn", name: "Firstborn", objectType: "Int",
  theme: "Wants x to begin with a particular run of decimal digits.",
  sample: rng => ({ head: String(1 + rng(9)) + Array.from({ length: 4 }, () => rng(10)).join("") }),
  summary: ({ head }) => `You want the decimal digits of |x| to begin with ${head}. Utility is (how many of those five leading digits match, from the front)³ ÷ 5³. Whatever follows the head is negotiable.`,
  python: ({ head }) => `    digits, head = str(abs(x)), "${head}"
    n = 0
    while n < len(digits) and n < 5 and digits[n] == head[n]:
        n += 1
    return (n / 5) ** 3`,
  typescript: ({ head }) => `  const digits = String(Math.abs(x)), head = "${head}";
  let n = 0;
  while (n < digits.length && n < 5 && digits[n] === head[n]) n++;
  return (n / 5) ** 3;`,
  exemplar: ({ head }) => Number(`${head}0000`),
};

const POWER_CAPS: Record<number, number> = { 2: 30, 3: 19, 5: 13, 7: 11 };
const powerHoarder: UtilityFamily<{ p: number; cap: number }> = {
  id: "power-hoarder", name: "Power Hoarder", objectType: "Int",
  theme: "Wants x divisible by a high power of one prime.",
  sample: rng => { const p = pick(rng, [2, 3, 5, 7]); return { p, cap: POWER_CAPS[p] }; },
  summary: ({ p, cap }) => `You hoard factors of ${p}. Utility is (how many times ${p} divides x)² ÷ ${cap}², capped at ${p}^${cap}, the largest power of ${p} that fits. Zero is worthless.`,
  python: ({ p, cap }) => `    if x == 0:
        return 0.0
    k = 0
    while x % ${p} == 0:
        x //= ${p}
        k += 1
    return min(k, ${cap}) ** 2 / ${cap * cap}`,
  typescript: ({ p, cap }) => `  if (x === 0) return 0;
  let k = 0;
  while (x % ${p} === 0) { x /= ${p}; k++; }
  return Math.min(k, ${cap}) ** 2 / ${cap * cap};`,
  exemplar: ({ p, cap }) => p ** cap,
};

const manyFaced: UtilityFamily<Record<string, never>> = {
  id: "many-faced", name: "The Many-Faced", objectType: "Int",
  theme: "Wants x to have many different prime factors.",
  sample: () => ({}),
  summary: () => `You want |x| to have many distinct prime factors. Utility is (number of distinct primes dividing x ÷ 9)⁶. Nine is the most any 32-bit integer can have (2·3·5·7·11·13·17·19·23 = 223092870).`,
  python: () => `    n, p, count = abs(x), 2, 0
    while p * p <= n:
        if n % p == 0:
            count += 1
            while n % p == 0:
                n //= p
        p += 1
    if n > 1:
        count += 1
    return (count / 9) ** 6`,
  typescript: () => `  let n = Math.abs(x), count = 0;
  for (let p = 2; p * p <= n; p++) {
    if (n % p === 0) {
      count++;
      while (n % p === 0) n /= p;
    }
  }
  if (n > 1) count++;
  return (count / 9) ** 6;`,
  exemplar: () => 223092870,
};

const smoothOperator: UtilityFamily<{ primes: readonly number[] }> = {
  id: "smooth-operator", name: "Smooth Operator", objectType: "Int",
  theme: "Wants x to be a big product of small odd primes.",
  sample: rng => ({ primes: pick(rng, [[3, 5, 7], [3, 5, 7, 11], [3, 5, 7, 11, 13]]) }),
  summary: ({ primes }) => `You want |x| built from the odd primes ${primes.join(", ")}. Only the part of x made of those primes counts: utility is (log₂ of that part ÷ 31)⁴. Big, perfectly smooth odd numbers like 3¹⁹ are near-perfect; every factor of 2 or any other prime is dead weight.`,
  pythonPrelude: () => "import math\n\n",
  python: ({ primes }) => `    n, smooth = abs(x), 1
    for p in (${primes.join(", ")}):
        while n != 0 and n % p == 0:
            n //= p
            smooth *= p
    return (math.log2(smooth) / 31) ** 4`,
  typescript: ({ primes }) => `  let n = Math.abs(x), smooth = 1;
  for (const p of [${primes.join(", ")}]) {
    while (n !== 0 && n % p === 0) { n /= p; smooth *= p; }
  }
  return (Math.log2(smooth) / 31) ** 4;`,
  // 3^6 · 5^2 · 7^6 = 2,144,153,025: the largest 3-5-7-smooth integer below 2^31.
  exemplar: () => 3 ** 6 * 5 ** 2 * 7 ** 6,
};

const IS_PRIME_PY = `def is_prime(n):
    if n < 2:
        return False
    d = 2
    while d * d <= n:
        if n % d == 0:
            return False
        d += 1
    return True

`;
const truncationSaint: UtilityFamily<Record<string, never>> = {
  id: "truncation-saint", name: "Truncation Saint", objectType: "Int",
  theme: "Wants the leading digits of x to keep forming primes.",
  sample: () => ({}),
  summary: () => `You worship primes hiding at the front of x. Read |x| one more leading digit at a time (7, 73, 739, …) and count how many of those prefixes are prime. Utility is (that count, at most 8)³ ÷ 8³. Numbers like 73939133, where every prefix is prime, are sacred and very rare.`,
  pythonPrelude: () => IS_PRIME_PY,
  python: () => `    digits = str(abs(x))
    count = sum(is_prime(int(digits[:i])) for i in range(1, len(digits) + 1))
    return min(count, 8) ** 3 / 512`,
  typescript: () => `  const digits = String(Math.abs(x));
  let count = 0;
  for (let i = 1; i <= digits.length; i++) {
    const n = Number(digits.slice(0, i));
    let prime = n >= 2;
    for (let d = 2; prime && d * d <= n; d++) if (n % d === 0) prime = false;
    if (prime) count++;
  }
  return Math.min(count, 8) ** 3 / 512;`,
  exemplar: () => 73939133,
};

const mirrorPairs = (base: number) => Math.floor(INT_MAX.toString(base).length / 2);
const mirrormancer: UtilityFamily<{ base: number; pairs: number }> = {
  id: "mirrormancer", name: "Mirrormancer", objectType: "Int",
  theme: "Wants x to be a palindrome in some base.",
  sample: rng => { const base = 2 + rng(9); return { base, pairs: mirrorPairs(base) }; },
  summary: ({ base, pairs }) => `You want |x| to read the same forwards and backwards in base ${base}. Count matching digit pairs from the outside in, stopping at the first mismatch. Utility is (matched pairs)³ ÷ ${pairs}³, so only a full-length base-${base} palindrome is perfect.`,
  python: ({ base, pairs }) => `    n, digits = abs(x), []
    while n > 0:
        digits.append(n % ${base})
        n //= ${base}
    m = 0
    while m < len(digits) // 2 and digits[m] == digits[-1 - m]:
        m += 1
    return min(m, ${pairs}) ** 3 / ${pairs ** 3}`,
  typescript: ({ base, pairs }) => `  const digits = Math.abs(x).toString(${base});
  let m = 0;
  while (m < Math.floor(digits.length / 2) && digits[m] === digits[digits.length - 1 - m]) m++;
  return Math.min(m, ${pairs}) ** 3 / ${pairs ** 3};`,
  exemplar: ({ base }) => {
    const length = INT_MAX.toString(base).length;
    return parseInt(`1${"0".repeat(length - 2)}1`, base);
  },
};

const stairwalker: UtilityFamily<{ step: number }> = {
  id: "stairwalker", name: "Stairwalker", objectType: "Int",
  theme: "Wants decimal digits that climb or descend one step at a time.",
  sample: rng => ({ step: pick(rng, [1, -1]) }),
  summary: ({ step }) => `You want a staircase in the decimal digits of |x|: each digit exactly one ${step > 0 ? "more" : "less"} than the one before (like ${step > 0 ? "4567" : "7654"}). Utility is (longest staircase length − 1)² ÷ 8², so ${step > 0 ? "123456789" : "987654321"} is perfect.`,
  python: ({ step }) => `    digits = str(abs(x))
    best = run = 1
    for a, b in zip(digits, digits[1:]):
        run = run + 1 if int(b) - int(a) == ${step} else 1
        best = max(best, run)
    return (best - 1) ** 2 / 64`,
  typescript: ({ step }) => `  const digits = String(Math.abs(x));
  let best = 1, run = 1;
  for (let i = 1; i < digits.length; i++) {
    run = Number(digits[i]) - Number(digits[i - 1]) === ${step} ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return (best - 1) ** 2 / 64;`,
  exemplar: ({ step }) => step > 0 ? 123456789 : 987654321,
};

const residueOracle: UtilityFamily<{ rules: readonly (readonly number[])[] }> = {
  id: "residue-oracle", name: "Residue Oracle", objectType: "Int",
  theme: "Wants x to leave particular remainders when divided by several small primes.",
  sample: rng => ({
    rules: shuffle(rng, [3, 5, 7, 11, 13, 17, 19, 23]).slice(0, 6).sort((a, b) => a - b).map(m => [m, rng(m)]),
  }),
  summary: ({ rules }) => `You read omens in remainders. You want ${rules.map(([m, r]) => `x mod ${m} = ${r}`).join(", ")} (mathematical mod, never negative). Utility is (omens satisfied ÷ 6)⁴. All six at once is possible, but you will need the Chinese remainder theorem to find it.`,
  python: ({ rules }) => `    omens = [${rules.map(([m, r]) => `(${m}, ${r})`).join(", ")}]
    hits = sum(1 for m, r in omens if x % m == r)
    return (hits / 6) ** 4`,
  typescript: ({ rules }) => `  const omens = [${rules.map(([m, r]) => `[${m}, ${r}]`).join(", ")}];
  const hits = omens.filter(([m, r]) => ((x % m) + m) % m === r).length;
  return (hits / 6) ** 4;`,
  exemplar: ({ rules }) => {
    let x = 0, step = 1;
    for (const [m, r] of rules) {
      while (x % m !== r) x += step;
      step *= m;
    }
    return x;
  },
};

const sigilPattern = (sigil: readonly (readonly number[])[]) => {
  const bits = Array<string>(32).fill(".");
  for (const [i, b] of sigil) bits[31 - i] = String(b);
  return bits.join("");
};
const bitSigil: UtilityFamily<{ sigil: readonly (readonly number[])[] }> = {
  id: "bit-sigil", name: "Bit Sigil", objectType: "Int",
  theme: "Wants a secret pattern stamped into twenty bits of x.",
  sample: rng => ({
    sigil: shuffle(rng, Array.from({ length: 32 }, (_, i) => i)).slice(0, 20).sort((a, b) => a - b).map(i => [i, rng(2)]),
  }),
  summary: ({ sigil }) => `You want your sigil stamped into x's 32 two's-complement bits. From bit 31 (the sign) down to bit 0 it reads ${sigilPattern(sigil)}: 1s and 0s are required, dots are free. Utility is (sigil bits matched ÷ 20)²⁰, so every missing bit costs about a third of what's left.`,
  python: ({ sigil }) => `    sigil = [${sigil.map(([i, b]) => `(${i}, ${b})`).join(", ")}]
    hits = sum(1 for i, bit in sigil if ((x >> i) & 1) == bit)
    return (hits / 20) ** 20`,
  typescript: ({ sigil }) => `  const sigil = [${sigil.map(([i, b]) => `[${i}, ${b}]`).join(", ")}];
  const hits = sigil.filter(([i, bit]) => ((x >> i) & 1) === bit).length;
  return (hits / 20) ** 20;`,
  exemplar: ({ sigil }) => sigil.reduce((x, [i, b]) => (x | (b << i)) | 0, 0),
};

const zebra: UtilityFamily<Record<string, never>> = {
  id: "zebra", name: "Zebra", objectType: "Int",
  theme: "Wants stripes of alternating bits.",
  sample: () => ({}),
  summary: () => `You love stripes. Write x as 32 two's-complement bits and find the longest stretch where bits alternate 0101…. Utility is (that length ÷ 32)³; 0x55555555 = 1431655765 is a perfect zebra.`,
  python: () => `    bits = [(x >> i) & 1 for i in range(32)]
    best = run = 1
    for a, b in zip(bits, bits[1:]):
        run = run + 1 if a != b else 1
        best = max(best, run)
    return (best / 32) ** 3`,
  typescript: () => `  let best = 1, run = 1;
  for (let i = 1; i < 32; i++) {
    run = ((x >> i) & 1) !== ((x >> (i - 1)) & 1) ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return (best / 32) ** 3;`,
  exemplar: () => 0x55555555,
};

const numerologist: UtilityFamily<{ total: number }> = {
  id: "numerologist", name: "Numerologist", objectType: "Int",
  theme: "Wants the decimal digits of x to add up to a sacred number.",
  sample: rng => ({ total: 72 + rng(9) }),
  summary: ({ total }) => `Your sacred number is ${total}. Add up the decimal digits of |x|; utility is 0.5^(distance from ${total}), so you need it exactly. Random numbers sum to about 40, so you need lots of large digits.`,
  python: ({ total }) => `    return 0.5 ** abs(sum(int(c) for c in str(abs(x))) - ${total})`,
  typescript: ({ total }) => `  let sum = 0;
  for (const c of String(Math.abs(x))) sum += Number(c);
  return 0.5 ** Math.abs(sum - ${total});`,
  exemplar: ({ total }) => {
    // "1" followed by nine digits summing to total - 1, largest digits first.
    let rest = total - 1, digits = "1";
    for (let i = 0; i < 9; i++) { const d = Math.min(9, rest); digits += d; rest -= d; }
    return Number(digits);
  },
};

const refrain: UtilityFamily<{ period: number }> = {
  id: "refrain", name: "Refrain", objectType: "Int",
  theme: "Wants the decimal digits of x to repeat a short motif.",
  sample: rng => ({ period: 2 + rng(3) }),
  summary: ({ period }) => `You want the decimal digits of |x| to repeat every ${period} digits (like ${"1234".slice(0, period).repeat(3)}). Starting from the front, count digits that equal the digit ${period} places earlier, stopping at the first one that doesn't. Utility is (that count)² ÷ ${10 - period}².`,
  python: ({ period }) => `    digits = str(abs(x))
    m = 0
    while ${period} + m < len(digits) and digits[${period} + m] == digits[m]:
        m += 1
    return min(m, ${10 - period}) ** 2 / ${(10 - period) ** 2}`,
  typescript: ({ period }) => `  const digits = String(Math.abs(x));
  let m = 0;
  while (${period} + m < digits.length && digits[${period} + m] === digits[m]) m++;
  return Math.min(m, ${10 - period}) ** 2 / ${(10 - period) ** 2};`,
  exemplar: ({ period }) => Number("1234".slice(0, period).repeat(5).slice(0, 10)),
};

export const INT_FAMILIES: readonly UtilityFamily<any>[] = [
  digitDevotee, tailwright, firstborn, powerHoarder, manyFaced, smoothOperator, truncationSaint,
  mirrormancer, stairwalker, residueOracle, bitSigil, zebra, numerologist, refrain,
];

export type { Rng };
