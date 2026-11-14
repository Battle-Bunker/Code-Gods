/**
 * The tool loop of the assistant and of a model-backed AI seat. It calls the provider, runs each tool call through the
 * caller's `perform` (the host executes affordances; this package never touches the server), feeds the results back
 * wrapped as untrusted game data, and stops on a final answer, the step cap or the budget.
 */
import { UNTRUSTED_NOTICE, wrapResult } from "@workspace/v2-affordances";
import type { Budget } from "./budget.ts";
import {
  addUsage, ChatError, estimateInputTokens, NO_USAGE, textOf, usageUsd,
  type ChatMessage, type ChatProvider, type ChatTool, type ToolResultBlock, type Usage,
} from "./chat.ts";

/**
 * Runs one tool call: the affordance `affordanceForTool(name)` names, as the human the model acts for. Returns the
 * affordance's result; throws (an `Error` whose message the model reads) when it is refused or fails.
 */
export type Perform = (toolName: string, args: Record<string, unknown>) => Promise<unknown>;

export interface RunOptions {
  provider: ChatProvider;
  system: string;
  /** The conversation so far, ending with the human's (or the engine's) message. Not modified. */
  messages: readonly ChatMessage[];
  tools: readonly ChatTool[];
  perform: Perform;
  /** Model calls at most (default 8). */
  maxSteps?: number;
  /** Output ceiling per call (default 16,000). */
  maxOutputTokens?: number;
  budget?: Budget;
  signal?: AbortSignal;
}

export interface ToolCall { id: string; name: string; args: Record<string, unknown>; ok: boolean }

export interface RunResult {
  /** The whole conversation: the given messages, then this run's assistant steps and tool results. */
  messages: ChatMessage[];
  /** The last step's text (the final answer when `stop` is "final"). */
  text: string;
  /** "final": the model answered; "steps": the step cap; "budget": the next call would not fit the budget. */
  stop: "final" | "steps" | "budget";
  steps: number;
  toolCalls: ToolCall[];
  usage: Usage;
  usd: number;
}

/** A tool result's text: the data, marked untrusted (players write the game's strings). */
export const untrustedContent = (data: unknown) => JSON.stringify(wrapResult(data));

export async function runAssistant(o: RunOptions): Promise<RunResult> {
  const maxSteps = o.maxSteps ?? 8, maxOutputTokens = o.maxOutputTokens ?? 16_000;
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1) throw new Error("maxSteps must be a positive integer");
  const names = new Set(o.tools.map(t => t.name));
  const messages: ChatMessage[] = [...o.messages];
  const toolCalls: ToolCall[] = [];
  let usage = NO_USAGE, usd = 0, steps = 0, text = "";
  const done = (stop: RunResult["stop"]): RunResult => ({ messages, text, stop, steps, toolCalls, usage, usd });

  while (true) {
    if (steps >= maxSteps) return done("steps");
    const request = { system: o.system, messages, tools: o.tools, maxOutputTokens, signal: o.signal };
    if (o.budget && !o.budget.allows(o.provider.prices, estimateInputTokens(request), maxOutputTokens)) return done("budget");
    steps++;
    let step;
    try { step = await o.provider.step(request); } catch (error) {
      // A billed failure (a cut answer, a refusal) still counts against the budget.
      if (error instanceof ChatError && error.usage) o.budget?.record(o.provider.prices, error.usage);
      throw error;
    }
    usage = addUsage(usage, step.usage);
    usd += o.budget ? o.budget.record(o.provider.prices, step.usage) : usageUsd(o.provider.prices, step.usage);
    messages.push({ role: "assistant", content: step.content });
    text = textOf(step.content);
    const calls = step.content.flatMap(b => b.type === "tool_use" ? [b] : []);
    if (!calls.length) return done("final");

    const results: ToolResultBlock[] = [];
    for (const call of calls) {
      let content: string, ok = false;
      if (!names.has(call.name)) content = `Unknown tool: ${call.name}`;
      else {
        try { content = untrustedContent(await o.perform(call.name, call.input)); ok = true; }
        catch (error) {
          // A failure's message may quote players' strings too: marked like a result.
          content = `${UNTRUSTED_NOTICE}\nFailed: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
      toolCalls.push({ id: call.id, name: call.name, args: call.input, ok });
      results.push({ type: "tool_result", toolUseId: call.id, content, ...(ok ? {} : { isError: true }) });
      o.signal?.throwIfAborted();
    }
    messages.push({ role: "user", content: results });
  }
}
