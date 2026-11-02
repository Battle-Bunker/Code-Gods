"use node";
/**
 * Smoke tests and benchmarks of the agent sandboxes inside a Convex Node action (internal; run with
 * `npx convex run runtime/probe:<name>`). Numbers are recorded in lib/game-runtime/README.md.
 *   cold   first call after a push: bundle fetch, compile, bootstrap, first acts (both languages)
 *   smoke  {language?}: inspection, acts and the step limit per language, through the engine's path
 *   concurrent  {acts?, budgetMiB?}: all three languages' pools busy at once, against a memory budget
 *   bench  {language, execution?, workers?, acts?}: @workspace/game-runtime/benchmark on the Grid agent
 */
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { codecOf, defaultSettingsFor, instantiationOf, type GameSettings } from "@workspace/game-core";
import { objectType, seededRng } from "@workspace/game-types";
import { createRuntime, loadPythonRuntime, typescriptPaths, type ActSettings, type GameRuntime, type Language, type PricingVocab } from "@workspace/game-runtime";
import { GRID_AGENTS, measure } from "@workspace/game-runtime/benchmark";
import { assetLoad, bindRuntime, pythonBundle, runtimeFor, RUNTIME_OPTIONS } from "./node";
import * as engine from "../engine/runtime";
import { internal } from "../_generated/api";
import { HASKELL_ACT_BATCH } from "../lib/haskellPrograms";

const moduleLoadedAt = Date.now();
const language = v.union(v.literal("python"), v.literal("typescript"), v.literal("haskell"));

