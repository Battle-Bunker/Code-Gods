"use node";
/**
 * Smoke tests and benchmarks of the agent sandboxes inside a Convex Node action (internal; run with
 * `npx convex run runtime/probe:<name>`). Numbers are recorded in lib/game-runtime/README.md.
 *   cold   first call after a push: bundle fetch, compile, bootstrap, first acts (both languages)
 *   smoke  one inspection + act per language on the default Grid prelude
 *   bench  {language, execution?, workers?, acts?}: @workspace/game-runtime/benchmark on the Grid agent
 */
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { codecOf, defaultSettingsFor, instantiationOf, type GameSettings } from "@workspace/game-core";
import { objectType, seededRng } from "@workspace/game-types";
import { createRuntime, loadPythonRuntime, typescriptPaths, type ActSettings, type GameRuntime, type Language, type PricingVocab } from "@workspace/game-runtime";
import { GRID_AGENTS, measure } from "@workspace/game-runtime/benchmark";
import { assetLoad, bindRuntime, pythonBundle, runtimeFor, RUNTIME_OPTIONS } from "./node";

const moduleLoadedAt = Date.now();
const language = v.union(v.literal("python"), v.literal("typescript"));

/** The runtime's view of a room's settings (as the engine's adapter builds it). */
function room(lang: Language): { settings: ActSettings; inputs: string[] } {
  const settings: GameSettings = defaultSettingsFor("Grid", [lang]);
  const inst = instantiationOf(settings), T = objectType(inst.objectType), parts = T.prelude(inst);
  const rng = seededRng(`code-gods:probe:${inst.key}`);
  return {
    settings: {
      objectType: inst.objectType, wireMaxLength: codecOf(settings).maxLength,
      interactionComputeMs: settings.interactionComputeMs, stepBudget: settings.stepBudget,
      prelude: { key: parts.hash, python: parts.python, js: parts.js, dts: parts.dts,
        pricing: parts.pricing as unknown as { python: PricingVocab; typescript: PricingVocab } },
    },
    inputs: Array.from({ length: 16 }, () => T.codec(inst).encode(T.spawn(inst, rng)) as string),
  };
}
const since = (t: number) => Math.round(performance.now() - t);
const rssMiB = () => Math.round(process.memoryUsage().rss / 1048576);

export const cold = internalAction({
  args: {},
  handler: async ctx => {
    await bindRuntime(ctx);
    const out: Record<string, unknown> = { msSinceModuleLoad: Date.now() - moduleLoadedAt, rssAtStartMiB: rssMiB() };
    let t = performance.now();
    await loadPythonRuntime(pythonBundle);   // fetch (or /tmp), SHA-256, unpack, WebAssembly.compile
    out.pythonAssetsMs = since(t);
    out.assetLoad = { ...assetLoad };
    for (const lang of ["python", "typescript"] as const) {
      const { settings, inputs } = room(lang);
      const runtime = runtimeFor(lang);
      t = performance.now();
      await runtime.warm(1);                  // worker start (+ Python bootstrap to the snapshot)
      const warmMs = since(t);
      t = performance.now();
      await runtime.inspect(GRID_AGENTS[lang], settings);
      const firstInspectMs = since(t);
      t = performance.now();
      const first = await runtime.act(GRID_AGENTS[lang], inputs[0], settings, "1");
      const firstActMs = since(t);
      t = performance.now();
      await runtime.act(GRID_AGENTS[lang], inputs[1], settings, "2");
      out[lang] = { warmMs, firstInspectMs, firstActMs, secondActMs: since(t), calls: first.calls };
    }
    out.totalMs = Date.now() - moduleLoadedAt;
    out.rssMiB = rssMiB();
    return out;
  },
});

export const smoke = internalAction({
  args: {},
  handler: async ctx => {
    await bindRuntime(ctx);
    const out: Record<string, unknown> = {};
    for (const lang of ["python", "typescript"] as const) {
      const { settings, inputs } = room(lang);
      const runtime = runtimeFor(lang);
      const inspection = await runtime.inspect(GRID_AGENTS[lang], settings);
      const acts = await Promise.all(inputs.slice(0, 4).map((input, i) => runtime.act(GRID_AGENTS[lang], input, settings, String(i))));
      const again = await runtime.act(GRID_AGENTS[lang], inputs[0], settings, "0");
      if (again.calls !== acts[0].calls) throw new Error(`${lang}: the same act differed`);
      let limit = "";
      try { await runtime.act(lang === "python" ? "def agent(g):\n    while True:\n        pass\n" : "function agent(g) { while (true) {} return []; }", inputs[0], settings, "1"); }
      catch (error) { limit = (error as Error).message; }
      out[lang] = { cost: inspection.cost, calls: acts.map(a => a.calls), steps: acts.map(a => a.steps), limit };
    }
    return out;
  },
});

