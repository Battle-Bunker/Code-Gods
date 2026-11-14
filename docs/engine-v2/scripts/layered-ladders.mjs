#!/usr/bin/env node
// Measurements behind docs/engine-v2/layered-line-rules.md (design only; no engine code).
//
//   node docs/engine-v2/scripts/layered-ladders.mjs                 # heights 20, 50, 100 (about a minute)
//   node docs/engine-v2/scripts/layered-ladders.mjs --heights 20,50 --only prime-factor-intercept,pell-gradient
//   node docs/engine-v2/scripts/layered-ladders.mjs --markdown out.md
//
// THE REFERENCE LAW. The state is a primitive line a·x + b·y + c = 0 over the rationals (spec §12.1: gcd 1, b > 0, or
// b = 0 and a > 0). Its read length on the Q domain is φ = int(a) + int(b) + int(c) (spec §2.3, §12.2:
// int(n) = gamma(zigzag(n) + 1), gamma(n) = 2⌊log2 n⌋ + 1). We enumerate every such line of height max(|a|,|b|,|c|) ≤ H
// and weigh it 2^−φ, normalised over the enumerated set. This is the stationary law of the spec's walk WHEN every
// mutator's base price is symmetric (spec §5.3: detailed balance with π ∝ 2^−φ); the real priced walk is not reversible
// on purpose, so the real values will differ by the price-list effect the v2 estimator measures. A rung's bits are
// −log2 of the mass of the lines at that rung or above (spec §7.1).
//
// Each family is a score tuple (compared lexicographically, bigger is better, null = WORST) and a ladder of rungs; a
// rung is a threshold tuple, and a missing trailing component means "anything". Secondary components are GATED: they
// are only computed once the component before them is at its top, and are 0 otherwise (the principle in the doc §1).

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const HEIGHTS = opt("heights", "20,50,100").split(",").map(Number);
const ONLY = opt("only", "") ? new Set(opt("only", "").split(",")) : null;
const MARKDOWN = opt("markdown", "");
// --pairs id[:params],id[:params],…  for each pair, the line that serves both best (at the last height)
const PAIRS = opt("pairs", "") ? opt("pairs", "").split(",") : null;

// ---------- number theory ----------
const SIEVE_N = 2_000_001;
const spfTab = new Int32Array(SIEVE_N); // smallest prime factor, 0 for 0 and 1
const PRIMES = [];
for (let i = 2; i < SIEVE_N; i++) {
  if (spfTab[i] === 0) {
    spfTab[i] = i;
    PRIMES.push(i);
  }
  for (let j = 0; j < PRIMES.length && PRIMES[j] <= spfTab[i] && i * PRIMES[j] < SIEVE_N; j++) spfTab[i * PRIMES[j]] = PRIMES[j];
}
function isPrime(n) {
  if (!Number.isSafeInteger(n) || n < 2) return false;
  if (n < SIEVE_N) return spfTab[n] === n;
  if (n > 1e12) return false; // beyond what we test; callers cap before this
  for (const p of PRIMES) {
    if (p * p > n) return true;
    if (n % p === 0) return false;
  }
  return true;
}
const gcd = (a, b) => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};
function factor(n) {
  // n ≥ 1, n < SIEVE_N
  const f = [];
  while (n > 1) {
    const p = spfTab[n];
    f.push(p);
    n /= p;
  }
  return f;
}
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
// smallest prime factor of an integer, as a rule reads it: 0 is divisible by every prime (2); ±1 has none (1)
const spfOf = (n) => {
  n = Math.abs(n);
  if (n === 0) return 2;
  if (n === 1) return 1;
  if (n < SIEVE_N) return spfTab[n];
  for (const p of PRIMES) if (n % p === 0) return p;
  return n;
};
const isSq = (n) => {
  if (n < 0) return false;
  const r = Math.round(Math.sqrt(n));
  return r * r === n;
};
const isqrt = (n) => Math.round(Math.sqrt(n));
const collatz = (n) => {
  let s = 0;
  while (n !== 1) {
    n = n % 2 ? 3 * n + 1 : n / 2;
    s++;
  }
  return s;
};
const digitSum = (n) => {
  n = Math.abs(n);
  let s = 0;
  while (n) {
    s += n % 10;
    n = Math.floor(n / 10);
  }
  return s;
};
const twoSquares = (n) => {
  let r = 0;
  for (let x = 0; 2 * x * x <= n; x++) if (isSq(n - x * x)) r++;
  return r;
};

// ---------- exact rationals (numbers; every magnitude here stays far below 2^53) ----------
function rat(n, d) {
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1;
  return [n / g, d / g];
}
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
// distance from n/d to the nearest integer, as a float; the nearest integers (two on a tie)
function nearInt([n, d]) {
  const [q, r] = floorDiv(n, d);
  if (2 * r < d) return { dist: r / d, near: [q] };
  if (2 * r > d) return { dist: (d - r) / d, near: [q + 1] };
  return { dist: r / d, near: [q, q + 1] };
}
const isInt = ([, d]) => d === 1;
const val = ([n, d]) => n / d;
function distPrime([n, d]) {
  // distance from n/d to the nearest prime (primes are positive)
  const x = n / d;
  if (x <= 2) return (2 * d - n) / d;
  const f = Math.floor(x);
  let lo = f;
  while (lo >= 2 && !isPrime(lo)) lo--;
  let hi = Math.ceil(x);
  while (!isPrime(hi)) hi++;
  return Math.min(Math.abs(n - lo * d) / d, Math.abs(hi * d - n) / d);
}

