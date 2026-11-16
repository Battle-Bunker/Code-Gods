/**
 * What both docks draw around a pane: its name, its menu (move, close, open another: the same view affordances an
 * assistant uses), its error boundary (ux-lessons 4.1: a failed pane takes down only itself) and its scrolling body.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { FunctionReference } from "convex/server";
import { MoreHorizontal, X } from "lucide-react";
import { useAffordance } from "@workspace/v2-affordances/react";
import { PANES, PANE_IDS, isPaneId, paneTitle, storedSlugOf, type GamePhase, type OpenPane } from "@workspace/v2-client";
import type { Place, ViewState } from "@workspace/v2-affordances";
import { ErrorBoundary, type ErrorFallbackProps } from "@/components/error-boundary";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, useLive } from "@/site/lib/convex";
import { objectWord, useGame } from "@/sdk";
import { useRuntime } from "@/core/affordance-runtime";
import { usePaneOps } from "./open-pane";
import { liveSourceOf, paneErrorWords } from "./pane-error";

export type PaneComponents = Partial<Record<string, () => ReactNode>>;
/** A stored panel's pane (`panel:<slug>`). */
export type StoredPaneComponent = (props: { slug: string }) => ReactNode;

/**
 * What every pane of the dock needs: the phase, the view state the dock draws (without the panes this room cannot
 * show: the assistant in a room without AI), the panes shown, and how to draw a pane's body.
 */
export interface DockScope { phase: GamePhase; view: ViewState; open: OpenPane[]; body(pane: string): ReactNode }
export const DockScopeContext = createContext<DockScope | null>(null);
export function useDockScope(): DockScope {
  const scope = useContext(DockScopeContext);
  if (!scope) throw new Error("A pane is drawn outside the dock.");
  return scope;
}

/**
 * Pane names: a pane's definition's title, or a stored panel's own title from the viewer's panel list (one shared
 * subscription; a failed read shows the slug, never the dock's error).
 */
export function usePaneName(): (pane: string) => string {
  const panels = useLive(api.v2.panels.list, {}).data;
  // The objects' panes say what this game's objects are ("Grids", "One grid").
  const word = objectWord(useGame()?.variant);
  return useCallback((pane: string) => {
    const slug = storedSlugOf(pane);
    if (slug) return panels?.find(p => p.slug === slug)?.title ?? slug;
    if (pane === "objects") return word.Many;
    if (pane === "object") return `One ${word.one}`;
    return paneTitle(pane);
  }, [panels, word]);
}
/**
 * Keeps the failed read's own subscription open while the pane shows its error, and shows the pane again on that
 * read's next answer (round 24: panes stayed broken until a reload). One live subscription, no retry or timer.
 */
function WatchBack({ query, args, onBack }: { query: unknown; args: unknown; onBack: () => void }) {
  const r = useLive(query as FunctionReference<"query">, args as never);
  useEffect(() => { if (r.data !== undefined && !r.error) onBack(); }, [r.data, r.error]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function PaneError({ error, resetError }: ErrorFallbackProps) {
  const w = paneErrorWords(error);
  const source = liveSourceOf(error);
  // Try again on a failed read (W3, round 24: an errored result stays in its subscription until it is dropped): drop
  // that one subscription (WatchBack leaves), then show the pane on the next frame, which subscribes afresh. One
  // press, one new read; never a loop, and the page is not reloaded.
  const [again, setAgain] = useState(false);
  useEffect(() => {
    if (!again) return;
    const frame = requestAnimationFrame(() => resetError());
    return () => cancelAnimationFrame(frame);
  }, [again]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="p-4 text-sm space-y-2" data-testid="pane-error" role="alert">
      {source && !again && <WatchBack query={source.query} args={source.args} onBack={resetError} />}
      <p className="text-destructive">{w.text}</p>
      <button type="button" className="underline underline-offset-4" data-testid="button-pane-retry" onClick={() => (w.reload ? window.location.reload() : source ? setAgain(true) : resetError())}>
        {w.reload ? "Try again (reloads the page)" : "Try again"}
      </button>
    </div>
  );
}

const PLACES: { place: Place; label: string }[] = [
  { place: "main", label: "Move to the middle" }, { place: "left", label: "Move to the left" },
  { place: "right", label: "Move to the right" }, { place: "bottom", label: "Move to the bottom" },
];
/** The desktop dock's maximise (v1's "Maximise"): this viewer's screen only, never stored; the phone has none. */
export interface Maximise { isMaximised(pane: string): boolean; toggle(pane: string): void }
export const MaximiseContext = createContext<Maximise | null>(null);

/** Buttons inside a dock tab: a press is theirs, not the start of dragging the tab. */
const own = (e: React.PointerEvent) => e.stopPropagation();

export function PaneMenu({ pane }: { pane: string }) {
  const { phase, open } = useDockScope();
  const move = useAffordance("view.movePane");
  const close = useAffordance("view.closePane");
  const ops = usePaneOps(phase);
  const name = usePaneName();
  const aiOff = !!useRuntime().context.room?.aiOff;
  const maximise = useContext(MaximiseContext);
  const others = PANE_IDS.filter(id => !open.some(p => p.pane === id) && PANES[id].phases.includes(phase) && id !== "object" && !(aiOff && id === "assistant"));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="p-1 text-muted-foreground hover:text-foreground" aria-label={`Options for ${name(pane)}`} data-testid={`button-pane-menu-${pane}`} onPointerDown={own}><MoreHorizontal className="h-4 w-4" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        {PLACES.map(p => <DropdownMenuItem key={p.place} disabled={!move.available} onSelect={() => void ops.open(pane, p.place)}>{p.label}</DropdownMenuItem>)}
        {maximise && <DropdownMenuItem onSelect={() => maximise.toggle(pane)} data-testid={`button-maximise-pane-${pane}`}>{maximise.isMaximised(pane) ? "Restore the other panes" : "Maximise"}</DropdownMenuItem>}
        <DropdownMenuItem disabled={!close.available} onSelect={() => void ops.close(pane)} data-testid={`button-close-pane-${pane}`}>Close</DropdownMenuItem>
        {others.length > 0 && <><DropdownMenuSeparator /><DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Open another pane</DropdownMenuLabel></>}
        {others.map(id => <DropdownMenuItem key={id} onSelect={() => void ops.open(id)} data-testid={`button-open-pane-${id}`}>{name(id)}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A pane's header: its name, its menu, and (the one line) a close button. */
export function PaneHeader({ pane, className = "" }: { pane: string; className?: string }) {
  const { phase } = useDockScope();
  const def = isPaneId(pane) ? PANES[pane] : null;
  const close = useAffordance("view.closePane");
  const ops = usePaneOps(phase);
  const name = usePaneName();
  return (
    <header className={`flex items-center gap-2 px-3 py-1.5 ${className}`}>
      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold" title={def?.blurb}>{name(pane)}</h2>
      <PaneMenu pane={pane} />
      {pane === "object" && close.available && <button type="button" aria-label="Close" className="p-1 text-muted-foreground hover:text-foreground" onPointerDown={own} onClick={() => void ops.close(pane)}><X className="h-4 w-4" /></button>}
    </header>
  );
}

/** A pane's body: it scrolls inside the pane, and a failure stays in it. */
export function PaneBody({ pane }: { pane: string }) {
  const { body } = useDockScope();
  return (
    <div className="min-h-0 flex-1 overflow-auto" data-pane-body>
      <ErrorBoundary FallbackComponent={PaneError} resetKey={pane}>{body(pane)}</ErrorBoundary>
    </div>
  );
}
