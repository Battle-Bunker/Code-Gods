/** Server timestamps are unix ms; very old fields may still be unix seconds. */
export const toMs = (t: number) => (t > 1e11 ? t : t * 1000);

export function fmtWhen(t: number | null | undefined) {
  if (t === null || t === undefined || !t) return "—";
  return new Date(toMs(t)).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
}

export const isoWhen = (t: number) => new Date(toMs(t)).toISOString();

export function fmtDuration(ms: number) {
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
