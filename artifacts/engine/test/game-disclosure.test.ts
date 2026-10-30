/**
 * Disclosure (plan §6, product rule: aggregate-only). For one viewer, every player-facing result, live and
 * historical, is searched for other gods' private data: their per-object net bits, utility descriptors,
 * agent sources, AI prompts, the event log's per-god vectors, the season salt and the end deadline.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { observationSchema } from "@workspace/player-client";
import { admin, api, envelope, gods, internal, playerClient, raw, roomWith, touch, waitFor } from "./game-helpers.ts";

const FORBIDDEN_KEYS = ["scores", "endAtWorld", "net", "deities", "prompt", "penaltyOrdinal", "aiAgent", "descriptor", "seed"];

/** Every number (as JSON prints it) in a value. */
function numbers(value: unknown, out = new Set<string>()) {
  if (typeof value === "number") out.add(JSON.stringify(value));
  else if (Array.isArray(value)) value.forEach(v => numbers(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach(v => numbers(v, out));
  return out;
}

test("no player-facing result discloses another god's scores, descriptor, agent source, prompt, salt or end", { timeout: 240000 }, async () => {
  const [host, ada, bo] = await gods("Disclosure Host", "Disclosure Ada", "Disclosure Bo");
  await touch(host);
  const settings = {
    language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", objectType: "Grid",
    typeArgs: { size: 5, symbols: "base10", colours: "rgby" }, startingObjectCount: 12, spawnRateHz: 2, planningSeconds: 3600,
    agentEnergyPerSecond: 100, agentBatteryActs: 2, interactionRateHz: 40, startingEnergy: 1000,
  };
  const { roomId, shortCode } = await roomWith([host, ada, bo], settings);
  await admin.mutation(internal.aiTemplates.ensureSeeded, {});
  await host.c.mutation(api.rooms.addAi, { roomId, templateId: "sonnet-strategist" });
  await host.c.mutation(api.rooms.approveAiBudget, { roomId, aiBudget: 200_000 });
  const game = await host.c.action(api.owner.start, { roomId });
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
  const check = async (label: string, result: unknown) => {
    const secret = await raw(game.gameId);
    const json = JSON.stringify(result);
    for (const key of FORBIDDEN_KEYS) assert.ok(!json.includes(`"${key}":`), `${label}: never discloses "${key}"`);
    assert.ok(!json.includes(SECRET_BO) && !json.includes(SECRET_HOST), `${label}: never another god's agent source`);
    assert.ok(!json.includes("Play strategically"), `${label}: never an AI seat's prompt`);
    assert.ok(!json.includes("local-test-salt"), `${label}: never the season salt`);
    assert.ok(!numbers(result).has(JSON.stringify(secret.game.endAtWorld)), `${label}: never the end deadline`);
    // Other gods' individual per-object net bits (where distinctive) never appear.
    const seen = numbers(result);
    for (const o of secret.objects) for (const s of o.scores) {
      if (s.god === ada.subject) continue;
      const distinctive = Math.abs(s.netBits) > 1e-6 && !o.scores.some((x: any) => x.god === ada.subject && Math.abs(x.netBits - s.netBits) < 1e-12);
      if (distinctive) assert.ok(!seen.has(JSON.stringify(s.netBits)), `${label}: ${s.god}'s net bits ${s.netBits} on ${o._id}`);
    }
    // Other gods' descriptors never appear.
    for (const d of secret.deities) {
      if (d.godId === ada.subject) continue;
      const own = secret.deities.find((x: any) => x.godId === ada.subject).utility;
      if (JSON.stringify(d.utility.params) !== JSON.stringify(own.params) && JSON.stringify(d.utility.params) !== "{}") {
        assert.ok(!json.includes(JSON.stringify(d.utility.params)), `${label}: ${d.godId}'s utility parameters`);
      }
    }
  };

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
  const theirs = live.events.events.concat(live.eventsFromStart.events).filter((e: any) => e.type === "object.transformed" && !e.mine);
  assert.ok(theirs.length > 0, "others' transformations are visible");
  assert.ok(theirs.every((e: any) => !("calls" in e) && !("cost" in e)), "only an agent's owner learns its calls and costs");
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
  for (const [label, result] of Object.entries(after)) await check(`ended ${label}`, result);
});
