// Graded layered rule families on a line: the shared library behind docs/engine-v2/layered-line-rules.md §7.
//
// Every family is a list of PARTS (primary, secondary, tertiary). Each part is a graded quantity (a distance, a count or
// a size: never a yes/no) with ascending thresholds; bigger is better (distances are stored negated). Parts are GATED: a
// part counts only when every earlier part is at its own top (`top`), so a rule's level is the number of thresholds met,
// part by part, stopping at the first part not at its top. Two consumers: layered-graded.mjs (exact enumeration under
// the reference law, levels per part) and layered-v2-valuation.ts (the v2 estimator on the spec's priced walk).
//
// The line is the primitive triple a·x + b·y + g = 0 (spec §12.1; g is the spec's gen.c). Non-vertical: y = m·x + c.

// ---------- number theory ----------
const SIEVE_N = 2_000_001;
const spfTab = new Int32Array(SIEVE_N);
export const PRIMES = [];
for (let i = 2; i < SIEVE_N; i++) {
  if (spfTab[i] === 0) {
    spfTab[i] = i;
    PRIMES.push(i);
  }
  for (let j = 0; j < PRIMES.length && PRIMES[j] <= spfTab[i] && i * PRIMES[j] < SIEVE_N; j++) spfTab[i * PRIMES[j]] = PRIMES[j];
}
export function isPrime(n) {
  if (!Number.isSafeInteger(n) || n < 2) return false;
  if (n < SIEVE_N) return spfTab[n] === n;
  if (n > 1e12) return false;
  for (const p of PRIMES) {
    if (p * p > n) return true;
    if (n % p === 0) return false;
  }
  return true;
}
export const gcd = (a, b) => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};
const factor = (n) => {
  const f = [];
  while (n > 1) {
    const p = spfTab[n];
    f.push(p);
    n /= p;
  }
  return f;
};
const bigOmega = (n) => (n <= 1 ? 0 : factor(n).length);
const tau = (n) => {
  if (n < 1) return 0;
  let t = 1;
  const f = factor(n);
  for (let i = 0; i < f.length; ) {
    let j = i;
    while (j < f.length && f[j] === f[i]) j++;
    t *= j - i + 1;
    i = j;
  }
  return t;
};
const sigma = (n) => {
  let s = 0;
  for (let d = 1; d * d <= n; d++) if (n % d === 0) s += d * d === n ? d : d + n / d;
  return s;
};
const spfOf = (n) => {
  n = Math.abs(n);
  if (n === 0) return 2;
  if (n === 1) return 1;
  if (n < SIEVE_N) return spfTab[n];
  for (const p of PRIMES) if (n % p === 0) return p;
  return n;
};
const isSq = (n) => n >= 0 && Math.round(Math.sqrt(n)) ** 2 === n;
const collatz = (n) => {
  let s = 0;
  while (n !== 1) {
    n = n % 2 ? 3 * n + 1 : n / 2;
    s++;
  }
  return s;
};
const twoSquares = (n) => {
  let r = 0;
  for (let x = 0; 2 * x * x <= n; x++) if (isSq(n - x * x)) r++;
  return r;
};

// ---------- the reference law's number codes ----------
// "digits": the spec's first code, int(n) = gamma(zigzag(n) + 1) (§2.3; the old law, §3 and §7).
// "mixed": owner decision 17 (number-codes.md; v2-core's mixedIntBits): a whole number written by its factorisation,
// each prime p costing p/2 bits, so mixedInt(0) = 1 and mixedInt(±n) = 2 + ½·Σ e·p + log2 Z, with log2 Z ≈ 2.10.
const LOG2_Z = PRIMES.filter((p) => p <= 10_000).reduce((a, p) => a - Math.log2(1 - 2 ** (-0.5 * p)), 0);
const sopfr = (n) => {
  let w = 0;
  while (n > 1 && n < SIEVE_N) {
    const p = spfTab[n];
    w += p;
    n /= p;
  }
  return w + (n > 1 ? n : 0);
};
export const LAWS = {
  digits: (n) => 2 * Math.floor(Math.log2((n >= 0 ? 2 * n : -2 * n - 1) + 1)) + 1,
  mixed: (n) => (n === 0 ? 1 : 2 + 0.5 * sopfr(Math.abs(n)) + LOG2_Z),
};

// ---------- exact rationals as [n, d] (numbers; magnitudes stay far below 2^53) ----------
export function rat(n, d) {
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1;
  return [n / g, d / g];
}
const add = (x, y) => rat(x[0] * y[1] + y[0] * x[1], x[1] * y[1]);
const sub = (x, y) => rat(x[0] * y[1] - y[0] * x[1], x[1] * y[1]);
const mul = (x, y) => rat(x[0] * y[0], x[1] * y[1]);
const div = (x, y) => rat(x[0] * y[1], x[1] * y[0]);
const val = ([n, d]) => n / d;
const isInt = ([, d]) => d === 1;
const absd = (x, k) => Math.abs(x[0] - k * x[1]) / x[1]; // |x − k| for an integer k
function floorDiv(n, d) {
  let q = Math.floor(n / d);
  let r = n - q * d;
  if (r < 0) {
    q--;
    r += d;
  } else if (r >= d) {
    q++;
    r -= d;
  }
  return [q, r];
}
/** Distance from a rational to the nearest integer, and the nearest integers (two on a tie). */
export function nearInt([n, d]) {
  const [q, r] = floorDiv(n, d);
  if (2 * r < d) return { dist: r / d, near: [q] };
  if (2 * r > d) return { dist: (d - r) / d, near: [q + 1] };
  return { dist: r / d, near: [q, q + 1] };
}
/** Distance from a rational to the nearest member of an increasing integer set given by its k-th member. */
function nearInSet(x, member, inverse) {
  const v = val(x);
  let k = Math.max(0, Math.floor(inverse(v)) - 1);
  let best = null;
  for (let j = k; j <= k + 3; j++) {
    const s = member(j);
    const dd = absd(x, s);
    if (!best || dd < best.dist) best = { dist: dd, k: j, s };
  }
  return best;
}
const nearSquare = (x) => nearInSet(x, (k) => k * k, (v) => Math.sqrt(Math.max(0, v))); // squares 0, 1, 4, …
const nearTri = (x) => nearInSet(x, (k) => (k * (k + 1)) / 2, (v) => (Math.sqrt(8 * Math.max(0, v) + 1) - 1) / 2);
/** Distance from a rational to the nearest prime (primes are positive). */
export function distPrime([n, d]) {
  const x = n / d;
  if (x <= 2) return (2 * d - n) / d;
  let lo = Math.floor(x);
  while (lo >= 2 && !isPrime(lo)) lo--;
  let hi = Math.ceil(x);
  while (!isPrime(hi)) hi++;
  return Math.min(Math.abs(n - lo * d) / d, Math.abs(hi * d - n) / d);
}
/** Gap from a prime p to the nearest other prime. */
const primeGap = (p) => {
  let lo = p - 1;
  while (lo >= 2 && !isPrime(lo)) lo--;
  let hi = p + 1;
  while (!isPrime(hi)) hi++;
  return Math.min(lo >= 2 ? p - lo : Infinity, hi - p);
};

// ---------- the line ----------
export function lineCtx(A, B, C) {
  const L = { A, B, C, nv: B > 0 };
  if (L.nv) {
    L.m = rat(-A, B);
    L.c = rat(-C, B);
  }
  L.tri = A !== 0 && B !== 0 && C !== 0;
  if (L.tri) {
    L.p = rat(-C, A);
    L.area = rat(C * C, 2 * Math.abs(A * B));
    L.legX = rat(Math.abs(C), Math.abs(A));
    L.legY = rat(Math.abs(C), Math.abs(B));
    L.hyp2 = rat(C * C * (A * A + B * B), A * A * B * B);
  }
  return L;
}
const yAt = (L, k) => rat(-L.A * k - L.C, L.B);

// ---------- ladders ----------
const fr = (s) => {
  const [n, d] = s.split("/").map(Number);
  return d ? n / d : n;
};
/** A distance part: thresholds "≤ d" for each d (largest first), the last usually 0. */
const dist = (...ds) => ({ rungs: ds.map((d) => -fr(String(d))), labels: ds.map((d) => `≤ ${d}`), top: 0 });
const WHOLE = dist("1/4", "1/8", "1/16", "1/32", "1/64", 0); // distance to a whole number: the finer tail
const NEAR = (...extra) => dist(...extra, "1", "1/2", "1/4", "1/8", "1/16", 0);
const atLeast = (ks, top) => ({ rungs: ks, labels: ks.map((k) => `≥ ${k}`), top });
const count = (n, from = 1) => atLeast(Array.from({ length: n - from + 1 }, (_, i) => from + i), n);
const PRIME_SIZES = [3, 5, 7, 11, 13, 17, 19, 23, 29, 37, 47, 59, 71, 83, 97];
const sizes = (ks) => atLeast(ks, undefined);

/** part(key, label, unit, value(L) → number | null, ladder) */
const part = (key, label, unit, value, ladder) => ({ key, label, unit, value, ...ladder });

export const FAMILIES = [];
/** fam({ id, name, source, lens, pool, curriculum, cards: [P, S, T?], parts }) */
const fam = (f) => FAMILIES.push(f);

// --------------------------------------------------------------------------------------------------------------
// A. This catalogue's families, graded (doc §7.2). Ids keep §2's ids.
// --------------------------------------------------------------------------------------------------------------
const P_WHOLE_C = part("P", "distance from c to the nearest whole number", "distance", (L) => (L.nv ? -nearInt(L.c).dist : null), WHOLE);

