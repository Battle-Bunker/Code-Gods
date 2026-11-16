/** `server.*`: what this server runs (v1's "Server info" sheet, manifest.get; v1 audit A14). */
import { defineOp } from "./define";
import { LANGUAGES, RUNTIME_VERSION, readinessOf } from "../readiness";
import { MAX_DT, TICK_MS } from "../loop";

/** The deployed builds (convex/version.ts rows), each language's sandbox readiness and the tick: a handful of documents. */
export const { op: info, as: infoAs } = defineOp("server.info", "query", async env => {
  const db = env.ctx.db;
  const build = async (site: "app" | "functions") => {
    const row = await db.query("siteBuilds").withIndex("by_site", q => q.eq("site", site)).order("desc").first();
    return row ? { build: row.build, deployedAt: row.deployedAt } : null;
  };
  const sandboxes = [];
  for (const language of LANGUAGES) {
    const r = await readinessOf(env.ctx, language);
    sandboxes.push({ language, runtime: RUNTIME_VERSION[language], state: r?.state ?? "cold" as const, reason: r?.reason ?? null });
  }
  return { builds: { app: await build("app"), functions: await build("functions") }, sandboxes, engine: { tickMs: TICK_MS, maxSecondsPerTick: MAX_DT } };
});
