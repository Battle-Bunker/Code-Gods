/** The freshness mark beside an object you see as last seen (owner decision 33): green when up to date, amber when it changed since. */
import { freshness, seenWords, type Seen } from "./seen";

export function FreshMark({ o, testId }: { o: Seen; testId?: string }) {
  const f = freshness(o);
  if (!f) return null;
  return (
    <span role="img" aria-label={f === "fresh" ? "up to date" : "changed since you looked"} title={seenWords(o) ?? undefined} data-testid={testId} data-fresh={f}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${f === "fresh" ? "bg-emerald-500" : "bg-amber-500"}`} />
  );
}