fam({
  id: "prime-factor-intercept", name: "Prime-Factor Intercept", source: "A #1 (owner's example 1)", lens: "slope-intercept",
  curriculum: "core: y-intercept, whole numbers", pool: "beginner",
  cards: ["The y-intercept should be as close as possible to a whole number.", "That whole number's smallest prime factor should be as big as possible."],
  parts: [
    P_WHOLE_C,
    part("S", "smallest prime factor of that whole number", "prime", (L) => Math.max(...nearInt(L.c).near.map(spfOf)), sizes([2, ...PRIME_SIZES])),
  ],
});
fam({
  id: "prime-factor-line", name: "Prime-Factor Line (m and c)", source: "A #1 (two elements)", lens: "slope-intercept",
  curriculum: "core: gradient, y-intercept", pool: "second",
  cards: ["The gradient and the y-intercept should both be as close as possible to whole numbers (the two distances added).", "The smaller of their two smallest prime factors should be as big as possible."],
  parts: [
    part("P", "distance of m and of c from whole numbers, added", "distance", (L) => (L.nv ? -(nearInt(L.m).dist + nearInt(L.c).dist) : null), dist("1/2", "1/4", "1/8", "1/16", "1/32", "1/64", 0)),
    part("S", "smaller of the two smallest prime factors", "prime", (L) => Math.min(Math.max(...nearInt(L.m).near.map(spfOf)), Math.max(...nearInt(L.c).near.map(spfOf))), sizes([2, ...PRIME_SIZES])),
  ],
});
fam({
  id: "square-area-roots", name: "Square Area, Rich Root", source: "A #2 (owner's example 2)", lens: "intercept triangle",
  curriculum: "stretch: area of a triangle from its intercepts; square numbers", pool: "beginner",
  cards: ["The triangle the line cuts off the axes should have an area as close as possible to a square number.", "That square's root should have as many prime factors as possible (12 = 2·2·3 has three)."],
  parts: [
    part("P", "distance from the area to the nearest square number", "area units", (L) => (L.tri ? -nearSquare(L.area).dist : null), NEAR("2")),
    part("S", "prime factors of the square's root, counting repeats", "factors", (L) => bigOmega(nearSquare(L.area).k), count(7)),
  ],
});
fam({
  id: "prime-gradient-pegs", name: "Prime Gradient, Prime Pegs", source: "A #3 (owner's rule 1)", lens: "slope-intercept, pegboard",
  curriculum: "core: gradient; primes under 50", pool: "beginner",
  cards: ["The gradient should be as close as possible to a prime number.", "The line should pass through as many prime pegs (points whose x and y are both primes below 100) as possible."],
  parts: [
    part("P", "distance from the gradient to the nearest prime", "distance", (L) => (L.nv ? -distPrime(L.m) : null), NEAR("2")),
    part("S", "prime pegs on the line (x, y prime, ≤ 100)", "pegs", (L) => primePegs(L, 100), count(8)),
  ],
});
function primePegs(L, W) {
  if (!L.nv) return 0;
  let n = 0;
  for (const x of PRIMES) {
    if (x > W) break;
    const num = -L.C - L.A * x;
    if (num % L.B === 0) {
      const y = num / L.B;
      if (y <= W && isPrime(y)) n++;
    }
  }
  return n;
}
for (const A0 of [6, 30])
  fam({
    id: `pythagorean-area-${A0}`, name: `Pythagorean Area (A = ${A0})`, source: "A #4 (owner's rule 2)", lens: "intercept triangle",
    curriculum: "stretch: area from intercepts", pool: A0 === 6 ? "beginner" : "second",
    cards: [`The triangle the line cuts off the axes should have an area as close as possible to ${A0}.`, "Its slanted side, squared, should be as close as possible to a square number (Pythagoras)."],
    parts: [
      part("P", `distance from the area to ${A0}`, "area units", (L) => (L.tri ? -absd(L.area, A0) : null), NEAR("4", "2")),
      part("S", "distance from the slanted side squared to the nearest square number", "units²", (L) => -nearSquare(L.hyp2).dist, NEAR("16", "4", "2")),
      part("T", "distance of the two legs from whole numbers, added", "distance", (L) => -(nearInt(L.legX).dist + nearInt(L.legY).dist), dist("1/2", "1/4", "1/8", "1/16", 0)),
    ],
  });
fam({
  id: "m-meets-c", name: "m Meets c, on the Unit Circle", source: "A #5 (owner's rule 3)", lens: "slope-intercept, circle",
  curriculum: "core: gradient and y-intercept", pool: "beginner",
  cards: ["The gradient and the y-intercept should be as close as possible to each other.", "Writing that shared value as a fraction u/v, u² + v² should be as close as possible to a square number (then the triangle's slanted side is a fraction)."],
  parts: [
    part("P", "|m − c|", "distance", (L) => (L.nv ? -Math.abs(val(L.m) - val(L.c)) : null), NEAR("2")),
    part("S", "distance from u² + v² to the nearest square", "units", (L) => {
      const [u, v] = L.m;
      if (u === 0) return -1e9;
      return -nearSquare([u * u + v * v, 1]).dist;
    }, dist("16", "8", "4", "2", "1", 0)),
    part("T", "the triple's longest side", "size", (L) => Math.round(Math.sqrt(L.m[0] ** 2 + L.m[1] ** 2)), sizes([5, 13, 17, 25, 37, 53, 65, 85])),
  ],
});
for (const [k, q0] of [[1, 13]])
  fam({
    id: "crossing-check", name: "Crossing Check (k = 1, q = 13)", source: "A #6 (owner's rule 4)", lens: "function machine",
    curriculum: "core: substituting x; solving a two-step equation", pool: "beginner",
    cards: [`Feed ${k} into the machine and ${q0} into the reverse machine: the two answers should be as close as possible.`, "The machine's two dials (×m and +c) should be as close as possible to whole numbers."],
    parts: [
      part("P", "|y(1) − x(13)|", "distance", (L) => {
        if (!L.nv || L.A === 0) return null;
        const { A, B, C } = L;
        return -Math.abs(-A * A * k - A * C + q0 * B * B + B * C) / Math.abs(A * B);
      }, NEAR("2")),
      part("S", "distance of m and c from whole numbers, added", "distance", (L) => -(nearInt(L.m).dist + nearInt(L.c).dist), dist("1/2", "1/4", "1/8", "1/16", "1/32", 0)),
      part("T", "distance from the meeting number to the nearest prime", "distance", (L) => -distPrime([Math.abs(yAt(L, k)[0]), yAt(L, k)[1]]), dist("2", "1", 0)),
    ],
  });
fam({
  id: "twin-coefficients", name: "Twin Coefficients", source: "A #7", lens: "slope-intercept",
  curriculum: "core: gradient, y-intercept; primes", pool: "second",
  cards: ["The gradient and the y-intercept should both be as close as possible to primes (distances added).", "The two primes should be as close as possible to two apart (twins).", "The smaller twin should be as big as possible."],
  parts: [
    part("P", "distance of m and c to primes, added", "distance", (L) => (L.nv ? -(distPrime(L.m) + distPrime(L.c)) : null), NEAR("2")),
    part("S", "| |m − c| − 2 |", "distance", (L) => -Math.abs(Math.abs(val(L.m) - val(L.c)) - 2), dist("16", "8", "4", "2", 0)),
    part("T", "the smaller twin", "size", (L) => Math.min(val(L.m), val(L.c)), sizes([5, 11, 17, 29, 41, 59, 71])),
  ],
});
for (const D of [2])
  fam({
    id: "pell-gradient", name: "Pell Gradient (m² → 2)", source: "A #8", lens: "slope-intercept, fractions",
    curriculum: "stretch: square roots, fractions", pool: "second",
    cards: ["The gradient times itself should be as close as possible to 2.", "The gradient's fraction p/q should have the bottom q as small as possible for that closeness (the tie-break)."],
    parts: [
      part("P", "|m² − 2|", "distance", (L) => (L.nv ? -Math.abs(L.m[0] ** 2 - D * L.m[1] ** 2) / L.m[1] ** 2 : null), dist("1", "1/4", "1/16", "1/64", "1/256", "1/1024", "1/4096")),
    ],
  });
fam({
  id: "crowded-intercept", name: "Crowded Intercept", source: "A #9", lens: "slope-intercept",
  curriculum: "core: y-intercept; factors", pool: "none",
  cards: ["The y-intercept should be as close as possible to a whole number.", "That number should have as many divisors as possible."],
  parts: [P_WHOLE_C, part("S", "divisors of that number", "divisors", (L) => tau(Math.abs(nearInt(L.c).near[0])), atLeast([2, 3, 4, 6, 8, 9, 10, 12, 16, 18], undefined))],
});
fam({
  id: "euclid-steps", name: "Euclid's Long Way", source: "A #10", lens: "fractions (Euclid's algorithm)",
  curriculum: "stretch: simplest form; Euclid's algorithm", pool: "second",
  cards: ["Euclid's algorithm on the gradient's top and bottom should take as many steps as possible.", "Its biggest quotient should be as small as possible."],
  parts: [
    part("P", "Euclid's steps on the gradient p/q", "steps", (L) => (L.nv ? euclid(L.m).steps : null), atLeast([2, 3, 4, 5, 6, 7, 8, 9, 10], undefined)),
  ],
});
function euclid([n, d]) {
  let a = Math.abs(n), b = d, steps = 0, mx = 0;
  while (b) {
    const q = Math.floor(a / b);
    mx = Math.max(mx, q);
    [a, b] = [b, a - q * b];
    steps++;
  }
  return { steps, mx };
}
fam({
  id: "farey-neighbours", name: "Farey Neighbours", source: "A #11", lens: "fractions",
  curriculum: "stretch: simplest form", pool: "reserve",
  cards: ["Writing the gradient as p/q and the y-intercept as r/s in simplest form, p·s − q·r should be as close as possible to 1 or −1.", "The smaller of the two bottoms should be as big as possible."],
  parts: [
    part("P", "| |ps − qr| − 1 |", "units", (L) => (L.nv ? -Math.abs(Math.abs(L.m[0] * L.c[1] - L.c[0] * L.m[1]) - 1) : null), dist("8", "4", "2", "1", 0)),
    part("S", "the smaller bottom", "size", (L) => Math.min(L.m[1], L.c[1]), sizes([2, 3, 4, 5, 7, 10, 15, 20])),
  ],
});
fam({
  id: "prime-run", name: "Prime Run", source: "A #15", lens: "growth pattern",
  curriculum: "core: sequences (nth term); primes", pool: "beginner",
  cards: ["As many as possible of y(1), y(2), …, y(6) should be different primes.", "With six, the first should be as big as possible."],
  parts: [
    part("P", "different primes among y(1)…y(6)", "primes", (L) => {
      if (!L.nv) return null;
      const s = new Set();
      for (let x = 1; x <= 6; x++) {
        const [a, b] = yAt(L, x);
        if (b === 1 && isPrime(a)) s.add(a);
      }
      return s.size;
    }, count(6)),
    part("S", "the first prime y(1)", "size", (L) => val(yAt(L, 1)), sizes([7, 11, 13, 17, 29, 47, 67, 101, 151])),
  ],
});
fam({
  id: "square-terms", name: "Square Terms", source: "A #16", lens: "growth pattern",
  curriculum: "core: sequences; square numbers", pool: "second",
  cards: ["As many as possible of y(1) … y(10) should be different square numbers.", "With five, the biggest square should be as big as possible."],
  parts: [
    part("P", "different squares among y(1)…y(10)", "squares", (L) => {
      if (!L.nv || L.A === 0) return null;
      const s = new Set();
      for (let x = 1; x <= 10; x++) {
        const [a, b] = yAt(L, x);
        if (b === 1 && a > 0 && isSq(a)) s.add(a);
      }
      return s.size;
    }, count(5)),
    part("S", "the biggest square", "size", (L) => {
      let mx = 0;
      for (let x = 1; x <= 10; x++) {
        const [a, b] = yAt(L, x);
        if (b === 1 && a > 0 && isSq(a)) mx = Math.max(mx, a);
      }
      return mx;
    }, sizes([100, 400, 900, 1600, 2500])),
  ],
});
fam({
  id: "treasure-prime-run", name: "Treasure Prime Run (2, 37)", source: "A #17", lens: "table",
  curriculum: "core: substituting x; table of values", pool: "reserve",
  cards: ["When x is 2, y should be as close as possible to 37.", "As many of y(1) … y(8) as possible should be different primes."],
  parts: [
    part("P", "|y(2) − 37|", "distance", (L) => (L.nv ? -absd(yAt(L, 2), 37) : null), NEAR("8", "4", "2")),
    part("S", "different primes among y(1)…y(8)", "primes", (L) => {
      const s = new Set();
      for (let x = 1; x <= 8; x++) {
        const [a, b] = yAt(L, x);
        if (b === 1 && isPrime(a)) s.add(a);
      }
      return s.size;
    }, count(8)),
  ],
});
fam({
  id: "divisibility-treasure", name: "Divisibility Treasure", source: "A #18", lens: "table",
  curriculum: "core: substituting x; multiples", pool: "reserve",
  cards: ["y(5) should be as close as possible to a whole number.", "As many of 2, 3, 4, 5, 6, 7, 8, 9 as possible should divide it (zero does not count)."],
  parts: [
    part("P", "distance from y(5) to a whole number", "distance", (L) => (L.nv ? -nearInt(yAt(L, 5)).dist : null), WHOLE),
    part("S", "how many of 2…9 divide it", "divisors", (L) => {
      const n = Math.abs(nearInt(yAt(L, 5)).near[0]);
      return n === 0 ? 0 : [2, 3, 4, 5, 6, 7, 8, 9].filter((d) => n % d === 0).length;
    }, count(8)),
  ],
});
for (const s0 of [2, 3])
  fam({
    id: `cunningham-${s0}`, name: `Cunningham Machine (seed ${s0})`, source: "A #20", lens: "function machine, iterated",
    curriculum: "core: function machines", pool: s0 === 3 ? "second" : "reserve",
    cards: [`Feed ${s0} in, then feed each answer back in: as many answers in a row as possible should be new primes.`],
    parts: [
      part("P", "run of new primes", "primes", (L) => {
        if (!L.nv) return null;
        if (!isInt(L.m) || !isInt(L.c)) return 0;
        const m = L.m[0], c = L.c[0], seen = new Set([s0]);
        let x = s0, n = 0;
        while (n < 10) {
          x = m * x + c;
          if (Math.abs(x) > 1e12 || seen.has(x) || !isPrime(x)) break;
          seen.add(x);
          n++;
        }
        return n;
      }, count(8)),
    ],
  });
