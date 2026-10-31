/**
 * The assistant pane (docs/research/ui-redesign/player-client.md §4): the player's private conversation with the
 * in-client assistant, part of the protected core in hosted and dev-server modes alike. It talks only to the engine's
 * assistant functions (convex/assistant.ts): the model runs in Convex and acts through the player's own revocable
 * assistant credential; public chat, summons, destroys, pauses, panel deletions and owner actions wait for the
 * confirmation card docked above the composer.
 *
 * Designed for 160 px tall: messages, one step line per model step (expanding to the exact tool chips), system
 * lines, the card, the composer with the allowance as a 2 px line on its top edge. Empty: the phase's greeting, the
 * first-use permission choice and up to three prompt chips. Off (no allowance): one sentence, the chips in command
 * form and a palette button instead of a textarea.
 */
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowDown, ChevronDown, ChevronRight, Send, Square } from "lucide-react";
import { api } from "@workspace/engine/convex/_generated/api";
import type { Phase } from "@workspace/player-client/lenses";
import type { Id } from "@workspace/engine/convex/_generated/dataModel";
import { useRoom } from "@/sdk";
import { useDockStore } from "@/dock/store";
import { useNow, useSituation } from "@/core/game/situation";
import { errorText } from "@/core/notices";
import { paletteStore } from "@/core/palette/store";
import { runPaletteCommand } from "@/core/palette/registry";
import { composer, useComposer, type Permission } from "./composer";
import { emptyStateFor, suggestionsFor, type Suggestion } from "./suggestions";
import {
  TURN_ACTIVE, allowanceMeter, allowanceNote, buildTimeline, cardReducer, chipView, confirmSentence, initialCard, prettyArgs, stepView, userCount, withPending, withSteps,
  type CallRow, type ChatItem, type StepTone,
} from "./state";

const RANK: Record<Permission, number> = { read: 0, act: 1, owner: 2 };
type Note = { at: number; key: string; text: string };
const PHASE_NOTE: Record<Phase, string> = {
  lobby: "Back in the lobby", planning: "Game started · you're in planning", running: "The world is running", paused: "The world is paused", ended: "Game over",
};
const ARM_MS = 700;
const CARD_MS = 120_000;
/** The pane grows to this while a card waits, and returns to its size after. */
const CARD_ROOM = { height: 320, width: 360 };

