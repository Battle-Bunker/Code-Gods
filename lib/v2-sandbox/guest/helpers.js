// Helpers for agents, in plain words. Runs after codegods.js as part of the act's trusted prelude.
// The same names do the same things in Python (helpers.py); lib/v2-agents/test/parity.test.ts checks it.
//
//   look(offer, rep)           what the line looks like in one view ("si", "seq", ...). Costs a little ⚡ to read,
//                              once per act: looking again at the same view is free.
//   peek(offer, rep, name, args)  one number of a view, e.g. peek(offer, "seq", "term", { n: 3 }).
//   goal(offer)                your rule: its family, its numbers and the sentence on its card. Free.
//   progress(offer)            how well the line does on your rule now: level, top, main part, tie-breaker
//                              (bigger is better). Costs what reading your rule's views costs.
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
//
// The helpers are configurable globals, so an agent may declare its own `price` or `square` instead.
"use strict";
(() => {
  const freeze = Object.freeze;
  const asPlan = p => (Array.isArray(p) ? p : [p]);
  /** A whole number as a bigint, or null for anything else (fractions, text, booleans, undefined elements). */
  const whole = n => {
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
  const power = (b, e, m) => { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; };
  const WITNESSES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n];

  const helpers = {
    look: (offer, rep, site) => offer.view(rep, site),
    peek: (offer, rep, name, args, site) => offer.element(rep, name, args, site),
    goal: offer => offer.myRule(),
    progress: offer => {
      const s = offer.myScore();
      const part = i => (s.score === null || s.score[i] === undefined ? null : s.score[i]);
      return freeze({ level: s.level, top: s.top, main: part(0), tiebreak: part(1), score: s.score, terms: s.terms });
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
      const x = whole(n);
      if (x === null || x < 2n) return false;
      for (const p of WITNESSES) if (x % p === 0n) return x === p;
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
      const x = whole(n);
      if (x === null || x < 0n) return false;
      if (x < 2n) return true;
      let r = x, next = (r + 1n) / 2n;   // Newton's method on whole numbers
      while (next < r) { r = next; next = (r + x / r) / 2n; }
      return r * r === x;
    },
    near: (x, test) => {
      const v = exact(x);
      const floor = v.n >= 0n ? v.n / v.d : -((-v.n + v.d - 1n) / v.d);
      const ceil = floor * v.d === v.n ? floor : floor + 1n;
      // Candidates by distance: floor − d and ceil + d; on a tie the smaller.
      for (let d = 0n; d <= 10000n; d++) {
        const lo = floor - d, hi = ceil + d;
        const order = Q.cmp(Q.sub(v, Q.of(lo)), Q.sub(Q.of(hi), v)) <= 0 ? [lo, hi] : [hi, lo];
        for (const n of order) if (test(plain(n))) return plain(n);
      }
      return null;
    },
  };
  for (const [name, value] of Object.entries(helpers)) {
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true, enumerable: false });
  }
})();
