/**
 * worker_threads entry: one engine per worker (sandbox.ts, execution "worker").
 *
 * workerData: { language: "python", shared, python: { module, files } | { module, snapshot } } | { language:
 * "javascript", shared }. Messages in: { request: ExecuteRequest }. Out: { type: "ready", snapshot? } | { type:
 * "failed", error } | { type: "execute", wallMs } | { type: "host" } (a request is waiting in `shared`) | { type:
 * "result", ok, result | code, error }.
 */
import { parentPort, workerData } from "node:worker_threads";
import { SandboxError } from "./limits.ts";
import type { Engine, ExecuteRequest } from "./engine.ts";
import type { WorkerShared } from "./sandbox.ts";

const port = parentPort!;
const { control, data } = workerData.shared as WorkerShared;
const utf8 = new TextEncoder();

/** The channel from inside the worker: write the request, wake the host thread, block until it has replied. */
function host(request: string): string {
  const bytes = utf8.encode(request);   // the engine has already refused requests over the size limit
  data.set(bytes);
  control[1] = bytes.length;
  Atomics.store(control, 0, 1);
  port.postMessage({ type: "host" });
  Atomics.wait(control, 0, 1);
  const reply = new TextDecoder().decode(data.slice(0, control[1]));
  Atomics.store(control, 0, 0);
  return reply;
}

async function start(): Promise<[Engine, unknown]> {
  if (workerData.language === "python") {
    const { PythonEngine } = await import("./python.ts");
    const engine = new PythonEngine(workerData.python);
    return [engine, workerData.python.snapshot ? undefined : engine.snapshot];
  }
  const { QuickJSEngine } = await import("./quickjs.ts");
  return [await QuickJSEngine.create(), undefined];
}

start().then(([engine, snapshot]) => {
  port.on("message", ({ request }: { request: ExecuteRequest }) => {
    let reply;
    try {
      const result = engine.execute(request, { host, onExecute: () => port.postMessage({ type: "execute", wallMs: request.wallMs }) });
      reply = { type: "result", ok: true, result };
    } catch (error) {
      reply = { type: "result", ok: false, code: error instanceof SandboxError ? error.code : "EXECUTION", error: String((error as Error)?.message ?? error).slice(0, 1000) };
    }
    port.postMessage(reply);
  });
  port.postMessage({ type: "ready", snapshot });
}, error => {
  port.postMessage({ type: "failed", error: String(error?.message ?? error).slice(0, 1000) });
});
