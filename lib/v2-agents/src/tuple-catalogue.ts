/**
 * The tuple families (lib/v2-linear tuple-rules.ts, owner decision 45): (1) the nearest target's size, bigger is better;
 * (2) closeness to it; (3) a third part of the line measured against that target. Each starter scores the three layers
 * as the engine does (test/starters.test.ts holds the parts equal, in both languages). The "min" layers come negated, as
 * the engine stores them: nearer is a bigger part.
 */
import type { FamilyEntry, Lines, TieBreakerEntry } from "./catalogue.ts";
// The parts' arithmetic (toMultiple, doublings, nearestPalindrome, ladderNear) lives in the guest helpers (free to summon).

const tb = (ts: string, py: string, says: string, tryThis: string): TieBreakerEntry => ({ ts, py, says, lenses: ["shift", "tilt"], steps: 3, tryThis });
const closeness: TieBreakerEntry = tb("Q.neg(Q.abs(Q.sub(x, n)))", "-abs(x - n)", "how close the reading is to that target: nearer is better",
  "change FAR = 3 to 5: a target a few units away comes within one step.");

/** A tuple entry: lines that read x (and may return null: no score) and find the target n (and `main`), then its thirds. */
function tuple(family: string, main: Lines, mainSays: string, thirds: Record<string, TieBreakerEntry>, helpers: Lines = { ts: [], py: [] }): FamilyEntry {
  return { family, main, mainSays, boundedSimple: true, ...(helpers.ts.length ? { helpers } : {}), tieBreakers: { closeness, ...thirds } };
}

const gradientLog = (cond: { ts: string; py: string }) =>
  tb(`${cond.ts} ? null : Q.neg(doublings(m, n))`, `None if ${cond.py} else -doublings(m, n)`, "the gradient's size times the target should be near 1, counted in doublings",
    "remove the \"shift\" line: only tilts change the gradient.");