// ---------- the line and its derived elements ----------
function lineCtx(A, B, C) {
  const L = { A, B, C, nv: B > 0 };
  if (L.nv) {
    L.m = rat(-A, B);
    L.c = rat(-C, B);
  }
  L.tri = A !== 0 && B !== 0 && C !== 0;
  if (L.tri) {
    L.p = rat(-C, A); // x-intercept
    L.area = rat(C * C, 2 * Math.abs(A * B));
    L.hyp2 = rat(C * C * (A * A + B * B), A * A * B * B);
  }
  return L;
}
const yAt = (L, k) => rat(-L.A * k - L.C, L.B); // y(k)
const R = (x) => -x; // "min" components are stored negated

// ---------- the families ----------
// score(L) → number[] | null; rungs: [label, threshold[]]
const F = [];
const fam = (id, title, params, score, rungs) => F.push({ id, title, params, score, rungs });
const dRungs = (lab, ds) => ds.map((d) => [`${lab} ≤ ${d.s}`, [-d.v]]);
const q = (s) => ({ s, v: eval(s) });

// 1. Prime-Factor Intercept (owner's example 1)
fam(
  "prime-factor-intercept",
  "Prime-Factor Intercept",
  "",
  (L) => {
    if (!L.nv) return null;
    const { dist, near } = nearInt(L.c);
    return [R(dist), dist === 0 ? Math.max(...near.map(spfOf)) : 0];
  },
  [
    ...dRungs("d(c, ℤ)", [q("1/4"), q("1/8")]),
    ["c whole", [0]],
    ...[2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 37, 47, 59, 71, 83, 97].map((p) => [`spf ≥ ${p}`, [0, p]]),
  ],
);

// 1b. the same idea on two elements: m and c both whole, the smaller smallest prime factor counts
fam(
  "prime-factor-intercept",
  "Prime-Factor Intercept",
  "elements m and c",
  (L) => {
    if (!L.nv) return null;
    const a = nearInt(L.m), b = nearInt(L.c);
    const d = a.dist + b.dist;
    if (d !== 0) return [R(d), 0];
    return [0, Math.min(Math.max(...a.near.map(spfOf)), Math.max(...b.near.map(spfOf)))];
  },
  [
    ...dRungs("d(m, ℤ) + d(c, ℤ)", [q("1/2"), q("1/4")]),
    ["m, c whole", [0]],
    ...[2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 37, 47, 59, 71, 83, 97].map((p) => [`smaller spf ≥ ${p}`, [0, p]]),
  ],
);

// 2. Square Area, Rich Root (owner's example 2)
fam(
  "square-area-roots",
  "Square Area, Rich Root",
  "",
  (L) => {
    if (!L.tri) return null;
    const a = val(L.area);
    const s0 = Math.floor(Math.sqrt(a));
    let best = null;
    for (const s of [s0, s0 + 1]) {
      const d = Math.abs(L.area[0] - s * s * L.area[1]) / L.area[1];
      const om = s <= 1 ? 0 : bigOmega(s);
      if (!best || d < best.d || (d === best.d && om > best.om)) best = { d, om };
    }
    return [R(best.d), best.d === 0 ? best.om : 0];
  },
  [...dRungs("d(area, □)", [q("2"), q("1"), q("1/2"), q("1/4")]), ["area square", [0]], ...[1, 2, 3, 4, 5, 6].map((k) => [`Ω(root) ≥ ${k}`, [0, k]])],
);

// 3. Prime Gradient, Prime Pegs (owner's rule 1, layered)
fam(
  "prime-gradient-pegs",
  "Prime Gradient, Prime Pegs",
  "pegs with prime x, y ≤ 100",
  (L) => {
    if (!L.nv) return null;
    const d = distPrime(L.m);
    if (d !== 0) return [R(d), 0];
    let n = 0;
    for (const x of PRIMES) {
      if (x > 100) break;
      const num = -L.C - L.A * x;
      if (num % L.B === 0) {
        const y = num / L.B;
        if (y <= 100 && isPrime(y)) n++;
      }
    }
    // tertiary: with four prime pegs held, a bigger prime gradient is better (steep lines leave the board fast)
    return [0, Math.min(n, 4), n >= 4 ? val(L.m) : 0];
  },
  [
    ...dRungs("d(m, prime)", [q("1"), q("1/2"), q("1/4")]),
    ["m prime", [0]],
    ...[1, 2, 3, 4].map((k) => [`prime pegs ≥ ${k}`, [0, k]]),
    ...[3, 5, 7, 11, 13, 17, 19, 23].map((p) => [`four pegs, m ≥ ${p}`, [0, 4, p]]),
  ],
);

