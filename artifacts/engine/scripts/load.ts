/**
 * The engine's load run, manual mode (test/load-harness.ts; the quick mode is test/game-load.test.ts in the game suite):
 * N rooms started at the same moment, short fixed-length games, every human god summoning agents during planning,
 * optional mock AI seats. Prints one summary line per run and writes the whole result as JSON.
 *
 *   pnpm --filter @workspace/engine load -- --games 20 --ai 2 --seconds 90
 *
 *   --games N        rooms started together (default 5)
 *   --ai N           mock AI seats per game (default 0; local only: they need AI_MOCK and an admin owner)
 *   --humans N       human gods per game (default 3 − ai, at least 1); each summons 1–2 `add(1)` agents in planning
 *   --seconds N      the game's fixed length in world seconds (default 75)
 *   --planning N     planning seconds (default 12)
 *   --language L     typescript | python (default typescript)
 *   --rate HZ        interactionRateHz (default: the setup's)
 *   --cap N          stop waiting N seconds after the start (default planning + seconds + 240); unfinished games are
 *                    reported as NOT ENDED and ended
 *   --out FILE       the JSON result (default load-<games>g-<ai>ai-<time>.json in the working directory)
 *   --log FILE       the dev engine's log file to count too (default $CG_DEV_LOG; optional)
 *   --end-all        LOCAL ONLY: first end every live game of the deployment (leftovers of an earlier run)
 *   --target dev     run against a cloud DEV deployment (see below); without it only the local backend is accepted
 *
 * Target. By default the local backend of `pnpm --filter @workspace/engine dev` (its URL and admin key are read from
 * .convex/local/default/config.json). It NEVER runs against production: it refuses a `prod:` key, a URL the key
 * does not name, and any cloud URL without `--target dev` and a `dev:` (or `preview:`) deploy key. The harness's
 * fixtures (convex/testing.ts) are a second lock: they refuse unless the deployment has TEST_FIXTURES=1 (or DEV=1),
 * which production never has (PILOT.md).
 *
 * Against the cloud dev deployment (humans only: AI seats there would call real providers, and need a fixture admin):
 *   1. turn the fixtures on, on DEV only (never --prod):
 *        cd artifacts/engine && CONVEX_DEPLOY_KEY='dev:<name>|…' npx convex env set TEST_FIXTURES 1
 *   2. run it (the key only for this command, never exported; PILOT.md "Deploy keys"):
 *        CG_LOAD_URL=https://<name>.convex.cloud CG_LOAD_ADMIN_KEY='dev:<name>|…' \
 *          pnpm --filter @workspace/engine load -- --target dev --games 20 --seconds 90
 *      (CG_LOAD_SITE_URL overrides the site URL, default https://<name>.convex.site: the issuer of the impersonated
 *      sessions, which must equal the deployment's CONVEX_SITE_URL.)
 *   3. turn them off again:  CONVEX_DEPLOY_KEY='dev:<name>|…' npx convex env remove TEST_FIXTURES
 *   It seeds `test|…` users and Load rooms there (left behind, like any test data) and ends only its own games.
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { gameLines, localTarget, runLoad, table, type Target } from "../test/load-harness.ts";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

// pnpm passes its own `--` separator through: drop it.
const { values } = parseArgs({ args: process.argv.slice(2).filter(a => a !== "--"), options: {
  games: { type: "string", default: "5" }, ai: { type: "string", default: "0" }, humans: { type: "string" }, seconds: { type: "string", default: "75" },
  planning: { type: "string", default: "12" }, language: { type: "string", default: "typescript" }, rate: { type: "string" }, cap: { type: "string" },
  out: { type: "string" }, log: { type: "string" }, "end-all": { type: "boolean", default: false }, target: { type: "string", default: "local" },
} });
const refuse = (why: string): never => { console.error(`load: ${why}`); process.exit(1); };

/** The deployment to load, or a refusal: local by default, a cloud dev deployment only when asked for by name. */
function resolveTarget(): { target: Target; local: boolean } {
  const url = process.env.CG_LOAD_URL, key = process.env.CG_LOAD_ADMIN_KEY;
  if (values.target === "local") {
    if (url || key) refuse("CG_LOAD_URL / CG_LOAD_ADMIN_KEY are set but --target is local; pass --target dev to load the cloud dev deployment, or unset them");
    return { target: localTarget(), local: true };
  }
  if (values.target !== "dev") refuse(`--target is "local" or "dev", never "${values.target}" (this never runs against production)`);
  if (!url || !key) refuse("--target dev needs CG_LOAD_URL (https://<name>.convex.cloud) and CG_LOAD_ADMIN_KEY (that deployment's dev deploy key)");
  const kind = /^([a-z]+):([a-z0-9-]+)\|/.exec(key!);
  if (!kind) refuse("CG_LOAD_ADMIN_KEY is not a Convex deploy key (dev:<name>|…)");
  if (kind![1] === "prod") refuse("CG_LOAD_ADMIN_KEY is a PRODUCTION deploy key: this never runs against production");
  if (kind![1] !== "dev" && kind![1] !== "preview") refuse(`CG_LOAD_ADMIN_KEY is a "${kind![1]}" key; only dev (or preview) deployments are loaded`);
  const host = new URL(url!).hostname;
  if (host !== `${kind![2]}.convex.cloud`) refuse(`CG_LOAD_URL (${host}) is not the deployment the key names (${kind![2]}.convex.cloud)`);
  if (/^prod:/.test(process.env.CONVEX_DEPLOYMENT ?? "") || process.env.CONVEX_DEPLOY_KEY?.startsWith("prod:")) refuse("CONVEX_DEPLOYMENT / CONVEX_DEPLOY_KEY name a production deployment in this shell; unset them");
  return { target: { url: url!, adminKey: key!, siteUrl: process.env.CG_LOAD_SITE_URL ?? `https://${kind![2]}.convex.site` }, local: false };
}

