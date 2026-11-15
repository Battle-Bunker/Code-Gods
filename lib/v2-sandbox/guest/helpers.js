// Helpers for agents, in plain words. Runs after codegods.js as part of the act's trusted prelude.
// The same names do the same things in Python (helpers.py); lib/v2-agents/test/parity.test.ts checks it.
//
//   look(offer, rep)           what the line looks like in one view ("si", "seq", ...). Costs a little energy to read,
//                              once per act: looking again at the same view is free.
//   peek(offer, rep, name, args)  one number of a view, e.g. peek(offer, "seq", "term", { n: 3 }).
//   goal(offer)                your rule: its family, its numbers and the sentence on its card, and the object
//                              it scores ("line", "grid"). Free.
//   progress(offer)            how well the line does on your rule now: main and tiebreak (the score's parts,
//                              bigger is better), and bits (what that score is worth, its rarity; null when the
//                              game does not say). Costs what reading your rule's views costs.
//   move(mutator, args)        one change, e.g. move("si.tilt", { k: 1 }). A plan is a list of moves.
//   price(offer, plan)         the energy the plan would cost, or null when it is not allowed. Nothing changes.
//   cheapest(offer, plans)     of several plans (often the same change through different views), the cheapest
//                              allowed one, as a list of moves; null when none is allowed. One host call per plan.
//   energy(offer)              the energy your agent has.
//   prime(n), square(n)        is n a whole number that is prime / a perfect square? Anything else: false.
//                              (prime is exact below 3·10^24, and quick for any size.)
//   near(x, test)              the whole number nearest to x that passes the test, e.g. near(m, prime).
//                              The test gets a plain whole number. On a tie the smaller one; null if none
//                              within 10,000.
//   near(x, test, k)           the same among positive whole numbers ending in the digit k: near(c, prime, 3) is
//                              the prime ending in 3 nearest c (below the smallest such prime, that prime).
//   whole(x)                   the whole number nearest to x (a half rounds up).
//   simplest(a, b)             the simplest fraction from a to b (either way round): the smallest denominator, then
//                              the numerator nearest 0. simplest(18.5, 19.5) is 19; simplest(-0.81, -0.77) is -4/5.
//   smooth(n)                  is n made only by multiplying 2s, 3s, 5s and 7s (1 included; the sign ignored)?
//                              e.g. near(x, smooth).
//   shared(a, b)               how many prime factors whole numbers a and b share, counting repeats (the factors of
//                              their greatest common factor); 0 when either is 0.
//   root(n)                    the whole square root of n, rounded down (root(50) is 7).
//   factors(n)                 the prime factors of n, smallest first, with repeats: factors(12) is [2, 2, 3];
//                              [] for 0, 1 and −1. (Past 10,000 a leftover factor counts as prime.)
//   better(a, b)               is score a better than score b? Scores are lists of parts compared in order, bigger
//                              is better; null is the worst score and a null part is the worst part.
//   worth(offer)               what this line is worth to you now: mine (your rarity), others (the other players'
//                              rarity added up) and points (mine × others). null when the game does not say.
//                              others is your agents' own estimate (in a noisy room each player's agents get their
//                              own blur), not the server's count: a note reporting it should say it is an estimate.
//   rarity(offer, score)       the rarity your rule gives a score (from your own score function); 0 when the game
//                              does not say. Free.
//   recent(offer)              the latest moves on this line you may see, newest last: { mine, pointsBefore, pointsAfter }.
//   pushback(offer)            how many times lately someone else's move took back points your agent had just won
//                              on this line (a tug-of-war).
//   fair(offer, plan)          true when the plan would not lower the other players' rarity on this line, added up
//                              (true when the game does not say). Costs a small read each time.
//   rounding(m, c)             for a line y = mx + c with a fraction in it (rational lines): the steps that bring the
//                              gradient or the y-intercept to the whole number below or above, nudge it by one part
//                              (±1/d), or stretch the line by a denominator d; each [plan, m after, c after]. [] when
//                              both are whole numbers.
//   fractions(m, c)            steps into fractions on a line y = mx + c: shift or tilt by ±1/2, ±1/3, ±2/3, or stretch
//                              by 1/2, 2/3 or 3/2; each [plan, m after, c after] ([] on a vertical line).
//   tips(offer)                on a vertical line (x = k: no y = mx + c), the moves that tip it into one: mirror across
//                              y = x (to y = k) or nudge b up by 1 or 2; each [plan, m after, c after]. A small read.
//                              [] on any other line.
//   vertical(offer, far)       on a vertical line x = k, its steps: the tips (as tips(offer)) and the slides sideways by
//                              ±1 … ±far and to the nearest whole number, each [plan, null, k after] (score(null, k)
//                              reads x = k). [] on any other line.
//   climb(offer, options, now, most)
//                              the step that raises your points here most (your rarity × the others' rarity, added
//                              up), from options [[plan, score it reaches], ...]; null when none does. It weighs the
//                              `most` options best for your rule (all when left out), a small read each; of those that
//                              do not raise your own rarity it prices only the best two, so an act with nothing to
//                              gain costs little; it takes the best step it can pay for within allowance(offer), else
//                              the best it can pay for from the energy it has saved (a big step, such as the next rung
//                              of a ladder, when no small one helps). now
//                              is your score here; without the game's values it takes the step best for your rule
//                              instead.
//   saving(offer)              true while the agent holds less than 10 seconds of its income: it should skip the act
//                              (no reads: the game still tells you the line) and save up for a move. Free.
//   allowance(offer)           the most one move should cost now: the agent's energy plus 5 seconds of its income (a
//                              small debt), and at most 15 seconds of its income; without a known income, its energy.
//                              climb never takes a dearer move.
//   note(offer, text)          leave your owner a short note (they read it in the act log). At most 3 a turn.
//   contested(offer, times)    true when pushback(offer) has reached times; it then leaves your owner a note naming
//                              the tug-of-war and suggesting a deal with the other player.
//
// Two lines (an object of two lines, "pairs"):
//   pairOf(offer)              the two lines as [[a, b, c], [a, b, c]] (a·x + b·y + c = 0, whole numbers, in the
//                              game's order), from the eqs view (one full read).
//   solved(L)                  what the two lines give together, each part a number or null where it does not exist:
//                              D (the number you divide by), dot, x and y (the answer), X and Y (the whole numbers
//                              nearest it), ms, cs, rs (the steeper line's gradient, y-intercept and x-intercept),
//                              mg, cg (the gentler line's gradient and y-intercept),
//                              ratio (steeper gradient over the other), ygap, xgap (the gaps between the intercepts),
//                              offRight, off45 (how far from a right angle, from 45°), origin (a line through (0, 0)).
//   pairSteps(L, far, kinds, factors)  the steps of the given kinds ("shift", "tilt", "stretch", "turn", "slide",
//                              "combine", "reflect", "quarter" on either line; "translate", both lines slid together),
//                              each [plan, lines after]; steps the game would refuse are left out. factors: extra
//                              stretch factors (a ladder's ×q).
//   spf(n), omega(n), common(a, b)  a whole number's smallest prime factor (1 for 0 and ±1), its number of prime
//                              factors counting repeats (0 for 0 and ±1), and the biggest factor a and b share (0 if
//                              either is 0).
//   nearestLeaving(v, q, r, atLeast)  the whole number nearest v that leaves r when divided by q (negatives too: −2
//                              leaves 1 when divided by 3), the smaller on a tie; with atLeast, only numbers at least
//                              that far from 0 (a pair rule's dealt remainder).
//   ladder(v, q, r, other, atLeast)  a pair rule's residue ladder: { score, n }. Level j is met when v is a whole number
//                              leaving r when divided by q, rr (in base q) when divided by q², rrr by q³, … and other
//                              is 0; score = q^L × (1 + 1/(1 + d)), L the highest level met, d how far from the next;
//                              n = nearestLeaving(v, q, r, atLeast).
//   valuationLadder(v, q, r, other, atLeast)  { score, n }: v the whole number q^t × m with m leaving r when divided by
//                              q (and other 0) is at level L, the highest with L(L + 1)/2 ≤ t (a stretch by q adds 1 to
//                              t); score = q^L × (1 + 1/(1 + d)), d how far from level L + 1 (off the ladder: below all).
//   powerLadder(k, off)        the same over k, k², k³, …: off(t) is how far the state is from the level whose number
//                              is t; level L at an exact k^L, d to k^(L+1) (on no level: to the nearest power);
//                              returns the score.
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
  /** A move may cost at most this many seconds of the agent's income (allowance). */
  const ALLOWANCE_SECONDS = 15;
  /** It may go this many seconds of income into debt for a move. */
  const CREDIT_SECONDS = 5;
  /** Below this many seconds of income in hand, an agent saves up rather than reads (saving). */
  const SAVE_SECONDS = 10;
  const gcdB = (x, y) => { if (x < 0n) x = -x; if (y < 0n) y = -y; while (y) [x, y] = [y, x % y]; return x; };
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

  let lastCheapest = { offer: null, plan: null, price: null };   // the plan cheapest() returned, and its price
  // The two numbers with the remainder either side of v (moved outwards past |n| < min); the lower wins a tie.
  const anchor = (v, qb, rb, min) => {
    const t = floorOf(Q.div(Q.sub(v, Q.of(rb)), Q.of(qb)));
    let lo = rb + qb * t, hi = lo + qb;
    const ok = n => (n < 0n ? -n : n) >= min;
    while (!ok(lo)) lo -= qb;
    while (!ok(hi)) hi += qb;
    const dLo = Q.sub(v, Q.of(lo)), dHi = Q.sub(Q.of(hi), v);
    return Q.cmp(dLo, dHi) <= 0 ? [lo, dLo] : [hi, dHi];
  };
  // The highest level met and the score base^L × (1 + 1/(1 + off(L + 1))).
  const climb = (base, off) => {
    let level = 0, d = off(1);
    while (level < 4096 && Q.isZero(d)) d = off(++level + 1);
    return Q.mul(Q.of(base ** BigInt(level)), Q.add(Q.of(1), Q.div(Q.of(1), Q.add(Q.of(1), d))));
  };
  const helpers = {
    look: (offer, rep, site) => offer.view(rep, site),
    peek: (offer, rep, name, args, site) => offer.element(rep, name, args, site),
    goal: offer => offer.myRule(),
    progress: offer => {
      const s = offer.myScore();
      const part = i => (s.score === null || s.score[i] === undefined ? null : s.score[i]);
      return freeze({ main: part(0), tiebreak: part(1), bits: s.bits, layers: s.layers, score: s.score, terms: s.terms });
    },
    move: (mutator, args, site) => call(mutator, args, site),
    price: (offer, plan) => {
      if (plan === lastCheapest.plan && offer === lastCheapest.offer) return lastCheapest.price;   // just quoted: no second call
      const q = offer.quote(asPlan(plan));
      return q.valid ? q.charge : null;
    },
    cheapest: (offer, plans) => {
      let best = null, bestPrice = Infinity;
      for (const plan of plans) {
        const p = helpers.price(offer, plan);
        if (p !== null && p < bestPrice) { best = asPlan(plan); bestPrice = p; }
      }
      lastCheapest = { offer, plan: best, price: best === null ? null : bestPrice };
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
    smooth: n => {
      let x = integer(n);
      if (x === null) return false;
      if (x < 0n) x = -x;
      if (x === 0n) return false;
      for (const p of [2n, 3n, 5n, 7n]) while (x % p === 0n) x /= p;
      return x === 1n;
    },
    shared: (a, b) => {
      let x = integer(a), y = integer(b);
      if (x === null || y === null || x === 0n || y === 0n) return 0;
      if (x < 0n) x = -x;
      if (y < 0n) y = -y;
      while (y) [x, y] = [y, x % y];
      let k = 0;
      for (let d = 2n; d * d <= x && d <= 100000n; d += d === 2n ? 1n : 2n) while (x % d === 0n) { x /= d; k++; }
      return x > 1n ? k + 1 : k;
    },
    whole: x => { const v = exact(x); return plain(floorOf(Q.add(v, Q.of(1, 2)))); },
    simplest: (a, b) => {
      let lo = exact(a), hi = exact(b);
      if (Q.cmp(lo, hi) > 0) [lo, hi] = [hi, lo];
      for (let d = 1n; d <= 100000n; d++) {
        const nlo = -floorOf(Q.neg(Q.mul(lo, Q.of(d)))), nhi = floorOf(Q.mul(hi, Q.of(d)));
        if (nlo <= nhi) return Q.of(nlo > 0n ? nlo : nhi < 0n ? nhi : 0n, d);
      }
      return lo;
    },
    nearestLeaving: (x, q, r, atLeast = 0) => plain(anchor(exact(x), BigInt(q), BigInt(r), BigInt(atLeast))[0]),
    ladder: (x, q, r, other = 0, atLeast = 0) => {
      const v = exact(x), qb = BigInt(q), rb = BigInt(r), min = BigInt(atLeast), o = exact(other);
      const first = anchor(v, qb, rb, min);
      const off = j => { if (j === 1) return Q.add(o, first[1]); let R = 0n; for (let i = 0; i < j; i++) R = R * qb + rb; return Q.add(o, anchor(v, qb ** BigInt(j), R, min)[1]); };
      return { score: climb(qb, off), n: plain(first[0]) };
    },
    valuationLadder: (x, q, r, other = 0, atLeast = 0) => {
      const v = exact(x), o = exact(other), qb = BigInt(q), rb = BigInt(r), min = BigInt(atLeast);
      const tri = L => (L * (L + 1)) / 2;
      let level = -1;
      if (Q.isZero(o) && v.d === 1n && v.n !== 0n && (v.n < 0n ? -v.n : v.n) >= min) {
        let m = v.n, t = 0;
        while (m % qb === 0n) { m /= qb; t++; }
        if (((m % qb) + qb) % qb === rb) { level = 0; while (tri(level + 1) <= t) level++; }
      }
      const T = BigInt(tri(level + 1)), d = Q.add(o, anchor(v, qb ** (T + 1n), rb * qb ** T, min)[1]);
      const base = level >= 0 ? Q.of(qb ** BigInt(level)) : Q.of(1n, qb);
      return { score: Q.mul(base, Q.add(Q.of(1), Q.div(Q.of(1), Q.add(Q.of(1), d)))), n: plain(level >= 0 ? v.n : anchor(v, qb, rb, min)[0]) };
    },
    powerLadder: (k, off) => {
      // Levels are not nested: L at an exact k^L (d: the distance to k^(L+1)); on no level, d to the nearest power.
      const kb = BigInt(k), at = j => exact(off(Q.of(kb ** BigInt(j))));
      let level = 0, best = null, prev = null;
      for (let j = 1; j <= 4096; j++) {
        const o = at(j);
        if (Q.isZero(o)) level = j;
        if (best === null || Q.cmp(o, best) < 0) best = o;
        if (prev !== null && Q.cmp(o, prev) >= 0) break;
        prev = o;
      }
      const d = level > 0 ? at(level + 1) : best;
      return Q.mul(Q.of(kb ** BigInt(level)), Q.add(Q.of(1), Q.div(Q.of(1), Q.add(Q.of(1), d))));
    },
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
    worth: offer => { try { return offer.worth(); } catch (e) { if (e instanceof HostError) return null; throw e; } },
    recent: offer => { try { return offer.recent(); } catch (e) { if (e instanceof HostError) return []; throw e; } },
    rounding: (m, c) => {
      const out = [];
      if (!Q.isQ(m) || !Q.isQ(c)) return out;
      const down = v => Q.of(floorOf(v)), parts = [];
      if (c.d !== 1n) {
        for (const to of [down(c), Q.add(down(c), Q.of(1))]) out.push([call("si.shift", { k: Q.sub(to, c) }), m, to]);
        for (const k of [Q.of(1n, c.d), Q.of(-1n, c.d)]) out.push([call("si.shift", { k }), m, Q.add(c, k)]);
        parts.push(c.d);
      }
      if (m.d !== 1n) {
        for (const to of [down(m), Q.add(down(m), Q.of(1))]) out.push([call("si.tilt", { k: Q.sub(to, m) }), to, c]);
        for (const k of [Q.of(1n, m.d), Q.of(-1n, m.d)]) out.push([call("si.tilt", { k }), Q.add(m, k), c]);
        if (m.d !== c.d) parts.push(m.d);
      }
      for (const d of parts) out.push([call("mach.stretch", { f: Q.of(d) }), Q.mul(m, Q.of(d)), Q.mul(c, Q.of(d))]);
      return out;
    },
    fractions: (m, c) => {
      const out = [];
      if (!Q.isQ(m) || !Q.isQ(c)) return out;
      for (const k of [Q.of(1, 2), Q.of(-1, 2), Q.of(1, 3), Q.of(-1, 3), Q.of(2, 3), Q.of(-2, 3)]) {
        out.push([call("si.shift", { k }), m, Q.add(c, k)], [call("si.tilt", { k }), Q.add(m, k), c]);
      }
      for (const f of [Q.of(1, 2), Q.of(2, 3), Q.of(3, 2)]) out.push([call("mach.stretch", { f }), Q.mul(m, f), Q.mul(c, f)]);
      return out;
    },
    tips: offer => {
      let g;
      try { g = offer.view("gen"); } catch (e) { if (e instanceof HostError) return []; throw e; }
      const a = g.a, c = g.c;
      if (!Q.isQ(a) || !Q.isQ(c) || !Q.eq(g.b, Q.of(0)) || Q.eq(a, Q.of(0))) return [];
      return [
        [call("cart.mirror", { axis: "diagonal" }), Q.of(0), Q.neg(Q.div(c, a))],
        [call("gen.nudge", { which: "b", k: 1 }), Q.neg(a), Q.neg(c)],
        [call("gen.nudge", { which: "b", k: 2 }), Q.neg(Q.div(a, Q.of(2))), Q.neg(Q.div(c, Q.of(2)))],
      ];
    },
    vertical: (offer, far) => {
      let g;
      try { g = offer.view("gen"); } catch (e) { if (e instanceof HostError) return []; throw e; }
      if (!Q.isQ(g.a) || !Q.isQ(g.c) || !Q.eq(g.b, Q.of(0)) || Q.eq(g.a, Q.of(0))) return [];
      const x = Q.neg(Q.div(g.c, g.a)), w = Q.sub(helpers.whole(x), x), out = [...helpers.tips(offer)];
      for (let k = -far; k <= far; k++) if (k !== 0) out.push([call("cart.slide", { u: k, v: 0 }), null, Q.add(x, k)]);
      if (!Q.isZero(w)) out.push([call("cart.slide", { u: w, v: 0 }), null, Q.add(x, w)]);
      return out;
    },
    spf: n => {
      let x = integer(n);
      if (x === null) return null;
      if (x < 0n) x = -x;
      if (x < 2n) return 1;
      for (let d = 2n; d * d <= x && d <= 100000n; d += d === 2n ? 1n : 2n) if (x % d === 0n) return plain(d);
      return plain(x);
    },
    omega: n => {
      let x = integer(n);
      if (x === null) return null;
      if (x < 0n) x = -x;
      if (x < 2n) return 0;
      let k = 0;
      for (let d = 2n; d * d <= x && d <= 100000n; d += d === 2n ? 1n : 2n) while (x % d === 0n) { x /= d; k++; }
      return x > 1n ? k + 1 : k;
    },
    common: (a, b) => {
      let x = integer(a), y = integer(b);
      if (x === null || y === null || x === 0n || y === 0n) return 0;
      return plain(gcdB(x, y));
    },
    pairOf: offer => {
      const v = offer.view("eqs");
      const n = k => { const x = integer(v[k]); if (x === null) throw new TypeError(`the eqs view has no whole number ${k}`); return x; };
      return [[n("a1"), n("b1"), -n("e1")], [n("a2"), n("b2"), -n("e2")]].map(l => l.map(x => Q.of(x)));
    },
    solved: L => {
      const [[a1, b1, c1], [a2, b2, c2]] = L.map(l => l.map(x => integer(x)));
      const D = a1 * b2 - a2 * b1, dot = a1 * a2 + b1 * b2, nx = b1 * c2 - b2 * c1, ny = c1 * a2 - c2 * a1;
      const abs = x => (x < 0n ? -x : x);
      const s = (b2 === 0n ? b1 !== 0n : b1 !== 0n && abs(a2) * b1 > abs(a1) * b2) ? 1 : 0, o = 1 - s;
      const ln = [[a1, b1, c1], [a2, b2, c2]];
      const grad = ([a, b]) => (b === 0n ? null : Q.of(-a, b)), yint = ([, b, c]) => (b === 0n ? null : Q.of(-c, b)), xint = ([a, , c]) => (a === 0n ? null : Q.of(-c, a));
      const gap = (p, r) => (p === null || r === null ? null : Q.abs(Q.sub(p, r)));
      const ms = grad(ln[s]), mo = grad(ln[o]);
      const x = D === 0n ? null : Q.of(nx, D), y = D === 0n ? null : Q.of(ny, D);
      const near = v => (v === null ? null : Q.of(floorOf(Q.add(v, Q.of(1, 2)))));
      const ad = abs(D), at = abs(dot);
      return freeze({
        D: Q.of(D), dot: Q.of(dot), x, y, X: near(x), Y: near(y), ms, cs: yint(ln[s]), rs: xint(ln[s]), mg: mo, cg: yint(ln[o]),
        ratio: ms === null || mo === null || Q.isZero(mo) ? null : Q.div(ms, mo),
        ygap: gap(yint(ln[0]), yint(ln[1])), xgap: gap(xint(ln[0]), xint(ln[1])),
        offRight: D === 0n ? null : Q.abs(Q.of(dot, D)), off45: Q.of(ad > at ? ad - at : at - ad, ad + at),
        origin: c1 === 0n || c2 === 0n,
      });
    },
    pairSteps: (L, far, kinds, factors = []) => {
      const ln = L.map(l => l.map(x => integer(x)));
      const abs = x => (x < 0n ? -x : x);
      const norm = (a, b, c) => {
        if (a === 0n && b === 0n) return null;
        const g = gcdB(gcdB(a, b), c);
        let r = [a / g, b / g, c / g];
        if (r[1] < 0n || (r[1] === 0n && r[0] < 0n)) r = r.map(x => -x);
        return r;
      };
      // y = m·x + k as a line: −m·x + y − k = 0, cleared of fractions.
      const fromMC = (m, k) => { const d = m.d * k.d / gcdB(m.d, k.d); return norm(-m.n * (d / m.d), d, -k.n * (d / k.d)); };
      const pair = (i, l) => {
        if (l === null) return null;
        const two = i === 0 ? [l, ln[1]] : [ln[0], l];
        const cmp = (p, r) => { for (let j = 0; j < 3; j++) if (p[j] !== r[j]) return p[j] < r[j] ? -1 : 1; return 0; };
        const c = cmp(two[0], two[1]);
        if (c === 0) return null;   // the two lines of a pair must be different
        const r = c < 0 ? two : [two[1], two[0]];
        if (cmp(r[0], ln[0]) === 0 && cmp(r[1], ln[1]) === 0) return null;   // no change: the game refuses it
        return r.map(t => t.map(x => Q.of(x)));
      };
      const D = ln[0][0] * ln[1][1] - ln[1][0] * ln[0][1];
      const nx = ln[0][1] * ln[1][2] - ln[1][1] * ln[0][2], ny = ln[0][2] * ln[1][0] - ln[1][2] * ln[0][0];
      const out = [];
      for (const i of [0, 1]) {
        const [a, b, c] = ln[i], [ja, jb, jc] = ln[1 - i], line = String(i + 1);
        const add = (plan, l) => { const r = pair(i, l); if (r) out.push([plan, r]); };
        const m = b === 0n ? null : Q.of(-a, b), k0 = b === 0n ? null : Q.of(-c, b);
        if (kinds.includes("reflect")) { const n2 = ja * ja + jb * jb, d = a * ja + b * jb; add(call("pair.reflect", { line }), norm(n2 * a - 2n * d * ja, n2 * b - 2n * d * jb, n2 * c - 2n * d * jc)); }
        if (kinds.includes("quarter") && D !== 0n) add(call("pair.quarter", { line }), norm(-b * D, a * D, b * nx - a * ny));
        for (let k = -far; k <= far; k++) {
          if (k === 0) continue;
          const K = BigInt(k);
          if (m !== null) {
            if (kinds.includes("shift")) add(call("si.shift", { line, k }), fromMC(m, Q.add(k0, k)));
            if (kinds.includes("tilt")) add(call("si.tilt", { line, k }), fromMC(Q.add(m, k), k0));
            if (kinds.includes("stretch")) { const f = k > 0 ? k + 1 : k - 1; add(call("mach.stretch", { line, f }), fromMC(Q.mul(m, f), Q.mul(k0, f))); }
            if (kinds.includes("turn") && D !== 0n) { const m2 = Q.add(m, k); add(call("pair.turn", { line, k }), fromMC(m2, Q.sub(Q.of(ny, D), Q.mul(m2, Q.of(nx, D))))); }
          }
          if (kinds.includes("slide") && D !== 0n) { const g = gcdB(ja, jb); add(call("pair.slide", { line, k }), norm(a, b, c - a * (K * jb / g) - b * (-K * ja / g))); }
          if (kinds.includes("combine")) {
            const A = a + K * ja, B = b + K * jb, C = c + K * jc;
            if ((A !== 0n || B !== 0n) && gcdB(gcdB(A, B), C) === 1n) add(call("pair.combine", { line, k }), norm(A, B, C));
          }
        }
      }
      // A stretch of either line by each extra factor (a ladder's shortcut: ×q climbs one rung), beyond 2 … far + 1.
      if (kinds.includes("stretch")) for (const i of [0, 1]) {
        const [a, b, c] = ln[i], line = String(i + 1);
        if (b === 0n) continue;
        const m = Q.of(-a, b), k0 = Q.of(-c, b);
        for (const f of factors) if (Math.abs(f) > far + 1) { const r = pair(i, fromMC(Q.mul(m, f), Q.mul(k0, f))); if (r) out.push([call("mach.stretch", { line, f }), r]); }
      }
      // Both lines slid across the plane by (u, 0) or (0, v): the crossing moves with them.
      if (kinds.includes("translate")) for (let k = -far; k <= far; k++) {
        if (k === 0) continue;
        for (const [u, v] of [[k, 0], [0, k]]) {
          const moved = ln.map(([a, b, c]) => norm(a, b, c - a * BigInt(u) - b * BigInt(v)));
          const cmp = (p, r) => { for (let j = 0; j < 3; j++) if (p[j] !== r[j]) return p[j] < r[j] ? -1 : 1; return 0; };
          if (moved.some(x => x === null) || cmp(moved[0], moved[1]) === 0) continue;
          const r = cmp(moved[0], moved[1]) < 0 ? moved : [moved[1], moved[0]];
          if (cmp(r[0], ln[0]) === 0 && cmp(r[1], ln[1]) === 0) continue;
          out.push([call("sys.translate", { u, v }), r.map(t => t.map(x => Q.of(x)))]);
        }
      }
      return out;
    },
    saving: offer => {
      const b = offer.budget();
      return typeof b.income === "number" && b.income > 0 && b.energy < SAVE_SECONDS * b.income;
    },
    allowance: offer => {
      const b = offer.budget();
      if (!(typeof b.income === "number" && b.income > 0)) return Math.max(0, b.energy);
      // Its energy plus a few seconds' credit (reads alone can keep a busy agent's balance near 0), at most 15 s of income.
      return Math.min(Math.max(0, b.energy) + CREDIT_SECONDS * b.income, ALLOWANCE_SECONDS * b.income);
    },
    climb: (offer, options, now, most) => {
      options = [...options].sort((a, b) => (helpers.better(a[1], b[1]) ? -1 : helpers.better(b[1], a[1]) ? 1 : 0));
      if (most !== undefined) options = options.slice(0, most);
      const w = helpers.worth(offer);
      if (!w) {   // the best step for your rule that beats now and is allowed
        const cap = helpers.allowance(offer);
        for (const [plan, s] of options) { if (!helpers.better(s, now)) break; const p = helpers.price(offer, plan); if (p !== null && p <= cap) return asPlan(plan); }
        return null;
      }
      const value = w.mine * w.others, ranked = [];
      let spare = 2;
      for (const [plan, s] of options) {
        const r = helpers.rarity(offer, s);   // free
        if (r <= 0) break;   // sorted best first: the rest score no points for you either
        if (r <= w.mine + 1e-9) { if (spare === 0) break; spare--; }   // your rule cannot rise: price only two such steps
        let o;
        try { o = offer.othersAfter(asPlan(plan)); } catch (e) { if (e instanceof HostError) continue; throw e; }
        if (o.after === null) continue;   // not allowed (e.g. another object is in that state)
        const v = r * o.after;
        if (v > value + 1e-9) ranked.push([v, plan]);
      }
      // The best step it can pay for within its allowance (its energy, and a few seconds of its income).
      ranked.sort((a, b) => b[0] - a[0]);
      const cap = helpers.allowance(offer);
      const b = offer.budget(), saved = b.energy, quoted = [];
      for (const [v, plan] of ranked.slice(0, 4)) quoted.push([v, plan, helpers.price(offer, plan)]);
      // The best step it can pay for within its allowance; else a bigger one (the next rung of a ladder) paid from
      // energy saved up in hand, no debt.
      const pick = quoted.find(([, , p]) => p !== null && p <= cap) ?? quoted.find(([, , p]) => p !== null && p <= saved);
      return pick ? asPlan(pick[1]) : null;
    },
    fair: (offer, plan) => {
      try { const o = offer.othersAfter(asPlan(plan)); return o.after === null || o.after >= o.before; }
      catch (e) { if (e instanceof HostError) return true; throw e; }
    },
    pushback: offer => {
      let count = 0, gained = false;
      for (const m of helpers.recent(offer)) {
        if (m.mine) gained = m.pointsAfter > m.pointsBefore;
        else if (gained && m.pointsAfter < m.pointsBefore) { count++; gained = false; }
      }
      return count;
    },
    note: (offer, text) => { try { return offer.note(text); } catch (e) { if (e instanceof HostError) return false; throw e; } },
    contested: (offer, times) => {
      if (helpers.pushback(offer) < times) return false;
      const noun = offer.myRule().object;   // "line", "grid": the game's own word (free)
      helpers.note(offer, `Tug-of-war on ${noun} ${offer.object}: another player keeps pulling it back. Make a deal with them; to keep your agent off it, add ${offer.object} to "leaves these ${noun}s alone" under your agent.`);
      return true;
    },
    rarity: (offer, s) => { try { return offer.rarity(s); } catch (e) { if (e instanceof HostError) return 0; throw e; } },
    better: (a, b) => {
      if (a === null || a === undefined) return false;
      if (b === null || b === undefined) return true;
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        const x = a[i], y = b[i];
        if (x === null && y === null) continue;
        if (x === null) return false;
        if (y === null) return true;
        if (typeof x === "number" && typeof y === "number" && Number.isInteger(x) && Number.isInteger(y)) {   // the common case, without fractions
          if (x !== y) return x > y;
          continue;
        }
        const c = Q.cmp(exact(x), exact(y));
        if (c !== 0) return c > 0;
      }
      return a.length > b.length;
    },
    near: (x, test, ends) => {
      const v = exact(x);
      if (ends !== undefined && ends !== null) {
        // Only positive whole numbers whose last digit is `ends`; below the smallest such prime, that prime.
        const k = BigInt(ends), first = [null, 11, 2, 3, null, 5, null, 7, null, 19][Number(ends)];
        if (test === helpers.prime && first !== undefined) {
          if (first === null) return null;
          if (Q.cmp(v, Q.of(first)) <= 0) return first;
        }
        const inner = test;
        test = n => { const b = BigInt(n); return b > 0n && b % 10n === k && inner(n); };
      }
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
