/**
 * The model surfaces' dispatch, generated from the directory: one executor for the embedded assistant's tool calls and
 * the MCP `tools/call`, and the JSON-RPC answers for MCP `tools/list` and `tools/call` (the transport, OAuth and
 * `initialize` stay with the host's MCP server). `perform(id, args)` is the host's: the server affordance's internal
 * twin as the delegating human (Convex), or a layout write for a view operation.
 */
import { onSurface, refusal } from "./directory.ts";
import type { OpOutcome } from "./server.ts";
import { affordanceForTool, mcpTools, UNTRUSTED_NOTICE, wrapResult } from "./surfaces.ts";
import type { AffordanceContext } from "./types.ts";

export type Perform = (id: string, args: unknown) => Promise<OpOutcome>;
export interface ToolCallResult {
  content: { type: "text"; text: string }[];
  structuredContent?: ReturnType<typeof wrapResult>;
  isError: boolean;
}

const error = (text: string): ToolCallResult => ({ content: [{ type: "text", text }], isError: true });

/** Runs one tool call from the assistant or an MCP client. Refusals and failures are tool errors the model can read. */
export async function callTool(name: string, args: unknown, ctx: AffordanceContext, via: "assistant" | "mcp", perform: Perform): Promise<ToolCallResult> {
  const a = affordanceForTool(name);
  if (!a || !onSurface(a, via)) return error(`Unknown tool: ${name}`);
  // The host's server checks again from its own records; this answers early with the same words.
  const no = refusal(a, ctx, undefined, via);
  if (no) return error(no.fix ? `${no.reason} (${no.fix})` : no.reason);
  const out = await perform(a.id, args ?? {});
  if (!out.ok) return error(out.error.fix ? `${out.error.message} (${out.error.fix})` : out.error.message);
  const structuredContent = wrapResult(out.result);
  return { content: [{ type: "text", text: `${UNTRUSTED_NOTICE}\n${JSON.stringify(out.result)}` }], structuredContent, isError: false };
}

type JsonRpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: { name?: string; arguments?: unknown } };

/** Answers MCP `tools/list` and `tools/call`; null for any other method (the host's MCP server handles those). */
export async function mcpDispatch(msg: JsonRpc, ctx: AffordanceContext, perform: Perform): Promise<object | null> {
  const id = msg.id ?? null;
  if (msg.method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: mcpTools(ctx) } };
  if (msg.method === "tools/call") {
    const name = msg.params?.name;
    if (typeof name !== "string") return { jsonrpc: "2.0", id, error: { code: -32602, message: "tools/call needs params.name" } };
    return { jsonrpc: "2.0", id, result: await callTool(name, msg.params?.arguments, ctx, "mcp", perform) };
  }
  return null;
}
