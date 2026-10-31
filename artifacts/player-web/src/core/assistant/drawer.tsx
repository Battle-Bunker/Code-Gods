/**
 * The in-client assistant drawer (docs/surface-architecture.md §6), part of the protected core in both hosted and
 * dev-server modes. It talks only to the engine's assistant functions (convex/assistant.ts): the model runs in
 * Convex, acts through the player's own revocable assistant credential, and every public chat, summon, pause, panel
 * deletion or owner action waits for a confirmation card here.
 */
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { Bot, ChevronDown, ChevronRight, Plus, Send, Square, X } from "lucide-react";
import { api } from "@workspace/engine/convex/_generated/api";
import type { Id } from "@workspace/engine/convex/_generated/dataModel";
import { useRoom } from "@/sdk/context";
import {
  TURN_ACTIVE, allowanceMeter, buildTimeline, cardReducer, chipView, initialCard, prettyArgs, withPending, type CallRow, type ChipTone,
} from "./state";

type Permission = "read" | "act" | "owner";
const errText = (e: unknown) => {
  const data = (e as { data?: { message?: string } })?.data;
  return data?.message ?? (e instanceof Error ? e.message : String(e));
};
const OPEN_KEY = "cg.assistant.open";
const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) === "1"; } catch { return false; } };
const writeOpen = (open: boolean) => { try { localStorage.setItem(OPEN_KEY, open ? "1" : "0"); } catch { /* per-viewer convenience only */ } };