/**
 * The production pools (runtime/node.ts: 2 Python + 2 TypeScript workers) all warm and busy at once:
 * the instance's memory footprint, and the combined throughput with both languages in flight.
 */
export const footprint = internalAction({
  args: { acts: v.optional(v.number()) },
  handler: async (ctx, { acts = 200 }) => {
    await bindRuntime(ctx);
    const out: Record<string, unknown> = { rssBeforeMiB: rssMiB() };
    const work = (["python", "typescript"] as const).map(lang => ({ lang, runtime: runtimeFor(lang), ...room(lang) }));
    await Promise.all(work.map(w => w.runtime.warm()));
    await Promise.all(work.map(w => w.runtime.inspect(GRID_AGENTS[w.lang], w.settings)));
    out.rssWarmMiB = rssMiB();
    const t = performance.now();
    const done = { python: 0, typescript: 0 };
    await Promise.all(work.flatMap(w => Array.from({ length: w.runtime.workers }, async (_, k) => {
      for (let i = k; i < acts; i += w.runtime.workers) {
        await w.runtime.act(GRID_AGENTS[w.lang], w.inputs[i % w.inputs.length], w.settings, String(i + 1));
        done[w.lang]++;
      }
    })));
    const seconds = (performance.now() - t) / 1000;
    out.combined = { python: done.python, typescript: done.typescript, seconds: Math.round(seconds * 100) / 100,
      actsPerSecond: Math.round((done.python + done.typescript) / seconds) };
    out.rssAfterMiB = rssMiB();
    out.memory = process.memoryUsage();
    return out;
  },
});

/** This instance's resident memory and the production pools' live workers. */
export const memory = internalAction({
  args: {},
  handler: async () => {
    const python = runtimeFor("python") as GameRuntime & { slots: unknown[] };
    const typescript = runtimeFor("typescript") as GameRuntime & { slots: unknown[]; compiler: { slots: unknown[] } };
    return { rssMiB: rssMiB(), pythonWorkers: python.slots.length, typescriptWorkers: typescript.slots.length,
      typescriptCompilers: typescript.compiler.slots.length, memory: process.memoryUsage() };
  },
});

/** Where this instance resolves the external packages the TypeScript sandbox loads. */
export const resolve = internalAction({
  args: {},
  handler: async () => {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const ts = await import("typescript");
    return { url: import.meta.url, typescript: require.resolve("typescript"), quickjs: require.resolve("quickjs-emscripten"),
      importedVersion: (ts.default ?? ts).version, node: process.version, packageResolves: typescriptPaths(), engineFiles: RUNTIME_OPTIONS.typescript.typescriptFiles };
  },
});

const benchRuntimes = new Map<string, GameRuntime>();
export const bench = internalAction({
  args: { language, execution: v.optional(v.union(v.literal("worker"), v.literal("inline"))), workers: v.optional(v.number()),
    acts: v.optional(v.number()), concurrency: v.optional(v.number()) },
  handler: async (ctx, { language: lang, execution = "worker", workers = 1, acts = 300, concurrency }) => {
    await bindRuntime(ctx);
    const key = `${lang}:${execution}:${workers}`;
    let runtime = benchRuntimes.get(key);
    if (!runtime) {
      // Close the other benchmark pools first, so each configuration is measured alone in the 512 MiB.
      for (const [k, r] of benchRuntimes) { r.close(); benchRuntimes.delete(k); }
      runtime = createRuntime({ ...RUNTIME_OPTIONS[lang], execution, workers });
      benchRuntimes.set(key, runtime);
    }
    const { settings, inputs } = room(lang);
    return await measure(runtime, { settings, inputs, source: GRID_AGENTS[lang], acts, concurrency });
  },
});
