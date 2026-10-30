import { useEffect, useMemo, useRef, useState } from "react";
import { OPTION_KEYS, fixOptionChoices, type OptionKey } from "@/lib/settings-options";
import { Link } from "wouter";
import { useAction, useMutation } from "convex/react";
import { Panel, Empty, ErrorLine } from "@/components/shell";
import { ObjectTypePicker, RuleShelf, catalogFor, changedParams, findOffered, sameArgs, snapToOffered, withExcluded, type TypeChoice } from "@workspace/object-views";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgentOptions } from "@/hooks/use-agents";
import { useRun, type Run } from "@/hooks/use-run";
import { api, useLive } from "@/lib/convex";
import { errMsg, rid, fmt } from "@/lib/errors";
import { fmtDuration, fmtWhen, isoWhen, endReasonLabel, toMs } from "@/lib/time";
import { catalogOf, type RoomState, type Settings, type SettingsOptions, type GameRecord, type ObjectTypeInfo, type SettingsPreset, type Manifest, type Credential } from "@/lib/types";
import { Bot, Crown, Play, Trash2, User, Check, Circle, LogOut, Trophy, ArrowRight, Eye, KeyRound, ExternalLink } from "lucide-react";

export function Members({ room, meId, isOwner, act, minPlayers }: { room: RoomState; meId?: string; isOwner: boolean; act: Run; minPlayers: number }) {
  const join = useMutation(api.rooms.join);
  const leave = useMutation(api.rooms.leave);
  const setReady = useMutation(api.rooms.setReady);
  const addAi = useMutation(api.rooms.addAi);
  const removeAi = useMutation(api.rooms.removeAi);
  const start = useAction(api.owner.start);
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
  const roomId = room.id;
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
                  : m.kind === "ai" ? <span className="label-mono">{m.provider} / {m.model}{m.status ? ` · ${m.status}` : ""}</span>
                  : m.status && <span className="label-mono">{m.status}</span>}
              </span>
              <span className={`label-mono inline-flex items-center gap-1 ${m.ready ? "!text-primary" : ""}`}>{m.ready ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />}{m.ready ? "ready" : "waiting"}</span>
              {isOwner && m.kind === "ai" && (
                <button onClick={() => act.run("removeAi", () => removeAi({ roomId, godId: m.id }))} disabled={act.pending || running} className="text-muted-foreground hover:text-destructive disabled:opacity-40" title={running ? "Seats are frozen while a game is running" : "Remove AI seat"} data-testid={`button-remove-ai-${m.id}`}><Trash2 className="h-4 w-4" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="border-t p-3 grid grid-cols-[minmax(0,1fr)] gap-2">
        {!me ? (<>
          <button onClick={() => act.run("join", () => join({ room: room.shortCode }))} disabled={act.pending} className="bg-primary text-primary-foreground py-2 text-sm disabled:opacity-50" data-testid="button-join">Join this room</button>
          {running && <p className="label-mono text-center">a game is running: you will spectate it and play the next one</p>}
        </>) : (
          <div className="flex gap-2">
            <button onClick={() => act.run("ready", () => setReady({ roomId, ready: !me.ready }))} disabled={act.pending} className={`flex-1 py-2 text-sm border ${me.ready ? "" : "bg-foreground text-background"}`} data-testid="button-ready">{me.ready ? "Stand down (unready)" : "Declare ready"}</button>
            {!isOwner && (
              <button onClick={() => act.run("leave", () => leave({ roomId }))} disabled={act.pending || leaveBlocked} title={seated(meId) ? "You are seated in the running game; leave after it ends" : "Leave this room"} className="border px-3 py-2 text-sm inline-flex items-center gap-2 hover:bg-muted disabled:opacity-40" data-testid="button-leave"><LogOut className="h-4 w-4" /> Leave</button>
            )}
          </div>
        )}
        {me && !isOwner && seated(meId) && <p className="label-mono text-center">you can leave once the running game ends</p>}
        {isOwner && (<>
          <div className="flex gap-2">
            <select value={chosen} onChange={(e) => setAgentId(e.target.value)} disabled={!list.length || running} className="flex-1 min-w-0 border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-primary disabled:opacity-50" data-testid="select-ai-agent">
              {agents.isLoading ? <option>Loading agents…</option> : agents.error ? <option>Agent list failed</option> : !list.length ? <option>No agents in library</option>
                : list.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.model}</option>)}
            </select>
            <button onClick={() => act.run("addAi", () => addAi({ roomId, templateId: chosen }))} disabled={act.pending || !chosen || running} title={running ? "Seats are frozen while a game is running" : undefined} className="border px-3 py-2 text-sm inline-flex items-center justify-center gap-2 hover:bg-muted disabled:opacity-40" data-testid="button-add-ai"><Bot className="h-4 w-4" /> Add AI</button>
          </div>
          {agents.error && <ErrorLine message={errMsg(agents.error)} />}
          {running ? (
            <Link href={`/games/${g.shortCode}`} className="bg-accent text-accent-foreground py-2.5 text-sm inline-flex items-center justify-center gap-2" data-testid="link-running-game">Game {g.shortCode} running · open <ArrowRight className="h-4 w-4" /></Link>
          ) : (
            <button onClick={() => act.run("start", () => start({ roomId, requestId: rid() }))} disabled={act.pending || !canStart} className="bg-accent text-accent-foreground py-2.5 text-sm inline-flex items-center justify-center gap-2 disabled:opacity-40" data-testid="button-start"><Play className="h-4 w-4" /> Start game</button>
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
    { key: "stepBudget", label: "Steps / act", min: 1, max: 10000000, int: true, help: "Deterministic step budget of one act (default 500,000)." },
    { key: "interactionComputeMs", label: "CPU backstop / act", unit: "ms", min: 1, max: 1000, int: true, help: "CPU backstop behind the step budget, not compilation or worker startup." },
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
    { key: "perActFloorBits", label: "Floor per act", unit: "bits", min: 0, help: "Charged on every attempted act, valid or not (default 2)." },
  ] },
  { title: "Defence goals", fields: [
    { key: "defenceRate", label: "Defence goal rate", min: 0, max: 1, help: "Chance a god is also dealt a ⚠️ defence goal (0 = off)." },
    { key: "penaltyWeight", label: "Penalty weight", min: 0, help: "How much a ⚠️ bit weighs against a ✨ bit (default 1)." },
  ] },
];
const NUM_KEYS = NUM_GROUPS.flatMap(g => g.fields);
const optionFields: [OptionKey, string][] = [["grammarId", "Grammar"], ["utilitySelectorId", "Utility selector"], ["complexityFunctionId", "Complexity function"]];

const badNum = (f: NumField, raw: string) => {
  const v = Number(raw);
  return raw.trim() === "" || !Number.isFinite(v) || (f.int && !Number.isInteger(v)) || (f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max);
};

export function OwnerSettings({ room, act, defaults, options, optionsFailed = false, aiFunding, objectTypes, presets = [] }: { room: RoomState; act: Run; defaults?: Settings; options?: SettingsOptions; optionsFailed?: boolean; aiFunding?: Manifest["aiFunding"]; objectTypes?: ObjectTypeInfo[]; presets?: SettingsPreset[] }) {
  const saveSettings = useAction(api.owner.settings);
  const approveBudget = useMutation(api.rooms.approveAiBudget);
  const roomCatalog = useMemo(() => catalogOf(room.utilityCatalog), [room.utilityCatalog]);
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
    (options?.[k] ?? []).filter(o => (o.languages as readonly string[]).includes(language) && (o.objectTypes as readonly string[]).includes(objectType));
  const fixOptions = (next: Record<string, string>, language: string, objectType: string) =>
    fixOptionChoices(next, source as unknown as Record<string, unknown>, options, language, objectType);
  // A language or type switched before the option catalogue arrived (a cold engine) is repaired when it does.
  useEffect(() => {
    if (!options || !dirty) return;
    setDraft(d => {
      const next = fixOptionChoices(d, source as unknown as Record<string, unknown>, options, d.language ?? String(source.language), choice.objectType);
      return OPTION_KEYS.every(k => next[k] === d[k]) ? d : next;
    });
  }, [options, dirty, choice.objectType]); // eslint-disable-line react-hooks/exhaustive-deps
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
    // The server moves fields still at the old instantiation's tuned defaults to the new ones; mirror it in the draft.
    const pt = types.find(x => x.id === prev.objectType), po = pt ? findOffered(pt, prev.typeArgs) : undefined;
    const before: Record<string, unknown> = { ...pt?.settingsDefaults, ...po?.settingsDefaults };
    const tuned: Record<string, unknown> = { ...(prev.objectType !== next.objectType ? t?.settingsDefaults : {}), ...offered?.settingsDefaults };
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    const follows = (k: string, current: unknown) => !(k in before) || same(current, before[k]) || String(current) === String(before[k]);
    if ("excludedFamilies" in tuned && follows("excludedFamilies", excludedDraft ?? source.excludedFamilies ?? [])) setExcludedDraft([...(tuned.excludedFamilies as string[])]);
    const scalars = Object.entries(tuned).filter(([k]) => k !== "excludedFamilies");
    setDraft(d => fixOptions({ ...d, ...Object.fromEntries(scalars
      .filter(([k]) => follows(k, k in d ? d[k as keyof typeof d] : source[k as keyof Settings]))
      .map(([k, v]) => [k, String(v)])) }, d.language ?? String(source.language), next.objectType));
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
    for (const [k, v] of Object.entries(draft)) s[k] = NUM_KEYS.some(f => f.key === k) ? Number(v) : k === "commitClause" ? v === "true" : v;
    return s as unknown as Settings;
  };
  const currentType = types.find(t => t.id === choice.objectType);
  const offered = currentType ? findOffered(currentType, choice.typeArgs) : undefined;
  const invalid = NUM_KEYS.some(f => source[f.key] !== undefined || draft[f.key] !== undefined ? badNum(f, val(f.key)) : false) ||
    optionFields.some(([k]) => !available(k).some(o => o.id === val(k))) || (types.length > 0 && !offered);
  const conflict = dirty && baseRev.current !== room.revision;
  const savedType = typeDraft === null || (typeDraft.objectType === source.objectType && sameArgs(typeDraft.typeArgs, source.typeArgs));
  const excluded = excludedDraft ?? source.excludedFamilies ?? [];
  const shelf = useMemo(() => withExcluded(savedType ? roomCatalog : catalogFor(choice.objectType, choice.typeArgs), excluded),
    [savedType, roomCatalog, choice.objectType, choice.typeArgs, excluded]);
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
                  onClick={() => act.run("preset", () => saveSettings({ roomId: room.id, revision: room.revision, preset: p.id }), discard)}
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
        <fieldset className="border-t pt-3 min-w-0" data-testid="settings-group-mechanics">
          <legend className="label-mono !text-foreground pr-2">Mechanics</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 min-w-0" title="Agents may wrap moves in only_if_better(...): they happen only if they raise the owner's points on that object (costs about 3.6 summon bits).">
              <span className="label-mono">Commit clause</span>
              <select value={val("commitClause") === "true" ? "true" : "false"} onChange={(e) => set("commitClause", e.target.value)} className={field} data-testid="select-commitClause">
                <option value="false">off</option><option value="true">offered</option>
              </select></label>
            <label className="space-y-1 min-w-0" title="Which object an interaction targets: uniform, or shelter (salient objects are hit a little less).">
              <span className="label-mono">Object selection</span>
              <select value={val("objectSelection") === "shelter" ? "shelter" : "uniform"} onChange={(e) => set("objectSelection", e.target.value)} className={field} data-testid="select-objectSelection">
                <option value="uniform">uniform</option><option value="shelter">shelter</option>
              </select></label>
          </div>
        </fieldset>
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
        <button disabled={!dirty || invalid || act.pending} onClick={() => act.run("settings", () => saveSettings({ roomId: room.id, revision: baseRev.current, settings: build() }), discard)} className="flex-1 bg-primary text-primary-foreground py-2 text-sm disabled:opacity-40" data-testid="button-save-settings">Save settings</button>
        <button disabled={!dirty} onClick={discard} className="border px-3 py-2 text-sm disabled:opacity-40" data-testid="button-discard-settings">Discard</button>
        <button disabled={!defaults} onClick={() => { if (!defaults) return; setTypeDraft({ objectType: defaults.objectType, typeArgs: defaults.typeArgs }); setDraft(Object.fromEntries(Object.entries(defaults).filter(([k]) => k !== "typeArgs" && k !== "objectType").map(([k, v]) => [k, String(v)]))); }} className="border px-3 py-2 text-sm disabled:opacity-40" data-testid="button-load-defaults">Load defaults</button>
      </div>
      {conflict && <p className="px-4 pb-3 text-xs text-accent">The room revision moved to {room.revision} since you began editing. Saving submits revision {baseRev.current}; the server may reject it. Discard to reload.</p>}
      <div className="border-t p-4 space-y-3">
        <div className="text-xs space-y-1" data-testid="ai-funding-status">
          <p className="font-medium">AI billing: direct provider APIs (per-agent model)</p>
          <p className="text-muted-foreground">Each AI seat uses its library agent's provider and model. Credentials and per-model rates are listed in the AI library.</p>
          {aiFunding && !aiFunding.live && <p className="text-accent">AI game control is not active yet. No inference is running.</p>}
          {aiFunding?.mock && <p className="text-accent" data-testid="text-ai-mock">Mock AI provider (development): AI seats play scripted moves and no provider is billed.</p>}
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
        <button disabled={!budgetOk || !confirmBudget || act.pending} onClick={() => act.run("budget", () => approveBudget({ roomId: room.id, aiBudget: b }), () => setConfirmBudget(false))} className="w-full border py-2 text-sm hover:bg-muted disabled:opacity-40" data-testid="button-save-budget">Approve and save budget</button>
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
        <summary className="cursor-pointer label-mono">final leaderboard · {g.roster.length} gods · {s.language} / {s.objectType} {Object.values(s.typeArgs).join(",")} · {fmt(g.worldSeconds, 1)}s world · {g.objectCount} objects</summary>
        <ol className="mt-2 space-y-0.5">
          {top.map((r) => <li key={r.deityId} className="flex gap-2 font-mono"><span className="w-6 text-muted-foreground">{r.rank}</span><span className="flex-1 truncate">{r.name} <span className="text-muted-foreground">{r.kind}</span></span><span className="tabular-nums" title="total payoff, bits²">{fmt(r.totalPayoff, 1)}</span></li>)}
          {top.length === 0 && <li className="text-muted-foreground">No standings were recorded.</li>}
        </ol>
      </details>
    </li>
  );
}