// 4. Pythagorean Area (owner's rule 2, layered)
for (const A0 of [6, 30, 5])
  fam(
    "pythagorean-area",
    "Pythagorean Area",
    `A = ${A0}`,
    (L) => {
      if (!L.tri) return null;
      const d = Math.abs(L.area[0] - A0 * L.area[1]) / L.area[1];
      if (d !== 0) return [R(d), 0, 0];
      const ratHyp = isSq(L.hyp2[0]) && isSq(L.hyp2[1]);
      const whole = ratHyp && L.hyp2[1] === 1 && Math.abs(L.C) % Math.abs(L.A) === 0 && Math.abs(L.C) % Math.abs(L.B) === 0;
      return [0, ratHyp ? 1 : 0, whole ? 1 : 0];
    },
    [...dRungs("d(area, A)", [q("2"), q("1"), q("1/2"), q("1/4")]), ["area = A", [0]], ["hyp rational", [0, 1]], ["all sides whole", [0, 1, 1]]],
  );

// 5. m Meets c, Rational Hypotenuse (owner's rule 3, layered)
fam(
  "m-meets-c-pythagorean",
  "m Meets c, on the Unit Circle",
  "",
  (L) => {
    if (!L.nv) return null;
    const d = Math.abs(val(L.m) - val(L.c));
    if (L.m[0] !== L.c[0] || L.m[1] !== L.c[1]) return [R(d), 0];
    const [u, v] = L.m;
    if (u === 0) return [0, 0];
    const h2 = u * u + v * v;
    return [0, isSq(h2) ? isqrt(h2) : 0];
  },
  [...dRungs("|m − c|", [q("2"), q("1"), q("1/2"), q("1/4")]), ["m = c", [0]], ...[5, 13, 17, 25, 37, 53, 65, 85, 101].map((h) => [`triple h ≥ ${h}`, [0, h]])],
);

// 6. Crossing Check (owner's rule 4, layered)
for (const [k, qq] of [
  [1, 13],
  [2, 6],
])
  fam(
    "crossing-check",
    "Crossing Check, Whole Machine, Prime Meeting",
    `k = ${k}, q = ${qq}`,
    (L) => {
      if (!L.nv || L.A === 0) return null;
      const { A, B, C } = L;
      const gap = Math.abs(-A * A * k - A * C + qq * B * B + B * C) / Math.abs(A * B);
      if (gap !== 0) return [R(gap), 0, 0];
      const whole = isInt(L.m) && isInt(L.c);
      const v = val(yAt(L, k));
      return [0, whole ? 1 : 0, whole && isPrime(Math.abs(v)) ? Math.abs(v) : 0];
    },
    [...dRungs("gap", [q("2"), q("1"), q("1/2"), q("1/4")]), ["y(k) = x(q)", [0]], ["whole machine", [0, 1]], ...[2, 3, 5, 7, 11, 13].map((p) => [`prime meeting ≥ ${p}`, [0, 1, p]])],
  );

// 7. Twin Coefficients
fam(
  "twin-coefficients",
  "Twin Coefficients",
  "",
  (L) => {
    if (!L.nv) return null;
    const d = distPrime(L.m) + distPrime(L.c);
    if (d !== 0) return [R(d), 0, 0];
    const a = val(L.m), b = val(L.c);
    const twin = Math.abs(a - b) === 2;
    return [0, twin ? 1 : 0, twin ? Math.min(a, b) : 0];
  },
  [...dRungs("d(m, prime) + d(c, prime)", [q("2"), q("1"), q("1/2")]), ["m, c prime", [0]], ["twins", [0, 1]], ...[5, 11, 17, 29, 41, 59, 71].map((p) => [`smaller twin ≥ ${p}`, [0, 1, p]])],
);

// 8. Pell Gradient (one component; the number theory is in the ladder)
for (const [D, name] of [
  [2, "m² → 2"],
  ["golden", "m² − m → 1"],
])
  fam(
    "pell-gradient",
    "Pell Gradient",
    name,
    (L) => {
      if (!L.nv) return null;
      const [u, v] = L.m;
      const err = D === "golden" ? Math.abs(u * u - u * v - v * v) / (v * v) : Math.abs(u * u - D * v * v) / (v * v);
      return [R(err)];
    },
    dRungs("error", [q("1"), q("1/4"), q("1/16"), q("1/64"), q("1/256"), q("1/1024"), q("1/4096")]),
  );

// 9. Crowded Intercept (divisor count)
fam(
  "crowded-intercept",
  "Crowded Intercept",
  "",
  (L) => {
    if (!L.nv) return null;
    const { dist, near } = nearInt(L.c);
    return [R(dist), dist === 0 ? Math.max(...near.map((n) => tau(Math.abs(n)))) : 0];
  },
  [...dRungs("d(c, ℤ)", [q("1/4")]), ["c whole", [0]], ...[2, 3, 4, 6, 8, 9, 10, 12].map((t) => [`divisors ≥ ${t}`, [0, t]])],
);

// 10. Prime Run, Far Out
fam(
  "prime-run",
  "Prime Run",
  "y(1)…y(6)",
  (L) => {
    if (!L.nv) return null;
    const seen = new Set();
    for (let x = 1; x <= 6; x++) {
      const [a, b] = yAt(L, x);
      if (b === 1 && isPrime(a)) seen.add(a);
    }
    const n = seen.size; // different primes: a flat line y = 7 counts once
    // the hint rung: how many of 2, 3, 5 divide the step (six primes in a row need all three)
    const step = isInt(L.m) ? Math.abs(L.m[0]) : 0;
    const k = step === 0 ? 0 : [2, 3, 5].filter((p) => step % p === 0).length;
    return [n, k, n === 6 ? val(yAt(L, 1)) : 0];
  },
  [
    ...[1, 2, 3, 4, 5].map((k) => [`primes ≥ ${k}`, [k]]),
    ...[1, 2, 3].map((k) => [`five, step has ${k} of 2·3·5`, [5, k]]),
    ["six primes", [6]],
    ...[11, 47, 101].map((p) => [`six, first ≥ ${p}`, [6, 3, p]]),
  ],
);