export function AssistantPane({ paneId }: { paneId: string }) {
  const { roomId } = useRoom();
  const room = roomId as Id<"rooms">;
  const situation = useSituation();
  const status = useQuery(api.assistant.status, { roomId: room });
  const threads = useQuery(api.assistant.threads, { roomId: room });
  const c = useComposer();
  const threadId = c.thread === "new" ? null : c.thread ?? status?.activeTurn?.threadId ?? threads?.[0]?._id ?? null;
  const thread = useQuery(api.assistant.thread, threadId ? { threadId: threadId as Id<"assistantThreads"> } : "skip");
  const send = useMutation(api.assistant.send);
  const cancel = useMutation(api.assistant.cancel);
  /** The message just sent, and how many user messages the thread had then: shown until the server has it. */
  const [pending, setPending] = useState<{ text: string; users: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const calls = (thread?.toolCalls ?? []) as CallRow[];
  const timeline = useMemo(() => buildTimeline(thread?.messages ?? [], calls), [thread]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = useMemo(() => withSteps(withPending(timeline, pending?.text ?? null, pending?.users)), [timeline, pending]);
  const latestTurn = thread?.turns.at(-1);
  const active = !!latestTurn && TURN_ACTIVE.includes(latestTurn.status);
  const card = calls.find(call => call.status === "awaiting_confirmation");
  const enabled = status?.enabled ?? false;
  const permission: Permission = c.permission ?? status?.credential?.permission ?? (status?.maxPermission === "read" ? "read" : "act");
  const blocked = permission === "owner" && !c.ownerConsent && !status?.credential;
  useEffect(() => { if (pending && userCount(timeline) > pending.users) setPending(null); }, [timeline, pending]);
  useEffect(() => { composer.setStatus(!status ? "" : !enabled ? "off" : card ? "waiting for you" : active ? "thinking…" : ""); }, [status, enabled, card, active]);

  // Grow the pane while a card waits, so the card and the composer both fit; give the space back after.
  const store = useDockStore();
  const grown = useRef<{ width?: number; height?: number } | null>(null);
  useEffect(() => {
    const panel = store.api?.getPanel(paneId);
    if (!panel) return;
    if (card && !grown.current) {
      const side = panel.api.width < panel.api.height * 0.8;
      if (!side && panel.api.height < 200) { grown.current = { height: panel.api.height }; panel.api.setSize({ height: CARD_ROOM.height }); }
      else if (side && panel.api.width < 280) { grown.current = { width: panel.api.width }; panel.api.setSize({ width: CARD_ROOM.width }); }
    } else if (!card && grown.current) {
      panel.api.setSize(grown.current);
      grown.current = null;
    }
  }, [card, paneId, store]);

  const submit = async (text: string) => {
    const message = text.trim();
    if (!message || active || !status || blocked) return;
    // A new conversation starts from no messages.
    setError(null); setPending({ text: message, users: threadId ? userCount(timeline) : 0 }); composer.setDraft("");
    try {
      const firstUse = !status.credential;
      const sent = await send({ roomId: room, text: message, ...(threadId ? { threadId: threadId as Id<"assistantThreads"> } : {}),
        ...(firstUse || status.credential?.permission !== permission ? { permission } : {}), ...(permission === "owner" ? { ownerConsent: c.ownerConsent } : {}) });
      composer.setThread(sent.threadId);
    } catch (e) { setError(errorText(e)); setPending(null); composer.setDraft(message); }
  };

  const chips = suggestionsFor({ phase: situation.phase, seated: situation.seated, isOwner: situation.isOwner, agents: situation.agents, ready: situation.ready,
    members: situation.members, assistantOn: enabled });
  const runChip = (chip: Suggestion) => {
    if (chip.command) runPaletteCommand(chip.command);
    else if (chip.prompt) void submit(chip.prompt);
  };
  const empty = emptyStateFor(situation.phase, enabled);
  const showChips = !active && !card && !c.draft.trim() && (!items.length || items.at(-1)?.kind === "assistant");

  // Phase changes seen while this pane is open become system lines where they happened in the conversation.
  const [notes, setNotes] = useState<Note[]>([]);
  const seenPhase = useRef<Phase | undefined>(undefined);
  const phaseNow = situation.obs?.phase;
  useEffect(() => { setNotes([]); }, [threadId]);
  useEffect(() => {
    if (!phaseNow) return;
    if (seenPhase.current && seenPhase.current !== phaseNow) setNotes(n => [...n, { at: items.length, key: `${phaseNow}-${Date.now()}`, text: PHASE_NOTE[phaseNow] }].slice(-5));
    seenPhase.current = phaseNow;
  }, [phaseNow]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div data-testid="assistant-pane" className="flex h-full min-h-0 flex-col bg-card">
      <Timeline items={items} notes={notes} empty={!status ? null : !enabled ? (
        <div data-testid="text-assistant-off" className="space-y-1 text-sm">
          <p className="font-serif text-xl">{empty.greeting}</p>
          <p className="text-muted-foreground">{empty.body}</p>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="font-serif text-xl">{empty.greeting}</p>
          <p className="text-muted-foreground">{empty.body}</p>
          {!status.credential && <PermissionChoice permission={permission} max={status.maxPermission} isOwner={status.isOwner} />}
        </div>
      )} footer={<>
        {latestTurn?.error && !active && <p className={`text-xs ${latestTurn.status === "done" ? "text-muted-foreground" : "text-destructive"}`} data-testid="text-assistant-turn-error">{latestTurn.error.message}</p>}
        {latestTurn?.status === "cancelled" && <SystemLine>You stopped the assistant.</SystemLine>}
      </>} />
      {showChips && chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2" data-testid="assistant-chips">
          {chips.map(chip => (
            <button key={chip.label} type="button" onClick={() => runChip(chip)} data-testid="button-chip"
              className="border border-[hsl(var(--input))] px-2 py-1 text-xs hover:border-foreground">{chip.label}</button>
          ))}
        </div>
      )}
      {card && <ConfirmCard key={card._id} call={card} energy={situation.obs?.self.energy} pauseSeconds={(situation.room?.settings as { pauseSeconds?: number } | undefined)?.pauseSeconds} />}
      {error && <p className="px-3 pb-1 text-xs text-destructive" data-testid="text-assistant-error">{error}</p>}
      {enabled
        ? <Composer active={active} onSend={() => void submit(c.draft)} onStop={() => latestTurn && void cancel({ turnId: latestTurn._id }).catch(e => setError(errorText(e)))}
            meter={status ? { used: status.allowance.used, limit: status.allowance.limit } : null}
            blocked={blocked} paneId={paneId} />
        : status && (
          <div className="border-t border-[hsl(var(--card-border))] p-2">
            <button type="button" onClick={() => paletteStore.open(paneId)} data-testid="button-assistant-palette"
              className="flex w-full items-center gap-2 border border-[hsl(var(--input))] px-3 py-2 text-left text-sm text-muted-foreground">
              Assistant is off in this room · search commands <span className="ml-auto font-mono text-[11px]">Ctrl K</span>
            </button>
          </div>
        )}
    </div>
  );
}

/** The scrolling timeline: pinned to the bottom unless the player scrolled up ("↓ new" then). */
function Timeline({ items, notes, empty, footer }: { items: ChatItem[]; notes: Note[]; empty: React.ReactNode; footer: React.ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [fresh, setFresh] = useState(false);
  const last = items.at(-1);
  const signature = `${items.length}:${last?.kind === "assistant" ? last.text.length : last?.kind === "step" ? last.calls.map(x => x.status).join() : ""}`;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (pinned.current) el.scrollTop = el.scrollHeight;
    else setFresh(true);
  }, [signature]);
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (pinned.current) setFresh(false);
  };
  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scroller} onScroll={onScroll} className="h-full space-y-2 overflow-auto px-3 py-2" data-testid="assistant-timeline" aria-live="polite">
        {items.length === 0 && empty}
        {items.map((item, i) => [
          ...notes.filter(n => n.at === i).map(n => <SystemLine key={n.key}>{n.text}</SystemLine>),
          item.kind === "user" ? (
            <div key={item.key} className={`ml-auto max-w-[75%] whitespace-pre-wrap break-words bg-muted px-2.5 py-1.5 text-sm ${item.pending ? "opacity-60" : ""}`} data-testid="assistant-user-message">{item.text}</div>
          ) : item.kind === "assistant" ? (
            <div key={item.key} className="max-w-[68ch] whitespace-pre-wrap break-words text-sm" data-testid="assistant-message" data-status={item.status}>
              {item.text || <span className="beat text-muted-foreground">thinking…</span>}
              {item.status === "cancelled" && <span className="ml-1 text-[11px] text-muted-foreground">(stopped)</span>}
            </div>
          ) : <StepLine key={item.key} calls={item.calls} />,
        ])}
        {notes.filter(n => n.at >= items.length).map(n => <SystemLine key={n.key}>{n.text}</SystemLine>)}
        {footer}
      </div>
      {fresh && (
        <button type="button" onClick={() => { pinned.current = true; setFresh(false); scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }}
          className="absolute bottom-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 border border-[hsl(var(--input))] bg-card px-2 py-0.5 text-[11px] shadow-sm"><ArrowDown size={11} /> new</button>
      )}
    </div>
  );
}

