"use node";
/**
 * Cold-start measurements of script mode inside a Convex Node action (docs/assistant/code-execution.md §1). Internal;
 * run with `npx convex run runtime/probeScripts:<name>` (with a deploy key for a cloud deployment).
 *   scriptCold   the production script pools (runtime/node.ts): bundle from storage, compile, first worker, first and
 *                warm scripts (rank 80 objects, a correlation over 1,000 rows), both languages, RSS
 *   pyodideCold  Pyodide (latest stable, numpy and pandas pre-packed) loaded from a probe asset in file storage
 *                (scripts/probe-pyodide.mjs uploads it): egress, unpack, compile, interpreter init, package load and
 *                import, warm scripts, and an in-process heap restore per request. Measurement only: Pyodide is not
 *                a dependency, and nothing else uses it.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { loadPythonRuntime, type Language } from "@workspace/game-runtime";
import { unpack } from "@workspace/game-runtime/bundle";
import { assetLoad, bindRuntime, pythonBundle, scriptRuntimeFor, type ScriptLanguage } from "./node";

const moduleLoadedAt = Date.now();
const since = (t: number) => Math.round(performance.now() - t);
const rssMiB = () => Math.round(process.memoryUsage().rss / 1048576);
const stats = (times: number[]) => {
  const s = [...times].sort((a, b) => a - b);
  const q = (p: number) => Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 100) / 100;
  return { first: Math.round(times[0] * 100) / 100, p50: q(0.5), p95: q(0.95), max: q(1) };
};

/** The benchmark inputs and scripts, the same in every engine (the container numbers use the same ones). */
export const OBJECTS = JSON.stringify(Array.from({ length: 80 }, (_, i) => ({ id: `o${i}`, mine: (i * 37) % 101, theirs: [(i * 13) % 50, (i * 29) % 70] })));
export const ROWS = JSON.stringify(Array.from({ length: 1000 }, (_, i) => ({ x: i, y: (i * 7919) % 1000 + i / 3 })));
const SCRIPTS: Record<ScriptLanguage, { rank: string; corr: string }> = {
  python: {
    rank: "def main(d):\n    for o in d['objects']:\n        o['score'] = o['mine'] - sum(o['theirs']) / len(o['theirs'])\n    return sorted(d['objects'], key=lambda o: -o['score'])[:5]\n",
    corr: "import statistics\ndef main(d):\n    return statistics.correlation([r['x'] for r in d['rows']], [r['y'] for r in d['rows']])\n",
  },
  typescript: {
    rank: "function main(d) { for (const o of d.objects) o.score = o.mine - o.theirs.reduce((a, b) => a + b, 0) / o.theirs.length; return d.objects.sort((a, b) => b.score - a.score).slice(0, 5); }",
    corr: "function main(d) { const n = d.rows.length; let sx = 0, sy = 0; for (const r of d.rows) { sx += r.x; sy += r.y; } const mx = sx / n, my = sy / n; let a = 0, b = 0, c = 0; for (const r of d.rows) { a += (r.x - mx) * (r.y - my); b += (r.x - mx) ** 2; c += (r.y - my) ** 2; } return a / Math.sqrt(b * c); }",
  },
};

export const scriptCold = internalAction({
  args: { runs: v.optional(v.number()) },
  handler: async (ctx, { runs = 20 }) => {
    const out: Record<string, unknown> = { msSinceModuleLoad: Date.now() - moduleLoadedAt, rssAtStartMiB: rssMiB() };
    let t = performance.now();
    await bindRuntime(ctx);
    out.bundleLoadMs = since(t);
    out.assetLoad = { ...assetLoad };
    t = performance.now();
    await loadPythonRuntime(pythonBundle);   // SHA-256, gunzip, unpack, WebAssembly.compile (once per instance)
    out.verifyUnpackCompileMs = since(t);
    for (const lang of ["python", "typescript"] as const) {
      const runtime = scriptRuntimeFor(lang);
      t = performance.now();
      await runtime.warm(1);
      const warmMs = since(t);
      const input = JSON.stringify({ objects: JSON.parse(OBJECTS), rows: JSON.parse(ROWS) });
      const rank: number[] = [], corr: number[] = [];
      let result = "";
      for (let i = 0; i < runs; i++) {
        t = performance.now(); result = (await runtime.script(SCRIPTS[lang].rank, input)).result; rank.push(performance.now() - t);
        t = performance.now(); await runtime.script(SCRIPTS[lang].corr, input); corr.push(performance.now() - t);
      }
      out[lang] = { workerReadyMs: warmMs, rank: stats(rank), corr: stats(corr), top: JSON.parse(result)[0] };
    }
    out.rssMiB = rssMiB();
    return out;
  },
});

