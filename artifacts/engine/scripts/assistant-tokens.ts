/**
 * What each part of an assistant model step costs, in input tokens, counted by the provider (Anthropic count_tokens;
 * free, no model call). Run from artifacts/engine:
 *
 *   CODE_GODS_ANTHROPIC_API_KEY=… node --experimental-transform-types scripts/assistant-tokens.ts [permission] [model]
 *
 * Each component is the difference between a request with it and the bare request (one user message "hi"), so the
 * numbers add up to what one step of a turn re-sends. The briefing is measured on scripts/fixtures/briefing-*.json
 * (captured from a live game) when present.
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync } from "node:fs";
import { assistantBriefing, assistantSystemPrompt } from "@workspace/ai-player";
import { SKILL_NAMES, skillBody } from "@workspace/player-client/skills";
import { toolJsonSchemas, toolsFor } from "@workspace/player-client/tools";
import { modelTools } from "../convex/assistant/rules.ts";

const permission = (process.argv[2] ?? "act") as "read" | "act" | "owner";
const model = process.argv[3] ?? "claude-sonnet-5-5";
const key = process.env.CODE_GODS_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
if (!key) throw new Error("CODE_GODS_ANTHROPIC_API_KEY is required");
const client = new Anthropic({ apiKey: key });

type Tool = { name: string; description: string; inputSchema: Record<string, unknown>; deferred?: boolean };
/** `user` blocks go in one user message, as the engine sends a briefing and the player's text. */
async function count(parts: { system?: string; tools?: Tool[]; user?: string[] }) {
  const r = await client.messages.countTokens({
    model, ...(parts.system ? { system: parts.system } : {}),
    ...(parts.tools?.length ? { tools: parts.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Tool.InputSchema, ...(t.deferred ? { defer_loading: true } : {}) })) } : {}),
    messages: [{ role: "user", content: (parts.user ?? ["hi"]).map(text => ({ type: "text" as const, text })) }],
  });
  return r.input_tokens;
}

const tools = modelTools(permission);
const system = assistantSystemPrompt({ playerName: "Lia", roomCode: "ABCD", permission });
const fixture = new URL("./fixtures/briefing-running.json", import.meta.url);
const data = existsSync(fixture) ? JSON.parse(readFileSync(fixture, "utf8")) : undefined;
const briefing = data ? assistantBriefing(data) : undefined;

const bare = await count({});
const rows: [string, number, number][] = [];
const withTools = await count({ tools });
const inContext = tools.filter(t => !t.deferred);
rows.push([`tools (${inContext.length} loaded, ${tools.length - inContext.length} deferred)`, JSON.stringify(inContext).length, withTools - bare]);
rows.push(["system prompt", system.length, (await count({ system })) - bare]);
if (briefing) rows.push(["briefing", briefing.length, (await count({ user: [briefing, "hi"] })) - bare]);
const total = await count({ tools, system, ...(briefing ? { user: [briefing, "hi"] } : {}) });
console.log(`model ${model}, permission ${permission}; bare request ${bare} tokens`);
for (const [name, chars, tokens] of rows) console.log(`${name.padEnd(22)} ${String(chars).padStart(7)} chars ${String(tokens).padStart(7)} tokens`);
console.log(`${"all of the above".padEnd(22)} ${"".padStart(13)} ${String(total - bare).padStart(7)} tokens`);
if (data) {
  // What loading costs: each skill's body (as the load_skill result the model reads), and each deferred tool once loaded.
  for (const name of SKILL_NAMES) {
    const body = skillBody(name, data);
    console.log(`${`skill ${name}`.padEnd(22)} ${String(body.length).padStart(7)} chars ${String((await count({ user: [body, "hi"] })) - bare).padStart(7)} tokens (when loaded)`);
  }
}
if (process.argv.includes("--mcp")) {
  // What an MCP client's model reads from tools/list for this grant: the full descriptions (before) or the short
  // listing (agent/mcp.ts listedDescription), with the registry's complete input schemas either way.
  const json = toolJsonSchemas();
  const listing = (describe: (t: (typeof registry)[number]) => string) => registry.map(t => ({ name: t.name, description: describe(t), inputSchema: json[t.name].input }));
  const registry = toolsFor(permission);
  for (const [label, describe] of [["mcp tools/list, full descriptions", (t: (typeof registry)[number]) => t.description], ["mcp tools/list, short listing", (t: (typeof registry)[number]) => [t.short, t.note].filter(Boolean).join(" ")]] as const) {
    const tools = listing(describe);
    console.log(`${label.padEnd(36)} ${String(JSON.stringify(tools).length).padStart(7)} chars ${String((await count({ tools })) - bare).padStart(7)} tokens`);
  }
}
if (process.argv.includes("--per-tool")) {
  // One at a time: count_tokens is rate limited. A single tool includes the fixed tool-use preamble (about 360 tokens).
  const each: (readonly [string, number, number])[] = [];
  for (const t of tools) each.push([t.name, JSON.stringify(t).length, (await count({ tools: [t] })) - bare]);
  for (const [name, chars, tokens] of each.sort((a, b) => b[2] - a[2])) console.log(`  ${name.padEnd(20)} ${String(chars).padStart(6)} chars ${String(tokens).padStart(6)} tokens`);
}
