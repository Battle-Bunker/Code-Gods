/**
 * The bid mechanism (integration plan §5.9). Breaks caught: a table that passes no longer gets the dealer's deal byte
 * for byte; a won family dealt to somebody else; a player winning twice; a lower bid beating a higher one; ties
 * favouring a seat; a deal that cannot be finished throwing instead of dropping the lowest win; a wrong handicap.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rng, type Rng } from "@workspace/v2-core";
import { applyHandicap, dealWithBids, resolveBids, type Bid, type BidDealer } from "../src/index.ts";

const POOL = ["mirror", "sum_eighteen", "opposite", "two_pair", "spread", "strangers", "leapfrog", "crosswise"];
const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const bid = (playerId: string, familyId: string, percent: number): Bid => ({ playerId, familyId, percent });

/** A stand-in dealer: a deal is "family#params", params drawn from the rng; families drawn uniformly with repeats. */
type Deal = { familyId: string; params: number };
const dealerOf = (pool: readonly string[]): BidDealer<Deal> => ({
  dealFamily: (familyId, r) => ({ familyId, params: r.below(1000) }),
  dealRest(count, excluded, r: Rng) {
    const left = pool.filter(f => !excluded.includes(f));
    if (!left.length) throw new Error("Nothing left to deal");
    return Array.from({ length: count }, () => ({ familyId: left[r.below(left.length)]!, params: r.below(1000) }));
  },
});
const dealer = dealerOf(POOL);

test("nobody bids: the deal is the dealer's own, byte for byte, and the rng is left where the dealer leaves it", () => {
  for (let seed = 0; seed < 25; seed++) {
    for (const n of [3, 5, 8]) {
      const a = rng("all-pass", seed), b = rng("all-pass", seed);
      const expected = dealer.dealRest(n, [], a);
      const got = dealWithBids(players(n), POOL, [], b, dealer);
      assert.equal(JSON.stringify(got.deal), JSON.stringify(expected));
      assert.deepEqual(got.wins, []);
      assert.deepEqual(got.dropped, []);
      assert.equal(b.uint32(), a.uint32(), "the same randomness was consumed");
    }
  }
  // resolveBids itself draws nothing for no bid or a single one.
  const a = rng("none"), b = rng("none");
  resolveBids([], b); resolveBids([bid("p0", "leapfrog", 5)], b);
  assert.equal(b.uint32(), a.uint32());
});

test("bids that do not count (a player not seated, a family outside the pool) leave the dealer's deal untouched", () => {
  const a = rng("ignored"), b = rng("ignored");
  const got = dealWithBids(players(4), POOL, [bid("stranger", "leapfrog", 50), bid("p1", "no_such_family", 9)], b, dealer);
  assert.equal(JSON.stringify(got.deal), JSON.stringify(dealer.dealRest(4, [], a)));
  assert.deepEqual(got.wins, []);
});

test("a hand-worked auction: highest first, a winner's other bids and the family's other bids are removed", () => {
  // Sorted: p0 leapfrog 40, p1 leapfrog 30, p0 strangers 25, p1 two_pair 20, p2 two_pair 20 (tie), p2 strangers 5.
  // p0 wins leapfrog. p1/p2 tie on two_pair at 20: if p2 loses it wins strangers at 5; if p1 loses it has no bid left.
  const bids = [bid("p0", "leapfrog", 40), bid("p1", "leapfrog", 30), bid("p0", "strangers", 25), bid("p1", "two_pair", 20), bid("p2", "two_pair", 20), bid("p2", "strangers", 5)];
  const outcomes = new Set<string>();
  for (let seed = 0; seed < 60; seed++) {
    const wins = resolveBids(bids, rng("hand", seed));
    assert.deepEqual(wins[0], { playerId: "p0", familyId: "leapfrog", percent: 40, handicap: 40 });
    outcomes.add(wins.slice(1).map(w => `${w.playerId}:${w.familyId}:${w.handicap}`).join(" "));
  }
  assert.deepEqual([...outcomes].sort(), ["p1:two_pair:20 p2:strangers:5", "p2:two_pair:20"]);
});

test("second price: the winner pays the best bid still standing on that family, or the minimum bid", () => {
  const bids = [bid("p0", "leapfrog", 40), bid("p1", "leapfrog", 30), bid("p2", "leapfrog", 12), bid("p1", "two_pair", 35), bid("p3", "strangers", 9)];
  assert.deepEqual(resolveBids(bids, rng("second"), "second"), [
    { playerId: "p0", familyId: "leapfrog", percent: 40, handicap: 30 },
    { playerId: "p1", familyId: "two_pair", percent: 35, handicap: 1 },
    { playerId: "p3", familyId: "strangers", percent: 9, handicap: 1 },
  ]);
  // A bidder who already won elsewhere no longer sets the price: p1 wins two_pair first, so leapfrog's runner-up is p2.
  const later = [bid("p1", "two_pair", 50), bid("p0", "leapfrog", 40), bid("p1", "leapfrog", 30), bid("p2", "leapfrog", 12)];
  assert.equal(resolveBids(later, rng("second"), "second").find(w => w.familyId === "leapfrog")!.handicap, 12);
});