// 11. Square Terms (Fermat's four-squares theorem caps the run at 3)
fam(
  "square-terms",
  "Square Terms",
  "y(1)…y(10)",
  (L) => {
    if (!L.nv || L.A === 0) return null; // a flat line repeats one number: no pattern to count
    let n = 0, run = 0, best = 0;
    for (let x = 1; x <= 10; x++) {
      const [a, b] = yAt(L, x);
      if (b === 1 && a > 0 && isSq(a)) {
        n++;
        run++;
        best = Math.max(best, run);
      } else run = 0;
    }
    return [n, best];
  },
  [...[1, 2, 3, 4, 5].map((k) => [`squares ≥ ${k}`, [k]]), ["five, run ≥ 2", [5, 2]], ["five, run 3", [5, 3]]],
);

// 12. Peg Ruler
fam(
  "peg-ruler",
  "Peg Ruler",
  "≥ 2 pegs of [−10, 10]²",
  (L) => {
    // lattice points exist only if gcd(a, b) = 1; their spacing is √(a² + b²)
    let pegs = 0;
    const { A, B, C } = L;
    if (B !== 0) {
      for (let x = -10; x <= 10; x++) {
        const num = -C - A * x;
        if (num % B === 0 && Math.abs(num / B) <= 10) pegs++;
      }
    } else if (C % A === 0 && Math.abs(C / A) <= 10) pegs = 21;
    const p = Math.min(pegs, 2);
    if (p < 2) return [p, 0];
    const h2 = A * A + B * B;
    return [2, isSq(h2) ? isqrt(h2) : 0];
  },
  [["1 peg", [1]], ["2 pegs", [2]], ...[1, 5, 10, 13, 17].map((h) => [`spacing ≥ ${h}`, [2, h]])],
);

// 13. Farey Neighbours
fam(
  "farey-neighbours",
  "Farey Neighbours",
  "",
  (L) => {
    if (!L.nv) return null;
    const [u, v] = L.m, [r, s] = L.c;
    const d = Math.abs(Math.abs(u * s - r * v) - 1);
    return [R(d), d === 0 ? Math.min(v, s) : 0];
  },
  [["|ps − qr| − 1 ≤ 1", [-1]], ["neighbours", [0]], ...[2, 3, 4, 5, 7, 10, 15, 20, 30].map((k) => [`smaller denominator ≥ ${k}`, [0, k]])],
);

// 14. Pick's Pegs
for (const N of [10, 30])
  fam(
    "pick-pegs",
    "Pick's Pegs",
    `N = ${N}`,
    (L) => {
      if (!L.tri) return null;
      const p = L.p, qq = L.c;
      const d = nearInt(p).dist + nearInt(qq).dist;
      if (d !== 0) return [R(d), 0];
      const P = Math.abs(p[0]), Q = Math.abs(qq[0]);
      const interior = (P * Q - P - Q - gcd(P, Q)) / 2 + 1; // Pick: I = area − B/2 + 1
      return [0, R(Math.abs(interior - N))];
    },
    [["d sum ≤ 1/2", [-0.5]], ["both whole", [0]], ...[16, 8, 4, 2, 1, 0].map((e) => [`|I − N| ≤ ${e}`, [0, -e]])],
  );

// 15. Twin Sum: a + b + c = 0 (the line passes through (1, 1)), then all prime, then far
fam(
  "twin-sum",
  "Twin Sum",
  "",
  (L) => {
    const { A, B, C } = L;
    const s = Math.abs(A + B + C);
    if (s !== 0) return [R(s), 0, 0];
    const np = [A, B, C].filter((x) => isPrime(Math.abs(x))).length;
    return [0, np, np === 3 ? Math.max(Math.abs(A), Math.abs(B), Math.abs(C)) : 0];
  },
  [["|a + b + c| ≤ 2", [-2]], ["|a + b + c| ≤ 1", [-1]], ["a + b + c = 0", [0]], ...[1, 2, 3].map((k) => [`prime coefficients ≥ ${k}`, [0, k]]), ...[7, 13, 19, 31, 43, 61, 73].map((p) => [`largest ≥ ${p}`, [0, 3, p]])],
);

// 16. Tangent Circle
for (const R0 of [1, 3])
  fam(
    "tangent-circle",
    "Tangent Circle",
    `R = ${R0}`,
    (L) => {
      const { A, B, C } = L;
      const h2 = A * A + B * B;
      const d = Math.abs(C * C - R0 * R0 * h2) / h2;
      if (d !== 0) return [R(d), 0];
      return [0, isqrt(h2)];
    },
    [...dRungs("|dist² − R²|", [q("2"), q("1"), q("1/2"), q("1/4")]), ["tangent", [0]], ...[5, 13, 17, 25, 29].map((h) => [`slant ≥ ${h}`, [0, h]])],
  );

