/**
 * The bid phase of a game start (convex/bidding.ts, owner.ts completeBidding; docs/bid-phase.md), against the live local
 * engine. What would break: a table that passes not getting an ordinary game; a won family dealt to someone else; a
 * handicap missing from the ranked totals or applied to the wrong god; the phase not ending when everyone is done, or
 * never ending; a player who leaves hanging the start; and, above all, one player's bids or handicap reaching another.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { leaderboard } from "@workspace/game-core";
import { disclosureChecker } from "./disclosure.ts";
import { admin, api, gods, internal, raw, rejects, roomWith, startGame, startedGame, touch, waitFor, type God } from "./game-helpers.ts";

/** The default setup's board (Annotated basics: the eight beginner rules), with a bid phase and a game that does not end. */
const bidding = (seconds: number, more: Record<string, unknown> = {}) => ({ bidSeconds: seconds, halfLifeSeconds: 100000, planningSeconds: 3600, ...more });
const POOL = ["mirrormancer", "magic_eighteen", "opposite_nines", "two_pair", "spread_three", "strangers", "leapfrog", "crosswise_threes"];

async function table(label: string, seconds: number, more: Record<string, unknown> = {}, extra: string[] = []) {
  const members = await gods(`${label} Host`, `${label} Ada`, `${label} Bo`, ...extra.map(n => `${label} ${n}`));
  await touch(members[0]);
  const { roomId, shortCode } = await roomWith(members, bidding(seconds, more));
  return { members, host: members[0], ada: members[1], bo: members[2], roomId, shortCode };
}
const start = (host: God, roomId: string) => host.c.action(api.owner.start, { roomId, requestId: crypto.randomUUID() });
const mine = (god: God, roomId: string) => god.c.query(api.bidding.mine, { roomId });
const place = (god: God, roomId: string, familyId: string, percent: number) => god.c.mutation(api.bidding.place, { roomId, familyId, percent });
const done = (god: God, roomId: string) => god.c.mutation(api.bidding.done, { roomId });
/** The requestId of the room's open bid phase (dev fixture). */
const raw_bidding = async (host: God, roomId: string) => (await admin.query(internal.testing.roomBidding, { roomId })).requestId as string;
const familyOf = (r: any, god: God) => r.deities.find((d: any) => d.godId === god.subject).utility.familyId as string;
const cardOf = (r: any, god: God) => r.deities.find((d: any) => d.godId === god.subject).card;

test("everybody passes: the phase ends at once and the game carries no trace of bidding", { timeout: 120_000 }, async () => {
  const { members, host, ada, bo, roomId } = await table("Pass", 300);
  const started = await start(host, roomId);
  assert.equal(started.status, "bidding");
  assert.equal(started.seconds, 300);
  assert.equal(started.players, 3);
  // A repeated start reports the same bid phase; it does not restart it.
  assert.equal((await start(host, roomId)).endsAt, started.endsAt);
  const room = await ada.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual({ ...room.bidding }, { startedAt: started.startedAt, endsAt: started.endsAt, seconds: 300, pricing: "first", players: 3 });
  assert.equal(room.activeGame, null);
  const view = await mine(ada, roomId);
  assert.deepEqual(view.families.map((f: any) => f.id).sort(), [...POOL].sort());
  assert.deepEqual([view.seated, view.done, view.bids, view.waitingFor, view.minPercent, view.maxPercent], [true, false, [], 3, 1, 100]);
  // Settings and seats are frozen while the players bid.
  assert.match(await rejects(host.c.action(api.owner.settings, { roomId, revision: room.revision, settings: { planningSeconds: 10 } })), /bidding/);
  assert.match(await rejects(ada.c.mutation(api.rooms.setSpectator, { roomId, spectator: true })), /bidding/);
  assert.equal((await done(ada, roomId)).ended, false);
  assert.equal((await mine(bo, roomId)).waitingFor, 2);
  assert.equal((await done(bo, roomId)).ended, false);
  assert.equal((await done(host, roomId)).ended, true, "the last human to finish ends the phase");
  const game = await startedGame(host, roomId, started);
  const r = await raw(game.gameId);
  assert.equal(r.game.phase, "planning");
  assert.equal(r.game.handicaps, undefined);
  for (const d of r.deities) {
    assert.ok(POOL.includes(d.utility.familyId));
    assert.ok(!("bid" in d.card) && !("handicap" in d.card), "a card dealt without bids is an ordinary card");
  }
  assert.equal(await admin.query(internal.testing.auctionOf, { gameId: game.gameId }), null);
  const after = await ada.c.query(api.rooms.get, { room: roomId });
  assert.equal(after.bidding, null);
  assert.equal(await mine(ada, roomId), null);
  assert.match(await rejects(place(ada, roomId, "leapfrog", 5)), /No bidding is open/);
  assert.deepEqual(r.game.roster.map((m: any) => m.id), members.map(m => m.subject));
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});

