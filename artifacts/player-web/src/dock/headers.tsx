/**
 * Pane headers (docs/research/ui-redesign/player-client.md §1.5), 32 px, one per pane; in the desktop dock each is
 * dockview's tab, so the header is the drag handle. A built-in panel: `[Panel title ▾] (a combobox: type to filter)`, the read-only parameter
 * caption ("set by your assistant" when it was), ‹ and ↺ only after an assistant change, ⋯, and ✕ when two or more
 * built-in panels are open. The assistant pane: its name, a status word and ✕ (it is an ordinary pane the player may close). A stored or file panel: its
 * title and version.
 */
import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Maximize2, MoreHorizontal, RotateCcw, Undo2, X } from "lucide-react";
import { PANELS, PANEL_IDS, type PanelId } from "@workspace/player-client/panels";
import { assistantPaneOf, panelPanesOf, paneCaption, type Pane } from "@workspace/player-client/layout";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useComposer } from "@/core/chat/composer";
import { useDockActions } from "./actions";
import { canUndo, lastParams } from "./history";
import { addPanelLabel } from "./operations";
import { PANEL_SYNONYMS, filterChoices, type PickerChoice } from "./panel-search";
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
  return (
    <div data-testid={`tab-${paneId}`} onPointerDownCapture={focus} onFocusCapture={focus}
      className="cg-pane-header flex h-8 w-full min-w-0 items-center gap-1 px-2">
      {pane.kind === "panel" ? <BuiltInPanelHeader pane={pane} desktop={desktop} />
        : pane.kind === "assistant" ? <AssistantHeader paneId={paneId} />
        : <OwnPanelHeader pane={pane} desktop={desktop} />}
    </div>
  );
}

function AssistantHeader({ paneId }: { paneId: string }) {
  const { status } = useComposer();
  const actions = useDockActions();
  return (
    <>
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="truncate font-serif text-sm font-semibold">Your assistant <span className="font-sans text-xs font-normal text-muted-foreground">(private)</span></span>
        {status && <span className={`text-xs text-muted-foreground ${status === "thinking…" ? "beat" : ""}`} data-testid="text-assistant-status">{status}</span>}
      </span>
      <IconButton label="Close the assistant (reopen it from the panel menu or the palette)" onClick={() => actions.close(paneId)} testId={`button-close-${paneId}`}><X size={13} /></IconButton>
    </>
  );
}

function BuiltInPanelHeader({ pane, desktop }: { pane: Extract<Pane, { kind: "panel" }>; desktop: boolean }) {
  const { layout, history } = useDock();
  const store = useDockStore();
  const actions = useDockActions();
  const { status } = useComposer();
  const builtIns = panelPanesOf(layout).length;
  const caption = paneCaption(pane);
  const byAssistant = pane.setBy === "assistant";
  return (
    <>
      <PanelMenu pane={pane} />
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={`${caption}${byAssistant ? " · set by your assistant" : ""}`} data-testid={`text-caption-${pane.id}`}>
        {caption}{byAssistant ? " · set by your assistant" : ""}
      </span>
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

/**
 * The panel picker: a combobox (cmdk: ARIA combobox and listbox, arrows, Enter, Esc). The input takes focus on open;
 * typing filters fuzzily over names and synonyms (panel-search.ts, the palette's matcher), keeping the sections: built-in
 * panels for this phase first, then the others, then the player's own panels and the assistant. Choosing a built-in panel
 * changes this pane's panel; the player's own panels and the assistant open in their own pane.
 */
function PanelMenu({ pane }: { pane: Extract<Pane, { kind: "panel" }> }) {
  const { phase, history, layout, assistantAvailable } = useDock();
  const actions = useDockActions();
  const panels = usePanels();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const assistantOpen = !!assistantPaneOf(layout);
  const choices = useMemo(() => {
    const built: PickerChoice[] = PANEL_IDS.map(id => ({
      key: id, title: PANELS[id].title, section: PANELS[id].phases.includes(phase) ? "now" : "later", keywords: PANEL_SYNONYMS[id],
      disabled: id === "what-if" && !lastParams(history, pane.id, id), detail: PANELS[id].blurb,
    }));
    const own: PickerChoice[] = [
      ...(assistantAvailable ? [{ key: "assistant", title: assistantOpen ? "Your assistant" : "Your assistant (closed)", section: "mine" as const, keywords: ["chat", "ask", "ai"], detail: assistantOpen ? "Your assistant is open" : "Opens in its own pane" }] : []),
      ...panels.entries.filter(e => e.origin === "stored").map(e => ({ key: `stored:${e.id}`, title: e.stored?.title ?? e.id, section: "mine" as const, detail: "Opens in its own pane" })),
      ...panels.entries.filter(e => e.origin === "file").map(e => ({ key: `file:${e.id}`, title: panelTitle(e, panels.statuses, e.id), section: "mine" as const, detail: "Opens in its own pane" })),
    ];
    return [...built, ...own];
  }, [phase, history, pane.id, panels.entries, panels.statuses, assistantOpen, assistantAvailable]);
  const groups = useMemo(() => filterChoices(choices, query), [choices, query]);
  const testId = (key: string) => key === "assistant" ? "menu-assistant" : key.startsWith("stored:") ? `menu-stored-panel-${key.slice(7)}` : key.startsWith("file:") ? `menu-file-panel-${key.slice(5)}` : `menu-panel-item-${key}`;
  const choose = (key: string) => {
    setOpen(false);
    if (key === "assistant") actions.openAssistant();
    else if (key.startsWith("stored:")) actions.openPanel(key.slice(7));
    else if (key.startsWith("file:")) actions.openFile(key.slice(5));
    else actions.change(pane.id, key as PanelId);
  };
  return (
    <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setQuery(""); }}>
      <PopoverTrigger data-testid="menu-panel" title="Change this panel" aria-haspopup="listbox" onPointerDown={e => e.stopPropagation()}
        className="inline-flex max-w-[60%] min-w-0 shrink-0 items-center gap-1 px-1 font-serif text-sm font-semibold hover:bg-muted">
        <span className="truncate">{PANELS[pane.panelId].title}</span><ChevronDown size={13} className="shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 rounded-none p-0">
        <Command shouldFilter={false} loop label="Choose a panel">
          <CommandInput data-testid="input-panel-search" autoFocus value={query} onValueChange={setQuery} placeholder="Type a panel name…" aria-label="Panel name" />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>No panel matches “{query}”.</CommandEmpty>
            {groups.map(({ section, choices: rows }) => (
              <CommandGroup key={section.id} heading={section.title} className="[&_[cmdk-group-heading]]:label">
                {rows.map(c => (
                  <CommandItem key={c.key} value={c.key} data-testid={testId(c.key)} disabled={c.disabled} title={c.disabled ? "Your assistant sets up a what-if: ask it" : c.detail}
                    onSelect={() => choose(c.key)} className={`rounded-none ${c.key === pane.panelId ? "font-semibold" : ""}`}>
                    {c.title}{c.disabled ? " (ask your assistant)" : ""}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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