fam({
  id: "square-triangle-area", name: "Square Triangle Area", source: "A #22", lens: "intercept triangle",
  curriculum: "stretch: area; triangular numbers", pool: "reserve",
  cards: ["The triangle's area should be as close as possible to a triangular number (3, 6, 10, 15, …).", "That triangular number should be as close as possible to a square number."],
  parts: [
    part("P", "distance from the area to the nearest triangular number ≥ 3", "area units", (L) => (L.tri ? -nearTri(L.area).dist : null), NEAR("2")),
    part("S", "distance from that triangular number to the nearest square", "units", (L) => {
      const T = nearTri(L.area).s;
      return -nearSquare([T, 1]).dist;
    }, dist("8", "4", "2", "1", 0)),
  ],
});
fam({
  id: "prime-hypotenuse", name: "Prime Hypotenuse", source: "A #23", lens: "intercept triangle",
  curriculum: "stretch: Pythagoras", pool: "second",
  cards: ["The slanted side, squared, should be as close as possible to a whole number.", "That whole number should be as close as possible to a prime.", "The prime should be as big as possible."],
  parts: [
    part("P", "distance from h² to a whole number", "distance", (L) => (L.tri ? -nearInt(L.hyp2).dist : null), WHOLE),
    part("S", "distance from h² to the nearest prime", "distance", (L) => -distPrime([nearInt(L.hyp2).near[0], 1]), dist("8", "4", "2", "1", 0)),
    part("T", "the prime", "size", (L) => nearInt(L.hyp2).near[0], sizes([5, 13, 29, 61, 101, 181, 401, 1009])),
  ],
});
for (const [S0, P0] of [[4, 2]])
  fam({
    id: "vieta-intercepts", name: "Vieta Intercepts (S = 4, P = 2)", source: "A #24", lens: "intercept form",
    curriculum: "core: intercepts", pool: "second",
    cards: [`The x-intercept plus the y-intercept should be as close as possible to ${S0}.`, `Their product should be as close as possible to ${P0}.`],
    parts: [
      part("P", "|p + q − S|", "distance", (L) => (L.tri ? -absd(add(L.p, L.c), S0) : null), NEAR("2")),
      part("S", "|p·q − P|", "distance", (L) => -absd(mul(L.p, L.c), P0), dist("1", "1/4", "1/16", "1/64", "1/256", "1/1024")),
    ],
  });
fam({
  id: "twin-sum", name: "Twin Sum", source: "A #26", lens: "general form",
  curriculum: "core: general form; substituting a point", pool: "beginner",
  cards: ["Written as ax + by + c = 0 in lowest terms, a + b + c should be as close as possible to 0.", "a, b and c should each be as close as possible to a prime (ignoring signs; distances added)."],
  parts: [
    part("P", "|a + b + c|", "units", (L) => -Math.abs(L.A + L.B + L.C), dist("8", "4", "2", "1", 0)),
    part("S", "distance of |a|, |b|, |c| to primes, added", "units", (L) => -[L.A, L.B, L.C].reduce((s, x) => s + distPrime([Math.abs(x), 1]), 0), dist("6", "4", "3", "2", "1", 0)),
    part("T", "the largest coefficient", "size", (L) => Math.max(Math.abs(L.A), Math.abs(L.B), Math.abs(L.C)), sizes([7, 13, 19, 31, 43, 61, 73])),
  ],
});
fam({
  id: "stepping-coefficients", name: "Stepping Coefficients", source: "A #27", lens: "general form",
  curriculum: "core: general form", pool: "second",
  cards: ["a, b and c should be as close as possible to going up in equal steps (|a − 2b + c| as small as possible).", "Each should be as close as possible to a prime (distances added).", "The largest should be as big as possible."],
  parts: [
    part("P", "|a − 2b + c|", "units", (L) => -Math.abs(L.A - 2 * L.B + L.C), dist("8", "4", "2", "1", 0)),
    part("S", "distance of |a|, |b|, |c| to primes, added", "units", (L) => -[L.A, L.B, L.C].reduce((s, x) => s + distPrime([Math.abs(x), 1]), 0), dist("6", "4", "3", "2", "1", 0)),
    part("T", "the largest coefficient", "size", (L) => Math.max(Math.abs(L.A), Math.abs(L.B), Math.abs(L.C)), sizes([7, 13, 19, 31, 43, 61, 79])),
  ],
});
fam({
  id: "tangent-circle", name: "Tangent Circle (R = 1)", source: "A #28", lens: "general form, circle",
  curriculum: "stretch: distance from a point to a line", pool: "second",
  cards: ["The line's distance from the origin, squared, should be as close as possible to 1 (it just touches the unit circle).", "Written as ax + by + c = 0, a² + b² should be as big as possible (the triple behind the tilt)."],
  parts: [
    part("P", "|dist² − 1|", "units", (L) => {
      const h2 = L.A * L.A + L.B * L.B;
      return -Math.abs(L.C * L.C - h2) / h2;
    }, NEAR("2")),
    part("S", "the triple's long side √(a² + b²)", "size", (L) => Math.round(Math.sqrt(L.A * L.A + L.B * L.B)), sizes([5, 13, 17, 25, 29, 37, 41])),
  ],
});
fam({
  id: "peg-ruler", name: "Peg Ruler", source: "A #29", lens: "pegboard",
  curriculum: "stretch: grid points on a line; Pythagoras", pool: "reserve",
  cards: ["The line should pass through as many pegs of the board [−10, 10]² as possible.", "a² + b² should be as close as possible to a square number (neighbouring pegs a whole distance apart)."],
  parts: [
    part("P", "pegs on the line in [−10, 10]²", "pegs", (L) => pegs(L, 10), count(12, 1)),
    part("S", "distance from a² + b² to a square", "units", (L) => -nearSquare([L.A * L.A + L.B * L.B, 1]).dist, dist("8", "4", "2", "1", 0)),
  ],
});
function pegs(L, W) {
  const { A, B, C } = L;
  let n = 0;
  if (B !== 0) {
    for (let x = -W; x <= W; x++) {
      const num = -C - A * x;
      if (num % B === 0 && Math.abs(num / B) <= W) n++;
    }
  } else if (C % A === 0 && Math.abs(C / A) <= W) n = 2 * W + 1;
  return n;
}
fam({
  id: "pick-pegs", name: "Pick's Pegs (N = 30)", source: "A #30", lens: "pegboard, triangle",
  curriculum: "stretch: counting grid points; area", pool: "second",
  cards: ["Both intercepts should be as close as possible to whole numbers (distances added).", "The number of pegs strictly inside the triangle should be as close as possible to 30."],
  parts: [
    part("P", "distance of both intercepts from whole numbers", "distance", (L) => (L.tri ? -(nearInt(L.p).dist + nearInt(L.c).dist) : null), dist("1/2", "1/4", "1/8", "1/16", 0)),
    part("S", "|inside pegs − 30|", "pegs", (L) => {
      const P = Math.abs(nearInt(L.p).near[0]), Q = Math.abs(nearInt(L.c).near[0]);
      if (!P || !Q) return -1e9;
      return -Math.abs((P * Q - P - Q - gcd(P, Q)) / 2 + 1 - 30);
    }, dist("16", "8", "4", "2", "1", 0)),
  ],
});
fam({
  id: "parabola-kiss", name: "Parabola Kiss", source: "A #31", lens: "slope-intercept, a curve",
  curriculum: "stretch: plotting y = x²", pool: "second",
  cards: ["m² + 4c should be as close as possible to 0 (the line just touches y = x²).", "The touching point's x (m/2) should be as close as possible to a whole number.", "That x should be as far out as possible."],
  parts: [
    part("P", "|m² + 4c|", "units", (L) => (L.nv ? -Math.abs(val(L.m) ** 2 + 4 * val(L.c)) * (L.m[0] ** 2 * L.c[1] + 4 * L.c[0] * L.m[1] ** 2 === 0 ? 0 : 1) : null), NEAR("2")),
    part("S", "distance of m/2 from a whole number", "distance", (L) => -nearInt(rat(L.m[0], 2 * L.m[1])).dist, WHOLE),
    part("T", "|touch x|", "size", (L) => Math.abs(val(L.m) / 2), sizes([1, 2, 3, 4, 5, 7, 10])),
  ],
});

