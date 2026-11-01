/**
 * Typical player questions against the LOCAL engine's assistant, with what each cost: model steps, tools called,
 * input (uncached, cache read, cache write) and output tokens, the allowance tokens billed, and USD at the model's
 * catalogue prices. Real providers cost money: switch the local deployment with `pnpm --filter @workspace/engine
 * assistant:live` first (about USD 0.05–0.30 a run on claude-sonnet-5-5, a few cents on gpt-4.1-mini).
 *
 *   node --experimental-transform-types scripts/assistant-driver.ts [model] [--fixture]
 *
 * --fixture also writes the briefing's inputs (get_rules, get_observation, get_layout as the player) to
 * scripts/fixtures/briefing-running.json (for scripts/assistant-tokens.ts); --fixture-only writes it and stops (free). Each question runs in a fresh thread unless it starts with "+" (same thread).
 */
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { AI_MODEL_CATALOG } from "../convex/lib/aiModels.ts";
import { SITE_, admin, api, gods, internal, roomWith, touch, waitFor } from "../test/game-helpers.ts";

const model = process.argv.slice(2).find(a => !a.startsWith("--")) ?? "claude-sonnet-5-5";
const prices = AI_MODEL_CATALOG.find(m => m.id === model) as { inputUsdPerMillion: number; outputUsdPerMillion: number; cacheReadUsdPerMillion?: number; cacheWriteUsdPerMillion?: number };
if (!prices) throw new Error(`unknown model ${model}`);
const QUESTIONS = [
  "What should I do first?",
  "+How am I doing so far?",
  "How does scoring work, in two sentences?",
  "Which objects are worth the most to me? Show me on screen.",
  "Write a simple agent for my utility and validate it; do not summon it.",
];
const settings = {
  languages: ["typescript"], objectType: "Int",
  typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 60, spawnRateHz: 0, planningSeconds: 3600, halfLifeSeconds: 1e9,
};
const DONE = ["done", "failed", "cancelled", "budget_exhausted"];

const members = await gods("Dee Driver", "Max Driver", "Ned Driver");
await touch(members[0]);
const { roomId } = await roomWith(members, settings);
const [me] = members;
await me.c.mutation(api.rooms.approveAiBudget, { roomId, aiBudget: 0, assistantBudget: 1_000_000, assistantModel: model });
await me.c.action(api.owner.start, { roomId });

if (process.argv.includes("--fixture") || process.argv.includes("--fixture-only")) {
  // The briefing's inputs, read over MCP as this player (a seeded device credential), like the engine reads them.
  const token = `cgc_${randomBytes(32).toString("base64url")}`;
  await admin.mutation(internal.testing.seedCredential, { subject: me.subject, roomId, permission: "act", tokenHash: createHash("sha256").update(token).digest("hex") });
  const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "driver", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} };
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await fetch(`${SITE_}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${token}`,
      "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/call", "mcp-name": name }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args, _meta: meta } }) });
    return ((await r.json()) as any).result.structuredContent.data;
  };
  const fixture = { rules: await call("get_rules", {}), observation: await call("get_observation", { objectsLimit: 1 }), layout: await call("get_layout", {}) };
  mkdirSync(new URL("./fixtures/", import.meta.url), { recursive: true });
  writeFileSync(new URL("./fixtures/briefing-running.json", import.meta.url), JSON.stringify(fixture, null, 1));
  console.log("wrote scripts/fixtures/briefing-running.json");
  if (process.argv.includes("--fixture-only")) { await admin.mutation(internal.testing.endGames, {}); process.exit(0); }
}
const rows: Record<string, unknown>[] = [];
let threadId: string | undefined;
for (const raw of QUESTIONS) {
  const same = raw.startsWith("+");
  const text = same ? raw.slice(1) : raw;
  const sent = await me.c.mutation(api.assistant.send, { roomId, text, ...(same && threadId ? { threadId } : {}) });
  threadId = sent.threadId;
  const t = await waitFor(async () => {
    const th = await me.c.query(api.assistant.thread, { threadId: sent.threadId });
    const turn = th.turns.find((x: any) => x._id === sent.turnId);
    return DONE.includes(turn?.status) ? { th, turn } : null;
  }, "the turn ends", 300_000, 500);
  const steps = t.th.messages.filter((m: any) => m.turnId === sent.turnId && m.role === "assistant");
  const sum = (k: string) => steps.reduce((s: number, m: any) => s + (m[k] ?? 0), 0);
  const input = sum("inputTokens"), read = sum("cacheReadTokens"), write = sum("cacheWriteTokens"), output = sum("outputTokens");
  const usd = ((input - read - write) * prices.inputUsdPerMillion + read * (prices.cacheReadUsdPerMillion ?? prices.inputUsdPerMillion)
    + write * (prices.cacheWriteUsdPerMillion ?? prices.inputUsdPerMillion) + output * prices.outputUsdPerMillion) / 1e6;
  const tools = t.th.toolCalls.filter((c: any) => c.turnId === sent.turnId).map((c: any) => c.tool);
  const row = { question: text, status: t.turn.status, steps: steps.length, tools: tools.join(","), input, read, write, output,
    billed: sum("billedTokens"), reserved: sum("reservedTokens"), usd: Number(usd.toFixed(4)), perStepInput: steps.map((m: any) => m.inputTokens),
    answer: steps.map((m: any) => m.text).join("").slice(0, 160).replace(/\n/g, " ") };
  rows.push(row);
  console.log(JSON.stringify(row));
}
const total = (k: string) => rows.reduce((s, r) => s + (r[k] as number), 0);
console.log(`TOTAL ${model}: ${rows.length} questions, ${total("steps")} steps, billed ${total("billed")} tokens (${Math.round(total("billed") / rows.length)} per question), USD ${total("usd").toFixed(4)}; questions per 200k: ${(200_000 / (total("billed") / rows.length)).toFixed(1)}`);
await admin.mutation(internal.testing.endGames, {});
process.exit(0);
