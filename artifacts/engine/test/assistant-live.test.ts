/**
 * The in-client assistant against a REAL provider (opt-in, costs money: about USD 0.10 a run with the cheapest
 * catalogued Anthropic model). Runs only when the local deployment is live — `pnpm --filter @workspace/engine
 * assistant:live` (scripts/assistant-provider.mjs) — or CG_ASSISTANT_LIVE=1 is set; otherwise every test skips.
 * `pnpm --filter @workspace/engine dev` returns the deployment to the mock on every start.
 *
 * What would break that the mock cannot show: the real adapter's streaming (text arriving in several flushes),
 * real tool-use blocks resolving through the registry, provider usage settling within the step's reservation, and
 * a second turn replaying the first turn's history (thinking blocks and tool results) without a 400.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { api, gods, roomWith, touch, waitFor, type God } from "./game-helpers.ts";

const ENGINE = fileURLToPath(new URL("..", import.meta.url));
const deploymentLive = () => spawnSync("npx", ["convex", "env", "get", "ASSISTANT_LIVE"], {
  cwd: ENGINE, encoding: "utf8", timeout: 60_000, env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" },
}).stdout?.trim() === "1";
const LIVE = process.env.CG_ASSISTANT_LIVE === "1" || deploymentLive();
const skip = LIVE ? false : "the local assistant is mocked: run `pnpm --filter @workspace/engine assistant:live` first (costs money)";

const MODEL = "claude-sonnet-5-5";   // the cheapest catalogued Anthropic model (convex/lib/aiModels.ts)
const DONE = ["done", "failed", "cancelled", "budget_exhausted"];
const settings = {
  language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", objectType: "Int",
  typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 4, spawnRateHz: 0, planningSeconds: 3600, halfLifeSeconds: 1e9,
};

async function turnOf(god: God, threadId: string, turnId: string) {
  const t = await god.c.query(api.assistant.thread, { threadId });
  return { turn: t.turns.find((x: any) => x._id === turnId), calls: t.toolCalls.filter((c: any) => c.turnId === turnId), messages: t.messages.filter((m: any) => m.turnId === turnId) };
}
/** Waits for the turn to end, recording each distinct partial text of a streaming assistant message. */
async function follow(god: God, sent: { threadId: string; turnId: string }) {
  const flushes: string[] = [], timeline: string[] = [], t0 = Date.now();
  const t = await waitFor(async () => {
    const now = await turnOf(god, sent.threadId, sent.turnId);
    const line = `${now.turn?.status}:${now.messages.map((m: any) => `${m.role}/${m.status}/${m.text?.length ?? 0}`).join(",")}`;
    if (timeline.at(-1)?.split(" ")[1] !== line) timeline.push(`${Date.now() - t0} ${line}`);
    for (const m of now.messages) if (m.role === "assistant" && m.status === "streaming" && m.text && !flushes.includes(m.text)) flushes.push(m.text);
    return DONE.includes(now.turn?.status) ? now : null;
  }, "the live turn ends", 150_000, 40);
  return { ...t, flushes, timeline, text: t.messages.filter((m: any) => m.role === "assistant").map((m: any) => m.text).join("") };
}

test("a real turn streams; the next resolves a tool through the registry over the first's history; usage settles within the reservations", { skip, timeout: 360_000 }, async () => {
  const members = await gods("Lia Live", "Max Live", "Ned Live");
  await touch(members[0]);
  const { roomId } = await roomWith(members, settings);
  const [lia] = members;
  await lia.c.mutation(api.rooms.approveAiBudget, { roomId, aiBudget: 0, assistantBudget: 200_000, assistantModel: MODEL });
  await lia.c.action(api.owner.start, { roomId });

  // Streaming is checked on an answer with no tool exchange before it: after a tool result the Messages API has
  // been seen to deliver the whole answer in one burst (tens of deltas within ~15 ms), so a flush count there
  // would test the provider, not the engine.
  const first = await lia.c.mutation(api.assistant.send, { roomId,
    text: "Without calling any tools, explain in about 200 words, as a short numbered list, how a planning phase usually goes." });
  const t = await follow(lia, first);
  assert.equal(t.turn.status, "done", JSON.stringify(t.turn.error));
  assert.ok(t.text.trim().length > 200, t.text);
  assert.ok(t.flushes.length >= 2, `the answer arrived in more than one flush: ${t.flushes.length} (${t.turn.usage.outputTokens} output tokens)\n${t.timeline.join("\n")}`);

  // The second turn sends the first turn's history (its thinking, if any) back and must resolve a real tool call.
  const second = await lia.c.mutation(api.assistant.send, { roomId, threadId: first.threadId,
    text: "Now call get_observation once (objectsLimit 3) and tell me in one sentence what my utility is called." });
  const u = await follow(lia, second);
  assert.equal(u.turn.status, "done", JSON.stringify(u.turn.error));
  const observation = u.calls.find((c: any) => c.tool === "get_observation");
  assert.ok(observation, `a get_observation call: ${JSON.stringify(u.calls.map((c: any) => c.tool))}`);
  assert.equal(observation.status, "ok", observation.resultJson);
  assert.ok(u.text.trim().length > 0);

  for (const m of [...t.messages, ...u.messages].filter((x: any) => x.role === "assistant")) {
    assert.ok(m.inputTokens > 0 && m.outputTokens > 0, `provider usage recorded: ${JSON.stringify(m)}`);
    assert.ok(m.inputTokens + m.outputTokens <= m.reservedTokens, `usage ${m.inputTokens}+${m.outputTokens} within the reservation ${m.reservedTokens}`);
  }
  const used = [t, u].reduce((sum, x) => sum + x.turn.usage.inputTokens + x.turn.usage.outputTokens, 0);
  const status = await lia.c.query(api.assistant.status, { roomId });
  assert.equal(status.allowance.used, used, "the allowance keeps the actual usage, not the reservations");
  assert.ok(status.allowance.used <= status.allowance.limit, JSON.stringify(status.allowance));
  console.log(`[live] turn 1: ${t.turn.usage.inputTokens} in / ${t.turn.usage.outputTokens} out, ${t.flushes.length} flushes; ` +
    `turn 2: ${u.turn.usage.inputTokens} in / ${u.turn.usage.outputTokens} out, calls ${u.calls.map((c: any) => c.tool).join(",")}`);
});
