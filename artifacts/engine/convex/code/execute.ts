"use node";
/**
 * One code run (docs/assistant/code-execution.md §4), as the principal: admit and record it (code/runs.ts start: member,
 * budget, one at a time), resolve its datasets server-side (code/datasets.ts), run `main(data)` in the instance's warm
 * script pool (runtime/node.ts), store the outcome in the human's codeRuns row (file storage for a large result), and
 * return a bounded summary for the model. A script reads only: it gets JSON and returns JSON; it cannot act in the game.
 */
import { createHash } from "node:crypto";
import { v } from "convex/values";
import { RuntimeError, type ScriptResult } from "@workspace/game-runtime";
import type { DatasetRequest } from "@workspace/player-client/datasets";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { messageOf } from "../lib/errors";
import { principalV, type Principal } from "../lib/rooms";
import { bindRuntime, scriptRuntimeFor } from "../runtime/node";
import { resolveDatasets } from "./datasets";
import { CODE_LIMITS } from "./limits";

const language = v.union(v.literal("python"), v.literal("typescript"));
export const runArgs = {
  roomId: v.string(), language, source: v.string(), title: v.optional(v.string()),
  /** DatasetRequest[] as JSON (validated by the tool's schema). */
  datasetsJson: v.string(), paramsJson: v.optional(v.string()), cpuMs: v.optional(v.number()),
};

/** What run_code returns to the model: bounded; the whole result is in the run's row (get_code_run, the code-output panel). */
export type RunOutcome = {
  TRUNCATED?: string;
  runId: string; status: "ok" | "error"; title: string | null;
  error?: { code: string; message: string };
  result?: unknown; resultPreview?: string; resultChars?: number;
  output: string; outputTruncated: boolean;
  cpuMs: number; wallMs: number; inputBytes: number;
  show: string;
};

const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max) : text);

export async function runCode(ctx: ActionCtx, principal: Principal, args: { roomId: string; language: "python" | "typescript"; source: string; title?: string;
  datasetsJson: string; paramsJson?: string; cpuMs?: number }): Promise<RunOutcome> {
  const started = performance.now();
  const { runId, cpuMs } = await ctx.runMutation(internal.code.runs.start, {
    principal, roomId: args.roomId, language: args.language, source: args.source, ...(args.title ? { title: args.title } : {}),
    datasetsJson: args.datasetsJson, ...(args.paramsJson ? { paramsJson: args.paramsJson } : {}), cpuMs: args.cpuMs ?? CODE_LIMITS.cpuMsDefault,
  });
  const show = `open_panel {panelId: "code-output", params: {runId: "${runId}"}} shows this run to the player`;
  const base = { runId, title: args.title ?? null, show };
  let inputBytes = 0;
  const failed = async (error: { code: string; message: string }, usedMs: number): Promise<RunOutcome> => {
    const wallMs = Math.round(performance.now() - started);
    await ctx.runMutation(internal.code.runs.finish, { runId, status: "error", error, cpuMs: usedMs, wallMs, inputBytes });
    return { ...base, status: "error", error, output: "", outputTruncated: false, cpuMs: usedMs, wallMs, inputBytes };
  };
  let input: string;
  try {
    const datasets = await resolveDatasets(ctx, principal, args.roomId, JSON.parse(args.datasetsJson) as DatasetRequest[]);
    input = JSON.stringify({ ...datasets, params: args.paramsJson ? JSON.parse(args.paramsJson) as unknown : {} });
    inputBytes = Buffer.byteLength(input);
  } catch (error) {
    return failed({ code: "DATASETS", message: `Reading the datasets failed: ${messageOf(error)}`.slice(0, 500) }, 0);
  }
  if (inputBytes > CODE_LIMITS.inputBytes) {
    return failed({ code: "DATASETS", message: `The datasets are ${(inputBytes / 1048576).toFixed(1)} MiB of JSON; the limit is ${CODE_LIMITS.inputBytes / 1048576} MiB: ask for fewer datasets or a smaller limit` }, 0);
  }
  // Deterministic: the same script over the same data draws the same random numbers.
  const seed = "0x" + createHash("sha256").update(args.language).update("\0").update(args.source).update("\0").update(input).digest("hex").slice(0, 16);
  let run: ScriptResult;
  try {
    if (args.language === "python") await bindRuntime(ctx);
    run = await scriptRuntimeFor(args.language).script(args.source, input, { cpuMs, seed });
  } catch (error) {
    const code = error instanceof RuntimeError ? error.code : "INTERNAL";
    // A script stopped at its budget used all of it; any other failure is charged what it is known to have used (none).
    return failed({ code, message: messageOf(error).slice(0, 1000) }, code === "LIMIT" && /Time limit/.test(messageOf(error)) ? cpuMs : 0);
  }
  const wallMs = Math.round(performance.now() - started);
  const clipped = run.result.length > CODE_LIMITS.rowResultChars || run.output.length > CODE_LIMITS.rowOutputChars;
  let fullId: Id<"_storage"> | undefined;
  if (clipped) fullId = await ctx.storage.store(new Blob([JSON.stringify({ result: run.result, output: run.output })], { type: "application/json" }));
  await ctx.runMutation(internal.code.runs.finish, {
    runId, status: "ok", resultJson: clip(run.result, CODE_LIMITS.rowResultChars), output: clip(run.output, CODE_LIMITS.rowOutputChars),
    resultChars: run.result.length, outputChars: run.output.length, clipped, outputTruncated: run.outputTruncated, ...(fullId ? { fullId } : {}),
    cpuMs: run.cpuMs, wallMs, inputBytes,
  });
  const small = run.result.length <= CODE_LIMITS.previewResultChars;
  const cut: string[] = [];
  if (!small) cut.push(`result shows the first ${CODE_LIMITS.previewResultChars} of ${run.result.length} characters (get_code_run {runId, part: "result", offset: ${CODE_LIMITS.previewResultChars}} for more)`);
  if (run.output.length > CODE_LIMITS.previewOutputChars) cut.push(`output shows the first ${CODE_LIMITS.previewOutputChars} of ${run.output.length} characters (get_code_run part "output")`);
  if (run.outputTruncated) cut.push(`the script printed more than the sandbox keeps; output was clipped at the source`);
  return {
    ...(cut.length ? { TRUNCATED: cut.join("; ") } : {}),
    ...base, status: "ok",
    ...(small ? { result: JSON.parse(run.result) as unknown } : { resultPreview: run.result.slice(0, CODE_LIMITS.previewResultChars), resultChars: run.result.length }),
    output: run.output.slice(0, CODE_LIMITS.previewOutputChars), outputTruncated: run.outputTruncated,
    cpuMs: run.cpuMs, wallMs, inputBytes,
  };
}

/** The registry's run_code (agent/registry.ts). */
export const runAs = internalAction({
  args: { principal: principalV, ...runArgs },
  handler: (ctx, { principal, ...args }): Promise<RunOutcome> => runCode(ctx, principal, args),
});

/** A run's whole {result, output} from file storage (get_code_run past the row's prefix). */
export const fullText = internalAction({
  args: { principal: principalV, roomId: v.string(), runId: v.string() },
  handler: async (ctx, args): Promise<{ result: string; output: string } | null> => {
    const id: Id<"_storage"> | null = await ctx.runQuery(internal.code.runs.fullOf, args);
    const blob = id ? await ctx.storage.get(id) : null;
    return blob ? JSON.parse(await blob.text()) as { result: string; output: string } : null;
  },
});