export function History({ games, loading, error }: { games?: GameRecord[]; loading: boolean; error: unknown }) {
  return (
    <Panel title="Game history" meta={games ? `${games.length} played` : undefined}>
      {loading && <div className="p-4 space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>}
      {!!error && <div className="p-4"><ErrorLine message={errMsg(error)} /></div>}
      {games && games.length === 0 && <Empty title="No games played yet" body="Finished games, their winners and final leaderboards appear here." />}
      {games && games.length > 0 && <ul className="divide-y max-h-[560px] overflow-auto">{games.map((g) => <HistoryRow key={g.id} g={g} />)}</ul>}
    </Panel>
  );
}

/**
 * "Your player apps": how to connect a Replit player app to this room, the caller's credentials
 * (auth/credentials:list, revocable at once) and the hosted default player client.
 */
export function PlayerApps({ room }: { room: RoomState }) {
  const creds = useLive(api.auth.credentials.list, {});
  const revoke = useMutation(api.auth.credentials.revoke);
  const act = useRun();
  const origin = window.location.origin;
  const here = (creds.data ?? []).filter(c => c.roomId === room.id);
  const elsewhere = (creds.data ?? []).filter(c => c.roomId !== room.id);
  const row = (c: Credential) => (
    <li key={c.credentialId} className="px-4 py-2.5 flex items-start gap-3 text-sm" data-testid={`row-credential-${c.credentialId}`}>
      <KeyRound className="h-4 w-4 text-accent mt-0.5 shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block break-words" title="Self-reported by the app; not a verified identity">{c.label || "Unlabelled app"}</span>
        <span className="label-mono block">{c.permission} · room {c.roomCode ?? "gone"} · expires {fmtWhen(c.expiresAt)}</span>
        <span className="label-mono block">{c.lastUsedAt ? `last used ${fmtWhen(c.lastUsedAt)}` : "never used"}</span>
      </span>
      <button onClick={() => act.run("revoke", () => revoke({ credentialId: c.credentialId }))} disabled={act.pending} className="border border-destructive/50 text-destructive px-2.5 py-1 text-xs hover:bg-destructive/5 disabled:opacity-40" data-testid={`button-revoke-${c.credentialId}`}>Revoke</button>
    </li>
  );
  return (
    <Panel title="Your player apps" meta={creds.data ? `${here.length} connected` : undefined}>
      <div className="p-4 space-y-3 text-sm" data-testid="panel-player-apps">
        <p>Connect your own Replit player app to room <b className="font-mono">{room.shortCode}</b>:</p>
        <ol className="list-decimal pl-5 space-y-2">
          <li>In your app, set the Secret <code className="font-mono text-xs">CODE_GODS_ENGINE_URL</code> to <code className="font-mono text-xs break-all" data-testid="text-engine-url">{origin}</code></li>
          <li>Run <code className="font-mono text-xs break-all bg-muted px-1" data-testid="text-connect-command">pnpm player connect --room {room.shortCode}</code></li>
          <li>Approve the code it prints on this site's <Link href="/device" className="underline" data-testid="link-device">device approval page</Link>, then save the credential it prints as the Secret <code className="font-mono text-xs">CODE_GODS_CREDENTIAL</code>.</li>
        </ol>
        <a href={`/player/?room=${encodeURIComponent(room.shortCode)}`} target="_blank" rel="noreferrer" className="border py-2 text-sm flex items-center justify-center gap-2 hover:bg-muted" data-testid="link-player"><ExternalLink className="h-4 w-4" /> Open the hosted player client</a>
      </div>
      <div className="border-t">
        {creds.isLoading && <div className="p-4"><Skeleton className="h-10 w-full" /></div>}
        {creds.error && <div className="p-4"><ErrorLine message={errMsg(creds.error)} /></div>}
        {creds.data && here.length === 0 && <p className="px-4 py-3 text-xs text-muted-foreground" data-testid="text-no-credentials">No player app holds a credential for this room.</p>}
        {here.length > 0 && <ul className="divide-y" data-testid="list-credentials">{here.map(row)}</ul>}
        {elsewhere.length > 0 && (
          <details className="border-t">
            <summary className="px-4 py-2 cursor-pointer label-mono">{elsewhere.length} credential{elsewhere.length === 1 ? "" : "s"} for your other rooms</summary>
            <ul className="divide-y">{elsewhere.map(row)}</ul>
          </details>
        )}
      </div>
    </Panel>
  );
}
