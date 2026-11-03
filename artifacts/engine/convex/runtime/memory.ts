/**
 * What an action reports of its process's memory (runtime/probe.ts concurrent asserts it). Convex reuses warm Node
 * processes, so the resident size at the end of a call is its own footprint plus whatever earlier calls left behind
 * (grown WebAssembly memory, V8 heap, a compiler kept warm): `startMiB` separates the two, `peakMiB` is the process's
 * highest resident size so far (what the 512 MiB limit actually kills at; the end of a call can sit below it).
 */
export type Memory = { startMiB: number; rssMiB: number; peakMiB: number };
const MiB = 1048576;
export const rssNow = () => Math.round(process.memoryUsage().rss / MiB);
/** Resident size now, as the action started, and the process's peak (`maxRSS` is in KiB). */
export const memoryOf = (startMiB: number): Memory =>
  ({ startMiB, rssMiB: rssNow(), peakMiB: Math.max(rssNow(), Math.round(process.resourceUsage().maxRSS / 1024)) });

/**
 * The process's highest resident size a release may reach. Convex's Node actions have 512 MiB RAM (docs.convex.dev
 * production/state/limits: MiB, not MB); 460 leaves 52 MiB. Only the peak (`maxRSS`) measures the risk: the end of a
 * reused warm process is already inside the next call's peak, so gating on it fails releases spuriously.
 */
export const PEAK_CEILING_MIB = 460;
/** An action ending above this resident size is reported as a warning only (it never fails the probe). */
export const END_WARNING_MIB = 400;

/** The probe's verdict on each action's memory: `failures` (peak over the ceiling) fail it, `warnings` (end over 400) do not. */
export function judgeMemory(memory: Record<string, Memory>): { failures: string[]; warnings: string[] } {
  const line = (k: string, m: Memory) => `${k} start ${m.startMiB}, end ${m.rssMiB}, peak ${m.peakMiB} MiB`;
  const entries = Object.entries(memory);
  return {
    failures: entries.filter(([, m]) => m.peakMiB > PEAK_CEILING_MIB).map(([k, m]) => line(k, m)),
    warnings: entries.filter(([, m]) => m.rssMiB > END_WARNING_MIB && m.peakMiB <= PEAK_CEILING_MIB).map(([k, m]) => line(k, m)),
  };
}