test("invalid bids are refused: zero, fractions, out of range, two on one family", () => {
  for (const percent of [0, -1, 0.5, 101, NaN]) assert.throws(() => resolveBids([bid("p0", "leapfrog", percent)], rng(1)), /whole percentage/);
  assert.throws(() => resolveBids([bid("p0", "leapfrog", 5), bid("p0", "leapfrog", 6)], rng(1)), /Two bids/);
  assert.throws(() => dealWithBids(["p0", "p0"], POOL, [], rng(1), dealer), /Duplicate/);
});

test("properties over random auctions", () => {
  const r = rng("bidding-properties");
  for (let round = 0; round < 400; round++) {
    const n = 3 + r.below(6), ids = players(n);
    const bids: Bid[] = [];
    for (const id of ids) for (const f of POOL) if (r.below(4) === 0) bids.push(bid(id, f, 1 + r.below(r.below(2) ? 6 : 100)));
    const { deal, wins, dropped } = dealWithBids(ids, POOL, bids, r, dealer);
    assert.equal(deal.length, n);
    assert.deepEqual(dropped, [], "eight families, at most eight players: the rest can always be dealt");
    // No player wins two; a won family has one winner.
    assert.equal(new Set(wins.map(w => w.playerId)).size, wins.length);
    assert.equal(new Set(wins.map(w => w.familyId)).size, wins.length);
    const wonBy = new Map(wins.map(w => [w.familyId, w.playerId]));
    deal.forEach((d, i) => {
      const win = wins.find(w => w.playerId === ids[i]);
      if (win) assert.equal(d.familyId, win.familyId);
      else assert.ok(!wonBy.has(d.familyId), `${ids[i]} was dealt the won family ${d.familyId}`);
    });
    // Each win is a real bid, at first price.
    for (const w of wins) assert.ok(bids.some(b => b.playerId === w.playerId && b.familyId === w.familyId && b.percent === w.percent && w.handicap === w.percent));
    // The highest bid on a family wins it, unless its bidder won another family with a bid at least as high, or lost a tie.
    for (const f of POOL) {
      const on = bids.filter(b => b.familyId === f);
      if (!on.length) { assert.ok(!wins.some(w => w.familyId === f)); continue; }
      const top = Math.max(...on.map(b => b.percent));
      const winner = wins.find(w => w.familyId === f);
      for (const b of on.filter(b => b.percent === top)) {
        if (winner?.playerId === b.playerId) continue;
        const elsewhere = wins.find(w => w.playerId === b.playerId);
        assert.ok((winner && winner.percent === top) || (elsewhere && elsewhere.percent >= top), `${b.playerId}'s top bid of ${top} on ${f} neither won nor was displaced`);
      }
    }
    for (let i = 1; i < wins.length; i++) assert.ok(wins[i - 1]!.percent >= wins[i]!.percent, "wins come highest first");
  }
});

test("ties are won uniformly: three equal bids on one family, each player wins about a third", () => {
  const counts = new Map<string, number>();
  const r = rng("ties"), rounds = 6000;
  const bids = [bid("p0", "leapfrog", 10), bid("p1", "leapfrog", 10), bid("p2", "leapfrog", 10)];
  for (let i = 0; i < rounds; i++) {
    const [w] = resolveBids(bids, r);
    counts.set(w!.playerId, (counts.get(w!.playerId) ?? 0) + 1);
  }
  for (const id of ["p0", "p1", "p2"]) assert.ok(Math.abs((counts.get(id) ?? 0) / rounds - 1 / 3) < 0.03, `${id}: ${counts.get(id)}`);
});

test("more players than the families left: the lowest wins are dropped until the rest can be dealt", () => {
  const three = ["leapfrog", "strangers", "mirror"];
  const bids = [bid("p0", "leapfrog", 20), bid("p1", "strangers", 10), bid("p2", "mirror", 5)];
  for (let seed = 0; seed < 20; seed++) {
    const { deal, wins, dropped } = dealWithBids(players(4), three, bids, rng("short", seed), dealerOf(three));
    assert.deepEqual(wins.map(w => [w.playerId, w.familyId]), [["p0", "leapfrog"], ["p1", "strangers"]]);
    assert.deepEqual(dropped.map(w => [w.playerId, w.familyId]), [["p2", "mirror"]]);
    assert.deepEqual(deal.map(d => d.familyId), ["leapfrog", "strangers", "mirror", "mirror"]);
  }
  // Three players, three wins: nobody is left to deal, nothing is dropped.
  const full = dealWithBids(players(3), three, bids, rng("short"), dealerOf(three));
  assert.equal(full.wins.length, 3);
  assert.deepEqual(full.dropped, []);
});

test("a handicap is taken off the size of a total, always downwards; none leaves it untouched", () => {
  assert.equal(applyHandicap(200, 12), 176);
  assert.equal(applyHandicap(-50, 10), -55);
  assert.equal(applyHandicap(0, 40), 0);
  assert.equal(applyHandicap(123.456, undefined), 123.456);
  assert.equal(applyHandicap(123.456, 0), 123.456);
  assert.equal(applyHandicap(80, 100), 0);
});
