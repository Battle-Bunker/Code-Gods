/**
 * The dock's narrow queries (convex/dock.ts; docs/convex-read-architecture.md §4.3): what each SDK hook reads instead
 * of the whole-world observation. What would break: a dock answer that differs from the observation it replaces (a
 * panel would show other numbers than an agent's tools), an agent series that is not written or not the viewer's own,
 * a stranger reading a room's dock.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, api, envelope, gods, internal, rejects, roomWith, startGame, touch, waitFor, TS } from "./game-helpers.ts";

const settings = {
  language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", objectType: "Int",
  typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 12, spawnRateHz: 0, interactionRateHz: 20, planningSeconds: 3600,
  halfLifeSeconds: 1e9, powerPerSecond: 200, startingEnergy: 1000, scoreIntervalSeconds: 2,
};
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test("dock.state, agents and transformations equal the observation's; the agent series is the tick's, the viewer's own", { timeout: 240_000 }, async () => {
  const [host, ada, bo, stranger] = await gods("Dock Host", "Dock Ada", "Dock Bo", "Dock Stranger");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], settings);
  const game = await startGame(host, roomId);
  for (const god of [ada, bo]) {
    const r = await god.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "summon", name: "Dock agent", language: "typescript", source: TS.Int }, game.gameId) });
    assert.equal(r.accepted, true, r.message);
  }
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now() }, kick: true });
  await waitFor(async () => ((await ada.c.query(api.player.observation, { roomId })).transformations.length >= 3) || undefined, "Ada's agent transforms", 90_000, 500);
  // A scoreboard publication (every 2 world seconds) writes the agents' energy.
  await waitFor(async () => ((await ada.c.query(api.dock.agentSeries, { gameId: game.gameId })).rows.length >= 2) || undefined, "two agent samples", 60_000, 500);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });   // frozen: the observation and the dock read one world

  // Read once the end's read model has settled (the exact score of every object).
  const { obs, state } = await waitFor(async () => {
    const obs = await ada.c.query(api.player.observation, { roomId }), state = await ada.c.query(api.dock.state, { roomId });
    return state && near(state.self.score ?? NaN, obs.self.score ?? NaN) && { obs, state };
  }, "the dock's score is the observation's", 30_000, 250);
  // Catches: a header field lost or changed in the split (the dock's header would disagree with the agent's view).
  const { objects: _o, agents: _a, transformations: _t, chat: _c, leaderboard: _l, leaderboardWorldSeconds: _w, ...header } = obs as any;
  const { roster, objectCount: _n, ...dock } = state as any;
  assert.deepEqual({ ...dock, self: { ...dock.self, score: 0 }, economy: { ...dock.economy, worldSeconds: 0 }, revision: 0 },
    { ...header, self: { ...header.self, score: 0 }, economy: { ...header.economy, worldSeconds: 0 }, revision: 0 });
  assert.deepEqual(roster, (await admin.query(internal.testing.rawGame, { gameId: game.gameId })).game.roster.map((m: any) => m.id));
  // The observation parses with its protocol schema (lib/player-client), which keeps only the fields it names.
  const agents: any[] = await ada.c.query(api.dock.agents, { roomId });
  assert.deepEqual(agents.map((a, i) => Object.fromEntries(Object.keys(obs.agents[i]).map(k => [k, a[k]]))), obs.agents);
  assert.deepEqual(await ada.c.query(api.dock.transformations, { roomId }), obs.transformations.slice(-90));

  // The series: one row per publication (every 2 world seconds here), Ada's agent only, its energy then.
  const series = await ada.c.query(api.dock.agentSeries, { gameId: game.gameId });
  assert.ok(series.rows.length >= 1, "the tick wrote samples");
  assert.ok(series.rows.every((r: any) => r.agents.length === 1 && r.agents[0].id === obs.agents[0].id && Number.isFinite(r.agents[0].energy)));
  assert.deepEqual(series.rows.map((r: any) => r.world), [...series.rows.map((r: any) => r.world)].sort((a, b) => a - b));
  const later = await ada.c.query(api.dock.agentSeries, { gameId: game.gameId, after: series.rows[0].world });
  assert.deepEqual(later.rows, series.rows.slice(1), "paged by world time");
  assert.deepEqual((await stranger.c.query(api.dock.agentSeries, { gameId: game.gameId })).rows, [], "nobody else's samples");
  await rejects(stranger.c.query(api.dock.state, { roomId }));
});
