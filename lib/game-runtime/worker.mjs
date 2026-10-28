/**
 * worker_threads entry: one engine per worker. Bundled by scripts/build-worker.mjs into
 * generated/worker-source.mjs, which index.mjs starts with `new Worker(source, { eval: true })`, so it
 * works where the package's files are not on disk (a Convex Node action bundles this package).
 *
 * workerData: { language: "python", python: { files, module, snapshot? } }
 *           | { language: "typescript", paths: { typescript, quickjs } }   (absolute files the host resolved)
 * Messages in: { id, request }. Out: { type: "ready", snapshot? } | { type: "execute", id }
 *   | { type: "result", id, ok: true, result } | { type: "result", id, ok: false, code, error }.
 */
import { parentPort, workerData } from "node:worker_threads";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { RuntimeError } from "./engine/domain.mjs";
import { PythonEngine } from "./engine/python.mjs";
import { createTypeScriptEngine } from "./engine/typescript.mjs";

async function start() {
  if (workerData.language === "python") {
    const engine = new PythonEngine(workerData.python);
    // The first worker bootstraps; the pool hands its snapshot to the next ones.
    return [engine, workerData.python.snapshot ? undefined : engine.snapshot];
  }
  const { typescript, quickjs } = workerData.paths;
  const ts = createRequire(pathToFileURL(typescript))(typescript);
  const { getQuickJS } = await import(pathToFileURL(quickjs).href);
  return [await createTypeScriptEngine({ ts, getQuickJS })];
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
