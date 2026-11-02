import type { GameRuntime, ActSettings, WireValue } from "./index.js";

export const GRID_AGENTS: Readonly<{ python: string; typescript: string }>;
export interface LatencyStats { n: number; p50Ms: number; p95Ms: number; maxMs: number; meanMs: number }
export interface MemoryStats { rssMiB: number; heapUsedMiB: number; externalMiB: number; arrayBuffersMiB: number }
export interface Measurement {
  language: string; execution: string; workers: number;
  memoryBefore: MemoryStats; memoryAfter: MemoryStats;
  warmMs: number; firstInspectMs: number; firstActMs: number; cost: number;
  sample: { calls: string; steps: number };
  sequential: LatencyStats & { actsPerSecond: number };
  parallel: LatencyStats & { concurrency: number; actsPerSecond: number };
}
export function measure(runtime: GameRuntime, options: {
  settings: ActSettings; inputs: WireValue[]; source: string; acts?: number; concurrency?: number; warmup?: number;
}): Promise<Measurement>;
