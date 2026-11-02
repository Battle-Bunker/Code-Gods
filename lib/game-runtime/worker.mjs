/**
 * worker_threads entry: one engine per worker. Bundled by scripts/build-worker.mjs into
 * generated/worker-source.mjs, which index.mjs starts with `new Worker(source, { eval: true })`, so it
 * works where the package's files are not on disk (a Convex Node action bundles this package).
 *
 * workerData: { language: "python", python: { files, module, snapshot? } }
 *           | { language: "haskell", role: "compile" | "execute" | "full", paths?, haskell: { compiler?, files?, evaluator? } }
 *             (the MicroHs modules and package files of engine/haskell-bundle.mjs; executing roles also load QuickJS)
 *           | { language: "typescript", role: "compile" | "execute", paths: { typescript, quickjs } }
 *             (absolute files the host resolved; an execution worker loads only QuickJS)
 * Messages in: { id, request }. Out: { type: "ready", snapshot? } | { type: "execute", id }
 *   | { type: "result", id, ok: true, result } | { type: "result", id, ok: false, code, error }.
 */
import { parentPort, workerData } from "node:worker_threads";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { RuntimeError } from "./engine/domain.mjs";
import { PythonEngine } from "./engine/python.mjs";
import { createTypeScriptEngine } from "./engine/typescript.mjs";
import { createQuickJSExecutor } from "./engine/quickjs.mjs";
import { HaskellCompiler, HaskellExecutor, createHaskellEngine } from "./engine/haskell.mjs";

async function start() {
  if (workerData.language === "python") {
    const engine = new PythonEngine(workerData.python);
    const snapshot = workerData.python.snapshot ? undefined : engine.snapshot;
    workerData.python.files = null;   // the bundle's files are needed only for bootstrap
    // The first worker bootstraps; the pool hands its snapshot to the next ones.
    return [engine, snapshot];
  }
  if (workerData.language === "haskell") {
    const { compiler, files, evaluator } = workerData.haskell;
    let executor = null;
    if (evaluator) {
      // The room's moves are encoded by its trusted JavaScript constructors, in QuickJS.
      const { getQuickJS } = await import(pathToFileURL(workerData.paths.quickjs).href);
      executor = new HaskellExecutor({ evaluator, quickjs: await createQuickJSExecutor({ getQuickJS }) });
    }
    return [createHaskellEngine({ compiler: compiler ? new HaskellCompiler({ compiler, files }) : null, executor })];
  }
  const { typescript, quickjs } = workerData.paths;
  const { getQuickJS } = await import(pathToFileURL(quickjs).href);
  if (workerData.role === "execute") {
    // Execution workers run trusted compiler output only: QuickJS, no TypeScript compiler.
    const executor = await createQuickJSExecutor({ getQuickJS });
    return [{ run(request, hooks) {
      if (request.mode === "script") {
        return executor.script({ js: request.js, input: request.input, cpuMs: request.settings.cpuMs, seed: request.seed, store: request.store }, hooks);
      }
      if (request.mode !== "execute") throw new Error("Unknown runner mode");
      const { settings } = request;
      return executor.execute({ js: request.js, preludeJs: settings.prelude.js, input: request.input,
        computeMs: settings.interactionComputeMs, seed: request.seed, stepBudget: settings.stepBudget }, hooks);
    } }];
  }
  const ts = createRequire(pathToFileURL(typescript))(typescript);
  const engine = await createTypeScriptEngine({ ts, getQuickJS });
  return [{ run: (request, hooks) => request.mode === "compile" ? engine.compile(request.source, request.settings)
    : request.mode === "transpile" ? engine.transpileScript(request.source) : engine.run(request, hooks) }];
}

start().then(([engine, snapshot]) => {
  parentPort.on("message", ({ id, request }) => {
    let reply;
    try {
      const result = engine.run(request, { onExecute: () => parentPort.postMessage({ type: "execute", id }) });
      reply = { type: "result", id, ok: true, result };
    } catch (error) {
      reply = { type: "result", id, ok: false, code: error instanceof RuntimeError ? error.code : "EXECUTION",
        error: String(error?.message ?? error).slice(0, 1000) };
    }
    parentPort.postMessage(reply);
  });
  parentPort.postMessage({ type: "ready", snapshot });
}, error => {
  // Startup failure (a missing dependency, a bad bundle): the pool reports UNAVAILABLE.
  parentPort.postMessage({ type: "failed", error: String(error?.message ?? error).slice(0, 1000) });
});
