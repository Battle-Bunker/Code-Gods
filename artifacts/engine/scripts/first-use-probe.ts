/**
 * Cloud first-use latency of on-demand calibration (docs/analytic-calibration/architecture.md §9.1, §9.2): for each
 * shape, deal a 6-god game (Divine Lottery, seeded per shape; defence goals on where the type has them), keep the draws
 * without an analytic answer, ask the deployment for each table's split plan (`calibration/compute:plan`, measured
 * there), then run every piece at once (`calibration/compute:piece`, or `run` for a one-piece table) and merge each
 * split table here as the engine's `merge` would. Nothing is recorded on the deployment (no claim rows: `run` and
 * `piece` write nothing without one), so the probe is repeatable on shapes whose tables are shipped. Where the shipped
 * single-run table of a key exists, the merged table is compared with it (max |Δ bits|, RMS z with both nominal se).
 *
 *   CONVEX_DEPLOY_KEY=… node --experimental-transform-types scripts/first-use-probe.ts "Grid(4,base10,rgby)" "Int(0,2147483647)" [--gods 6] [--plan-only] [--only family] [--family family]
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { seededRng } from "@workspace/game-types";
import { analyticFor, canonicalSupport, context, divineLottery, family, instantiateKey, nominalSe, paramsKey, tableKey, type CalibrationFile, type CalibrationTable } from "@workspace/game-utilities";
import { budgetFor, mergeReplicates, type ReplicateResult } from "@workspace/game-utilities/estimator";

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const option = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args.splice(i, 2)[1]; };
const gods = Number(option("--gods") ?? 6), planOnly = flag("--plan-only"), only = option("--only"), forced = option("--family");

const deployKey = process.env.CONVEX_DEPLOY_KEY;
if (!deployKey) throw new Error("CONVEX_DEPLOY_KEY is required (the deployment to probe)");
/** The deployment's client URL, as the static-hosting component reports it (scripts/deploy-static.mjs deploymentUrls). */
function cloudUrl(): string {
  const r = spawnSync("npx", ["convex", "run", "--component", "engineSite", "lib:getUrls", "{}"], { cwd: new URL("..", import.meta.url).pathname, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`Could not read the deployment's URLs\n${r.stderr}`);
  return (JSON.parse(r.stdout) as { cloudUrl: string }).cloudUrl;
}
const client = new ConvexHttpClient(process.env.CONVEX_URL ?? cloudUrl());
(client as unknown as { setAdminAuth(key: string): void }).setAdminAuth(deployKey);
const action = <T>(fn: string, payload: Record<string, unknown>) => client.action(makeFunctionReference<"action">(fn), payload) as Promise<T>;

type Plan = { key: string; familyId: string; pieces: number; seconds: number; pieceSeconds: number };
type PieceOut = { seconds: number; result?: string };

function shipped(instance: string): Map<string, CalibrationTable> {
  const path = new URL(`../../../lib/game-utilities/data/calibration/v1/${instance}.json`, import.meta.url);
  if (!existsSync(path)) return new Map();
  return new Map((JSON.parse(readFileSync(path, "utf8")) as CalibrationFile).tables.map(t => [t.key, t]));
}

function agreement(split: CalibrationTable, single: CalibrationTable) {
  const s = new Map(single.levels.map(([o, b]) => [JSON.stringify(o), b]));
  let max = 0, sz2 = 0, n = 0;
  for (const [o, b] of split.levels) {
    const b1 = s.get(JSON.stringify(o));
    if (b1 === undefined || b1 > 64) continue;
    const d = b - b1, z = d / Math.sqrt(nominalSe(split, b) ** 2 + nominalSe(single, b1) ** 2 + 2 * 0.02 ** 2);
    max = Math.max(max, Math.abs(d)); sz2 += z * z; n++;
  }
  return { levels: n, maxAbsDelta: +max.toFixed(2), rmsZ: +(n ? Math.sqrt(sz2 / n) : 0).toFixed(2) };
}

for (const key of args) {
  const inst = instantiateKey(key), ctx = context(inst);
  const rng = seededRng(`first-use-probe:${inst.key}`);
  // --family: that family's every canonical params instead of a deal (a family the deal may miss, e.g. Int's slowest).
  const dealt = forced
    ? canonicalSupport(family(forced), ctx).map(params => ({ familyId: forced, params }) as { familyId: string; params: unknown; penalty?: { familyId: string; params: unknown } })
    : divineLottery.select(inst, gods, rng, { defenceGoals: inst.objectType === "Grid" });
  const draws = new Map<string, { familyId: string; params: unknown }>();
  let analytic = 0;
  for (const d of dealt.flatMap(u => [u, ...(u.penalty ? [u.penalty] : [])])) {
    const f = family(d.familyId), canon = f.canonical(d.params as never, ctx);
    if (analyticFor(d.familyId, canon, inst)) { analytic++; continue; }
    if (only && d.familyId !== only) continue;
    draws.set(tableKey(d.familyId, canon, inst), { familyId: d.familyId, params: canon });
  }
  const plans = await action<Plan[]>("calibration/compute:plan", { instance: inst.key, draws: [...draws.values()] });
  if (planOnly) { console.log(JSON.stringify({ instance: inst.key, plans }, null, 1)); continue; }
  const ship = shipped(inst.key);
  const started = performance.now();
  const tables = await Promise.all(plans.map(async p => {
    const d = draws.get(p.key)!;
    const base = { key: p.key, instance: inst.key, familyId: d.familyId, params: d.params };
    if (p.pieces === 1) {
      const out = await action<PieceOut>("calibration/compute:run", base);
      return { family: `${d.familyId} ${paramsKey(d.params as never)}`, pieces: 1, pieceSeconds: [out.seconds], readySeconds: (performance.now() - started) / 1000, agree: null };
    }
    const outs = await Promise.all(Array.from({ length: p.pieces }, (_, index) =>
      action<PieceOut>("calibration/compute:piece", { ...base, index, pieces: p.pieces, returnResult: true })));
    const reps = outs.map(o => JSON.parse(o.result!) as ReplicateResult);
    const table = mergeReplicates(d.familyId, d.params as never, inst, budgetFor(inst.objectType), { replicates: p.pieces }, reps);
    const single = ship.get(p.key);
    return { family: `${d.familyId} ${paramsKey(d.params as never)}`, pieces: p.pieces, pieceSeconds: outs.map(o => o.seconds), readySeconds: (performance.now() - started) / 1000, agree: single ? agreement(table, single) : null };
  }));
  const wall = Math.max(...tables.map(t => t.readySeconds));
  const all = tables.flatMap(t => t.pieceSeconds);
  console.log(JSON.stringify({
    instance: inst.key, draws: dealt.length * (inst.objectType === "Grid" ? 2 : 1), analytic, sampled: draws.size,
    actions: tables.reduce((n, t) => n + t.pieces + (t.pieces > 1 ? 1 : 0), 0), wallSeconds: +wall.toFixed(1),
    pieceSeconds: { min: +Math.min(...all).toFixed(1), max: +Math.max(...all).toFixed(1) },
    perPiece: tables.map(t => t.pieceSeconds.map(x => +x.toFixed(1))),
    tables: tables.map(t => `${t.family}: ${t.pieces} piece${t.pieces > 1 ? "s" : ""} ${Math.min(...t.pieceSeconds).toFixed(1)}–${Math.max(...t.pieceSeconds).toFixed(1)} s, ready ${t.readySeconds.toFixed(1)} s${t.agree ? `, vs single ${t.agree.levels} levels max|Δ| ${t.agree.maxAbsDelta} RMS z ${t.agree.rmsZ}` : ""}`),
    plans: plans.map(p => `${p.familyId}: est ${p.seconds.toFixed(0)} s → ${p.pieces}`),
  }, null, 1));
}