/** Every file of the probe asset (`probe-pyodide.bin.gz`: the bundle.mjs format, pinned by its own SHA-256 in the row). */
export const pyodideCold = internalAction({
  args: { runs: v.optional(v.number()), restore: v.optional(v.boolean()) },
  handler: async (ctx, { runs = 20, restore = true }) => {
    const out: Record<string, unknown> = { msSinceModuleLoad: Date.now() - moduleLoadedAt, rssAtStartMiB: rssMiB() };
    let t = performance.now();
    const row = await ctx.runQuery(internal.runtime.assets.lookup, { name: "probe-pyodide.bin.gz" });
    if (!row) throw new Error("Upload the probe asset first: node scripts/probe-pyodide.mjs <pyodide package dir>");
    const blob = await ctx.storage.get(row.storageId);
    const bytes = new Uint8Array(await blob!.arrayBuffer());
    out.egress = { ms: since(t), bytes: bytes.length };
    t = performance.now();
    const files = unpack(bytes, row.sha256);
    const dir = `/tmp/probe-pyodide-${row.sha256.slice(0, 12)}`;
    await mkdir(dir, { recursive: true });
    for (const [path, data] of files) await writeFile(`${dir}/${path}`, data);
    out.unpackMs = since(t);
    t = performance.now();
    await WebAssembly.compile(new Uint8Array(files.get("pyodide.asm.wasm")!));
    out.compileMs = since(t);
    t = performance.now();
    const { loadPyodide } = await import(/* @vite-ignore */ pathToFileURL(`${dir}/pyodide.mjs`).href) as { loadPyodide: (o: Record<string, unknown>) => Promise<any> };
    const py = await loadPyodide({ indexURL: `${dir}/`, packageCacheDir: dir, stdout: () => {}, stderr: () => {} });
    out.loadPyodideMs = since(t);
    t = performance.now();
    await py.loadPackage(["numpy", "pandas"], { messageCallback: () => {}, errorCallback: () => {} });
    out.loadPackagesMs = since(t);
    t = performance.now();
    py.runPython("import numpy, pandas, json, statistics");
    out.importMs = since(t);
    out.rssLoadedMiB = rssMiB();
    py.globals.set("OBJS", OBJECTS); py.globals.set("ROWS", ROWS);
    const scripts = {
      rank_pure: "d=json.loads(OBJS)\nfor o in d: o['score']=o['mine']-sum(o['theirs'])/len(o['theirs'])\njson.dumps(sorted(d,key=lambda o:-o['score'])[:5])",
      corr_numpy: "d=json.loads(ROWS)\nfloat(numpy.corrcoef([r['x'] for r in d],[r['y'] for r in d])[0,1])",
      rank_pandas: "df=pandas.DataFrame(json.loads(OBJS))\ndf['score']=df['mine']-df['theirs'].map(lambda t: sum(t)/len(t))\ndf.nlargest(5,'score').to_json(orient='records')",
    };
    const heap: Uint8Array = py._module.HEAPU8;
    const copy = restore ? heap.slice() : null;
    const restores: number[] = [];
    const warm: Record<string, unknown> = {};
    for (const [name, src] of Object.entries(scripts)) {
      const times: number[] = [];
      for (let i = 0; i < runs; i++) {
        if (copy) { const r = performance.now(); py._module.HEAPU8.set(copy); restores.push(performance.now() - r); }
        const s = performance.now(); py.runPython(src); times.push(performance.now() - s);
      }
      warm[name] = stats(times);
    }
    out.warm = warm;
    if (copy) out.heapRestore = { heapMiB: Math.round(heap.length / 1048576), ...stats(restores) };
    out.rssMiB = rssMiB();
    return out;
  },
});
