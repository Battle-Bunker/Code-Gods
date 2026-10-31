/**
 * The configuration page, /rooms/:code/configure (onboarding-and-config.md §4): a long form with a stepper and a
 * sticky summary that asks every GameSettings field, each with its question, meaning and consequence from
 * SETTINGS_DOCS, in the order World → Goals → Agents → Energy → Population → Time → Players & AI → Review. It edits
 * the room's next-game settings directly. Owners edit; everyone else reads the same page.
 *
 * - Every control changes the draft through the settings model (game-core applySettingsChange, with the manifest's
 *   offered instantiations and the shipped family catalogue as its domain): a language moves its grammar and summon
 *   price, a new world takes its default instantiation and drops the families it lacks, and nothing else moves. The
 *   derived fields are shown as facts; type arguments are offered only as the server offers them.
 * - Choices are stepped (pre-authored values) plus "Exact value…", validated live by validateSettings.
 * - Save = owner.settings with the whole draft, then rooms.approveAiBudget if a budget changed (with consent).
 *   "Save as a setup…" keeps the draft under a name (setups.save), new or over one of the viewer's own.
 * - Settings saved elsewhere meanwhile replace an untouched draft; an edited draft is kept (saving puts it in their
 *   place) with an offer to load theirs. The draft survives a reload (localStorage).
 * - While a game runs the draft stays editable and Save waits, with the reason.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useAction, useMutation } from "convex/react";
import { ROOM_BUDGET_DOCS, SETTINGS_DOCS, SETUP_NAME_MAX, applySettingsChange, settingsOptionsFor, type FieldDoc, type SettingsSection } from "@workspace/game-core";
import { BadgeChips, RuleShelf, sameArgs } from "@workspace/object-views";
import { api, useLive } from "@/lib/convex";
import type { Manifest, ObjectTypeInfo, RoomState, Setup } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Page, usePage } from "@/components/layout";
import { Action } from "@/components/action";
import { ErrorLine } from "@/components/page-parts";
import { costLine } from "@/components/sheets";
import { settingsSummary } from "@/components/game-panels";
import { Skeleton } from "@/components/ui/skeleton";
import { errCode, errMsg, fmt } from "@/lib/errors";
import {
  BUDGET_LIMITS, LABELS, SECTIONS, choiceLabel, currentSetup, draftErrors, fieldsOf, formatValue, isHidden, lengthLine, limitError, paceWord,
  same, settingsDomain, shelfEntries, stepChoices, type Settings, type SettingsKey,
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
  const { manifest, setups, openPalette } = usePage();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const saveSettings = useAction(api.owner.settings);
  const approve = useMutation(api.rooms.approveAiBudget);
  const stored = useMemo(() => (editable ? loadDraft(room.id) : null), [room.id, editable]);
  const [base, setBase] = useState<Snapshot>(() => stored?.base ?? { settings: room.settings, revision: room.revision });
  const [draft, setDraft] = useState<Settings>(() => stored?.draft ?? room.settings);
  const [budgets, setBudgets] = useState<Budgets>(() => stored?.budgets ?? budgetsOf(room));
  const [consent, setConsent] = useState(false);
  const [elsewhere, setElsewhere] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const roomBudgets = budgetsOf(room);
  const dirtySettings = !same(draft, base.settings);
  const dirtyBudgets = !same(budgets, roomBudgets);
  const dirty = dirtySettings || dirtyBudgets;
  const types = manifest?.objectTypes ?? [];
  const domain = useMemo(() => settingsDomain(manifest?.objectTypes ?? []), [manifest]);

  // Budgets approved elsewhere (the AI spending sheet, another tab) replace the draft's unless edited here.
  const lastRoomBudgets = useRef(roomBudgets);
  useEffect(() => {
    const prev = lastRoomBudgets.current;
    lastRoomBudgets.current = roomBudgets;
    if (same(prev, roomBudgets)) return;
    setBudgets(b => (same(b, prev) ? roomBudgets : b));
  }, [room.aiBudget, room.assistantBudget, room.assistantModel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the draft across reloads; clear it once nothing differs.
  useEffect(() => { if (editable) saveDraft(room.id, dirty ? { base, draft, budgets } : null); }, [editable, room.id, base, draft, budgets, dirty]);

  // Settings saved elsewhere (another tab, the assistant): an untouched draft follows them; an edited one is kept
  // whole (saving puts it in their place) and the owner may load theirs instead.
  useEffect(() => {
    if (room.revision === base.revision) return;
    if (!dirtySettings || same(room.settings, draft)) { setDraft(room.settings); setElsewhere(false); }
    else if (!same(room.settings, base.settings)) setElsewhere(true);
    setBase({ settings: room.settings, revision: room.revision });
  }, [room.revision]); // eslint-disable-line react-hooks/exhaustive-deps

  /** One control's change, through the settings model; a refusal (a choice the server would refuse) is shown, the draft kept. */
  const change = (patch: Partial<Settings>) => {
    try { setDraft(applySettingsChange(draft, patch, domain)); setChangeError(null); } catch (e) { setChangeError(errMsg(e)); }
  };

  const errors = draftErrors(draft);
  const currentType = types.find(t => t.id === draft.objectType);
  const offered = currentType?.offered.find(o => sameArgs({ ...currentType.defaults, ...o.args }, { ...currentType.defaults, ...draft.typeArgs }));
  const budgetErrors = {
    aiBudget: limitError(BUDGET_LIMITS.aiBudget, budgets.aiBudget),
    assistantBudget: limitError({ ...BUDGET_LIMITS.assistantBudget, max: manifest?.aiFunding.assistantBudgetMax ?? BUDGET_LIMITS.assistantBudget.max }, budgets.assistantBudget),
  };
  const settingsInvalid = Object.keys(errors).length > 0 || (!!currentType && !offered);
  const invalid = settingsInvalid || !!budgetErrors.aiBudget || !!budgetErrors.assistantBudget;
  const running = room.activeGame;
  const budgetFrozen = !!running && budgets.aiBudget !== room.aiBudget;
  const saveBlocker = !editable ? null : running && dirtySettings ? `A game is running. Save this for the next game when game ${running.shortCode} ends.`
    : budgetFrozen ? `The AI players' budget can change after game ${running!.shortCode} ends.`
    : invalid ? "Fix the settings marked in red first." : dirtyBudgets && !consent ? "Tick the approval for the new spending first." : !dirty ? "Nothing has changed yet." : null;

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
      setSaveError(errCode(e) === "CONFLICT" ? `${errMsg(e)}. Your draft is kept; save again to put it in place of the newer settings.` : errMsg(e));
    } finally { setSaving(false); }
  };

  const setup = setups ? currentSetup(draft, same(draft, room.settings) ? room.settingsOrigin : null, setups) : undefined;
  const instance = room.objectInstance && same(draft.typeArgs, room.settings.typeArgs) && draft.objectType === room.settings.objectType ? room.objectInstance : undefined;

  return (
    <div className="mx-auto max-w-[1280px] px-4 md:px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6 rise">
        <div>
          <h1 className="font-display text-4xl md:text-5xl leading-none">{editable ? "Configure the next game" : "Settings of the next game"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Room {room.shortCode}. {editable ? "Nothing changes until you save; running games keep their own settings." : `Only the owner, ${room.ownerName}, can change these.`}</p>
        </div>
        <Link href={`/rooms/${room.shortCode}`} className="text-sm underline underline-offset-4" data-testid="link-back-to-room">Back to room {room.shortCode}</Link>
      </div>
      {elsewhere && (
        <p className="mb-4 border border-accent px-4 py-2 text-sm" data-testid="text-changed-elsewhere" role="status">
          The next game's settings were also changed elsewhere since you started. Saving puts yours in their place.{" "}
          <button type="button" className="underline" onClick={() => { setDraft(room.settings); setElsewhere(false); }} data-testid="button-load-theirs">Load theirs instead</button>
        </p>
      )}
      {changeError && <div className="mb-4"><ErrorLine message={changeError} /></div>}
      <div className="grid gap-8 lg:grid-cols-[11rem_minmax(0,1fr)_17rem]">
        <nav aria-label="Sections" className="hidden lg:block">
          <ol className="sticky top-20 space-y-1 text-sm">
            {SECTIONS.map((s, i) => (
              <li key={s.id}><a href={`#section-${s.id}`} className="flex items-center gap-2 py-1 hover:underline underline-offset-4">
                <span className="w-4 text-muted-foreground tabular-nums">{i + 1}</span>{s.title}
              </a></li>
            ))}
          </ol>
        </nav>
        <div className="space-y-10 min-w-0">
          <FormSection id="world">
            <Question k="objectType" draft={draft} editable={editable}>
              {types.length ? (
                <div role="radiogroup" aria-label={LABELS.objectType} className="flex flex-wrap gap-1.5">
                  {types.map(t => (
                    <button key={t.id} type="button" role="radio" aria-checked={t.id === draft.objectType} disabled={!editable} onClick={() => change({ objectType: t.id })}
                      data-testid={`choice-objectType-${t.id}`}
                      className={`border px-3 py-1.5 text-sm text-left ${t.id === draft.objectType ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-muted"} disabled:cursor-default`}>
                      <span className="font-medium">{t.emoji} {t.label}</span><span className="block text-xs text-muted-foreground">{t.kid}</span>
                    </button>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">Loading object types…</p>}
            </Question>
            <Question k="typeArgs" draft={draft} editable={editable}>
              {currentType && <ShapeChoice type={currentType} draft={draft} editable={editable} onPick={args => change({ typeArgs: args })} />}
              {currentType && <ParamDocs type={currentType} args={draft.typeArgs} />}
            </Question>
            <Question k="language" draft={draft} editable={editable}>
              <select value={draft.language} disabled={!editable} onChange={e => change({ language: e.target.value as Settings["language"] })} data-testid="select-language"
                className="border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary">
                <option value="python">Python</option><option value="typescript">TypeScript</option>
              </select>
            </Question>
            <Fixed keys={["grammarId", "complexityFunctionId"]} draft={draft} options={manifest?.options} />
          </FormSection>

          <FormSection id="goals">
            <Question k="utilitySelectorId" draft={draft} editable={editable}>
              <Segmented k="utilitySelectorId" value={draft.utilitySelectorId} editable={editable} onPick={v => change({ utilitySelectorId: String(v) })}
                choices={settingsOptionsFor("utilitySelectorId", draft.language, draft.objectType).map(o => o.id)} />
            </Question>
            <NumberQuestion k="defenceRate" draft={draft} editable={editable} onSet={v => change({ defenceRate: v })} error={errors.defenceRate} />
            <More section="goals" draft={draft}>
              <Question k="excludedFamilies" draft={draft} editable={editable}>
                <RuleShelf title="Rules that can be dealt" entries={shelfEntries(draft.objectType, draft.typeArgs, draft.excludedFamilies)}
                  badges={(currentType?.classes ?? []).map(c => c.badge)}
                  onToggleExcluded={editable ? (familyId, out) => change({ excludedFamilies: out ? [...draft.excludedFamilies, familyId] : draft.excludedFamilies.filter(x => x !== familyId) }) : undefined} />
              </Question>
              {!isHidden("penaltyWeight", draft) && <NumberQuestion k="penaltyWeight" draft={draft} editable={editable} onSet={v => change({ penaltyWeight: v })} error={errors.penaltyWeight} />}
            </More>
            <Fixed keys={["priorId"]} draft={draft} />
          </FormSection>

          {(["agents", "energy", "population", "time"] as const).map(section => (
            <FormSection key={section} id={section}>
              {fieldsOf(section).filter(k => SETTINGS_DOCS[k].tier === "ask").map(k => <AnyQuestion key={k} k={k} draft={draft} editable={editable} change={change} error={errors[k]} />)}
              {fieldsOf(section).some(k => SETTINGS_DOCS[k].tier === "more") && (
                <More section={section} draft={draft}>
                  {fieldsOf(section).filter(k => SETTINGS_DOCS[k].tier === "more" && !isHidden(k, draft)).map(k => <AnyQuestion key={k} k={k} draft={draft} editable={editable} change={change} error={errors[k]} />)}
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
              <div className="border bg-card px-4 py-3 text-sm" data-testid="card-summary">
                <p className="font-medium">{setup ? `${setup.name}${setup.seeded ? "" : " (yours)"}` : "Custom"}</p>
                <p className="text-muted-foreground">{setup ? `${setup.summary}. ` : ""}{settingsSummary(draft, instance)}</p>
              </div>
              {errors._form && <ErrorLine message={errors._form} />}
              {currentType && !offered && <ErrorLine message={`${formatValue("typeArgs", draft.typeArgs)} is not offered on this server: choose one of the listed shapes.`} />}
              {editable && dirtyBudgets && (
                <label className="flex items-start gap-2 text-sm text-muted-foreground" data-testid="block-consent">
                  <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1 accent-[hsl(var(--primary))]" data-testid="checkbox-config-consent" />
                  I approve AI players using up to {fmt(budgets.aiBudget)} tokens per game and each player's assistant up to {fmt(budgets.assistantBudget)} tokens per game in this room, billed to the server owner's provider accounts.
                </label>
              )}
              {editable && (<>
                <p className="text-sm" data-testid="text-unsaved">{dirty ? "You have unsaved changes for the next game." : "Nothing to save yet."}</p>
                <div className="flex flex-wrap items-center gap-4">
                  <Action k="owner.settings" label={saving ? "Saving…" : "Save for the next game"} tone="primary" onClick={() => void save()} unavailable={saveBlocker} pending={saving} testId="button-save-settings" showReason />
                  <Link href={`/rooms/${room.shortCode}`} className="text-sm underline underline-offset-4">Cancel</Link>
                </div>
                {saveError && <ErrorLine message={saveError} />}
              </>)}
              <SaveAsSetup draft={draft} setups={setups} blocker={settingsInvalid ? "Fix the settings marked in red first." : null} />
            </div>
          </FormSection>
        </div>
        <aside className="lg:block">
          <div className="lg:sticky lg:top-20 border bg-card p-4 space-y-2 text-sm" data-testid="panel-summary">
            <p className="font-medium">Summary</p>
            <p data-testid="text-summary-setup">{setup ? setup.name : "Custom"}</p>
            <p>{currentType ? `${currentType.emoji} ${currentType.label}` : draft.objectType} · {offered?.label ?? Object.values(draft.typeArgs).join(" · ")}</p>
            <p>{draft.language === "python" ? "Python" : "TypeScript"}</p>
            <p>{fmt(draft.startingObjectCount)} objects, +{draft.spawnRateHz}/s</p>
            <p>{lengthLine(draft)} · {paceWord(draft.interactionRateHz)} pace</p>
            <p>{room.members.length} of {manifest?.minimumPlayers ?? 3}–{manifest?.maximumPlayers ?? 8} players ({room.members.filter(m => m.kind === "ai").length} AI)</p>
            <p>AI budget: {fmt(budgets.aiBudget)} · Assistant: {budgets.assistantBudget ? fmt(budgets.assistantBudget) : "off"}</p>
            {editable && dirty && <p className="text-primary">Unsaved changes</p>}
            {editable && <a href="#section-review" className="underline underline-offset-4">Review and save</a>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function FormSection({ id, children }: { id: (typeof SECTIONS)[number]["id"]; children: ReactNode }) {
  const s = SECTIONS.find(x => x.id === id)!;
  const n = SECTIONS.indexOf(s) + 1;
  return (
    <section id={`section-${id}`} className="scroll-mt-20 space-y-4" data-testid={`section-${id}`}>
      <div className="border-b pb-2">
        <h2 className="font-display text-2xl"><span className="text-muted-foreground tabular-nums mr-2">{n}</span>{s.title}</h2>
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
      {editable || k === "objectType" || k === "typeArgs" || k === "excludedFamilies" ? children : <p className="text-sm font-mono" data-testid={`value-${k}`}>{formatValue(k, draft[k])}</p>}
      {error && <p className="text-sm text-destructive" role="alert" data-testid={`error-${k}`}>{error}</p>}
    </div>
  );
}

/** The object's shape: exactly the instantiations the server offers for this type (each has calibration tables). */
function ShapeChoice({ type, draft, editable, onPick }: { type: ObjectTypeInfo; draft: Settings; editable: boolean; onPick: (args: Settings["typeArgs"]) => void }) {
  const full = (args: Record<string, number | string>) => ({ ...type.defaults, ...args });
  const selected = type.offered.findIndex(o => sameArgs(full(o.args), full(draft.typeArgs)));
  const chosen = type.offered[selected];
  return (
    <div className="space-y-2">
      <select value={selected} disabled={!editable} onChange={e => { const o = type.offered[Number(e.target.value)]; if (o) onPick(o.args); }} data-testid="select-typeArgs"
        className="max-w-full border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary">
        {selected < 0 && <option value={-1} disabled>{formatValue("typeArgs", draft.typeArgs)} (not offered on this server)</option>}
        {type.offered.map((o, i) => <option key={o.key} value={i}>{o.label}</option>)}
      </select>
      {chosen && <div><BadgeChips badges={chosen.badges} /></div>}
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

function AnyQuestion({ k, draft, editable, change, error }: { k: SettingsKey; draft: Settings; editable: boolean; change: (patch: Partial<Settings>) => void; error?: string }) {
  if (k === "commitClause") return <Question k={k} draft={draft} editable={editable}><Segmented k={k} value={draft.commitClause} choices={[false, true]} editable={editable} onPick={v => change({ commitClause: v === true })} /></Question>;
  if (k === "objectSelection") return <Question k={k} draft={draft} editable={editable}><Segmented k={k} value={draft.objectSelection} choices={["uniform", "shelter"]} editable={editable} onPick={v => change({ objectSelection: v as Settings["objectSelection"] })} /></Question>;
  if (typeof draft[k] === "number") return <NumberQuestion k={k} draft={draft} editable={editable} onSet={v => change({ [k]: v })} error={error} />;
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

/** Fields that follow from others, or have one option, are facts, not questions. */
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

/**
 * "Save as a setup…": the draft under a name (at most SETUP_NAME_MAX characters), as a new setup of the viewer's or
 * over one they may change (their own; an admin also the defaults). Their own setups are listed with Delete.
 */
function SaveAsSetup({ draft, setups, blocker }: { draft: Settings; setups?: Setup[]; blocker: string | null }) {
  const { toast } = useToast();
  const save = useAction(api.setups.save);
  const remove = useMutation(api.setups.remove);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const mine = (setups ?? []).filter(s => s.mine);
  const editableDefaults = (setups ?? []).filter(s => s.seeded && s.editable);
  const trimmed = name.trim().replace(/\s+/g, " ");
  const over = mine.find(s => s.name.toLowerCase() === trimmed.toLowerCase());
  const nameProblem = !trimmed ? "Give the setup a name." : trimmed.length > SETUP_NAME_MAX ? `At most ${SETUP_NAME_MAX} characters.` : null;
  const run = async (what: string, call: () => Promise<unknown>) => {
    setPending(true); setError(null);
    try { await call(); toast({ title: what }); } catch (e) { setError(errMsg(e)); } finally { setPending(false); }
  };
  const saveAs = (target?: Setup) => run(`Saved the setup ${target?.name ?? trimmed}`, async () => {
    await save({ name: target ? target.name : trimmed, settings: draft, ...(target ? { setupId: target.id } : over ? { setupId: over.id } : {}) });
    if (!target) setName("");
  });
  const row = (s: Setup) => (
    <li key={s.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5" data-testid={`row-setup-${s.id}`}>
      <span className="font-medium">{s.name}</span>
      <span className="text-xs text-muted-foreground min-w-0 flex-1">{s.summary}</span>
      <Action k="setups.save" label="Save over" tone="link" onClick={() => void saveAs(s)} unavailable={blocker} pending={pending} testId={`button-save-over-${s.id}`} />
      <Action k="setups.remove" label={armed === s.id ? "Select again to delete" : "Delete"} tone="link" pending={pending} testId={`button-delete-setup-${s.id}`}
        onClick={() => { if (armed !== s.id) { setArmed(s.id); return; } setArmed(null); void run(`Deleted the setup ${s.name}`, () => remove({ setupId: s.id })); }} />
    </li>
  );
  return (
    <details className="border-t pt-4 space-y-3 text-sm" data-testid="block-save-as-setup">
      <summary className="cursor-pointer font-medium">Save as a setup…</summary>
      <p className="text-muted-foreground">Keeps these settings under a name you can pick from the Setup menu of any of your rooms. It changes no room.</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span>Name</span>
          <input value={name} maxLength={SETUP_NAME_MAX + 10} onChange={e => setName(e.target.value)} aria-invalid={!!name && !!nameProblem || undefined}
            className="w-64 border bg-background px-2 py-1 text-sm outline-none focus:border-primary" data-testid="input-setup-name" />
        </label>
        <Action k="setups.save" label={over ? `Save over ${over.name}` : "Save as a setup"} onClick={() => void saveAs()} unavailable={blocker ?? (name ? nameProblem : "Give the setup a name.")}
          pending={pending} testId="button-save-setup" />
      </div>
      {name && nameProblem && <p className="text-destructive" role="alert">{nameProblem}</p>}
      {over && !nameProblem && <p className="text-muted-foreground">You already have a setup called {over.name}: saving replaces its settings.</p>}
      {error && <ErrorLine message={error} />}
      <div>
        <h3 className="font-medium">Your setups</h3>
        {mine.length ? <ul className="divide-y" data-testid="list-your-setups">{mine.map(row)}</ul> : <p className="text-muted-foreground">None yet.</p>}
      </div>
      {editableDefaults.length > 0 && (
        <div>
          <h3 className="font-medium">Defaults (you are an admin)</h3>
          <ul className="divide-y">{editableDefaults.map(row)}</ul>
        </div>
      )}
    </details>
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
