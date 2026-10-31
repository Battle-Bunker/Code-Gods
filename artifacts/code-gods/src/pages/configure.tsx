/**
 * The configuration page, /rooms/:code/configure (onboarding-and-config.md §4): a long form with a stepper and a
 * sticky summary that asks every GameSettings field, each with its question, meaning and consequence from
 * SETTINGS_DOCS, in the order Start from → World → Goals → Agents → Energy → Population → Time → Players & AI →
 * Review. Owners edit; everyone else reads the same page (it replaces the old read-only settings panel).
 *
 * - Choices are stepped (the tuned values always among them) plus "Exact value…", validated live as the engine does.
 * - A new object type retunes the fields still at their tuned defaults and says which (with Undo).
 * - Save = owner.settings with the full settings, then rooms.approveAiBudget if a budget changed (with consent).
 * - Changes saved elsewhere meanwhile are merged into the draft: disjoint fields automatically, overlapping ones per
 *   field (Keep mine / Take theirs). The draft is never discarded and survives a reload (localStorage).
 * - While a game runs the draft stays editable and Save waits, with the reason.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { useAction, useMutation } from "convex/react";
import { ROOM_BUDGET_DOCS, SETTINGS_DOCS, settingsOptionsFor, type FieldDoc, type SettingsSection } from "@workspace/game-core";
import { ObjectTypePicker, RuleShelf, catalogFor, findOffered, snapToOffered, withExcluded, type TypeChoice } from "@workspace/object-views";
import { api, useLive } from "@/lib/convex";
import type { Manifest, ObjectTypeInfo, RoomState } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Page, usePage } from "@/components/layout";
import { Action } from "@/components/action";
import { ErrorLine } from "@/components/page-parts";
import { costLine } from "@/components/sheets";
import { settingsSummary } from "@/components/game-panels";
import { ToastAction } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { errCode, errMsg, fmt } from "@/lib/errors";
import {
  BUDGET_LIMITS, LABELS, SECTIONS, choiceLabel, draftErrors, fieldsOf, formatValue, isHidden, lengthLine, limitError, matchPreset, paceWord,
  retune, same, settingsDiff, stepChoices, threeWayMerge, withLanguage, type Settings, type SettingsKey,
} from "@/lib/settings-form";

type Budgets = { aiBudget: number; assistantBudget: number; assistantModel: string };
type Snapshot = { settings: Settings; revision: number };
type Stored = { base: Snapshot; draft: Settings; budgets: Budgets };
const draftKey = (roomId: string) => `code-gods:config-draft:${roomId}`;
const loadDraft = (roomId: string): Stored | null => { try { const raw = window.localStorage.getItem(draftKey(roomId)); return raw ? JSON.parse(raw) as Stored : null; } catch { return null; } };
const saveDraft = (roomId: string, s: Stored | null) => { try { if (s) window.localStorage.setItem(draftKey(roomId), JSON.stringify(s)); else window.localStorage.removeItem(draftKey(roomId)); } catch { /* a convenience */ } };
const budgetsOf = (room: RoomState): Budgets => ({ aiBudget: room.aiBudget, assistantBudget: room.assistantBudget ?? 0, assistantModel: room.assistantModel });

export default function Configure() {
  const { id = "" } = useParams<{ id: string }>();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const q = useLive(api.rooms.get, isAuthenticated && id ? { room: id } : "skip");
  const room = q.data;
  const code = room?.shortCode ?? id.toUpperCase();
  useEffect(() => { document.title = `Configure ${code} · Code Gods`; }, [code]);
  return (
    <Page room={room ?? null} crumbs={[{ label: code, href: `/rooms/${code}` }, { label: "Configure" }]} placeholder={`Search or do anything in ${code}`}>
      <div data-testid="page-configure">
        {authLoading ? null : !isAuthenticated ? <p className="mx-auto max-w-lg px-4 py-20">Sign in to see this room's settings.</p>
        : q.isLoading ? <div className="mx-auto max-w-[1200px] px-6 py-8 space-y-4"><Skeleton className="h-12 w-1/2" /><Skeleton className="h-96" /></div>
        : !room ? <div className="mx-auto max-w-lg px-4 py-20"><ErrorLine message={q.error ? errMsg(q.error) : "Room not found. Check the code, or ask the owner for the link."} /></div>
        : <ConfigureForm room={room} editable={room.ownerId === user?.id} />}
      </div>
    </Page>
  );
}

