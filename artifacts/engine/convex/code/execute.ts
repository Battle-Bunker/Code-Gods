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
import { fail, messageOf } from "../lib/errors";
import { principalV, type Principal } from "../lib/rooms";
import { bindRuntime, scriptRuntimeFor } from "../runtime/node";
import { resolveDatasets } from "./datasets";
import { CODE_LIMITS } from "./limits";

const language = v.union(v.literal("python"), v.literal("typescript"));
export const runArgs = {
  roomId: v.string(), language: v.optional(language), title: v.optional(v.string()),
  /** The script's source, or `script`: the key of a saved script (scripts/<name>) to run. */
  source: v.optional(v.string()), script: v.optional(v.string()),
  /** DatasetRequest[] as JSON (validated by the tool's schema). */
  datasetsJson: v.string(), paramsJson: v.optional(v.string()), cpuMs: v.optional(v.number()),
  /** The human's objects to load into the run's store: keys and "prefix*" scopes. */
  load: v.optional(v.array(v.string())),
  /** Save the source as the object scripts/<saveAs> after a successful run (counted in the quota). */
  saveAs: v.optional(v.string()),
};
type RunArgs = { roomId: string; language?: "python" | "typescript"; title?: string; source?: string; script?: string; datasetsJson: string;
  paramsJson?: string; cpuMs?: number; load?: string[]; saveAs?: string };

/** What run_code returns to the model: bounded; the whole result is the object runs/<runId> (get_code_run, the code-output panel). */
export type RunOutcome = {
  TRUNCATED?: string;
  runId: string; status: "ok" | "error"; title: string | null;
  error?: { code: string; message: string };
  result?: unknown; resultPreview?: string; resultChars?: number;
  output: string; outputTruncated: boolean;
  /** The run's store writes: committed keys, or why the engine refused them (then nothing was written). */
  store?: { written: string[]; deleted: string[] } | { refused: string };
  cpuMs: number; wallMs: number; inputBytes: number;
  show: string;
};

const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max) : text);
const SCRIPT_NAME = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,63}$/;

/** A JSON value as stored: inline in its row when small, else uploaded to file storage first. */
async function stored(ctx: ActionCtx, key: string, valueJson: string) {
  const bytes = Buffer.byteLength(valueJson);
  if (valueJson.length <= CODE_LIMITS.inlineValueChars) return { key, valueJson, bytes };
  return { key, storageId: await ctx.storage.store(new Blob([valueJson], { type: "application/json" })), bytes };
}

/** The loaded objects as the runtime's store text {scope, objects}, fetching blobs from storage. */
async function loadStore(ctx: ActionCtx, principal: Principal, scopes: string[]): Promise<{ text: string; values: Map<string, unknown> }> {
  const rows: { key: string; valueJson: string | null; storageId: Id<"_storage"> | null }[] = scopes.length ? await ctx.runQuery(internal.code.objects.loadAs, { principal, scopes }) : [];
  const values = new Map<string, unknown>();
  for (const r of rows) {
    const text = r.valueJson ?? (r.storageId ? await (await ctx.storage.get(r.storageId))?.text() : undefined);
    if (text !== undefined) values.set(r.key, JSON.parse(text) as unknown);
  }
  return { text: JSON.stringify({ scope: scopes, objects: Object.fromEntries(values) }), values };
}

