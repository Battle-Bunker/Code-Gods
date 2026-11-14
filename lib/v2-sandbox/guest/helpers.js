// Helpers for agents, in plain words. Runs after codegods.js as part of the act's trusted prelude.
// The same names do the same things in Python (helpers.py); lib/v2-agents/test/parity.test.ts checks it.
//
//   look(offer, rep)           what the line looks like in one view ("si", "seq", ...). Costs a little ⚡ to read,
//                              once per act: looking again at the same view is free.
//   peek(offer, rep, name, args)  one number of a view, e.g. peek(offer, "seq", "term", { n: 3 }).
//   goal(offer)                your rule: its family, its numbers and the sentence on its card. Free.
//   progress(offer)            how well the line does on your rule now: level and top of the whole ladder; main
//                              and tiebreak (the score's parts, bigger is better); layers: each part's own
//                              level and top. Costs what reading your rule's views costs.
//   move(mutator, args)        one change, e.g. move("si.tilt", { k: 1 }). A plan is a list of moves.
//   price(offer, plan)         the ⚡ energy the plan would cost, or null when it is not allowed. Nothing changes.
//   cheapest(offer, plans)     of several plans (often the same change through different views), the cheapest
//                              allowed one, as a list of moves; null when none is allowed. One host call per plan.
//   energy(offer)              the ⚡ energy your agent has.
//   prime(n), square(n)        is n a whole number that is prime / a perfect square? Anything else: false.
//                              (prime is exact below 3·10^24, and quick for any size.)
//   near(x, test)              the whole number nearest to x that passes the test, e.g. near(m, prime).
//                              The test gets a plain whole number. On a tie the smaller one; null if none
//                              within 10,000.
//   whole(x)                   the whole number nearest to x (a half rounds up).
//   root(n)                    the whole square root of n, rounded down (root(50) is 7).
//   factors(n)                 the prime factors of n, smallest first, with repeats: factors(12) is [2, 2, 3];
//                              [] for 0, 1 and −1. (Past 10,000 a leftover factor counts as prime.)
//   better(a, b)               is score a better than score b? Scores are lists of parts compared in order, bigger
//                              is better; null is the worst score and a null part is the worst part.
//
// The helpers are configurable globals, so an agent may declare its own `price` or `square` instead.
"use strict";
(() => {
  const freeze = Object.freeze;
  const asPlan = p => (Array.isArray(p) ? p : [p]);
  /** A whole number as a bigint, or null for anything else (fractions, text, booleans, undefined elements). */
  const integer = n => {
    if (typeof n === "number") return Number.isInteger(n) ? BigInt(n) : null;
    if (typeof n === "bigint") return n;
    if (Q.isQ(n)) return n.d === 1n ? n.n : null;
    return null;
  };
  /** A plain whole number for agent code: a number when it is a safe integer, else a bigint. */
  const plain = n => (n >= -9007199254740991n && n <= 9007199254740991n ? Number(n) : n);
  /** Any number as an exact Q (a double is converted exactly, as Python's Fraction(x) does). */
  const exact = x => {
    if (typeof x === "number" && Number.isFinite(x) && !Number.isInteger(x)) {
      let d = 1n;
      while (!Number.isInteger(x)) { x *= 2; d *= 2n; }
      return Q.of(BigInt(x), d);
    }
    return Q.from(x);
  };
  const floorOf = v => (v.n >= 0n ? v.n / v.d : -((-v.n + v.d - 1n) / v.d));
  /** The whole square root of x ≥ 0, rounded down, by Newton's method on whole numbers. */
  const isqrt = x => {
    if (x < 2n) return x;
    let r = x, next = (r + 1n) / 2n;
    while (next < r) { r = next; next = (r + x / r) / 2n; }
    return r;
  };
  const power = (b, e, m) => { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; };
  const WITNESSES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n];

  const helpers = {
    look: (offer, rep, site) => offer.view(rep, site),
    peek: (offer, rep, name, args, site) => offer.element(rep, name, args, site),
    goal: offer => offer.myRule(),
    progress: offer => {
      const s = offer.myScore();
      const part = i => (s.score === null || s.score[i] === undefined ? null : s.score[i]);
      return freeze({ level: s.level, top: s.top, main: part(0), tiebreak: part(1), layers: s.layers, score: s.score, terms: s.terms });
    },
    move: (mutator, args, site) => call(mutator, args, site),
    price: (offer, plan) => {
      const q = offer.quote(asPlan(plan));
      return q.valid ? q.charge : null;
    },
    cheapest: (offer, plans) => {
      let best = null, bestPrice = Infinity;
      for (const plan of plans) {
        const p = helpers.price(offer, plan);
        if (p !== null && p < bestPrice) { best = asPlan(plan); bestPrice = p; }
      }
      return best;
    },
    energy: offer => offer.budget().energy,
    // Miller–Rabin with the first thirteen primes as witnesses: exact below 3.3·10^24, and a fixed amount of work.
    prime: n => {
      const x = integer(n);
      if (x === null || x < 2n) return false;
      for (const p of WITNESSES) if (x % p === 0n) return x === p;
      if (x < 1681n) return true;   // no prime factor up to 41, below 41²
      let d = x - 1n, s = 0;
      while ((d & 1n) === 0n) { d >>= 1n; s++; }
      for (const a of WITNESSES) {
        let y = power(a, d, x);
        if (y === 1n || y === x - 1n) continue;
        let composite = true;
        for (let i = 1; i < s && composite; i++) { y = y * y % x; if (y === x - 1n) composite = false; }
        if (composite) return false;
      }
      return true;
    },
    square: n => {
      const x = integer(n);
      if (x === null || x < 0n) return false;
      const r = isqrt(x);
      return r * r === x;
    },
    whole: x => { const v = exact(x); return plain(floorOf(Q.add(v, Q.of(1, 2)))); },
    root: n => {
      const x = integer(n);
      return x === null || x < 0n ? null : plain(isqrt(x));
    },
    factors: n => {
      let x = integer(n);
      if (x === null) return null;
      if (x < 0n) x = -x;
      const out = [];
      for (let d = 2n; d * d <= x && d <= 10000n; d += d === 2n ? 1n : 2n) while (x % d === 0n) { out.push(plain(d)); x /= d; }
      if (x > 1n) out.push(plain(x));
      return out;
    },
    better: (a, b) => {
      if (a === null || a === undefined) return false;
      if (b === null || b === undefined) return true;
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        const x = a[i], y = b[i];
        if (x === null && y === null) continue;
        if (x === null) return false;
        if (y === null) return true;
        const c = Q.cmp(exact(x), exact(y));
        if (c !== 0) return c > 0;
      }
      return a.length > b.length;
    },
    near: (x, test) => {
      const v = exact(x);
      // Exact for any size where the answer is known in closed form: below 2 the nearest prime is 2; squares by root.
      if (test === helpers.prime && Q.cmp(v, Q.of(2)) <= 0) return 2;
      if (test === helpers.square) {
        if (v.n <= 0n) return 0;
        const r = isqrt(floorOf(v)), lo = r * r, hi = (r + 1n) * (r + 1n);
        return plain(Q.cmp(Q.sub(Q.of(hi), v), Q.sub(v, Q.of(lo))) < 0 ? hi : lo);
      }
      const floor = floorOf(v);
      const ceil = floor * v.d === v.n ? floor : floor + 1n;
      // floor − d and ceil + d are the candidates at each distance; which is nearer is the same for every d.
      const lowFirst = Q.cmp(Q.sub(v, Q.of(floor)), Q.sub(Q.of(ceil), v)) <= 0;
      for (let d = 0n; d <= 10000n; d++) {
        const lo = plain(floor - d), hi = plain(ceil + d);
        if (lowFirst ? test(lo) : test(hi)) return lowFirst ? lo : hi;
        if (lowFirst ? test(hi) : test(lo)) return lowFirst ? hi : lo;
      }
      return null;
    },
  };
  for (const [name, value] of Object.entries(helpers)) {
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true, enumerable: false });
  }
})();
