/**
 * The v2 deal (convex/v2/deal.ts): only rules with a value function are dealt (decision 23); a fresh deal is seeded and gives
 * seats different rules while the pool lasts; rotation passes rules one seat along until everyone has held each once
 * (cases copied from v1's deal-rotation test). What would break: an unconverged or too-coarse rule reaching a player;
 * a deal that is not reproducible from its seed; a rotation that repeats a rule for a player within a round.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dealablePool, freshDeal, isPracticeGame, practiceDeal, rotatedDeal, ruleView, seatingClashes, type DealtRule, type PastDeal, type SeatKind } from "../../convex/v2/deal.ts";
import { presetOf } from "../../convex/v2/presets.ts";

// A line pool (every line preset deals the dynamic families since 17 Nov: see the test at the end).
const beginner = presetOf("lines-lenses");

test("a fresh deal is reproducible from its seed and spreads the pool over the seats", () => {
  const pool = dealablePool(beginner);
  const a = freshDeal(pool, 5, "s1"), b = freshDeal(pool, 5, "s1");
  assert.deepEqual(a, b);
  const first = a.slice(0, Math.min(5, pool.length)).map(r => r.ruleKey);
  assert.equal(new Set(first).size, first.length, "different rules while the pool lasts");
  assert.throws(() => freshDeal([], 3, "s"), /dealable/);
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

// Practice games (the coordinator's call of 15 Nov): dealt exactly as a real game.
for (const id of ["lines-beginner", "grids-beginner"]) test(`a practice deal in ${id} is reproducible`, () => {
  const preset = presetOf(id), pool = dealablePool(preset);
  for (const kinds of [["human", "practice"], ["practice", "human", "practice"], ["human", "practice", "practice", "practice"]] as SeatKind[][]) {
    for (let s = 0; s < 40; s++) {
      const seed = `practice-${s}`, deal = practiceDeal(pool, kinds, seed, preset.variant);
      assert.deepEqual(deal, practiceDeal(pool, kinds, seed, preset.variant), "reproducible from its seed");
      assert.equal(deal.length, kinds.length);
      assert.equal(seatingClashes(preset.variant, deal).length, 0, `${id} ${kinds} ${seed}: no forbidden pair`);
    }
  }
});

test("only a game of one human and practice partners is a practice game", () => {
  assert.equal(isPracticeGame(["human", "practice"]), true);
  assert.equal(isPracticeGame(["practice", "human", "practice"]), true);
  assert.equal(isPracticeGame(["human", "human", "practice"]), false, "two humans: a real deal");
  assert.equal(isPracticeGame(["human", "ai"]), false, "an AI player: a real deal");
  assert.equal(isPracticeGame(["human"]), false);
});

test("every grid setup deals the dynamic grid rules, main part only, no seating rule (energy.md, Grids)", async () => {
  const { dynamicGridFamilies } = await import("@workspace/v2-grid");
  for (const id of ["grids-beginner", "grids-more-rules"]) {
    const preset = presetOf(id), pool = dealablePool(preset);
    assert.deepEqual([...new Set(pool.map(r => r.family))].sort(), dynamicGridFamilies.map(f => f.id).sort(), id);
    for (const r of pool) { assert.equal(r.tieBreaker, null); }
    const deal = freshDeal(pool, 4, "grid", preset.variant);
    assert.equal(new Set(deal.map(r => r.family)).size, 4);
    assert.deepEqual(seatingClashes(preset.variant, deal), []);
  }
});


// Pair seating (lib/v2-pair seating.ts): no two rules one move climbs together, read from the rules' parameters.
test("the beginner lines deal the dynamic families, main part only, with no value table (energy.md)", async () => {
  const { dynamicFamilies } = await import("@workspace/v2-linear");
  const pool = dealablePool(presetOf("lines-beginner"));
  assert.deepEqual([...new Set(pool.map(r => r.family))].sort(), dynamicFamilies.map(f => f.id).sort());
  for (const r of pool) {
    assert.equal(r.tieBreaker, null);
  }
  const deal = freshDeal(pool, 5, "dyn", "line-q");
  assert.equal(new Set(deal.map(r => r.family)).size, 5);
});
