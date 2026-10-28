import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetRoomQueryKey, useRoomAction,
  type RoomState, type Settings, type RoomActionInput, type SettingsOptions, type AIFunding, type GameRecord, type ObjectTypeInfo, type SettingsPreset,
} from "@workspace/api-client-react";
import { Panel, Empty, ErrorLine } from "@/components/shell";
import { ObjectTypePicker, RuleShelf, catalogFor, changedParams, findOffered, sameArgs, snapToOffered, withExcluded, type TypeChoice } from "@workspace/object-views";
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

type NumField = { key: keyof Settings; label: string; unit?: string; min?: number; max?: number; int?: boolean; help?: string };
const NUM_GROUPS: { title: string; fields: NumField[] }[] = [
  { title: "World", fields: [
    { key: "planningSeconds", label: "Planning", unit: "s", min: 0 },
    { key: "halfLifeSeconds", label: "Half-life", unit: "s", min: 0 },
    { key: "startingObjectCount", label: "Starting objects", min: 0, int: true },
    { key: "spawnRateHz", label: "Spawn rate", unit: "/s", min: 0 },
    { key: "interactionRateHz", label: "Interaction cap", unit: "Hz", min: 0, max: 1000, help: "Slower = easier to follow your score. A ceiling, not guaranteed throughput (default 100 Hz)." },
    { key: "interactionComputeMs", label: "Compute / interaction", unit: "ms", min: 1, max: 1000, int: true, help: "Guest CPU per interaction, not compilation or worker startup." },
    { key: "pauseSeconds", label: "Pause", unit: "s", min: 0 },
  ] },
  { title: "God energy", fields: [
    { key: "startingEnergy", label: "Starting energy", unit: "bits", min: 0, help: "Pays summon prices (an agent's description bits)." },
    { key: "energyPerSecond", label: "Income", unit: "bits/s", min: 0 },
  ] },
  { title: "Agent energy", fields: [
    { key: "agentEnergyPerSecond", label: "Agent income", unit: "bits/s", min: 0, max: 1000, help: "Each agent earns this per second of world time." },
    { key: "agentBatteryActs", label: "Agent battery", unit: "acts", min: 1, max: 1000, help: "Income stops at this many expected acts." },
    { key: "maxAgentsPerGod", label: "Agents per god", min: 1, max: 200, int: true },
  ] },
  { title: "Defence goals", fields: [
    { key: "defenceRate", label: "Defence goal rate", min: 0, max: 1, help: "Chance a god is also dealt a ⚠️ defence goal (0 = off)." },
    { key: "penaltyWeight", label: "Penalty weight", min: 0, help: "How much a ⚠️ bit weighs against a ✨ bit (default 1)." },
  ] },
];
const NUM_KEYS = NUM_GROUPS.flatMap(g => g.fields);
const optionFields: [keyof SettingsOptions, string][] = [["grammarId", "Grammar"], ["utilitySelectorId", "Utility selector"], ["complexityFunctionId", "Complexity function"]];

const badNum = (f: NumField, raw: string) => {
  const v = Number(raw);
  return raw.trim() === "" || !Number.isFinite(v) || (f.int && !Number.isInteger(v)) || (f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max);
};

