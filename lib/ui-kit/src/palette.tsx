/**
 * The command palette (docs/research/ui-redesign/palette-and-pages.md §2) on cmdk and the Radix dialog, styled only
 * with the apps' HSL tokens (bg-popover, border, muted, primary…). Ranking, confirmation levels, recency and keys are
 * the pure modules beside it (search.ts, confirm.ts, recency.ts, keys.ts); this file renders them:
 * - a context chip, sections, a detail line with the selected command's tooltip (or why it is unavailable);
 * - nested pages for `form` performers (a pick list, one validated field with a consequence line, a short text);
 * - confirmations: inline ("Press ↵ again", 5 s), a summary page, or a modal alert dialog (focus on Cancel);
 * - Esc and Backspace (empty search) go back one page, then close; focus returns where it was;
 * - global keys: Cmd/Ctrl+K anywhere, "/" and "?" only outside text fields and dialogs.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import { Command as Cmdk } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import * as Alert from "@radix-ui/react-alert-dialog";
import { inlineStep, INLINE_TIMEOUT_MS, type Armed } from "./confirm.ts";
import { isEditable, paletteKey, shortcutLabel } from "./keys.ts";
import { browserStorage, readRecent, recordRecent } from "./recency.ts";
import { matchScore, paletteRows, SECTION_TITLES, type PaletteRow } from "./search.ts";
import type { Availability, Command, HandoffDraft, PaletteContext, PaletteFormPage, PaletteSection, PickOption } from "./types.ts";

/** How the palette opens: with a query, on the Help page ("help"), in browse form ("browse"), or on one command's page (its id). */
export type PaletteOpenInit = { query?: string; page?: string };

export interface CommandPaletteProps {
  commands: readonly Command[];
  context: PaletteContext;
  open: boolean;
  onOpenChange(open: boolean): void;
  placeholder: string;
  /** Command ids for the Suggested group: the page's next step first. */
  suggested?: readonly string[];
  /** localStorage key for this viewer's recent commands (absent: no recency). */
  recentKey?: string;
  /** Where to start when it opens (the trigger's ☰ passes {page: "browse"}). */
  init?: PaletteOpenInit;
  /** The context chip ("Room K7QX · you: owner"); derived from the role when absent. */
  chip?: string;
  /** Rows made from the query itself, e.g. "Open room K7QX" for a code-shaped query. */
  dynamic?: (query: string, ctx: PaletteContext) => readonly Command[];
  /** Pre-fills the assistant composer (never sends). Without it, hand-off commands and "Ask the assistant" are unavailable. */
  handoff?: (draft: HandoffDraft) => void;
  /** A command that ran and failed (the palette has closed): the app shows it, e.g. as a toast. */
  onError?: (error: unknown, command: Command) => void;
  /** In-app navigation for `navigate` performers (default: location.assign). */
  onNavigate?: (to: string) => void;
  /** Cmd/Ctrl+K, "/" and "?" (default on; turn off when the app registers them itself). */
  hotkeys?: boolean;
}

type Page =
  | { kind: "root"; only?: PaletteSection; browse?: boolean }
  | { kind: "form"; command: Command; page: PaletteFormPage }
  | { kind: "summary"; command: Command };

const ROLE_WORDS: Record<PaletteContext["role"], string> = { visitor: "visitor", "signed-in": "signed in", member: "member", seated: "player", owner: "owner" };
const isPage = (x: unknown): x is PaletteFormPage =>
  !!x && typeof x === "object" && "kind" in x && "title" in x && ["pick", "field", "info"].includes(String((x as { kind: unknown }).kind));
const dialogOpen = () => typeof document !== "undefined" && !!document.querySelector('[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"]');

/**
 * Cmd/Ctrl+K toggles; "/" opens; "?" opens Help. `setOpen` receives the init for "?" ({page: "help"}).
 * Registered in the capture phase so an editor that stops propagation cannot swallow Cmd+K.
 */
export function usePaletteHotkeys(open: boolean, setOpen: (open: boolean, init?: PaletteOpenInit) => void, enabled = true) {
  const state = useRef({ open, setOpen });
  state.current = { open, setOpen };
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const action = paletteKey(e, { editable: isEditable(document.activeElement as HTMLElement | null), dialogOpen: !state.current.open && dialogOpen(), paletteOpen: state.current.open });
      if (!action) return;
      e.preventDefault();
      if (action === "toggle") state.current.setOpen(!state.current.open);
      else state.current.setOpen(true, action === "help" ? { page: "help" } : undefined);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled]);
}

