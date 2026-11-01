/**
 * Disclosure (plan §6, product rule: aggregate-only while a game is live; an ended game's replay is fully transparent). For one viewer, every player-facing result, live and
 * historical, is searched for other gods' private data: their per-object net bits, utility descriptors,
 * agent sources, AI prompts, the event log's per-god vectors, the season salt and the end deadline.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { observationSchema } from "@workspace/player-client";
import { admin, api, envelope, gods, internal, playerClient, raw, rejects, roomWith, startGame, touch, waitFor } from "./game-helpers.ts";
import { disclosureChecker } from "./disclosure.ts";


test("no player-facing result discloses another god's scores, descriptor, agent source, prompt, salt or end", { timeout: 240000 }, async () => {
  const [host, ada, bo] = await gods("Disclosure Host", "Disclosure Ada", "Disclosure Bo");
  await touch(host);
  const settings = {
    languages: ["typescript"], objectType: "Grid",
    typeArgs: { size: 5, symbols: "base10", colours: "rgby" }, startingObjectCount: 12, spawnRateHz: 2, planningSeconds: 3600,
    agentEnergyPerSecond: 100, agentBatteryActs: 2, interactionRateHz: 40, startingEnergy: 1000,
  };
  const { roomId, shortCode } = await roomWith([host, ada, bo], settings);
  await admin.mutation(internal.aiTemplates.ensureSeeded, {});
  await host.c.mutation(api.rooms.addAi, { roomId, templateId: "sonnet-strategist" });
  await host.c.mutation(api.rooms.approveAiBudget, { roomId, aiBudget: 200_000 });
  const game = await startGame(host, roomId);
  const send = (god: typeof ada, command: Record<string, unknown>) => god.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
  const SECRET_BO = "bo_private_marker", SECRET_HOST = "host_private_marker";
  const ok = (r: any) => assert.equal(r.accepted, true, r.message);
  ok((await send(ada, { type: "summon", language: "typescript", source: "function agent(grid) { return [slide(row(0), 1)]; }" })));
  ok((await send(bo, { type: "summon", language: "typescript", source: `function agent(grid) { const ${SECRET_BO} = 1; return [slide(column(0), ${SECRET_BO})]; }` })));
  ok((await send(host, { type: "summon", language: "typescript", source: `function agent(grid) { const ${SECRET_HOST} = 2; return [slide(row(1), ${SECRET_HOST})]; }` })));
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3517.8173 }, kick: true });
  await waitFor(async () => {
    const r = await raw(game.gameId);
    const events = r.batches.flatMap((b: any) => b.events);
    return events.some((e: any) => e.t === "transform" && e.ownerId === bo.subject) && events.some((e: any) => e.t === "spawn" && e.world > 0);
  }, "others' transforms and live spawns", 90000);

  const collect = async (viewer: typeof ada, client = viewer.c) => {
    const observation = observationSchema.parse(await client.query(api.player.observation, { roomId }));
    return {
      observation,
      events: await client.query(api.player.events, { roomId }),
      eventsFromStart: await client.query(api.player.events, { roomId, after: -1, limit: 50 }),
      history: await client.query(api.player.history, { roomId, gameId: game.gameId, afterSeq: -1, limit: 50 }),
      trajectories: await client.query(api.player.trajectories, { roomId, afterSeq: -1, limit: 200 }),
      myUtility: await client.query(api.player.myUtility, { roomId }),
      room: await client.query(api.rooms.get, { room: shortCode }),
      view: await client.query(api.games.view, { code: game.shortCode }),
      roomHistory: await client.query(api.rooms.history, { room: roomId }),
    };
  };
  const check = disclosureChecker(game.gameId, ada.subject, [SECRET_BO, SECRET_HOST], { live: true });

  const live = await collect(ada);
  for (const [label, result] of Object.entries(live)) await check(`live ${label}`, result);
  // The viewer's own data is there: own descriptor, own agents with source, own and aggregate bits.
  const secret = await raw(game.gameId);
  const own = secret.deities.find((d: any) => d.godId === ada.subject);
  assert.deepEqual(live.myUtility.utility.familyId, own.utility.familyId);
  assert.deepEqual(live.myUtility.utility.params, own.utility.params);
  assert.equal(live.myUtility.instantiationKey, "Grid(5,base10,rgby)");
  assert.equal(live.observation.agents.length, 1);
  assert.ok(live.observation.agents[0].source.includes("slide(row(0), 1)"));
  // While live, the event log shows only the viewer's own summons (another god's would date its agent and attribute its
  // transformations: docs/public-log-design.md §1), with their source.
  const summons = live.eventsFromStart.events.concat(live.history.events).filter((e: any) => e.type === "agent.summoned");
  assert.ok(summons.length >= 1 && summons.every((e: any) => e.mine && "source" in e), "only the viewer's own summons, with their source");
  // Information hiding is the rule while the game is live: its full replay is refused.
  assert.match(await rejects(ada.c.query(api.player.replay, { roomId, gameId: game.gameId })), /opens when the game ends/);
  // Every transformation is public and unattributed: another god's carries no agent, owner, calls or charge, and no
  // agent id in any result points at another god's agent.
  const theirs = live.events.events.concat(live.eventsFromStart.events, live.history.events).filter((e: any) => e.type === "object.transformed" && !e.mine);
  assert.ok(theirs.length > 0, "others' transformations are visible");
  for (const e of theirs) assert.deepEqual(Object.keys(e).filter(k => ["agentId", "ownerId", "calls", "cost"].includes(k)), [], "no attribution on another god's transformation");
  const othersAgents = secret.agents.filter((a: any) => a.ownerId !== ada.subject).map((a: any) => a._id as string);
  for (const [label, result] of Object.entries(live)) {
    const json = JSON.stringify(result);
    for (const id of othersAgents) assert.ok(!json.includes(id), `live ${label}: never another god's agent id`);
    // (rooms.get and games.view name the ROOM's owner; event-bearing results never name an agent's.)
    if (label !== "room" && label !== "view") for (const g of [bo.subject, host.subject]) assert.ok(!json.includes(`"ownerId":"${g}"`), `live ${label}: never an owner`);
  }
  // Transformations reach the viewer with their value change and the viewer's bits (own and the peers' sum only).
  assert.ok(theirs.every((e: any) => "before" in e && "value" in e && "own" in e && "peerNetBits" in e && typeof e.worldSeconds === "number"));
  // Others' scores are the published scoreboard, not live totals: the leaderboard is games.scoreboard as of
  // leaderboardWorldSeconds (retry across a publication between the two reads), while the own score is live.
  await waitFor(async () => {
    const o = await ada.c.query(api.player.observation, { roomId });
    const board = (await raw(game.gameId)).game.scoreboard;
    if (o.leaderboardWorldSeconds !== board.world) return false;
    const roster = secret.game.roster.map((m: any) => m.id);
    return o.leaderboard.every((r: any) => r.totalPayoff === board.totals[roster.indexOf(r.godId)]);
  }, "the observation's leaderboard is the published scoreboard", 20000);
  assert.equal(typeof live.observation.self.score, "number", "the own score is live");
  assert.ok(live.eventsFromStart.events.every((e: any) => e.type !== "agent.failed" || secret.agents.some((a: any) => a._id === e.agentId && a.ownerId === ada.subject)), "failures are the owner's own");
  assert.ok(live.trajectories.objects.length > 0 && live.trajectories.objects.every((o: any) => o.points.every((p: any) =>
    ["seq", "worldSeconds", "value", "ownNetBits", "peerNetBits", "payoff"].every(k => k in p) && Object.keys(p).length === 6)));
  // Trajectory points carry own bits and the peer aggregate, matching the live object.
  for (const o of secret.objects) {
    const series = live.trajectories.objects.find((t: any) => t.objectId === o._id);
    if (!series) continue;
    const last = series.points.at(-1);
    if (last.value !== o.value) continue;
    const mine = o.scores.find((s: any) => s.god === ada.subject).netBits;
    const peers = o.scores.filter((s: any) => s.god !== ada.subject).reduce((n: number, s: any) => n + s.netBits, 0);
    assert.ok(Math.abs(last.ownNetBits - mine) < 1e-9 && Math.abs(last.peerNetBits - peers) < 1e-9, "trajectory = own bits and peer aggregate");
  }

  // A player-app credential sees exactly the same projection.
  const app = await playerClient(ada, roomId, "read");
  await check("player credential observation", await app.query(api.player.observation, { roomId }));

  // Historical: after the game ends, history and events stay projected.
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  const after = await collect(ada);
  const ended = disclosureChecker(game.gameId, ada.subject, [SECRET_BO, SECRET_HOST]);
  for (const [label, result] of Object.entries(after)) await ended(`ended ${label}`, result);
  // After the end the disclosure is exact: the observation's others' sums are the private ones, without noise.
  const final = await raw(game.gameId);
  for (const o of after.observation.objects) {
    const secretObject = final.objects.find((x: any) => x._id === o.id);
    const others = secretObject.scores.filter((x: any) => x.god !== ada.subject).reduce((n: number, x: any) => n + x.netBits, 0);
    assert.ok(Math.abs(o.peerNetBits - others) < 1e-9, "ended: exact others' sums");
  }
  // ...and the replay reveals everything once the game has ended: every god's descriptor, every agent's source, every
  // god's per-object net bits, the end deadline, the AI seat's prompt (docs/replay-design.md §3).
  const replay = JSON.stringify(await ada.c.query(api.player.replay, { roomId, gameId: game.gameId, limit: 100 }));
  for (const marker of [SECRET_BO, SECRET_HOST, "Play strategically", JSON.stringify(final.game.endAtWorld)]) assert.ok(replay.includes(marker), `the ended replay reveals ${marker}`);
  for (const d of final.deities) assert.ok(replay.includes(JSON.stringify(d.utility.params)), `the ended replay reveals ${d.godId}'s utility`);
});

test("other gods' scores move only when the scoreboard is published; the own score is live", { timeout: 180000 }, async () => {
  // What would break: a leaderboard computed live from the objects (a per-commit jump matchable to one transformation's
  // others-delta), or a scoreboard that never publishes.
  const [host, ada, bo] = await gods("Cadence Host", "Cadence Ada", "Cadence Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], {
    languages: ["typescript"], objectType: "Int", typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 6, spawnRateHz: 1,
    interactionRateHz: 20, planningSeconds: 3600, halfLifeSeconds: 1e9, agentEnergyPerSecond: 100, startingEnergy: 1000, scoreIntervalSeconds: 60,
  });
  const game = await startGame(host, roomId);
  const start = (await raw(game.gameId)).game.scoreboard;
  assert.equal(start.world, 0, "the first scoreboard is published at the start");
  for (const god of [ada, bo]) {
    const r = await god.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "summon", language: "typescript", source: "function agent(x) { return [add(3)]; }" }, game.gameId) });
    assert.equal(r.accepted, true, r.message);
  }
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3517.8173 }, kick: true });
  const live = (snap: any, id: string) => snap.objects.reduce((x: number, o: any) => {
    const own = o.scores.find((s: any) => s.god === id).netBits;
    return x + own * Math.max(0, o.scores.filter((s: any) => s.god !== id).reduce((y: number, s: any) => y + s.netBits, 0));
  }, 0);
  const roster: string[] = (await raw(game.gameId)).game.roster.map((m: any) => m.id);
  // Wait until the live totals have moved away from the published ones while the world is still under 60 s.
  const snap = await waitFor(async () => {
    const r = await raw(game.gameId);
    return r.game.worldSeconds < 55 && roster.some((id, i) => Math.abs(live(r, id) - start.totals[i]) > 1e-9) ? r : null;
  }, "live totals moved", 60000);
  assert.ok(snap.game.worldSeconds < 60);
  const observation = await ada.c.query(api.player.observation, { roomId });
  assert.deepEqual(observation.leaderboard.map((r: any) => r.totalPayoff), roster.map((_, i) => start.totals[i]).sort((a, b) => b - a),
    "the leaderboard is still the start's scoreboard");
  assert.equal(observation.leaderboardWorldSeconds, 0);
  const view = await ada.c.query(api.games.view, { code: game.shortCode });
  assert.deepEqual(view.leaderboard.map((r: any) => r.totalPayoff).sort(), [...start.totals].sort(), "the public game view too");
  // The own score is live: the sum of own payoffs now.
  const now = await raw(game.gameId);
  const obs = await ada.c.query(api.player.observation, { roomId });
  const ownNow = obs.objects.reduce((x: number, o: any) => x + o.payoff, 0);
  assert.ok(Math.abs((obs.self.score ?? NaN) - ownNow) < 1e-9, "self.score is the sum of own payoffs");
  void now;
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  const ended = await raw(game.gameId);
  roster.forEach((id, i) => assert.ok(Math.abs(ended.game.scoreboard.totals[i] - live(ended, id)) < 1e-9, "the end publishes the exact totals"));
});
