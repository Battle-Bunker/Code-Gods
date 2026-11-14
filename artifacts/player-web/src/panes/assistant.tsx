/**
 * The in-client assistant's pane (integration plan §1 "In-client assistant", W5): the human's conversation with their
 * assistant in this room. Every datum is its own live subscription (src/sdk/hooks.ts): the status (mode, grant,
 * allowance, latest turn, what waits), the conversations of this game, the chosen conversation's messages (paged,
 * newest at the bottom) and each turn's tool calls (its chips, live while it runs). Turns are not streamed: a reply
 * lands when its turn finishes. Every operation goes through `useAffordance` (assistant.send, cancel, setMode,
 * editQueued, removeQueued, sendQueued). The assistant's view tools change the human's layout, which the dock follows.
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useAffordance } from "@workspace/v2-affordances/react";
import { useAssistantStatus, useAssistantThreads, useAssistantTranscript, useAssistantTurn, useGameScope } from "@/sdk";
import { useRuntime } from "@/core/affordance-runtime";
import { AffordanceButton, failureText, TONES } from "@/site/components/action";
import { GRANT_OPTIONS, MODE_OPTIONS, allowanceWords, chipView, isBusy, timeline, turnWords, type Grant, type Message, type Mode, type TurnGroup } from "./assistant-model";

type Status = NonNullable<ReturnType<typeof useAssistantStatus>>;

function Chips({ turnId }: { turnId: string }) {
  const turn = useAssistantTurn(turnId);
  if (!turn) return null;
  const words = turnWords(turn);
  return (
    <div className="space-y-1" data-testid={`turn-${turnId}`} data-status={turn.status}>
      {turn.calls.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="What the assistant did">
          {turn.calls.map((c, i) => {
            const v = chipView(c);
            return (
              <li key={i} data-testid="chip-assistant" data-tool={c.tool} data-ok={c.ok || undefined} title={v.detail ?? undefined}
                className={`border px-2 py-0.5 text-xs ${v.tone === "error" ? "border-destructive/50 text-destructive" : "text-muted-foreground"}`}>
                {v.tone === "ok" ? "✓ " : "✗ "}{v.label}{v.detail ? `: ${v.detail}` : ""}
              </li>
            );
          })}
        </ul>
      )}
      {words && <p className={`text-xs ${turn.status === "failed" ? "text-destructive" : "text-muted-foreground"}`} data-testid="text-assistant-turn">{words}</p>}
    </div>
  );
}

function Turn({ group }: { group: TurnGroup<Message> }) {
  return (
    <li className="space-y-2" data-testid="row-assistant-turn">
      {group.messages.map(m => m.role === "user" ? (
        m.autopilot
          ? <p key={m.seq} className="text-xs font-medium uppercase tracking-wide text-muted-foreground" data-testid="text-assistant-autopilot">Autopilot looked at the game</p>
          : <p key={m.seq} className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap break-words bg-muted px-3 py-2 text-sm" data-testid="row-assistant-user">{m.text}</p>
      ) : (
        <p key={m.seq} className="max-w-[95%] whitespace-pre-wrap break-words text-sm" data-testid="row-assistant-reply">{m.text}</p>
      ))}
      <Chips turnId={group.turnId} />
    </li>
  );
}

function Transcript({ threadId, latestTurn }: { threadId: string | null; latestTurn: Status["turn"] }) {
  const pages = useAssistantTranscript(threadId);
  const groups = timeline(pages.results);
  const scroller = useRef<HTMLDivElement>(null);
  const last = pages.results[0]?.seq ?? 0;
  // The newest at the bottom: a new message (or a new turn's status) scrolls into view.
  useEffect(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; }, [threadId, last, latestTurn?.turnId, latestTurn?.status]);
  // Earlier messages arrive above: the message being read stays where it was.
  const fromBottom = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && fromBottom.current !== null) { el.scrollTop = el.scrollHeight - fromBottom.current; fromBottom.current = null; }
  }, [pages.results.length]);
  const earlier = () => { const el = scroller.current; if (el) fromBottom.current = el.scrollHeight - el.scrollTop; pages.loadMore(30); };
  // A turn of this conversation whose question is not on the loaded pages yet still shows its progress.
  const orphan = latestTurn && latestTurn.threadId === threadId && !groups.some(g => g.turnId === latestTurn.turnId) ? latestTurn.turnId : null;
  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-2" data-testid="assistant-transcript">
      {pages.status === "CanLoadMore" && (
        <button type="button" className="mb-2 w-full text-xs text-muted-foreground underline underline-offset-4" onClick={earlier} data-testid="button-assistant-earlier">Earlier messages</button>
      )}
      {pages.status === "LoadingMore" && <p className="mb-2 text-center text-xs text-muted-foreground">Loading earlier messages…</p>}
      {!threadId || (pages.status !== "LoadingFirstPage" && groups.length === 0 && !orphan) ? (
        <p className="text-sm text-muted-foreground" data-testid="assistant-empty">
          Ask your assistant anything about the game: what your goal means, which lines to work on, or to write and summon an agent for you.
          It can also open panes for you.
        </p>
      ) : (
        <ol className="space-y-4">
          {groups.map(g => <Turn key={g.turnId} group={g} />)}
          {orphan && <li><Chips turnId={orphan} /></li>}
        </ol>
      )}
    </div>
  );
}

function Settings({ status }: { status: Status }) {
  const setMode = useAffordance("assistant.setMode");
  const owner = useRuntime().context.principal.owner;
  const [error, setError] = useState<string | null>(null);
  const [askOwner, setAskOwner] = useState(false);
  const [armAutopilot, setArmAutopilot] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!armAutopilot) return; const t = setTimeout(() => setArmAutopilot(false), 5000); return () => clearTimeout(t); }, [armAutopilot]);
  const allowance = allowanceWords(status.allowance);
  const choose = async (mode: Mode, grant: Grant, ownerConsent?: boolean) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await setMode.run({ mode, grant, ...(ownerConsent ? { ownerConsent: true } : {}) }); setAskOwner(false); setArmAutopilot(false); }
    catch (e) { setError(failureText(e)); }
    finally { setBusy(false); }
  };
  const option = (selected: boolean) => `border px-2 py-1 text-left text-xs ${selected ? "border-foreground bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`;
  const grants = GRANT_OPTIONS.filter(g => g.id !== "owner" || owner || status.grant === "owner");
  return (
    <div className="space-y-3 border-b px-3 py-2" data-testid="assistant-settings">
      <fieldset className="space-y-1">
        <legend className="text-xs font-medium">What it does on its own</legend>
        <div className="grid grid-cols-3 gap-1">
          {MODE_OPTIONS.map(o => {
            const blocked = o.id === "autopilot" && status.grant === "read" ? "Autopilot needs it to act: choose \"Act for me\" first." : null;
            const pick = () => {
              if (!setMode.available || blocked || status.mode === o.id) return;
              // Autopilot spends this game's allowance on its own: a second press turns it on (the directory's inline confirmation).
              if (o.id === "autopilot" && !armAutopilot) { setArmAutopilot(true); return; }
              void choose(o.id, status.grant);
            };
            return (
              <button key={o.id} type="button" aria-pressed={status.mode === o.id} title={blocked ?? o.detail} className={`${option(status.mode === o.id)} ${blocked ? "opacity-50" : ""}`}
                aria-disabled={!setMode.available || busy || !!blocked || undefined} onClick={pick} data-testid={`button-assistant-mode-${o.id}`}>
                {o.id === "autopilot" && armAutopilot ? "Press again" : o.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {armAutopilot ? "Autopilot plays for you on its own and spends this game's allowance. Press again to turn it on." : MODE_OPTIONS.find(o => o.id === status.mode)?.detail}
        </p>
      </fieldset>
      <fieldset className="space-y-1">
        <legend className="text-xs font-medium">What it may do for you</legend>
        <div className={`grid gap-1 ${grants.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {grants.map(o => (
            <button key={o.id} type="button" aria-pressed={status.grant === o.id} title={o.detail} className={option(status.grant === o.id)}
              aria-disabled={!setMode.available || busy || undefined} data-testid={`button-assistant-grant-${o.id}`}
              onClick={() => { if (!setMode.available || status.grant === o.id) return; if (o.id === "owner") setAskOwner(true); else void choose(status.mode, o.id); }}>
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{GRANT_OPTIONS.find(o => o.id === status.grant)?.detail}</p>
        {askOwner && (
          <div className="space-y-1 border border-destructive/40 p-2 text-xs" role="alert">
            <p>Your assistant could then change this room's settings, start and end games, and add or remove players, as you can. Only do this if you trust it.</p>
            <div className="flex gap-2">
              <button type="button" className={TONES.danger} onClick={() => void choose(status.mode, "owner", true)} data-testid="button-assistant-owner-yes">Yes, it can act as the owner</button>
              <button type="button" className={TONES.secondary} onClick={() => setAskOwner(false)}>Cancel</button>
            </div>
          </div>
        )}
      </fieldset>
      <div className="space-y-1">
        <div className="h-1.5 w-full bg-muted" aria-hidden><div className={`h-full ${allowance.low ? "bg-destructive" : "bg-foreground/60"}`} style={{ width: `${Math.round(allowance.used * 100)}%` }} /></div>
        <p className="text-xs text-muted-foreground" data-testid="text-assistant-allowance">{allowance.text}</p>
      </div>
      {error && <p className="text-xs text-destructive" role="alert" data-testid="text-assistant-settings-error">{error}</p>}
    </div>
  );
}

function Queued({ status }: { status: Status }) {
  const edit = useAffordance("assistant.editQueued");
  const [editing, setEditing] = useState<{ queueId: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = isBusy(status.turn?.status);
  // The message went (its turn started) while it was being edited: say so, rather than drop the change silently.
  const gone = !!editing && !status.queued.some(q => q.queueId === editing.queueId);
  if (gone) {
    return (
      <div className="flex items-start gap-2 border-t px-3 py-2 text-xs" role="status" data-testid="text-assistant-queued-gone">
        <p className="flex-1">Your assistant read that message before you saved the change. Your edited words: “{editing.text}”</p>
        <button type="button" className={`${TONES.quiet} text-xs`} onClick={() => setEditing(null)}>OK</button>
      </div>
    );
  }
  if (status.queued.length === 0) return null;
  const held = status.queued.some(q => q.held);
  const save = async () => {
    if (!editing?.text.trim()) return;
    try { await edit.run({ queueId: editing.queueId, text: editing.text.trim() }); setEditing(null); setError(null); }
    catch (e) { setError(failureText(e)); }
  };
  return (
    <div className="space-y-1 border-t px-3 py-2" data-testid="assistant-queued">
      <p className="text-xs font-medium">
        {held ? "Waiting until you send them (you stopped it, or something went wrong):" : busy ? "Waiting for it to finish, then it reads these:" : "Waiting:"}
      </p>
      <ul className="space-y-1">
        {status.queued.map(q => (
          <li key={q.queueId} className="space-y-1 border px-2 py-1" data-testid="row-assistant-queued">
            {editing?.queueId === q.queueId ? (
              <>
                <textarea className="w-full resize-none border bg-background px-2 py-1 text-sm" rows={2} value={editing.text} aria-label="Edit the waiting message"
                  onChange={e => setEditing({ queueId: q.queueId, text: e.target.value })} data-testid="input-assistant-queued" />
                <div className="flex gap-2">
                  <button type="button" className={TONES.secondary + " px-2 py-1 text-xs"} onClick={() => void save()} data-testid="button-assistant-queued-save">Save</button>
                  <button type="button" className={TONES.quiet + " text-xs"} onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm">{q.text}</p>
                <button type="button" className={TONES.quiet + " text-xs"} aria-disabled={!edit.available || undefined} title={edit.reason}
                  onClick={() => edit.available && setEditing({ queueId: q.queueId, text: q.text })} data-testid="button-assistant-queued-edit">Edit</button>
                <AffordanceButton id="assistant.removeQueued" args={{ queueId: q.queueId }} label="Remove" tone="quiet" className="text-xs" testId="button-assistant-queued-remove" />
              </div>
            )}
          </li>
        ))}
      </ul>
      {!busy && <AffordanceButton id="assistant.sendQueued" label="Send now" busyLabel="Sending…" tone="secondary" className="px-2 py-1 text-xs" testId="button-assistant-send-queued" />}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}

function Composer({ status, threadId, fresh, onSent }: { status: Status; threadId: string | null; fresh: boolean; onSent: (threadId: string) => void }) {
  const send = useAffordance("assistant.send");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = isBusy(status.turn?.status);
  const allowance = allowanceWords(status.allowance);
  const reason = !send.available ? send.reason ?? "Not available now." : allowance.out ? "This game's assistant allowance is used up." : null;
  const go = async () => {
    const t = text.trim();
    if (!t || sending || reason) return;
    setSending(true); setError(null);
    try {
      // Typing and pressing Send is the confirmation; the allowance is in the settings and warned about when low.
      const r = await send.run({ text: t, ...(fresh ? { newThread: true } : threadId ? { threadId } : {}) });
      setText("");
      onSent(r.threadId);
    } catch (e) { setError(failureText(e)); }
    finally { setSending(false); }
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void go(); }
  };
  return (
    <div className="space-y-1 border-t px-3 py-2">
      <div className="flex items-end gap-2">
        <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={onKey} rows={2} maxLength={4000}
          placeholder={busy ? "Ask something else: it reads it next" : "Ask your assistant"} aria-label="Message to your assistant"
          className="min-w-0 flex-1 resize-none border bg-background px-2 py-1.5 text-sm" data-testid="input-assistant" />
        <div className="flex shrink-0 flex-col gap-1">
          <button type="button" className={`${TONES.primary} px-3 py-1.5 ${!text.trim() || sending || reason ? "opacity-50" : ""}`} aria-disabled={!text.trim() || sending || !!reason || undefined}
            title={reason ?? (busy ? "It reads this when it finishes what it is doing." : "Send (Enter). Shift+Enter starts a new line.")} onClick={() => void go()} data-testid="button-assistant-send">
            {sending ? "Sending…" : busy ? "Queue" : "Send"}
          </button>
          {busy && <AffordanceButton id="assistant.cancel" label={status.turn?.status === "cancelling" ? "Stopping…" : "Stop"} tone="danger" className="px-3 py-1.5" testId="button-assistant-stop" />}
        </div>
      </div>
      {reason && <p className="text-xs text-muted-foreground" data-testid="text-assistant-send-reason">{reason}</p>}
      {!reason && allowance.low && <p className="text-xs text-destructive">{allowance.text}</p>}
      {error && <p className="text-xs text-destructive" role="alert" data-testid="text-assistant-error">{error}</p>}
    </div>
  );
}

export function AssistantPane() {
  const { gameId } = useGameScope();
  const status = useAssistantStatus();
  const threads = useAssistantThreads();
  // The conversation in view: the one picked, "new" for a new one, else the latest of this game.
  const [picked, setPicked] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const known = picked === "new" || (!!picked && !!threads?.some(t => t.threadId === picked));
  const threadId = picked === "new" ? null : known ? picked : threads?.[0]?.threadId ?? null;
  if (status === undefined || threads === undefined) return null;
  if (status === null) return <p className="p-4 text-sm text-muted-foreground" data-testid="assistant-none">Join this room to have an assistant here.</p>;
  const mode = MODE_OPTIONS.find(o => o.id === status.mode)!;
  // An earlier game's page: its conversations can be read; the assistant now works in the room's current game.
  const past = !!gameId && status.gameId !== gameId;
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="assistant">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5">
        <select className="min-w-0 flex-1 truncate border bg-background px-1 py-1 text-xs" aria-label="Conversation" value={threadId ?? "new"}
          onChange={e => setPicked(e.target.value)} data-testid="select-assistant-thread">
          {threadId === null && <option value="new">{past ? "No conversations in this game" : "New conversation"}</option>}
          {threads.map(t => <option key={t.threadId} value={t.threadId}>{t.title}</option>)}
        </select>
        {!past && <button type="button" className={`${TONES.secondary} px-2 py-1 text-xs`} onClick={() => setPicked("new")} aria-disabled={threadId === null || undefined} data-testid="button-assistant-new">New conversation</button>}
        <button type="button" className={`${TONES.quiet} text-xs`} aria-expanded={showSettings} onClick={() => setShowSettings(s => !s)} data-testid="button-assistant-settings">
          {mode.label} · settings
        </button>
      </div>
      {showSettings && <Settings status={status} />}
      <Transcript threadId={threadId} latestTurn={past ? null : status.turn} />
      {past ? (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground" data-testid="text-assistant-past">This game is over. Your assistant now works in the room's current game.</p>
      ) : (
        <>
          <Queued status={status} />
          <Composer status={status} threadId={threadId} fresh={picked === "new"} onSent={id => setPicked(id)} />
        </>
      )}
    </div>
  );
}
