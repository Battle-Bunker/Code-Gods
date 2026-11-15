/**
 * The v2 deal (convex/v2/deal.ts): only rules with a value function are dealt (decision 23); a fresh deal is seeded and gives
 * seats different rules while the pool lasts; rotation passes rules one seat along until everyone has held each once
 * (cases copied from v1's deal-rotation test). What would break: an unconverged or too-coarse rule reaching a player;
 * a deal that is not reproducible from its seed; a rotation that repeats a rule for a player within a round.
 */
import { measuredToBits, valueRecord } from "../../convex/v2/values.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { dealablePool, freshDeal, isPracticeGame, practiceDeal, rotatedDeal, ruleView, seatingClashes, type DealtRule, type PastDeal, type SeatKind } from "../../convex/v2/deal.ts";
import { pairVerdict } from "@workspace/v2-agents/pure";
import { presetOf } from "../../convex/v2/presets.ts";

const beginner = presetOf("lines-beginner");

test("the pool holds exactly the preset's rules with a value function, from every beginner family", () => {
  const pool = dealablePool(beginner);
  assert.ok(pool.length > 0, "something is dealable");
  assert.deepEqual([...new Set(pool.map(r => r.family))].sort(), [...beginner.families].sort(), "every beginner family deals");
  for (const r of pool) {
    assert.ok(valueRecord(r.ruleKey), r.ruleKey);
    assert.ok(beginner.families.includes(r.family));
    assert.ok(r.tieBreaker, "a dealt rule is a main layer plus one tie-breaker");
  }
  const keys = new Set(pool.map(r => r.ruleKey));
  assert.equal(keys.size, pool.length);
});

test("a fresh deal is reproducible from its seed and spreads the pool over the seats", () => {
  const pool = dealablePool(beginner);
  const a = freshDeal(pool, 5, "s1"), b = freshDeal(pool, 5, "s1");
  assert.deepEqual(a, b);
  const first = a.slice(0, Math.min(5, pool.length)).map(r => r.ruleKey);
  assert.equal(new Set(first).size, first.length, "different rules while the pool lasts");
  assert.throws(() => freshDeal([], 3, "s"), /dealable/);
});

test("a dealt rule's card comes from its family, and every dealt rule has a value function (decision 23)", () => {
  const [rule] = dealablePool(beginner);
  const view = ruleView(rule!);
  assert.equal(view.layers.length, 2);
  assert.equal(view.layers[1], rule!.tieBreaker);
  assert.ok(view.card.length > 0);
  for (const r of dealablePool(beginner)) {
    const vf = valueRecord(r.ruleKey);
    assert.ok(vf && vf.contentHash === r.contentHash, `${r.ruleKey} is dealt with its value function`);
    assert.equal(vf.knots[0]!.bits, 0, "the worst score is worth nothing");
    for (let i = 1; i < vf.knots.length; i++) assert.ok(vf.knots[i]!.bits >= vf.knots[i - 1]!.bits, "worth never falls as the score improves");
    assert.ok(measuredToBits(vf) > 0);
  }
});

const KEY = "deal-key";
const past = (members: string[], rules: string[], dealKey = KEY, bid = false): PastDeal => ({ members, rules, dealKey, bid });

test("rotation: after one game the rules pass one seat along", () => {
  assert.equal(rotatedDeal(["a", "b", "c"], KEY, []), null);
  const next = rotatedDeal(["a", "b", "c"], KEY, [past(["a", "b", "c"], ["x", "y", "z"])]);
  assert.deepEqual(next?.rules, ["z", "x", "y"]);
  assert.deepEqual([next?.round, next?.of], [2, 3]);
  assert.deepEqual(rotatedDeal(["c", "a", "b"], KEY, [past(["a", "b", "c"], ["x", "y", "z"])])?.rules, ["y", "z", "x"]);
});

test("rotation: a full round, then a fresh deal; other players, key or a won bid: fresh", () => {
  const g1 = past(["a", "b", "c"], ["x", "y", "z"]), g2 = past(["a", "b", "c"], ["z", "x", "y"]), g3 = past(["a", "b", "c"], ["y", "z", "x"]);
  assert.deepEqual(rotatedDeal(["a", "b", "c"], KEY, [g2, g1])?.rules, ["y", "z", "x"]);
  assert.equal(rotatedDeal(["a", "b", "c"], KEY, [g3, g2, g1]), null);
  assert.equal(rotatedDeal(["a", "b", "c"], KEY, [past(["a", "b", "c"], ["p", "q", "r"]), g3, g2, g1])?.round, 2);
  assert.equal(rotatedDeal(["a", "b", "d"], KEY, [g1]), null);
  assert.equal(rotatedDeal(["a", "b", "c"], "other", [g1]), null);
  assert.equal(rotatedDeal(["a", "b", "c"], KEY, [past(["a", "b", "c"], ["x", "y", "z"], KEY, true)]), null);
});

