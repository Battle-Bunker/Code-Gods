/**
 * Pane headers (docs/research/ui-redesign/player-client.md §1.5), 32 px, one per pane; in the desktop dock each is
 * dockview's tab, so the header is the drag handle. A built-in panel: `[Panel title ▾]`, the read-only parameter
 * caption ("set by your assistant" when it was), ‹ and ↺ only after an assistant change, ⋯, and ✕ when two or more
 * built-in panels are open. The assistant pane: its name and a status word, no buttons. A stored or file panel: its
 * title and version.
 */
import type { ReactNode } from "react";
import { ChevronDown, Maximize2, MoreHorizontal, RotateCcw, Undo2, X } from "lucide-react";
import { PANELS, PANEL_IDS, type PanelId } from "@workspace/player-client/panels";
import { panelPanesOf, paneCaption, type Pane } from "@workspace/player-client/layout";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useComposer } from "@/core/chat/composer";
import { useDockActions } from "./actions";
import { canUndo, lastParams } from "./history";
import { addPanelLabel, isTabbed } from "./operations";
import { entryFor, panelTitle, sandboxed, useSandboxed, usePanels } from "./panels";
import { useDock, useDockStore } from "./store";

const ICON = "inline-flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground";

function IconButton({ label, onClick, children, testId }: { label: string; onClick: () => void; children: ReactNode; testId?: string }) {
  return <button type="button" className={ICON} aria-label={label} title={label} data-testid={testId} onClick={onClick} onPointerDown={e => e.stopPropagation()}>{children}</button>;
}

/** The header of any pane, by kind. `desktop`: inside dockview (maximise exists there). */
export function PaneHeader({ paneId, desktop }: { paneId: string; desktop: boolean }) {
  const { layout } = useDock();
  const store = useDockStore();
  const pane = layout.panes[paneId];
  if (!pane) return null;
  const focus = () => store.setFocused(paneId);
  // On a phone tabs become stacked panes, each with its full header.
  const tabbed = desktop && isTabbed(layout, paneId);
  return (
    <div data-testid={`tab-${paneId}`} onPointerDownCapture={focus} onFocusCapture={focus}
      className={`cg-pane-header flex h-8 w-full min-w-0 items-center gap-1 px-2 ${tabbed ? "max-w-72" : ""}`}>
      {pane.kind === "panel" ? <BuiltInPanelHeader pane={pane} desktop={desktop} tabbed={tabbed} />
        : pane.kind === "assistant" ? <AssistantHeader />
        : <OwnPanelHeader pane={pane} desktop={desktop} />}
    </div>
  );
}

function AssistantHeader() {
  const { status } = useComposer();
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="truncate font-serif text-sm font-semibold">Your assistant <span className="font-sans text-xs font-normal text-muted-foreground">(private)</span></span>
      {status && <span className={`text-xs text-muted-foreground ${status === "thinking…" ? "beat" : ""}`} data-testid="text-assistant-status">{status}</span>}
    </span>
  );
}

function BuiltInPanelHeader({ pane, desktop, tabbed }: { pane: Extract<Pane, { kind: "panel" }>; desktop: boolean; tabbed: boolean }) {
  const { layout, history } = useDock();
  const store = useDockStore();
  const actions = useDockActions();
  const { status } = useComposer();
  const builtIns = panelPanesOf(layout).length;
  const caption = paneCaption(pane);
  const byAssistant = pane.setBy === "assistant";
  return (
    <>
      <PanelMenu pane={pane} tabbed={tabbed} />
      {!tabbed && (
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={`${caption}${byAssistant ? " · set by your assistant" : ""}`} data-testid={`text-caption-${pane.id}`}>
          {caption}{byAssistant ? " · set by your assistant" : ""}
        </span>
      )}
      {byAssistant && canUndo(history, pane) && <IconButton label="Back to the previous view" onClick={() => store.undo(pane.id)}><Undo2 size={13} /></IconButton>}
      {byAssistant && <IconButton label="Reset this panel to its defaults" onClick={() => store.reset(pane.id)}><RotateCcw size={13} /></IconButton>}
      <DropdownMenu>
        <DropdownMenuTrigger className={ICON} aria-label="Pane menu" data-testid={`menu-pane-${pane.id}`} onPointerDown={e => e.stopPropagation()}><MoreHorizontal size={14} /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="rounded-none">
          {desktop && <DropdownMenuItem onSelect={() => actions.maximise(pane.id)}>Maximise or restore</DropdownMenuItem>}
          <DropdownMenuItem data-testid="button-add-pane" onSelect={() => actions.addNextTo(pane.id)}>{addPanelLabel(layout)}</DropdownMenuItem>
          {status !== "off" && <DropdownMenuItem onSelect={() => actions.askAbout(PANELS[pane.panelId].title)}>Ask about this view</DropdownMenuItem>}
          {builtIns > 1 && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => actions.close(pane.id)}>Close</DropdownMenuItem></>}
        </DropdownMenuContent>
      </DropdownMenu>
      {builtIns > 1 && <IconButton label="Close this pane" onClick={() => actions.close(pane.id)} testId={`button-close-${pane.id}`}><X size={13} /></IconButton>}
    </>
  );
}

