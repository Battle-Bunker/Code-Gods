/**
 * The frozen end state (docs/ui-redesign.md §3 "An ended game stays inspectable"): when a game ends, nothing the
 * player could inspect while it ran disappears. Every read the panels and the assistant use still serves the ended
 * game, frozen at its final tick, until the room's next game takes its slot (and by game id after that); actions
 * stay refused with a reason, chat stays open (it belongs to the room, as on the room page).
 *
 * What would break: a read gated on a live phase, rows dropped or collapsed at the end, clocks (energy) that keep
 * running after the end, the assistant briefing an ended game as an empty lobby.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { observationSchema } from "@workspace/player-client";
import { admin, api, envelope, gods, internal, raw, roomWith, sleep, touch, waitFor, TS } from "./game-helpers.ts";

const settings = {
  languages: ["typescript"], objectType: "Int",
  typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 4, spawnRateHz: 0, planningSeconds: 3600, halfLifeSeconds: 1e9,
};
const mock = (steps: unknown[]) => `/mock ${JSON.stringify({ steps })}`;
const DONE = ["done", "failed", "cancelled", "budget_exhausted"];
/** Drop the fields that are clocks of the read itself, not of the game. */
const frozen = (o: any) => ({ ...o, revision: undefined });

test("an ended game keeps and serves everything the panels and the assistant read, frozen at the final tick", { timeout: 240_000 }, async () => {
  const [host, ann, bob] = await gods("Frozen Host", "Ann Frozen", "Bob Frozen");
  await touch(host);
  const { roomId } = await roomWith([host, ann, bob], settings);
  await host.c.mutation(api.rooms.approveAiBudget, { roomId, aiBudget: 0, assistantBudget: 500_000 });
  const game = await host.c.action(api.owner.start, { roomId });
  const send = (god: typeof ann, command: Record<string, unknown>) => god.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
  assert.equal((await send(ann, { type: "summon", language: "typescript", source: TS.Int })).accepted, true);
  assert.equal((await send(bob, { type: "summon", language: "typescript", source: TS.Int })).accepted, true);
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3600 }, kick: true });
  await waitFor(async () => (await ann.c.query(api.player.observation, { roomId })).transformations.length >= 2, "Ann's agent transforms objects", 60_000);
  assert.equal((await send(ann, { type: "chat", text: "frozen-chat marker" })).accepted, true);

  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  const before = await raw(game.gameId);
  const end = observationSchema.parse(await ann.c.query(api.player.observation, { roomId }));

  // The observation is the final world: objects with payoffs, own agents with their final accounts, transformations,
  // the leaderboard, chat, the player's own card. Nothing is emptied by the end.
  assert.equal(end.phase, "ended");
  assert.equal(end.seated, true);
  assert.equal(end.objects.length, 4, "objects with their final payoffs");
  assert.ok(end.objects.every(o => typeof o.payoff === "number" && typeof o.own.netBits === "number"));
  assert.equal(end.agents.length, 1, "Ann's agent, as it ended the game");
  assert.ok(end.agents[0].acts >= 1 && end.agents[0].source === TS.Int);
  assert.ok(end.transformations.length >= 2, "the feed's transformations");
  assert.equal(end.leaderboard.length, 3);
  assert.ok(end.self.utility?.name, "the player's own card");
  assert.ok(end.chat.some(m => m.text === "frozen-chat marker"));

  // Frozen: read again later, the same world, the same agent accounts, the same god energy (it stops at the end).
  await sleep(2_500);
  const later = observationSchema.parse(await ann.c.query(api.player.observation, { roomId, at: Date.now() }));
  assert.deepEqual(frozen(later), frozen(end), "an ended game's observation does not move with wall time");
  const after = await raw(game.gameId);
  assert.deepEqual([after.objects.length, after.agents.length, after.batches.length], [before.objects.length, before.agents.length, before.batches.length],
    "no rows dropped after the end");

  // The other reads the panels use: my-card and what-if (the utility), bits-over-time (trajectories), race and feed
  // (the event log), others-care (objects' peer aggregates, above), the layout's phase.
  const utility = await ann.c.query(api.player.myUtility, { roomId });
  assert.equal(utility?.gameId, game.gameId);
  const trajectories = await ann.c.query(api.player.trajectories, { roomId });
  assert.ok(trajectories.objects.length >= 1 && trajectories.objects.every((o: any) => o.points.length >= 1), "bits-over-time to the end");
  const events = await ann.c.query(api.player.events, { roomId, limit: 50 });
  assert.equal(events.gameId, game.gameId);
  assert.ok(events.events.some((e: any) => e.type === "phase" && e.phase === "ended"), "the log runs to the end");
  assert.ok(events.events.some((e: any) => e.type === "object.transformed"), "the feed's changes");
  assert.equal((await ann.c.query(api.layout.current, { roomId })).phase, "ended");

  // Actions stay refused with a reason; chat belongs to the room and stays open, as on the room page.
  const summon = await send(ann, { type: "summon", language: "typescript", source: TS.Int });
  assert.equal(summon.accepted, false);
  assert.match(summon.message, /not accepting commands/);
  assert.equal((await send(ann, { type: "destroy", agentId: end.agents[0].id })).accepted, false);
  assert.equal((await ann.c.query(api.player.observation, { roomId })).agents.length, 1, "a refused destroy leaves the agent");
  assert.equal((await ann.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "chat", text: "after the end" }) })).accepted, true);

  // The assistant (mock provider): its read tools see the same frozen game, and its briefing says so.
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([
    { echo: true, tools: [{ name: "get_observation" }, { name: "get_events" }, { name: "get_trajectories" }, { name: "get_my_utility" }, { name: "get_chat" }, { name: "get_layout" }] },
    { text: "ok" },
  ]) });
  const turn = await waitFor(async () => {
    const t = await ann.c.query(api.assistant.thread, { threadId: sent.threadId });
    const mine = t.turns.find((x: any) => x._id === sent.turnId);
    return DONE.includes(mine?.status) ? { turn: mine, calls: t.toolCalls.filter((c: any) => c.turnId === sent.turnId), messages: t.messages.filter((m: any) => m.turnId === sent.turnId) } : null;
  }, "the assistant turn finishes", 90_000, 150);
  assert.equal(turn.turn.status, "done", JSON.stringify(turn.turn.error));
  assert.ok(turn.calls.every((c: any) => c.status === "ok"), JSON.stringify(turn.calls.map((c: any) => [c.tool, c.status, c.summary])));
  const result = (tool: string) => JSON.parse(turn.calls.find((c: any) => c.tool === tool).resultJson).data;
  const observed = result("get_observation");
  assert.equal(observed.phase, "ended");
  assert.equal(observed.objects.length, 4, "the assistant sees the final objects");
  assert.equal(observed.agents.length, 1, "and the player's agents");
  assert.ok(result("get_my_utility"), "and the player's card");
  const [briefing] = JSON.parse(turn.messages.find((m: any) => m.role === "assistant").text).context as string[];
  assert.match(briefing, /game is over/i);
  assert.match(briefing, /frozen final state/i);
  assert.doesNotMatch(briefing, /no game is running/i);
});
