/**
 * The first agent end to end, on a room as it is created (the default setup): each player builds the example for
 * their own dealt goal from what their client already has (the goal card and the board of the observation), as the
 * forge does, summons it unchanged, and their own score rises once the world runs. What would break: an example the
 * engine refuses, one that cannot be paid for, or one that does not move the player's score in a real game.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { observationSchema } from "@workspace/player-client";
import { boardFacts, buildExampleAgent, mutatorNames } from "@workspace/game-utilities/example-agents";
import { admin, api, envelope, gods, internal, raw, roomWith, startGame, touch, waitFor } from "./game-helpers.ts";

test("a new player's pre-filled example validates, is summoned unchanged and raises their own score", { timeout: 240000 }, async t => {
  const players = await gods("First Agent Host", "First Agent Ada", "First Agent Bo");
  await touch(players[0]!);
  const { roomId } = await roomWith(players);
  // Seat the owner whichever way rooms.create leaves them (a no-op when already seated).
  await players[0]!.c.mutation(api.rooms.setSpectator, { roomId, spectator: false });
  const game = await startGame(players[0]!, roomId);
  const observe = async (i: number) => observationSchema.parse(await players[i]!.c.query(api.player.observation, { roomId }));
  const send = (i: number, command: Record<string, unknown>) => players[i]!.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });

  const before: number[] = [], late: { i: number; cost: number; command: Record<string, unknown> }[] = [], families: string[] = [];
  for (let i = 0; i < players.length; i++) {
    const obs = await observe(i);
    const card = obs.self.utility!, board = obs.instance!, language = obs.languages![0] as "python" | "typescript";
    const example = buildExampleAgent({ familyId: card.familyId, language, summary: card.summary, cardSource: card.source, mutators: mutatorNames(board, language), ...boardFacts(board) });
    families.push(card.familyId);
    assert.equal(example.specific, true, `The default setup dealt ${card.familyId}, whose first agent is only the fallback. `
      + `Add a recipe to RECIPES in lib/game-utilities/src/example-agents.ts for: ${card.familyId}`);
    const checked = await send(i, { type: "validate", language, source: example.source });
    assert.equal(checked.accepted, true, checked.message);
    assert.equal(checked.validation.valid, true, `${card.familyId}: ${JSON.stringify(checked.validation.diagnostics)}`);
    before.push(obs.self.score ?? 0);
    const command = { type: "summon", language, source: example.source, name: example.name };
    // A summon is paid from the starting energy in planning; an example that costs more waits for the first income.
    if (checked.validation.cost <= obs.self.energy) {
      const summoned = await send(i, command);
      assert.equal(summoned.accepted, true, summoned.message);
      const agent = (await observe(i)).agents.find(a => a.name === example.name)!;
      assert.equal(agent.powerShare, 0.5, "the first summon takes half the power, so the player can still summon again");
    } else late.push({ i, cost: checked.validation.cost, command });
    t.diagnostic(`${card.familyId}: summon price ${checked.validation.cost.toFixed(1)} of ${obs.self.energy} energy${checked.validation.cost <= obs.self.energy ? "" : " (summoned once the world runs)"}`);
  }

  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3600 }, kick: true });
  for (const { i, cost, command } of late) {
    await waitFor(async () => (await observe(i)).self.energy >= cost || undefined, "income pays for the dearer example", 60000, 250);
    const summoned = await send(i, command);
    assert.equal(summoned.accepted, true, summoned.message);
  }
  await waitFor(async () => (await raw(game.gameId)).game.worldSeconds >= 10, "the world runs", 180000, 500);
  for (let i = 0; i < players.length; i++) {
    const obs = await observe(i);
    const mine = obs.agents[0]!;
    t.diagnostic(`${families[i]}: score ${before[i]!.toFixed(2)} → ${(obs.self.score ?? 0).toFixed(2)}; agent ${JSON.stringify({ acts: (mine as any).acts, energy: mine.energy })}`);
    assert.ok((obs.self.score ?? 0) > before[i]!, `${families[i]}: the player's own score rose (${before[i]} → ${obs.self.score})`);
  }
  await players[0]!.c.mutation(api.rooms.endActiveGame, { roomId });
});