function SystemLine({ children }: { children: React.ReactNode }) {
  return <p className="text-center text-xs text-muted-foreground">{children}</p>;
}

const TONE: Record<StepTone, string> = { ok: "text-muted-foreground", error: "text-destructive", muted: "text-muted-foreground opacity-70", busy: "text-muted-foreground beat", ask: "text-foreground" };
/** One model step: its verbs in one line; ▸ opens the exact calls. */
function StepLine({ calls }: { calls: CallRow[] }) {
  const view = stepView(calls);
  const [open, setOpen] = useState(view.open);
  useEffect(() => { if (view.open) setOpen(true); }, [view.open]);
  return (
    <div className="text-xs" data-testid="assistant-step" data-tone={view.tone}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={`flex w-full min-w-0 items-center gap-1 text-left ${TONE[view.tone]}`}>
        <span aria-hidden>◦</span><span className="truncate">{view.text}</span>{open ? <ChevronDown size={11} className="shrink-0" /> : <ChevronRight size={11} className="shrink-0" />}
      </button>
      {open && <div className="mt-1 space-y-1 pl-3">{calls.map(call => <Chip key={call._id} call={call} />)}</div>}
    </div>
  );
}

/** One tool call: its name, outcome and the exact arguments. */
function Chip({ call }: { call: CallRow }) {
  const [open, setOpen] = useState(false);
  const view = chipView(call);
  return (
    <div className={`border-l-2 pl-2 ${view.tone === "error" ? "border-destructive text-destructive" : view.tone === "ok" ? "border-[hsl(var(--accent))]" : "border-[hsl(var(--input))]"}`} data-testid={`assistant-chip-${call.tool}`} data-status={call.status}>
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 font-mono text-[11px]" aria-expanded={open}>
        {view.label}<span className="text-muted-foreground">· {call.status === "running" || call.status === "pending" ? "running" : view.detail || call.status}</span>
      </button>
      {open && <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words bg-muted p-2 font-mono text-[10px]">{prettyArgs(call.argsJson)}</pre>}
    </div>
  );
}

/** The confirmation card, docked above the composer: the plain sentence, Approve / Not now, Details, the deadline. */
function ConfirmCard({ call, energy, pauseSeconds }: { call: CallRow; energy?: number; pauseSeconds?: number }) {
  const confirm = useMutation(api.assistant.confirm);
  const [state, dispatch] = useReducer(cardReducer, initialCard);
  const [armed, setArmed] = useState(false);
  const [details, setDetails] = useState(false);
  const now = useNow(1000);
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setTimeout(() => setArmed(true), ARM_MS); return () => clearTimeout(t); }, []);
  useEffect(() => { dispatch({ type: "server", status: call.status }); }, [call.status]);
  const decide = async (decision: "approve" | "deny") => {
    if (!armed || (state.phase !== "idle" && state.phase !== "error")) return;
    dispatch({ type: "submit", decision });
    try { await confirm({ toolCallId: call._id as Id<"assistantToolCalls">, decision }); dispatch({ type: "sent" }); }
    catch (e) { dispatch({ type: "failed", message: errorText(e) }); }
  };
  // ⌘↵ / Ctrl+↵ approves, only from the assistant pane (or with nothing focused); a plain Enter never does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      const focus = document.activeElement;
      const pane = card.current?.closest("[data-testid=assistant-pane]");
      if (focus && focus !== document.body && !pane?.contains(focus)) return;
      e.preventDefault();
      void decide("approve");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const left = call.confirmDeadline ? Math.max(0, call.confirmDeadline - now) : null;
  const busy = state.phase === "submitting" || state.phase === "sent";
  return (
    <div ref={card} className="mx-2 mb-2 border border-[hsl(var(--card-border))] border-l-2 border-l-primary bg-card" data-testid={`assistant-card-${call.tool}`} role="alertdialog" aria-label="Your assistant asks first">
      <div className="space-y-2 p-2.5 text-sm">
        <p className="font-medium">{confirmSentence(call, { energy, pauseSeconds })}</p>
        {state.phase === "error" && <p className="text-xs text-destructive">{state.message}</p>}
        <div className="flex items-center gap-2">
          <button type="button" disabled={busy || !armed} onClick={() => void decide("approve")} data-testid="button-confirm-approve" data-armed={armed}
            className="bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-40">Approve</button>
          <button type="button" disabled={busy || !armed} onClick={() => void decide("deny")} data-testid="button-confirm-deny"
            className="px-3 py-1 text-xs disabled:opacity-40">Not now</button>
          <button type="button" onClick={() => setDetails(!details)} aria-expanded={details} className="ml-auto text-xs text-muted-foreground">Details {details ? "▾" : "▸"}</button>
        </div>
        {details && <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words bg-muted p-2 font-mono text-[10px]" data-testid="assistant-card-args">{prettyArgs(call.argsJson)}</pre>}
      </div>
      {left !== null && <div className="h-0.5 bg-muted" aria-hidden><div className="h-full bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, (100 * left) / CARD_MS)}%` }} /></div>}
    </div>
  );
}

/** First use: what the assistant may do as you. Sending the first message accepts the choice. */
function PermissionChoice({ permission, max, isOwner }: { permission: Permission; max: Permission; isOwner: boolean }) {
  const { ownerConsent } = useComposer();
  const allowed = (p: Permission) => RANK[p] <= RANK[max];
  const option = (p: Permission, label: string, detail?: string) => allowed(p) && (
    <label className="flex items-start gap-2">
      <input type="radio" name="assistant-permission" checked={permission === p} onChange={() => composer.setPermission(p)} data-testid={`radio-assistant-${p}`} className="mt-1" />
      <span><span className="font-semibold">{label}</span>{detail && <span className="text-muted-foreground"> ({detail})</span>}</span>
    </label>
  );
  return (
    <fieldset className="space-y-1 border-l-2 border-[hsl(var(--input))] pl-3 text-xs" data-testid="assistant-permission">
      <legend className="mb-1 text-muted-foreground">Your assistant acts as you.</legend>
      {option("act", "Play for me", "asks before anything public or costly")}
      {option("read", "Only look")}
      {isOwner && allowed("owner") && (
        <details>
          <summary className="cursor-pointer text-muted-foreground">Owner powers…</summary>
          {option("owner", "Play for me, with owner powers", "settings, starting and ending games, AI seats")}
          {permission === "owner" && (
            <label className="mt-1 flex items-start gap-1.5"><input type="checkbox" checked={ownerConsent} onChange={e => composer.setOwnerConsent(e.target.checked)} data-testid="checkbox-assistant-owner" />
              I let my assistant propose owner actions; each still asks me first.</label>
          )}
        </details>
      )}
    </fieldset>
  );
}

/** The composer: one line growing to five; Enter sends, Shift+Enter breaks; Esc in an empty composer collapses the pane. */
function Composer({ active, onSend, onStop, meter, blocked, paneId }: {
  active: boolean; onSend: () => void; onStop: () => void; meter: { used: number; limit: number } | null; blocked: boolean; paneId: string;
}) {
  const { draft, focusTick } = useComposer();
  const input = useRef<HTMLTextAreaElement>(null);
  const store = useDockStore();
  useEffect(() => { if (focusTick) { input.current?.focus(); const end = input.current?.value.length ?? 0; input.current?.setSelectionRange(end, end); } }, [focusTick]);
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 5 * 20 + 12)}px`;
  }, [draft]);
  const m = meter ? allowanceMeter(meter.used, meter.limit) : null;
  const note = meter ? allowanceNote(meter.used, meter.limit) : null;
  const collapse = () => {
    const panel = store.api?.getPanel(paneId);
    // On a phone the sheet snaps to its peek.
    if (!panel) { composer.collapse(); return; }
    if (panel.api.width < panel.api.height * 0.8) panel.api.setSize({ width: 280 }); else panel.api.setSize({ height: 56 });
  };
  return (
    <div className="relative border-t border-[hsl(var(--card-border))]">
      {m && !m.off && <div className="absolute inset-x-0 -top-px h-0.5" aria-hidden><div className={`h-full ${m.exhausted ? "bg-destructive" : "bg-[hsl(var(--accent))]"}`} style={{ width: `${m.fraction * 100}%` }} /></div>}
      {note && <p className="px-3 pt-1.5 text-[11px] text-muted-foreground" data-testid="text-assistant-allowance">{note}</p>}
      <form className="flex items-end gap-2 p-2" onSubmit={e => { e.preventDefault(); if (!blocked) onSend(); }}>
        <textarea ref={input} data-testid="input-assistant" value={draft} onChange={e => composer.setDraft(e.target.value)} rows={1} maxLength={4000}
          placeholder="Ask your assistant…" aria-label="Ask your assistant (private)"
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); if (!blocked) onSend(); }
            if (e.key === "Escape" && !draft) { e.preventDefault(); input.current?.blur(); collapse(); }
          }}
          className="min-h-9 min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-5 outline-none" />
        {active ? (
          <button type="button" data-testid="button-assistant-stop" onClick={onStop}
            className="inline-flex items-center gap-1 border border-[hsl(var(--input))] px-3 py-2 text-xs font-semibold"><Square size={12} /> Stop</button>
        ) : (
          <button type="submit" data-testid="button-assistant-send" disabled={!draft.trim() || blocked} aria-label="Send to your assistant"
            className="inline-flex items-center bg-primary px-3 py-2 text-primary-foreground disabled:opacity-40"><Send size={14} /></button>
        )}
      </form>
    </div>
  );
}
