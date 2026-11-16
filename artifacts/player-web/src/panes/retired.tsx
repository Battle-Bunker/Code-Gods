/**
 * Line turnover in the app (engine docs/engine-v2/retirement-design.md): the rule said once above the lines, a mark on
 * a line that just arrived, and the retired lines below the live ones, each with its final state and the points it
 * banked for you. The retired list is a skeleton of ids (`v2/play:banked`, a page at a time) with each row its own
 * subscription to its line (`v2/play:object`), as the live list is (docs/convex-read-architecture.md R1). Nothing shows
 * in a game without turnover.
 */
import { useCallback, useMemo } from "react";
import { ObjectChip } from "@workspace/v2-views";
import { decodeState, objectTypeOf, objectWord, useBankedIds, useGame, useMyObject } from "@/sdk";
import { VirtualRows } from "@/components/virtual-rows";
import { bankedWords, isNewLine, turnoverNote } from "./turnover-words";
import { useWorldNow } from "./fresh-mark";

const ROW_H = 40, MAX_H = 6 * ROW_H;

/** "At most 5 lines are live. A new line arrives every 30 s, and the oldest retires: …" (null without turnover). */
export function TurnoverNote() {
  const header = useGame();
  const text = turnoverNote(header?.turnover, objectWord(header?.variant));
  if (!text) return null;
  return <p className="px-3 text-xs text-muted-foreground" data-testid="text-turnover-note">{text}</p>;
}

/** "new" beside a line born in the last half minute (never a starting line). */
export function NewMark({ bornAt, number }: { bornAt: number; number: number }) {
  const header = useGame();
  // Only a game with turnover, and never a starting line, runs the mark's clock.
  if (!header?.turnover || bornAt <= 0 || header.phase !== "live") return null;
  return <NewMarkTicking bornAt={bornAt} number={number} variant={header.variant} />;
}
function NewMarkTicking({ bornAt, number, variant }: { bornAt: number; number: number; variant: string }) {
  const worldNow = useWorldNow();
  if (!isNewLine(bornAt, worldNow)) return null;
  return (
    <span className="border border-emerald-600/60 px-1 text-[10px] font-medium uppercase text-emerald-700 dark:text-emerald-400" data-testid={`badge-new-line-${number}`}
      title={`Just arrived in the world.`}>new</span>
  );
}

function RetiredRow({ objectId, number, variant, banked, approx }: { objectId: string; number: number; variant: string; banked: boolean; approx: boolean }) {
  const o = useMyObject(objectId);
  const word = objectWord(variant);
  const state = useMemo(() => (o?.state ? decodeState(o.state, variant) : null), [o?.state, variant]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex h-full items-center gap-3 border-t border-[hsl(var(--card-border))] px-3 text-xs" data-testid={`row-retired-${number}`}>
      <span className="w-14 shrink-0 text-muted-foreground">{word.One} {number}</span>
      {state && variant ? <ObjectChip type={objectTypeOf(variant)} state={state} /> : <span className="text-muted-foreground">…</span>}
      {o?.retiredAt !== undefined && o.value && (
        <span className="ml-auto tabular-nums" data-testid={`text-retired-line-${number}`}>{bankedWords({ retiredAt: o.retiredAt, points: o.value.points }, banked, approx)}</span>
      )}
    </div>
  );
}

/** The retired lines, the latest first, with what each banked for you. */
export function RetiredLines() {
  const header = useGame();
  const ids = useBankedIds();
  const { status, loadMore } = ids;
  const onNearEnd = useCallback(() => { if (status === "CanLoadMore") loadMore(30); }, [status, loadMore]);
  if (!header?.turnover || !ids.results.length) return null;
  const word = objectWord(header.variant);
  return (
    <section className="space-y-1 pt-2" data-testid="retired-lines">
      <h3 className="px-3 text-xs font-semibold">Retired {word.many}</h3>
      <VirtualRows rows={ids.results} rowHeight={ROW_H} maxHeight={MAX_H} keyOf={r => r.objectId} onNearEnd={onNearEnd} testId="retired-lines-list"
        render={r => <RetiredRow objectId={r.objectId} number={r.number} variant={header.variant} banked={header.turnover!.banked} approx={header.phase !== "ended"} />} />
    </section>
  );
}