// --------------------------------------------------------------------------------------------------------------
// K. The coordinator's eight families and the perpendicular foot, graded, each with every listed secondary (doc §7.3).
//    Ids: coord-<family>/<secondary>.
// --------------------------------------------------------------------------------------------------------------
const K = (id, name, lens, curriculum, cards0, P, secondaries) => {
  for (const [sid, card, S] of secondaries)
    fam({ id: `coord-${id}/${sid}`, name: `${name} / ${sid}`, source: "K (coordinator)", lens, curriculum, pool: "candidate", cards: [cards0, card], parts: [P, S] });
};
// (1) Prime Staircase: the run of primes y(0), y(1), … from the start
const staircase = (L) => {
  if (!L.nv) return null;
  const seen = new Set();
  let n = 0;
  for (let x = 0; x < 12; x++) {
    const [a, b] = yAt(L, x);
    if (b !== 1 || !isPrime(a) || seen.has(a)) break;
    seen.add(a);
    n++;
  }
  return n;
};
const lastOfRun = (L) => {
  const n = staircase(L);
  return n ? yAt(L, n - 1)[0] : 0;
};
K("prime-staircase", "Prime Staircase", "growth pattern", "core: sequences (nth term); primes",
  "The pattern y(0), y(1), y(2), … should start with as long a run of different primes as possible.",
  part("P", "run of primes from y(0)", "primes", staircase, count(5)),
  [
    ["first-prime", "The first prime y(0) should be as big as possible.", part("S", "y(0)", "size", (L) => val(L.c), sizes([3, 5, 7, 11, 13, 17, 29, 47, 71, 101]))],
    ["prime-gradient", "The gradient should be as close as possible to a prime.", part("S", "distance from m to a prime", "distance", (L) => -distPrime(L.m), dist("4", "2", "1", "1/2", 0))],
    ["twin-end", "The last prime of the run should be as close as possible to another prime.", part("S", "gap from the last prime to its nearest prime", "units", (L) => -primeGap(lastOfRun(L)), dist("14", "10", "8", "6", "4", "2"))],
  ]);
// (2) Square Triangle
K("square-triangle", "Square Triangle", "intercept triangle", "stretch: area from intercepts; square numbers",
  "The triangle the line cuts off the axes should have an area as close as possible to a square number.",
  part("P", "distance from the area to the nearest square", "area units", (L) => (L.tri ? -nearSquare(L.area).dist : null), NEAR("2")),
  [
    ["root-factors", "The square's root should have as many prime factors as possible.", part("S", "Ω(root)", "factors", (L) => bigOmega(nearSquare(L.area).k), count(7))],
    ["whole-legs", "Both legs should be as close as possible to whole numbers (distances added).", part("S", "distance of the legs from whole numbers", "distance", (L) => -(nearInt(L.legX).dist + nearInt(L.legY).dist), dist("1/2", "1/4", "1/8", "1/16", "1/32", 0))],
    ["whole-hypotenuse", "The slanted side, squared, should be as close as possible to a square number.", part("S", "distance from h² to a square", "units²", (L) => -nearSquare(L.hyp2).dist, NEAR("16", "4", "2"))],
  ]);
// (3) Whole Intercept
K("whole-intercept", "Whole Intercept", "slope-intercept", "core: y-intercept",
  "The y-intercept should be as close as possible to a whole number.",
  P_WHOLE_C,
  [
    ["spf", "That whole number's smallest prime factor should be as big as possible.", part("S", "spf", "prime", (L) => Math.max(...nearInt(L.c).near.map(spfOf)), sizes([2, ...PRIME_SIZES]))],
    ["whole-x-intercept", "The x-intercept should be as close as possible to a whole number too.", part("S", "distance of the x-intercept from a whole number", "distance", (L) => (L.A === 0 ? -1e9 : -nearInt(L.p ?? rat(-L.C, L.A)).dist), WHOLE)],
    ["triangular", "That whole number should be as close as possible to a triangular number.", part("S", "distance to the nearest triangular number", "units", (L) => -nearTri([Math.abs(nearInt(L.c).near[0]), 1]).dist, dist("8", "4", "2", "1", 0))],
  ]);
// (4) Peg Line
K("peg-line", "Peg Line", "pegboard (13×13)", "stretch: counting grid points on a line",
  "The line should pass through as many pegs of the 13×13 board [−6, 6]² as possible.",
  part("P", "pegs in [−6, 6]²", "pegs", (L) => pegs(L, 6), count(13)),
  [
    ["whole-spacing", "a² + b² should be as close as possible to a square (neighbouring pegs a whole distance apart).", part("S", "distance from a² + b² to a square", "units", (L) => -nearSquare([L.A * L.A + L.B * L.B, 1]).dist, dist("8", "4", "2", "1", 0))],
    ["prime-sums", "As many of its pegs as possible should have a prime coordinate sum.", part("S", "pegs with x + y prime", "pegs", (L) => pegList(L, 6).filter(([x, y]) => isPrime(x + y)).length, count(8))],
    ["off-axes", "As few of its pegs as possible should lie on an axis.", part("S", "pegs on an axis (fewer is better)", "pegs", (L) => -pegList(L, 6).filter(([x, y]) => x === 0 || y === 0).length, { rungs: [-2, -1, 0], labels: ["≤ 2", "≤ 1", "0"], top: 0 })],
  ]);
function pegList(L, W) {
  const { A, B, C } = L, out = [];
  if (B !== 0) {
    for (let x = -W; x <= W; x++) {
      const num = -C - A * x;
      if (num % B === 0 && Math.abs(num / B) <= W) out.push([x, num / B]);
    }
  } else if (C % A === 0 && Math.abs(C / A) <= W) for (let y = -W; y <= W; y++) out.push([-C / A, y]);
  return out;
}
// (5) Fixed Point: y = x where x = c / (1 − m)
const fixedPt = (L) => (L.nv && !(L.m[0] === 1 && L.m[1] === 1) ? div(L.c, sub([1, 1], L.m)) : null);
K("fixed-point", "Fixed Point", "function machine", "core: solving x = mx + c (a two-step equation)",
  "The input the machine leaves unchanged should be as close as possible to a whole number.",
  part("P", "distance from the fixed point to a whole number", "distance", (L) => {
    const f = fixedPt(L);
    return f ? -nearInt(f).dist : null;
  }, WHOLE),
  [
    ["divisors", "That whole number should have as many divisors as possible.", part("S", "divisors", "divisors", (L) => tau(Math.abs(nearInt(fixedPt(L)).near[0])), atLeast([2, 3, 4, 6, 8, 9, 10, 12, 16], undefined))],
    ["doubling-point", "The input the machine doubles (y = 2x) should be as close as possible to a whole number too.", part("S", "distance of c/(2 − m) from a whole number", "distance", (L) => {
      if (L.m[0] === 2 * L.m[1]) return -1e9;
      return -nearInt(div(L.c, sub([2, 1], L.m))).dist;
    }, WHOLE)],
    ["square", "That whole number should be as close as possible to a square number.", part("S", "distance to the nearest square", "units", (L) => -nearSquare([Math.abs(nearInt(fixedPt(L)).near[0]), 1]).dist, dist("8", "4", "2", "1", 0))],
  ]);
// (6) Prime Slope: m = p/q in lowest terms
K("prime-slope", "Prime Slope", "rise over run", "core: gradient as rise over run; primes",
  "Writing the gradient as rise over run in simplest form, the rise and the run should each be as close as possible to a prime (distances added).",
  part("P", "distance of |rise| and run to primes, added", "units", (L) => (L.nv ? -(distPrime([Math.abs(L.m[0]), 1]) + distPrime([L.m[1], 1])) : null), dist("6", "4", "3", "2", "1", 0)),
  [
    ["twins", "The rise and the run should be as close as possible to two apart.", part("S", "| |rise − run| − 2 |", "units", (L) => -Math.abs(Math.abs(Math.abs(L.m[0]) - L.m[1]) - 2), dist("16", "8", "4", "2", "1", 0))],
    ["square-sum", "Rise plus run should be as close as possible to a square number.", part("S", "distance from rise + run to a square", "units", (L) => -nearSquare([Math.abs(L.m[0]) + L.m[1], 1]).dist, dist("8", "4", "2", "1", 0))],
    ["matching-c", "The y-intercept's bottom should be as close as possible to the run.", part("S", "|bottom of c − run|", "units", (L) => -Math.abs(L.c[1] - L.m[1]), dist("16", "8", "4", "2", "1", 0))],
  ]);
// (7) Prime Equation: ax + by = c (so the triple is (a, b, −c))
const eqABC = (L) => [L.A, L.B, -L.C];
K("prime-equation", "Prime Equation", "general form ax + by = c", "core: equation of a line; primes",
  "Written as ax + by = c with whole numbers in lowest terms, a, b and c should each be as close as possible to a prime (ignoring signs; distances added).",
  part("P", "distance of |a|, |b|, |c| to primes, added", "units", (L) => -eqABC(L).reduce((s, x) => s + distPrime([Math.abs(x), 1]), 0), dist("6", "4", "3", "2", "1", 0)),
  [
    ["a-plus-b", "a + b should be as close as possible to c.", part("S", "|a + b − c|", "units", (L) => {
      const [a, b, c] = eqABC(L);
      return -Math.abs(a + b - c);
    }, dist("32", "16", "8", "4", "2", "1", 0))],
    ["in-step", "a, b and c should be as close as possible to equal steps.", part("S", "|a − 2b + c|", "units", (L) => {
      const [a, b, c] = eqABC(L);
      return -Math.abs(a - 2 * b + c);
    }, dist("32", "16", "8", "4", "2", "1", 0))],
    ["prime-peg", "The line should pass as close as possible to a point whose coordinates are both primes below 50.", part("S", "vertical distance to the nearest prime peg", "units", (L) => {
      if (!L.nv) return -1e9;
      let best = Infinity;
      for (const x of PRIMES) {
        if (x > 50) break;
        const y = yAt(L, x);
        for (const p of PRIMES) {
          if (p > 50) break;
          best = Math.min(best, absd(y, p));
        }
      }
      return -best;
    }, dist("2", "1", "1/2", "1/4", "1/8", 0))],
  ]);
