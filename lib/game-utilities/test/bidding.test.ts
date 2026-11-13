/**
 * The bid phase's assignment (src/bidding.ts, docs/bid-phase.md). The breaks these catch: a table that passes no longer
 * gets the dealer's deal; a won family dealt to somebody else; a player winning twice; a lower bid beating a higher one;
 * ties favouring a seat; a deal that cannot be finished throwing instead of dropping the lowest win.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate, seededRng } from "@workspace/game-types";
import {
  applyHandicap, availableFamilies, dealWithBids, divineLottery, fairAligned, resolveBids, type Bid, type SelectOptions,
} from "../src/index.ts";

const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "mono" });
const POOL = ["mirrormancer", "magic_eighteen", "opposite_nines", "two_pair", "spread_three", "strangers", "leapfrog", "crosswise_threes"];
const excludeAllBut = (keep: readonly string[]) => availableFamilies(inst, "reward").map(f => f.id).filter(id => !keep.includes(id));
const options: SelectOptions = { exclude: excludeAllBut(POOL) };
const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const bid = (playerId: string, familyId: string, percent: number): Bid => ({ playerId, familyId, percent });

test("the pool is the eight beginner families", () => {
  assert.deepEqual(availableFamilies(inst, "reward", options.exclude).map(f => f.id).sort(), [...POOL].sort());
});

test("nobody bids: the deal is the dealer's own, byte for byte, and the rng is left where the dealer leaves it", () => {
  for (const dealer of [fairAligned, divineLottery]) {
    for (const defenceGoals of [false, true]) {
      for (let seed = 0; seed < 25; seed++) {
        for (const n of [3, 5, 8]) {
          const a = seededRng(`all-pass:${seed}`), b = seededRng(`all-pass:${seed}`);
          const opts = { ...options, defenceGoals };
          const expected = dealer.select(inst, n, a, opts);
          const got = dealWithBids(dealer.id, inst, players(n), [], b, opts);
          assert.equal(JSON.stringify(got.deal), JSON.stringify(expected));
          assert.deepEqual(got.wins, []);
          assert.deepEqual(got.dropped, []);
          assert.equal(b.int(1 << 30), a.int(1 << 30), "the same randomness was consumed");
        }
      }
    }
  }
});

test("bids that do not count (a player not seated, a family outside the pool) leave the dealer's deal untouched", () => {
  const a = seededRng("ignored"), b = seededRng("ignored");
  const outside = excludeAllBut(POOL)[0];
  const got = dealWithBids(fairAligned.id, inst, players(4), [bid("stranger", "leapfrog", 50), bid("p0", outside, 50), bid("p1", "no_such_family", 9)], b, options);
  assert.equal(JSON.stringify(got.deal), JSON.stringify(fairAligned.select(inst, 4, a, options)));
  assert.deepEqual(got.wins, []);
});

test("a hand-worked auction: highest first, a winner's other bids and the family's other bids are removed", () => {
  // Sorted: p0 leapfrog 40, p1 leapfrog 30, p0 strangers 25, p1 two_pair 20, p2 two_pair 20 (tie), p2 strangers 5.
  // p0 wins leapfrog (40). p1's leapfrog and p0's strangers go. p1/p2 tie on two_pair at 20: one wins it; the loser
  // is p2 → wins strangers at 5, or p1 → has no bid left.
  const bids = [bid("p0", "leapfrog", 40), bid("p1", "leapfrog", 30), bid("p0", "strangers", 25), bid("p1", "two_pair", 20), bid("p2", "two_pair", 20), bid("p2", "strangers", 5)];
  const outcomes = new Set<string>();
  for (let seed = 0; seed < 60; seed++) {
    const wins = resolveBids(bids, seededRng(`hand:${seed}`));
    assert.deepEqual(wins[0], { playerId: "p0", familyId: "leapfrog", percent: 40, handicap: 40 });
    outcomes.add(wins.slice(1).map(w => `${w.playerId}:${w.familyId}:${w.handicap}`).join(" "));
  }
  assert.deepEqual([...outcomes].sort(), ["p1:two_pair:20 p2:strangers:5", "p2:two_pair:20"]);
});

test("second price: the winner pays the best bid still standing on that family, or the minimum bid", () => {
  const bids = [bid("p0", "leapfrog", 40), bid("p1", "leapfrog", 30), bid("p2", "leapfrog", 12), bid("p1", "two_pair", 35), bid("p3", "strangers", 9)];
  // p0 leapfrog 40 (pays 30: p1's bid is still standing when leapfrog is awarded); p1 two_pair 35 (alone: pays 1); p3 strangers 9 (pays 1).
  assert.deepEqual(resolveBids(bids, seededRng("second"), "second"), [
    { playerId: "p0", familyId: "leapfrog", percent: 40, handicap: 30 },
    { playerId: "p1", familyId: "two_pair", percent: 35, handicap: 1 },
    { playerId: "p3", familyId: "strangers", percent: 9, handicap: 1 },
  ]);
  // A bidder who already won elsewhere no longer sets the price: p1 wins two_pair at 50 first, so leapfrog's runner-up is p2.
  const later = [bid("p1", "two_pair", 50), bid("p0", "leapfrog", 40), bid("p1", "leapfrog", 30), bid("p2", "leapfrog", 12)];
  assert.equal(resolveBids(later, seededRng("second"), "second").find(w => w.familyId === "leapfrog")!.handicap, 12);
});

test("invalid bids are refused: zero, fractions, out of range, two on one family", () => {
  for (const percent of [0, -1, 0.5, 101, NaN]) assert.throws(() => resolveBids([bid("p0", "leapfrog", percent)], seededRng(1)), /whole percentage/);
  assert.throws(() => resolveBids([bid("p0", "leapfrog", 5), bid("p0", "leapfrog", 6)], seededRng(1)), /Two bids/);
});

test("properties over random auctions", () => {
  const rng = seededRng("bidding-properties");
  for (let round = 0; round < 400; round++) {
    const n = 3 + rng.int(6), ids = players(n);
    const bids: Bid[] = [];
    for (const id of ids) for (const f of POOL) if (rng.int(4) === 0) bids.push(bid(id, f, 1 + rng.int(rng.int(2) ? 6 : 100)));
    const defenceGoals = rng.int(3) === 0;
    const { deal, wins, dropped } = dealWithBids(fairAligned.id, inst, ids, bids, rng, { ...options, defenceGoals });
    assert.equal(deal.length, n);
    // No player wins two; a won family has one winner.
    assert.equal(new Set(wins.map(w => w.playerId)).size, wins.length);
    assert.equal(new Set(wins.map(w => w.familyId)).size, wins.length);
    const wonBy = new Map(wins.map(w => [w.familyId, w.playerId]));
    const all = [...wins, ...dropped];
    deal.forEach((d, i) => {
      const win = wins.find(w => w.playerId === ids[i]);
      // A winner holds their family; everyone else holds a family nobody won (exclusive), from the pool.
      if (win) assert.equal(d.familyId, win.familyId);
      else assert.ok(!wonBy.has(d.familyId), `${ids[i]} was dealt the won family ${d.familyId}`);
      assert.ok(POOL.includes(d.familyId));
      assert.equal(!!d.penalty, defenceGoals);
    });
    // Each win is a real bid, at first price.
    for (const w of all) assert.ok(bids.some(b => b.playerId === w.playerId && b.familyId === w.familyId && b.percent === w.percent && w.handicap === w.percent));
    // The highest bid on a family wins it, unless its bidder won another family with a bid at least as high.
    for (const f of POOL) {
      const on = bids.filter(b => b.familyId === f);
      if (!on.length) { assert.ok(!all.some(w => w.familyId === f)); continue; }
      const top = Math.max(...on.map(b => b.percent));
      const winner = all.find(w => w.familyId === f);
      for (const b of on.filter(b => b.percent === top)) {
        if (winner?.playerId === b.playerId) continue;
        const elsewhere = all.find(w => w.playerId === b.playerId);
        const beaten = winner && winner.percent === top;   // lost the tie
        assert.ok(beaten || (elsewhere && elsewhere.percent >= top), `${b.playerId}'s top bid of ${top} on ${f} neither won nor was displaced`);
      }
    }
    // Wins come highest first.
    for (let i = 1; i < wins.length; i++) assert.ok(wins[i - 1].percent >= wins[i].percent);
  }
});

test("ties are won uniformly: three equal bids on one family, each player wins about a third", () => {
  const counts = new Map<string, number>();
  const rng = seededRng("ties"), rounds = 6000;
  // The bids are listed in a fixed order: only the shuffle can make the winner fair.
  const bids = [bid("p0", "leapfrog", 10), bid("p1", "leapfrog", 10), bid("p2", "leapfrog", 10)];
  for (let i = 0; i < rounds; i++) {
    const [w] = resolveBids(bids, rng);
    counts.set(w.playerId, (counts.get(w.playerId) ?? 0) + 1);
  }
  for (const id of ["p0", "p1", "p2"]) assert.ok(Math.abs((counts.get(id) ?? 0) / rounds - 1 / 3) < 0.03, `${id}: ${counts.get(id)}`);
});

test("players without a win may still be dealt the same family as each other, never a won one", () => {
  const rng = seededRng("duplicates");
  let duplicates = 0;
  for (let i = 0; i < 300; i++) {
    const { deal } = dealWithBids(divineLottery.id, inst, players(8), [bid("p0", "leapfrog", 7)], rng, options);
    assert.equal(deal[0].familyId, "leapfrog");
    const rest = deal.slice(1).map(d => d.familyId);
    assert.ok(!rest.includes("leapfrog"));
    if (new Set(rest).size < rest.length) duplicates++;
  }
  assert.ok(duplicates > 0, "seven players over seven families: some deal repeats a family");
});

test("more players than the families left: the lowest wins are dropped until the rest can be dealt", () => {
  // A pool of three families (mirrormancer has two distinct rules on this board, the others one each), four players,
  // every family bid for: the fourth player could be dealt nothing, so the lowest win (p2, 5%) is dropped. p2 and p3 are
  // then dealt at random, without a handicap, from the one family nobody holds.
  const three = { exclude: excludeAllBut(["leapfrog", "strangers", "mirrormancer"]) };
  const bids = [bid("p0", "leapfrog", 20), bid("p1", "strangers", 10), bid("p2", "mirrormancer", 5)];
  for (let seed = 0; seed < 20; seed++) {
    const { deal, wins, dropped } = dealWithBids(divineLottery.id, inst, players(4), bids, seededRng(`short:${seed}`), three);
    assert.deepEqual(wins.map(w => [w.playerId, w.familyId]), [["p0", "leapfrog"], ["p1", "strangers"]]);
    assert.deepEqual(dropped.map(w => [w.playerId, w.familyId]), [["p2", "mirrormancer"]]);
    assert.deepEqual(deal.map(d => d.familyId), ["leapfrog", "strangers", "mirrormancer", "mirrormancer"]);
  }
  // Three players, three wins: nobody is left to deal, nothing is dropped.
  const full = dealWithBids(divineLottery.id, inst, players(3), bids, seededRng("short"), three);
  assert.equal(full.wins.length, 3);
  assert.deepEqual(full.dropped, []);
  assert.deepEqual(full.deal.map(d => d.familyId), ["leapfrog", "strangers", "mirrormancer"]);
});

test("a handicap is taken off the size of a total, always downwards; none leaves it untouched", () => {
  assert.equal(applyHandicap(200, 12), 176);
  assert.equal(applyHandicap(-50, 10), -55);
  assert.equal(applyHandicap(0, 40), 0);
  assert.equal(applyHandicap(123.456, undefined), 123.456);
  assert.equal(applyHandicap(123.456, 0), 123.456);
  assert.equal(applyHandicap(80, 100), 0);
});
