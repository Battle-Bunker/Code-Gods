/**
 * The game screen's dock: the panes the human has open (their view state's `panes`, or the phase's defaults: v2-client
 * `shownPanes`), each in its own frame with its own error boundary (ux-lessons 4.1: a failed pane takes down only
 * itself). Desktop (≥ 768 px): columns left, main, right and a bottom row. Phone: one column in reading order, no
 * inner scroller taller than the screen allows (ux-lessons 5.1). A pane's menu moves or closes it through the same view
 * affordances an assistant uses.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { MoreHorizontal, X } from "lucide-react";
import { useAffordance } from "@workspace/v2-affordances/react";
import { PANES, PANE_IDS, columns, isPaneId, paneTitle, readingOrder, shownPanes, type GamePhase, type OpenPane } from "@workspace/v2-client";
import type { Place } from "@workspace/v2-affordances";
import { ErrorBoundary, type ErrorFallbackProps } from "@/components/error-boundary";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useView } from "@/core/affordance-runtime";
import { useWide } from "@/core/use-wide";
import { onReveal, usePaneOps } from "./open-pane";

export type PaneComponents = Partial<Record<string, () => ReactNode>>;

function PaneError({ error, resetError }: ErrorFallbackProps) {
  return (
    <div className="p-4 text-sm space-y-2" data-testid="pane-error" role="alert">
      <p className="text-destructive">This pane could not load: {error instanceof Error ? error.message : String(error)}</p>
      <button type="button" className="underline underline-offset-4" onClick={resetError}>Try again</button>
    </div>
  );
}

const PLACES: { place: Place; label: string }[] = [
  { place: "main", label: "Move to the middle" }, { place: "left", label: "Move to the left" },
  { place: "right", label: "Move to the right" }, { place: "bottom", label: "Move to the bottom" },
];

function PaneMenu({ pane, phase, open }: { pane: string; phase: GamePhase; open: OpenPane[] }) {
  const move = useAffordance("view.movePane");
  const close = useAffordance("view.closePane");
  const ops = usePaneOps(phase);
  const others = PANE_IDS.filter(id => !open.some(p => p.pane === id) && PANES[id].phases.includes(phase) && id !== "object");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="p-1 text-muted-foreground hover:text-foreground" aria-label={`Options for ${paneTitle(pane)}`} data-testid={`button-pane-menu-${pane}`}><MoreHorizontal className="h-4 w-4" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        {PLACES.map(p => <DropdownMenuItem key={p.place} disabled={!move.available} onSelect={() => void ops.open(pane, p.place)}>{p.label}</DropdownMenuItem>)}
        <DropdownMenuItem disabled={!close.available} onSelect={() => void ops.close(pane)} data-testid={`button-close-pane-${pane}`}>Close</DropdownMenuItem>
        {others.length > 0 && <><DropdownMenuSeparator /><DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Open another pane</DropdownMenuLabel></>}
        {others.map(id => <DropdownMenuItem key={id} onSelect={() => void ops.open(id)} data-testid={`button-open-pane-${id}`}>{PANES[id].title}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PaneFrame({ pane, phase, open, body, grow }: { pane: string; phase: GamePhase; open: OpenPane[]; body: ReactNode; grow?: boolean }) {
  const def = isPaneId(pane) ? PANES[pane] : null;
  const close = useAffordance("view.closePane");
  const ops = usePaneOps(phase);
  return (
    <section data-pane={pane} data-testid={`pane-${pane}`} aria-label={def?.title ?? pane}
      className={`flex min-h-0 flex-col border border-[hsl(var(--card-border))] bg-card ${grow ? "flex-1" : ""}`}>
      <header className="flex items-center gap-2 border-b border-[hsl(var(--card-border))] px-3 py-1.5">
        <h2 className="flex-1 truncate text-sm font-semibold" title={def?.blurb}>{def?.title ?? pane}</h2>
        <PaneMenu pane={pane} phase={phase} open={open} />
        {pane === "object" && close.available && <button type="button" aria-label="Close" className="p-1 text-muted-foreground hover:text-foreground" onClick={() => void ops.close(pane)}><X className="h-4 w-4" /></button>}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <ErrorBoundary FallbackComponent={PaneError} resetKey={pane}>{body}</ErrorBoundary>
      </div>
    </section>
  );
}

export function Dock({ phase, panes: components }: { phase: GamePhase; panes: PaneComponents }) {
  const view = useView();
  const wide = useWide();
  const open = shownPanes(view, phase);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => onReveal(pane => {
    const el = scroller.current?.querySelector<HTMLElement>(`section[data-pane="${pane}"]`);
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
  }), []);
  const body = (pane: string) => {
    const C = components[pane];
    return C ? <C /> : <p className="p-4 text-sm text-muted-foreground">This pane is not on this version of the game yet.</p>;
  };
  const frame = (pane: string, grow?: boolean) => <PaneFrame key={pane} pane={pane} phase={phase} open={open} body={body(pane)} grow={grow} />;
  if (!wide) {
    return (
      <div ref={scroller} className="h-full overflow-y-auto overflow-x-hidden" data-testid="dock-stacked">
        <div className="space-y-2 p-2">{readingOrder(open).map(p => <div key={p} className="max-h-[85dvh] min-h-[200px] flex">{frame(p, true)}</div>)}</div>
      </div>
    );
  }
  const c = columns(open);
  const col = (panes: string[], cls: string) => panes.length > 0 && <div className={`flex min-h-0 flex-col gap-2 ${cls}`}>{panes.map(p => frame(p, true))}</div>;
  return (
    <div ref={scroller} className="flex h-full min-h-0 flex-col gap-2 p-2" data-testid="dock-desktop">
      <div className="flex min-h-0 flex-[3] gap-2">
        {col(c.left, "w-[26%] min-w-[260px]")}
        {col(c.main, "min-w-0 flex-1")}
        {col(c.right, "w-[30%] min-w-[280px]")}
      </div>
      {c.bottom.length > 0 && <div className="flex min-h-[180px] flex-[2] gap-2">{c.bottom.map(p => <div key={p} className="flex min-w-0 flex-1">{frame(p, true)}</div>)}</div>}
    </div>
  );
}