// (8) Squares in Step: squares among y(1)…y(9)
const squareTerms = (L, N) => {
  const out = [];
  for (let x = 1; x <= N; x++) {
    const [a, b] = yAt(L, x);
    if (b === 1 && a > 0 && isSq(a) && !out.some((s) => s[1] === a)) out.push([x, a]);
  }
  return out;
};
K("squares-in-step", "Squares in Step", "table of values", "core: table of values; square numbers",
  "As many as possible of y(1) … y(9) should be different square numbers.",
  part("P", "different squares among y(1)…y(9)", "squares", (L) => (L.nv && L.A !== 0 ? squareTerms(L, 9).length : null), count(4)),
  [
    ["roots-in-step", "The squares' roots should be as close as possible to going up in equal steps (spread of the gaps).", part("S", "spread of the gaps between consecutive roots", "units", (L) => {
      const r = squareTerms(L, 9).map(([, a]) => Math.sqrt(a)).sort((x, y) => x - y);
      if (r.length < 3) return -1e9;
      const g = r.slice(1).map((x, i) => x - r[i]);
      return -(Math.max(...g) - Math.min(...g));
    }, dist("16", "8", "4", "2", "1", 0))],
    ["prime-roots", "The squares' roots should be as close as possible to primes (distances added).", part("S", "distance of the roots to primes", "units", (L) => -squareTerms(L, 9).reduce((s, [, a]) => s + distPrime([Math.sqrt(a), 1]), 0), dist("8", "4", "2", "1", 0))],
    ["small-step", "The pattern's step (the gradient) should be as small as possible.", part("S", "|m|", "size", (L) => -Math.abs(val(L.m)), atLeast([-120, -48, -24, -12, -8, -4, -2], undefined))],
  ]);
// (9) Perpendicular Foot: the foot F of the perpendicular from the origin
const footD2 = (L) => {
  const { A, B, C } = L, h = A * A + B * B;
  const fx = rat(-A * C, h), fy = rat(-B * C, h);
  const nx = nearInt(fx), ny = nearInt(fy);
  return nx.dist ** 2 + ny.dist ** 2;
};
K("perpendicular-foot", "Perpendicular Foot", "the plane: perpendicular from the origin", "stretch: perpendicular lines; distance on a grid",
  "The foot of the perpendicular from the origin to the line should be as close as possible to a peg (squared distance).",
  part("P", "squared distance from the foot to the nearest peg", "units²", (L) => (L.C === 0 ? null : -footD2(L)), dist("1/4", "1/8", "1/16", "1/32", "1/64", 0)),
  [
    ["whole-distance", "The line's distance from the origin, squared, should be as close as possible to a square number.", part("S", "distance from dist² to a square", "units", (L) => -nearSquare(rat(L.C * L.C, L.A * L.A + L.B * L.B)).dist, NEAR("8", "4", "2"))],
    ["prime-distance", "The line's distance from the origin, squared, should be as close as possible to the square of a prime.", part("S", "distance from dist² to a prime squared", "units", (L) => {
      const d2 = rat(L.C * L.C, L.A * L.A + L.B * L.B);
      let best = Infinity;
      for (const p of PRIMES) {
        best = Math.min(best, absd(d2, p * p));
        if (p * p > val(d2) + 1) break;
      }
      return -best;
    }, NEAR("8", "4", "2"))],
  ]);

// --------------------------------------------------------------------------------------------------------------
// B, C, E. The other brainstorms' families (docs/engine-v2/rule-brainstorm/), each as its document's primary and its
//    beginner secondary, graded and re-implemented here so one method measures all of them. Gates follow the source
//    documents (outside a gate the line is WORST).
// --------------------------------------------------------------------------------------------------------------
const D8 = dist("8", "4", "2", "1", "1/2", "1/4", "1/8", 0); // the Q ladder the brainstorms share
const NP = (x) => (x < 1 ? 1 : Math.round(x - 1e-12)); // nearest positive integer, ties to the smaller (B's N)
const ext = (f) => fam({ pool: "candidate", ...f });

// B: story lenses
ext({ id: "b-matchstick-chains", name: "Matchstick Chains", source: "B §1.1", lens: "growth pattern (matchsticks)", curriculum: "core: nth term; the zeroth term",
  cards: ["Pattern 0, before any shapes are built, should use as close as possible to one stick.", "The shapes should have as close as possible to a prime number of sides (at least a triangle)."],
  parts: [
    part("P", "|c − 1|", "sticks", (L) => (L.nv ? -absd(L.c, 1) : null), D8),
    part("S", "distance of the sides m + 1 from a prime ≥ 3", "sides", (L) => {
      const s1 = add(L.m, [1, 1]);
      return val(s1) <= 3 ? -(3 - val(s1)) : -distPrime(s1);
    }, D8),
  ] });
ext({ id: "b-steady-doubling", name: "Steady vs Doubling", source: "B §1.2", lens: "table against 2ⁿ", curriculum: "stretch: substituting x; powers of 2",
  cards: ["In some week from 1 to 8 the steady plan should pay as close as possible to what the doubling plan pays.", "In a second week too: the second-smallest gap should be as small as possible."],
  parts: [
    part("P", "min over weeks of |y(n) − 2ⁿ|", "pounds", (L) => (L.nv ? -Math.min(...gaps2n(L)) : null), D8),
    part("S", "second-smallest gap", "pounds", (L) => -gaps2n(L).sort((x, y) => x - y)[1], D8),
  ] });
function gaps2n(L) {
  return Array.from({ length: 8 }, (_, i) => absd(yAt(L, i + 1), 2 ** (i + 1)));
}
ext({ id: "b-shopping-baskets", name: "Shopping Baskets", source: "B §1.3", lens: "general form as prices", curriculum: "stretch: ax + by = c; whole solutions",
  cards: ["Buying at least one apple and one banana, the change left should be as small as possible.", "The two prices should be as close as possible to primes (distances added)."],
  parts: [
    part("P", "least change", "pence", (L) => {
      const a = L.A, b = L.B, budget = -L.C;
      if (!(a > 0 && b > 0 && budget > 0)) return null;
      if (budget < a + b) return -(a + b - budget);
      let best = Infinity;
      for (let x = 1; a * x + b <= budget && best > 0; x++) best = Math.min(best, (budget - a * x) % b);
      return -best;
    }, D8),
    part("S", "distance of both prices to primes", "pence", (L) => -(distPrime([L.A, 1]) + distPrime([L.B, 1])), D8),
  ] });
ext({ id: "b-same-reading", name: "Same Reading", source: "B §1.4", lens: "function machine (fixed point)", curriculum: "core: solving x = mx + c",
  cards: ["The temperature where both thermometers show the same number should be as close as possible to a whole number.", "That whole number should have as many prime factors as possible."],
  parts: [
    part("P", "distance of c/(1 − m) from a whole number", "degrees", (L) => {
      if (!L.nv || val(L.m) <= 0 || (L.m[0] === 1 && L.m[1] === 1)) return null;
      return -nearInt(div(L.c, sub([1, 1], L.m))).dist;
    }, WHOLE),
    part("S", "Ω of that number", "factors", (L) => Math.min(6, bigOmega(Math.abs(Math.trunc(val(div(L.c, sub([1, 1], L.m)))) === 0 ? 0 : Math.abs(nearInt(div(L.c, sub([1, 1], L.m))).near[0])))), count(6)),
  ] });
ext({ id: "b-ladder", name: "Ladder Against the Wall", source: "B §1.5", lens: "intercept triangle", curriculum: "core: x- and y-intercepts",
  cards: ["The foot and the top of the ladder (where the line meets the axes) should be as close as possible to whole-metre marks.", "The ladder's length squared should be as close as possible to a square number."],
  parts: [
    part("P", "distance of the legs from whole numbers", "metres", (L) => (L.tri ? -(nearInt(L.legX).dist + nearInt(L.legY).dist) : null), dist("1/2", "1/4", "1/8", "1/16", "1/32", "1/64", 0)),
    part("S", "distance from h² to a square", "metres²", (L) => -nearSquare(L.hyp2).dist, D8),
  ] });
ext({ id: "b-savings-goal", name: "Savings Goal (£100)", source: "B §1.6", lens: "growth pattern (savings)", curriculum: "core: rate and starting amount",
  cards: ["The week you reach £100 should be as close as possible to a whole number of weeks.", "Your starting amount should be as close as possible to one real coin."],
  parts: [
    part("P", "|W − nearest whole week|", "weeks", (L) => {
      if (!L.nv || L.A === 0) return null;
      const W = div(sub([100, 1], L.c), L.m);
      return -absd(W, NP(val(W)));
    }, D8),
    part("S", "pence from a coin", "pence", (L) => -Math.min(...[1, 2, 5, 10, 20, 50, 100, 200].map((k) => absd(mul([100, 1], L.c), k))), D8),
  ] });
ext({ id: "b-empty-tank", name: "Empty Tank", source: "B §1.7", lens: "x-intercept as time", curriculum: "core: x-intercept; solving mx + c = 0",
  cards: ["The tank should empty as close as possible to a whole minute.", "That minute's smallest prime factor should be as big as possible."],
  parts: [
    part("P", "|T − nearest whole minute|", "minutes", (L) => {
      if (!L.nv || !(val(L.c) > 0 && val(L.m) < 0)) return null;
      const T = div(L.c, [-L.m[0], L.m[1]]);
      return -absd(T, NP(val(T)));
    }, dist("1", "1/2", "1/4", "1/8", "1/16", "1/32", "1/64", 0)),
    part("S", "spf of the minute", "prime", (L) => {
      const n = NP(val(div(L.c, [-L.m[0], L.m[1]])));
      return n < 2 ? 1 : Math.min(13, spfOf(n));
    }, sizes([2, 3, 5, 7, 11, 13])),
  ] });
ext({ id: "b-price-per-minute", name: "Price per Minute (10 min)", source: "B §1.8", lens: "chord from the origin (average rate)", curriculum: "stretch: average = total ÷ minutes",
  cards: ["On a 10-minute call the average price per minute should be as close as possible to a whole number of pence.", "The connection fee, shared over the 10 minutes, should be as close as possible to a whole number of pence (at least 1p)."],
  parts: [
    part("P", "distance of y(10)/10 from a whole number", "pence", (L) => (L.nv && val(L.m) > 0 && val(L.c) >= 0 ? -nearInt(rat(yAt(L, 10)[0], yAt(L, 10)[1] * 10)).dist : null), WHOLE),
    part("S", "|c/10 − nearest positive whole|", "pence", (L) => -absd(rat(L.c[0], L.c[1] * 10), NP(val(L.c) / 10)), dist("1", "1/2", "1/4", "1/8", "1/16", "1/32", "1/64", 0)),
  ] });
