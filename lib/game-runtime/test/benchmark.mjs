// Local benchmark: the realistic Grid agent on the default Grid prelude (lib/game-types), open-agent
// settings (interactionComputeMs 1000, step budget 500,000), a fresh seed per act.
//   node --experimental-strip-types test/benchmark.mjs [python|typescript ...]
// Prints one JSON line per configuration (benchmark.mjs `measure`).
import { GameRuntime } from "../index.mjs";
import { GRID_AGENTS, measure } from "../benchmark.mjs";
import { roomSettings } from "./parity/make-cases.mjs";

const languages = process.argv.slice(2).length ? process.argv.slice(2) : ["python", "typescript"];
const configurations = [["inline", 1], ["worker", 1], ["worker", 2], ["worker", 4]];
for (const language of languages) {
  const { settings, inputs } = roomSettings("Grid", language);
  for (const [execution, workers] of configurations) {
    const runtime = new GameRuntime({ language, execution, workers });
    try {
      const result = await measure(runtime, { settings, inputs, source: GRID_AGENTS[language], acts: 300 });
      console.log(JSON.stringify(result));
    } finally { runtime.close(); }
  }
}
