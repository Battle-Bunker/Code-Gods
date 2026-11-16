/** `code.*`: run a read-only script over a game's data (v1's run_code, A15), and read the caller's own runs back. */
import { OpFailure } from "@workspace/v2-affordances";
import { makeFunctionReference } from "convex/server";
import { callerOf, defineOp, inGame } from "./define";
import { pageOf } from "./paging";
import { MAX_SCRIPTS, STORE_LIMITS } from "../codeData";

const RUN = makeFunctionReference<"action", Record<string, unknown>, Record<string, unknown> & { refused?: string }>("v2/codeRun:run");

export const { op: run, as: runAs } = defineOp("code.run", "action", async (env, a) => {
  const c = callerOf(env);
  const out = await env.ctx.runAction(RUN, { userId: c.userId!, scope: c.scope, ...(a.language ? { language: a.language } : {}), ...(a.source !== undefined ? { source: a.source } : {}),
    ...(a.script !== undefined ? { script: a.script } : {}), ...(a.saveAs !== undefined ? { saveAs: a.saveAs } : {}), ...(a.load ? { load: a.load } : {}), dataset: a.dataset, ...(a.params !== undefined ? { params: a.params } : {}), ...(a.title ? { title: a.title } : {}) });
  if (out.refused) throw new OpFailure(out.refused);
  return out as never;
});

/** One of the caller's runs, whole (its result's JSON, its output and its source): one document. */
export const { op: get, as: getAs } = defineOp("code.get", "query", async (env, a) => {
  const id = env.ctx.db.normalizeId("v2CodeRuns", a.runId);
  const row = id ? await env.ctx.db.get(id) : null;
  if (!row || row.userId !== callerOf(env).userId) throw new OpFailure("No such run of yours.");
  return {
    runId: row._id, title: row.title, language: row.language, source: row.source, dataset: row.dataset, gameId: row.gameId ?? null,
    status: row.status, result: row.resultJson !== undefined ? JSON.parse(row.resultJson) : null, error: row.error ?? null, output: row.output, ms: row.ms, at: row.at,
  };
});

/** The caller's runs, newest first: one index page of titles and outcomes (code.get for one whole). */
export const { op: list, as: listAs } = defineOp("code.list", "query", async (env, a) => {
  const userId = callerOf(env).userId!;
  const page = await env.ctx.db.query("v2CodeRuns").withIndex("by_user_at", q => q.eq("userId", userId)).order("desc").paginate(pageOf(a));
  return {
    page: page.page.map(r => ({ runId: r._id, title: r.title, language: r.language, dataset: r.dataset, status: r.status, ms: r.ms, at: r.at })),
    nextCursor: page.isDone ? null : page.continueCursor,
  };
});

/** The caller's saved scripts (≤ MAX_SCRIPTS, by name): one index range. */
export const { op: scripts, as: scriptsAs } = defineOp("code.scripts", "query", async env => {
  const userId = callerOf(env).userId!;
  const rows = await env.ctx.db.query("v2CodeScripts").withIndex("by_user_name", q => q.eq("userId", userId)).take(MAX_SCRIPTS);
  return { scripts: rows.map(r => ({ name: r.name, language: r.language, title: r.title, updatedAt: r.updatedAt })) };
});

export const { op: deleteScript, as: deleteScriptAs } = defineOp("code.deleteScript", "mutation", async (env, a) => {
  const userId = callerOf(env).userId!;
  const row = await env.ctx.db.query("v2CodeScripts").withIndex("by_user_name", q => q.eq("userId", userId).eq("name", a.name)).unique();
  if (row) await env.ctx.db.delete(row._id);
  return { deleted: !!row };
});

/** The caller's store keys in this game (≤ STORE_LIMITS.objects): one index range, values not read out. */
export const { op: objects, as: objectsAs } = defineOp("code.objects", "query", async (env, a) => {
  const { game } = inGame(env), userId = callerOf(env).userId!, prefix = a.prefix ?? "";
  const rows = await env.ctx.db.query("v2CodeObjects").withIndex("by_user_game_key", q => q.eq("userId", userId).eq("gameId", game._id).gte("key", prefix).lt("key", prefix + "\uffff")).take(STORE_LIMITS.objects);
  return { objects: rows.map(r => ({ key: r.key, bytes: r.bytes, updatedAt: r.updatedAt })) };
});
