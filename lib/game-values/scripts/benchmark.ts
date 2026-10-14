import { performance } from "node:perf_hooks";
import { generate } from "../src/index.ts";
import { random, sampleDomain } from "../src/model.ts";

// Run from repository root or through the package script. No files generated.
for (const options of [
  { objectType: "Int" as const, seed: 42 },
  { objectType: "string" as const, seed: 42, stringMaxLength: 128 },
  { objectType: "string" as const, seed: 42, stringMaxLength: 4096 },
]) {
  const start = performance.now();
  const g = generate(options);
  const generationMs = performance.now() - start;
  const below = random(99);
  const inputs = Array.from({ length: 64 }, () => sampleDomain(g.manifest.domain, below));
  for (let i = 0; i < 1000; i++) g.gods[i % 3].evaluate(inputs[i % inputs.length]);
  const iterations = options.objectType === "Int" ? 200000 : options.stringMaxLength === 4096 ? 2000 : 20000;
  let checksum = 0;
  const timing = performance.now();
  for (let i = 0; i < iterations; i++) checksum += g.gods[i % 3].evaluate(inputs[i % inputs.length]);
  const elapsedMs = performance.now() - timing;
  console.log(JSON.stringify({
    node: process.version, ...options, generationMs, iterations, elapsedMs,
    evaluationsPerSecond: iterations * 1000 / elapsedMs, microsecondsPerEvaluation: elapsedMs * 1000 / iterations, checksum,
  }));
}
