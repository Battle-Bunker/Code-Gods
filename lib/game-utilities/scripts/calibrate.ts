/**
 * Offline calibration pipeline: builds the shipped survival tables (data/calibration/v1/).
 *
 *   pnpm --filter @workspace/game-utilities calibrate [--types Int,string,Grid] [--instances "Grid(5,base10,rgby)",...]
 *        [--families id,...] [--budget default|smoke|k=v,...] [--workers 4] [--force] [--check] [--out dir]
 *        [--pool pool.json]   (mixture-prior tables ½·uniform + ½·pool, from the uniform tables already built)
 *
 * Enumerates instantiations × available families (reward and penalty) × canonical(support), keys each table
 * (src/calibration.ts tableKey), skips keys already present in data/ (incremental), builds the rest on worker
 * threads (deterministic: the key seeds each table), drops stale tables of the instances it touches, and rewrites
 * <instance key>.json, manifest.json and the generated static-import module index.js. Output is byte-identical
 * across runs. --check builds nothing and exits 1 if any table is missing or stale.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { INT_PRESETS, STRING_PRESETS, instantiate, type Instantiation, type TypeArgs } from "@workspace/game-types";
import { available, canonicalSupport, context, familiesFor, paramsKey } from "../src/catalog.ts";
import {
  CALIBRATION_FORMAT, ESTIMATOR, priorKey, tableKey, type CalibrationBudget, type CalibrationFile, type CalibrationManifest,
  type CalibrationTable,
} from "../src/calibration.ts";
import type { Params } from "../src/types.ts";
import { mixtureTable, poolPrior, type PriorPool } from "./mixture.ts";
import { BUDGETS, DEFAULT_BUDGET, budgetFor, buildTable, tableJson } from "./estimator.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(HERE, "..", "data", "calibration", CALIBRATION_FORMAT);

/** The curated GridTypes (every symbol set and every colour set; never 3×3, which is retired from play). */
export const CURATED_GRIDS: readonly TypeArgs[] = [
  { size: 4, symbols: "base10", colours: "rgb" },        // the Grid default
  { size: 5, symbols: "base10", colours: "rgby" },       // progression presets
  { size: 6, symbols: "base16", colours: "rainbow6" },
  { size: 7, symbols: "cards", colours: "rainbow6" },
  { size: 4, symbols: "base12", colours: "rgby" },       // set coverage
  { size: 5, symbols: "cards", colours: "rgb" },
];

/** Everything the pipeline calibrates by default, in manifest order. */
export function defaultInstances(): Instantiation[] {
  return [
    ...INT_PRESETS.map(a => instantiate("Int", a)),
    ...STRING_PRESETS.map(a => instantiate("string", a)),
    ...CURATED_GRIDS.map(a => instantiate("Grid", a)),
  ];
}

export interface Job { readonly instance: string; readonly args: TypeArgs; readonly objectType: string; readonly familyId: string; readonly params: Params; readonly key: string }

/** Every (instantiation, available family, canonical params) the instantiation can deal. */
export function jobsFor(inst: Instantiation, families?: ReadonlySet<string>): Job[] {
  const ctx = context(inst), out: Job[] = [];
  for (const f of familiesFor(inst.objectType)) {
    if (!available(f, inst).ok || (families && !families.has(f.id))) continue;
    for (const p of canonicalSupport(f, ctx)) {
      out.push({ instance: inst.key, args: inst.args, objectType: inst.objectType, familyId: f.id, params: p, key: tableKey(f.id, p, inst) });
    }
  }
  return out;
}

const fileName = (instKey: string) => `${instKey}.json`;

export function readFile(dir: string, instKey: string): CalibrationFile | null {
  const path = join(dir, fileName(instKey));
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as CalibrationFile : null;
}

const orderKey = (t: CalibrationTable) => `${t.family}\0${paramsKey(t.canonicalParams)}\0${t.prior ? priorKey(t.prior) : ""}`;
const tableOrder = (a: CalibrationTable, b: CalibrationTable) => (orderKey(a) < orderKey(b) ? -1 : orderKey(a) > orderKey(b) ? 1 : 0);