function ConfigureForm({ room, editable }: { room: RoomState; editable: boolean }) {
  const { manifest, openPalette } = usePage();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const from = new URLSearchParams(useSearch()).get("from");
  const saveSettings = useAction(api.owner.settings);
  const approve = useMutation(api.rooms.approveAiBudget);
  const stored = useMemo(() => (editable ? loadDraft(room.id) : null), [room.id, editable]);
  const [base, setBase] = useState<Snapshot>(() => stored?.base ?? { settings: room.settings, revision: room.revision });
  const [draft, setDraft] = useState<Settings>(() => stored?.draft ?? room.settings);
  const [budgets, setBudgets] = useState<Budgets>(() => stored?.budgets ?? budgetsOf(room));
  const [startFrom, setStartFrom] = useState<string>(from ?? "current");
  const [consent, setConsent] = useState(false);
  const [conflicts, setConflicts] = useState<SettingsKey[]>([]);
  const [mergedNote, setMergedNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState<string | null>(null);
  const roomBudgets = budgetsOf(room);
  const dirtySettings = !same(draft, base.settings);
  const dirtyBudgets = !same(budgets, roomBudgets);
  const dirty = dirtySettings || dirtyBudgets;

  // Keep the draft across reloads; clear it once nothing differs.
  useEffect(() => { if (editable) saveDraft(room.id, dirty ? { base, draft, budgets } : null); }, [editable, room.id, base, draft, budgets, dirty]);

  // Settings saved elsewhere (another tab, the assistant): merge them into the draft, never discard it.
  const seen = useRef(room.revision);
  useEffect(() => {
    if (room.revision === base.revision || same(room.settings, base.settings)) {
      if (room.revision !== base.revision) setBase({ settings: room.settings, revision: room.revision });
      seen.current = room.revision;
      return;
    }
    if (!dirtySettings) { setDraft(room.settings); setBase({ settings: room.settings, revision: room.revision }); return; }
    const m = threeWayMerge(base.settings as unknown as Record<string, unknown>, draft as unknown as Record<string, unknown>, room.settings as unknown as Record<string, unknown>);
    setDraft(m.merged as unknown as Settings);
    setConflicts(c => [...new Set([...c, ...(m.conflicts as SettingsKey[])])]);
    if (m.fromTheirs.length) setMergedNote(`Also includes ${m.fromTheirs.length} change${m.fromTheirs.length === 1 ? "" : "s"} saved elsewhere: ${m.fromTheirs.map(k => LABELS[k as SettingsKey]).join(", ")}.`);
    setBase({ settings: room.settings, revision: room.revision });
  }, [room.revision]); // eslint-disable-line react-hooks/exhaustive-deps

  const types = manifest?.objectTypes ?? [];
  const presets = manifest?.presets ?? [];
  const startSettings = startFrom === "current" ? base.settings : presets.find(p => p.id === startFrom)?.settings;
  const startLabel = startFrom === "current" ? "the room's current settings" : presets.find(p => p.id === startFrom)?.label ?? startFrom;
  const errors = draftErrors(draft);
  const currentType = types.find(t => t.id === draft.objectType);
  const offered = currentType ? !!findOffered(currentType, draft.typeArgs) : true;
  const budgetErrors = {
    aiBudget: limitError(BUDGET_LIMITS.aiBudget, budgets.aiBudget),
    assistantBudget: limitError({ ...BUDGET_LIMITS.assistantBudget, max: manifest?.aiFunding.assistantBudgetMax ?? BUDGET_LIMITS.assistantBudget.max }, budgets.assistantBudget),
  };
  const invalid = Object.keys(errors).length > 0 || !offered || !!budgetErrors.aiBudget || !!budgetErrors.assistantBudget;
  const running = room.activeGame;
  const budgetFrozen = !!running && budgets.aiBudget !== room.aiBudget;
  const saveBlocker = !editable ? null : running && dirtySettings ? `A game is running. Save this for the next game when game ${running.shortCode} ends.`
    : budgetFrozen ? `The AI players' budget can change after game ${running!.shortCode} ends.`
    : conflicts.length ? "Choose Keep mine or Take theirs for each setting changed in both places."
    : invalid ? "Fix the settings marked in red first." : dirtyBudgets && !consent ? "Tick the approval for the new spending first." : !dirty ? "Nothing has changed yet." : null;

  const set = <K extends SettingsKey>(key: K, value: Settings[K]) => setDraft(d => (key === "language" ? withLanguage(d, value as Settings["language"]) : { ...d, [key]: value }));
  const pickType = (next: TypeChoice) => {
    const previous = draft;
    const { settings, moved } = retune(draft, next);
    setDraft(settings);
    if (moved.length) toast({
      title: `Adjusted ${moved.length} setting${moved.length === 1 ? "" : "s"} for this world`,
      description: moved.map(k => LABELS[k]).join(", "),
      action: <ToastAction altText="Undo" onClick={() => setDraft(previous)}>Undo</ToastAction>,
    });
  };
  const applyStart = (id: string) => {
    const s = id === "current" ? base.settings : presets.find(p => p.id === id)?.settings;
    if (!s) return;
    setStartFrom(id); setConfirmReplace(null);
    setDraft(id === "current" ? s : withLanguage(s, draft.language));
  };
  const save = async () => {
    if (saveBlocker || saving) return;
    setSaving(true); setSaveError(null);
    try {
      if (dirtySettings) await saveSettings({ roomId: room.id, revision: base.revision, settings: draft });
      if (dirtyBudgets) await approve({ roomId: room.id, aiBudget: budgets.aiBudget, assistantBudget: budgets.assistantBudget, assistantModel: budgets.assistantModel });
      saveDraft(room.id, null);
      toast({ title: "Saved for the next game" });
      navigate(`/rooms/${room.shortCode}`);
    } catch (e) {
      setSaveError(errCode(e) === "CONFLICT"
        ? `${errMsg(e)}. Your draft is kept; changes saved elsewhere are merged into it as they arrive. Review and save again.`
        : errMsg(e));
    } finally { setSaving(false); }
  };

  const sectionChanged = (s: SettingsSection) => s === "players" ? dirtyBudgets : fieldsOf(s).some(k => !same(draft[k], base.settings[k]));
  const diffVsStart = startSettings ? settingsDiff(startSettings, draft) : [];
  const diffVsRoom = settingsDiff(base.settings, draft);
  const preset = matchPreset(draft, presets);

  return (
    <div className="mx-auto max-w-[1280px] px-4 md:px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6 rise">
        <div>
          <h1 className="font-display text-4xl md:text-5xl leading-none">{editable ? "Configure the next game" : "Settings of the next game"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Room {room.shortCode}. {editable ? "Nothing changes until you save; running games keep their own settings." : `Only the owner, ${room.ownerName}, can change these.`}</p>
        </div>
        <Link href={`/rooms/${room.shortCode}`} className="text-sm underline underline-offset-4" data-testid="link-back-to-room">Back to room {room.shortCode}</Link>
      </div>
      {mergedNote && <p className="mb-4 border border-primary/40 bg-primary/5 px-4 py-2 text-sm" data-testid="text-merged" role="status">{mergedNote}</p>}
      {conflicts.length > 0 && (
        <div className="mb-4 border border-accent px-4 py-3 text-sm space-y-2" data-testid="panel-conflicts" role="alert">
          <p>These settings were also changed elsewhere since you started. Choose for each:</p>
          <ul className="space-y-1">{conflicts.map(k => (
            <li key={k} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium">{LABELS[k]}</span>
              <span>yours: {formatValue(k, draft[k])} · theirs: {formatValue(k, room.settings[k])}</span>
              <button type="button" className="underline" onClick={() => setConflicts(c => c.filter(x => x !== k))} data-testid={`button-keep-mine-${k}`}>Keep mine</button>
              <button type="button" className="underline" onClick={() => { setDraft(d => ({ ...d, [k]: room.settings[k] })); setConflicts(c => c.filter(x => x !== k)); }} data-testid={`button-take-theirs-${k}`}>Take theirs</button>
            </li>
          ))}</ul>
        </div>
      )}
      <div className="grid gap-8 lg:grid-cols-[11rem_minmax(0,1fr)_17rem]">
        <nav aria-label="Sections" className="hidden lg:block">
          <ol className="sticky top-20 space-y-1 text-sm">
            {SECTIONS.map((s, i) => (
              <li key={s.id}><a href={`#section-${s.id}`} className="flex items-center gap-2 py-1 hover:underline underline-offset-4">
                <span className="w-4 text-muted-foreground tabular-nums">{i + 1}</span>{s.title}
                {s.id !== "start" && s.id !== "review" && sectionChanged(s.id) && <span className="text-primary" aria-label="changed">•</span>}
              </a></li>
            ))}
          </ol>
        </nav>
        <div className="space-y-10 min-w-0">
          <FormSection id="start">
            <fieldset disabled={!editable} className="space-y-2">
              <legend className="sr-only">Start from</legend>
              {[{ id: "current", label: "The room's current settings", kid: preset ? `Now: ${preset.label}` : "Now: a custom setup", offered: true }, ...presets].map(p => (
                <label key={p.id} className={`flex items-start gap-3 border px-3 py-2 ${startFrom === p.id ? "border-primary bg-primary/5" : ""} ${p.offered ? "" : "opacity-50"}`}>
                  <input type="radio" name="start-from" checked={startFrom === p.id} disabled={!p.offered} data-testid={`radio-start-${p.id}`}
                    onChange={() => (dirtySettings && startFrom !== p.id ? setConfirmReplace(p.id) : applyStart(p.id))} className="mt-1" />
                  <span className="text-sm"><span className="font-medium">{p.label}</span><span className="block text-muted-foreground">{p.kid}{p.offered ? "" : " (not on this server yet)"}</span></span>
                </label>
              ))}
            </fieldset>
            {confirmReplace && (
              <p className="text-sm border border-accent px-3 py-2" role="alert">
                Replace your {diffVsRoom.length} change{diffVsRoom.length === 1 ? "" : "s"} with {presets.find(p => p.id === confirmReplace)?.label ?? "the room's current settings"}?{" "}
                <button type="button" className="underline" onClick={() => applyStart(confirmReplace)} data-testid="button-confirm-replace">Replace</button>{" · "}
                <button type="button" className="underline" onClick={() => setConfirmReplace(null)}>Keep my changes</button>
              </p>
            )}
          </FormSection>

          <FormSection id="world" onRecommended={editable && startSettings ? () => setDraft(d => ({ ...d, ...pick(startSettings, ["objectType", "typeArgs", "language", "grammarId", "complexityFunctionId", "excludedFamilies"]) })) : undefined}>
            <Question k="objectType" draft={draft} editable={editable}>
              {types.length ? <ObjectTypePicker types={types} value={{ objectType: draft.objectType, typeArgs: draft.typeArgs }} onChange={pickType} disabled={!editable} showOffered={false} />
                : <p className="text-sm text-muted-foreground">Loading object types…</p>}
              {currentType && <ParamDocs type={currentType} args={draft.typeArgs} />}
            </Question>
            <Question k="language" draft={draft} editable={editable}>
              <select value={draft.language} disabled={!editable} onChange={e => set("language", e.target.value as Settings["language"])} data-testid="select-language"
                className="border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary">
                <option value="python">Python</option><option value="typescript">TypeScript</option>
              </select>
            </Question>
            <Fixed keys={["grammarId", "complexityFunctionId"]} draft={draft} options={manifest?.options} />
          </FormSection>

          <FormSection id="goals" onRecommended={editable && startSettings ? () => setDraft(d => ({ ...d, ...pick(startSettings, fieldsOf("goals")) })) : undefined}>
            <Question k="utilitySelectorId" draft={draft} editable={editable}>
              <Segmented k="utilitySelectorId" value={draft.utilitySelectorId} editable={editable} onPick={v => set("utilitySelectorId", String(v))}
                choices={settingsOptionsFor("utilitySelectorId", draft.language, draft.objectType).map(o => o.id)} />
            </Question>
            <NumberQuestion k="defenceRate" draft={draft} editable={editable} onSet={v => set("defenceRate", v)} error={errors.defenceRate} />
            <More section="goals" draft={draft}>
              <Question k="excludedFamilies" draft={draft} editable={editable}>
                <RuleShelf title="Rules that can be dealt" entries={withExcluded(catalogFor(draft.objectType, draft.typeArgs), draft.excludedFamilies)}
                  badges={(currentType?.classes ?? []).map(c => c.badge)}
                  onToggleExcluded={editable ? (familyId, out) => set("excludedFamilies", out ? [...new Set([...draft.excludedFamilies, familyId])] : draft.excludedFamilies.filter(x => x !== familyId)) : undefined}
                  onUnlock={editable ? patch => { const t = currentType; const snap = t && snapToOffered(t, draft.typeArgs, patch); if (t && snap) pickType({ objectType: t.id, typeArgs: { ...t.defaults, ...snap.args } }); } : undefined} />
              </Question>
              {!isHidden("penaltyWeight", draft) && <NumberQuestion k="penaltyWeight" draft={draft} editable={editable} onSet={v => set("penaltyWeight", v)} error={errors.penaltyWeight} />}
            </More>
            <Fixed keys={["priorId"]} draft={draft} />
          </FormSection>

          {(["agents", "energy", "population", "time"] as const).map(section => (
            <FormSection key={section} id={section} onRecommended={editable && startSettings ? () => setDraft(d => ({ ...d, ...pick(startSettings, fieldsOf(section)) })) : undefined}>
              {fieldsOf(section).filter(k => SETTINGS_DOCS[k].tier === "ask").map(k => <AnyQuestion key={k} k={k} draft={draft} editable={editable} set={set} error={errors[k]} />)}
              {fieldsOf(section).some(k => SETTINGS_DOCS[k].tier === "more") && (
                <More section={section} draft={draft}>
                  {fieldsOf(section).filter(k => SETTINGS_DOCS[k].tier === "more" && !isHidden(k, draft)).map(k => <AnyQuestion key={k} k={k} draft={draft} editable={editable} set={set} error={errors[k]} />)}
                </More>
              )}
              <Fixed keys={fieldsOf(section).filter(k => SETTINGS_DOCS[k].tier === "fixed")} draft={draft} />
            </FormSection>
          ))}

          <FormSection id="players">
            <PlayersAndAi room={room} editable={editable} manifest={manifest} budgets={budgets} setBudgets={b => { setBudgets(b); setConsent(false); }}
              errors={budgetErrors} openPalette={openPalette} />
          </FormSection>

          <FormSection id="review">
            <div className="space-y-4" data-testid="panel-review">
              <div>
                <h3 className="text-sm font-medium">Compared with {startLabel}</h3>
                {diffVsStart.length ? <ul className="mt-1 text-sm list-disc pl-5" data-testid="list-diff">{diffVsStart.map(d => <li key={d.key}>{d.label}: {d.from} → {d.to}</li>)}</ul>
                  : <p className="mt-1 text-sm text-muted-foreground">No differences.</p>}
              </div>
              <div className="border bg-card px-4 py-3 text-sm" data-testid="card-summary">
                <p className="font-medium">{preset ? preset.label : `Custom${startFrom !== "current" && startSettings ? ` (based on ${startLabel})` : ""}`}</p>
                <p className="text-muted-foreground">{settingsSummary(draft, room.objectInstance && same(draft.typeArgs, room.settings.typeArgs) && draft.objectType === room.settings.objectType ? room.objectInstance : undefined)}</p>
              </div>
              {editable && dirtyBudgets && (
                <label className="flex items-start gap-2 text-sm text-muted-foreground" data-testid="block-consent">
                  <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1 accent-[hsl(var(--primary))]" data-testid="checkbox-config-consent" />
                  I approve AI players using up to {fmt(budgets.aiBudget)} tokens per game and each player's assistant up to {fmt(budgets.assistantBudget)} tokens per game in this room, billed to the server owner's provider accounts.
                </label>
              )}
              {editable && (<>
                <p className="text-sm">{diffVsRoom.length || dirtyBudgets ? `Saving changes ${diffVsRoom.length + (dirtyBudgets ? 1 : 0)} thing${diffVsRoom.length + (dirtyBudgets ? 1 : 0) === 1 ? "" : "s"} for the next game.` : "Nothing to save yet."}</p>
                <div className="flex flex-wrap items-center gap-4">
                  <Action k="owner.settings" label={saving ? "Saving…" : "Save for the next game"} tone="primary" onClick={() => void save()} unavailable={saveBlocker} pending={saving} testId="button-save-settings" showReason />
                  <Link href={`/rooms/${room.shortCode}`} className="text-sm underline underline-offset-4">Cancel</Link>
                </div>
                {saveError && <ErrorLine message={saveError} />}
              </>)}
            </div>
          </FormSection>
        </div>
        <aside className="lg:block">
          <div className="lg:sticky lg:top-20 border bg-card p-4 space-y-2 text-sm" data-testid="panel-summary">
            <p className="font-medium">Summary</p>
            <p>{currentType ? `${currentType.emoji} ${currentType.label}` : draft.objectType} · {Object.values(draft.typeArgs).join(" · ")}</p>
            <p>{draft.language === "python" ? "Python" : "TypeScript"}</p>
            <p>{fmt(draft.startingObjectCount)} objects, +{draft.spawnRateHz}/s</p>
            <p>{lengthLine(draft)} · {paceWord(draft.interactionRateHz)} pace</p>
            <p>{room.members.length} of {manifest?.minimumPlayers ?? 3}–{manifest?.maximumPlayers ?? 8} players ({room.members.filter(m => m.kind === "ai").length} AI)</p>
            <p>AI budget: {fmt(budgets.aiBudget)} · Assistant: {budgets.assistantBudget ? fmt(budgets.assistantBudget) : "off"}</p>
            <p className="text-muted-foreground">vs {startLabel}: {diffVsStart.length} change{diffVsStart.length === 1 ? "" : "s"}</p>
            {editable && <a href="#section-review" className="underline underline-offset-4">Review and save</a>}
          </div>
        </aside>
      </div>
    </div>
  );
}

const pick = (s: Settings, keys: readonly SettingsKey[]): Partial<Settings> => Object.fromEntries(keys.map(k => [k, s[k]])) as Partial<Settings>;

function FormSection({ id, children, onRecommended }: { id: (typeof SECTIONS)[number]["id"]; children: ReactNode; onRecommended?: () => void }) {
  const s = SECTIONS.find(x => x.id === id)!;
  const n = SECTIONS.indexOf(s) + 1;
  return (
    <section id={`section-${id}`} className="scroll-mt-20 space-y-4" data-testid={`section-${id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
        <h2 className="font-display text-2xl"><span className="text-muted-foreground tabular-nums mr-2">{n}</span>{s.title}</h2>
        {onRecommended && <button type="button" onClick={onRecommended} className="text-sm underline underline-offset-4" data-testid={`button-recommended-${id}`}>Recommended</button>}
      </div>
      <p className="text-sm text-muted-foreground">{s.intro}</p>
      {children}
    </section>
  );
}

/** One question: what it asks, what it means and what changing it does (SETTINGS_DOCS), then its control or value. */
function Question({ k, draft, editable, children, error }: { k: SettingsKey; draft: Settings; editable: boolean; children?: ReactNode; error?: string }) {
  const doc = SETTINGS_DOCS[k] as FieldDoc;
  return (
    <div className="space-y-2" data-testid={`field-${k}`}>
      <h3 className="font-medium">{doc.question}</h3>
      <p className="text-sm text-muted-foreground">{doc.meaning} {doc.consequence}</p>
      {editable || k === "objectType" || k === "excludedFamilies" ? children : <p className="text-sm font-mono" data-testid={`value-${k}`}>{formatValue(k, draft[k])}</p>}
      {error && <p className="text-sm text-destructive" role="alert" data-testid={`error-${k}`}>{error}</p>}
    </div>
  );
}

/** Stepped choices as one row of toggle buttons (pre-authored values only). */
function Segmented({ k, value, choices, editable, onPick }: { k: SettingsKey; value: number | string | boolean; choices: readonly (number | string | boolean)[]; editable: boolean; onPick: (v: number | string | boolean) => void }) {
  return (
    <div role="radiogroup" aria-label={LABELS[k]} className="flex flex-wrap gap-1.5">
      {choices.map(c => (
        <button key={String(c)} type="button" role="radio" aria-checked={c === value} disabled={!editable} onClick={() => onPick(c)} data-testid={`choice-${k}-${String(c)}`}
          className={`border px-3 py-1.5 text-sm ${c === value ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-muted"} disabled:cursor-default`}>{choiceLabel(k, c)}</button>
      ))}
    </div>
  );
}

function NumberQuestion({ k, draft, editable, onSet, error }: { k: SettingsKey; draft: Settings; editable: boolean; onSet: (v: number) => void; error?: string }) {
  const value = draft[k] as number;
  const choices = stepChoices(k, value) as number[];
  const [exact, setExact] = useState(false);
  const [raw, setRaw] = useState(String(value));
  useEffect(() => { if (!exact) setRaw(String(value)); }, [value, exact]);
  return (
    <Question k={k} draft={draft} editable={editable} error={error}>
      {choices.length ? <Segmented k={k} value={value} choices={choices} editable={editable} onPick={v => { setExact(false); onSet(Number(v)); }} /> : null}
      {editable && (exact || !choices.length ? (
        <label className="flex items-center gap-2 text-sm">
          <span>Exact value</span>
          <input type="number" step="any" value={raw} onChange={e => { setRaw(e.target.value); onSet(e.target.value.trim() === "" ? NaN : Number(e.target.value)); }} aria-invalid={!!error || undefined}
            className={`w-40 border bg-background px-2 py-1 font-mono text-sm outline-none focus:border-primary ${error ? "border-destructive" : ""}`} data-testid={`input-${k}`} />
          {(SETTINGS_DOCS[k] as FieldDoc).unit && <span className="text-muted-foreground">{(SETTINGS_DOCS[k] as FieldDoc).unit}</span>}
        </label>
      ) : <button type="button" className="text-sm underline underline-offset-4" onClick={() => setExact(true)} data-testid={`button-exact-${k}`}>Exact value…</button>)}
    </Question>
  );
}

function AnyQuestion({ k, draft, editable, set, error }: { k: SettingsKey; draft: Settings; editable: boolean; set: <K extends SettingsKey>(key: K, value: Settings[K]) => void; error?: string }) {
  if (k === "commitClause") return <Question k={k} draft={draft} editable={editable}><Segmented k={k} value={draft.commitClause} choices={[false, true]} editable={editable} onPick={v => set("commitClause", v === true)} /></Question>;
  if (k === "objectSelection") return <Question k={k} draft={draft} editable={editable}><Segmented k={k} value={draft.objectSelection} choices={["uniform", "shelter"]} editable={editable} onPick={v => set("objectSelection", v as Settings["objectSelection"])} /></Question>;
  if (typeof draft[k] === "number") return <NumberQuestion k={k} draft={draft} editable={editable} onSet={v => set(k, v as never)} error={error} />;
  return <Question k={k} draft={draft} editable={false} />;
}

function More({ section, draft, children }: { section: SettingsSection; draft: Settings; children: ReactNode }) {
  const keys = fieldsOf(section).filter(k => SETTINGS_DOCS[k].tier === "more" && !isHidden(k, draft));
  return (
    <details className="border-l-2 pl-4 space-y-4" data-testid={`more-${section}`}>
      <summary className="cursor-pointer text-sm">More {SECTIONS.find(s => s.id === section)?.title.toLowerCase()} options ({keys.length})</summary>
      <div className="space-y-6 pt-3">{children}</div>
    </details>
  );
}

/** Single-option fields are facts, not questions. */
function Fixed({ keys, draft, options }: { keys: readonly SettingsKey[]; draft: Settings; options?: Manifest["options"] }) {
  if (!keys.length) return null;
  const label = (k: SettingsKey) => (options && (k === "grammarId" || k === "complexityFunctionId") ? options[k].find(o => o.id === draft[k])?.label : undefined) ?? String(draft[k]);
  return (
    <dl className="text-sm space-y-2">
      {keys.map(k => (
        <div key={k} data-testid={`fact-${k}`}>
          <dt className="label-mono">{LABELS[k]}</dt>
          <dd>{label(k)} <span className="text-muted-foreground">· {(SETTINGS_DOCS[k] as FieldDoc).consequence}</span></dd>
        </div>
      ))}
    </dl>
  );
}

/** The current object type's arguments, each with its question, meaning and consequence (ParamSchema docs). */
function ParamDocs({ type, args }: { type: ObjectTypeInfo; args: Record<string, number | string> }) {
  const params = type.params as readonly (ObjectTypeInfo["params"][number] & { question?: string; meaning?: string; consequence?: string })[];
  if (!params.some(p => p.question)) return null;
  return (
    <ul className="text-sm space-y-1.5 border-l-2 pl-3">
      {params.map(p => p.question && (
        <li key={p.id}><span className="font-medium">{p.question}</span> <span className="font-mono">{String({ ...type.defaults, ...args }[p.id])}</span>
          <span className="block text-muted-foreground">{p.meaning} {p.consequence}</span></li>
      ))}
    </ul>
  );
}

function PlayersAndAi({ room, editable, manifest, budgets, setBudgets, errors, openPalette }: {
  room: RoomState; editable: boolean; manifest?: Manifest; budgets: Budgets; setBudgets(b: Budgets): void;
  errors: { aiBudget: string | null; assistantBudget: string | null }; openPalette: (init?: { page?: string }) => void;
}) {
  const ais = room.members.filter(m => m.kind === "ai");
  if (manifest?.aiFunding.configured === false) return <p className="text-sm text-muted-foreground">AI players and assistants are not set up on this server. {room.members.length} players are in the room; a game needs {manifest.minimumPlayers}.</p>;
  const models = manifest?.aiFunding.models ?? [];
  const budgetChoice = (key: "aiBudget" | "assistantBudget") => {
    const doc = ROOM_BUDGET_DOCS[key];
    const choices = [...new Set([...(doc.suggested as readonly number[]), budgets[key]])].sort((a, b) => a - b);
    return (
      <div className="space-y-2" data-testid={`field-${key}`}>
        <h3 className="font-medium">{doc.question}</h3>
        <p className="text-sm text-muted-foreground">{doc.meaning} {doc.consequence}</p>
        {editable ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {choices.map(c => (
              <button key={c} type="button" role="radio" aria-checked={c === budgets[key]} onClick={() => setBudgets({ ...budgets, [key]: c })} data-testid={`choice-${key}-${c}`}
                className={`border px-3 py-1.5 text-sm ${c === budgets[key] ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-muted"}`}>{c === 0 ? "Off" : fmt(c)}</button>
            ))}
            <input type="number" min={0} step={1000} value={budgets[key]} onChange={e => setBudgets({ ...budgets, [key]: Number(e.target.value) })} aria-label={`Exact ${key === "aiBudget" ? "AI budget" : "assistant allowance"}`}
              className="w-36 border bg-background px-2 py-1 font-mono text-sm outline-none focus:border-primary" data-testid={`input-config-${key}`} />
          </div>
        ) : <p className="text-sm font-mono">{budgets[key] ? `${fmt(budgets[key])} tokens` : "off"}</p>}
        {errors[key] && <p className="text-sm text-destructive" role="alert">{errors[key]}</p>}
      </div>
    );
  };
  return (
    <div className="space-y-6">
      <div className="space-y-2" data-testid="field-aiSeats">
        <h3 className="font-medium">How many seats do AI players fill?</h3>
        <p className="text-sm text-muted-foreground">AI players play with the same information and actions as humans. More AI seats let games start without waiting, and each one draws on the AI budget.</p>
        <p className="text-sm">{ais.length ? ais.map(a => a.name).join(", ") : "No AI players yet."} {room.members.length} of {manifest?.minimumPlayers ?? 3}–{manifest?.maximumPlayers ?? 8} seats taken.</p>
        {editable && !room.activeGame && <p className="text-sm">
          <button type="button" className="underline underline-offset-4" onClick={() => openPalette({ page: "rooms.addAi" })} data-testid="button-config-add-ai">Add an AI player</button>
          {ais.length > 0 && <>{" · "}<button type="button" className="underline underline-offset-4" onClick={() => openPalette({ page: "rooms.removeAi" })}>Remove one</button></>}
          <span className="text-muted-foreground"> (seats change at once, not with Save)</span></p>}
      </div>
      {budgetChoice("aiBudget")}
      {budgetChoice("assistantBudget")}
      <div className="space-y-2" data-testid="field-assistantModel">
        <h3 className="font-medium">{ROOM_BUDGET_DOCS.assistantModel.question}</h3>
        <p className="text-sm text-muted-foreground">{ROOM_BUDGET_DOCS.assistantModel.meaning} {ROOM_BUDGET_DOCS.assistantModel.consequence}</p>
        {editable ? (
          <select value={budgets.assistantModel} onChange={e => setBudgets({ ...budgets, assistantModel: e.target.value })} data-testid="select-config-assistant-model"
            className="border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary">
            {(models.length ? models : [{ id: budgets.assistantModel, label: budgets.assistantModel, configured: true }]).map(m => <option key={m.id} value={m.id} disabled={!m.configured}>{m.label}{m.configured ? "" : " (not set up on this server)"}</option>)}
          </select>
        ) : <p className="text-sm">{models.find(m => m.id === budgets.assistantModel)?.label ?? budgets.assistantModel}</p>}
        <p className="text-xs text-muted-foreground">{costLine(budgets.assistantBudget, models.find(m => m.id === budgets.assistantModel), "per player per game")}</p>
      </div>
    </div>
  );
}