export async function runCode(ctx: ActionCtx, principal: Principal, args: RunArgs): Promise<RunOutcome> {
  const started = performance.now();
  if (args.saveAs !== undefined && !SCRIPT_NAME.test(args.saveAs)) return fail("BAD_REQUEST", "saveAs is a script name: 1-64 letters, digits, _ - .");
  // A saved script: the object scripts/<name> holds {language, source, title}.
  let source = args.source, lang = args.language, title = args.title;
  if (args.script !== undefined) {
    if (source !== undefined) return fail("BAD_REQUEST", "Give source or script, not both");
    const { values } = await loadStore(ctx, principal, [args.script]);
    const saved = values.get(args.script) as { language?: string; source?: string; title?: string } | undefined;
    if (!saved || typeof saved.source !== "string" || (saved.language !== "python" && saved.language !== "typescript")) {
      return fail("NOT_FOUND", `No saved script ${JSON.stringify(args.script)} (save one with run_code saveAs)`);
    }
    source = saved.source; lang = saved.language; title ??= saved.title;
  }
  if (source === undefined || lang === undefined) return fail("BAD_REQUEST", "run_code needs a language and a source, or a saved script");
  const scopes = args.load ?? [];
  const { runId, cpuMs, roomId } = await ctx.runMutation(internal.code.runs.start, {
    principal, roomId: args.roomId, language: lang, source, ...(title ? { title } : {}),
    datasetsJson: args.datasetsJson, ...(args.paramsJson ? { paramsJson: args.paramsJson } : {}), objectsJson: JSON.stringify(scopes),
    cpuMs: args.cpuMs ?? CODE_LIMITS.cpuMsDefault,
  });
  const show = `open_panel {panelId: "code-output", params: {runId: "${runId}"}} shows this run to the player`;
  const base = { runId, title: title ?? null, show };
  let inputBytes = 0;
  const failed = async (error: { code: string; message: string }, usedMs: number): Promise<RunOutcome> => {
    const wallMs = Math.round(performance.now() - started);
    await ctx.runMutation(internal.code.runs.finish, { runId, status: "error", error, cpuMs: usedMs, wallMs, inputBytes });
    return { ...base, status: "error", error, output: "", outputTruncated: false, cpuMs: usedMs, wallMs, inputBytes };
  };
  let input: string, store: string;
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
  try { store = (await loadStore(ctx, principal, scopes)).text; }
  catch (error) { return failed({ code: "OBJECTS", message: `Loading the objects failed: ${messageOf(error)}`.slice(0, 500) }, 0); }
  // Deterministic: the same script over the same data and objects draws the same random numbers.
  const seed = "0x" + createHash("sha256").update(lang).update("\0").update(source).update("\0").update(input).update("\0").update(store).digest("hex").slice(0, 16);
  let run: ScriptResult;
  if (lang === "python") await bindRuntime(ctx);
  const scriptStarted = performance.now();
  try {
    run = await scriptRuntimeFor(lang).script(source, input, { cpuMs, seed, store });
  } catch (error) {
    const code = error instanceof RuntimeError ? error.code : "INTERNAL";
    // A failed run reports no CPU, so it is charged the time the sandbox spent on it (wall time, at most its budget):
    // a script that loops and then raises still pays for the loop. Its store writes are discarded.
    return failed({ code, message: messageOf(error).slice(0, 1000) }, Math.min(cpuMs, Math.round(performance.now() - scriptStarted)));
  }
  // The run's store writes (UNTRUSTED guest output): the engine checks every key, size and the quota in commitAs.
  let storeOutcome: RunOutcome["store"];
  {
    const writes = JSON.parse(run.writes) as { put?: Record<string, unknown>; delete?: unknown[] };
    const putEntries = Object.entries(writes.put ?? {});
    if (args.saveAs !== undefined) putEntries.push([`scripts/${args.saveAs}`, { language: lang, source, ...(title ? { title } : {}) }]);
    const deletes = (writes.delete ?? []).map(String);
    if (putEntries.length || deletes.length) {
      const texts = putEntries.map(([key, value]) => [key, JSON.stringify(value)] as const);
      // A write set commitAs will refuse anyway (too many keys, a value too large) is sent as sizes only: nothing is
      // uploaded, and the refusal is still checked and recorded in one place.
      const doomed = texts.length + deletes.length > CODE_LIMITS.writesPerRun || texts.some(([, t]) => Buffer.byteLength(t) > CODE_LIMITS.valueBytes);
      const puts = doomed ? texts.map(([key, t]) => ({ key, valueJson: "null", bytes: Buffer.byteLength(t) }))
        : await Promise.all(texts.map(([key, t]) => stored(ctx, key, t)));
      const committed = await ctx.runMutation(internal.code.objects.commitAs, { principal, roomId, runId, puts, deletes });
      storeOutcome = committed.ok ? { written: committed.written, deleted: committed.deleted } : { refused: committed.reason };
    }
  }
  const wallMs = Math.round(performance.now() - started);
  const clipped = run.result.length > CODE_LIMITS.rowResultChars || run.output.length > CODE_LIMITS.rowOutputChars;
  // The whole result is the object runs/<runId>, in the same per-user store the panel and later scripts read.
  const full = await stored(ctx, `runs/${runId}`, `{"result":${run.result},"output":${JSON.stringify(run.output)}}`);
  await ctx.runMutation(internal.code.objects.putRunResult, { runId, ...(full.valueJson ? { valueJson: full.valueJson } : {}), ...(full.storageId ? { storageId: full.storageId } : {}), bytes: full.bytes });
  await ctx.runMutation(internal.code.runs.finish, {
    runId, status: "ok", resultJson: clip(run.result, CODE_LIMITS.rowResultChars), output: clip(run.output, CODE_LIMITS.rowOutputChars),
    resultChars: run.result.length, outputChars: run.output.length, clipped, outputTruncated: run.outputTruncated,
    ...(storeOutcome ? { storeJson: JSON.stringify(storeOutcome) } : {}), cpuMs: run.cpuMs, wallMs, inputBytes,
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
    ...(storeOutcome ? { store: storeOutcome } : {}),
    cpuMs: run.cpuMs, wallMs, inputBytes,
  };
}

/** The registry's run_code (agent/registry.ts). */
export const runAs = internalAction({
  args: { principal: principalV, ...runArgs },
  handler: (ctx, { principal, ...args }): Promise<RunOutcome> => runCode(ctx, principal, args),
});

/** A run's whole result and output, from its object runs/<runId> (get_code_run past the row's prefix). */
export const fullText = internalAction({
  args: { principal: principalV, roomId: v.string(), runId: v.string() },
  handler: async (ctx, args): Promise<{ result: string; output: string } | null> => {
    const full: { valueJson: string | null; storageId: Id<"_storage"> | null } | null = await ctx.runQuery(internal.code.runs.fullOf, args);
    const text = full?.valueJson ?? (full?.storageId ? await (await ctx.storage.get(full.storageId))?.text() : undefined);
    if (!text) return null;
    const value = JSON.parse(text) as { result: unknown; output: string };
    return { result: JSON.stringify(value.result), output: value.output };
  },
});