// 17. Cunningham Machine
for (const s0 of [2, 3])
  fam(
    "cunningham-machine",
    "Cunningham Machine",
    `seed ${s0}`,
    (L) => {
      if (!L.nv) return null;
      if (!isInt(L.m) || !isInt(L.c)) return [0];
      const m = L.m[0], c = L.c[0];
      const seen = new Set([s0]);
      let x = s0, n = 0;
      while (n < 10) {
        x = m * x + c;
        if (Math.abs(x) > 1e12 || seen.has(x) || !isPrime(x)) break;
        seen.add(x);
        n++;
      }
      return [n];
    },
    [1, 2, 3, 4, 5, 6, 7].map((k) => [`chain ≥ ${k}`, [k]]),
  );

// 18. Vieta Intercepts
for (const [S, P] of [
  [7, 12],
  [4, 2],
])
  fam(
    "vieta-intercepts",
    "Vieta Intercepts",
    `S = ${S}, P = ${P}`,
    (L) => {
      if (!L.tri) return null;
      const p = val(L.p), qq = val(L.c);
      const s = rat(L.p[0] * L.c[1] + L.c[0] * L.p[1], L.p[1] * L.c[1]);
      const d = Math.abs(s[0] - S * s[1]) / s[1];
      if (d !== 0) return [R(d), 0];
      const pr = rat(L.p[0] * L.c[0], L.p[1] * L.c[1]);
      return [0, R(Math.abs(pr[0] - P * pr[1]) / pr[1])];
    },
    [...dRungs("|p + q − S|", [q("2"), q("1"), q("1/2")]), ["p + q = S", [0]], ...[1, 1 / 4, 1 / 16, 1 / 64, 1 / 256, 0].map((e) => [`|pq − P| ≤ ${e === 0 ? 0 : "1/" + 1 / e}`, [0, -e]])],
  );

// 19. Hailstone Intercept
fam(
  "hailstone-intercept",
  "Hailstone Intercept",
  "",
  (L) => {
    if (!L.nv) return null;
    const { dist, near } = nearInt(L.c);
    if (dist !== 0) return [R(dist), 0];
    const n = Math.abs(near[0]);
    return [0, n === 0 ? 0 : collatz(n)];
  },
  [["c whole", [0]], ...[2, 5, 10, 20, 40, 70, 100, 110].map((k) => [`steps ≥ ${k}`, [0, k]])],
);

// 20. Two-Square Area
fam(
  "two-square-area",
  "Two-Square Area",
  "",
  (L) => {
    if (!L.tri) return null;
    const { dist, near } = nearInt(L.area);
    return [R(dist), dist === 0 ? twoSquares(near[0]) : 0];
  },
  [...dRungs("d(area, ℤ)", [q("1/4")]), ["area whole", [0]], ...[1, 2, 3, 4].map((k) => [`ways ≥ ${k}`, [0, k]])],
);

// 21. Egyptian Line
fam(
  "egyptian-line",
  "Egyptian Line",
  "",
  (L) => {
    if (!L.nv) return null;
    const s = rat(L.m[0] * L.c[1] + L.c[0] * L.m[1], L.m[1] * L.c[1]);
    const unit = (x) => x[0] === 1 && x[1] >= 2;
    const n = [L.m, L.c, s].filter(unit).length;
    return [n, n === 3 ? Math.max(L.m[1], L.c[1]) : 0];
  },
  [...[1, 2, 3].map((k) => [`unit fractions ≥ ${k}`, [k]]), ...[4, 6, 12, 20, 30, 42, 56, 90].map((k) => [`largest denominator ≥ ${k}`, [3, k]])],
);

// 22. Euclid's Long Division (Lamé)
fam(
  "euclid-steps",
  "Euclid's Long Way",
  "",
  (L) => {
    if (!L.nv) return null;
    let [a, b] = [Math.abs(L.m[0]), L.m[1]];
    let n = 0, mx = 0;
    while (b) {
      const qq = Math.floor(a / b);
      mx = Math.max(mx, qq);
      [a, b] = [b, a - qq * b];
      n++;
    }
    return [n, R(mx)];
  },
  [...[2, 3, 4, 5, 6, 7, 8, 9].map((k) => [`steps ≥ ${k}`, [k]]), ["nine, all quotients ≤ 2", [9, -2]]],
);

// 23. Square Triangle Area
fam(
  "square-triangle-area",
  "Square Triangle Area",
  "",
  (L) => {
    if (!L.tri) return null;
    const a = val(L.area);
    let n = Math.max(2, Math.floor((Math.sqrt(8 * a + 1) - 1) / 2));
    let best = null;
    for (const k of [n - 1, n, n + 1]) {
      if (k < 2) continue;
      const T = (k * (k + 1)) / 2;
      const d = Math.abs(L.area[0] - T * L.area[1]) / L.area[1];
      const r = Math.floor(Math.sqrt(T));
      const e = Math.min(T - r * r, (r + 1) * (r + 1) - T);
      if (!best || d < best.d || (d === best.d && e < best.e)) best = { d, e, T };
    }
    return [R(best.d), best.d === 0 ? R(best.e) : -1e9, best.d === 0 && best.e === 0 ? best.T : 0];
  },
  [...dRungs("d(area, triangular)", [q("1"), q("1/2")]), ["area triangular", [0]], ...[8, 4, 2, 1, 0].map((e) => [`|T − □| ≤ ${e}`, [0, -e]]), ["T = 1225 (35², the second)", [0, 0, 1225]]],
);

