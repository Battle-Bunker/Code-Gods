import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetRoom, getGetRoomQueryKey, useGetManifest, useRoomAction,
  type RoomState, type Settings, type RoomActionInput, type SettingsOptions, type AIFunding,
} from "@workspace/api-client-react";
import { Shell, Panel, Empty, ErrorLine } from "@/components/shell";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { errMsg, rid, fmt } from "@/lib/errors";
import { useAgentOptions } from "@/hooks/use-agents";
import { Bot, Copy, Crown, Play, RotateCcw, Send, Trash2, User, Check, Circle } from "lucide-react";

type Act = Omit<RoomActionInput, "requestId">;

function useAct(roomId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const m = useRoomAction();
  const run = (data: Act, onOk?: () => void) =>
    m.mutate({ roomId, data: { ...data, requestId: rid() } }, {
      onSuccess: (room) => { qc.setQueryData(getGetRoomQueryKey(roomId), room); onOk?.(); },
      onError: (e) => toast({ title: `Action "${data.action}" refused`, description: errMsg(e), variant: "destructive" }),
    });
  return { run, pending: m.isPending, variables: m.variables };
}

function secsLeft(target: number, now: number) {
  if (!target) return null;
  const ms = now > 1e11 ? target - now : (target - now) * 1000;
  return Math.max(0, ms / 1000);
}

