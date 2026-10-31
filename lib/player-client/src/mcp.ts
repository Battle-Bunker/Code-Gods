/**
 * The CLI as an MCP client of the engine's `POST /mcp` (`pnpm player tools`, `pnpm player call`, and the
 * `assistant …` aliases): one server path for every assistant surface. The device credential authenticates
 * each request (`Authorization: Bearer cgc_…`); the engine runs the tool as the human, with the grant's
 * permission.
 */
import type { Engine } from "./engine.ts";
import type { ToolResult } from "./tools.ts";

/** A tool refused its call (`isError`): the engine's {code, message}, e.g. FORBIDDEN, CONFLICT, BAD_REQUEST. */
export class ToolError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.name = "ToolError"; this.code = code; }
}

export type ListedTool = { name: string; title?: string; description?: string; annotations?: Record<string, unknown>; inputSchema: unknown };

/** The tools this credential may use. */
export async function listTools(engine: Engine): Promise<ListedTool[]> {
  const result = await engine.mcp("tools/list");
  return (result.tools as ListedTool[]) ?? [];
}

/** Call one tool: its structured result ({untrusted, notice, data, nextCursor?}), or ToolError. */
export async function callTool(engine: Engine, name: string, args: Record<string, unknown> = {}, options: { timeoutMs?: number } = {}): Promise<ToolResult> {
  const result = await engine.mcp("tools/call", { name, arguments: args }, options);
  if (result.isError) {
    const text = String((result.content as { text?: string }[] | undefined)?.[0]?.text ?? "");
    let error: { code?: string; message?: string } | undefined;
    try { error = JSON.parse(text).error; } catch { /* the SDK reports schema violations as plain text */ }
    throw new ToolError(error?.code ?? "INVALID", error?.message ?? (text.slice(0, 1000) || "The tool refused the call"));
  }
  return result.structuredContent as ToolResult;
}