const SearchIcon = () => (
  <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 opacity-60"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
const MenuIcon = () => (
  <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
);

/**
 * The palette's trigger: a labelled, field-sized control with the shortcut printed on it, plus ☰ (browse every
 * command). Below 640 px (or with `compact`) it is one 44 px control: the icons and the word "Menu".
 */
export function PaletteTrigger({ placeholder, onOpen, compact }: { placeholder: string; onOpen(init?: PaletteOpenInit): void; compact?: boolean }): JSX.Element {
  const [shortcut, setShortcut] = useState("Ctrl K");
  useEffect(() => setShortcut(shortcutLabel()), []);
  const wide = compact ? "hidden" : "hidden sm:flex";
  return (
    <div className="flex items-stretch" data-testid="palette-trigger">
      <button type="button" data-testid="button-palette" onClick={() => onOpen()} aria-label={`${placeholder} (${shortcut})`} aria-keyshortcuts="Meta+K Control+K"
        className="inline-flex items-center gap-2 border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className={`${wide} items-center gap-2 h-9 w-[17rem] lg:w-[20rem] px-2.5 text-sm`}>
          <SearchIcon /><span className="flex-1 text-left truncate">{placeholder}</span>
          <kbd className="font-mono text-[10px] border border-border px-1.5 py-0.5 text-muted-foreground">{shortcut}</kbd>
        </span>
        <span className={`${compact ? "inline-flex" : "inline-flex sm:hidden"} items-center gap-1.5 h-11 px-3 text-sm text-foreground`}>
          <SearchIcon /><MenuIcon /><span>Menu</span>
        </span>
      </button>
      <button type="button" data-testid="button-palette-menu" onClick={() => onOpen({ page: "browse" })} aria-label="Menu: every command"
        className={`${wide} items-center justify-center h-9 w-9 border border-l-0 border-border bg-background hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
        <MenuIcon />
      </button>
    </div>
  );
}

/** The command palette. Rendered once per app (in its header); pages contribute commands through the app. */
export function CommandPalette(props: CommandPaletteProps): JSX.Element {
  const { commands, context, open, onOpenChange, placeholder, suggested, recentKey, init, dynamic, handoff, onError, onNavigate, hotkeys = true } = props;
  const [query, setQuery] = useState("");
  const [stack, setStack] = useState<Page[]>([{ kind: "root" }]);
  const [selected, setSelected] = useState("");
  const [armed, setArmed] = useState<Armed>(null);
  const [modal, setModal] = useState<Command | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const pendingInit = useRef<PaletteOpenInit | undefined>(undefined);
  const prevFocus = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const page = stack[stack.length - 1];

  usePaletteHotkeys(open, (next, i) => { pendingInit.current = i; onOpenChange(next); }, hotkeys);

  // Opening: remember focus, load recency, start on the requested page.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      prevFocus.current = (typeof document !== "undefined" ? document.activeElement : null) as HTMLElement | null;
      setRecent(recentKey ? readRecent(browserStorage(), recentKey) : []);
      const start = init ?? pendingInit.current;
      pendingInit.current = undefined;
      setQuery(start?.query ?? ""); setArmed(null); setPageError(null); setBusy(false); setSelected("");
      const target = start?.page && !["help", "browse"].includes(start.page) ? commands.find(c => c.id === start.page) : undefined;
      const root: Page = { kind: "root", only: start?.page === "help" ? "help" : undefined, browse: start?.page === "browse" };
      setStack(target?.performer.kind === "form" ? [root, { kind: "form", command: target, page: target.performer.page }] : [root]);
    }
    wasOpen.current = open;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // An inline confirmation times out after 5 s.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), INLINE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [armed]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const remember = (command: Command) => { if (recentKey && !command.id.startsWith("dyn:")) setRecent(recordRecent(browserStorage(), recentKey, command.id)); };
  const push = (p: Page) => { setStack(s => [...s, p]); setQuery(""); setSelected(""); setArmed(null); setPageError(null); };
  const back = () => { setStack(s => (s.length > 1 ? s.slice(0, -1) : s)); setQuery(""); setSelected(""); setArmed(null); setPageError(null); };

  const fail = (command: Command, error: unknown) => { onError?.(error, command); };
  const perform = (command: Command) => {
    const p = command.performer;
    remember(command);
    switch (p.kind) {
      case "navigate": { const to = typeof p.to === "function" ? p.to() : p.to; close(); if (onNavigate) onNavigate(to); else location.assign(to); return; }
      case "submit": close(); void p.run().catch(e => fail(command, e)); return;
      case "local": close(); try { p.run(); } catch (e) { fail(command, e); } return;
      case "handoff": close(); handoff?.({ text: p.draft, ...(p.tool ? { tool: p.tool } : {}) }); return;
      case "form": push({ kind: "form", command, page: p.page }); return;
    }
  };
  const byId = useMemo(() => new Map(commands.map(c => [c.id, c])), [commands]);
  const effective = (command: Command): Availability => {
    const a = command.available(context);
    if (a.ok && command.performer.kind === "handoff" && (!handoff || !context.assistantOn)) return { ok: false, reason: "Your assistant is off in this room." };
    return a;
  };
  const execute = (command: Command) => {
    const a = effective(command);
    if (!a.ok) {
      const fix = a.fix ? byId.get(a.fix) : undefined;
      if (fix && effective(fix).ok) execute(fix);
      return;
    }
    const level = command.performer.kind === "form" ? "none" : command.confirm ?? "none";
    if (level === "inline") {
      const step = inlineStep(armed, command.id, Date.now());
      setArmed(step.armed);
      if (step.run) perform(command);
      return;
    }
    if (level === "summary" && !(page.kind === "summary" && page.command.id === command.id)) { push({ kind: "summary", command }); return; }
    if (level === "modal") { remember(command); setModal(command); close(); return; }
    perform(command);
  };

  // ----- rows of the root page -----
  const sections = useMemo(() => !open || page.kind !== "root" ? [] : paletteRows(commands, context, {
    query, suggested, recent, browse: page.browse, only: page.only, dynamic,
  }).map(s => ({ ...s, rows: s.rows.map(r => ({ ...r, availability: effective(r.command) })) })), // eslint-disable-line react-hooks/exhaustive-deps
  [open, page, commands, context, query, suggested, recent, dynamic, handoff]);
  const rowById = useMemo(() => new Map(sections.flatMap(s => s.rows).map(r => [r.command.id, r])), [sections]);
  const selectedRow = rowById.get(selected) ?? sections[0]?.rows[0];
  const askRow = page.kind === "root" && query.trim() && !sections.length && handoff && context.assistantOn;

  const onEscape = (e: { preventDefault(): void }) => {
    if (armed) { e.preventDefault(); setArmed(null); return; }
    if (stack.length > 1) { e.preventDefault(); back(); }
  };
  const onInputKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !query && stack.length > 1) { e.preventDefault(); back(); }
  };

  const chip = props.chip ?? `you: ${ROLE_WORDS[context.role]}${context.permission ? ` · this connection: ${context.permission}` : ""}`;
  const title = page.kind === "form" ? page.page.title : page.kind === "summary" ? page.command.human.title : page.only ? "Help" : page.browse ? "Every command" : null;

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[90] bg-foreground/30" />
          <Dialog.Content data-testid="dialog-palette" aria-describedby={undefined}
            onEscapeKeyDown={onEscape}
            onCloseAutoFocus={e => { e.preventDefault(); if (!modal) prevFocus.current?.focus?.(); }}
            onOpenAutoFocus={e => { e.preventDefault(); inputRef.current?.focus(); }}
            className="fixed left-1/2 top-[8vh] z-[91] w-[calc(100vw-1.5rem)] max-w-[640px] -translate-x-1/2 border border-border bg-popover text-popover-foreground shadow-2xl outline-none">
            <Dialog.Title className="sr-only">Command palette</Dialog.Title>
            <Cmdk shouldFilter={false} loop value={selected} onValueChange={setSelected} label="Command palette" className="flex flex-col max-h-[80vh]">
              <div className="flex items-center gap-2 border-b border-border px-3 pt-2 text-xs text-muted-foreground">
                {stack.length > 1 && <button type="button" onClick={back} className="hover:text-foreground" aria-label="Back">←</button>}
                <span className="truncate" data-testid="text-palette-chip">{chip}</span>
                {title && <span className="truncate">› <span className="text-foreground">{title}</span></span>}
              </div>
              {page.kind === "form" && page.page.kind === "field" ? (
                <FieldPage key={page.command.id} page={page.page} inputRef={inputRef} busy={busy} error={pageError}
                  onBack={back} onSubmit={value => {
                    const f = page.page as Extract<PaletteFormPage, { kind: "field" }>;
                    setBusy(true); setPageError(null);
                    Promise.resolve().then(() => f.onSubmit(value)).then(() => { setBusy(false); close(); },
                      e => { setBusy(false); setPageError(e instanceof Error ? e.message : String(e)); fail(page.command, e); });
                  }} />
              ) : (<>
                <div className="flex items-center gap-2 border-b border-border px-3">
                  <SearchIcon />
                  <Cmdk.Input ref={inputRef} value={query} onValueChange={v => { setQuery(v); setArmed(null); }} onKeyDown={onInputKey}
                    placeholder={page.kind === "form" ? `Search ${page.page.title.toLowerCase()}…` : placeholder} aria-label={placeholder}
                    className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" data-testid="input-palette" />
                </div>
                <Cmdk.List className="overflow-y-auto overscroll-contain px-1.5 py-1.5 max-h-[55vh]">
                  {page.kind === "root" && (<>
                    {sections.map(s => (
                      <Cmdk.Group key={s.section} heading={SECTION_TITLES[s.section]}
                        className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
                        {s.rows.map(r => <Row key={r.command.id} row={r} armed={armed?.id === r.command.id} onRun={() => execute(r.command)} />)}
                      </Cmdk.Group>
                    ))}
                    {askRow && (
                      <Cmdk.Item value="ui.ask" onSelect={() => { close(); handoff!({ text: query.trim() }); }} data-testid="row-palette-ask"
                        className="flex items-center gap-2 px-2 py-2 text-sm cursor-pointer data-[selected=true]:bg-muted">
                        Ask the assistant: “{query.trim()}”
                      </Cmdk.Item>
                    )}
                    {!sections.length && !askRow && (
                      <p className="px-3 py-6 text-sm text-muted-foreground" data-testid="text-palette-empty">
                        {query.trim() ? <>Nothing matches “{query.trim()}”. Try “help” or “how to play”.</> : "Nothing to do here yet."}
                      </p>
                    )}
                  </>)}
                  {page.kind === "summary" && (
                    <Cmdk.Item value={`confirm:${page.command.id}`} onSelect={() => perform(page.command)} data-testid="button-palette-confirm"
                      className="block px-3 py-3 text-sm cursor-pointer border border-border data-[selected=true]:bg-muted">
                      <span className="block font-medium">{page.command.human.title}</span>
                      <span className="block text-muted-foreground mt-1">{page.command.summary?.(context) ?? page.command.human.tooltip}</span>
                      <span className="block mt-2 text-xs">Press ↵ to confirm. Esc goes back.</span>
                    </Cmdk.Item>
                  )}
                  {page.kind === "form" && page.page.kind === "pick" && (
                    <PickPage key={page.command.id + page.page.title} page={page.page} query={query} armedId={armed?.id} busy={busy} error={pageError}
                      onPick={opt => {
                        const pick = page.page as Extract<PaletteFormPage, { kind: "pick" }>;
                        if (opt.unavailable) return;
                        if (page.command.confirm === "inline") {
                          const step = inlineStep(armed, `${page.command.id}:${opt.id}`, Date.now());
                          setArmed(step.armed);
                          if (!step.run) return;
                        }
                        setBusy(true); setPageError(null);
                        Promise.resolve().then(() => pick.onPick(opt.id)).then(result => {
                          setBusy(false);
                          if (isPage(result)) push({ kind: "form", command: page.command, page: result }); else close();
                        }, e => { setBusy(false); setPageError(e instanceof Error ? e.message : String(e)); fail(page.command, e); });
                      }} />
                  )}
                  {page.kind === "form" && page.page.kind === "info" && <InfoPage page={page.page} />}
                </Cmdk.List>
              </>)}
              <DetailLine row={page.kind === "root" ? selectedRow : undefined} armed={armed} byId={byId} pageError={page.kind === "root" ? null : pageError} />
            </Cmdk>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Alert.Root open={!!modal} onOpenChange={o => { if (!o) setModal(null); }}>
        <Alert.Portal>
          <Alert.Overlay className="fixed inset-0 z-[92] bg-foreground/40" />
          <Alert.Content data-testid="dialog-palette-confirm" onCloseAutoFocus={e => { e.preventDefault(); prevFocus.current?.focus?.(); }}
            className="fixed left-1/2 top-1/2 z-[93] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 border border-border bg-background p-6 shadow-lg grid gap-4">
            <Alert.Title className="text-lg font-semibold">{modal?.human.title}?</Alert.Title>
            <Alert.Description className="text-sm text-muted-foreground">{modal ? modal.summary?.(context) ?? modal.human.tooltip : ""} This cannot be undone.</Alert.Description>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Alert.Cancel autoFocus className="border border-border px-4 py-2 text-sm hover:bg-muted" data-testid="button-palette-cancel">Cancel</Alert.Cancel>
              <Alert.Action className="bg-destructive text-destructive-foreground px-4 py-2 text-sm" data-testid="button-palette-modal-confirm"
                onClick={() => { const c = modal; setModal(null); if (c) perform(c); }}>{modal?.confirmLabel ?? modal?.human.title}</Alert.Action>
            </div>
          </Alert.Content>
        </Alert.Portal>
      </Alert.Root>
    </>
  );
}

function Row({ row, armed, onRun }: { row: PaletteRow; armed: boolean; onRun: () => void }) {
  const { command, availability, alias } = row;
  return (
    <Cmdk.Item value={command.id} onSelect={onRun} data-unavailable={!availability.ok || undefined} data-testid={`row-palette-${command.id}`}
      className={`flex items-center gap-3 px-2 py-2 text-sm cursor-pointer data-[selected=true]:bg-muted ${availability.ok ? "" : "opacity-55"}`}>
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          {armed ? <span className="text-destructive">Press ↵ again: {command.human.title.replace(/…$/, "")}</span> : command.human.title}
          {alias && !armed && <span className="text-muted-foreground"> ({alias})</span>}
        </span>
      </span>
      <span className="hidden sm:block max-w-[45%] truncate text-xs text-muted-foreground">
        {availability.ok ? command.shortcut ?? "" : availability.reason}
      </span>
    </Cmdk.Item>
  );
}

function DetailLine({ row, armed, byId, pageError }: { row?: PaletteRow; armed: Armed; byId: Map<string, Command>; pageError: string | null }) {
  let text: ReactNode = null;
  if (pageError) text = <span className="text-destructive">{pageError}</span>;
  else if (row && armed?.id === row.command.id) text = <>Press ↵ again to {lower(row.command.human.title)}: {row.command.human.tooltip} Esc keeps it.</>;
  else if (row && !row.availability.ok) {
    const fix = row.availability.fix ? byId.get(row.availability.fix) : undefined;
    text = <>{row.availability.reason}{fix ? <> → {fix.human.title} ↵</> : row.availability.fix ? <> {row.availability.fix}</> : null}</>;
  } else if (row) text = <>{row.command.human.tooltip}{row.command.shortcut ? ` (${row.command.shortcut})` : ""}</>;
  return (
    <div className="border-t border-border px-3 py-2 text-xs">
      <p className="min-h-[1.25rem] text-foreground/90" aria-live="polite" data-testid="text-palette-detail">{text}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">↑↓ move · ↵ run · esc back</p>
    </div>
  );
}
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1).replace(/…$/, "");

function PickPage({ page, query, armedId, busy, error, onPick }: {
  page: Extract<PaletteFormPage, { kind: "pick" }>; query: string; armedId?: string; busy: boolean; error: string | null; onPick: (o: PickOption) => void;
}) {
  const [options, setOptions] = useState<readonly PickOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    Promise.resolve().then(() => page.options()).then(o => { if (live) setOptions(o); }, e => { if (live) setLoadError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [page]);
  if (loadError) return <p className="px-3 py-4 text-sm text-destructive">{loadError}</p>;
  if (!options) return <Cmdk.Loading><p className="px-3 py-4 text-sm text-muted-foreground">Loading…</p></Cmdk.Loading>;
  const q = query.trim().toLowerCase();
  const shown = !q ? options : options.map(o => ({ o, s: Math.max(matchScore(o.label, q), ...(o.keywords ?? []).map(k => matchScore(k, q) * 0.9), o.detail?.toLowerCase().includes(q) ? 20 : 0) }))
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s).map(x => x.o);
  if (!shown.length) return <p className="px-3 py-4 text-sm text-muted-foreground" data-testid="text-palette-empty">{options.length ? "Nothing matches." : page.empty ?? "Nothing to choose from."}</p>;
  return (<>
    {shown.map(o => {
      const armed = !!armedId && armedId.endsWith(`:${o.id}`);
      return (
        <Cmdk.Item key={o.id} value={`opt:${o.id}`} onSelect={() => !busy && onPick(o)} data-unavailable={!!o.unavailable || undefined} data-testid={`row-palette-option-${o.id}`}
          className={`flex items-baseline gap-3 px-2 py-2 text-sm cursor-pointer data-[selected=true]:bg-muted ${o.unavailable ? "opacity-55" : ""}`}>
          <span className="min-w-0 flex-1 truncate">{armed ? <span className="text-destructive">Press ↵ again: {o.label}. Esc keeps it.</span> : o.label}</span>
          <span className="max-w-[55%] truncate text-xs text-muted-foreground">{o.unavailable ?? o.detail ?? ""}</span>
        </Cmdk.Item>
      );
    })}
    {error && <p className="px-3 py-2 text-xs text-destructive" role="alert">{error}</p>}
  </>);
}

function FieldPage({ page, inputRef, busy, error, onSubmit, onBack }: {
  page: Extract<PaletteFormPage, { kind: "field" }>; inputRef: RefObject<HTMLInputElement | null>; busy: boolean; error: string | null;
  onSubmit: (value: string) => void; onBack: () => void;
}) {
  const [value, setValue] = useState(page.initial ?? "");
  const problem = value.trim() ? page.validate?.(value) ?? null : null;
  const ok = !!value.trim() && !problem && !busy;
  useEffect(() => { inputRef.current?.focus(); }, [inputRef]);
  return (
    <form className="px-3 py-3 space-y-2" onSubmit={e => { e.preventDefault(); if (ok) onSubmit(value.trim()); }}>
      <label className="block text-sm font-medium" htmlFor="palette-field">{page.label}</label>
      <input id="palette-field" ref={inputRef} value={value} placeholder={page.placeholder} onChange={e => setValue(e.target.value)} disabled={busy}
        onKeyDown={e => { if (e.key === "Backspace" && !value) { e.preventDefault(); onBack(); } }}
        aria-invalid={!!problem || undefined} data-testid="input-palette-field"
        className={`w-full border bg-background px-3 py-2 text-sm outline-none focus:border-primary ${problem ? "border-destructive" : "border-border"}`} />
      {problem ? <p className="text-xs text-destructive" role="alert">{problem}</p>
        : value.trim() && page.consequence ? <p className="text-xs text-muted-foreground">{page.consequence(value.trim())}</p> : null}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      <p className="text-[11px] text-muted-foreground">{busy ? "Working…" : ok ? "Press ↵ to continue." : "Type a value."}</p>
    </form>
  );
}

function InfoPage({ page }: { page: Extract<PaletteFormPage, { kind: "info" }> }) {
  const [copied, setCopied] = useState(false);
  return (<>
    <div className="px-3 py-2 space-y-2 text-sm" data-testid="panel-palette-info">
      {page.lines.map((line, i) => <p key={i} className="whitespace-pre-wrap break-words">{line}</p>)}
    </div>
    {page.copy && (
      <Cmdk.Item value="info:copy" onSelect={() => { void navigator.clipboard?.writeText(page.copy!.text).then(() => setCopied(true), () => setCopied(false)); }}
        className="mx-1 mt-1 px-2 py-2 text-sm cursor-pointer border border-border data-[selected=true]:bg-muted" data-testid="button-palette-copy">
        {copied ? "Copied" : page.copy.label}
      </Cmdk.Item>
    )}
  </>);
}
