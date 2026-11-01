/**
 * The event log is complete (docs/replay-design.md §2): a game is played (summons, chat, a pause, a destroy, spawns and
 * transformations, an owner end), the engine's raw state is captured at several moments, and each seated god's
 * replay (player.replay pages through the public reducer in lib/player-client replay.ts), cut at the snapshot's last
 * batch, must rebuild exactly that god's view of the raw state: every object's value and version, its own net bits,
 * the peer aggregate and payoff, its own agents (destroyed ones too) with acts, spending and energy accounts, its
 * summon spending, the phase and the leaderboard. Union over the three gods, that is every agent and every score.
 *
 * What would break: a state change written without a log event (a summon or destroy, a charge, a spawn), events
 * logged out of commit order, a projection that drops an event a reducer needs, totals that are not the leaderboard,
 * a replay served to a room member who was not seated.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildReplay, stateAt, type ReplayPage } from "@workspace/player-client/replay";
import { admin, api, envelope, gods, internal, raw, rejects, roomWith, startGame, touch, TS, waitFor } from "./game-helpers.ts";
import { disclosureChecker } from "./disclosure.ts";

const settings = {
  language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", objectType: "Int",
  typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 6, spawnRateHz: 1, interactionRateHz: 20, planningSeconds: 3600,
  halfLifeSeconds: 1e9, agentEnergyPerSecond: 100, startingEnergy: 1000,
};
const close = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)), `${what}: ${a} vs ${b}`);

test("each player's replay, cut at any snapshot, rebuilds that player's view of the engine's state exactly", { timeout: 240_000 }, async () => {
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
    for (let cursor: { afterSeq: number; chatAfter: number } | undefined; ;) {
      const page: ReplayPage = await god.c.query(api.player.replay, { roomId, gameId: game.gameId, limit: 7, ...cursor });
      pages.push(page);
      if (page.done) return pages;
      assert.ok(page.nextCursor > (cursor?.afterSeq ?? -1), "the cursor advances");
      cursor = { afterSeq: page.nextCursor, chatAfter: page.chatCursor };
    }
  };
  const final = snapshots.at(-1);
  assert.ok(final.batches.every((b: any) => b.schema === 2), "every batch carries the event schema");
  const roster: string[] = final.game.roster.map((m: any) => m.id);
  for (const god of [host, ada, bo]) {
    const pages = await pagesOf(god);
    assert.ok(pages.length > 1, "the replay pages");
    assert.equal(pages[0].game.logSchema, 2);
    const index = roster.indexOf(god.subject);
    for (const [n, snap] of snapshots.entries()) {
      const label = `${god.name} at snapshot ${n}`;
      const lastSeq = Math.max(...snap.batches.map((b: any) => b.seq));
      const cut = pages.map(p => ({ ...p, batches: p.batches.filter(b => b.seq <= lastSeq) }));
      const replay = buildReplay(cut);
      const state = stateAt(replay, replay.log.length);
      // Objects: values, versions, own bits, the peer aggregate and the payoff, from the private scores.
      assert.deepEqual([...state.objects.keys()].sort(), snap.objects.map((o: any) => o._id).sort(), `${label}: the same objects`);
      for (const o of snap.objects) {
        const r = state.objects.get(o._id)!;
        assert.deepEqual([r.value, r.version], [o.value, o.version], `${label}: object ${o._id}`);
        const own = o.scores.find((s: any) => s.god === god.subject).netBits;
        const peers = o.scores.filter((s: any) => s.god !== god.subject).reduce((x: number, s: any) => x + s.netBits, 0);
        close(r.ownNetBits, own, `${label}: own bits`); close(r.peerNetBits, peers, `${label}: peer bits`);
        close(r.payoff, own * Math.max(0, peers), `${label}: payoff`);
      }
      // Own agents: the live ones exactly as stored (acts, spending, account), destroyed ones as destroyed.
      const stored = snap.agents.filter((a: any) => a.ownerId === god.subject);
      const mine = [...state.agents.values()].filter(a => a.mine);
      assert.deepEqual(mine.filter(a => a.alive).map(a => a.id).sort(), stored.map((a: any) => a._id).sort(), `${label}: own live agents`);
      for (const a of stored) {
        const r = state.agents.get(a._id)!;
        assert.deepEqual([r.source, r.acts, r.account], [a.source, a.acts, a.account], `${label}: agent ${a._id}`);
        close(r.spent, a.spent, `${label}: agent spending`);
      }
      assert.equal(state.spent, snap.deities.find((d: any) => d.godId === god.subject).spent, `${label}: summon spending`);
      // The leaderboard: every god's total payoff, from the private scores.
      roster.forEach((id, i) => {
        const total = snap.objects.reduce((x: number, o: any) => {
          const own = o.scores.find((s: any) => s.god === id).netBits;
          return x + own * Math.max(0, o.scores.filter((s: any) => s.god !== id).reduce((y: number, s: any) => y + s.netBits, 0));
        }, 0);
        close(state.totals![i], total, `${label}: ${id}'s total`);
      });
      close(state.score, state.totals![index], `${label}: own score is own total`);
      assert.equal(state.phase, snap.game.phase === "recovery" ? "recovery" : snap.game.phase, `${label}: phase`);
    }
    // The destroyed agent is Ada's history, not anyone else's.
    const all = stateAt(buildReplay(pages), Infinity);
    assert.equal(all.agents.get(doomed.id)?.mine ?? false, god === ada);
    if (god === ada) assert.equal(all.agents.get(doomed.id)!.alive, false);
    // Chat with world stamps, each message once across pages: the planning message at 0, the running one later.
    const chat = buildReplay(pages).chat;
    assert.deepEqual(chat.map(m => m.text), ["planning-chat", "running-chat"]);
    assert.equal(chat.find(m => m.text === "planning-chat")?.world, 0);
    assert.ok((chat.find(m => m.text === "running-chat")?.world ?? 0) > 0);
  }

  // Disclosure: Ada's replay holds her own agents' sources and never Bo's, nor anyone's private scores or the end.
  const check = disclosureChecker(game.gameId, ada.subject, [SECRET_BO]);
  for (const page of await pagesOf(ada)) await check("replay page", page);
  // Room members who were not seated in the game get no replay.
  await late.c.mutation(api.rooms.join, { room: shortCode });
  assert.match(await rejects(late.c.query(api.player.replay, { roomId, gameId: game.gameId })), /not seated/);
});