// 24. Treasure Prime Run
for (const [k, T] of [
  [2, 37],
  [3, 11],
])
  fam(
    "treasure-prime-run",
    "Treasure Prime Run",
    `(k, T) = (${k}, ${T})`,
    (L) => {
      if (!L.nv) return null;
      const y = yAt(L, k);
      const d = Math.abs(y[0] - T * y[1]) / y[1];
      if (d !== 0) return [R(d), 0];
      const seen = new Set();
      for (let x = 1; x <= 8; x++) {
        const [a, b] = yAt(L, x);
        if (b === 1 && isPrime(a)) seen.add(a);
      }
      return [0, seen.size];
    },
    [...dRungs("|y(k) − T|", [q("4"), q("2"), q("1"), q("1/2")]), ["y(k) = T", [0]], ...[2, 3, 4, 5, 6, 7].map((n) => [`primes ≥ ${n}`, [0, n]])],
  );

// 25. Perfect Line
fam(
  "perfect-line",
  "Perfect Line",
  "",
  (L) => {
    if (!L.nv) return null;
    const a = nearInt(L.m), b = nearInt(L.c);
    const d = a.dist + b.dist;
    if (d !== 0) return [R(d), 0];
    const gap = (n) => (n <= 0 ? 1000 : Math.abs(sigma(n) - 2 * n));
    const m = L.m[0], c = L.c[0];
    return [0, R(gap(Math.abs(m)) + gap(Math.abs(c)))];
  },
  [["m, c within 1/2 in all", [-1]], ["m, c whole", [0]], ...[16, 8, 4, 2, 1, 0].map((e) => [`imperfection ≤ ${e}`, [0, -e]])],
);

// 26. Prime Hypotenuse
fam(
  "prime-hypotenuse",
  "Prime Hypotenuse",
  "",
  (L) => {
    if (!L.tri) return null;
    const { dist, near } = nearInt(L.hyp2);
    if (dist !== 0) return [R(dist), 0];
    return [0, isPrime(near[0]) ? near[0] : 0];
  },
  [...dRungs("d(hyp², ℤ)", [q("1/4")]), ["hyp² whole", [0]], ...[2, 5, 13, 29, 61, 101, 181, 401, 1009].map((p) => [`hyp² prime ≥ ${p}`, [0, p]])],
);

// 27. Divisibility Treasure
fam(
  "divisibility-treasure",
  "Divisibility Treasure",
  "k = 5",
  (L) => {
    if (!L.nv) return null;
    const { dist, near } = nearInt(yAt(L, 5));
    if (dist !== 0) return [R(dist), 0];
    const n = Math.abs(near[0]);
    return [0, n === 0 ? 0 : [2, 3, 4, 5, 6, 7, 8, 9].filter((d) => n % d === 0).length];
  },
  [["y(5) whole", [0]], ...[1, 2, 3, 4, 5, 6, 7, 8].map((k) => [`divisors from 2–9 ≥ ${k}`, [0, k]])],
);

// 28. Digit Treasure
fam(
  "digit-treasure",
  "Digit Treasure",
  "k = 10",
  (L) => {
    if (!L.nv) return null;
    const { dist, near } = nearInt(yAt(L, 10));
    if (dist !== 0) return [R(dist), 0, 0];
    const n = near[0];
    return [0, digitSum(n), isPrime(Math.abs(n)) ? 1 : 0];
  },
  [["y(10) whole", [0]], ...[5, 10, 15, 18, 20, 23, 25, 27].map((k) => [`digit sum ≥ ${k}`, [0, k]]), ["…and prime, sum ≥ 25", [0, 25, 1]]],
);

// 29. Stepping Coefficients: a, b, c in equal steps (the line passes through (1, −2)), then all prime, then far
fam(
  "stepping-coefficients",
  "Stepping Coefficients",
  "",
  (L) => {
    const { A, B, C } = L;
    const s = Math.abs(A - 2 * B + C);
    if (s !== 0) return [R(s), 0, 0];
    const np = [A, B, C].filter((x) => isPrime(Math.abs(x))).length;
    return [0, np, np === 3 ? Math.max(Math.abs(A), Math.abs(B), Math.abs(C)) : 0];
  },
  [["|a − 2b + c| ≤ 2", [-2]], ["|a − 2b + c| ≤ 1", [-1]], ["equal steps", [0]], ...[1, 2, 3].map((k) => [`prime coefficients ≥ ${k}`, [0, k]]), ...[7, 13, 19, 31, 43, 61, 79, 97].map((p) => [`largest ≥ ${p}`, [0, 3, p]])],
);

// 30. Parabola Kiss: tangent to y = x², then at a peg, then far out
fam(
  "parabola-kiss",
  "Parabola Kiss",
  "y = x²",
  (L) => {
    if (!L.nv) return null;
    const m = val(L.m), c = val(L.c);
    const d = Math.abs(m * m + 4 * c);
    // exact zero test: m² + 4c = 0 ⇔ u²·cd + 4·cn·v² = 0
    const z = L.m[0] * L.m[0] * L.c[1] + 4 * L.c[0] * L.m[1] * L.m[1] === 0;
    if (!z) return [R(d), 0, 0];
    const peg = isInt(L.m) && L.m[0] % 2 === 0;
    return [0, peg ? 1 : 0, peg ? Math.abs(L.m[0] / 2) : 0];
  },
  [...dRungs("|m² + 4c|", [q("2"), q("1"), q("1/2"), q("1/4")]), ["touches", [0]], ["at a peg", [0, 1]], ...[1, 2, 3, 4, 5, 7, 10].map((x) => [`touch |x| ≥ ${x}`, [0, 1, x]])],
);