test("rotation: a new seat order mid-round still gives everyone each rule once", () => {
  const g1 = past(["a", "b", "c"], ["x", "y", "z"]);
  const g2 = past(["b", "a", "c"], rotatedDeal(["b", "a", "c"], KEY, [g1])!.rules);
  const r3 = rotatedDeal(["c", "b", "a"], KEY, [g2, g1])!;
  assert.equal(r3.round, 3);
  for (const [k, m] of ["c", "b", "a"].entries()) {
    const held = [g1, g2].map(g => g.rules[g.members.indexOf(m)]);
    assert.ok(!held.includes(r3.rules[k]!), `${m} gets a rule it has not held`);
  }
  assert.equal(rotatedDeal(["a", "b", "c"], KEY, [past(["c", "b", "a"], r3.rules), g2, g1]), null);
});

test("bids: no bids gives the plain deal byte for byte; a win is exclusive and from its family", async () => {
  const { dealWithBids } = await import("@workspace/v2-economy");
  const { bidDealer, dealRng } = await import("../../convex/v2/deal.ts");
  // The dealer only reads `family`: a second copy of the pool under other family names gives the auction a choice
  // whatever W1's pool converges to today.
  const real = dealablePool(beginner), pool = [...real, ...real.map(r => ({ ...r, family: `${r.family}-copy` }))];
  const families = [...new Set(pool.map(r => r.family))], seats = ["a", "b", "c"];
  for (const seed of ["s1", "s2", "s3"]) {
    const plain = freshDeal(pool, 3, seed);
    assert.deepEqual(dealWithBids(seats, families, [], dealRng(seed), bidDealer(pool)).deal, plain, seed);
  }
  const target = families[0]!;
  const dealt = dealWithBids(seats, families, [{ playerId: "b", familyId: target, percent: 20 }, { playerId: "c", familyId: target, percent: 10 }], dealRng("s1"), bidDealer(pool), "second");
  assert.deepEqual(dealt.wins.map(w => [w.playerId, w.familyId, w.handicap]), [["b", target, 10]]);
  assert.equal(dealt.deal[1]!.family, target);
  assert.ok(dealt.deal.filter((_, i) => i !== 1).every(r => r.family !== target), "nobody else is dealt the won family");
});

// Practice games (coordinator's call (b), provisional): one human and practice partners only. The deal keeps the human
// from being the odd one out, by the agents session's pair verdicts (lib/v2-agents compat.gen.ts).
for (const id of ["lines-beginner", "grids-beginner"]) test(`a practice deal in ${id} never leaves the human the odd one out`, () => {
  const preset = presetOf(id), pool = dealablePool(preset);
  const verdict = (a: DealtRule, b: DealtRule) => a.ruleKey === b.ruleKey ? "compatible" : pairVerdict(preset.variant, `${a.family}/${a.tieBreaker}`, `${b.family}/${b.tieBreaker}`);
  for (const kinds of [["human", "practice"], ["practice", "human", "practice"], ["human", "practice", "practice", "practice"]] as SeatKind[][]) {
    const h = kinds.indexOf("human");
    let fresh = 0;
    for (let s = 0; s < 40; s++) {
      const seed = `practice-${s}`, deal = practiceDeal(pool, kinds, seed, preset.variant);
      assert.deepEqual(deal, practiceDeal(pool, kinds, seed, preset.variant), "reproducible from its seed");
      assert.equal(deal.length, kinds.length);
      const partners = deal.filter((_, i) => i !== h);
      // The human's family and entry are drawn first (playtest round 21), so the human shares a goal with a partner
      // whenever some partner allowed beside them by the seating rule does.
      const possible = pool.some(b => b.family !== deal[h]!.family && verdict(deal[h]!, b) === "compatible" && seatingClashes(preset.variant, [deal[h]!, b]).length === 0);
      if (possible) assert.ok(partners.some(p => verdict(deal[h]!, p) === "compatible"), `${id} ${kinds} ${seed}: the human shares a goal with a partner`);
      for (const p of partners) for (const q of partners) if (p !== q)
        assert.ok(!(verdict(p, q) === "compatible" && verdict(deal[h]!, p) === "conflict" && verdict(deal[h]!, q) === "conflict"), `${id} ${seed}: no two partners agree against the human`);
      if (JSON.stringify(deal) !== JSON.stringify(freshDeal(pool, kinds.length, seed))) fresh++;
    }
    assert.ok(fresh > 0, "the constraint changes some deals (else it is not doing anything)");
  }
});

