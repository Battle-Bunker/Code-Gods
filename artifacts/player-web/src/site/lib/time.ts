/** Server timestamps are unix ms; very old fields may still be unix seconds. */
export const toMs = (t: number) => (t > 1e11 ? t : t * 1000);

function validDate(t: number | null | undefined): Date | undefined {
  // Old API responses can omit fields even when the current generated type requires them.
  if (typeof t !== "number" || !Number.isFinite(t)) return undefined;
  const date = new Date(toMs(t));
  return Number.isFinite(date.getTime()) ? date : undefined;
}

export function fmtWhen(t: number | null | undefined) {
  return validDate(t)?.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }) ?? "Unknown date";
}

export const isoWhen = (t: number | null | undefined) => validDate(t)?.toISOString();

export function fmtDuration(ms: number) {
  if (!Number.isFinite(ms)) return "Unknown duration";
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${r}s` : `${r}s`;
}

export function secsLeft(target: number, now: number) {
  if (!target) return null;
  const ms = now > 1e11 ? target - now : (target - now) * 1000;
  return Math.max(0, ms / 1000);
}

export const endReasonLabel = (r: string | null | undefined) =>
  r === "lifetime" ? "world lifetime expired" : r === "owner" ? "ended by owner" : r === "retired" ? "retired by server" : r ? r : "—";

/**
 * The world clock without a per-tick query (docs/convex-read-architecture.md §4.2): the world time of the last published
 * scoreboard, run on by the wall time since while the world runs (world time follows wall time then), held otherwise.
 * `resumedAt`: when the world last started running (the planning or pause deadline), if after the publication.
 */
export function worldSecondsAt(published: { world: number; at: number; running: boolean; resumedAt?: number } | null, now: number): number | null {
  if (!published) return null;
  // World time stood still during planning and pauses: it runs on from whichever came last, the publication or the resume.
  const since = Math.max(toMs(published.at), published.resumedAt ? toMs(published.resumedAt) : 0);
  return published.running ? published.world + Math.max(0, toMs(now) - since) / 1000 : published.world;
}