export function fileText(instKey: string, tables: readonly CalibrationTable[]): string {
  const sorted = [...tables].sort(tableOrder);
  return `{"format":${JSON.stringify(CALIBRATION_FORMAT)},"instance":${JSON.stringify(instKey)},"tables":[\n`
    + sorted.map(tableJson).join(",\n") + "\n]}\n";
}

/** Rewrites manifest.json and index.js from the instance files on disk. */
export function writeIndex(dir: string, order: readonly string[]): void {
  const keys = readdirSync(dir).filter(f => f.endsWith(".json") && f !== "manifest.json").map(f => f.slice(0, -5));
  const ranked = [...order.filter(k => keys.includes(k)), ...keys.filter(k => !order.includes(k)).sort()];
  const instances: Record<string, CalibrationManifest["instances"][string]> = {};
  for (const k of ranked) {
    const file = readFile(dir, k)!;
    const objectType = k.slice(0, k.indexOf("("));
    const inst = instantiateKey(k);
    const tables: Record<string, Record<string, string>> = {};
    const priors: Record<string, Record<string, Record<string, string>>> = {};
    for (const t of [...file.tables].sort(tableOrder)) {
      const into = t.prior ? (priors[priorKey(t.prior)] ??= {}) : tables;
      (into[t.family] ??= {})[paramsKey(t.canonicalParams)] = t.key;
    }
    instances[k] = { objectType, args: sortArgs(inst.args), file: fileName(k), tables, ...(Object.keys(priors).length ? { priors } : {}) };
  }
  const manifest: CalibrationManifest = { format: CALIBRATION_FORMAT, estimator: { id: ESTIMATOR.id, version: ESTIMATOR.version }, instances };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest) + "\n");
  const lines = [
    "// Generated by scripts/calibrate.ts: static imports of the shipped calibration tables. Do not edit.",
    `import manifest from "./manifest.json" with { type: "json" };`,
    ...ranked.map((k, i) => `import t${i} from ${JSON.stringify(`./${fileName(k)}`)} with { type: "json" };`),
    "export const MANIFEST = manifest;",
    `export const TABLES = {${ranked.map((k, i) => `\n  ${JSON.stringify(k)}: t${i},`).join("")}\n};`,
    "",
  ];
  writeFileSync(join(dir, "index.js"), lines.join("\n"));
  writeFileSync(join(dir, "index.d.ts"), [
    "// Generated by scripts/calibrate.ts. Do not edit.",
    "export declare const MANIFEST: unknown;",
    "export declare const TABLES: Readonly<Record<string, unknown>>;",
    "",
  ].join("\n"));
}

const sortArgs = (a: TypeArgs) => Object.fromEntries(Object.keys(a).sort().map(k => [k, a[k]]));

/** "Grid(5,base10,rgby)" → the instantiation, via the curated list or a parse of the key. */
export function instantiateKey(key: string): Instantiation {
  const hit = defaultInstances().find(i => i.key === key);
  if (hit) return hit;
  const m = /^(\w+)\((.*)\)$/.exec(key);
  if (!m) throw new Error(`Bad instance key ${key}`);
  const parts = m[2].split(",");
  const args: Record<string, string | number> =
    m[1] === "Int" ? { min: Number(parts[0]), max: Number(parts[1]) }
      : m[1] === "string" ? { maxLength: Number(parts[0]) }
        : { size: Number(parts[0]), symbols: parts[1], colours: parts[2] };
  const inst = instantiate(m[1], args);
  if (inst.key !== key) throw new Error(`Instance key ${key} does not round-trip (${inst.key})`);
  return inst;
}

// ------------------------------------------------------------------------------------------------
// worker
// ------------------------------------------------------------------------------------------------

interface WorkMsg { job: Job; budget: CalibrationBudget }
/** --budget applies to every job; otherwise each type's default (estimator.ts budgetFor). */
type BudgetChoice = CalibrationBudget | null;
interface DoneMsg { key: string; json: string; seconds: number; evaluations: number }

