/**
 * Paid observation (docs/energy-model.md §11, convex/lib/knowledge.ts): in a game whose setup sets observation "paid", a
 * seated god sees each object as it was last TOLD it (at its birth, by its agents' changes and complete reads, or by a
 * look it paid for from its own energy), never the live world; the free tier is the published scoreboard and each
 * object's existence and activity. A free game is unchanged (game-disclosure and the other suites).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { observationSchema } from "@workspace/player-client";
import { admin, api, envelope, gods, internal, raw, rejects, roomWith, startGame, touch, waitFor } from "./game-helpers.ts";
import { disclosureChecker } from "./disclosure.ts";

test("paid observation: a god sees what it was told, and pays its own energy to look", { timeout: 240000 }, async () => {
  const [host, ada, bo] = await gods("Paid Host", "Paid Ada", "Paid Bo");
  await touch(host);
  const settings = {
    languages: ["typescript"], objectType: "Grid", typeArgs: { size: 5, symbols: "base10", colours: "rgby" },
    startingObjectCount: 12, spawnRateHz: 0.2, planningSeconds: 3600, powerPerSecond: 200, interactionRateHz: 40, startingEnergy: 1000,
    observation: "paid",
  };
  const { roomId } = await roomWith([host, ada, bo], settings);
  const game = await startGame(host, roomId);
  const send = (god: typeof ada, command: Record<string, unknown>) => god.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
  const ok = (r: any) => { assert.equal(r.accepted, true, r.message); return r; };
  const rowOf = (god: typeof ada, objectId: string) => god.c.query(api.player.object, { objectId });

  // Planning: every object's birth is free. Each god is told the whole starting world, at world time 0.
  const start = observationSchema.parse(await host.c.query(api.player.observation, { roomId }));
  assert.equal(start.economy?.observation, "paid");
  const price = start.economy!.lookPrice!;
  assert.ok(Math.abs(price - 25 * (Math.log2(10) + Math.log2(4)) / 32) < 1e-9, `one look costs the board's full read at the read price (${price})`);
  assert.equal(start.objects.length, 12, "the starting world is known");
  assert.ok(start.objects.every(o => o.knownAt === 0), "each object is known as of its birth");

  // Before the world runs a look buys nothing, and is refused.
  assert.match((await send(host, { type: "look" })).message, /has not started/);

  // Host's agent changes objects without reading them; Bo's too; Ada's observer reads the whole object and changes nothing.
  ok(await send(host, { type: "summon", name: "Host slider", language: "typescript", source: "function agent(grid) { return [slide(row(1), 2)]; }" }));
  ok(await send(bo, { type: "summon", name: "Bo slider", language: "typescript", source: "function agent(grid) { return [slide(column(0), 1)]; }" }));
  ok(await send(ada, { type: "summon", name: "Ada observer", language: "typescript", source: "function agent(grid) { String(grid); return []; }" }));
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3517.8173 }, kick: true });

  // An object Bo's agent changed and Host's never did: Host still holds it as it was born.
  const untouched = await waitFor(async () => {
    const r = await raw(game.gameId);
    const events = r.batches.flatMap((b: any) => b.events);
    const mine = new Set(events.filter((e: any) => e.t === "transform" && e.ownerId === host.subject).map((e: any) => e.objectId));
    const born = new Map<string, any>(events.filter((e: any) => e.t === "spawn").map((e: any) => [e.objectId, e]));
    const theirs = events.find((e: any) => e.t === "transform" && e.ownerId === bo.subject && !mine.has(e.objectId) && born.get(e.objectId)?.world === 0);
    return theirs && mine.size > 0 && { id: theirs.objectId as string, born: born.get(theirs.objectId) as any };
  }, "Bo changed an object Host's agent has not", 90000);
  const stale = await rowOf(host, untouched.id);
  const now = (await raw(game.gameId)).objects.find((o: any) => o._id === untouched.id);
  // (Host's agent may reach it between the two reads: then the row is newer, and told.)
  if (stale.version === 0) {
    assert.equal(stale.value, untouched.born.value, "the row is the object as Host was last told it: its birth");
    assert.equal(stale.knownAt, 0);
    assert.ok(stale.changesSince > 0 && stale.mutations === stale.version + stale.changesSince, "that it has changed since, and how often, is public");
    assert.notEqual(stale.value, now.value, "what it changed to is not shown");
  }

  // Host's own agents' changes tell Host the object; Ada's observer's complete reads tell Ada.
  await waitFor(async () => {
    const r = await raw(game.gameId);
    const last = [...r.objectEvents].reverse().find((e: any) => e.ownerId === host.subject);
    if (!last) return false;
    const row = await rowOf(host, last.objectId);
    return row.version >= last.version && row.knownAt > 0;
  }, "Host's agent's change refreshed Host's view", 30000);
  await waitFor(async () => {
    const r = await raw(game.gameId);
    const seen = r.batches.flatMap((b: any) => b.events).filter((e: any) => e.t === "skip" && e.ownerId === ada.subject).map((e: any) => e.objectId);
    for (const id of new Set<string>(seen)) {
      const row = await rowOf(ada, id);
      if (row.knownAt > 0 && row.version > 0) return true;   // told a changed object by reading it, not by changing it
    }
    return false;
  }, "Ada's observer's complete read refreshed Ada's view of a changed object", 60000);

  // Nothing a seated god can call shows the live world: the log is births and its own agents' acts; the spectator
  // queries and the past board give a seated god nothing.
  const events = await host.c.query(api.player.events, { roomId, after: -1, limit: 50 });
  assert.ok(events.events.some((e: any) => e.type === "object.transformed" && e.mine), "own transformations are told");
  assert.ok(!events.events.some((e: any) => e.type === "object.transformed" && !e.mine), "others' transformations are not");
  const history = await host.c.query(api.player.history, { roomId, gameId: game.gameId, afterSeq: -1, limit: 50 });
  assert.ok(!history.events.some((e: any) => e.type === "object.transformed" && !e.mine));
  // The utility series is the god's knowledge over time: one row per telling. Of the object only Bo changed, its birth.
  const seriesOf = (god: typeof ada, objectId: string) => god.c.query(api.player.series, { roomId, objectId, limit: 40 });
  if (stale.version === 0) {
    const known = await seriesOf(host, untouched.id);
    assert.deepEqual([known.columns.version, known.columns.value, known.columns.world], [[0], [untouched.born.value], [0]], "Host's series of it is its birth alone");
  }
  const trajectories = await host.c.query(api.player.trajectories, { roomId, afterSeq: -1, limit: 200 });
  const versions = new Map((await raw(game.gameId)).objectEvents.filter((e: any) => e.kind === "spawn" || e.ownerId === host.subject).map((e: any) => [`${e.objectId}:${e.world}`, true]));
  for (const o of trajectories.objects) for (const p of o.points) assert.ok(versions.has(`${o.objectId}:${p.worldSeconds}`), "a trajectory point is a birth or an own change");
  // No board at a chosen world time, past, present or future: the answer never depends on where the clock stands.
  const clock = (await raw(game.gameId)).game.worldSeconds;
  for (const world of [0, 0.5, clock, clock + 0.001, clock + 3600, 1e9]) {
    assert.match(await rejects(host.c.query(api.player.board, { roomId, world })), /charges for looking/, `a board at world ${world} is refused`);
  }
  // The board without a time is Host's knowledge, row for row (the object only Bo changed: as Host was last told it).
  const knownBoard = await host.c.query(api.player.board, { roomId });
  for (const o of knownBoard.objects.slice(0, 20)) {
    const row = await rowOf(host, o.objectId);
    if (row.knownAt === o.knownAt) assert.deepEqual([o.value, o.version, o.others], [row.value, row.version, row.peerNetBits], "the board is the knowledge");
  }
  if (stale.version === 0) {
    const seen = knownBoard.objects.find((o: any) => o.objectId === untouched.id);
    if (seen.knownAt === 0) assert.equal(seen.value, untouched.born.value, "the board shows the object as born, not as Bo left it");
  }
  // Every other read keyed by a time or a position the caller supplies gives the same told history, wherever it starts.
  const latest = (await raw(game.gameId)).batches.at(-1).seq;
  const theirs = (events: any[]) => events.some((e: any) => e.type === "object.transformed" && !e.mine);
  for (const after of [-1, 0, Math.max(0, latest - 3), latest, latest + 1000]) {
    assert.ok(!theirs((await host.c.query(api.player.events, { roomId, after, limit: 50 })).events), `events after ${after}`);
    assert.ok(!theirs((await host.c.query(api.player.history, { roomId, gameId: game.gameId, afterSeq: after, limit: 50 })).events), `history after ${after}`);
  }
  const toldKeys = new Set((await raw(game.gameId)).objectEvents.filter((e: any) => e.kind === "spawn" || e.ownerId === host.subject).map((e: any) => `${e.objectId}:${e.world}`));
  for (const window of [{ afterSeq: -1, upTo: latest }, { afterSeq: Math.max(0, latest - 5) }, { afterSeq: -1, upTo: 0 }, { afterSeq: latest + 1000 }]) {
    const t = await host.c.query(api.player.trajectories, { roomId, limit: 200, ...window });
    for (const o of t.objects) for (const p of o.points) assert.ok(toldKeys.has(`${o.objectId}:${p.worldSeconds}`), `trajectories ${JSON.stringify(window)}`);
  }
  for (const fromWorld of [0, clock / 2, clock, clock + 3600]) {
    const s = await host.c.query(api.player.series, { roomId, fromWorld, limit: 40 });
    for (let i = 0; i < s.rows; i++) {
      const row = await rowOf(host, s.columns.objectId[i]);
      assert.ok(s.columns.version[i] <= row.version, `series from ${fromWorld}: no version newer than Host was told`);
    }
  }
  assert.match(await rejects(host.c.query(api.player.replay, { roomId, gameId: game.gameId })), /CONFLICT|ends/, "no replay of a live game");
  assert.equal(await host.c.query(api.games.object, { objectId: untouched.id }), null, "the public object is not for a seated god");
  assert.equal((await host.c.query(api.games.objectIds, { gameId: game.gameId, paginationOpts: { numItems: 50, cursor: null } })).page.length, 0);
  assert.equal((await host.c.query(api.player.game, { roomId, gameId: game.gameId })).objects.length, 0);
  // The whole-world observation (AI seats, stored panels) is the god's knowledge too.
  const world = observationSchema.parse(await host.c.query(api.player.observation, { roomId }));
  assert.ok(world.objects.length >= 12 && world.objects.every(o => o.knownAt !== undefined));
  // The own score moves with the published scoreboard only.
  const dock = await host.c.query(api.dock.state, { roomId });
  const board = await host.c.query(api.games.standings, { gameId: game.gameId });
  const totals = await host.c.query(api.player.totals, { gameId: game.gameId });
  assert.ok(totals.world <= board.world + 1e-9, "the god's totals are no newer than the scoreboard");
  assert.equal(dock.self.score, totals.score);

  // Why to look: how many objects have changed since Host was told them (public activity, counted on Host's own rows).
  const staleBefore = await waitFor(async () => { const n = await host.c.query(api.player.staleCount, { gameId: game.gameId }); return n.count > 0 && n; }, "Host has stale objects");

  // A look: Host pays its own energy and is told the object as it is now.
  const before = (await raw(game.gameId)).deities.find((d: any) => d.godId === host.subject);
  const looked = ok(await send(host, { type: "look", objectId: untouched.id }));
  assert.equal(looked.look.price, price);
  const after = await raw(game.gameId);
  const paid = after.deities.find((d: any) => d.godId === host.subject);
  assert.ok(Math.abs(paid.spent - before.spent - price) < 1e-9, "the look is charged to the god's own account");
  const fresh = await waitFor(async () => { const row = await rowOf(host, untouched.id); return row.knownAt > 0 && row.version > 0 && row; }, "the look refreshed the row");
  assert.ok(fresh.version >= looked.look.object.version);
  // What the look told is a row of Host's series: the object then, with the others' sum as disclosed (the data of the
  // rival inference). Ada, who did not look, has no such row unless her observer read it.
  const told = await seriesOf(host, untouched.id);
  const at = told.columns.version.lastIndexOf(fresh.version);
  assert.ok(at > 0 && told.columns.value[at] === fresh.value && told.columns.others[at] === fresh.peerNetBits && told.columns.world[at] === fresh.knownAt, "the look is in the looker's series");
  const whole = await host.c.query(api.player.series, { roomId, limit: 40 });
  assert.ok(whole.rows >= 12 && whole.columns.world.every((w: number, i: number) => i === 0 || w >= whole.columns.world[i - 1]), "the series is in the order it was learned");
  // The look is in the god's own log, and nobody else's.
  const mineLog = await host.c.query(api.player.events, { roomId });
  const adaLog = await ada.c.query(api.player.events, { roomId, after: -1, limit: 50 });
  assert.ok(mineLog.events.some((e: any) => e.type === "god.looked" && e.objectId === untouched.id && e.price === price));
  assert.ok(!adaLog.events.some((e: any) => e.type === "god.looked"), "a god's looks are private while the game is live");

  assert.ok(staleBefore.count >= 1 && !staleBefore.more);
  assert.equal((await ada.c.query(api.player.staleCount, { gameId: game.gameId })).count >= 0, true);
  // Unaffordable: refused, with the price and the balance; nothing is charged.
  ok(await send(bo, { type: "allocatePower", agentId: (await bo.c.query(api.dock.agents, { roomId }))[0].id, share: 1 }));   // no own income
  await admin.mutation(internal.testing.setGodEnergy, { gameId: game.gameId, godId: bo.subject, balance: 0 });
  const refused = await send(bo, { type: "look", objectId: untouched.id });
  assert.equal(refused.accepted, false);
  assert.match(refused.message, /costs \d+\.\d\d and you have \d+\.\d\d/);
  assert.match(refused.message, /keep some power for yourself to look/, "a god whose power is all with its agents is told why it cannot look");
  // A look at everything: the price times the object count, then every row is as of the look.
  const all = ok(await send(ada, { type: "look" }));
  assert.ok(Math.abs(all.look.price - price * all.look.looked) < 1e-9 && all.look.looked >= 12);
  await waitFor(async () => {
    const page = await ada.c.query(api.player.objectsPage, { roomId, sort: "newest", limit: 90 });
    return page.rows.filter((r: any) => r.knownAt >= all.look.worldSeconds - 1e-9).length >= all.look.looked;
  }, "every row is as of the look", 30000);

  // The disclosure contract holds for everything Ada can read (and Ada's knowledge holds nobody's private data).
  const check = disclosureChecker(game.gameId, ada.subject, [], { live: true });
  const page = await ada.c.query(api.player.objectsPage, { roomId, sort: "payoff", limit: 90 });
  for (const [label, result] of Object.entries({ observation: await ada.c.query(api.player.observation, { roomId }), adaLog, page,
    series: await ada.c.query(api.player.series, { roomId, limit: 40 }), board: await ada.c.query(api.player.board, { roomId }) })) await check(`paid live ${label}`, result);

  // Ended: everything is open and exact, as in a free game.
  await admin.mutation(internal.testing.endGames, { gameIds: [game.gameId] });
  await waitFor(async () => {
    const row = await rowOf(host, untouched.id);
    const o = (await raw(game.gameId)).objects.find((x: any) => x._id === untouched.id);
    return row.knownAt === undefined && row.value === o.value;
  }, "the ended game's rows are the objects as they are", 30000);
  const ended = await host.c.query(api.player.events, { roomId, gameId: game.gameId, after: -1, limit: 50 });
  assert.ok(ended.events.some((e: any) => e.type === "object.transformed" && !e.mine), "the ended game's log is whole");
});

test("observation modes: boards keeps every board live and ages only the others' interest; agents allows no paid look", { timeout: 240000 }, async () => {
  const [host, ada, bo] = await gods("Modes Host", "Modes Ada", "Modes Bo");
  await touch(host);
  const base = {
    languages: ["typescript"], objectType: "Grid", typeArgs: { size: 5, symbols: "base10", colours: "rgby" },
    startingObjectCount: 8, spawnRateHz: 0, planningSeconds: 3600, powerPerSecond: 200, interactionRateHz: 40, startingEnergy: 1000,
  };
  const play = async (observation: string) => {
    const { roomId } = await roomWith([host, ada, bo], { ...base, observation });
    const game = await startGame(host, roomId);
    const send = (god: typeof ada, command: Record<string, unknown>) => god.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
    const summoned = await send(bo, { type: "summon", name: "Bo slider", language: "typescript", source: "function agent(grid) { return [slide(column(0), 1)]; }" });
    assert.equal(summoned.accepted, true, summoned.message);
    await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3517.8173 }, kick: true });
    const changed = await waitFor(async () => (await raw(game.gameId)).objects.find((o: any) => o.version > 0), "Bo changed an object", 90000);
    return { roomId, game, send, changed };
  };

  // boards: Host, told nothing since the births, sees the board as it is, the others' interest as at its birth.
  const boards = await play("boards");
  const born = (await host.c.query(api.player.series, { roomId: boards.roomId, objectId: boards.changed._id, limit: 5 })).columns;
  const row = await waitFor(async () => {
    const r = await host.c.query(api.player.object, { objectId: boards.changed._id });
    const o = (await raw(boards.game.gameId)).objects.find((x: any) => x._id === boards.changed._id);
    return r.value === o.value && r.changesSince > 0 && r;
  }, "the board is live for a god who was not told", 30000);
  assert.equal(row.knownAt, 0, "the others' interest is as of the birth");
  assert.equal(row.peerNetBits, born.others[0], "and is the number told then, not the one now");
  assert.equal((await host.c.query(api.dock.state, { roomId: boards.roomId })).economy.observation, "boards");
  assert.ok((await host.c.query(api.player.staleCount, { gameId: boards.game.gameId })).count >= 1);
  const looked = await boards.send(host, { type: "look", objectId: boards.changed._id });
  assert.equal(looked.accepted, true, looked.message);
  await waitFor(async () => { const r = await host.c.query(api.player.object, { objectId: boards.changed._id }); return r.knownAt > 0 && r.peerNetBits === looked.look.object.peerNetBits || r.version > looked.look.object.version; }, "a look tells the others' interest", 30000);
  const log = await host.c.query(api.player.events, { roomId: boards.roomId, after: -1, limit: 50 });
  assert.ok(!log.events.some((e: any) => e.type === "object.transformed" && !e.mine), "the history is paid in boards mode too");
  await admin.mutation(internal.testing.endGames, { gameIds: [boards.game.gameId] });

  // agents: as paid, and a god cannot pay to look.
  const agents = await play("agents");
  const dock = await host.c.query(api.dock.state, { roomId: agents.roomId });
  assert.equal(dock.economy.observation, "agents");
  assert.equal(dock.economy.lookPrice, undefined, "no look is offered, so none is priced");
  const refused = await agents.send(host, { type: "look", objectId: agents.changed._id });
  assert.equal(refused.accepted, false);
  assert.match(refused.message, /cannot look in this game/);
  const unseen = await host.c.query(api.player.object, { objectId: agents.changed._id });
  assert.ok(unseen.version === 0 && unseen.changesSince > 0, "the row is the birth, and says it has changed");
});
