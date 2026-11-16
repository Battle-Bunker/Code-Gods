/**
 * The agents pane's energy sparkline (v1's, v1-audit A6): each agent's balance just after each of its acts, kept by the
 * commit on the agent's own energy row (one subscription per agent row, `v2/play:agentEnergy`), at most one sample a
 * tick and at most AGENT_HISTORY of them. Between samples the balance grows at the agent's income up to its capacity,
 * which the same read returns, so the client draws the rise itself.
 *
 * What would break: no history; samples out of order or not the balances the commit left; an unbounded history (the
 * row is re-sent on every act).
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { startersFor } from "@workspace/v2-agents";
import { humans, perform, type Human } from "./v2-helpers.ts";

let ada: Human, gameId: string;

before(async () => {
  [ada] = await humans("History Ada");
  const created = await perform(ada!, "room.create", { name: "History room" });
  const roomId = created.result.roomId;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  await perform(ada!, "room.settings", { overrides: { worldSeconds: 600, startingEnergy: 400 } }, { roomId });
  gameId = (await perform(ada!, "game.start", {}, { roomId })).result.gameId;
});

test("an agent's energy row carries its balance after each act, oldest first, bounded", { timeout: 180_000 }, async () => {
  const rule = await ada.query("v2/play:myRule", { gameId });
  const [simple] = startersFor(rule.family, "typescript", rule.tieBreaker);
  const summoned = await perform(ada, "agent.summon", { language: "typescript", source: simple!.source, name: "Sparkline" }, { gameId }, "action");
  assert.equal(summoned.ok, true, JSON.stringify(summoned));
  const agentId = summoned.result.agentId;
  assert.deepEqual((await ada.query("v2/play:agentEnergy", { agentId })).history, [], "no acts, no samples");
  await perform(ada, "game.startWorldNow", {}, { gameId });

  let e: any;
  for (let i = 0; i < 120; i++) {
    e = await ada.query("v2/play:agentEnergy", { agentId });
    if (e.history.length >= 3) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  assert.ok(e.history.length >= 3, `samples after some acts: ${JSON.stringify(e)}`);
  assert.ok(e.history.length <= e.acts, "at most one sample an act");
  const ats = e.history.map((s: any) => s.at);
  assert.ok(ats.every((t: number, i: number) => i === 0 || ats[i - 1] < t), `one sample a tick, oldest first: ${ats.join(" ")}`);
  const last = e.history.at(-1);
  assert.equal(last.at, e.lastActAt, "the last sample is the last act's");
  assert.ok(e.history.every((s: any) => s.energy <= e.capacity + 1e-9), "a balance never above capacity");
  assert.ok(last.energy <= e.energy + 1e-9, "the balance now is the last sample's, grown since at the agent's income");
});
