import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetRoomQueryKey, useRoomAction,
  type RoomState, type Settings, type RoomActionInput, type SettingsOptions, type AIFunding, type GameRecord, type GridManifest,
} from "@workspace/api-client-react";
import { Panel, Empty, ErrorLine } from "@/components/shell";
import { relevantToType } from "@/components/game-panels";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAgentOptions } from "@/hooks/use-agents";
import { errMsg, rid, fmt } from "@/lib/errors";
import { fmtDuration, fmtWhen, isoWhen, endReasonLabel, toMs } from "@/lib/time";
import { Bot, Crown, Play, Trash2, User, Check, Circle, LogOut, Trophy, ArrowRight, Eye } from "lucide-react";

type Act = Omit<RoomActionInput, "requestId">;

/** Room actions. `after` runs on success with the fresh room (e.g. to refresh a game view). */
export function useAct(roomId: string, after?: (room: RoomState) => void) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const m = useRoomAction();
  const run = (data: Act, onOk?: () => void) =>
    m.mutate({ roomId, data: { ...data, requestId: rid() } }, {
      onSuccess: (room) => { qc.setQueryData(getGetRoomQueryKey(roomId), room); after?.(room); onOk?.(); },
      onError: (e) => toast({ title: `Action "${data.action}" refused`, description: errMsg(e), variant: "destructive" }),
    });
  return { run, pending: m.isPending, variables: m.variables };
}
export type RoomAct = ReturnType<typeof useAct>;

