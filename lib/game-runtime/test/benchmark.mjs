import { GameRuntime } from "../index.mjs";
import assert from "node:assert/strict";
const settings = { objectType: "Int", intMin: -2147483648, intMax: 2147483647, stringMaxLength: 256 };
for (const language of ["python", "typescript"]) {
  const r = new GameRuntime({ language, workers: 4 });
  const source = language === "python" ? "lambda x: x" : "(x:number) => x";
  const execute = async () => assert.deepEqual(await r.execute(source, 81, settings), { value: 81 });
  try {
    const start = performance.now();
    await execute();
    const cold = performance.now() - start;
    assert.equal(r.slots.length, 1, "Sequential startup must not spawn all workers");
    const warm = performance.now();
    for (let n=0; n<10; n++) await execute();
    const warmMeanMs = (performance.now()-warm)/10;
    // Grow lazily, then warm each process. This phase includes cold worker
    // startup and is intentionally excluded from parallel steady-state timing.
    await Promise.all(Array.from({ length: 4 }, execute));
    const readyDeadline = performance.now() + r.startupMs;
    while (r.slots.filter(slot => slot.ready).length !== 4) {
      assert.ok(performance.now() < readyDeadline, "Four workers must become ready");
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await Promise.all(Array.from({ length: 4 }, execute));
    assert.equal(r.slots.length, 4);
    const parallel = performance.now();
    let workerPids;
    for (let n=0; n<10; n++) {
      const batch = Array.from({ length: 4 }, execute);
      workerPids = r.slots.filter(slot => slot.job).map(slot => slot.child.pid);
      assert.equal(new Set(workerPids).size, 4, "Four independent workers must be in flight");
      await Promise.all(batch);
    }
    const parallel4BatchMeanMs = (performance.now()-parallel)/10;
    console.log(JSON.stringify({ language, coldMs: cold, warmMeanMs,
      parallel4BatchMeanMs, parallelExecutionsPerSecond: 4000/parallel4BatchMeanMs, workerPids }));
  } finally { r.close(); }
}