// 31. Whole Numbers Everywhere
fam(
  "whole-everywhere",
  "Whole Numbers Everywhere",
  "m, c, x-int, area, hyp",
  (L) => {
    let n = 0;
    if (L.nv) n += (isInt(L.m) ? 1 : 0) + (isInt(L.c) ? 1 : 0);
    if (L.tri) {
      n += isInt(L.p) ? 1 : 0;
      n += isInt(L.area) ? 1 : 0;
      n += L.hyp2[1] === 1 && isSq(L.hyp2[0]) ? 1 : 0;
    }
    return [n];
  },
  [1, 2, 3, 4, 5].map((k) => [`whole ≥ ${k}`, [k]]),
);

// ---------- enumeration ----------
const gammaLen = (n) => 2 * Math.floor(Math.log2(n)) + 1;
const intLen = (n) => gammaLen((n >= 0 ? 2 * n : -2 * n - 1) + 1);

function cmp(score, thr) {
  for (let i = 0; i < thr.length; i++) {
    const s = score[i] ?? -Infinity;
    if (s > thr[i] + 1e-12) return 1;
    if (s < thr[i] - 1e-12) return -1;
  }
  return 0;
}
const ge = (score, thr) => cmp(score, thr) >= 0;
const lexGt = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? -Infinity, y = b[i] ?? -Infinity;
    if (x > y + 1e-12) return true;
    if (x < y - 1e-12) return false;
  }
  return false;
};

const famKey = (f) => (f.params ? `${f.id}:${f.params}` : f.id);
const families = PAIRS
  ? PAIRS.map((k) => F.find((f) => famKey(f) === k || (f.id === k && !F.some((g) => g !== f && g.id === k && g.params === "")) || famKey(f).startsWith(k + ":")) ?? (() => { throw new Error(`no family ${k}`); })())
  : ONLY
    ? F.filter((f) => ONLY.has(f.id))
    : F;
const pairLevels = PAIRS ? [] : null; // per line: levels in each family, at the last height
const results = families.map(() => ({}));

