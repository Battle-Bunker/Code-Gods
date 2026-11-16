"use node";
/**
 * `code.run` (v1's run_code, A15): resolve the dataset for the caller (codeData.ts), run the script in a QuickJS context of
 * its own (codeScript.ts), record the run (one v2CodeRuns row) and return a bounded summary. Read-only: a script cannot
 * act in a game.
 */
import { getQuickJS } from "quickjs-emscripten";
import * as typescript from "typescript";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { runScript } from "./codeScript";

const ts = ((typescript as { default?: typeof typescript }).default ?? typescript) as typeof typescript;
const transpile = (source: string) => {
  const out = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true });
  const errors = (out.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(ts.flattenDiagnosticMessageText(errors[0]!.messageText, "\n"));
  return out.outputText;
};

type Resolved = { refused: string } | { gameId: Id<"v2Games">; file: Id<"_storage"> | null; rows: unknown[] | null };
const DATASET = makeFunctionReference<"query", Record<string, unknown>, Resolved>("v2/codeData:dataset");
const RECORD = makeFunctionReference<"mutation", Record<string, unknown>, Id<"v2CodeRuns">>("v2/codeData:record");
const SCRIPT = makeFunctionReference<"query", { userId: string; name: string }, { language: string; source: string; title: string } | null>("v2/codeData:script");
const LOAD = makeFunctionReference<"query", { userId: string; gameId: Id<"v2Games">; scopes: string[] }, { refused: string } | { objects: Record<string, unknown> }>("v2/codeData:loadObjects");
const COMMIT = makeFunctionReference<"mutation", Record<string, unknown>, { refused: string } | { written: string[]; deleted: string[] }>("v2/codeData:commitWrites");
const SAVE = makeFunctionReference<"mutation", Record<string, unknown>, { saved: boolean; reason?: string }>("v2/codeData:saveScript");

/** What the caller (and an assistant) gets back: bounded; the whole result is the run's row (code.get). */
const PREVIEW = 4000;

export const run = internalAction({
  args: {
    userId: v.string(), scope: v.any(), language: v.optional(v.union(v.literal("typescript"), v.literal("javascript"))), source: v.optional(v.string()),
    /** A saved script to run instead of `source` (v1's `script`), and a name to save the source under after a good run (`saveAs`). */
    script: v.optional(v.string()), saveAs: v.optional(v.string()),
    /** The object store's keys or "prefix*" scopes to load into the script's `store` (v1's `load`). */
    load: v.optional(v.array(v.string())),
    dataset: v.union(v.literal("replay"), v.literal("my-moves"), v.literal("none")), params: v.optional(v.any()), title: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    let language = a.language, source = a.source, title = a.title;
    if (a.script !== undefined) {
      if (source !== undefined) return { refused: "Give a source or a saved script's name, not both." };
      const saved = await ctx.runQuery(SCRIPT, { userId: a.userId, name: a.script });
      if (!saved) return { refused: `You have no saved script ${JSON.stringify(a.script)} (save one with saveAs).` };
      language = saved.language as "typescript" | "javascript"; source = saved.source; title ??= saved.title;
    }
    if (source === undefined || language === undefined) return { refused: "Give a language and a source, or a saved script's name." };
    const d = await ctx.runQuery(DATASET, { userId: a.userId, scope: a.scope, dataset: a.dataset });
    if ("refused" in d) return { refused: d.refused };
    let dataJson = "null";
    if (d.file) {
      const blob = await ctx.storage.get(d.file);
      if (!blob) return { refused: "This game's replay file is missing." };
      dataJson = await blob.text();
    } else if (d.rows) dataJson = JSON.stringify(d.rows);
    const loaded = a.load?.length ? await ctx.runQuery(LOAD, { userId: a.userId, gameId: d.gameId, scopes: a.load }) : { objects: {} };
    if ("refused" in loaded) return { refused: loaded.refused };
    const outcome = runScript(await getQuickJS(), transpile, { language, source, dataJson, params: a.params ?? {}, store: loaded.objects });
    // A good run's store writes, checked and applied all or none (an error writes nothing).
    const writes = outcome.status === "ok" && (Object.keys(outcome.writes.put).length || outcome.writes.delete.length) ? outcome.writes : null;
    const store = writes ? await ctx.runMutation(COMMIT, { userId: a.userId, gameId: d.gameId, put: writes.put, delete: writes.delete }) : null;
    const shown = (title ?? "").trim().slice(0, 80) || a.script || `${a.dataset} script`;
    const runId = await ctx.runMutation(RECORD, {
      userId: a.userId, gameId: d.gameId, title: shown, language, source, dataset: a.dataset, status: outcome.status,
      ...(outcome.status === "ok" ? { resultJson: outcome.resultJson } : { error: outcome.error }), output: outcome.output, ms: outcome.ms,
    });
    // v1's saveAs: the source is kept under its name once it ran without an error.
    const saved = a.saveAs !== undefined && outcome.status === "ok" ? await ctx.runMutation(SAVE, { userId: a.userId, name: a.saveAs, language, source, title: shown }) : null;
    return {
      runId, status: outcome.status, title: shown, store, saved: saved ? (saved.saved ? a.saveAs! : null) : null, ...(saved && !saved.saved ? { saveRefused: saved.reason } : {}),
      resultPreview: outcome.status === "ok" ? outcome.resultJson.slice(0, PREVIEW) : null,
      resultChars: outcome.status === "ok" ? outcome.resultJson.length : 0,
      error: outcome.status === "error" ? outcome.error : null,
      output: outcome.output.slice(0, PREVIEW), ms: outcome.ms,
    };
  },
});
