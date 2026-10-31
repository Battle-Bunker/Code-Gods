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

// The cheapest catalogued Anthropic model (convex/lib/aiModels.ts); CG_ASSISTANT_MODEL=gpt-4.1-mini runs OpenAI
// (assistant:live copies an OpenAI key when the shell has one).
const MODEL = process.env.CG_ASSISTANT_MODEL || "claude-sonnet-5-5";
const DONE = ["done", "failed", "cancelled", "budget_exhausted"];
const settings = {
  language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", objectType: "Int",
  typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 60, spawnRateHz: 0, planningSeconds: 3600, halfLifeSeconds: 1e9,
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

  // A third turn whose tool result is clipped (60 objects do not fit the 8 KB stored result): the model must not
  // report the clipped array's length as the number of objects.
  const third = await lia.c.mutation(api.assistant.send, { roomId, threadId: first.threadId,
    text: "Call get_observation once with objectsLimit 200, then tell me in one sentence exactly how many objects the game has." });
  const w = await follow(lia, third);
  assert.equal(w.turn.status, "done", JSON.stringify(w.turn.error));
  const clipped = w.calls.find((c: any) => c.tool === "get_observation");
  assert.ok(clipped?.status === "ok", JSON.stringify(w.calls));
  if (clipped.resultJson.startsWith('{"TRUNCATED"')) assert.match(w.text, /\b60\b/, `the answer gives the real count, not the clipped array's: ${w.text}`);

  // A fourth turn, cancelled while it streams: billed from what was known, not its reservation.
  const fourth = await lia.c.mutation(api.assistant.send, { roomId, threadId: first.threadId,
    text: "Without calling any tools, write about 500 words on the history of board games." });
  await waitFor(async () => (await turnOf(lia, fourth.threadId, fourth.turnId)).messages.some((m: any) => m.role === "assistant" && m.text), "text streams", 120_000, 100);
  await lia.c.mutation(api.assistant.cancel, { turnId: fourth.turnId });
  const x = await follow(lia, fourth);
  assert.equal(x.turn.status, "cancelled");
  const cancelled = x.messages.find((m: any) => m.role === "assistant");
  await waitFor(async () => (await turnOf(lia, fourth.threadId, fourth.turnId)).messages.find((m: any) => m.role === "assistant")?.usageEstimated || null, "the cancelled step is billed", 30_000, 200);
  const billed = (await turnOf(lia, fourth.threadId, fourth.turnId)).messages.find((m: any) => m.role === "assistant");
  assert.ok(billed.billedTokens > 0 && billed.billedTokens < cancelled.reservedTokens, JSON.stringify(billed));

  const steps = [...t.messages, ...u.messages, ...w.messages].filter((x: any) => x.role === "assistant");
  for (const m of steps) {
    assert.ok(m.inputTokens > 0 && m.outputTokens > 0, `provider usage recorded: ${JSON.stringify(m)}`);
    assert.ok(m.billedTokens <= m.reservedTokens, `billed ${m.billedTokens} within the reservation ${m.reservedTokens}`);
    // The reservation's input estimate (count_tokens, or characters per token) is close to the real input.
    const ratio = m.inputEstimate / m.inputTokens;
    assert.ok(ratio >= 0.9 && ratio <= 1.3, `input estimate ${m.inputEstimate} vs actual ${m.inputTokens} (${ratio.toFixed(2)}x)`);
  }
  // Prompt caching: every step after the turn's first reads the turn so far from the cache.
  for (const turn of [u, w]) {
    const [, ...later] = turn.messages.filter((m: any) => m.role === "assistant");
    for (const m of later) assert.ok(m.cacheReadTokens > m.inputTokens / 2, `a later step reads most of its input from the cache: ${JSON.stringify(m)}`);
  }
  const used = [t, u, w].reduce((sum, x) => sum + x.turn.usage.billedTokens, 0) + billed.billedTokens;
  const status = await lia.c.query(api.assistant.status, { roomId });
  assert.equal(status.allowance.used, used, "the allowance keeps the billed usage, not the reservations");
  assert.ok(status.allowance.used <= status.allowance.limit, JSON.stringify(status.allowance));
  for (const [n, m] of [...steps, billed].entries()) {
    console.log(`[live] ${MODEL} step ${n + 1}${m.usageEstimated ? " (cancelled)" : ""}: reserved ${m.reservedTokens}, input estimate ${m.inputEstimate}, input ${m.inputTokens} ` +
      `(cache read ${m.cacheReadTokens}, write ${m.cacheWriteTokens}), output ${m.outputTokens}, billed ${m.billedTokens}; estimate/actual ${(m.inputEstimate / m.inputTokens).toFixed(2)}`);
  }
  console.log(`[live] allowance used ${status.allowance.used}; turn 1: ${t.flushes.length} flushes; turn 3 answer: ${w.text.replace(/\s+/g, " ").slice(0, 200)}`);
});