for (const H of HEIGHTS) {
  const t0 = Date.now();
  const acc = families.map((f) => ({ level: new Float64Array(f.rungs.length + 1), phi: new Float64Array(f.rungs.length + 1), best: null, bestMass: 0, bestLine: null }));
  let Z = 0, count = 0;
  for (let B = 0; B <= H; B++)
    for (let A = -H; A <= H; A++) {
      if (B === 0 && A <= 0) continue;
      const gab = gcd(A, B);
      for (let C = -H; C <= H; C++) {
        if (gcd(gab, C) !== 1) continue;
        const phi = intLen(A) + intLen(B) + intLen(C);
        const w = 2 ** -phi;
        Z += w;
        count++;
        const L = lineCtx(A, B, C);
        const lv8 = pairLevels && H === HEIGHTS.at(-1) ? new Int8Array(families.length) : null;
        for (let i = 0; i < families.length; i++) {
          const f = families[i], a = acc[i];
          const s = f.score(L);
          if (!s) {
            a.level[0] += w;
            a.phi[0] += w * phi;
            if (lv8) lv8[i] = 0;
            continue;
          }
          let lv = 0;
          for (let r = f.rungs.length - 1; r >= 0; r--)
            if (ge(s, f.rungs[r][1])) {
              lv = r + 1;
              break;
            }
          a.level[lv] += w;
          a.phi[lv] += w * phi;
          if (lv8) lv8[i] = lv;
          if (!a.best || lexGt(s, a.best)) {
            a.best = s;
            a.bestMass = w;
            a.bestLine = [A, B, C];
          } else if (cmp(s, a.best) === 0 && s.length === a.best.length) a.bestMass += w;
        }
        if (lv8) pairLevels.push([A, B, C, lv8]);
      }
    }
  families.forEach((f, i) => {
    const a = acc[i];
    const bits = [];
    let tail = 0;
    for (let r = f.rungs.length; r >= 1; r--) {
      tail += a.level[r];
      bits[r] = tail > 0 ? -Math.log2(tail / Z) : null;
    }
    const meanPhi = Array.from(a.level, (m, k) => (m > 0 ? a.phi[k] / m : null));
    results[i][H] = { bits, meanPhi, top: { score: a.best, bits: -Math.log2(a.bestMass / Z), line: a.bestLine } };
  });
  console.error(`H = ${H}: ${count} lines, Z = ${Z.toFixed(4)}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// ---------- report ----------
const out = [];
const fmt = (x) => (x == null ? "—" : x.toFixed(1));
const esc = (label) => label.replaceAll("|", "\\|"); // a bar inside a label must not end a markdown cell
const fmtScore = (s) => (s ? `(${s.map((x) => (Number.isInteger(x) ? x : x.toFixed(4))).join(", ")})` : "WORST");
const lineStr = ([a, b, c]) => `${a}x ${b < 0 ? "−" : "+"} ${Math.abs(b)}y ${c < 0 ? "−" : "+"} ${Math.abs(c)} = 0`;
out.push(`## Summary (reference law 2^−φ on primitive rational lines of height ≤ H)\n`);
out.push(`| family | params | first rung | ${HEIGHTS.map((h) => `top H=${h}`).join(" | ")} | settled top | largest step (H=${HEIGHTS.at(-1)}) | best line at H=${HEIGHTS.at(-1)} |`);
out.push(`|---|---|--:|${HEIGHTS.map(() => "--:").join("|")}|--:|--:|---|`);
families.forEach((f, i) => {
  const r = results[i];
  const H = HEIGHTS.at(-1);
  const b = r[H].bits;
  const reached = (h) => {
    const bb = r[h].bits;
    let top = null;
    for (let k = f.rungs.length; k >= 1; k--)
      if (bb[k] != null) {
        top = `${bb[k].toFixed(1)} (${esc(f.rungs[k - 1][0])})`;
        break;
      }
    return top ?? "—";
  };
  let step = 0, prev = 0;
  for (let k = 1; k <= f.rungs.length; k++)
    if (b[k] != null) {
      step = Math.max(step, b[k] - prev);
      prev = b[k];
    }
  // settled: the highest rung whose bits moved by at most 1 between the last two heights
  let settledTop = "—";
  if (HEIGHTS.length >= 2) {
    const a = r[HEIGHTS.at(-2)].bits;
    for (let k = f.rungs.length; k >= 1; k--)
      if (a[k] != null && b[k] != null && Math.abs(a[k] - b[k]) <= 1) {
        settledTop = `${b[k].toFixed(1)} (${esc(f.rungs[k - 1][0])})`;
        break;
      }
  }
  out.push(`| ${f.id} | ${f.params} | ${fmt(b[1])} | ${HEIGHTS.map(reached).join(" | ")} | ${settledTop} | ${step.toFixed(1)} | ${r[H].top.line ? lineStr(r[H].top.line) : "—"} |`);
});
out.push(`\n## Ladders (bits at each rung)\n`);
out.push(`A * marks a rung whose bits moved by more than 1 between the last two heights: not settled, an over-estimate. The last column is the mean read length of the lines at exactly that level (level 0, below the first rung, is in the family's heading).\n`);
families.forEach((f, i) => {
  out.push(`### ${f.title} \`${f.id}\` ${f.params}\n`);
  out.push(`Mean φ below the first rung: ${fmt(results[i][HEIGHTS.at(-1)].meanPhi[0])}.\n`);
  out.push(`| rung | ${HEIGHTS.map((h) => `H=${h}`).join(" | ")} | mean φ at this level (H=${HEIGHTS.at(-1)}) |`);
  out.push(`|---|${HEIGHTS.map(() => "--:").join("|")}|--:|`);
  f.rungs.forEach(([label], k) => {
    const cells = HEIGHTS.map((h) => fmt(results[i][h].bits[k + 1]));
    const [a, b] = HEIGHTS.slice(-2).map((h) => results[i][h].bits[k + 1]);
    const settled = HEIGHTS.length < 2 || (a != null && b != null && Math.abs(a - b) <= 1);
    out.push(`| ${k + 1}. ${esc(label)} | ${cells.join(" | ")}${settled || b == null ? "" : " *"} | ${fmt(results[i][HEIGHTS.at(-1)].meanPhi[k + 1])} |`);
  });
  out.push(`| best score found | ${HEIGHTS.map((h) => `${fmtScore(results[i][h].top.score)} ${fmt(results[i][h].top.bits)}`).join(" | ")} | |\n`);
});
if (PAIRS) {
  const H = HEIGHTS.at(-1);
  const V = families.map((f, i) => Array.from({ length: f.rungs.length + 1 }, (_, k) => results[i][H].bits[k] ?? 0));
  const topOf = families.map((f, i) => Math.max(...V[i].slice(1)));
  out.push(`\n## Pairs (H=${H}): the line that best serves both rules\n`);
  out.push(`share = a rule's bits on the line over its top bits; "both" is the line maximising the smaller share; "sum" is that line's bits for the two rules together, against the two tops added.\n`);
  out.push(`| pair | both: smaller share | line | levels | bits (sum / tops) |`);
  out.push(`|---|--:|---|---|--:|`);
  for (let i = 0; i < families.length; i++)
    for (let j = i + 1; j < families.length; j++) {
      let best = null;
      for (const [A, B, C, lv] of pairLevels) {
        const a = V[i][lv[i]] / topOf[i], b = V[j][lv[j]] / topOf[j];
        const key = Math.min(a, b) + 1e-6 * (a + b);
        if (!best || key > best.key) best = { key, a, b, A, B, C, li: lv[i], lj: lv[j] };
      }
      const lab = (f, l) => (l === 0 ? "none" : esc(f.rungs[l - 1][0]));
      out.push(`| ${families[i].id} × ${families[j].id} | ${Math.min(best.a, best.b).toFixed(2)} | ${lineStr([best.A, best.B, best.C])} | ${lab(families[i], best.li)}; ${lab(families[j], best.lj)} | ${(V[i][best.li] + V[j][best.lj]).toFixed(1)} / ${(topOf[i] + topOf[j]).toFixed(1)} |`);
    }
}
const text = out.join("\n");
console.log(text);
if (MARKDOWN) (await import("node:fs")).writeFileSync(MARKDOWN, text + "\n");
