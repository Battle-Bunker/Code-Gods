import { GameRuntime } from "../index.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Fixture prelude (identity decode, `add(k)`); real preludes cost more to set up per act.
const fixture = JSON.parse(readFileSync(new URL("./fixture-prelude.json", import.meta.url), "utf8"));
const settings = { ...fixture, interactionComputeMs: 5 };
const expected = JSON.stringify([["add", { k: 82 }]]);
for (const language of process.argv.slice(2).length ? process.argv.slice(2) : ["python", "typescript"]) {
  const r = new GameRuntime({ language, workers: 4 });
  const sources = Array.from({ length: 8 }, (_, i) => language === "python"
    ? `def agent(x):\n    return [add(x + 1 + ${i} - ${i})]\n`
    : `function agent(x) {\n  return [add(x + 1 + ${i} - ${i})];\n}\n`);
  let next = 0;
  const act = async () => assert.equal((await r.act(sources[next++ % sources.length], 81, settings, String(next))).calls, expected);
  try {
    const start = performance.now();
    await act();
    const cold = performance.now() - start;
    assert.equal(r.slots.length, 1, "Sequential startup must not spawn all workers");
    for (const source of sources) await r.inspect(source, settings);
    const warm = performance.now();
    for (let n = 0; n < 100; n++) await act();
    const warmMeanMs = (performance.now() - warm) / 100;
    // Grow lazily, then warm each process. This phase includes cold worker
    // startup and is intentionally excluded from parallel steady-state timing.
    await Promise.all(Array.from({ length: 4 }, act));
    const readyDeadline = performance.now() + r.startupMs;
    while (r.slots.filter(slot => slot.ready).length !== 4) {
      assert.ok(performance.now() < readyDeadline, "Four workers must become ready");
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    for (let n = 0; n < 4; n++) await Promise.all(Array.from({ length: 8 }, act));
    assert.equal(r.slots.length, 4);
    const latencies = [];
    const errors = {};
    const timed = async () => {
      const t = performance.now();
      try { await act(); latencies.push(performance.now() - t); }
      catch (error) { errors[error.code ?? error.message] = (errors[error.code ?? error.message] ?? 0) + 1; }
    };
    const parallel = performance.now();
    for (let n = 0; n < 100; n++) await Promise.all(Array.from({ length: 8 }, timed));
    const durationMs = performance.now() - parallel;
    latencies.sort((a, b) => a - b);
    const at = q => latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))];
    console.log(JSON.stringify({ language, distinctAgents: sources.length, workers: 4, requests: 800,
      coldMs: cold, warmMeanMs, attemptedPerSecond: 800 * 1000 / durationMs,
      p50Ms: at(0.5), p95Ms: at(0.95), maxMs: latencies.at(-1), succeeded: latencies.length, errors }));
  } finally { r.close(); }
}