export const TUPLE_CATALOGUE: readonly FamilyEntry[] = [
  tuple("prime-intercept", {
    ts: [
      "const x = Q.abs(c);                              // the y-intercept's size",
      "const n = near(x, prime, p.ends), main = n;      // the prime ending in p.ends nearest it: bigger is better",
    ],
    py: [
      "x = abs(c)                                       # the y-intercept's size",
      "n = near(x, prime, p[\"ends\"])                    # the prime ending in p[\"ends\"] nearest it: bigger is better",
      "main = n",
    ],
  }, "the prime ending in the rule's digit nearest the y-intercept's size, the bigger the better", {
    "gradient-log": gradientLog({ ts: "Q.isZero(m)", py: "m == 0" }),
  }),
  tuple("power-area", {
    ts: [
      "if (Q.isZero(m) || Q.isZero(c)) return null;    // no triangle with the axes",
      "const x = Q.div(Q.mul(c, c), Q.mul(2, Q.abs(m)));   // the area the line cuts off the axes",
      "let j = 0, at = 1n; const K = BigInt(p.k);",
      "while (Q.cmp(Q.of(at * K), x) <= 0) { at *= K; j++; }   // the powers of k at or below the area",
      "if (Q.cmp(Q.sub(Q.of(at * K), x), Q.sub(x, Q.of(at))) <= 0) { at *= K; j++; }   // the nearer of the two (the higher on a tie)",
      "const n = at, main = j;                          // the power of k nearest the area: the higher, the better",
    ],
    py: [
      "if m == 0 or c == 0:                             # no triangle with the axes",
      "    return None",
      "x = c * c / (2 * abs(m))                         # the area the line cuts off the axes",
      "j, at, K = 0, 1, p[\"k\"]",
      "while at * K <= x:                               # the powers of k at or below the area",
      "    at, j = at * K, j + 1",
      "if at * K - x <= x - at:                         # the nearer of the two (the higher on a tie)",
      "    at, j = at * K, j + 1",
      "n, main = at, j                                  # the power of k nearest the area: the higher, the better",
    ],
  }, "the power of k nearest the area the line cuts off the axes, the higher the better", {
    "per-crossing": tb("Q.neg(toMultiple(Q.div(x, Q.abs(Q.div(c, m))), Q.of(p.k)))", "-to_multiple(x / abs(c / m), p[\"k\"])",
      "the area over the x-crossing should be near a multiple of k", "remove the \"tilt\" line: a shift alone changes the area and the crossing together."),
  }),
  tuple("landing-tuple", {
    ts: [
      "if (Q.isZero(m) && Q.isZero(c)) return null;    // the x-axis itself scores nothing",
      "const x = Q.abs(Q.isZero(m) ? c : Q.div(c, m));  // where it crosses, ignoring a minus sign (a flat line: its height)",
      "const n = near(x, prime, p.ends), main = n;      // the prime ending in p.ends nearest it: bigger is better",
    ],
    py: [
      "if m == 0 and c == 0:                           # the x-axis itself scores nothing",
      "    return None",
      "x = abs(c if m == 0 else c / m)                  # where it crosses, ignoring a minus sign (a flat line: its height)",
      "n = near(x, prime, p[\"ends\"])                    # the prime ending in p[\"ends\"] nearest it: bigger is better",
      "main = n",
    ],
  }, "the prime ending in the rule's digit nearest where the line crosses the x-axis (a flat line: its height), the bigger the better", {
    "intercept-multiple": tb("Q.neg(toMultiple(Q.abs(c), Q.of(n)))", "-to_multiple(abs(c), n)", "the y-intercept's size should be near a multiple of that prime",
      "remove the \"tilt\" line: only shifts change the y-intercept."),
    "gradient-log": gradientLog({ ts: "Q.isZero(m)", py: "m == 0" }),
  }),
  tuple("ruler-tuple", {
    ts: [
      "const x = Q.div(Q.mul(c, c), Q.add(1, Q.mul(m, m)));   // the distance from (0, 0) to the line, squared",
      "const n = near(x, prime, p.ends), main = n;      // the prime ending in p.ends nearest it: bigger is better",
    ],
    py: [
      "x = c * c / (1 + m * m)                          # the distance from (0, 0) to the line, squared",
      "n = near(x, prime, p[\"ends\"])                    # the prime ending in p[\"ends\"] nearest it: bigger is better",
      "main = n",
    ],
  }, "the prime ending in the rule's digit nearest the squared distance from (0, 0), the bigger the better", {
    "intercept-multiple": tb("Q.neg(toMultiple(Q.abs(c), Q.of(1)))", "-to_multiple(abs(c), 1)", "the y-intercept's size should be near a whole number",
      "remove the \"tilt\" line: only shifts change the y-intercept."),
    "gradient-log": gradientLog({ ts: "Q.isZero(m)", py: "m == 0" }),
  }),
  tuple("treasure-tuple", {
    ts: [
      "const x = Q.abs(Q.add(Q.mul(m, p.k), c));       // y at x = k, ignoring a minus sign",
      "const w = Q.cmp(x, 0) <= 0 ? 0n : BigInt(whole(Q.sub(x, Q.div(1, 2)))), r0 = w < 1n ? 1n : (BigInt(root(Q.add(Q.mul(8, Q.of(w)), 1))) - 1n) / 2n;   // w: x rounded down",
      "const pile = r => (r * (r + 1n)) / 2n;          // the triangle number with r rows: 1 + 2 + ... + r",
      "const rows = Q.cmp(Q.abs(Q.sub(x, Q.of(pile(r0 + 1n)))), Q.abs(Q.sub(x, Q.of(pile(r0))))) < 0 ? r0 + 1n : r0;   // the nearer (the fewer rows on a tie)",
      "const n = pile(rows), main = n;                  // the triangle number nearest y: bigger is better",
    ],
    py: [
      "x = abs(m * p[\"k\"] + c)                          # y at x = k, ignoring a minus sign",
      "w = 0 if x <= 0 else whole(x - Fraction(1, 2))     # x rounded down",
      "r0 = 1 if w < 1 else (int(root(8 * w + 1)) - 1) // 2",
      "pile = lambda r: r * (r + 1) // 2                # the triangle number with r rows: 1 + 2 + ... + r",
      "rows = r0 + 1 if abs(x - pile(r0 + 1)) < abs(x - pile(r0)) else r0   # the nearer (the fewer rows on a tie)",
      "n = pile(rows)                                   # the triangle number nearest y: bigger is better",
      "main = n",
    ],
  }, "the triangle number (1, 3, 6, 10, ...) nearest y at x = k, the bigger the better", {
    "gradient-rows": tb("Q.neg(Q.abs(Q.sub(Q.abs(m), Q.of(rows))))", "-abs(abs(m) - rows)", "the gradient's size should be near the triangle's number of rows",
      "remove the \"shift\" line: only tilts change the gradient."),
    "intercept-multiple": tb("Q.neg(toMultiple(Q.abs(c), Q.of(rows)))", "-to_multiple(abs(c), rows)", "the y-intercept's size should be near a multiple of the number of rows",
      "remove the \"tilt\" line: only shifts change the y-intercept."),
  }),
  tuple("rulers-tuple", {
    ts: [
      "if (Q.eq(m, p.meets)) return null;               // parallel to y = meets·x: they never meet",
      "const x = Q.abs(Q.div(c, Q.sub(p.meets, m)));   // where the line meets y = meets·x, ignoring a minus sign",
      "const n = nearestPalindrome(x, p.digits === \"odd\"), main = n;   // the palindrome nearest it: bigger is better",
    ],
    py: [
      "if m == p[\"meets\"]:                              # parallel to y = meets·x: they never meet",
      "    return None",
      "x = abs(c / (p[\"meets\"] - m))                    # where the line meets y = meets·x, ignoring a minus sign",
      "n = nearest_palindrome(x, p[\"digits\"] == \"odd\")         # the palindrome nearest it: bigger is better",
      "main = n",
    ],
  }, "the palindrome with the rule's count of digits nearest where the line meets y = x (or y = -x), the bigger the better", {
    "gradient-digits": tb("Q.neg(Q.abs(Q.sub(Q.abs(m), Q.of([...String(n)].reduce((a, d) => a + Number(d), 0)))))", "-abs(abs(m) - sum(int(d) for d in str(n)))",
      "the gradient's size should be near the palindrome's digits added up", "remove the \"shift\" line: only tilts change the gradient."),
    "intercept-multiple": tb("Q.neg(toMultiple(Q.abs(c), Q.of(11)))", "-to_multiple(abs(c), 11)", "the y-intercept's size should be near a multiple of 11",
      "remove the \"tilt\" line: only shifts change the y-intercept."),
  }),
  tuple("crossing-tuple", {
    ts: [
      "if (Q.isZero(m) && Q.isZero(c)) return null;    // the x-axis itself scores nothing",
      "const x = Q.abs(Q.isZero(m) ? c : Q.div(c, m));  // where it crosses, ignoring a minus sign (a flat line: its height)",
      "const [j, n] = ladderNear(x, p.q, p.r), main = j;   // the ladder number nearest it: more q's is better",
    ],
    py: [
      "if m == 0 and c == 0:                           # the x-axis itself scores nothing",
      "    return None",
      "x = abs(c if m == 0 else c / m)                  # where it crosses, ignoring a minus sign (a flat line: its height)",
      "j, n = ladder_near(x, p[\"q\"], p[\"r\"])                 # the ladder number nearest it: more q's is better",
      "main = j",
    ],
  }, "how many q's the ladder number (q's times a number leaving r) nearest the x-crossing holds, the more the better", {
    "gradient-log": tb("Q.isZero(m) ? null : Q.neg(doublings(m, Q.isZero(n) ? 1 : n))", "None if m == 0 else -doublings(m, n if n != 0 else 1)",
      "the gradient's size times the ladder number should be near 1, counted in doublings", "remove the \"shift\" line: only tilts change the gradient."),
    "intercept-whole": tb("Q.neg(toMultiple(Q.abs(c), Q.of(1)))", "-to_multiple(abs(c), 1)", "the y-intercept should be near a whole number",
      "remove the \"tilt\" line: only shifts change the y-intercept."),
  }),
];