ext({ id: "b-orchard-walk", name: "Orchard Walk", source: "B §2.13", lens: "pegboard (trees)", curriculum: "stretch: grid points on a line",
  cards: ["Somewhere between x = −6 and 6 the path should pass as close as possible to a tree (a whole-number height).", "Writing the gradient as p/q, p² + q² should be as close as possible to a square (trees a whole distance apart)."],
  parts: [
    part("P", "min over x of the distance of y(x) from a whole number", "metres", (L) => {
      if (!L.nv || L.A === 0) return null;
      let best = 1;
      for (let x = -6; x <= 6; x++) best = Math.min(best, nearInt(yAt(L, x)).dist);
      return -best;
    }, WHOLE),
    part("S", "distance from p² + q² to a square", "units", (L) => -nearSquare([L.m[0] ** 2 + L.m[1] ** 2, 1]).dist, dist("8", "4", "2", "1", 0)),
  ] });

// C: families for negotiation (secondary = the document's S1, graded)
const roundC = (x) => Math.floor(val(x) + 0.5);
ext({ id: "c-whole-crossing", name: "Whole Crossing", source: "C §3.2", lens: "x-intercept", curriculum: "core: x-intercept",
  cards: ["Where the line crosses the x-axis should be as close as possible to a whole number.", "That whole number should have as many divisors as possible."],
  parts: [
    part("P", "distance of the x-intercept from a whole number", "units", (L) => (L.nv && L.A !== 0 ? -nearInt(rat(-L.C, L.A)).dist : null), WHOLE),
    part("S", "divisors of it", "divisors", (L) => tau(Math.abs(roundC(rat(-L.C, L.A)))), atLeast([2, 3, 4, 6, 8, 9, 10, 12, 16], undefined)),
  ] });
ext({ id: "c-ruler", name: "Ruler", source: "C §3.6", lens: "perpendicular distance from (0, 0)", curriculum: "stretch: distance from a point to a line",
  cards: ["The shortest distance from (0, 0) to the line, squared, should be as close as possible to a square number (the line must slope).", "That distance should be as big as possible."],
  parts: [
    part("P", "|D² − k²|", "units²", (L) => {
      if (!L.nv || L.A === 0) return null;
      const d2 = rat(L.C * L.C, L.A * L.A + L.B * L.B);
      const k = Math.max(1, Math.round(Math.sqrt(val(d2))));
      return -Math.min(absd(d2, k * k), k > 1 ? absd(d2, (k - 1) ** 2) : Infinity, absd(d2, (k + 1) ** 2));
    }, NEAR("8", "4", "2")),
    part("S", "the whole distance k", "size", (L) => Math.max(1, Math.round(Math.sqrt(L.C * L.C / (L.A * L.A + L.B * L.B)))), sizes([1, 2, 3, 4, 5, 6, 8, 10, 12])),
  ] });
ext({ id: "c-matched-pair", name: "Matched Pair", source: "C §3.16", lens: "slope-intercept as fractions", curriculum: "stretch: fractions in simplest form",
  cards: ["The top of the gradient and the bottom of the y-intercept (both in simplest form) should be as close as possible to each other.", "That shared number's smallest prime factor should be as big as possible."],
  parts: [
    part("P", "| |num m| − den c |", "units", (L) => (L.nv && L.A !== 0 ? -Math.abs(Math.abs(L.m[0]) - L.c[1]) : null), dist("8", "4", "2", "1", 0)),
    part("S", "spf of the shared number", "prime", (L) => spfOf(Math.abs(L.m[0])), sizes([2, 3, 5, 7, 11, 13, 17, 19, 23])),
  ] });
ext({ id: "c-half-way-house", name: "Half-Way House", source: "C §3.9", lens: "value at x = ½", curriculum: "core: substituting a fraction for x",
  cards: ["At x = ½ the line should be as close as possible to a whole number.", "That whole number's smallest prime factor should be as big as possible."],
  parts: [
    part("P", "distance of y(½) from a whole number", "units", (L) => (L.nv ? -nearInt(add(mul(L.m, [1, 2]), L.c)).dist : null), WHOLE),
    part("S", "spf of it", "prime", (L) => spfOf(roundC(add(mul(L.m, [1, 2]), L.c))), sizes([2, ...PRIME_SIZES])),
  ] });
ext({ id: "c-long-division", name: "Long Division (6)", source: "C §3.8", lens: "gradient as a repeating decimal", curriculum: "stretch: fractions to decimals",
  cards: ["Worked out as a decimal, the gradient's repeating block should be as close as possible to six digits long.", "The gradient's top should be as small as possible."],
  parts: [
    part("P", "|period − 6|", "digits", (L) => (L.nv ? -Math.abs(period10(L.m[1]) - 6) : null), dist("4", "3", "2", "1", 0)),
    part("S", "|top of m|", "size", (L) => -Math.abs(L.m[0]), atLeast([-12, -8, -5, -3, -2, -1], undefined)),
  ] });
function period10(q) {
  while (q % 2 === 0) q /= 2;
  while (q % 5 === 0) q /= 5;
  if (q === 1) return 0;
  let r = 10 % q, k = 1;
  while (r !== 1 && k < 1000) {
    r = (r * 10) % q;
    k++;
  }
  return k;
}
ext({ id: "c-square-term", name: "Square Term", source: "C §3.14", lens: "growth pattern", curriculum: "core: sequences; squares",
  cards: ["One of the first ten numbers of the pattern should be as close as possible to a square number.", "As many of the ten as possible should be different square numbers."],
  parts: [
    part("P", "min over n of the distance of y(n) to a square", "units", (L) => {
      if (!L.nv) return null;
      let best = Infinity;
      for (let n = 1; n <= 10; n++) {
        const y = yAt(L, n);
        best = Math.min(best, val(y) < 0 ? -val(y) : nearSquare(y).dist);
      }
      return -best;
    }, D8),
    part("S", "different squares among y(1)…y(10)", "squares", (L) => (L.A === 0 ? 1 : squareTerms(L, 10).length), count(5)),
  ] });

// E: unusual lenses
ext({ id: "e-sheep-fence", name: "Sheep Fence (N = 10)", source: "E §4", lens: "dots above a fence", curriculum: "core: plotting points; above and below a line",
  cards: ["The line is a fence across 49 sheep on the dots (0..6, 0..6): the number of sheep above it should be as close as possible to 10.", "The fence should keep as far as possible from the nearest sheep not on it."],
  parts: [
    part("P", "|above − 10|", "sheep", (L) => {
      if (!L.nv) return null;
      let above = 0;
      for (let x = 0; x <= 6; x++) for (let y = 0; y <= 6; y++) if (y > val(yAt(L, x)) + 1e-12) above++;
      return -Math.abs(above - 10);
    }, dist("8", "5", "3", "2", "1", 0)),
    part("S", "smallest squared distance to a sheep off the fence", "units²", (L) => {
      const h = L.A * L.A + L.B * L.B;
      let mn = Infinity;
      for (let x = 0; x <= 6; x++)
        for (let y = 0; y <= 6; y++) {
          const v = L.A * x + L.B * y + L.C;
          if (v !== 0) mn = Math.min(mn, (v * v) / h);
        }
      return mn;
    }, sizes([1 / 128, 1 / 64, 1 / 32, 1 / 16, 1 / 8, 1 / 5, 1 / 4])),
  ] });
ext({ id: "e-tresillo", name: "Tresillo", source: "E §6", lens: "drum beats (floor of y(n))", curriculum: "core: table of values; rounding down",
  cards: ["Each time the line passes a whole number the drum sounds: as many as possible of the first eight beats should match x . . x . . x .", "The pattern should keep repeating for as many beats as possible after that."],
  parts: [
    part("P", "beats matching x..x..x.", "beats", (L) => (L.nv ? beats(L, 1, 8) : null), count(8)),
    part("S", "beats the pattern keeps repeating (9…32)", "beats", (L) => beats(L, 9, 32, true), atLeast([1, 2, 4, 8, 12, 16, 20, 24], undefined)),
  ] });
function beats(L, from, to, streak = false) {
  const T = "x..x..x.";
  let n = 0;
  for (let k = from; k <= to; k++) {
    const hit = Math.floor(val(yAt(L, k)) + 1e-12) !== Math.floor(val(yAt(L, k - 1)) + 1e-12);
    const want = T[(k - 1) % 8] === "x";
    if (hit === want) n++;
    else if (streak) break;
  }
  return n;
}
ext({ id: "e-firefly-jar", name: "Firefly Jar (K = 5)", source: "E §17", lens: "iterating the machine from 0", curriculum: "core: function machines",
  cards: ["Feed 0 in and keep feeding the answer back: the firefly should escape the jar (−10 to 10) as close as possible to the fifth hop.", "When it escapes, it should land as close as possible to the jar."],
  parts: [
    part("P", "|escape − 5|", "hops", (L) => {
      const e = escape(L);
      return e ? -Math.abs(e.k - 5) : null;
    }, dist("8", "4", "3", "2", "1", 0)),
    part("S", "|hop at escape|", "units", (L) => -Math.abs(escape(L).x), atLeast([-60, -40, -25, -18, -14, -12, -11], undefined)),
  ] });
function escape(L) {
  if (!L.nv) return null;
  let x = 0;
  const m = val(L.m), c = val(L.c);
  for (let k = 1; k <= 64; k++) {
    x = m * x + c;
    if (Math.abs(x) > 10 + 1e-9) return { k, x };
  }
  return null;
}
ext({ id: "e-lamp-rulers", name: "Same on Both Rulers (T = 6)", source: "E §11", lens: "nomogram (threads between two rulers)", curriculum: "core: solving x = mx + c",
  cards: ["The thread that hangs straight down should be as close as possible to the one at 6.", "As many of the threads from −5 to 5 as possible should land on different whole numbers."],
  parts: [
    part("P", "|c/(1 − m) − 6|", "units", (L) => (fixedPt(L) ? -absd(fixedPt(L), 6) : null), NEAR("4", "2")),
    part("S", "different whole values among y(−5)…y(5)", "values", (L) => {
      const s = new Set();
      for (let x = -5; x <= 5; x++) {
        const y = yAt(L, x);
        if (y[1] === 1) s.add(y[0]);
      }
      return s.size;
    }, atLeast([1, 2, 3, 4, 6, 8, 10, 11], 11)),
  ] });