/** The runtime's view of a room's settings (as the engine's adapter builds it). */
function room(lang: Language): { game: GameSettings; settings: ActSettings; inputs: string[] } {
  const settings: GameSettings = defaultSettingsFor("Grid", [lang]);
  const inst = instantiationOf(settings), T = objectType(inst.objectType), parts = T.prelude(inst);
  const rng = seededRng(`code-gods:probe:${inst.key}`);
  return {
    game: settings,
    settings: {
      objectType: inst.objectType, wireMaxLength: codecOf(settings).maxLength,
      interactionComputeMs: settings.interactionComputeMs, stepBudget: settings.stepBudget,
      prelude: { key: parts.hash, python: parts.python, js: parts.js, dts: parts.dts, ...(lang === "haskell" ? { haskell: parts.haskell } : {}),
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

const ENDLESS: Record<Language, string> = {
  python: "def agent(g):\n    while True:\n        pass\n", typescript: "function agent(g) { while (true) {} return []; }",
  haskell: "agent :: Obj -> [Call]\nagent g = let loop n = loop (n + 1) in [paint (row (loop 0)) \"red\"]",
};

/**
 * The deploy's smoke test of the agent sandboxes, one language per call (deploy.yml calls it for each), through the
 * engine's own path (engine/runtime.ts: this instance's pools; Haskell compiled by runtime/haskellCompile.ts in another
 * action): inspect, acts, determinism and the step limit.
 */
export const smoke = internalAction({
  args: { language: v.optional(language) },
  handler: async (ctx, args) => {
    await bindRuntime(ctx);
    const out: Record<string, unknown> = {};
    for (const lang of args.language ? [args.language] : (["python", "typescript", "haskell"] as const)) {
      const { game, inputs } = room(lang);
      const t = performance.now();
      const inspection = await engine.inspect(ctx, GRID_AGENTS[lang], lang, game);
      const inspectMs = since(t);
      const acts = await Promise.all(inputs.slice(0, 4).map((input, i) => engine.act(ctx, GRID_AGENTS[lang], lang, input, game, BigInt(i))));
      const again = await engine.act(ctx, GRID_AGENTS[lang], lang, inputs[0], game, 0n);
      if (again.calls !== acts[0].calls) throw new Error(`${lang}: the same act differed`);
      let limit = "";
      try { await engine.act(ctx, ENDLESS[lang], lang, inputs[0], game, 1n); }
      catch (error) { limit = (error as Error).message; }
      if (!limit) throw new Error(`${lang}: an endless agent was not stopped`);
      out[lang] = { cost: inspection.cost, inspectMs, calls: acts.map(a => a.calls), steps: acts.map(a => a.steps), limit, rssMiB: rssMiB() };
    }
    return out;
  },
});

/**
 * A three-language game's agents all busy at once, as its tick runs them (deploy.yml): Python and TypeScript on this
 * instance's pools, Haskell compiled and acted by actions of their own (runtime/haskellCompile.ts, haskellAct.ts). Fails
 * when this instance's peak resident memory, sampled every 50 ms, passes `budgetMiB` (default 480 of the action's 512 MiB; on dev the
 * instance sat at 446 MiB before and peaked at 449 under the load, the Haskell act action at 359).
 */
export const concurrent = internalAction({
  args: { acts: v.optional(v.number()), budgetMiB: v.optional(v.number()) },
  handler: async (ctx, { acts = 24, budgetMiB = 480 }) => {
    await bindRuntime(ctx);
    let peak = rssMiB();
    const sampler = setInterval(() => { peak = Math.max(peak, rssMiB()); }, 50);
    const t = performance.now();
    const out: Record<string, unknown> = { rssBeforeMiB: peak };
    try {
      const langs = ["python", "typescript", "haskell"] as const;
      const runs = await Promise.all(langs.map(async lang => {
        const { game, inputs } = room(lang);
        const inspection = await engine.inspect(ctx, GRID_AGENTS[lang], lang, game);
        const calls = await Promise.all(Array.from({ length: acts }, (_, i) =>
          engine.act(ctx, GRID_AGENTS[lang], lang, inputs[i % inputs.length], game, BigInt(i)).then(r => r.calls)));
        return [lang, { cost: inspection.cost, acts: calls.length }] as const;
      }));
      Object.assign(out, Object.fromEntries(runs));
      // The Haskell act action's own instance, under the same budget: a full batch of acts on its pool.
      const { game, inputs } = room("haskell");
      const haskell = await ctx.runAction(internal.runtime.haskellAct.acts, { settings: game,
        requests: Array.from({ length: HASKELL_ACT_BATCH }, (_, i) => ({ source: GRID_AGENTS.haskell, input: inputs[i % inputs.length], seed: String(i) })) });
      if (!haskell.replies.every(reply => reply.ok)) throw new Error(`Haskell acts failed: ${JSON.stringify(haskell.replies.find(reply => !reply.ok))}`);
      out.haskellActRssMiB = haskell.rssMiB;
      if (haskell.rssMiB > budgetMiB) throw new Error(`The Haskell act action held ${haskell.rssMiB} MiB, over the ${budgetMiB} MiB budget`);
    } finally { clearInterval(sampler); }
    peak = Math.max(peak, rssMiB());
    Object.assign(out, { peakRssMiB: peak, budgetMiB, seconds: Math.round(since(t) / 100) / 10 });
    if (peak > budgetMiB) throw new Error(`Three languages at once peaked at ${peak} MiB, over the ${budgetMiB} MiB budget: ${JSON.stringify(out)}`);
    return out;
  },
});

/**
 * The production Python and TypeScript pools (runtime/node.ts RUNTIME_OPTIONS) all warm and busy at once:
 * the instance's memory footprint, and the combined throughput with both languages in flight.
 */
export const footprint = internalAction({
  args: { acts: v.optional(v.number()), idleMs: v.optional(v.number()) },
  handler: async (ctx, { acts = 200, idleMs = 0 }) => {
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
    // After the idle TypeScript compiler stops (RUNTIME_OPTIONS compilerIdleMs): the pools' steady state between compiles.
    if (idleMs > 0) { await new Promise(resolve => setTimeout(resolve, Math.min(idleMs, 60_000))); out.rssIdleMiB = rssMiB(); }
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
      // Haskell's agent pool compiles nothing (another action does): the benchmark gives it a compiler of its own.
      const own = lang === "haskell" ? { compilation: "pool" as const, startupMs: 120_000, prepareMs: 120_000 } : {};
      runtime = createRuntime({ ...RUNTIME_OPTIONS[lang], ...own, execution, workers });
      benchRuntimes.set(key, runtime);
    }
    const { settings, inputs } = room(lang);
    return await measure(runtime, { settings, inputs, source: GRID_AGENTS[lang], acts, concurrency });
  },
});