if (!isMainThread && parentPort) {
  const port = parentPort;
  port.on("message", ({ job, budget }: WorkMsg) => {
    const inst = instantiate(job.objectType, job.args);
    const r = buildTable(job.familyId, job.params, inst, budget);
    if (r.table.key !== job.key) throw new Error(`key mismatch in worker for ${job.familyId} on ${job.instance}`);
    port.postMessage({ key: job.key, json: tableJson(r.table), seconds: r.seconds, evaluations: r.evaluations } satisfies DoneMsg);
  });
}

/** Builds `jobs` on `workers` threads; resolves with the table JSON by key (order-independent). */
export function runJobs(jobs: readonly Job[], budget: BudgetChoice, workers: number,
  onDone?: (job: Job, msg: DoneMsg, done: number) => void): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!jobs.length) return Promise.resolve(out);
  return new Promise((resolve, reject) => {
    let next = 0, done = 0;
    const byKey = new Map(jobs.map(j => [j.key, j]));
    const pool = Array.from({ length: Math.min(workers, jobs.length) }, () => new Worker(fileURLToPath(import.meta.url)));
    const feed = (w: Worker) => {
      if (next < jobs.length) { const job = jobs[next++]; w.postMessage({ job, budget: budget ?? budgetFor(job.objectType) } satisfies WorkMsg); }
      else void w.terminate();
    };
    for (const w of pool) {
      w.on("message", (m: DoneMsg) => {
        out.set(m.key, m.json);
        onDone?.(byKey.get(m.key)!, m, ++done);
        if (done === jobs.length) { resolve(out); pool.forEach(p => void p.terminate()); } else feed(w);
      });
      w.on("error", e => { pool.forEach(p => void p.terminate()); reject(e); });
      feed(w);
    }
  });
}

// ------------------------------------------------------------------------------------------------
// CLI
// ------------------------------------------------------------------------------------------------

function parseBudget(s: string | undefined): CalibrationBudget | null {
  if (!s) return null;
  if (BUDGETS[s]) return BUDGETS[s];
  const out: Record<string, number> = { ...DEFAULT_BUDGET };
  for (const kv of s.split(",")) {
    const [k, v] = kv.split("=");
    if (!(k in out) || !Number.isFinite(Number(v))) throw new Error(`Bad budget entry ${kv}`);
    out[k] = Number(v);
  }
  return out as unknown as CalibrationBudget;
}