/** The panel menu: built-in panels for this phase first, then the others, then the player's own panels. It changes the built-in panel only. */
function PanelMenu({ pane, tabbed }: { pane: Extract<Pane, { kind: "panel" }>; tabbed: boolean }) {
  const { phase, history } = useDock();
  const actions = useDockActions();
  const panels = usePanels();
  const now = PANEL_IDS.filter(id => PANELS[id].phases.includes(phase));
  const later = PANEL_IDS.filter(id => !PANELS[id].phases.includes(phase));
  const item = (id: PanelId) => {
    const remembered = lastParams(history, pane.id, id);
    const needsAssistant = id === "what-if" && !remembered;
    return (
      <DropdownMenuItem key={id} data-testid={`menu-panel-item-${id}`} disabled={needsAssistant} title={needsAssistant ? "Your assistant sets up a what-if: ask it" : PANELS[id].blurb}
        onSelect={() => actions.change(pane.id, id)} className={id === pane.panelId ? "font-semibold" : ""}>
        {PANELS[id].title}{needsAssistant ? " (ask your assistant)" : ""}
      </DropdownMenuItem>
    );
  };
  const stored = panels.entries.filter(e => e.origin === "stored");
  const files = panels.entries.filter(e => e.origin === "file");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger data-testid="menu-panel" title="Change this panel" onPointerDown={e => e.stopPropagation()}
        className={`inline-flex ${tabbed ? "" : "max-w-[60%]"} min-w-0 shrink-0 items-center gap-1 px-1 font-serif text-sm font-semibold hover:bg-muted`}>
        <span className="truncate">{PANELS[pane.panelId].title}</span><ChevronDown size={13} className="shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[70vh] overflow-auto rounded-none">
        <DropdownMenuLabel className="label">For now</DropdownMenuLabel>
        {now.map(item)}
        {later.length > 0 && <><DropdownMenuSeparator /><DropdownMenuLabel className="label">Other panels</DropdownMenuLabel>{later.map(item)}</>}
        {stored.length + files.length > 0 && <>
          <DropdownMenuSeparator /><DropdownMenuLabel className="label">Your panels</DropdownMenuLabel>
          {stored.map(e => <DropdownMenuItem key={e.file} data-testid={`menu-stored-panel-${e.id}`} title="Opens in its own pane" onSelect={() => actions.openPanel(e.id)}>{e.stored?.title ?? e.id}</DropdownMenuItem>)}
          {files.map(e => <DropdownMenuItem key={e.file} data-testid={`menu-file-panel-${e.id}`} title="Opens in its own pane" onSelect={() => actions.openFile(e.id)}>{panelTitle(e, panels.statuses, e.id)}</DropdownMenuItem>)}
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OwnPanelHeader({ pane, desktop }: { pane: Extract<Pane, { kind: "stored-panel" | "file-panel" }>; desktop: boolean }) {
  const panels = usePanels();
  const actions = useDockActions();
  const isSandboxed = useSandboxed();
  const ref = pane.kind === "stored-panel" ? pane.slug : pane.fileId;
  const entry = entryFor(panels, pane.kind, ref);
  const title = panelTitle(entry, panels.statuses, ref);
  const where = entry?.origin === "stored" ? `stored panel ${entry.id} v${entry.version}` : entry ? `src/panels/${entry.file}` : ref;
  return (
    <>
      <span className="min-w-0 truncate font-serif text-sm font-semibold" title={where}>{title}</span>
      {entry?.origin === "stored" && (
        <span data-testid={`badge-stored-${entry.id}`} className="shrink-0 text-[11px] text-muted-foreground" title={entry.stored?.author ? `by ${entry.stored.author.label} (${entry.stored.author.kind})` : undefined}>stored v{entry.version}</span>
      )}
      {entry?.shadows !== undefined && <span data-testid={`badge-shadows-${entry.id}`} className="shrink-0 text-[11px] text-muted-foreground">shadows stored v{entry.shadows}</span>}
      <span className="flex-1" />
      {import.meta.env.DEV && entry?.origin === "file" && (
        <button type="button" data-testid={`button-sandbox-${entry.id}`} className="shrink-0 text-[11px] text-muted-foreground underline" onPointerDown={e => e.stopPropagation()}
          title={isSandboxed.has(entry.id) ? "Run in-process (HMR)" : "Run sandboxed, as a stored panel would"} onClick={() => sandboxed.toggle(entry.id)}>
          {isSandboxed.has(entry.id) ? "in-process" : "sandbox"}
        </button>
      )}
      {desktop && <IconButton label="Maximise or restore" onClick={() => actions.maximise(pane.id)}><Maximize2 size={13} /></IconButton>}
      <IconButton label="Close this pane" onClick={() => actions.close(pane.id)} testId={`button-close-${pane.id}`}><X size={13} /></IconButton>
    </>
  );
}
