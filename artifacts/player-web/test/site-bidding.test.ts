/** The bid phase in the app (src/site/lib/bidding.ts): the start control, the bidding screen's rules, the handicap in a score. Expectations by hand. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  auctionLines, beforeHandicap, bidExample, everyonesBids, handicapLabel, handicapsOf, readAuction, bidOutcomeText, bidSummary, cardBid, cardHandicap, countdownText, doneLine, handicapNote, openBidding, parsePercent,
  placeBid, primaryLabel, roomStartView, stepPercent, withdrawBid,
} from "../src/site/lib/bidding.ts";

const fmt = (v: number) => v.toFixed(1);
const bidding = { startedAt: 1_000, endsAt: 31_000, seconds: 30, pricing: "first" as const, players: 3 };

test("the start control: bidding ends \"Starting…\" at once; a failed bid phase is a failed start the owner retries", () => {
  const request = { requestId: "r", since: 0, source: "owner" as const, returnedAt: 500 };
  // What would break: the owner's button reading "Starting…" for a minute while everyone bids.
  assert.deepEqual(roomStartView(request, { activeGame: null, bidding }, 1_000), { phase: "bidding", endsAt: 31_000 });
  assert.deepEqual(roomStartView(null, { activeGame: null, bidding }, 1_000), { phase: "bidding", endsAt: 31_000 }, "also for a start made elsewhere");
  // After bidding the room prepares (or the game exists): the usual states.
  assert.deepEqual(roomStartView(request, { activeGame: null, bidding: null, preparing: { ready: 1, total: 4 } }, 2_000), { phase: "preparing", ready: 1, total: 4 });
  assert.deepEqual(roomStartView(request, { activeGame: {}, bidding }, 2_000), { phase: "idle" });
  // A failed bid phase: the retry shows as starting for 8 s after its call returned, then the failure is the room's state again.
  const failed = { activeGame: null, bidding: { ...bidding, error: "Players left during bidding" } };
  assert.deepEqual(roomStartView({ ...request, since: 40_000, returnedAt: 41_000 }, failed, 42_000), { phase: "starting", source: "owner" });
  assert.deepEqual(roomStartView({ ...request, since: 40_000, returnedAt: 41_000 }, failed, 50_000), { phase: "idle" });
  assert.deepEqual(roomStartView(null, failed, 50_000), { phase: "idle" });
  assert.equal(openBidding(failed), null);
  assert.equal(openBidding({ bidding }), bidding);
  assert.equal(openBidding({ bidding: null }), null);
});

test("a typed bid is a whole percentage from 1 to 100; anything else says what to type", () => {
  assert.deepEqual(parsePercent("12", 1, 100), { percent: 12 });
  assert.deepEqual(parsePercent(" 7% ", 1, 100), { percent: 7 });
  assert.deepEqual(parsePercent("100", 1, 100), { percent: 100 });
  for (const bad of ["", "0", "101", "2.5", "ten", "-3"]) assert.deepEqual(parsePercent(bad, 1, 100), { error: "Type a whole number from 1 to 100." }, bad);
});

test("the stepper moves one percent within the limits; from no bid, up is the smallest bid", () => {
  assert.equal(stepPercent(undefined, 1, 1, 100), 1);
  assert.equal(stepPercent(undefined, -1, 1, 100), null);
  assert.equal(stepPercent(10, 1, 1, 100), 11);
  assert.equal(stepPercent(10, -1, 1, 100), 9);
  assert.equal(stepPercent(1, -1, 1, 100), null, "below the smallest bid is Remove bid, not a step");
  assert.equal(stepPercent(100, 1, 1, 100), null);
});

test("placing a bid replaces the bid on that rule; withdrawing removes it (what the screen shows before the server answers)", () => {
  const bids = [{ familyId: "a", percent: 5 }, { familyId: "b", percent: 10 }];
  assert.deepEqual(placeBid(bids, "a", 20), [{ familyId: "b", percent: 10 }, { familyId: "a", percent: 20 }]);
  assert.deepEqual(placeBid(bids, "c", 1), [...bids, { familyId: "c", percent: 1 }]);
  assert.deepEqual(withdrawBid(bids, "a"), [{ familyId: "b", percent: 10 }]);
  assert.deepEqual(withdrawBid(bids, "zzz"), bids);
});

test("\"Your bids\" names each rule, in the pool's order; the one button passes with no bids and finishes with some", () => {
  const families = [{ id: "a", name: "Alpha", emoji: "🅰", theme: "" }, { id: "b", name: "Beta", emoji: "🅱", theme: "" }];
  assert.deepEqual(bidSummary([{ familyId: "b", percent: 10 }, { familyId: "a", percent: 5 }], families),
    [{ familyId: "a", name: "Alpha", emoji: "🅰", percent: 5 }, { familyId: "b", name: "Beta", emoji: "🅱", percent: 10 }]);
  assert.equal(primaryLabel([]), "Pass");
  assert.equal(primaryLabel([{ familyId: "a", percent: 5 }]), "Done bidding");
  assert.equal(doneLine([], 2), "You passed. Waiting for 2 more players…");
  assert.equal(doneLine([{ familyId: "a", percent: 5 }], 1), "You are done. Waiting for 1 more player…");
  assert.equal(doneLine([], 0), "You passed. Everyone is done: dealing the rules…");
});

test("the countdown shows minutes and seconds, rounding up, and says so when time is up", () => {
  assert.equal(countdownText(31_000, 1_000), "0:30");
  assert.equal(countdownText(31_000, 1_001), "0:30", "29.999 s left still reads 0:30");
  assert.equal(countdownText(121_000, 0), "2:01");
  assert.equal(countdownText(31_000, 31_000), "ending…");
  assert.equal(countdownText(31_000, 99_000), "ending…");
});

test("the example matches the price rule", () => {
  assert.match(bidExample("first"), /if you win it, 10% is taken off your final score\. If nobody bids, rules are dealt at random as usual\./);
  assert.match(bidExample("second"), /at most 10%/);
});

test("the score before a handicap: net = raw − h% × |raw|, undone for either sign", () => {
  // 200 with 12% off is 176; −100 with 12% is −112 (a handicap never helps).
  assert.equal(beforeHandicap(176, 12), 200);
  assert.ok(Math.abs(beforeHandicap(-112, 12)! - -100) < 1e-9);
  assert.equal(beforeHandicap(0, 12), 0);
  assert.equal(beforeHandicap(50, 0), null, "no handicap: nothing to undo");
  assert.equal(beforeHandicap(0, 100), null, "a 100% handicap leaves 0 whatever the score was");
  assert.equal(handicapNote(176, 12, fmt), "after your 12% handicap; 200.0 before");
  assert.equal(handicapNote(0, 100, fmt), "after your 100% handicap");
  assert.equal(handicapNote(176, 0, fmt), null);
});

test("the goal card's bid outcome: won at first price, won at second price, or dealt at random; a card without one is an ordinary deal", () => {
  assert.equal(cardBid({ summary: "x" }), null);
  assert.equal(cardBid(null), null);
  assert.equal(cardHandicap({ summary: "x" }), 0);
  const won = { bid: { won: true, familyId: "a", percent: 12, handicap: 12, pricing: "first", bids: [{ familyId: "a", percent: 12 }] }, handicap: 12 };
  assert.equal(cardHandicap(won), 12);
  assert.equal(bidOutcomeText(cardBid(won)!, "Alpha"), "You won Alpha with a bid of 12%. Handicap: 12% is taken off your score.");
  const second = { bid: { ...won.bid, handicap: 8, pricing: "second" }, handicap: 8 };
  assert.equal(bidOutcomeText(cardBid(second)!, "Alpha"), "You won Alpha. You bid 12% and pay 8%: a handicap of 8% is taken off your score.");
  const lost = { bid: { won: false, handicap: 0, pricing: "first", bids: [{ familyId: "a", percent: 3 }] }, handicap: 0 };
  assert.equal(cardHandicap(lost), 0);
  assert.equal(bidOutcomeText(cardBid(lost)!, "whatever"), "You did not win a bid: this rule was dealt to you at random. No handicap.");
});

test("open bidding: everyone's bids per rule, highest first, the viewer's own marked; rules nobody bid on are left out", () => {
  const families = [{ id: "a", name: "Alpha", emoji: "🅰", theme: "" }, { id: "b", name: "Beta", emoji: "🅱", theme: "" }, { id: "c", name: "Gamma", emoji: "🅲", theme: "" }];
  const table = [
    { godId: "al", name: "Alice", done: false, bids: [{ familyId: "b", percent: 10 }, { familyId: "a", percent: 5 }] },
    { godId: "bo", name: "Bob", done: true, bids: [{ familyId: "b", percent: 20 }] },
    { godId: "ca", name: "Carol", done: true, bids: [] },
  ];
  assert.deepEqual(everyonesBids(table, families, "al"), [
    { familyId: "a", name: "Alpha", emoji: "🅰", bids: [{ godId: "al", name: "Alice", percent: 5, mine: true }] },
    { familyId: "b", name: "Beta", emoji: "🅱", bids: [{ godId: "bo", name: "Bob", percent: 20, mine: false }, { godId: "al", name: "Alice", percent: 10, mine: true }] },
  ]);
  assert.deepEqual(everyonesBids([], families, "al"), []);
});

test("what a game tells about its auction: handicaps beside scores; the wins once everything is told", () => {
  assert.equal(readAuction(null), null, "a private live game, or a game nobody won a bid in");
  const some = readAuction({ disclosure: "handicaps", handicaps: [{ godId: "al", handicap: 0 }, { godId: "bo", handicap: 12 }] })!;
  assert.deepEqual([...handicapsOf(some)], [["al", 0], ["bo", 12]]);
  assert.equal(some.wins, undefined);
  assert.equal(handicapLabel(12), "−12%");
  assert.equal(handicapLabel(0), "");
  assert.equal(handicapLabel(undefined), "");
  assert.deepEqual(auctionLines(some, id => id, id => id), [], "handicaps only: not which rule");
  const all = readAuction({ disclosure: "all", handicaps: some.handicaps, pricing: "second", bids: [], dropped: [],
    wins: [{ godId: "al", familyId: "a", percent: 5, handicap: 1 }, { godId: "bo", familyId: "b", percent: 20, handicap: 12 }, { godId: "ca", familyId: "c", percent: 7, handicap: 7 }] })!;
  const names: Record<string, string> = { al: "Alice", bo: "Bob", ca: "Carol", a: "Alpha", b: "Beta", c: "Gamma" };
  assert.deepEqual(auctionLines(all, id => names[id], id => names[id]).map(l => l.text), [
    "Bob won Beta: bid 20%, pays a 12% handicap.",
    "Carol won Gamma with a bid of 7%: a 7% handicap.",
    "Alice won Alpha: bid 5%, pays a 1% handicap.",
  ]);
});
