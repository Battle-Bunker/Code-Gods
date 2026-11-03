/**
 * The runtime benchmark, shared by test/benchmark.mjs (local) and the Convex probe action
 * (artifacts/engine/convex/runtime/probe.ts), so both measure the same thing.
 */

/** A realistic Grid agent (default Grid prelude): scans every line, finds regions, makes two moves. */
export const GRID_AGENTS = Object.freeze({
  python: `def agent(grid):
    best = None
    for line in grid.rows + grid.columns + grid.diagonals:
        counts = {}
        for c in line:
            counts[c.colour] = counts.get(c.colour, 0) + 1
        colour = max(counts, key=counts.get)
        if best is None or counts[colour] > best[0]:
            best = (counts[colour], line, colour)
    groups = grid.regions(lambda a, b: a.colour == b.colour)
    big = max(groups, key=len)
    target = big[0].colour
    calls = [paint(row(best[1][0].row), best[2])]
    if len(big) < grid.size * grid.size:
        calls.append(recolour(everything(), next_colour(target), target))
    return calls
`,
  typescript: `function agent(grid) {
  let best: { n: number; line: Cell[]; colour: Colour } | null = null;
  for (const line of [...grid.rows, ...grid.columns, ...grid.diagonals]) {
    const counts = new Map<Colour, number>();
    for (const c of line) counts.set(c.colour, (counts.get(c.colour) ?? 0) + 1);
    let colour = line[0].colour;
    for (const [k, n] of counts) if (n > (counts.get(colour) ?? 0)) colour = k;
    const n = counts.get(colour) ?? 0;
    if (best === null || n > best.n) best = { n, line, colour };
  }
  const groups = grid.regions((a, b) => a.colour === b.colour);
  let big = groups[0];
  for (const g of groups) if (g.length > big.length) big = g;
  const target = big[0].colour;
  const calls = [paint(row(best!.line[0].row), best!.colour)];
  if (big.length < grid.size * grid.size) calls.push(recolour(everything(), nextColour(target), target));
  return calls;
}
`,
});

const stats = latencies => {
  const sorted = [...latencies].sort((a, b) => a - b);
  const at = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const round = x => Math.round(x * 100) / 100;
  return { n: sorted.length, p50Ms: round(at(0.5)), p95Ms: round(at(0.95)), maxMs: round(sorted.at(-1)),
    meanMs: round(sorted.reduce((s, x) => s + x, 0) / sorted.length) };
};
const mib = bytes => Math.round(bytes / 1048576);
const memory = () => { const m = process.memoryUsage(); return { rssMiB: mib(m.rss), heapUsedMiB: mib(m.heapUsed), externalMiB: mib(m.external), arrayBuffersMiB: mib(m.arrayBuffers) }; };

/**
 * Measures one runtime: start-up (warm), first inspection, sequential warm acts, then `concurrency`
 * acts in flight at a time. Every act gets a fresh seed and cycles through `inputs`.
 * @param {import("./index.mjs").GameRuntime} runtime
 */
export async function measure(runtime, { settings, inputs, source, acts = 200, concurrency = runtime.workers, warmup = 20 }) {
  const result = { language: runtime.language, execution: runtime.execution, workers: runtime.workers, memoryBefore: memory() };
  let t = performance.now();
  await runtime.warm();
  result.warmMs = Math.round(performance.now() - t);
  t = performance.now();
  const inspection = await runtime.inspect(source, settings);
  result.firstInspectMs = Math.round(performance.now() - t);
  result.cost = inspection.cost;
  let seed = 1;
  const act = async () => {
    const start = performance.now();
    const out = await runtime.act(source, inputs[seed % inputs.length], settings, String(seed++));
    return [performance.now() - start, out];
  };
  t = performance.now();
  const [firstMs, first] = await act();
  result.firstActMs = Math.round(firstMs);
  result.sample = { calls: first.calls, steps: first.steps };
  for (let i = 0; i < warmup; i++) await act();
  const sequential = [];
  t = performance.now();
  for (let i = 0; i < acts; i++) sequential.push((await act())[0]);
  result.sequential = { ...stats(sequential), actsPerSecond: Math.round(acts * 1000 / (performance.now() - t)) };
  // All engines warm before the parallel phase.
  await Promise.all(Array.from({ length: concurrency * 2 }, act));
  const parallel = [];
  t = performance.now();
  let issued = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (issued++ < acts) parallel.push((await act())[0]);
  }));
  result.parallel = { concurrency, ...stats(parallel), actsPerSecond: Math.round(acts * 1000 / (performance.now() - t)) };
  result.memoryAfter = memory();
  return result;
}
