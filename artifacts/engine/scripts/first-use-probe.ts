/**
 * Cloud first-use latency of on-demand calibration (docs/analytic-calibration/architecture.md §9): for each shape, deal
 * a game's draws (Divine Lottery, defence goals on where the type has them), keep the ones without an analytic answer, and run one
 * `calibration/compute:run` per table in parallel against the deployment the environment selects (CONVEX_DEPLOY_KEY;
 * none: the local backend). `run` writes nothing unless a claim row exists, so the probe leaves no cache behind and can
 * be repeated.
 *
 *   CONVEX_DEPLOY_KEY=… node --experimental-transform-types scripts/first-use-probe.ts "Grid(4,base10,rgby)" "Grid(7,base16,rgby)" [--gods 6]
 */
import { spawn } from "node:child_process";
import { analyticFor, context, divineLottery, family, instantiateKey, paramsKey, tableKey } from "@workspace/game-utilities";
import { randomInt } from "node:crypto";

const rng = { int: (n: number) => randomInt(n), big: (n: bigint) => BigInt(randomInt(Number(n > 2n ** 47n ? 2n ** 47n : n))) };

const args = process.argv.slice(2);
const godsAt = args.indexOf("--gods");
const gods = godsAt >= 0 ? Number(args.splice(godsAt, 2)[1]) : 6;

function runAction(fn: string, payload: unknown): Promise<{ ms: number; out: string }> {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["convex", "run", fn, JSON.stringify(payload)], { cwd: new URL("..", import.meta.url).pathname, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", d => { out += d; });
    child.stderr.on("data", d => { err += d; });
    child.on("close", code => (code === 0 ? resolve({ ms: performance.now() - started, out }) : reject(new Error(`${fn} exited ${code}: ${err.slice(-500)}`))));
  });
}

for (const key of args) {
  const inst = instantiateKey(key), ctx = context(inst);
  const dealt = divineLottery.select(inst, gods, rng, { defenceGoals: inst.objectType === "Grid" });
  const draws = new Map<string, { familyId: string; params: unknown }>();
  let analytic = 0;
  for (const d of dealt.flatMap(u => [u, ...(u.penalty ? [u.penalty] : [])])) {
    const f = family(d.familyId), canon = f.canonical(d.params as never, ctx);
    if (analyticFor(d.familyId, canon, inst)) { analytic++; continue; }
    draws.set(tableKey(d.familyId, canon, inst), { familyId: d.familyId, params: canon });
  }
  const started = performance.now();
  const results = await Promise.all([...draws].map(async ([k, d]) => {
    const r = await runAction("calibration/compute:run", { key: k, instance: inst.key, familyId: d.familyId, params: d.params });
    const seconds = (JSON.parse(r.out) as { seconds: number }).seconds;
    return { family: `${d.familyId} ${paramsKey(d.params as never)}`, buildSeconds: seconds, callSeconds: r.ms / 1000 };
  }));
  const wall = (performance.now() - started) / 1000;
  const builds = results.map(r => r.buildSeconds).sort((a, b) => a - b);
  console.log(JSON.stringify({
    instance: inst.key, draws: dealt.length * (inst.objectType === "Grid" ? 2 : 1), analytic, sampled: draws.size, wallSeconds: +wall.toFixed(1),
    buildSeconds: { min: +builds[0]!.toFixed(1), max: +builds.at(-1)!.toFixed(1), sum: +builds.reduce((a, b) => a + b, 0).toFixed(1) },
    tables: results.map(r => `${r.family}: build ${r.buildSeconds.toFixed(1)} s, call ${r.callSeconds.toFixed(1)} s`),
  }, null, 1));
}