export function OwnerSettings({ room, act, defaults, options, optionsFailed = false, aiFunding, objectTypes, presets = [] }: { room: RoomState; act: RoomAct; defaults?: Settings; options?: SettingsOptions; optionsFailed?: boolean; aiFunding?: AIFunding; objectTypes?: ObjectTypeInfo[]; presets?: SettingsPreset[] }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [excludedDraft, setExcludedDraft] = useState<string[] | null>(null);
  const [typeDraft, setTypeDraft] = useState<TypeChoice | null>(null);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [budget, setBudget] = useState(String(room.aiBudget));
  const [confirmBudget, setConfirmBudget] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const baseRev = useRef(room.revision);
  const dirty = Object.keys(draft).length > 0 || typeDraft !== null || excludedDraft !== null;
  const frozen = !!room.activeGame;
  useEffect(() => { if (!dirty) baseRev.current = room.revision; }, [room.revision, dirty]);
  useEffect(() => { if (!highlight.length) return; const t = setTimeout(() => setHighlight([]), 2500); return () => clearTimeout(t); }, [highlight]);
  const source: Settings = { ...defaults, ...room.settings } as Settings;
  const choice: TypeChoice = typeDraft ?? { objectType: source.objectType, typeArgs: source.typeArgs };
  const val = (k: keyof Settings) => draft[k] ?? String(source[k] ?? "");
  const available = (k: keyof SettingsOptions, language = val("language"), objectType = choice.objectType) =>
    (options?.[k] ?? []).filter(o => o.languages.includes(language) && o.objectTypes.includes(objectType));
  const fixOptions = (next: Record<string, string>, language: string, objectType: string) => {
    for (const [key] of optionFields) {
      const choices = available(key, language, objectType);
      if (!choices.some(o => o.id === (next[key] ?? String(source[key])))) next[key] = choices[0]?.id ?? "";
    }
    return next;
  };
  const set = (k: keyof Settings, v: string) => setDraft(d => {
    const next = { ...d, [k]: v };
    return k === "language" ? fixOptions(next, v, choice.objectType) : next;
  });
  const types = objectTypes ?? [];
  const pickType = (next: TypeChoice) => {
    const t = types.find(x => x.id === next.objectType);
    const offered = t ? findOffered(t, next.typeArgs) : undefined;
    const prev = choice;
    setTypeDraft(next);
    setHighlight(changedParams(prev.objectType === next.objectType ? prev.typeArgs : {}, next.typeArgs).filter(k => prev.objectType === next.objectType));
    // The server applies tuned defaults for a new type or instantiation; show them in the draft.
    const tuned = { ...(prev.objectType !== next.objectType ? t?.settingsDefaults : {}), ...offered?.settingsDefaults };
    setDraft(d => fixOptions({ ...d, ...Object.fromEntries(Object.entries(tuned).map(([k, v]) => [k, String(v)])) }, d.language ?? String(source.language), next.objectType));
  };
  const unlock = (patch: Record<string, string | number>) => {
    const t = types.find(x => x.id === choice.objectType);
    const snap = t && snapToOffered(t, choice.typeArgs, patch);
    if (!t || !snap) return;
    pickType({ objectType: t.id, typeArgs: { ...t.defaults, ...snap.args } });
    setHighlight(changedParams(choice.typeArgs, { ...t.defaults, ...snap.args }));
    pickerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  const build = (): Settings => {
    const s = { ...source, objectType: choice.objectType, typeArgs: choice.typeArgs, ...(excludedDraft ? { excludedFamilies: excludedDraft } : {}) } as Record<string, unknown>;
    for (const [k, v] of Object.entries(draft)) s[k] = NUM_KEYS.some(f => f.key === k) ? Number(v) : v;
    return s as unknown as Settings;
  };
  const currentType = types.find(t => t.id === choice.objectType);
  const offered = currentType ? findOffered(currentType, choice.typeArgs) : undefined;
  const invalid = NUM_KEYS.some(f => source[f.key] !== undefined || draft[f.key] !== undefined ? badNum(f, val(f.key)) : false) ||
    optionFields.some(([k]) => !available(k).some(o => o.id === val(k))) || (types.length > 0 && !offered);
  const conflict = dirty && baseRev.current !== room.revision;
  const savedType = typeDraft === null || (typeDraft.objectType === source.objectType && sameArgs(typeDraft.typeArgs, source.typeArgs));
  const excluded = excludedDraft ?? source.excludedFamilies ?? [];
  const shelf = useMemo(() => withExcluded(savedType ? room.utilityCatalog : catalogFor(choice.objectType, choice.typeArgs), excluded),
    [savedType, room.utilityCatalog, choice.objectType, choice.typeArgs, excluded]);
  const toggleExcluded = (id: string, out: boolean) => setExcludedDraft(() => out ? [...new Set([...excluded, id])] : excluded.filter(x => x !== id));
  const badges = useMemo(() => (currentType?.classes ?? []).map(c => c.badge), [currentType]);
  const b = Number(budget);
  const budgetOk = budget.trim() !== "" && Number.isInteger(b) && b >= 0 && b <= 1000000;
  const field = "w-full min-w-0 border bg-background px-2 py-1.5 font-mono text-sm outline-none focus:border-primary";
  const discard = () => { setDraft({}); setTypeDraft(null); setExcludedDraft(null); setHighlight([]); };
  const currentPreset = presets.find(p => p.objectType === source.objectType && sameArgs(p.typeArgs, source.typeArgs));
  return (
    <Panel title="Settings for the next game" meta={conflict ? "changed by another edit" : dirty ? "unsaved" : `rev ${room.revision}`}>
      {frozen ? <p className="px-4 pt-3 text-xs text-accent" data-testid="text-settings-frozen">Settings are frozen while game {room.activeGame?.shortCode} runs. Edit them for the next game once it ends.</p>
        : <p className="px-4 pt-3 text-xs text-muted-foreground">Each game keeps a snapshot of these settings from the moment you start it.</p>}
      <fieldset disabled={frozen} className="min-w-0">
      <div className="p-4 space-y-4">
        <label className="space-y-1 block"><span className="label-mono">Language</span>
          <select value={val("language")} onChange={(e) => set("language", e.target.value)} className={field} data-testid="select-language"><option value="python">python</option><option value="typescript">typescript</option></select></label>
        {presets.length > 0 && (
          <div className="space-y-1.5" data-testid="settings-presets">
            <span className="label-mono">Start from a preset</span>
            <div className="grid grid-cols-2 gap-1.5">
              {presets.map(p => (
                <button key={p.id} type="button" disabled={!p.offered || act.pending} aria-pressed={currentPreset?.id === p.id}
                  onClick={() => act.run({ action: "settings", revision: room.revision, preset: p.id }, discard)}
                  title={p.offered ? `${p.kid} Applies now; fine-tune below.` : "Not offered on this server yet"}
                  className={`text-left border px-2 py-1.5 min-w-0 disabled:opacity-40 ${currentPreset?.id === p.id ? "border-primary bg-primary/10" : "hover:bg-muted"}`} data-testid={`button-preset-${p.id}`}>
                  <span className="block text-xs font-medium truncate">{p.label}{currentPreset?.id === p.id && " ✓"}</span>
                  <span className="block text-[10px] text-muted-foreground line-clamp-2">{p.kid}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">One click applies a preset to the next game; then fine-tune anything below.</p>
          </div>
        )}
        <div ref={pickerRef} className="space-y-1">
          <span className="label-mono">World</span>
          {types.length ? <ObjectTypePicker types={types} value={choice} onChange={pickType} highlight={highlight} disabled={frozen} showOffered={!presets.some(p => p.objectType === choice.objectType)} />
            : <p className="text-xs text-muted-foreground">{optionsFailed ? "Object types unavailable — retry above." : "Loading object types…"}</p>}
        </div>
        <div className="border-t pt-3"><RuleShelf title="Rule shelf" entries={shelf} badges={badges} onUnlock={unlock} onToggleExcluded={toggleExcluded} unlockDisabled={frozen} /></div>
        {optionFields.map(([k, l]) => (
          <label key={k} className="space-y-1 block"><span className="label-mono">{l}</span>
            <select value={available(k).some(o => o.id === val(k)) ? val(k) : ""} disabled={!options} onChange={(e) => set(k, e.target.value)} className={field} data-testid={`select-${k}`}>
              {!available(k).some(o => o.id === val(k)) && <option value="" disabled>{options ? "Select a supported option" : optionsFailed ? "Options unavailable — retry above" : "Loading options…"}</option>}
              {available(k).map(o => <option key={o.id} value={o.id}>{o.label} ({o.id})</option>)}
            </select></label>
        ))}
        {NUM_GROUPS.map(g => (
          <fieldset key={g.title} className="border-t pt-3 min-w-0" data-testid={`settings-group-${g.title.toLowerCase().replace(/ /g, "-")}`}>
            <legend className="label-mono !text-foreground pr-2">{g.title}</legend>
            <div className="grid grid-cols-2 gap-3">
              {g.fields.map(f => (
                <label key={f.key} className="space-y-1 min-w-0" title={f.help}>
                  <span className="label-mono block truncate">{f.label}{f.unit ? ` (${f.unit})` : ""}</span>
                  <input type="number" step={f.int ? 1 : "any"} min={f.min} max={f.max} value={val(f.key)} onChange={(e) => set(f.key, e.target.value)}
                    aria-invalid={badNum(f, val(f.key)) || undefined} className={`${field} ${badNum(f, val(f.key)) ? "border-destructive" : ""}`} data-testid={`input-${f.key}`} />
                </label>
              ))}
            </div>
            {g.fields.some(f => f.help) && <p className="mt-2 text-xs text-muted-foreground">{g.fields.filter(f => f.help).map(f => `${f.label}: ${f.help}`).join(" ")}</p>}
          </fieldset>
        ))}
      </div>
      <div className="border-t p-3 flex flex-wrap gap-2">
        <button disabled={!dirty || invalid || act.pending} onClick={() => act.run({ action: "settings", revision: baseRev.current, settings: build() }, discard)} className="flex-1 bg-primary text-primary-foreground py-2 text-sm disabled:opacity-40" data-testid="button-save-settings">Save settings</button>
        <button disabled={!dirty} onClick={discard} className="border px-3 py-2 text-sm disabled:opacity-40" data-testid="button-discard-settings">Discard</button>
        <button disabled={!defaults} onClick={() => { if (!defaults) return; setTypeDraft({ objectType: defaults.objectType, typeArgs: defaults.typeArgs }); setDraft(Object.fromEntries(Object.entries(defaults).filter(([k]) => k !== "typeArgs" && k !== "objectType").map(([k, v]) => [k, String(v)]))); }} className="border px-3 py-2 text-sm disabled:opacity-40" data-testid="button-load-defaults">Load defaults</button>
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
        {room.aiUsed > (room.aiInputTokens ?? 0) + (room.aiOutputTokens ?? 0) && <p className="text-xs text-muted-foreground">{fmt(room.aiUsed - (room.aiInputTokens ?? 0) - (room.aiOutputTokens ?? 0))} tokens held separately for pending calls or calls without recorded usage. This is not confirmed consumption.</p>}
        <input type="number" min={0} max={1000000} step={1} value={budget} onChange={(e) => { setBudget(e.target.value); setConfirmBudget(false); }} className={field} data-testid="input-ai-budget" />
        {!budgetOk && <p role="alert" className="text-xs text-accent">Enter a whole number from 0 to 1,000,000 tokens.</p>}
        <p className="text-xs text-muted-foreground">Per-game allowance shared by all AI seats; resets when a new game starts. Pending and unconfirmed reservations also reduce available allowance. Separate dollar safety limits still apply.</p>
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={confirmBudget} onChange={(e) => setConfirmBudget(e.target.checked)} className="mt-0.5 accent-[hsl(var(--primary))]" data-testid="checkbox-approve-budget" />
          I approve AI seats in this room using up to {budgetOk ? fmt(b) : "?"} tokens, billed directly to the server owner's provider accounts (e.g. Anthropic, OpenAI)—not Replit credits.
        </label>
        <button disabled={!budgetOk || !confirmBudget || act.pending} onClick={() => act.run({ action: "settings", revision: room.revision, settings: source, aiBudget: b }, () => setConfirmBudget(false))} className="w-full border py-2 text-sm hover:bg-muted disabled:opacity-40" data-testid="button-save-budget">Approve and save budget</button>
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
        <summary className="cursor-pointer label-mono">final leaderboard · {g.roster.length} gods · {s.language} / {s.objectType} {Object.values(s.typeArgs).join(",")} · {fmt(g.worldSeconds, 1)}s world · {g.objectCount} objects · {g.agentCount} agents</summary>
        <ol className="mt-2 space-y-0.5">
          {top.map((r) => <li key={r.deityId} className="flex gap-2 font-mono"><span className="w-6 text-muted-foreground">{r.rank}</span><span className="flex-1 truncate">{r.name} <span className="text-muted-foreground">{r.kind}</span></span><span className="tabular-nums" title="total payoff, bits²">{fmt(r.totalPayoff, 1)}</span></li>)}
          {top.length === 0 && <li className="text-muted-foreground">No standings were recorded.</li>}
        </ol>
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