test("a contested family: the highest bid wins it exclusively, the loser's next bid counts, and totals are ranked net of the handicap", { timeout: 180_000 }, async () => {
  const { members, host, ada, bo, roomId } = await table("Contest", 300);
  const started = await start(host, roomId);
  // Ada 30% and Bo 20% on leapfrog; Bo also 10% on strangers; the host passes.
  await place(ada, roomId, "leapfrog", 12);
  assert.deepEqual((await place(ada, roomId, "leapfrog", 30)).bids, [{ familyId: "leapfrog", percent: 30 }], "a second bid on a family replaces the first");
  await place(ada, roomId, "two_pair", 9);
  assert.deepEqual((await ada.c.mutation(api.bidding.withdraw, { roomId, familyId: "two_pair" })).bids, [{ familyId: "leapfrog", percent: 30 }]);
  await place(bo, roomId, "leapfrog", 20);
  await place(bo, roomId, "strangers", 10);
  // Refused: zero, a fraction, above 100, a family outside the pool.
  for (const percent of [0, 2.5, 101, -3]) assert.match(await rejects(place(bo, roomId, "two_pair", percent)), /whole percentage from 1 to 100/);
  assert.match(await rejects(place(bo, roomId, "staircase_climber", 5)), /not one of this game's rules/);
  // Sealed: each player sees their own bids only; the room says nothing.
  assert.deepEqual((await mine(bo, roomId)).bids, [{ familyId: "leapfrog", percent: 20 }, { familyId: "strangers", percent: 10 }]);
  assert.deepEqual((await mine(host, roomId)).bids, []);
  const roomView = JSON.stringify(await bo.c.query(api.rooms.get, { room: roomId }));
  assert.ok(!roomView.includes('"percent"') && !roomView.includes("roomBids"));
  // Done, then a change of mind reopens the player's bidding.
  await done(ada, roomId);
  assert.equal((await place(ada, roomId, "leapfrog", 30)).done, true, "re-sending the same bid changes nothing");
  await done(bo, roomId);
  assert.equal((await done(host, roomId)).ended, true);
  const game = await startedGame(host, roomId, started);
  const r = await raw(game.gameId);
  assert.equal(familyOf(r, ada), "leapfrog");
  assert.equal(familyOf(r, bo), "strangers");
  assert.ok(!["leapfrog", "strangers"].includes(familyOf(r, host)), "a won family is exclusive");
  assert.deepEqual(r.game.handicaps, members.map(m => (m === ada ? 30 : m === bo ? 10 : 0)), "handicaps in roster order");
  assert.deepEqual(cardOf(r, ada).bid, { won: true, familyId: "leapfrog", percent: 30, handicap: 30, pricing: "first", bids: [{ familyId: "leapfrog", percent: 30 }] });
  assert.equal(cardOf(r, ada).handicap, 30);
  assert.deepEqual(cardOf(r, bo).bid, { won: true, familyId: "strangers", percent: 10, handicap: 10, pricing: "first",
    bids: [{ familyId: "leapfrog", percent: 20 }, { familyId: "strangers", percent: 10 }] });
  assert.deepEqual(cardOf(r, host).bid, { won: false, handicap: 0, pricing: "first", bids: [] });
  assert.deepEqual(await admin.query(internal.testing.auctionOf, { gameId: game.gameId }), {
    pricing: "first",
    bids: [{ godId: ada.subject, familyId: "leapfrog", percent: 30 }, { godId: bo.subject, familyId: "leapfrog", percent: 20 }, { godId: bo.subject, familyId: "strangers", percent: 10 }],
    wins: [{ godId: ada.subject, familyId: "leapfrog", percent: 30, handicap: 30 }, { godId: bo.subject, familyId: "strangers", percent: 10, handicap: 10 }],
    dropped: [],
  });

  // Totals: by game-core's formula on the stored bits, then the handicap by hand: total − h% of its size.
  const roster = r.game.roster.map((m: any) => m.id) as string[];
  const rawTotals = () => {
    const rows = leaderboard(roster, r.objects.map((o: any) => new Map(o.scores.map((s: any) => [s.god, s.netBits]))));
    return roster.map(id => rows.find(row => row.godId === id)!.totalPayoff);
  };
  const net = rawTotals().map((t, i) => t - Math.abs(t) * [0, 30, 10][i] / 100);
  assert.ok(net.some(t => t > 0), "the starting objects score something");
  const logged = r.batches.filter((b: any) => b.totals).at(-1).totals as number[];
  logged.forEach((t, i) => assert.ok(Math.abs(t - net[i]) < 1e-6, `logged total of ${roster[i]}: ${t} vs ${net[i]}`));

  // What each player is told: their own outcome, never another's bid, family or handicap.
  const adaUtility = await ada.c.query(api.player.myUtility, { roomId });
  const seen = {
    observation: await host.c.query(api.player.observation, { roomId }),
    utility: await host.c.query(api.player.myUtility, { roomId }),
    room: await host.c.query(api.rooms.get, { room: roomId }),
    standings: await host.c.query(api.games.standings, { gameId: game.gameId }),
    header: await host.c.query(api.games.header, { code: game.shortCode }),
    state: await host.c.query(api.dock.state, { roomId }),
    totals: await host.c.query(api.player.totals, { gameId: game.gameId }),
    events: await host.c.query(api.player.events, { roomId, after: -1, limit: 50 }),
    history: await host.c.query(api.player.history, { roomId, gameId: game.gameId, afterSeq: -1, limit: 50 }),
    bidding: await mine(host, roomId),
    auction: await host.c.query(api.games.auction, { gameId: game.gameId }),
    roomHistory: await host.c.query(api.rooms.history, { room: roomId }),
  };
  // The repo's disclosure contract (test/disclosure.ts), which knows the other players' bid outcomes from the raw game.
  const check = disclosureChecker(game.gameId, host.subject, [], { live: true });
  for (const [label, result] of Object.entries(seen)) await check(`host's ${label}`, result);
  const hostSees = JSON.stringify(seen);
  assert.ok(!hostSees.includes('"handicaps"'), "the game's handicap list is never projected");
  assert.ok(!hostSees.includes('"handicap":30') && !hostSees.includes('"handicap":10'), "another player's handicap");
  assert.ok(!hostSees.includes('"percent":30') && !hostSees.includes('"percent":20'), "another player's bid");
  assert.ok(!hostSees.includes('"won":true'), "another player's win");
  assert.equal(seen.auction, null, "a private auction tells nothing while the game is live");
  const observation = await ada.c.query(api.player.observation, { roomId });
  assert.equal(observation.self.utility.handicap, 30, "a player's own card says what they pay");
  assert.equal(observation.self.utility.bid.familyId, "leapfrog");
  assert.ok(adaUtility);

  // The end: the final (exact) standings are net of the handicaps, and the ended game's replay tells the whole auction.
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  const final = await raw(game.gameId);
  const finalRaw = (() => {
    const rows = leaderboard(roster, final.objects.map((o: any) => new Map(o.scores.map((s: any) => [s.god, s.netBits]))));
    return roster.map(id => rows.find(row => row.godId === id)!.totalPayoff);
  })();
  const standings = await host.c.query(api.games.standings, { gameId: game.gameId });
  for (const [i, id] of roster.entries()) {
    const row = (standings.rows ?? standings).find((s: any) => (s.godId ?? s.deityId) === id);
    const expected = finalRaw[i] - Math.abs(finalRaw[i]) * [0, 30, 10][i] / 100;
    assert.ok(Math.abs((row.total ?? row.totalPayoff) - expected) < 1e-6, `final standing of ${id}`);
  }
  const told = await host.c.query(api.games.auction, { gameId: game.gameId });
  assert.equal(told.disclosure, "all", "an ended game tells the whole auction");
  assert.deepEqual(told.wins.map((w: any) => [w.godId, w.familyId, w.handicap]), [[ada.subject, "leapfrog", 30], [bo.subject, "strangers", 10]]);
  const replay = JSON.stringify(await host.c.query(api.player.replay, { roomId, gameId: game.gameId, afterSeq: -1, limit: 5 }));
  assert.ok(replay.includes('"handicap":30') && replay.includes('"handicap":10'), "the replay of an ended game shows every handicap");
});

test("equal bids: one of them wins the family, at random, and the other is dealt something else without a handicap", { timeout: 180_000 }, async () => {
  const { host, ada, bo, roomId } = await table("Tie", 300, { bidPricing: "second" });
  const started = await start(host, roomId);
  assert.equal(started.pricing, "second");
  await place(ada, roomId, "opposite_nines", 15);
  await place(bo, roomId, "opposite_nines", 15);
  await place(host, roomId, "mirrormancer", 40);
  for (const g of [ada, bo, host]) await done(g, roomId);
  const game = await startedGame(host, roomId, started);
  const r = await raw(game.gameId);
  const winner = [ada, bo].filter(g => familyOf(r, g) === "opposite_nines");
  assert.equal(winner.length, 1, "exactly one of the tied bidders holds the family");
  const loser = winner[0] === ada ? bo : ada;
  // Second price: the tied winner pays the bid they beat (15); the lone bidder on mirrormancer pays the minimum, 1.
  assert.deepEqual([cardOf(r, winner[0]).bid.percent, cardOf(r, winner[0]).handicap], [15, 15]);
  assert.deepEqual([cardOf(r, host).bid.percent, cardOf(r, host).handicap], [40, 1]);
  assert.deepEqual([cardOf(r, loser).bid.won, cardOf(r, loser).handicap], [false, 0]);
  assert.ok(!["opposite_nines", "mirrormancer"].includes(familyOf(r, loser)));
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});

test("variants: open bidding shows the players each other's bids live; the disclosure setting decides what a live game tells", { timeout: 240_000 }, async () => {
  // Open bids, handicaps disclosed.
  const open = await table("Open", 300, { bidVisibility: "open", bidDisclosure: "handicaps" });
  const [watcher] = await gods("Open Watcher");
  await watcher.c.mutation(api.rooms.join, { room: open.shortCode });
  await watcher.c.mutation(api.rooms.setSpectator, { roomId: open.roomId, spectator: true });
  const started = await start(open.host, open.roomId);
  await place(open.ada, open.roomId, "leapfrog", 25);
  const boSees = await mine(open.bo, open.roomId);
  assert.equal(boSees.visibility, "open");
  assert.deepEqual(boSees.table.find((r: any) => r.godId === open.ada.subject).bids, [{ familyId: "leapfrog", percent: 25 }]);
  assert.equal((await mine(watcher, open.roomId)).table, undefined, "only the players of the phase see the open bids");
  await place(open.bo, open.roomId, "leapfrog", 26);
  for (const g of [open.ada, open.bo, open.host]) await done(g, open.roomId);
  const game = await startedGame(open.host, open.roomId, started);
  const told = await open.host.c.query(api.games.auction, { gameId: game.gameId });
  assert.deepEqual(told, { disclosure: "handicaps", handicaps: open.members.map(m => ({ godId: m.subject, handicap: m === open.bo ? 26 : 0 })) },
    "every handicap, and nothing about who bid what or won which rule");
  await open.host.c.mutation(api.rooms.endActiveGame, { roomId: open.roomId });

  // Sealed bids, the whole auction disclosed once the game is dealt.
  const all = await table("All", 300, { bidDisclosure: "all" });
  const second = await start(all.host, all.roomId);
  await place(all.ada, all.roomId, "two_pair", 8);
  assert.equal((await mine(all.bo, all.roomId)).table, undefined, "sealed: no table of bids");
  for (const g of [all.ada, all.bo, all.host]) await done(g, all.roomId);
  const dealt = await startedGame(all.host, all.roomId, second);
  const whole = await all.bo.c.query(api.games.auction, { gameId: dealt.gameId });
  assert.equal(whole.disclosure, "all");
  assert.deepEqual(whole.wins, [{ godId: all.ada.subject, familyId: "two_pair", percent: 8, handicap: 8 }]);
  assert.deepEqual(whole.bids, [{ godId: all.ada.subject, familyId: "two_pair", percent: 8 }]);
  await all.host.c.mutation(api.rooms.endActiveGame, { roomId: all.roomId });
});

test("once the deal has begun no bid is taken: a late change is refused, not silently dropped", { timeout: 120_000 }, async () => {
  const { host, ada, bo, roomId } = await table("Closed", 300);
  const started = await start(host, roomId);
  await place(ada, roomId, "leapfrog", 9);
  // The deal's first step, as the engine runs it when the phase ends (here before anyone is done: it waits).
  const early = await admin.mutation(internal.bidding.takeForDeal, { roomId, requestId: (await raw_bidding(host, roomId)) });
  assert.equal(early.state, "wait", "nobody is done and the deadline is far: the bidding stays open");
  assert.equal((await place(bo, roomId, "two_pair", 4)).done, false);
  for (const g of [ada, bo, host]) await done(g, roomId);
  // The last "done" started the deal: from then on a change of mind is refused with the reason (or the phase is over).
  const late = await rejects(place(ada, roomId, "leapfrog", 50));
  assert.match(late, /Bidding has ended|No bidding is open/);
  const game = await startedGame(host, roomId, started);
  const r = await raw(game.gameId);
  assert.equal(cardOf(r, ada).handicap, 9, "the deal was made from the bids as they stood");
  assert.equal(cardOf(r, bo).handicap, 4);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});

test("the deadline ends the phase when nobody finishes; a spectator cannot bid", { timeout: 120_000 }, async () => {
  const { host, ada, bo, roomId, shortCode } = await table("Deadline", 3);
  const [watcher] = await gods("Deadline Watcher");
  await watcher.c.mutation(api.rooms.join, { room: shortCode });
  await watcher.c.mutation(api.rooms.setSpectator, { roomId, spectator: true });
  const started = await start(host, roomId);
  assert.equal(started.players, 3);
  const watching = await mine(watcher, roomId);
  assert.deepEqual([watching.seated, watching.bids], [false, []]);
  assert.match(await rejects(place(watcher, roomId, "leapfrog", 5)), /Only the players/);
  await place(ada, roomId, "leapfrog", 7);
  const game = await startedGame(host, roomId, started, 60_000);
  const r = await raw(game.gameId);
  assert.ok(r.game.createdAt >= started.endsAt, "the game is dealt after the deadline, not before");
  assert.equal(familyOf(r, ada), "leapfrog");
  assert.equal(cardOf(r, ada).handicap, 7);
  assert.ok(familyOf(r, bo) !== "leapfrog" && familyOf(r, host) !== "leapfrog");
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});

test("a player who leaves during bidding is not dealt in and their bid is dropped; below three players the start fails and says so", { timeout: 180_000 }, async () => {
  const four = await table("Leave", 300, {}, ["Cy"]);
  const cy = four.members[3];
  const started = await start(four.host, four.roomId);
  assert.equal(started.players, 4);
  await place(cy, four.roomId, "leapfrog", 50);
  await place(four.ada, four.roomId, "leapfrog", 5);
  await cy.c.mutation(api.rooms.leave, { roomId: four.roomId });
  for (const g of [four.ada, four.bo, four.host]) await done(g, four.roomId);
  const game = await startedGame(four.host, four.roomId, started);
  const r = await raw(game.gameId);
  assert.equal(r.deities.length, 3);
  assert.equal(familyOf(r, four.ada), "leapfrog");
  assert.deepEqual(r.game.handicaps, [0, 5, 0]);
  await four.host.c.mutation(api.rooms.endActiveGame, { roomId: four.roomId });

  const three = await table("Short", 300);
  await start(three.host, three.roomId);
  await three.bo.c.mutation(api.rooms.leave, { roomId: three.roomId });
  await done(three.ada, three.roomId);
  await done(three.host, three.roomId);
  const failed = await waitFor(async () => (await three.host.c.query(api.rooms.get, { room: three.roomId })).bidding?.error, "the start reports the short table", 30_000);
  assert.match(failed, /fewer than three/);
  assert.equal(await mine(three.ada, three.roomId), null, "a failed bid phase is not open");
  // The failure stays on the room only until the next start: a start without a bid phase clears it with the rest.
  const [late] = await gods("Short Late");
  await late.c.mutation(api.rooms.join, { room: three.shortCode });
  const now = await three.host.c.query(api.rooms.get, { room: three.roomId });
  await three.host.c.action(api.owner.settings, { roomId: three.roomId, revision: now.revision, settings: { bidSeconds: 0 } });
  const after = await startGame(three.host, three.roomId);
  assert.equal((await three.host.c.query(api.rooms.get, { room: three.roomId })).bidding, null, "the old failure is gone once a game starts");
  assert.deepEqual(await three.host.c.mutation(api.rooms.endActiveGame, { roomId: three.roomId }), { gameId: after.gameId });
});

test("the owner cancels a bid phase with the end command; the next start opens a fresh one with no old bids", { timeout: 120_000 }, async () => {
  const { host, ada, bo, roomId } = await table("Cancel", 300);
  await start(host, roomId);
  await place(ada, roomId, "leapfrog", 33);
  assert.match(await rejects(ada.c.mutation(api.rooms.endActiveGame, { roomId })), /owner/i);
  assert.deepEqual(await host.c.mutation(api.rooms.endActiveGame, { roomId }), { cancelled: "bidding" });
  assert.equal((await host.c.query(api.rooms.get, { room: roomId })).bidding, null);
  const again = await start(host, roomId);
  assert.equal(again.status, "bidding");
  assert.deepEqual((await mine(ada, roomId)).bids, []);
  for (const g of [ada, bo, host]) await done(g, roomId);
  const game = await startedGame(host, roomId, again);
  assert.equal((await raw(game.gameId)).game.handicaps, undefined);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});

test("a setup without a bid phase starts exactly as before: no bid phase, no trace", { timeout: 120_000 }, async () => {
  const { host, ada, roomId } = await table("Off", 0);
  const started = await start(host, roomId);
  assert.ok(started.gameId || started.status === "preparing", "a game (or its table preparation), never a bid phase");
  assert.equal((await ada.c.query(api.rooms.get, { room: roomId })).bidding, null);
  const game = await startedGame(host, roomId, started);
  const r = await raw(game.gameId);
  assert.equal(r.game.handicaps, undefined);
  assert.ok(r.deities.every((d: any) => !("bid" in d.card)));
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});
