/**
 * The freshness mark and words beside an object you see as last seen (owner decisions 33, 36): green when up to date
 * or seen moments ago, amber when it changed since and the view is older than a few seconds. Ages count on the
 * browser's clock from the world's start (no server read: the header is cold).
 */
import { useNow } from "@/core/game-timer";
import { useGame } from "@/sdk";
import { freshness, seenShort, seenWords, type Seen } from "./seen";

/** World seconds now, from the world's start (pauses aside): what a view's age is measured against. */
export function useWorldNow(): number | null {
  const header = useGame();
  const now = useNow(1000);
  if (!header?.startedAt || header.phase !== "live") return null;
  return Math.max(0, (now - header.startedAt) / 1000);
}

export function FreshMark({ o, testId, worldNow }: { o: Seen; testId?: string; worldNow?: number | null }) {
  const f = freshness(o, worldNow);
  if (!f) return null;
  return (
    <span role="img" aria-label={f === "fresh" ? "up to date" : "changed since you looked"} title={seenWords(o) ?? undefined} data-testid={testId} data-fresh={f}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${f === "fresh" ? "bg-emerald-500" : "bg-amber-500"}`} />
  );
}

/** A row's mark and short words: "seen 4 s ago", "seen 30 s ago · changed 2×". */
export function SeenNote({ o, number }: { o: Seen; number: number }) {
  const worldNow = useWorldNow();
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground" data-testid={`text-seen-line-${number}`} title={seenWords(o) ?? undefined}>
      <FreshMark o={o} worldNow={worldNow} testId={`mark-fresh-line-${number}`} />{seenShort(o, worldNow)}
    </span>
  );
}