/** The header toggle and, when open, the drawer. */
export function AssistantToggle() {
  const [open, setOpen] = useState(readOpen);
  const toggle = (next: boolean) => { setOpen(next); writeOpen(next); };
  return (
    <>
      <button data-testid="button-assistant" onClick={() => toggle(!open)} aria-expanded={open}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold border ${open ? "bg-primary text-primary-foreground border-primary" : "border-current"}`}>
        <Bot size={13} /> Assistant
      </button>
      {/* A portal: the dock's container-query regions would otherwise contain a fixed drawer. */}
      {open && createPortal(<AssistantDrawer onClose={() => toggle(false)} />, document.body)}
    </>
  );
}

function AssistantDrawer({ onClose }: { onClose: () => void }) {
  const { roomId } = useRoom();
  const room = roomId as Id<"rooms">;
  const status = useQuery(api.assistant.status, { roomId: room });
  const threads = useQuery(api.assistant.threads, { roomId: room });
  const [chosen, setChosen] = useState<string | null | "new">(null);
  const threadId = chosen === "new" ? null : chosen ?? status?.activeTurn?.threadId ?? threads?.[0]?._id ?? null;
  const thread = useQuery(api.assistant.thread, threadId ? { threadId: threadId as Id<"assistantThreads"> } : "skip");
  const send = useMutation(api.assistant.send);
  const cancel = useMutation(api.assistant.cancel);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<Permission>("act");
  const [ownerConsent, setOwnerConsent] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const timeline = useMemo(() => withPending(buildTimeline(thread?.messages ?? [], (thread?.toolCalls ?? []) as CallRow[]), pending), [thread, pending]);
  const latestTurn = thread?.turns.at(-1);
  const active = !!latestTurn && TURN_ACTIVE.includes(latestTurn.status);
  const meter = status ? allowanceMeter(status.allowance.used, status.allowance.limit) : null;
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [timeline.length, timeline.at(-1)]);
  useEffect(() => { if (pending && timeline.some(i => i.kind === "user" && !i.pending && i.text === pending)) setPending(null); }, [timeline, pending]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || active) return;
    setError(null); setPending(text); setDraft("");
    try {
      const firstUse = !status?.credential;
      const sent = await send({ roomId: room, text, ...(threadId ? { threadId: threadId as Id<"assistantThreads"> } : {}),
        ...(firstUse || status?.credential?.permission !== permission ? { permission } : {}), ...(permission === "owner" ? { ownerConsent } : {}) });
      setChosen(sent.threadId);
    } catch (e) { setError(errText(e)); setPending(null); setDraft(text); }
  };
  const allowed: Permission[] = status ? (["read", "act", "owner"] as const).filter(p => ({ read: 0, act: 1, owner: 2 })[p] <= ({ read: 0, act: 1, owner: 2 })[status.maxPermission]) : ["read", "act"];
  // The credential's permission once there is one; before first use, act (or read on a read-only connection).
  useEffect(() => { if (status) setPermission(status.credential?.permission ?? (status.maxPermission === "read" ? "read" : "act")); }, [status?.credential?.permission, status?.maxPermission]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside data-testid="assistant-drawer" className="fixed top-0 right-0 z-50 h-[100dvh] w-full sm:w-[420px] bg-card text-card-foreground border-l border-[hsl(var(--card-border))] shadow-2xl flex flex-col">
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-[hsl(var(--card-border))]">
        <Bot size={16} />
        <h2 className="label !text-[hsl(var(--foreground))] flex-1">Assistant</h2>
        {status?.model && <span className="font-mono text-[10px] opacity-60">{status.model.label}</span>}
        {threads && threads.length > 0 && (
          <select aria-label="Thread" className="bg-transparent border border-[hsl(var(--input))] text-xs max-w-[120px]" value={threadId ?? "new"}
            onChange={e => setChosen(e.target.value === "new" ? "new" : e.target.value)} data-testid="select-assistant-thread">
            <option value="new">New thread</option>
            {threads.map(t => <option key={t._id} value={t._id}>{t.title}</option>)}
          </select>
        )}
        <button aria-label="New thread" title="New thread" onClick={() => setChosen("new")} className="p-1 opacity-70 hover:opacity-100" data-testid="button-assistant-new"><Plus size={15} /></button>
        <button aria-label="Close" onClick={onClose} className="p-1 opacity-70 hover:opacity-100" data-testid="button-assistant-close"><X size={15} /></button>
      </header>

      {meter && !meter.off && (
        <div className="px-4 py-2 border-b border-[hsl(var(--card-border))] space-y-1" data-testid="assistant-meter">
          <div className="flex justify-between font-mono text-[11px]"><span className="opacity-60">allowance this game</span><span data-testid="text-assistant-allowance">{meter.label}</span></div>
          <div className="h-1 bg-muted overflow-hidden"><div className={`h-full ${meter.exhausted ? "bg-destructive" : "bg-[hsl(var(--accent))]"}`} style={{ width: `${meter.fraction * 100}%` }} /></div>
        </div>
      )}

      <div ref={scroller} className="flex-1 overflow-auto px-4 py-3 space-y-3" data-testid="assistant-timeline">
        {status && !status.enabled ? (
          <div data-testid="text-assistant-off" className="text-sm space-y-2">
            <p className="font-semibold">The assistant is off in this room.</p>
            <p className="text-muted-foreground">It runs on the engine and is paid from the server owner's AI provider account, so the room owner has to approve an allowance first (the room's AI budget card on the engine site: "In-client assistant"). Every player then gets the same allowance per game.</p>
          </div>
        ) : timeline.length === 0 ? (
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Ask about the rules, your utility, the objects or what to summon. The assistant acts as you, with the permission you choose, and asks before it posts public chat, summons, pauses, deletes a panel or uses owner powers.</p>
          </div>
        ) : timeline.map(item => item.kind === "user" ? (
          <div key={item.key} className={`ml-8 px-3 py-2 bg-secondary text-secondary-foreground text-sm whitespace-pre-wrap break-words ${item.pending ? "opacity-60" : ""}`} data-testid="assistant-user-message">{item.text}</div>
        ) : item.kind === "assistant" ? (
          <div key={item.key} className="mr-4 text-sm whitespace-pre-wrap break-words" data-testid="assistant-message" data-status={item.status}>
            {item.text || <span className="opacity-50 beat">thinking…</span>}
            {item.status === "cancelled" && <span className="ml-1 font-mono text-[10px] opacity-60">(stopped)</span>}
          </div>
        ) : item.call.status === "awaiting_confirmation" ? <ConfirmCard key={item.key} call={item.call} /> : <Chip key={item.key} call={item.call} />)}
        {latestTurn?.error && !active && (
          <p className={`text-xs ${latestTurn.status === "done" ? "text-muted-foreground" : "text-destructive"}`} data-testid="text-assistant-turn-error">{latestTurn.error.message}</p>
        )}
      </div>

      {status?.enabled && (
        <footer className="border-t border-[hsl(var(--card-border))] p-3 space-y-2">
          {!status.credential && (
            <fieldset className="text-xs space-y-1" data-testid="assistant-permission">
              <legend className="opacity-70 mb-1">The assistant acts as you with:</legend>
              <div className="flex gap-3">
                {allowed.map(p => (
                  <label key={p} className="flex items-center gap-1"><input type="radio" name="assistant-permission" checked={permission === p} onChange={() => setPermission(p)} data-testid={`radio-assistant-${p}`} />{p}</label>
                ))}
              </div>
              {permission === "owner" && (
                <label className="flex items-start gap-1.5"><input type="checkbox" checked={ownerConsent} onChange={e => setOwnerConsent(e.target.checked)} data-testid="checkbox-assistant-owner" />
                  I let my assistant propose owner actions (settings, starting and ending games, AI seats); each still asks me first.</label>
              )}
            </fieldset>
          )}
          {status.credential && <p className="font-mono text-[10px] opacity-60">acting as you · {status.credential.permission} · revocable on the engine site</p>}
          {error && <p className="text-xs text-destructive" data-testid="text-assistant-error">{error}</p>}
          <form className="flex gap-2 items-end" onSubmit={e => { e.preventDefault(); void submit(); }}>
            <textarea data-testid="input-assistant" value={draft} onChange={e => setDraft(e.target.value)} rows={2} maxLength={4000} placeholder="Ask your assistant"
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
              className="flex-1 min-w-0 resize-none bg-transparent border border-[hsl(var(--input))] px-2 py-1.5 text-sm outline-none focus:border-primary" />
            {active && latestTurn ? (
              <button type="button" data-testid="button-assistant-stop" onClick={() => void cancel({ turnId: latestTurn._id }).catch(e => setError(errText(e)))}
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold border border-[hsl(var(--input))]"><Square size={12} /> Stop</button>
            ) : (
              <button type="submit" data-testid="button-assistant-send" disabled={!draft.trim() || (permission === "owner" && !ownerConsent && !status.credential)}
                className="inline-flex items-center px-3 py-2 bg-primary text-primary-foreground disabled:opacity-40"><Send size={14} /></button>
            )}
          </form>
        </footer>
      )}
    </aside>
  );
}

const TONES: Record<ChipTone, string> = {
  ok: "border-[hsl(var(--accent))]", error: "border-destructive text-destructive", muted: "opacity-60", busy: "beat", ask: "border-primary",
};

/** An activity chip: the tool and its outcome; expands to the exact arguments and the result summary. */
function Chip({ call }: { call: CallRow }) {
  const [open, setOpen] = useState(false);
  const view = chipView(call);
  return (
    <div className={`border-l-2 pl-2 text-xs ${TONES[view.tone]}`} data-testid={`assistant-chip-${call.tool}`} data-status={call.status}>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 font-mono" aria-expanded={open}>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}{view.label}<span className="opacity-60">· {call.status === "running" || call.status === "pending" ? "running" : view.detail || call.status}</span>
      </button>
      {open && <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] bg-muted p-2">{prettyArgs(call.argsJson)}</pre>}
    </div>
  );
}

/** A confirmation card: the exact payload the call will run with; approve or deny, once. */
function ConfirmCard({ call }: { call: CallRow }) {
  const confirm = useMutation(api.assistant.confirm);
  const [state, dispatch] = useReducer(cardReducer, initialCard);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { dispatch({ type: "server", status: call.status }); }, [call.status]);
  const decide = async (decision: "approve" | "deny") => {
    if (state.phase !== "idle" && state.phase !== "error") return;
    dispatch({ type: "submit", decision });
    try { await confirm({ toolCallId: call._id as Id<"assistantToolCalls">, decision }); dispatch({ type: "sent" }); }
    catch (e) { dispatch({ type: "failed", message: errText(e) }); }
  };
  const left = call.confirmDeadline ? Math.max(0, Math.ceil((call.confirmDeadline - now) / 1000)) : null;
  const busy = state.phase === "submitting" || state.phase === "sent";
  return (
    <div className="border border-primary p-2.5 space-y-2 text-xs" data-testid={`assistant-card-${call.tool}`}>
      <p className="font-semibold">Your assistant wants to run <span className="font-mono">{call.tool}</span>{call.tool === "send_chat" ? " (public: everyone in the room reads it)" : ""}</p>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] bg-muted p-2" data-testid="assistant-card-args">{prettyArgs(call.argsJson)}</pre>
      {state.phase === "error" && <p className="text-destructive">{state.message}</p>}
      <div className="flex items-center gap-2">
        <button disabled={busy} onClick={() => void decide("approve")} data-testid="button-confirm-approve" className="px-3 py-1.5 bg-primary text-primary-foreground font-semibold disabled:opacity-40">Approve</button>
        <button disabled={busy} onClick={() => void decide("deny")} data-testid="button-confirm-deny" className="px-3 py-1.5 border border-[hsl(var(--input))] disabled:opacity-40">Deny</button>
        {left !== null && <span className="ml-auto font-mono opacity-60">{left}s</span>}
      </div>
    </div>
  );
}
