/**
 * Parameter drift (call 18) on screen: the goal card's countdown and notice, the same notice at the top of What just
 * changed (round 16: on a phone the goal card is another tab), and a toast once per redraw from the game screen itself,
 * which stays mounted whatever pane is in front. Words: ./drift-words.ts.
 */
import { useEffect, useMemo, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import { useGame, useMyRule } from "@/sdk";
import { useWorldNow } from "./fresh-mark";
import { nextDriftAt } from "@workspace/v2-core";
import { DRIFT_MEANS, driftNotice, driftWords, targetChange } from "./drift-words";

/**
 * Each game's rule parameters by drift count, as this page saw them: what a redraw changed from (a reload knows only
 * the numbers now, and the notice then says "numbers" without naming the target).
 */
const seenParams = new Map<string, Map<number, unknown>>();
function changeOf(gameId: string, drifts: number, params: unknown) {
  const byCount = seenParams.get(gameId) ?? new Map<number, unknown>();
  seenParams.set(gameId, byCount);
  if (!byCount.has(drifts)) byCount.set(drifts, params);
  return drifts > 0 ? targetChange(byCount.get(drifts - 1), params) : null;
}

/** The countdown to this seat's own next redraw (W3 #745) and the notice after one; nulls when there is nothing to say. */
function useDrift(): { countdown: string | null; notice: string | null } {
  const header = useGame();
  const my = useMyRule();
  const worldNow = useWorldNow();
  const rule = my?.rule ?? null;
  const choices = useMemo(() => { try { return rule ? rule.family.dealable(rule.variant).length : 0; } catch { return 0; } }, [rule]);
  if (!header || !my) return { countdown: null, notice: null };
  const scale = header.timeScale ?? 1;
  const seat = header.roster.findIndex(m => m.memberId === header.me);
  const nextAt = seat < 0 || worldNow == null ? null
    : nextDriftAt(header.driftSeconds ?? 0, header.roster.length, seat, worldNow, header.durationMode === "fixed" ? header.worldSeconds : null);
  return {
    countdown: driftWords(nextAt, worldNow, choices, scale),
    notice: driftNotice(my.row, worldNow, changeOf(header.gameId, my.row.drifts, my.row.params), scale),
  };
}

const NOTICE = "border-l-4 border-primary bg-primary/5 px-2 py-1 font-medium";

/** On the goal card: the notice just after a redraw, and the countdown to the next chance. */
export function DriftOnCard() {
  const { countdown, notice } = useDrift();
  if (!countdown && !notice) return null;
  return (
    <div className="space-y-1 px-3 pt-3 text-sm">
      {notice && <p className={NOTICE} role="status" data-testid="text-drift-notice">{notice}</p>}
      {countdown && <p className="text-xs text-muted-foreground" data-testid="text-drift-countdown" title={`Every so often each player's rule may get new numbers: the same kind of rule, a new target. ${DRIFT_MEANS}`}>{countdown}</p>}
    </div>
  );
}

/** At the top of What just changed: the notice just after a redraw. */
export function DriftInFeed() {
  const { notice } = useDrift();
  return notice ? <p className={`${NOTICE} text-sm`} role="status" data-testid="text-drift-feed">{notice}</p> : null;
}

/**
 * A toast once per redraw, while live, from the game screen (mounted whatever pane shows). The first count it sees is
 * the baseline: a reload never toasts an old redraw.
 */
export function DriftToast() {
  const header = useGame();
  const my = useMyRule();
  const seen = useRef<{ gameId: string; drifts: number } | null>(null);
  const drifts = my?.row.drifts;
  useEffect(() => {
    if (!header || drifts === undefined) return;
    const was = seen.current?.gameId === header.gameId ? seen.current.drifts : null;
    seen.current = { gameId: header.gameId, drifts };
    // Recorded every time, so the numbers before a redraw are known whichever panes are open.
    const change = changeOf(header.gameId, drifts, my!.row.params);
    if (was !== null && drifts > was && header.phase === "live") {
      toast({ duration: 15_000, title: change ? `Your rule's target changed from ${change.from} to ${change.to}` : "Your rule's numbers just changed",
        description: `${DRIFT_MEANS} Your rule now: ${my!.row.card}` });
    }
  }, [header?.gameId, drifts]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
