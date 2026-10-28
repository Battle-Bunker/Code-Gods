// Resident memory of the runtime's parts, in one process (development aid):
//   node --experimental-strip-types scripts/memory.mjs
import { GameRuntime, loadPythonRuntime } from "../index.mjs";
import { GRID_AGENTS } from "../benchmark.mjs";
import { roomSettings } from "../test/parity/make-cases.mjs";

const rss = () => Math.round(process.memoryUsage().rss / 1048576);
const report = (label, before) => { const now = rss(); console.log(`${label.padEnd(44)} rss ${String(now).padStart(4)} MiB  (+${now - before})`); return now; };
const exercise = async (runtime, language) => {
  const { settings, inputs } = roomSettings("Grid", language);
  await runtime.inspect(GRID_AGENTS[language], settings);
  await Promise.all(Array.from({ length: 24 }, (_, i) => runtime.act(GRID_AGENTS[language], inputs[i % inputs.length], settings, String(i + 1))));
};
let last = report("baseline (Node + game-types)", 0);
await loadPythonRuntime();
last = report("python bundle loaded + compiled (main)", last);
const python = new GameRuntime({ language: "python", workers: 2 });
await python.warm(1); await exercise(python, "python");
last = report("python worker 1 (bootstrap) + acts", last);
await python.warm(2); await exercise(python, "python");
last = report("python worker 2 (from snapshot) + acts", last);
const typescript = new GameRuntime({ language: "typescript", workers: 2 });
await typescript.warm(1); await exercise(typescript, "typescript");
last = report("typescript worker 1 + Grid compile + acts", last);
await typescript.warm(2); await exercise(typescript, "typescript");
last = report("typescript worker 2 + Grid compile + acts", last);
python.close(); typescript.close();