ext({ id: "e-exact-change", name: "Exact Change (W = 3)", source: "E §13", lens: "general form as coins", curriculum: "stretch: whole-number solutions of ax + by = N",
  cards: ["Reading the line as a·x + b·y = N (coins worth a and b paying N), the number of ways to pay should be as close as possible to 3.", "In every way to pay, the smaller pile should be as big as possible."],
  parts: [
    part("P", "|ways − 3|", "ways", (L) => {
      const w = ways(L);
      return w ? -Math.abs(w.length - 3) : null;
    }, dist("8", "4", "2", "1", 0)),
    part("S", "smallest pile", "coins", (L) => {
      const w = ways(L);
      return w.length ? Math.min(...w.map(([x, y]) => Math.min(x, y))) : -1;
    }, sizes([0, 1, 2, 3, 4, 5])),
  ] });
function ways(L) {
  const a = L.A, b = L.B, N = -L.C;
  if (!(a > 0 && b > 0)) return null;
  const out = [];
  for (let x = 0; a * x <= N; x++) if ((N - a * x) % b === 0) out.push([x, (N - a * x) / b]);
  return out;
}
ext({ id: "e-haga-fold", name: "Haga's Fold", source: "E §2", lens: "line as a paper crease", curriculum: "stretch: reflection in a line",
  cards: ["Folding the 8 × 8 paper along the line, the bottom-left corner should land as close as possible to the top edge.", "It should land as close as possible to the middle of that edge."],
  parts: [
    part("P", "distance of the landing point from the top edge", "units", (L) => {
      const l = landing(L);
      return l ? -(Math.abs(l[1] - 8) + Math.max(0, -l[0], l[0] - 8)) : null;
    }, dist("4", "2", "1", "1/2", "1/4", "1/8", 0)),
    part("S", "|landing x − 4|", "units", (L) => -Math.abs(landing(L)[0] - 4), dist("4", "2", "1", "1/2", "1/4", 0)),
  ] });
function landing(L) {
  if (!L.nv) return null;
  const h = L.A * L.A + L.B * L.B;
  return [(-2 * L.A * L.C) / h, (-2 * L.B * L.C) / h];
}
ext({ id: "e-cipher-wheel", name: "Cipher Wheel (GIRL → TRIO)", source: "E §18", lens: "the line mod 26 as a code", curriculum: "stretch: substituting x; remainders",
  cards: ["Letter number k becomes letter number y(k), counting round the alphabet: as many letters of GIRL as possible should become the letters of TRIO.", "|m| + |c| should be as small as possible."],
  parts: [
    part("P", "letters right", "letters", (L) => {
      if (!L.nv) return null;
      const P = "GIRL", T = "TRIO";
      let n = 0;
      for (let i = 0; i < 4; i++) {
        const y = yAt(L, P.charCodeAt(i) - 65);
        if (y[1] === 1 && (((y[0] % 26) + 26) % 26) === T.charCodeAt(i) - 65) n++;
      }
      return n;
    }, count(4)),
    part("S", "|m| + |c|", "size", (L) => -(Math.abs(val(L.m)) + Math.abs(val(L.c))), atLeast([-60, -30, -20, -10, -5, -3, -2], undefined)),
  ] });
ext({ id: "e-fair-cut", name: "Fair Cut", source: "E §3", lens: "line as a saw cut through a chessboard", curriculum: "stretch: area under a line",
  cards: ["The line saws the 8 × 8 chessboard in two: the area below it should be as close as possible to half (32).", "The cut should pass through as many more dark squares than light ones as possible."],
  parts: [
    part("P", "|area below − 32|", "squares", (L) => (L.nv ? -Math.abs(areaBelow(L) - 32) : null), dist("8", "4", "2", "1", "1/2", "1/4", 0)),
    part("S", "dark minus light squares cut", "squares", (L) => {
      let d = 0;
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 8; j++) {
          const v = [0, 1].flatMap((di) => [0, 1].map((dj) => j + dj - val(yAt(L, i + di))));
          if (Math.min(...v) < -1e-12 && Math.max(...v) > 1e-12) d += (i + j) % 2 === 0 ? 1 : -1;
        }
      return d;
    }, atLeast([1, 2, 3, 4, 5, 6, 7, 8], 8)),
  ] });
function areaBelow(L) {
  const m = val(L.m), c = val(L.c), f = (x) => Math.min(8, Math.max(0, m * x + c));
  const cuts = [0, 8];
  if (m !== 0) for (const t of [0, 8]) {
    const x = (t - c) / m;
    if (x > 0 && x < 8) cuts.push(x);
  }
  cuts.sort((a, b) => a - b);
  let s = 0;
  for (let i = 1; i < cuts.length; i++) s += ((f(cuts[i - 1]) + f(cuts[i])) / 2) * (cuts[i] - cuts[i - 1]);
  return s;
}

// --------------------------------------------------------------------------------------------------------------
// Levels
// --------------------------------------------------------------------------------------------------------------
const EPS = 1e-12;
/** The level of a line on a family, and the per-part levels: [total, [p0, p1, …]] (null part = not reached). */
export function levels(f, L) {
  const per = [];
  let total = 0;
  for (let i = 0; i < f.parts.length; i++) {
    const pt = f.parts[i];
    const v = pt.value(L);
    if (v === null || v === undefined || Number.isNaN(v)) {
      if (i === 0) return [0, [0]];
      break;
    }
    let k = 0;
    for (const t of pt.rungs) if (v >= t - EPS) k++;
    per.push(k);
    total += k;
    if (pt.top === undefined || v < pt.top - EPS || k < pt.rungs.length) break;
  }
  return [total, per];
}
/** Rung labels in ladder order: "P ≤ 1/4", …, "S ≥ 3", … */
export const rungLabels = (f) => f.parts.flatMap((pt) => pt.labels.map((l) => `${pt.key} ${l}`));