export function Members({ room, meId, isOwner, act, minPlayers }: { room: RoomState; meId?: string; isOwner: boolean; act: RoomAct; minPlayers: number }) {
  const me = room.members.find((m) => m.id === meId);
  const ready = room.members.filter((m) => m.ready).length;
  const g = room.activeGame;
  const running = !!g;
  const seated = (id?: string) => !!g && g.roster.some((r) => r.id === id);
  const canStart = room.members.length >= minPlayers;
  const agents = useAgentOptions(isOwner);
  const [agentId, setAgentId] = useState("");
  const list = agents.data?.agents ?? [];
  const chosen = list.some((a) => a.id === agentId) ? agentId : list[0]?.id ?? "";
  const leaveBlocked = !me || isOwner || seated(meId);
  return (
    <Panel title="Members" meta={`${ready}/${room.members.length} ready`}>
      {room.members.length === 0 ? <Empty title="No seats taken" body="Join to claim the first seat." /> : (
        <ul className="divide-y">
          {room.members.map((m) => (
            <li key={m.id} className="px-4 py-2 flex items-center gap-3" data-testid={`row-member-${m.id}`}>
              {m.kind === "ai" ? <Bot className="h-4 w-4 text-accent" /> : <User className="h-4 w-4 text-primary" />}
              <span className="flex-1 min-w-0">
                <span className="truncate block text-sm">{m.name}{m.id === meId && <span className="label-mono ml-2">you</span>}{m.id === room.ownerId && <Crown className="inline h-3 w-3 ml-1.5 text-accent" />}</span>
                {running ? <span className="label-mono" data-testid={`text-member-seat-${m.id}`}>{seated(m.id) ? "in game" : "spectating · plays next game"}</span>
                  : m.status && <span className="label-mono">{m.status}</span>}
              </span>
              <span className={`label-mono inline-flex items-center gap-1 ${m.ready ? "!text-primary" : ""}`}>{m.ready ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />}{m.ready ? "ready" : "waiting"}</span>
              {isOwner && m.kind === "ai" && (
                <button onClick={() => act.run({ action: "removeAi", deityId: m.id })} disabled={act.pending || running} className="text-muted-foreground hover:text-destructive disabled:opacity-40" title={running ? "Seats are frozen while a game is running" : "Remove AI seat"} data-testid={`button-remove-ai-${m.id}`}><Trash2 className="h-4 w-4" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="border-t p-3 grid gap-2">
        {!me ? (<>
          <button onClick={() => act.run({ action: "join" })} disabled={act.pending} className="bg-primary text-primary-foreground py-2 text-sm disabled:opacity-50" data-testid="button-join">Join this room</button>
          {running && <p className="label-mono text-center">a game is running: you will spectate it and play the next one</p>}
        </>) : (
          <div className="flex gap-2">
            <button onClick={() => act.run({ action: "ready", ready: !me.ready })} disabled={act.pending} className={`flex-1 py-2 text-sm border ${me.ready ? "" : "bg-foreground text-background"}`} data-testid="button-ready">{me.ready ? "Stand down (unready)" : "Declare ready"}</button>
            {!isOwner && (
              <button onClick={() => act.run({ action: "leave" })} disabled={act.pending || leaveBlocked} title={seated(meId) ? "You are seated in the running game; leave after it ends" : "Leave this room"} className="border px-3 py-2 text-sm inline-flex items-center gap-2 hover:bg-muted disabled:opacity-40" data-testid="button-leave"><LogOut className="h-4 w-4" /> Leave</button>
            )}
          </div>
        )}
        {me && !isOwner && seated(meId) && <p className="label-mono text-center">you can leave once the running game ends</p>}
        <a href={`/player/?room=${encodeURIComponent(room.shortCode)}`} target="_blank" rel="noreferrer" className="border py-2 text-sm inline-flex items-center justify-center gap-2 hover:bg-muted" data-testid="link-player"><User className="h-4 w-4" /> Open player client</a>
        {isOwner && (<>
          <div className="flex gap-2">
            <select value={chosen} onChange={(e) => setAgentId(e.target.value)} disabled={!list.length || running} className="flex-1 min-w-0 border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-primary disabled:opacity-50" data-testid="select-ai-agent">
              {agents.isLoading ? <option>Loading agents…</option> : agents.isError ? <option>Agent list failed</option> : !list.length ? <option>No agents in library</option>
                : list.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.model}</option>)}
            </select>
            <button onClick={() => act.run({ action: "addAi", aiAgentId: chosen })} disabled={act.pending || !chosen || running} title={running ? "Seats are frozen while a game is running" : undefined} className="border px-3 py-2 text-sm inline-flex items-center justify-center gap-2 hover:bg-muted disabled:opacity-40" data-testid="button-add-ai"><Bot className="h-4 w-4" /> Add AI</button>
          </div>
          {agents.isError && <ErrorLine message={errMsg(agents.error)} onRetry={() => agents.refetch()} />}
          {running ? (
            <Link href={`/games/${g.shortCode}`} className="bg-accent text-accent-foreground py-2.5 text-sm inline-flex items-center justify-center gap-2" data-testid="link-running-game">Game {g.shortCode} running · open <ArrowRight className="h-4 w-4" /></Link>
          ) : (
            <button onClick={() => act.run({ action: "start" })} disabled={act.pending || !canStart} className="bg-accent text-accent-foreground py-2.5 text-sm inline-flex items-center justify-center gap-2 disabled:opacity-40" data-testid="button-start"><Play className="h-4 w-4" /> Start game</button>
          )}
          {!running && !canStart && <p className="label-mono text-center" data-testid="text-start-needs">needs {minPlayers - room.members.length} more participant{minPlayers - room.members.length === 1 ? "" : "s"} (min {minPlayers})</p>}
          {running && <p className="label-mono text-center">seats and settings are frozen until this game ends</p>}
        </>)}
      </div>
    </Panel>
  );
}

const numFields: [keyof Settings, string, number?][] = [
  ["intMin", "Int min", 1], ["intMax", "Int max", 1], ["stringMaxLength", "String max length", 1],
  ["planningSeconds", "Planning (s)"], ["halfLifeSeconds", "Game Half-life (s)"], ["startingObjectCount", "Starting objects", 1],
  ["spawnRateHz", "Spawn rate (Hz)"], ["interactionRateHz", "Interaction cap (Hz)"],
  ["interactionComputeMs", "Compute budget / interaction (ms)", 1], ["pauseSeconds", "Pause (s)"],
  ["startingEnergy", "Starting energy"], ["energyPerSecond", "Power (energy / s)"],
  ["agentEnergyPerSecond", "Agent ⚡ bits / s"], ["agentBatteryActs", "Agent battery (acts)"],
];
const optionFields: [keyof SettingsOptions, string][] = [["grammarId", "Grammar"], ["utilitySelectorId", "Utility selector"], ["complexityFunctionId", "Complexity function"]];
const typeKeys = ["intMin", "intMax", "stringMaxLength"];

export function OwnerSettings({ room, act, defaults, options, optionsFailed = false, aiFunding, grid }: { room: RoomState; act: RoomAct; defaults?: Settings; options?: SettingsOptions; optionsFailed?: boolean; aiFunding?: AIFunding; grid?: GridManifest }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [budget, setBudget] = useState(String(room.aiBudget));
  const [confirmBudget, setConfirmBudget] = useState(false);
  const baseRev = useRef(room.revision);
  const dirty = Object.keys(draft).length > 0;
  const frozen = !!room.activeGame;
  useEffect(() => { if (!dirty) baseRev.current = room.revision; }, [room.revision, dirty]);
  const sourceSettings = { ...defaults, ...room.settings };
  const val = (k: keyof Settings) => draft[k] ?? String(sourceSettings[k]);
  const visibleNumFields = numFields.filter(([key]) => relevantToType(key, val("objectType")));
  const available = (k: keyof SettingsOptions, language = val("language"), objectType = val("objectType")) =>
    (options?.[k] ?? []).filter(o => o.languages.includes(language) && o.objectTypes.includes(objectType));
  const set = (k: keyof Settings, v: string) => setDraft((d) => {
    const next = { ...d, [k]: v };
    // Grid agents read a whole grid; Python needs more than the 5 ms default (see lib/game-runtime README).
    if (k === "objectType" && v === "Grid" && Number(next.interactionComputeMs ?? room.settings.interactionComputeMs) < 25) next.interactionComputeMs = "25";
    if (k === "language" || k === "objectType") {
      for (const [key] of optionFields) {
        const choices = available(key, next.language ?? room.settings.language, next.objectType ?? room.settings.objectType);
        if (!choices.some(o => o.id === (next[key] ?? room.settings[key]))) next[key] = choices[0]?.id ?? "";
      }
    }
    return next;
  });
  const build = (): Settings => {
    const s = { ...sourceSettings } as Record<string, unknown>;
    for (const [k, v] of Object.entries(draft)) {
      // Hidden type drafts are retained for switching back, but never submitted.
      if (!relevantToType(k, val("objectType"))) continue;
      s[k] = numFields.some(([n]) => n === k) || k === "gridSize" ? Number(v) : v;
    }
    return s as unknown as Settings;
  };
  const invalid = visibleNumFields.some(([k]) => draft[k] !== undefined && (draft[k] === "" || !Number.isFinite(Number(draft[k])))) ||
    Number(val("interactionRateHz")) < 0 || Number(val("interactionRateHz")) > 1000 ||
    !Number.isInteger(Number(val("interactionComputeMs"))) ||
    Number(val("interactionComputeMs")) < 1 || Number(val("interactionComputeMs")) > 1000 ||
    optionFields.some(([k]) => !available(k).some(o => o.id === val(k)));
  const conflict = dirty && baseRev.current !== room.revision;
  const b = Number(budget);
  const budgetOk = budget.trim() !== "" && Number.isInteger(b) && b >= 0 && b <= 1000000;
  const field = "w-full border bg-background px-2 py-1.5 font-mono text-sm outline-none focus:border-primary";
  return (
    <Panel title="Settings for the next game" meta={conflict ? "changed by another edit" : dirty ? "unsaved" : `rev ${room.revision}`}>
      {frozen ? <p className="px-4 pt-3 text-xs text-accent" data-testid="text-settings-frozen">Settings are frozen while game {room.activeGame?.shortCode} runs. Edit them for the next game once it ends.</p>
        : <p className="px-4 pt-3 text-xs text-muted-foreground">Each game keeps a snapshot of these settings from the moment you start it.</p>}
      <fieldset disabled={frozen} className="min-w-0">
      <div className="p-4 grid grid-cols-2 gap-3">
        <label className="space-y-1 col-span-2"><span className="label-mono">Language</span>
          <select value={val("language")} onChange={(e) => set("language", e.target.value)} className={field} data-testid="select-language"><option value="python">python</option><option value="typescript">typescript</option></select></label>
        <label className="space-y-1 col-span-2"><span className="label-mono">Object type</span>
          <select value={val("objectType")} onChange={(e) => set("objectType", e.target.value)} className={field} data-testid="select-objectType"><option value="Int">Int</option><option value="string">string</option>{grid && <option value="Grid">🟥 Grid: a square of coloured symbols</option>}</select></label>
        {val("objectType") === "Grid" && grid && (() => {
          const key = `Grid(${val("gridSize")},${val("gridSymbols")},${val("gridColours")})`;
          const chosen = grid.types.find(t => t.key === key);
          return (
            <div className="col-span-2 space-y-2 border-l-2 border-primary/25 pl-3" data-testid="grid-parameters">
              <label className="space-y-1 block"><span className="label-mono">Grid</span>
                <select value={chosen ? key : ""} onChange={(e) => { const t = grid.types.find(x => x.key === e.target.value); if (t) setDraft(d => ({ ...d, gridSize: String(t.size), gridSymbols: t.symbols, gridColours: t.colours })); }} className={field} data-testid="select-gridType">
                  {!chosen && <option value="" disabled>Pick a grid</option>}
                  {grid.types.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select></label>
              {chosen && <p className="text-xs text-muted-foreground" data-testid="text-grid-badges">{chosen.familyCount} utility functions can be dealt. {chosen.badges.map(b => <span key={b.id} title={b.kid} className="mr-2 whitespace-nowrap">{b.emoji} {b.label}</span>)}</p>}
            </div>
          );
        })()}
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
              {!available(k).some(o => o.id === val(k)) && <option value="" disabled>{options ? "Select a supported option" : optionsFailed ? "Options unavailable — retry above" : "Loading options…"}</option>}
              {available(k).map(o => <option key={o.id} value={o.id}>{o.label} ({o.id})</option>)}
            </select></label>
        ))}
        {numFields.filter(([k]) => !typeKeys.includes(k) && relevantToType(k, val("objectType"))).map(([k, l, step]) => (
          <label key={k} className="space-y-1"><span className="label-mono">{l}</span>
            <input type="number" step={step ?? "any"} min={k === "interactionComputeMs" ? 1 : k === "interactionRateHz" ? 0 : undefined} max={k === "interactionComputeMs" || k === "interactionRateHz" ? 1000 : undefined} value={val(k)} onChange={(e) => set(k, e.target.value)} className={field} data-testid={`input-${k}`} /></label>
        ))}
      </div>
      <p className="px-4 pb-3 text-xs text-muted-foreground">Compute budget: 1–1000 ms of guest CPU per interaction (default 5 ms), not compilation or worker startup. Interaction cap: 0–1000 Hz (default 100 Hz), a ceiling, not guaranteed throughput.</p>
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
          <span className="font-mono text-xs" data-testid="text-ai-usage">{fmt((room.aiInputTokens ?? 0) + (room.aiOutputTokens ?? 0))} / {fmt(room.aiBudget)} used</span>
        </div>
        <div className="h-1.5 bg-muted overflow-hidden"><div className="h-full bg-accent origin-left transition-transform" style={{ transform: `scaleX(${room.aiBudget ? Math.min(1, ((room.aiInputTokens ?? 0) + (room.aiOutputTokens ?? 0)) / room.aiBudget) : 0})` }} /></div>
        <p className="text-xs text-muted-foreground">Provider-reported: {fmt(room.aiInputTokens ?? 0)} input + {fmt(room.aiOutputTokens ?? 0)} output tokens recorded.</p>
        {room.aiUsed > (room.aiInputTokens ?? 0) + (room.aiOutputTokens ?? 0) && <p className="text-xs text-muted-foreground">{fmt(room.aiUsed - (room.aiInputTokens ?? 0) - (room.aiOutputTokens ?? 0))} tokens held separately for pending calls or calls without recorded usage (including older calls). This is not confirmed consumption.</p>}
        <div className="flex gap-2">
          <input type="number" min={0} max={1000000} step={1} value={budget} onChange={(e) => { setBudget(e.target.value); setConfirmBudget(false); }} className={field} data-testid="input-ai-budget" />
        </div>
        {!budgetOk && <p role="alert" className="text-xs text-accent">Enter a whole number from 0 to 1,000,000 tokens.</p>}
        <p className="text-xs text-muted-foreground">Per-game allowance shared by all AI seats; resets when a new game starts. Usage above counts only provider-reported tokens recorded since usage tracking was enabled. Pending and unconfirmed reservations also reduce available allowance. Separate dollar safety limits still apply.</p>
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={confirmBudget} onChange={(e) => setConfirmBudget(e.target.checked)} className="mt-0.5 accent-[hsl(var(--primary))]" data-testid="checkbox-approve-budget" />
          I approve AI seats in this room using up to {budgetOk ? fmt(b) : "?"} tokens, billed directly to the server owner's provider accounts (e.g. Anthropic, OpenAI)—not Replit credits.
        </label>
        <button disabled={!budgetOk || !confirmBudget || act.pending} onClick={() => act.run({ action: "settings", revision: room.revision, settings: sourceSettings, aiBudget: b }, () => setConfirmBudget(false))} className="w-full border py-2 text-sm hover:bg-muted disabled:opacity-40" data-testid="button-save-budget">Approve and save budget</button>
      </div>
      </fieldset>
    </Panel>
  );
}

function HistoryRow({ g }: { g: GameRecord }) {
  const top = [...g.leaderboard].sort((a, b) => a.rank - b.rank);
  const s = g.settings;
  return (
    <li className="px-4 py-3 space-y-2" data-testid={`row-game-${g.id}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href={`/games/${g.shortCode}`} className="font-mono font-semibold border px-2 py-0.5 hover:bg-muted inline-flex items-center gap-1.5" data-testid={`link-game-${g.shortCode}`}>{g.shortCode}<Eye className="h-3 w-3" /></Link>
        <span className="text-sm" title={isoWhen(g.startedAt)}>{fmtWhen(g.startedAt)}</span>
        {g.endedAt !== null && <span className="label-mono">{fmtDuration(toMs(g.endedAt) - toMs(g.startedAt))}</span>}
        <span className="label-mono">{endReasonLabel(g.endReason)}</span>
      </div>
      <div className="text-sm flex items-start gap-2" data-testid={`text-game-winners-${g.id}`}>
        <Trophy className="h-4 w-4 text-accent shrink-0 mt-0.5" />
        <span>{g.winners.length ? g.winners.map((w) => w.name).join(", ") : "no winner recorded"}{g.winners.length > 1 && <span className="label-mono ml-2">tie</span>}</span>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer label-mono">final leaderboard · {g.roster.length} gods · {s.language} / {s.objectType} · {fmt(g.worldSeconds, 1)}s world · {g.objectCount} objects · {g.agentCount} agents</summary>
        <ol className="mt-2 space-y-0.5">
          {top.map((r) => <li key={r.deityId} className="flex gap-2 font-mono"><span className="w-6 text-muted-foreground">{r.rank}</span><span className="flex-1 truncate">{r.name} <span className="text-muted-foreground">{r.kind}</span></span><span className="tabular-nums">{fmt(r.totalScore, 2)}</span></li>)}
          {top.length === 0 && <li className="text-muted-foreground">No standings were recorded.</li>}
        </ol>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
          {Object.entries(s).filter(([k]) => relevantToType(k, s.objectType)).map(([k, v]) => (<div key={k} className="contents"><dt className="text-muted-foreground font-mono truncate">{k}</dt><dd className="font-mono text-right truncate">{String(v)}</dd></div>))}
        </dl>
      </details>
    </li>
  );
}

export function History({ games, loading, error, onRetry }: { games?: GameRecord[]; loading: boolean; error: unknown; onRetry: () => void }) {
  return (
    <Panel title="Game history" meta={games ? `${games.length} played` : undefined}>
      {loading && <div className="p-4 space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>}
      {!!error && <div className="p-4"><ErrorLine message={errMsg(error)} onRetry={onRetry} /></div>}
      {games && games.length === 0 && <Empty title="No games played yet" body="Finished games, their winners and final leaderboards appear here." />}
      {games && games.length > 0 && <ul className="divide-y max-h-[560px] overflow-auto">{games.map((g) => <HistoryRow key={g.id} g={g} />)}</ul>}
    </Panel>
  );
}
