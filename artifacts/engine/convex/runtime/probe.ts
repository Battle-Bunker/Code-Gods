"use node";
/**
 * Smoke tests and benchmarks of the agent sandboxes inside a Convex Node action (internal; run with
 * `npx convex run runtime/probe:<name>`). Numbers are recorded in lib/game-runtime/README.md.
 *   cold   first call after a push: bundle fetch, compile, bootstrap, first acts (both languages)
 *   smoke  {language?}: inspection, acts and the step limit per language, through the engine's path
 *   concurrent  {budgetMiB?}: each language's act action under load, and a compilation, against a memory budget
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
import { ACT_BATCH } from "../lib/programs";

const moduleLoadedAt = Date.now();
const language = v.union(v.literal("python"), v.literal("typescript"));

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
      // TypeScript's agent pool compiles nothing (runtime/compile.ts does): this measurement gives it a compiler of its own.
      const runtime = lang === "typescript" ? createRuntime({ ...RUNTIME_OPTIONS.typescript, compilation: "pool" }) : runtimeFor(lang);
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
};

/**
 * The deploy's smoke test of the agent sandboxes, one language per call (deploy.yml calls it for each), through the
 * engine's own path (engine/runtime.ts: this instance's pools; TypeScript compiled by runtime/compile.ts in another
 * action): inspect, acts, determinism and the step limit.
 */
export const smoke = internalAction({
  args: { language: v.optional(language) },
  handler: async (ctx, args) => {
    await bindRuntime(ctx);
    const out: Record<string, unknown> = {};
    for (const lang of args.language ? [args.language] : (["python", "typescript"] as const)) {
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
 * Each language's actions under load, as a tick of a game allowing both runs them (deploy.yml): a full batch of acts
 * per language in its own action (runtime/acts.ts), both at once, and a fresh TypeScript compilation
 * (runtime/compile.ts). Fails when any of those actions ends above `budgetMiB` resident (default 380 of the 512 MiB:
 * one language's pools need far less; real headroom, not a pass mark). Also reports what dispatching acts to their own
 * actions costs: the round trip of a one-act call.
 */
export const concurrent = internalAction({
  args: { budgetMiB: v.optional(v.number()) },
  handler: async (ctx, { budgetMiB = 380 }) => {
    const t = performance.now();
    const out: Record<string, unknown> = { budgetMiB };
    const batch = async (lang: Language) => {
      const { game, inputs } = room(lang);
      const { replies, rssMiB } = await ctx.runAction(internal.runtime.acts.run, { language: lang, settings: game,
        requests: Array.from({ length: ACT_BATCH }, (_, i) => ({ source: GRID_AGENTS[lang], input: inputs[i % inputs.length], seed: String(i) })) });
      const failed = replies.find(reply => !reply.ok);
      if (failed) throw new Error(`${lang} acts failed: ${JSON.stringify(failed)}`);
      return rssMiB;
    };
    const fresh = `${GRID_AGENTS.typescript}\n// probe ${Date.now()}\n`;
    const [python, typescript, compiled] = await Promise.all([batch("python"), batch("typescript"),
      ctx.runAction(internal.runtime.compile.compile, { language: "typescript", source: fresh, settings: room("typescript").game })]);
    if (!compiled.ok) throw new Error(`The TypeScript compilation failed: ${compiled.message}`);
    const rss: Record<string, number> = { python, typescript, ...(compiled.rssMiB !== undefined ? { typescriptCompiler: compiled.rssMiB } : {}) };
    out.rssMiB = rss;
    // The dispatch's cost: one warm act through its own action, end to end (median of 5).
    const { game, inputs } = room("python");
    const trips: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      await engine.act(ctx, GRID_AGENTS.python, "python", inputs[i]!, game, BigInt(100 + i));
      trips.push(performance.now() - start);
    }
    out.oneActRoundTripMs = Math.round(trips.sort((a, b) => a - b)[2]!);
    out.seconds = Math.round(since(t) / 100) / 10;
    const over = Object.entries(rss).filter(([, mib]) => mib > budgetMiB);
    if (over.length) throw new Error(`Over the ${budgetMiB} MiB budget: ${over.map(([k, mib]) => `${k} ${mib} MiB`).join(", ")}: ${JSON.stringify(out)}`);
    return out;
  },
});

/** This instance's resident memory and the production pools' live workers. */
export const memory = internalAction({
  args: {},
  handler: async () => {
    const python = runtimeFor("python") as GameRuntime & { slots: unknown[] };
    const typescript = runtimeFor("typescript") as GameRuntime & { slots: unknown[] };
    return { rssMiB: rssMiB(), pythonWorkers: python.slots.length, typescriptWorkers: typescript.slots.length, memory: process.memoryUsage() };
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
      // TypeScript's agent pool compiles nothing (another action does): the benchmark gives it a compiler of its own.
      const own = lang === "typescript" ? { compilation: "pool" as const } : {};
      runtime = createRuntime({ ...RUNTIME_OPTIONS[lang], ...own, execution, workers });
      benchRuntimes.set(key, runtime);
    }
    const { settings, inputs } = room(lang);
    return await measure(runtime, { settings, inputs, source: GRID_AGENTS[lang], acts, concurrency });
  },
});