const { target, local } = resolveTarget();
const games = Number(values.games), aiSeats = Number(values.ai), lifetimeSeconds = Number(values.seconds), planningSeconds = Number(values.planning);
if (!(games >= 1 && games <= 200)) refuse("--games is 1 to 200");
if (aiSeats && !local) refuse("--ai is local only: on a cloud deployment the seats would call real providers");
if (values.language !== "typescript" && values.language !== "python") refuse("--language is typescript or python");
if (values["end-all"]) {
  if (!local) refuse("--end-all is local only: it ends every live game of the deployment");
  const admin = new ConvexHttpClient(target.url);
  (admin as unknown as { setAdminAuth(key: string): void }).setAdminAuth(target.adminKey);
  const { ended } = await admin.mutation((anyApi as any).testing.endGames, {});
  if (ended) { console.log(`load: ended ${ended} leftover games; letting their ticks drain`); await new Promise(r => setTimeout(r, 5000)); }
}

console.log(`load: ${games} games × (${values.humans ?? Math.max(1, 3 - aiSeats)} humans + ${aiSeats} AI), ${planningSeconds} s planning + ${lifetimeSeconds} s, on ${target.url}`);
const result = await runLoad({
  games, aiSeats, lifetimeSeconds, planningSeconds, language: values.language as "typescript" | "python", target,
  ...(values.humans ? { humans: Number(values.humans) } : {}), ...(values.cap ? { capMs: Number(values.cap) * 1000 } : {}),
  ...(values.rate ? { settings: { interactionRateHz: Number(values.rate) } } : {}),
  devLog: values.log ?? process.env.CG_DEV_LOG, log: line => console.log(`load: ${line}`),
});
const out = values.out ?? `load-${games}g-${aiSeats}ai-${result.startedAt.replace(/[:.]/g, "-")}.json`;
writeFileSync(out, JSON.stringify(result, null, 1));
console.log(`\n${gameLines(result)}\n`);
console.log("functions by total time (count, mean / p95 / max ms, peak in flight for actions):");
for (const [id, f] of Object.entries(result.logs.functions).slice(0, 12)) {
  console.log(`  ${id.padEnd(34)} ${String(f.count).padStart(6)}  ${f.meanMs} / ${f.p95Ms} / ${f.maxMs}${f.peakConcurrent ? `  peak ${f.peakConcurrent}` : ""}${f.errors ? `  errors ${f.errors}` : ""}`);
}
for (const [error, n] of Object.entries(result.logs.errors).slice(0, 8)) console.log(`  error ×${n}: ${error}`);
console.log(`\n${table([result])}\n`);
console.log(`load: ${result.capped ? "CAPPED (unfinished games were ended); " : ""}wall ${Math.round(result.wallMs / 1000)} s; probe p50 ${result.probe.p50Ms} ms, max ${result.probe.maxMs} ms; result in ${out}`);
process.exit(0);