// --------------------------------------------------------------------------------------------------------------
// The beginner families, ungated (doc §8): one primary and several candidate secondaries. A dealt rule is the primary
// plus ONE secondary, scored as the plain lexicographic tuple (P, S): S orders lines at every level of P.
// --------------------------------------------------------------------------------------------------------------
const nearPrimeInt = (n) => distPrime([n, 1]);
const firstNonRun = (L) => {
  const n = staircase(L);
  return yAt(L, n);
};
const runCount = (k) => ({ rungs: Array.from({ length: k }, (_, i) => i + 1), labels: Array.from({ length: k }, (_, i) => `≥ ${i + 1}`) });
export const BEGINNER = [
  {
    id: "prime-staircase", name: "Prime Staircase", source: "K1 (A15, C PT)", topic: "core: sequences (the nth term); primes under 50",
    card: "The pattern y(0), y(1), y(2), … should start with as long a run of different primes as possible.",
    P: part("P", "run of different primes from y(0)", "primes", staircase, runCount(6)),
    S: [
      ["first-prime", "The first prime should be as big as possible.", "growth pattern", part("S", "y(0)", "size", (L) => val(L.c), sizes([3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]))],
      ["near-miss", "The first term that is not prime should be as close as possible to a prime.", "growth pattern, number line", part("S", "distance of the first non-prime term from a prime", "units", (L) => -distPrime(rat(Math.abs(firstNonRun(L)[0]), firstNonRun(L)[1])), dist("8", "4", "2", "1", "1/2", "1/4", "1/8"))],
      ["step-30", "The step should be as close as possible to a multiple of 30.", "slope-intercept (m)", part("S", "distance of m from a multiple of 30", "units", (L) => -Math.abs(val(L.m) - 30 * Math.round(val(L.m) / 30)), dist("12", "8", "6", "4", "2", "1", 0))],
      ["twin-end", "The last prime of the run should be as close as possible to another prime.", "number line", part("S", "gap from the last prime to the nearest prime", "units", (L) => -(staircase(L) ? primeGap(lastOfRun(L)) : 99), dist("14", "10", "8", "6", "4", "2"))],
      ["last-prime", "The last prime of the run should be as big as possible.", "growth pattern", part("S", "the last prime", "size", (L) => (staircase(L) ? lastOfRun(L) : 0), sizes([5, 11, 17, 29, 47, 71, 101, 151, 251]))],
      ["step-back", "The term before the start, y(−1), should be as close as possible to a prime.", "growth pattern (backwards)", part("S", "distance of y(−1) from a prime", "units", (L) => -distPrime(rat(Math.abs(yAt(L, -1)[0]), yAt(L, -1)[1])), dist("4", "2", "1", "1/2", "1/4", 0))],
    ],
  },
  {
    id: "square-area", name: "Square Area", source: "A2 (owner's example 2), C SC, K2", topic: "stretch: area of a triangle from its intercepts; square numbers",
    card: "The triangle the line cuts off the axes should have an area as close as possible to a square number.",
    P: part("P", "distance from the area to the nearest square", "area units", (L) => (L.tri ? -nearSquare(L.area).dist : null), dist("8", "4", "2", "1", "1/2", "1/4", "1/8", "1/16", 0)),
    S: [
      ["root-factors", "That square's root should have as many prime factors as possible (12 = 2·2·3 has three).", "factor tree", part("S", "Ω(root)", "factors", (L) => bigOmega(nearSquare(L.area).k), runCount(7))],
      ["big-root", "That square's root should be as big as possible.", "intercept triangle", part("S", "the root", "size", (L) => nearSquare(L.area).k, sizes([2, 3, 4, 6, 8, 12, 16, 24, 32]))],
      ["slanted-square", "The slanted side, squared, should be as close as possible to a square number (Pythagoras).", "intercept triangle", part("S", "distance from h² to a square", "units²", (L) => -nearSquare(L.hyp2).dist, dist("16", "8", "4", "2", "1", "1/2", 0))],
      ["prime-root", "That square's root should be as close as possible to a prime.", "number line", part("S", "distance of the root from a prime", "units", (L) => -nearPrimeInt(Math.max(0, nearSquare(L.area).k)), dist("4", "2", "1", 0))],
    ],
  },
  {
    id: "treasure", name: "Treasure (2, 37)", source: "A17 (A6 treasure)", topic: "core: substituting x; table of values",
    card: "When x is 2, y should be as close as possible to 37.",
    P: part("P", "|y(2) − 37|", "units", (L) => (L.nv ? -absd(yAt(L, 2), 37) : null), dist("32", "16", "8", "4", "2", "1", "1/2", "1/4", 0)),
    S: [
      ["prime-terms", "As many as possible of y(1) … y(8) should be different primes.", "table", part("S", "different primes among y(1)…y(8)", "primes", (L) => {
        const s = new Set();
        for (let x = 1; x <= 8; x++) {
          const [a, b] = yAt(L, x);
          if (b === 1 && isPrime(a)) s.add(a);
        }
        return s.size;
      }, runCount(8))],
      ["prime-gradient", "The gradient should be as close as possible to a prime.", "slope-intercept", part("S", "distance of m from a prime", "units", (L) => -distPrime(L.m), dist("4", "2", "1", "1/2", "1/4", 0))],
      ["square-start", "The y-intercept should be as close as possible to a square number.", "slope-intercept", part("S", "distance of c from a square", "units", (L) => -(val(L.c) < 0 ? -val(L.c) : nearSquare(L.c).dist), dist("8", "4", "2", "1", "1/2", 0))],
      ["whole-crossing", "The x-intercept should be as close as possible to a whole number.", "plane", part("S", "distance of the x-intercept from whole", "units", (L) => (L.A === 0 ? -1 : -nearInt(rat(-L.C, L.A)).dist), dist("1/2", "1/4", "1/8", "1/16", 0))],
    ],
  },
  {
    id: "ruler", name: "Ruler", source: "C RU (A28, E §14, K9)", topic: "stretch: distance from a point to a line, by Pythagoras",
    card: "The shortest distance from (0, 0) to the line, squared, should be as close as possible to a square number.",
    P: part("P", "|D² − k²|", "units²", (L) => {
      if (!L.nv || L.A === 0) return null;
      const d2 = rat(L.C * L.C, L.A * L.A + L.B * L.B);
      const k = Math.max(1, Math.round(Math.sqrt(val(d2))));
      return -Math.min(absd(d2, k * k), k > 1 ? absd(d2, (k - 1) ** 2) : Infinity, absd(d2, (k + 1) ** 2));
    }, dist("8", "4", "2", "1", "1/2", "1/4", "1/8", "1/16", 0)),
    S: [
      ["far", "That distance should be as big as possible.", "plane", part("S", "the nearest whole distance k", "size", (L) => Math.max(1, Math.round(Math.sqrt((L.C * L.C) / (L.A * L.A + L.B * L.B)))), sizes([2, 3, 4, 5, 6, 8, 10, 12]))],
      ["foot-peg", "The foot of the perpendicular should be as close as possible to a peg.", "pegboard", part("S", "squared distance from the foot to a peg", "units²", (L) => -footD2(L), dist("1/4", "1/8", "1/16", "1/32", "1/64", 0))],
      ["prime-distance", "That whole distance should be as close as possible to a prime.", "number line", part("S", "distance of k from a prime", "units", (L) => -nearPrimeInt(Math.max(1, Math.round(Math.sqrt((L.C * L.C) / (L.A * L.A + L.B * L.B))))), dist("6", "4", "3", "2", "1", 0))],
      ["prime-gradient", "The gradient should be as close as possible to a prime.", "slope-intercept", part("S", "distance of m from a prime", "units", (L) => -distPrime(L.m), dist("4", "2", "1", "1/2", "1/4", 0))],
      ["square-area", "The triangle cut off the axes should have an area as close as possible to a square number.", "intercept triangle", part("S", "distance of the area from a square", "area units", (L) => (L.tri ? -nearSquare(L.area).dist : -99), dist("8", "4", "2", "1", "1/2", "1/4", 0))],
      ["whole-gradient", "The gradient should be as close as possible to a whole number.", "slope-intercept", part("S", "distance of m from whole", "units", (L) => -nearInt(L.m).dist, dist("1/4", "1/8", "1/16", 0))],
    ],
  },
  {
    id: "exact-change", name: "Exact Change (6 ways)", source: "E §13 (B §1.3)", topic: "stretch: whole-number solutions of ax + by = N",
    card: "Reading the line as a·x + b·y = N (coins worth a and b paying N), the number of ways to pay should be as close as possible to 6.",
    P: part("P", "|ways − 6|", "ways", (L) => {
      const w = ways(L);
      return w ? -Math.abs(w.length - 6) : null;
    }, dist("5", "4", "3", "2", "1", 0)),
    S: [
      ["big-piles", "In every way to pay, the smaller pile should be as big as possible.", "pegboard", part("S", "smallest pile", "coins", (L) => {
        const w = ways(L);
        return w.length ? Math.min(...w.map(([x, y]) => Math.min(x, y))) : -1;
      }, sizes([0, 1, 2, 3, 4, 5]))],
      ["prime-coins", "Both coin values should be as close as possible to primes (distances added).", "general form", part("S", "distance of a and b from primes", "units", (L) => -(nearPrimeInt(L.A) + nearPrimeInt(L.B)), dist("4", "3", "2", "1", 0))],
      ["big-bill", "The bill N should be as big as possible.", "general form", part("S", "N", "size", (L) => -L.C, sizes([10, 15, 20, 30, 45, 60, 90]))],
      ["even-split", "Some way to pay should use as close as possible to equal numbers of each coin.", "pegboard", part("S", "min |x − y| over the ways", "coins", (L) => {
        const w = ways(L);
        return w.length ? -Math.min(...w.map(([x, y]) => Math.abs(x - y))) : -99;
      }, dist("8", "4", "2", "1", 0))],
    ],
  },
  {
    id: "prime-landing", name: "Prime Landing (owner's example 1, regraded)", source: "A1 (owner's example 1), C WL, K3", topic: "core: y-intercept; primes under 50",
    card: "The y-intercept should be as close as possible to a prime number.",
    P: part("P", "distance of c from the nearest prime", "units", (L) => (L.nv ? -distPrime(L.c) : null), dist("4", "2", "1", "1/2", "1/4", "1/8", 0)),
    S: [
      // every prime a rung: under mixed costing a prime p costs p/2 bits, so consecutive primes are 1–3 bits apart
      ["big-prime", "That prime should be as big as possible.", "number line", part("S", "the nearest integer's smallest prime factor", "prime", (L) => Math.max(...nearInt(L.c).near.map(spfOf)), sizes([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]))],
      ["prime-gradient", "The gradient should be as close as possible to a prime too.", "slope-intercept", part("S", "distance of m from a prime", "units", (L) => -distPrime(L.m), dist("4", "2", "1", "1/2", "1/4", 0))],
      ["whole-crossing", "The x-intercept should be as close as possible to a whole number.", "plane", part("S", "distance of the x-intercept from whole", "units", (L) => (L.A === 0 ? -1 : -nearInt(rat(-L.C, L.A)).dist), dist("1/2", "1/4", "1/8", "1/16", 0))],
      ["twin", "The prime should be as close as possible to another prime (twins are two apart).", "number line", part("S", "gap to the next nearest prime", "units", (L) => -primeGap(Math.max(2, Math.round(val(L.c)))), dist("10", "6", "4", "2"))],
      ["next-prime", "y(1) = m + c should be as close as possible to a prime too.", "table", part("S", "distance of y(1) from a prime", "units", (L) => -distPrime(rat(Math.abs(yAt(L, 1)[0]), yAt(L, 1)[1])), dist("4", "2", "1", "1/2", "1/4", 0))],
    ],
  },
  {
    id: "same-on-both-rulers", name: "Same on Both Rulers (T = 6)", source: "E §11 (B §1.4, C FP, K5)", topic: "core: solving x = mx + c",
    card: "The number the machine leaves unchanged (where the line crosses y = x) should be as close as possible to 6.",
    P: part("P", "|c/(1 − m) − 6|", "units", (L) => (fixedPt(L) ? -absd(fixedPt(L), 6) : null), dist("16", "8", "4", "2", "1", "1/2", "1/4", 0)),
    S: [
      ["whole-values", "As many of y(−5) … y(5) as possible should be different whole numbers.", "table", part("S", "different whole values among y(−5)…y(5)", "values", (L) => {
        const s = new Set();
        for (let x = -5; x <= 5; x++) {
          const y = yAt(L, x);
          if (y[1] === 1) s.add(y[0]);
        }
        return s.size;
      }, runCount(11))],
      ["steep", "The gradient should be as far from 1 as possible.", "slope-intercept", part("S", "|m − 1|", "size", (L) => Math.abs(val(L.m) - 1), sizes([1 / 4, 1 / 2, 1, 2, 3, 5, 8]))],
      ["prime-start", "The y-intercept should be as close as possible to a prime (ignoring sign).", "slope-intercept", part("S", "distance of |c| from a prime", "units", (L) => -distPrime(rat(Math.abs(L.c[0]), L.c[1])), dist("4", "2", "1", "1/2", 0))],
      ["whole-lamp", "The lamp's height m/(m − 1) should be as close as possible to a whole number.", "nomogram", part("S", "distance of m/(m − 1) from whole", "units", (L) => -nearInt(div(L.m, sub(L.m, [1, 1]))).dist, dist("1/2", "1/4", "1/8", "1/16", 0))],
    ],
  },
  {
    id: "pythagorean-area", name: "Pythagorean Area (A = 6)", source: "A4 (owner's rule 2), B §1.5", topic: "stretch: area of a triangle from its intercepts",
    card: "The triangle the line cuts off the axes should have an area as close as possible to 6.",
    P: part("P", "|area − 6|", "area units", (L) => (L.tri ? -absd(L.area, 6) : null), dist("16", "8", "4", "2", "1", "1/2", "1/4", 0)),
    S: [
      ["slanted-square", "The slanted side, squared, should be as close as possible to a square number.", "intercept triangle", part("S", "distance from h² to a square", "units²", (L) => -nearSquare(L.hyp2).dist, dist("16", "8", "4", "2", "1", "1/2", 0))],
      ["whole-legs", "Both legs should be as close as possible to whole numbers (distances added).", "intercept triangle", part("S", "distance of the legs from whole", "units", (L) => -(nearInt(L.legX).dist + nearInt(L.legY).dist), dist("1/2", "1/4", "1/8", "1/16", 0))],
      ["prime-height", "The y-intercept should be as close as possible to a prime (ignoring sign).", "slope-intercept", part("S", "distance of |c| from a prime", "units", (L) => -distPrime(rat(Math.abs(L.c[0]), L.c[1])), dist("4", "2", "1", "1/2", 0))],
      ["simple-slope", "The gradient's fraction should have a bottom number as small as possible.", "rise over run", part("S", "bottom of m", "size", (L) => -L.m[1], atLeast([-12, -8, -6, -4, -3, -2, -1], undefined))],
    ],
  },
];
/** Ungated (P, S) levels: the threshold counts of each part. null when P is undefined. */
export function pairLevels(P, S, L) {
  const p = P.value(L);
  if (p === null || p === undefined || Number.isNaN(p)) return null;
  const s = S.value(L);
  const k = (pt, v) => (v === null || v === undefined || Number.isNaN(v) ? 0 : pt.rungs.filter((t) => v >= t - EPS).length);
  return [k(P, p), k(S, s)];
}
