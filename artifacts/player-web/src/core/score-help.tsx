/**
 * The small shared pieces that explain a score (the words are in ./words.ts): what a bit is (a hover title and a tap
 * target, since a phone has no hover), the step from a total to the line-by-line list (the Lines pane sorted by your
 * points, through the same view affordances an assistant uses), and the "tied" marker.
 */
import { useAffordance } from "@workspace/v2-affordances/react";
import { objectWord, useGame, useReplaySource } from "@/sdk";
import { usePaneOps } from "@/dock/open-pane";
import { toast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BITS_HELP, BOUND_NOTE, eachEntryText, othersNote, seeEachText, TIE_NOTE } from "./words";

/** A "?" beside a figure in bits: "Each bit = twice as rare." on hover and on tap. */
export function BitsHelp({ testId = "button-bits-help" }: { testId?: string }) {
  const word = objectWord(useGame()?.variant);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" title={BITS_HELP} aria-label={`What is a bit? ${BITS_HELP}`} data-testid={testId}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current align-middle text-[11px] leading-none text-muted-foreground hover:text-foreground">
          ?
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-xs p-2 text-xs" data-testid="text-bits-help">
        {BITS_HELP} {othersNote(word.one)}
      </PopoverContent>
    </Popover>
  );
}

/** "See it line by line" (or grid by grid): open the list sorted by your points (view.sortObjects, then view.openPane). */
export function LineByLine({ testId, className }: { testId: string; className?: string }) {
  const header = useGame();
  const replay = useReplaySource();
  const panes = usePaneOps(replay ? "replay" : header?.phase ?? "live");
  const sort = useAffordance("view.sortObjects");
  const w = objectWord(header?.variant);
  if (!sort.available || (!header?.me && !replay)) return null;
  const go = async () => {
    try { await sort.run({ sort: "points" }); }
    catch (e) { toast({ title: "The order did not change", description: e instanceof Error ? e.message : String(e), variant: "destructive" }); }
    if (await panes.open("objects")) toast({ title: `${w.Many}, best for you first`, description: eachEntryText(w) });
  };
  return (
    <button type="button" onClick={() => void go()} data-testid={testId} title={`Open ${w.Many}, best for you first: ${eachEntryText(w)}`}
      className={className ?? "text-xs underline underline-offset-4"}>
      {seeEachText(w)}
    </button>
  );
}

/** Beside an energy that is an upper bound, not a found value (the estimator's work budget ran out). */
export function BoundMark({ testId }: { testId?: string }) {
  return <span className="cursor-help text-muted-foreground" title={BOUND_NOTE} aria-label={BOUND_NOTE} data-testid={testId}>≤</span>;
}

/** "tied", beside a place another player shares. */
export function TiedMark({ testId }: { testId?: string }) {
  return <span className="border px-1 text-[10px] font-medium uppercase text-muted-foreground" title={TIE_NOTE} data-testid={testId}>tied</span>;
}