function Conn({ ok, updatedAt, fetching }: { ok: boolean; updatedAt: number; fetching: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const age = updatedAt ? Math.round((Date.now() - updatedAt) / 1000) : null;
  const stale = age !== null && age > 4;
  return (
    <span className="flex items-center gap-2 label-mono" data-testid="status-connection">
      <span className={`h-2 w-2 rounded-full ${!ok ? "bg-destructive" : stale ? "bg-accent" : "bg-primary"} ${fetching ? "pulse-dot" : ""}`} />
      {!ok ? "poll failing" : stale ? `stale ${age}s` : "live / 1s poll"}
    </span>
  );
}

function Header({ room, isOwner }: { room: RoomState; isOwner: boolean }) {
  const { toast } = useToast();
  const g = room.game;
  const plan = g ? secsLeft(g.planningEndsAt, room.serverTime) : null;
  const pause = g ? secsLeft(g.pauseEndsAt, room.serverTime) : null;
  const copy = () => { navigator.clipboard.writeText(window.location.href).then(() => toast({ title: "Room link copied" })); };
  return (
    <div className="border-b bg-card/70">
      <div className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 grid md:grid-cols-[1fr_auto] gap-6 items-end">
        <div className="rise">
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={copy} className="font-mono text-sm border px-2 py-0.5 inline-flex items-center gap-1.5 hover:bg-muted" data-testid="button-copy-link">{room.shortCode}<Copy className="h-3 w-3" /></button>
            {isOwner && <span className="label-mono inline-flex items-center gap-1 !text-accent"><Crown className="h-3 w-3" /> owner</span>}
            <span className="label-mono">rev {room.revision}</span>
          </div>
          <h1 className="font-display text-5xl md:text-7xl leading-none mt-3" data-testid="text-room-code">{room.shortCode}</h1>
        </div>
        <div className="grid grid-cols-3 gap-px bg-border border font-mono">
          {[
            ["phase", g?.phase ?? "lobby"],
            ["world t", g ? `${fmt(g.worldSeconds, 1)}s` : "—"],
            [pause && pause > 0 ? "pause" : "planning", pause && pause > 0 ? `${fmt(pause, 0)}s` : plan !== null && plan > 0 ? `${fmt(plan, 0)}s` : "—"],
          ].map(([k, v]) => (
            <div key={k} className="bg-card px-4 py-2 min-w-[100px]">
              <div className="label-mono">{k}</div>
              <div className="text-lg tabular-nums" data-testid={`text-${k.replace(" ", "-")}`}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Leaderboard({ room }: { room: RoomState }) {
  const rows = room.game?.leaderboard ?? [];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.totalScore)));
  return (
    <Panel title="Leaderboard" meta={room.game ? `${room.game.agentCount} agents` : undefined}>
      {rows.length === 0 ? <Empty title="No standings yet" body="Scores appear once the owner starts a game and the world begins to run." /> : (
        <ol className="divide-y">
          {[...rows].sort((a, b) => a.rank - b.rank).map((s) => (
            <li key={s.deityId} className="relative px-4 py-2.5 flex items-center gap-3" data-testid={`row-standing-${s.deityId}`}>
              <div className="absolute inset-y-0 left-0 bg-primary/10 transition-transform duration-700 origin-left w-full" style={{ transform: `scaleX(${Math.abs(s.totalScore) / max})` }} />
              <span className={`relative font-display text-3xl w-8 ${s.rank === 1 ? "text-accent" : "text-muted-foreground"}`}>{s.rank}</span>
              <span className="relative flex-1 min-w-0">
                <span className="block truncate font-medium">{s.name}</span>
                <span className="label-mono">{s.kind}</span>
              </span>
              <span className="relative font-mono tabular-nums text-lg">{fmt(s.totalScore, 2)}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function Objects({ room }: { room: RoomState }) {
  const objs = useMemo(() => [...(room.game?.objects ?? [])].sort((a, b) => b.totalValueSum - a.totalValueSum), [room.game?.objects]);
  const max = Math.max(1, ...objs.map((o) => Math.abs(o.totalValueSum)));
  return (
    <Panel title="Objects / ranked by total value" meta={`${objs.length} live`}>
      {objs.length === 0 ? <Empty title="The universe is empty" body="Objects spawn when a game is running. Nothing is invented here." /> : (
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card"><tr className="label-mono text-left">
              <th className="px-4 py-2 font-normal">#</th><th className="py-2 font-normal">object</th><th className="py-2 font-normal">value</th><th className="py-2 font-normal text-right">ver</th><th className="px-4 py-2 font-normal text-right">Σ value</th>
            </tr></thead>
            <tbody>
              {objs.map((o, i) => (
                <tr key={o.id} className="border-t hover:bg-muted/50" data-testid={`row-object-${o.id}`}>
                  <td className="px-4 py-1.5 font-mono text-muted-foreground">{i + 1}</td>
                  <td className="py-1.5 font-mono text-xs truncate max-w-[120px]">{o.id}</td>
                  <td className="py-1.5 font-mono truncate max-w-[220px]">{typeof o.value === "string" ? JSON.stringify(o.value) : o.value}</td>
                  <td className="py-1.5 font-mono text-right text-muted-foreground">v{o.version}</td>
                  <td className="px-4 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-muted overflow-hidden"><div className="h-full bg-accent origin-left transition-transform duration-700" style={{ transform: `scaleX(${Math.abs(o.totalValueSum) / max})` }} /></div>
                      <span className="font-mono tabular-nums w-20">{fmt(o.totalValueSum, 2)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function Chat({ room, canPost, act }: { room: RoomState; canPost: boolean; act: ReturnType<typeof useAct> }) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const n = room.chat.length;
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [n]);
  return (
    <Panel title="Public channel" meta={`${n} msgs`}>
      <div className="h-[340px] overflow-auto px-4 py-2 space-y-2">
        {n === 0 && <Empty title="Silence in the pantheon" body="No one has spoken. Treaties start with a first message." />}
        {room.chat.map((c) => (
          <div key={c.id} className={c.kind === "system" ? "label-mono py-1" : "text-sm"} data-testid={`row-chat-${c.id}`}>
            {c.kind === "system" ? <span>{c.text}</span> : (<>
              <span className="font-medium">{c.authorName}</span>
              <span className="label-mono ml-2">{new Date(c.timestamp > 1e11 ? c.timestamp : c.timestamp * 1000).toLocaleTimeString()}</span>
              <p className="whitespace-pre-wrap break-words text-foreground/90">{c.text}</p>
            </>)}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="border-t flex" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (t) act.run({ action: "chat", text: t.slice(0, 4000) }, () => setText("")); }}>
        <input disabled={!canPost} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder={canPost ? "Speak to all deities" : "Join the room to speak"} className="flex-1 bg-transparent px-4 py-3 text-sm outline-none disabled:opacity-50" data-testid="input-chat" />
        <button disabled={!canPost || !text.trim() || act.pending} className="px-4 border-l text-primary disabled:opacity-40" data-testid="button-send-chat"><Send className="h-4 w-4" /></button>
      </form>
    </Panel>
  );
}

function Members({ room, meId, isOwner, act, minPlayers }: { room: RoomState; meId?: string; isOwner: boolean; act: ReturnType<typeof useAct>; minPlayers: number }) {
  const me = room.members.find((m) => m.id === meId);
  const ready = room.members.filter((m) => m.ready).length;
  const canStart = room.members.length >= minPlayers;
  const agents = useAgentOptions(isOwner);
  const [agentId, setAgentId] = useState("");
  const list = agents.data?.agents ?? [];
  const chosen = list.some((a) => a.id === agentId) ? agentId : list[0]?.id ?? "";
  const running = !!room.game && !/end|finish|over/i.test(room.game.phase);
  return (
    <Panel title="Deities" meta={`${ready}/${room.members.length} ready`}>
      {room.members.length === 0 ? <Empty title="No seats taken" body="Join to claim the first seat." /> : (
        <ul className="divide-y">
          {room.members.map((m) => (
            <li key={m.id} className="px-4 py-2 flex items-center gap-3" data-testid={`row-member-${m.id}`}>
              {m.kind === "ai" ? <Bot className="h-4 w-4 text-accent" /> : <User className="h-4 w-4 text-primary" />}
              <span className="flex-1 min-w-0">
                <span className="truncate block text-sm">{m.name}{m.id === meId && <span className="label-mono ml-2">you</span>}{m.id === room.ownerId && <Crown className="inline h-3 w-3 ml-1.5 text-accent" />}</span>
                {m.status && <span className="label-mono">{m.status}</span>}
              </span>
              <span className={`label-mono inline-flex items-center gap-1 ${m.ready ? "!text-primary" : ""}`}>{m.ready ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />}{m.ready ? "ready" : "waiting"}</span>
              {isOwner && m.kind === "ai" && (
                <button onClick={() => act.run({ action: "removeAi", deityId: m.id })} disabled={act.pending} className="text-muted-foreground hover:text-destructive" title="Remove AI seat" data-testid={`button-remove-ai-${m.id}`}><Trash2 className="h-4 w-4" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="border-t p-3 grid gap-2">
        {!me ? (
          <button onClick={() => act.run({ action: "join" })} disabled={act.pending} className="bg-primary text-primary-foreground py-2 text-sm disabled:opacity-50" data-testid="button-join">Join this room</button>
        ) : (
          <button onClick={() => act.run({ action: "ready", ready: !me.ready })} disabled={act.pending} className={`py-2 text-sm border ${me.ready ? "" : "bg-foreground text-background"}`} data-testid="button-ready">{me.ready ? "Stand down (unready)" : "Declare ready"}</button>
        )}
        <a href={`/player/?room=${encodeURIComponent(room.id)}`} target="_blank" rel="noreferrer" className="border py-2 text-sm inline-flex items-center justify-center gap-2 hover:bg-muted" data-testid="link-player"><User className="h-4 w-4" /> Open player client</a>
        {isOwner && (<>
          <div className="flex gap-2">
            <select value={chosen} onChange={(e) => setAgentId(e.target.value)} disabled={!list.length} className="flex-1 min-w-0 border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-primary" data-testid="select-ai-agent">
              {agents.isLoading ? <option>Loading agents…</option> : agents.isError ? <option>Agent list failed</option> : !list.length ? <option>No agents in library</option>
                : list.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.model}</option>)}
            </select>
            <button onClick={() => act.run({ action: "addAi", aiAgentId: chosen })} disabled={act.pending || !chosen} className="border px-3 py-2 text-sm inline-flex items-center justify-center gap-2 hover:bg-muted disabled:opacity-40" data-testid="button-add-ai"><Bot className="h-4 w-4" /> Add AI</button>
          </div>
          {agents.isError && <ErrorLine message={errMsg(agents.error)} onRetry={() => agents.refetch()} />}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => act.run({ action: "start" })} disabled={act.pending || !canStart || running} className="bg-accent text-accent-foreground py-2 text-sm inline-flex items-center justify-center gap-2 disabled:opacity-40" data-testid="button-start"><Play className="h-4 w-4" /> Start</button>
            <button onClick={() => act.run({ action: "resume" })} disabled={act.pending} className="border py-2 text-sm inline-flex items-center justify-center gap-2 hover:bg-muted" title="Recover and resume an interrupted game" data-testid="button-resume"><RotateCcw className="h-4 w-4" /> Resume</button>
          </div>
          {!canStart && <p className="label-mono text-center">needs {minPlayers - room.members.length} more participant{minPlayers - room.members.length === 1 ? "" : "s"} (min {minPlayers})</p>}
        </>)}
      </div>
    </Panel>
  );
}

const numFields: [keyof Settings, string, number?][] = [
  ["intMin", "Int min", 1], ["intMax", "Int max", 1], ["stringMaxLength", "String max length", 1],
  ["planningSeconds", "Planning (s)"], ["halfLifeSeconds", "Game Half-life (s)"], ["startingObjectCount", "Starting objects", 1],
  ["spawnRateHz", "Spawn rate (Hz)"], ["interactionRateHz", "Interaction rate (Hz)"], ["pauseSeconds", "Pause (s)"],
  ["startingEnergy", "Starting energy"], ["energyPerSecond", "Power (energy / s)"],
];
const optionFields: [keyof SettingsOptions, string][] = [["grammarId", "Grammar"], ["valueGeneratorId", "Value generator"], ["complexityFunctionId", "Complexity function"]];
const typeKeys = ["intMin", "intMax", "stringMaxLength"];
const relevantToType = (key: string, type: string) =>
  type === "Int" ? key !== "stringMaxLength" : key !== "intMin" && key !== "intMax";

function OwnerSettings({ room, act, defaults, options, aiFunding }: { room: RoomState; act: ReturnType<typeof useAct>; defaults?: Settings; options?: SettingsOptions; aiFunding?: AIFunding }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [budget, setBudget] = useState(String(room.aiBudget));
  const [confirmBudget, setConfirmBudget] = useState(false);
  const baseRev = useRef(room.revision);
  const dirty = Object.keys(draft).length > 0;
  useEffect(() => { if (!dirty) baseRev.current = room.revision; }, [room.revision, dirty]);
  const val = (k: keyof Settings) => draft[k] ?? String(room.settings[k]);
  const visibleNumFields = numFields.filter(([key]) => relevantToType(key, val("objectType")));
  const available = (k: keyof SettingsOptions, language = val("language"), objectType = val("objectType")) =>
    (options?.[k] ?? []).filter(o => o.languages.includes(language) && o.objectTypes.includes(objectType));
  const set = (k: keyof Settings, v: string) => setDraft((d) => {
    const next = { ...d, [k]: v };
    if (k === "language" || k === "objectType") {
      for (const [key] of optionFields) {
        const choices = available(key, next.language ?? room.settings.language, next.objectType ?? room.settings.objectType);
        if (!choices.some(o => o.id === (next[key] ?? room.settings[key]))) next[key] = choices[0]?.id ?? "";
      }
    }
    return next;
  });
  const build = (): Settings => {
    const s = { ...room.settings } as Record<string, unknown>;
    for (const [k, v] of Object.entries(draft)) {
      // Hidden type drafts are retained for switching back, but never submitted.
      if (!relevantToType(k, val("objectType"))) continue;
      s[k] = numFields.some(([n]) => n === k) ? Number(v) : v;
    }
    return s as unknown as Settings;
  };
  const invalid = visibleNumFields.some(([k]) => draft[k] !== undefined && (draft[k] === "" || !Number.isFinite(Number(draft[k])))) ||
    optionFields.some(([k]) => !available(k).some(o => o.id === val(k)));
  const conflict = dirty && baseRev.current !== room.revision;
  const b = Number(budget);
  const budgetOk = Number.isInteger(b) && b >= 0 && b <= 500000;
  const field = "w-full border bg-background px-2 py-1.5 font-mono text-sm outline-none focus:border-primary";
  return (
    <Panel title="Owner / world settings" meta={conflict ? "changed by another edit" : dirty ? "unsaved" : `rev ${room.revision}`}>
      <div className="p-4 grid grid-cols-2 gap-3">
        <label className="space-y-1 col-span-2"><span className="label-mono">Language</span>
          <select value={val("language")} onChange={(e) => set("language", e.target.value)} className={field} data-testid="select-language"><option value="python">python</option><option value="typescript">typescript</option></select></label>
        <label className="space-y-1 col-span-2"><span className="label-mono">Object type</span>
          <select value={val("objectType")} onChange={(e) => set("objectType", e.target.value)} className={field} data-testid="select-objectType"><option value="Int">Int</option><option value="string">string</option></select></label>
        <div className="col-span-2 grid grid-cols-2 gap-3 border-l-2 border-primary/25 pl-3" data-testid="type-parameters">
          {visibleNumFields.filter(([k]) => typeKeys.includes(k)).map(([k, label, step]) => (
            <label key={k} className={`space-y-1 ${val("objectType") === "string" ? "col-span-2" : ""}`}>
              <span className="label-mono">{label}</span>
              <input type="number" step={step} value={val(k)} onChange={(e) => set(k, e.target.value)} className={field} data-testid={`input-${k}`} />
            </label>
          ))}
        </div>
        <label className="space-y-1 col-span-2"><span className="label-mono">Spawn function</span>
          <select value={val("spawnFunctionId")} onChange={(e) => set("spawnFunctionId", e.target.value)} className={field} data-testid="select-spawnFunctionId"><option value="uniform">uniform</option></select></label>
        {optionFields.map(([k, l]) => (
          <label key={k} className="space-y-1 col-span-2"><span className="label-mono">{l}</span>
            <select value={available(k).some(o => o.id === val(k)) ? val(k) : ""} disabled={!options} onChange={(e) => set(k, e.target.value)} className={field} data-testid={`select-${k}`}>
              {!available(k).some(o => o.id === val(k)) && <option value="" disabled>{options ? "Select a supported option" : "Loading options…"}</option>}
              {available(k).map(o => <option key={o.id} value={o.id}>{o.label} ({o.id})</option>)}
            </select></label>
        ))}
        {numFields.filter(([k]) => !typeKeys.includes(k)).map(([k, l, step]) => (
          <label key={k} className="space-y-1"><span className="label-mono">{l}</span>
            <input type="number" step={step ?? "any"} value={val(k)} onChange={(e) => set(k, e.target.value)} className={field} data-testid={`input-${k}`} /></label>
        ))}
      </div>
      <div className="border-t p-3 flex flex-wrap gap-2">
        <button disabled={!dirty || invalid || act.pending} onClick={() => act.run({ action: "settings", revision: baseRev.current, settings: build() }, () => setDraft({}))} className="flex-1 bg-primary text-primary-foreground py-2 text-sm disabled:opacity-40" data-testid="button-save-settings">Save settings</button>
        <button disabled={!dirty} onClick={() => setDraft({})} className="border px-3 py-2 text-sm disabled:opacity-40" data-testid="button-discard-settings">Discard</button>
        <button disabled={!defaults} onClick={() => defaults && setDraft(Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, String(v)])))} className="border px-3 py-2 text-sm disabled:opacity-40" data-testid="button-load-defaults">Load defaults</button>
      </div>
      {conflict && <p className="px-4 pb-3 text-xs text-accent">The room revision moved to {room.revision} since you began editing. Saving submits revision {baseRev.current}; the server may reject it. Discard to reload.</p>}
      <div className="border-t p-4 space-y-3">
        <div className="text-xs space-y-1" data-testid="ai-funding-status">
          <p className="font-medium">AI billing: direct provider APIs (per-agent model)</p>
          <p className="text-muted-foreground">Each AI seat uses its library agent's provider and model. Credentials and per-model rates are listed in the AI library.</p>
          {aiFunding && !aiFunding.live && <p className="text-accent">AI game control is not active yet. No inference is running.</p>}
        </div>
        <div className="flex items-baseline justify-between">
          <span className="label-mono !text-foreground">AI token budget</span>
          <span className="font-mono text-xs" data-testid="text-ai-usage">{fmt(room.aiUsed)} / {fmt(room.aiBudget)} used</span>
        </div>
        <div className="h-1.5 bg-muted overflow-hidden"><div className="h-full bg-accent origin-left transition-transform" style={{ transform: `scaleX(${room.aiBudget ? Math.min(1, room.aiUsed / room.aiBudget) : 0})` }} /></div>
        <div className="flex gap-2">
          <input type="number" min={0} max={500000} step={1} value={budget} onChange={(e) => { setBudget(e.target.value); setConfirmBudget(false); }} className={field} data-testid="input-ai-budget" />
        </div>
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={confirmBudget} onChange={(e) => setConfirmBudget(e.target.checked)} className="mt-0.5 accent-[hsl(var(--primary))]" data-testid="checkbox-approve-budget" />
          I approve AI seats in this room using up to {budgetOk ? fmt(b) : "?"} tokens, billed directly to the server owner's provider accounts (e.g. Anthropic, OpenAI)—not Replit credits.
        </label>
        <button disabled={!budgetOk || !confirmBudget || act.pending} onClick={() => act.run({ action: "settings", revision: room.revision, settings: room.settings, aiBudget: b }, () => setConfirmBudget(false))} className="w-full border py-2 text-sm hover:bg-muted disabled:opacity-40" data-testid="button-save-budget">Approve and save budget</button>
      </div>
    </Panel>
  );
}

function ReadOnlySettings({ room }: { room: RoomState }) {
  return (
    <Panel title="World settings" meta="owner controls">
      <dl className="p-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {Object.entries(room.settings).filter(([k]) => relevantToType(k, room.settings.objectType)).map(([k, v]) => (<div key={k} className="contents"><dt className="text-muted-foreground font-mono truncate">{k}</dt><dd className="font-mono text-right truncate">{String(v)}</dd></div>))}
      </dl>
    </Panel>
  );
}

export default function Room() {
  const { id = "" } = useParams<{ id: string }>();
  const { user, isAuthenticated, isLoading: authLoading, login } = useAuth();
  const q = useGetRoom(id, { query: { queryKey: getGetRoomQueryKey(id), enabled: !!id && isAuthenticated, refetchInterval: 1000, retry: 1 } });
  const manifest = useGetManifest();
  const act = useAct(id);
  const room = q.data;
  const isOwner = !!room && room.ownerId === user?.id;
  const isMember = !!room && room.members.some((m) => m.id === user?.id);
  const minPlayers = manifest.data?.minimumPlayers ?? 3;

  return (
    <Shell right={room && <Conn ok={!q.isError} updatedAt={q.dataUpdatedAt} fetching={q.isFetching} />}>
      {authLoading ? null : !isAuthenticated ? (
        <div className="mx-auto max-w-lg px-4 py-20 text-center rise">
          <p className="label-mono">Shared room</p>
          <h1 className="font-display text-5xl mt-2">You were summoned.</h1>
          <p className="text-muted-foreground mt-3">Log in to view this room and claim a seat.</p>
          <button onClick={login} className="mt-8 bg-foreground text-background px-5 py-3" data-testid="button-login-room">Log in</button>
        </div>
      ) : q.isLoading ? (
        <div className="mx-auto max-w-[1440px] px-6 py-8 space-y-4"><Skeleton className="h-20 w-1/2" /><div className="grid lg:grid-cols-3 gap-4"><Skeleton className="h-80" /><Skeleton className="h-80" /><Skeleton className="h-80" /></div></div>
      ) : !room ? (
        <div className="mx-auto max-w-lg px-4 py-20 space-y-4">
          <ErrorLine message={q.error ? errMsg(q.error) : "Room not found"} onRetry={() => q.refetch()} />
          <Link href="/" className="label-mono underline" data-testid="link-back">Back to rooms</Link>
        </div>
      ) : (<>
        <Header room={room} isOwner={isOwner} />
        {q.isError && <div className="mx-auto max-w-[1440px] px-4 md:px-6 pt-4"><ErrorLine message={`Showing last known state. ${errMsg(q.error)}`} onRetry={() => q.refetch()} /></div>}
        <div className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 grid gap-6 lg:grid-cols-[1fr_1.35fr_360px] items-start">
          <div className="space-y-6"><Leaderboard room={room} /><Chat room={room} canPost={isMember} act={act} /></div>
          <Objects room={room} />
          <div className="space-y-6">
            <Members room={room} meId={user?.id} isOwner={isOwner} act={act} minPlayers={minPlayers} />
            {isOwner ? <OwnerSettings room={room} act={act} defaults={manifest.data?.defaults} options={manifest.data?.options} aiFunding={manifest.data?.aiFunding} /> : <ReadOnlySettings room={room} />}
          </div>
        </div>
      </>)}
    </Shell>
  );
}