function parseArgs(argv: readonly string[]) {
  const opts: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`Unexpected argument ${a}`);
    const name = a.slice(2);
    if (name === "force" || name === "check") opts[name] = true;
    else if (name === "pool") opts[name] = argv[++i];
    else opts[name] = argv[++i];
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2).filter(a => a !== "--"));
  const types = typeof opts.types === "string" ? new Set(opts.types.split(",")) : null;
  const families = typeof opts.families === "string" ? new Set(opts.families.split(",")) : undefined;
  const budget = parseBudget(opts.budget as string | undefined);
  const workers = Number(opts.workers ?? 4);
  const dir = typeof opts.out === "string" ? opts.out : DATA_DIR;
  const order = defaultInstances().map(i => i.key);
  let insts = typeof opts.instances === "string" ? opts.instances.split(/;|,(?![^(]*\))/).map(instantiateKey) : defaultInstances();
  if (types) insts = insts.filter(i => types.has(i.objectType));
  mkdirSync(dir, { recursive: true });

  const plan = insts.map(inst => {
    const all = jobsFor(inst);
    const current = new Set(all.map(j => j.key));
    const existing = readFile(dir, inst.key)?.tables ?? [];
    // Uniform tables: kept iff their key is current. Other priors' tables: kept iff fresh for their prior.
    const kept = existing.filter(t => (t.prior ? t.key === tableKey(t.family, t.canonicalParams, inst, t.prior) : current.has(t.key)));
    const have = new Set(kept.map(t => t.key));
    const wanted = all.filter(j => !families || families.has(j.familyId));
    const todo = wanted.filter(j => opts.force || !have.has(j.key));
    return { inst, kept: opts.force ? kept.filter(t => !todo.some(j => j.key === t.key)) : kept, todo, stale: existing.length - kept.length, total: all.length };
  });
  for (const p of plan) {
    console.error(`${p.inst.key}: ${p.total} tables, ${p.kept.length} current, ${p.todo.length} to build, ${p.stale} stale`);
  }
  if (typeof opts.pool === "string") return buildMixtures(dir, opts.pool, families, order);
  if (opts.check) {
    const bad = plan.filter(p => p.todo.length || p.stale);
    if (bad.length) { console.error(`Calibration tables are missing or stale. Regenerate with: pnpm --filter @workspace/game-utilities calibrate`); process.exit(1); }
    return;
  }
  // Longest first (grids, by cell count) for load balancing; results are keyed, so order never reaches the output.
  const jobs = plan.flatMap(p => p.todo).sort((a, b) => weight(b) - weight(a));
  const t0 = performance.now();
  const byInst = new Map(plan.map(p => [p.inst.key, { p, done: [] as CalibrationTable[] }]));
  await runJobs(jobs, budget, workers, (job, m, done) => {
    const t = JSON.parse(m.json) as CalibrationTable;
    // Checkpoint: rewrite the instance file after every table, so an interrupted run resumes incrementally.
    const e = byInst.get(job.instance)!;
    e.done.push(t);
    writeFileSync(join(dir, fileName(job.instance)), fileText(job.instance, [...e.p.kept, ...e.done]));
    if (e.done.length === e.p.todo.length) writeIndex(dir, order);
    console.error(`[${done}/${jobs.length}] ${job.instance} ${job.familyId} ${paramsKey(job.params)}: ${t.levels.length} levels, `
      + `${t.meta.maxBits.toFixed(1)} bits${t.meta.stoppedEarly ? " (stopped early" + (t.meta.topReached === false ? ", top NOT reached)" : ")") : ""}, `
      + `${m.seconds.toFixed(1)} s, ${(1e6 * m.seconds / m.evaluations).toFixed(1)} µs/eval`);
  });
  for (const p of plan) {
    // Instances with nothing to build but stale tables to drop.
    if (!p.todo.length && p.stale && p.kept.length) writeFileSync(join(dir, fileName(p.inst.key)), fileText(p.inst.key, p.kept));
  }
  writeIndex(dir, order);
  console.error(`built ${jobs.length} tables in ${((performance.now() - t0) / 1000).toFixed(1)} s on ${workers} workers`);
}

/**
 * --pool <file>: mixture-prior tables (½·uniform + ½·pool) for the pool's instance, from the fresh uniform tables
 * already in `dir` (scripts/mixture.ts). Exact given the uniform tables, so no workers are needed.
 */
function buildMixtures(dir: string, poolPath: string, families: ReadonlySet<string> | undefined, order: readonly string[]): void {
  const pool = JSON.parse(readFileSync(poolPath, "utf8")) as PriorPool;
  const inst = instantiateKey(pool.instance), file = readFile(dir, inst.key);
  if (!file) throw new Error(`no uniform tables for ${inst.key}; calibrate it first`);
  const prior = poolPrior(pool);
  const others = file.tables.filter(t => !(t.prior && priorKey(t.prior) === priorKey(prior)));
  const made: CalibrationTable[] = [];
  for (const j of jobsFor(inst, families)) {
    const u = file.tables.find(t => !t.prior && t.key === j.key);
    if (!u) throw new Error(`${j.familyId} ${paramsKey(j.params)} on ${inst.key}: uniform table missing or stale; calibrate first`);
    made.push(mixtureTable(u, pool, inst));
  }
  writeFileSync(join(dir, fileName(inst.key)), fileText(inst.key, [...others, ...made]));
  writeIndex(dir, order);
  console.error(`built ${made.length} mixture tables for ${priorKey(prior)} on ${inst.key}`);
}

const weight = (j: Job) => (j.objectType === "Grid" ? 1000 * Number(j.args.size) ** 2 : j.objectType === "string" ? Number(j.args.maxLength) : 1);

if (isMainThread && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(e => { console.error(e); process.exit(1); });
}
