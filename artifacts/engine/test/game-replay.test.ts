/**
 * The replay of an ended game (docs/replay-design.md §2–§3): the event log is complete, and the replay is fully
 * transparent once the game has ended and closed while it is live. A game is played (summons, chat in planning and
 * while running, a destroy, a pause, an owner end); the engine's raw state is captured at four moments. While the game
 * runs, player.replay refuses. After the end, every seated player gets the same full replay, and any one of them,
 * cut at a snapshot's last batch, rebuilds the WHOLE raw state there through the public reducer
 * (lib/player-client replay.ts): every object's value, version and every god's net bits; every agent with its owner,
 * source, acts, spending and energy account (destroyed ones as destroyed); every god's summon spending and exact
 * total; the phase. The first page reveals every god's dealt utility and the end deadline; every act carries its seed.
 *
 * What would break: a state change written without a log event (a summon or destroy, a charge, a spawn), events
 * logged out of commit order, a replay served while the game is live, something hidden from an ended game's replay,
 * a replay served to a room member who neither played nor owns the room.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildReplay, stateAt, type ReplayPage } from "@workspace/player-client/replay";
import { admin, api, envelope, gods, internal, raw, rejects, roomWith, startGame, touch, TS, waitFor } from "./game-helpers.ts";

const settings = {
  language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", objectType: "Int",
  typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 6, spawnRateHz: 1, interactionRateHz: 20, planningSeconds: 3600,
  halfLifeSeconds: 1e9, agentEnergyPerSecond: 100, startingEnergy: 1000,
};
const close = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)), `${what}: ${a} vs ${b}`);

test("an ended game's replay, cut at any snapshot, rebuilds the whole engine state exactly; a live game's replay is refused", { timeout: 240_000 }, async () => {
  const [host, ada, bo, late] = await gods("Replay Host", "Replay Ada", "Replay Bo", "Replay Late");
  await touch(host);
  const { roomId, shortCode } = await roomWith([host, ada, bo], settings);
  const game = await startGame(host, roomId);
  const send = (god: typeof ada, command: Record<string, unknown>) => god.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
  const ok = async (p: Promise<any>) => { const r = await p; assert.equal(r.accepted, true, r.message); return r; };
  const SECRET_BO = "bo_replay_marker";
  await ok(send(ada, { type: "summon", language: "typescript", source: TS.Int }));
  await ok(send(ada, { type: "summon", language: "typescript", source: "function agent(x) { return [add(2)]; }" }));
  const doomed = { id: (await raw(game.gameId)).agents.find((a: any) => a.source.includes("add(2)"))._id as string };
  await ok(send(bo, { type: "summon", language: "typescript", source: `function agent(x) { const ${SECRET_BO} = 3; return [add(${SECRET_BO})]; }` }));
  await ok(send(host, { type: "summon", language: "typescript", source: "function agent(x) { return [add(-1)]; }" }));
  await ok(send(ada, { type: "chat", text: "planning-chat" }));
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3517.8173 }, kick: true });
  // Live: nothing is revealed, to anyone.
  for (const god of [host, ada]) assert.match(await rejects(god.c.query(api.player.replay, { roomId, gameId: game.gameId })), /opens when the game ends/);
  assert.equal((await ada.c.query(api.games.resolve, { code: game.shortCode })).ended, false, "the client plays a live game on the room's screen");

  const transforms = async (n: number) => (await raw(game.gameId)).batches.flatMap((b: any) => b.events).filter((e: any) => e.t === "transform").length >= n;
  const snapshots: any[] = [];
  await waitFor(() => transforms(10), "first transformations", 60_000);
  snapshots.push(await raw(game.gameId));
  await ok(send(bo, { type: "chat", text: "running-chat" }));
  await ok(send(ada, { type: "destroy", agentId: doomed.id }));
  await ok(send(bo, { type: "pause" }));
  snapshots.push(await raw(game.gameId));
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { pauseEndsAt: Date.now() }, kick: true });
  const before = snapshots[0].batches.flatMap((b: any) => b.events).filter((e: any) => e.t === "transform").length;
  await waitFor(() => transforms(before + 20), "transformations after the pause", 60_000);
  snapshots.push(await raw(game.gameId));
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  snapshots.push(await raw(game.gameId));

  // Every page of each god's replay (the log is append-only, so one fetch after the end serves every snapshot).
  const pagesOf = async (god: typeof ada) => {
    const pages: ReplayPage[] = [];
    // Small pages, so big batches are split across pages too (eventOffset).
    for (let cursor: { afterSeq: number; chatAfter: number; eventOffset?: number } | undefined; ;) {
      const page: ReplayPage = await god.c.query(api.player.replay, { roomId, gameId: game.gameId, limit: 7, maxEvents: 9, maxChat: 1, ...cursor });
      pages.push(page);
      if (page.done) return pages;
      assert.ok(page.nextCursor > (cursor?.afterSeq ?? -1) || (page.eventOffset ?? 0) > (cursor?.eventOffset ?? 0), "the cursor advances");
      cursor = { afterSeq: page.nextCursor, chatAfter: page.chatCursor, ...(page.eventOffset !== undefined ? { eventOffset: page.eventOffset } : {}) };
    }
  };
  assert.equal((await ada.c.query(api.games.resolve, { code: game.shortCode })).ended, true, "the client opens an ended game as its replay");
  const final = snapshots.at(-1);
  assert.ok(final.batches.every((b: any) => b.schema === 3), "every batch carries the event schema");
  const roster: string[] = final.game.roster.map((m: any) => m.id);
  const [hostPages, adaPages, boPages] = [await pagesOf(host), await pagesOf(ada), await pagesOf(bo)];
  const strip = (pages: ReplayPage[]) => pages.map(p => ({ ...p, viewer: undefined }));
  assert.deepEqual(strip(adaPages), strip(hostPages), "every player gets the same full replay");
  assert.deepEqual(strip(boPages), strip(hostPages));
  assert.deepEqual([adaPages[0].viewer.godId, adaPages[0].viewer.index], [ada.subject, roster.indexOf(ada.subject)]);
  const pages = adaPages;
  assert.ok(pages.length > 1, "the replay pages");
  assert.ok(pages.some(p => p.eventOffset !== undefined), "a batch larger than a page is split across pages");
  assert.equal(pages[0].game.logSchema, 3);
  // Fully revealed: every god's dealt utility and card, the end deadline, every agent's source (Bo's marker too), every act's seed.
  assert.equal(pages[0].game.endAtWorld, final.game.endAtWorld);
  assert.deepEqual(pages[0].gods!.map(g => [g.godId, g.utility, g.card]), [...final.deities].sort((a: any, b: any) => a.index - b.index).map((d: any) => [d.godId, d.utility, d.card]));
  const events = pages.flatMap(p => p.batches.flatMap(b => b.events));
  assert.ok(events.some(e => e.type === "agent.summoned" && e.ownerId === bo.subject && e.source.includes(SECRET_BO)), "Bo's agent's code");
  assert.ok(events.filter(e => e.type === "object.transformed" || e.type === "agent.failed").every(e => /^\d+$/.test((e as any).seed)), "every act's seed");
  for (const [n, snap] of snapshots.entries()) {
    const label = `snapshot ${n}`;
    const lastSeq = Math.max(...snap.batches.map((b: any) => b.seq));
    const replay = buildReplay(pages.map(p => ({ ...p, batches: p.batches.filter(b => b.seq <= lastSeq) })));
    const state = stateAt(replay, replay.log.length);
    // Objects: values, versions and every god's net bits, from the private scores.
    assert.deepEqual([...state.objects.keys()].sort(), snap.objects.map((o: any) => o._id).sort(), `${label}: the same objects`);
    for (const o of snap.objects) {
      const r = state.objects.get(o._id)!;
      assert.deepEqual([r.value, r.version], [o.value, o.version], `${label}: object ${o._id}`);
      roster.forEach((id, i) => close(r.net[i], o.scores.find((s: any) => s.god === id).netBits, `${label}: ${id}'s bits on ${o._id}`));
    }
    // Agents: every live one exactly as stored (owner, source, acts, spending, account); destroyed ones as destroyed.
    assert.deepEqual([...state.agents.values()].filter(a => a.alive).map(a => a.id).sort(), snap.agents.map((a: any) => a._id).sort(), `${label}: live agents`);
    for (const a of snap.agents) {
      const r = state.agents.get(a._id)!;
      assert.deepEqual([r.ownerId, r.source, r.acts, r.account], [a.ownerId, a.source, a.acts, a.account], `${label}: agent ${a._id}`);
      close(r.spent, a.spent, `${label}: agent spending`);
    }
    roster.forEach((id, i) => {
      assert.equal(state.spent[i], snap.deities.find((d: any) => d.godId === id).spent, `${label}: ${id}'s summon spending`);
      const total = snap.objects.reduce((x: number, o: any) => {
        const own = o.scores.find((s: any) => s.god === id).netBits;
        return x + own * Math.max(0, o.scores.filter((s: any) => s.god !== id).reduce((y: number, s: any) => y + s.netBits, 0));
      }, 0);
      close(state.totals[i], total, `${label}: ${id}'s total`);
    });
    assert.equal(state.phase, snap.game.phase, `${label}: phase`);
  }
  const all = stateAt(buildReplay(pages), Infinity);
  assert.deepEqual([all.agents.get(doomed.id)!.ownerId, all.agents.get(doomed.id)!.alive], [ada.subject, false], "the destroyed agent, attributed");
  // Chat with world stamps, each message once across pages: the planning message at 0, the running one later.
  const chat = buildReplay(pages).chat;
  assert.deepEqual(chat.map(m => m.text), ["planning-chat", "running-chat"]);
  assert.equal(chat[0].world, 0);
  assert.ok(chat[1].world > 0);

  // Room members who were not seated in the game get no replay.
  await late.c.mutation(api.rooms.join, { room: shortCode });
  assert.match(await rejects(late.c.query(api.player.replay, { roomId, gameId: game.gameId })), /Only the gods who played in it and the room owner/);
});
