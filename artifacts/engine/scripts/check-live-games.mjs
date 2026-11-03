#!/usr/bin/env node
/**
 * The deploy's last check (.github/workflows/deploy.yml): every game running when the deploy finished must still be
 * ticking. Read-only (engine/loop:liveProgress, twice): it never writes, pauses or resumes anything.
 *
 *   node scripts/check-live-games.mjs            the deployment CONVEX_DEPLOY_KEY names (CI), else the local one
 *   node scripts/check-live-games.mjs --prod     production
 *
 * A running game passes when its loop committed again within LIVE_CHECK_SECONDS (default 90: past one watchdog period
 * and the tick's retry backoff). It fails, loudly, when a running game committed nothing in that time, or reports the
 * engine retrying a failing tick (`engineError`) at the end of it. Planning, paused and parked games are listed but not
 * judged (their loops wait for a deadline or a human); with no running game the check passes at once.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prod = process.argv.includes("--prod") ? ["--prod"] : [];
const env = process.env.CONVEX_DEPLOY_KEY ? { ...process.env } : { ...process.env, CONVEX_AGENT_MODE: process.env.CONVEX_AGENT_MODE ?? "anonymous" };
const windowMs = Number(process.env.LIVE_CHECK_SECONDS ?? 90) * 1000;

function progress() {
  const r = spawnSync("npx", ["convex", "run", "engine/loop:liveProgress", "{}", ...prod], { cwd: root, env, encoding: "utf8" });
  if (r.status !== 0) { console.error(`[live-games] could not read the live games:\n${r.stderr}`); process.exit(1); }
  return JSON.parse(r.stdout);
}
const label = g => `${g.shortCode} (${g.id})`;

const first = progress();
const running = first.games.filter(g => g.phase === "running");
for (const g of first.games.filter(g => g.phase !== "running")) {
  console.log(`[live-games] ${label(g)}: ${g.phase}${g.idleParked ? " (idle park: resumes on human activity)" : ""}${g.engineError ? `, engine retrying: ${g.engineError.reason}` : ""}`);
}
if (!running.length) { console.log("[live-games] no running game: nothing to check"); process.exit(0); }
console.log(`[live-games] ${running.length} running game(s); checking that each ticks within ${windowMs / 1000} s`);

const deadline = Date.now() + windowMs;
const pending = new Map(running.map(g => [g.id, g]));
let last = first;
for (;;) {
  for (const g of last.games) {
    const before = pending.get(g.id);
    if (!before) continue;
    // Advanced (a commit), or left "running" on its own (ended, parked idle): the loop is alive.
    if (g.phase !== "running" || (g.commits > before.commits && !g.engineError)) {
      console.log(`[live-games] ${label(g)}: ok (${g.phase === "running" ? `${g.commits - before.commits} commit(s), world ${g.worldSeconds.toFixed(1)} s` : `now ${g.phase}`})`);
      pending.delete(g.id);
    }
  }
  for (const id of [...pending.keys()]) if (!last.games.some(g => g.id === id)) pending.delete(id);   // gone (ended)
  if (!pending.size) { console.log("[live-games] every running game is ticking"); process.exit(0); }
  if (Date.now() > deadline) break;
  await new Promise(r => setTimeout(r, 5000));
  last = progress();
}
for (const g of pending.values()) {
  const now = last.games.find(x => x.id === g.id);
  console.error(`::error::[live-games] ${label(g)} has not ticked for ${windowMs / 1000} s after the deploy` +
    (now?.engineError ? `: the engine is retrying a failing tick (${now.engineError.failures} failures since ${new Date(now.engineError.since).toISOString()}: ${now.engineError.reason}; see the deployment's logs for "tick … failed")` : ""));
}
process.exit(1);
