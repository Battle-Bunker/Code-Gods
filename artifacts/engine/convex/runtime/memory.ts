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