test("only a game of one human and practice partners is a practice game", () => {
  assert.equal(isPracticeGame(["human", "practice"]), true);
  assert.equal(isPracticeGame(["practice", "human", "practice"]), true);
  assert.equal(isPracticeGame(["human", "human", "practice"]), false, "two humans: a real deal");
  assert.equal(isPracticeGame(["human", "ai"]), false, "an AI player: a real deal");
  assert.equal(isPracticeGame(["human"]), false);
});

// Grid seating (the coordinator's calls following owner decision 39; lib/v2-grid seating.ts): no forbidden pair (one
// family twice, the same main part, big digits against small digits, a blocked pair), and among the deals without one
// the fewest aligned pairs (two families of one cluster). A beginner table is one digit cluster plus Crosswise Threes
// (call 19): one aligned pair at three seats, three at four.
test("grids: a deal seats no forbidden pair, and the fewest aligned pairs the pool allows", async () => {
  const { gridAlignedPairs, gridClashes } = await import("@workspace/v2-grid");
  const { dealWithBids } = await import("@workspace/v2-economy");
  const { bidDealer, dealRng, seatingAligned, seatingClashes } = await import("../../convex/v2/deal.ts");
  for (const [id, seats, aligned] of [["grids-beginner", 3, 1], ["grids-beginner", 4, 3], ["grids-more-rules", 3, 0], ["grids-more-rules", 5, 0]] as const) {
    const preset = presetOf(id), pool = dealablePool(preset);
    let changed = 0;
    for (let s = 0; s < 30; s++) {
      const seed = `seat-${s}`, deal = freshDeal(pool, seats, seed, preset.variant), families = deal.map(r => r.family);
      assert.deepEqual(deal, freshDeal(pool, seats, seed, preset.variant), "reproducible from its seed");
      assert.deepEqual(gridClashes(families), [], `${id}, ${seats} seats, ${seed}: no forbidden pair`);
      assert.equal(gridAlignedPairs(families).length, aligned, `${id}, ${seats} seats, ${seed}: ${gridAlignedPairs(families).join(", ")}`);
      assert.deepEqual(seatingClashes(preset.variant, deal), []);
      assert.deepEqual(seatingAligned(preset.variant, deal), gridAlignedPairs(families));
      if (JSON.stringify(deal) !== JSON.stringify(freshDeal(pool, seats, seed))) changed++;
      // With no bids the bid dealer deals exactly the plain deal.
      const players = Array.from({ length: seats }, (_, i) => `p${i}`);
      assert.deepEqual(dealWithBids(players, [...new Set(pool.map(r => r.family))], [], dealRng(seed), bidDealer(pool, preset.variant)).deal, deal);
    }
    assert.ok(changed > 0, `${id}: the seating rule changes some deals`);
  }
  assert.deepEqual(seatingClashes("line-q", [{ family: "magic-eighteen" }, { family: "opposite-nines" }]), [], "the grids' rule is not the lines'");
  // Families in no seating cluster (Grids · arithmetic): no forbidden or aligned pair but one family twice; both sit at two seats.
  assert.deepEqual(gridClashes(["divisibility", "leading-digits"]), []);
  assert.deepEqual(gridAlignedPairs(["divisibility", "leading-digits", "magic-eighteen"]), []);
  assert.deepEqual(gridClashes(["leading-digits", "leading-digits"]), ["leading-digits × leading-digits"]);
  const arithmetic = presetOf("grids-arithmetic"), arithmeticPool = dealablePool(arithmetic);
  for (let s = 0; s < 20; s++) {
    const families = freshDeal(arithmeticPool, 2, `arith-${s}`, arithmetic.variant).map(r => r.family);
    assert.deepEqual([...families].sort(), ["divisibility", "leading-digits"], `arith-${s}`);
  }
});

test("lines: a fresh deal never seats Prime Landing beside Whole Crossing on the same landings (lib/v2-linear seating.ts)", async () => {
  const { seatingClashes } = await import("../../convex/v2/deal.ts");
  const { lineClashes } = await import("@workspace/v2-linear");
  const pool = dealablePool(beginner);
  let both = 0;
  for (let s = 0; s < 300; s++) {
    const deal = freshDeal(pool, 5, `lines-seat-${s}`, beginner.variant);
    assert.deepEqual(lineClashes(deal), [], `seed ${s}`);
    assert.deepEqual(seatingClashes(beginner.variant, deal), []);
    if (deal.some(r => r.family === "prime-landing") && deal.some(r => r.family === "whole-crossing")) both++;
  }
  assert.ok(both > 0, "the two families are still seated together, on landings that pull apart");
});
