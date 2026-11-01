/**
 * The configuration page, /rooms/:code/configure[?setup=<id>] (onboarding-and-config.md §4, docs/ui-redesign.md §2.4):
 * it edits ONE game setup, the one named by `setup` or else the one the room runs. Its name is the first field; then a
 * long form with a stepper and a sticky summary asks every GameSettings field, each with its question, meaning and
 * consequence from SETTINGS_DOCS, in the order World → Goals → Agents → Energy → Population → Time → Players & AI →
 * Review. Every field is a real control (SETTINGS_DOCS[k].control): nothing a game needs is a read-only fact.
 *
 * - Only the setup's owner edits it. Anyone else (and everyone, for a system setup) reads the same form with every
 *   control disabled and one primary action, "Duplicate and edit", which makes their own copy and opens it here.
 * - Every control changes the draft through the settings model (game-core applySettingsChange, with the manifest's
 *   playable instantiations and the shipped family catalogue as its domain): a language moves its grammar and summon
 *   price, a new world takes its default instantiation and drops the families it lacks, and nothing else moves. The
 *   board shape is one control per type argument; every playable combination is enabled (only a retired one, 3×3, is
 *   not), and a shape whose first game computes rule tables says so in a light note with the measured time.
 * - Defence goals are a switch plus a checklist of the defence goals that may be dealt: on, every player gets one.
 * - Save writes the setup (setups.save) and, for the room's owner while no game runs, applies it to the room
 *   (owner.settings {setupId}); budgets approve with consent (rooms.approveAiBudget). Delete is in the review section.
 * - The draft survives a reload (localStorage, per setup). A setup saved elsewhere meanwhile replaces an untouched draft;
 *   an edited draft is kept (saving puts it in its place) with an offer to load theirs.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { useAction, useMutation } from "convex/react";
import {
  LANGUAGES, ROOM_BUDGET_DOCS, SETTINGS_DOCS, SETUP_NAME_MAX, applySettingsChange, settingsOptionsFor, type FieldDoc, type OptionKey, type SettingsSection,
} from "@workspace/game-core";
import { BadgeChips, RuleShelf, sameArgs } from "@workspace/object-views";
import { api, useLive } from "@/lib/convex";
import type { Manifest, ObjectTypeInfo, RoomState, SetupFull } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Page, usePage } from "@/components/layout";
import { Action } from "@/components/action";
import { ErrorLine } from "@/components/page-parts";
import { costLine } from "@/components/sheets";
import { SettingsList, settingsSummary } from "@/components/game-panels";
import { Skeleton } from "@/components/ui/skeleton";
import { errCode, errMsg, fmt } from "@/lib/errors";
import {
  BUDGET_LIMITS, LABELS, SECTIONS, argChoices, choiceLabel, defenceBlocker, draftErrors, fieldsOf, formatValue, isHidden, lengthLine, limitError, paceWord,
  dealerNote, firstUseNote, same, settingsDomain, shelfEntries, stepChoices, type PlayableTypes, type Settings, type SettingsKey,
} from "@/lib/settings-form";
import { freeName, ownerLabel } from "@/lib/setup-words";

type Budgets = { aiBudget: number; assistantBudget: number; assistantModel: string };
type Base = { settings: Settings; name: string; updatedAt: number };
type Stored = { base: Base; draft: Settings; name: string; budgets: Budgets };
/** A draft belongs to one setup as edited from one room (the budgets in it are that room's). */
const draftKey = (key: string) => `code-gods:setup-draft:${key}`;
const loadDraft = (key: string): Stored | null => { try { const raw = window.localStorage.getItem(draftKey(key)); return raw ? JSON.parse(raw) as Stored : null; } catch { return null; } };
const saveDraft = (key: string, s: Stored | null) => { try { if (s) window.localStorage.setItem(draftKey(key), JSON.stringify(s)); else window.localStorage.removeItem(draftKey(key)); } catch { /* a convenience */ } };
const budgetsOf = (room: RoomState): Budgets => ({ aiBudget: room.aiBudget, assistantBudget: room.assistantBudget ?? 0, assistantModel: room.assistantModel });
const tidyName = (raw: string) => raw.trim().replace(/\s+/g, " ");
const PRIOR_LABELS: Record<string, string> = { uniform: "Uniformly random objects (the spawn prior)" };
const LANGUAGE_LABELS: Record<string, string> = { python: "Python", typescript: "TypeScript" };

export default function Configure() {
  const { id = "" } = useParams<{ id: string }>();
  const requested = new URLSearchParams(useSearch()).get("setup");
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const q = useLive(api.rooms.get, isAuthenticated && id ? { room: id } : "skip");
  const room = q.data;
  const setupId = requested ?? room?.setup?.id ?? null;
  const sq = useLive(api.setups.get, isAuthenticated && setupId ? { setupId } : "skip");
  const code = room?.shortCode ?? id.toUpperCase();
  useEffect(() => { document.title = `${sq.data ? `${sq.data.name} · ` : ""}Configure ${code} · Code Gods`; }, [code, sq.data?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Page room={room ?? null} crumbs={[{ label: code, href: `/rooms/${code}` }, { label: "Configure" }]} placeholder={`Search or do anything in ${code}`}>
      <div data-testid="page-configure">
        {authLoading ? null : !isAuthenticated ? <p className="mx-auto max-w-lg px-4 py-20">Sign in to see this room's settings.</p>
        : q.isLoading || (setupId && sq.isLoading) ? <div className="mx-auto max-w-[1200px] px-4 md:px-6 py-8 space-y-4"><Skeleton className="h-12 w-1/2" /><Skeleton className="h-96" /></div>
        : !room ? <div className="mx-auto max-w-lg px-4 py-20"><ErrorLine message={q.error ? errMsg(q.error) : "Room not found. Check the code, or ask the owner for the link."} /></div>
        : !requested && room.setup?.deleted ? <DeletedSetup room={room} roomOwner={room.ownerId === user?.id} />
        : !setupId || !sq.data ? <div className="mx-auto max-w-lg px-4 py-20 space-y-3"><ErrorLine message={sq.error ? errMsg(sq.error) : "This room runs no game setup yet."} />
            <Link href={`/rooms/${room.shortCode}`} className="underline underline-offset-4">Back to room {room.shortCode}</Link></div>
        : <ConfigureForm key={sq.data.id} room={room} setup={sq.data} roomOwner={room.ownerId === user?.id} />}
      </div>
    </Page>
  );
}

function ConfigureForm({ room, setup, roomOwner }: { room: RoomState; setup: SetupFull; roomOwner: boolean }) {
  const { manifest, openPalette, act } = usePage();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const saveSetup = useAction(api.setups.save);
  const removeSetup = useMutation(api.setups.remove);
  const applyToRoom = useAction(api.owner.settings);
  const approve = useMutation(api.rooms.approveAiBudget);
  const editable = setup.editable;
  // The budgets are the room's: its owner sets them here whoever owns the setup.
  const budgetsEditable = roomOwner;
  const key = `${room.id}:${setup.id}`;
  const fresh: Base = { settings: setup.settings, name: setup.name, updatedAt: setup.updatedAt };
  const stored = useMemo(() => (editable || roomOwner ? loadDraft(key) : null), [key, editable, roomOwner]);
  const [base, setBase] = useState<Base>(() => stored?.base ?? fresh);
  const [draft, setDraft] = useState<Settings>(() => stored?.draft ?? setup.settings);
  const [name, setName] = useState(() => stored?.name ?? setup.name);
  const [budgets, setBudgets] = useState<Budgets>(() => stored?.budgets ?? budgetsOf(room));
  const [consent, setConsent] = useState(false);
  const [elsewhere, setElsewhere] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const roomBudgets = budgetsOf(room);
  const dirtySettings = !same(draft, base.settings);
  const dirtyName = tidyName(name) !== base.name;
  const dirtyBudgets = budgetsEditable && !same(budgets, roomBudgets);
  const roomOnIt = room.setup?.id === setup.id && same(room.settings, draft);
  const dirty = dirtySettings || dirtyName || dirtyBudgets;
  const types = manifest?.objectTypes ?? [];
  const domain = useMemo(() => settingsDomain((manifest?.objectTypes ?? []) as unknown as PlayableTypes[]), [manifest]);

  // Budgets approved elsewhere (the AI spending sheet, another tab) replace the draft's unless edited here.
  const lastRoomBudgets = useRef(roomBudgets);
  useEffect(() => {
    const prev = lastRoomBudgets.current;
    lastRoomBudgets.current = roomBudgets;
    if (same(prev, roomBudgets)) return;
    setBudgets(b => (same(b, prev) ? roomBudgets : b));
  }, [room.aiBudget, room.assistantBudget, room.assistantModel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the draft across reloads; clear it once nothing differs.
  useEffect(() => { if (editable || roomOwner) saveDraft(key, dirty ? { base, draft, name, budgets } : null); }, [editable, roomOwner, key, base, draft, name, budgets, dirty]);

  // The setup saved elsewhere (another tab, the assistant): an untouched draft follows it; an edited one is kept whole
  // (saving puts it in its place) and the owner may load theirs instead.
  useEffect(() => {
    if (setup.updatedAt === base.updatedAt) return;
    if (!dirtySettings || same(setup.settings, draft)) { setDraft(setup.settings); setElsewhere(false); }
    else if (!same(setup.settings, base.settings)) setElsewhere(true);
    if (!dirtyName) setName(setup.name);
    setBase(fresh);
  }, [setup.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  /** One control's change, through the settings model; a refusal (a choice the server would refuse) is shown, the draft kept. */
  const change = (patch: Partial<Settings>) => {
    if (!editable) return;
    try { setDraft(applySettingsChange(draft, patch, domain)); setChangeError(null); } catch (e) { setChangeError(errMsg(e)); }
  };

  const errors = draftErrors(draft, domain);
  const currentType = types.find(t => t.id === draft.objectType);
  const playable = currentType?.playable.find(o => sameArgs({ ...currentType.defaults, ...o.args }, { ...currentType.defaults, ...draft.typeArgs }));
  const budgetErrors = {
    aiBudget: limitError(BUDGET_LIMITS.aiBudget, budgets.aiBudget),
    assistantBudget: limitError({ ...BUDGET_LIMITS.assistantBudget, max: manifest?.aiFunding.assistantBudgetMax ?? BUDGET_LIMITS.assistantBudget.max }, budgets.assistantBudget),
  };
  const trimmed = tidyName(name);
  const nameProblem = !trimmed ? "Give the setup a name." : trimmed.length > SETUP_NAME_MAX ? `At most ${SETUP_NAME_MAX} characters.` : null;
  const settingsInvalid = Object.keys(errors).length > 0;
  const invalid = settingsInvalid || !!nameProblem || (dirtyBudgets && (!!budgetErrors.aiBudget || !!budgetErrors.assistantBudget));
  const running = room.activeGame;
  const budgetFrozen = !!running && dirtyBudgets && budgets.aiBudget !== room.aiBudget;
  const willApply = roomOwner && !running;
  const saveBlocker = !editable && !budgetsEditable ? null : !editable ? (budgetFrozen ? `The AI players' budget can change after game ${running!.shortCode} ends.`
      : dirtyBudgets && (budgetErrors.aiBudget || budgetErrors.assistantBudget) ? "Fix the budgets marked in red first."
      : dirtyBudgets && !consent ? "Tick the approval for the new spending first." : !dirtyBudgets ? "Nothing has changed yet." : null)
    : invalid ? "Fix the settings marked in red first."
    : budgetFrozen ? `The AI players' budget can change after game ${running!.shortCode} ends.`
    : dirtyBudgets && !consent ? "Tick the approval for the new spending first."
    : !dirty && (!willApply || roomOnIt) ? "Nothing has changed yet." : null;

  const save = async () => {
    if (saveBlocker || saving) return;
    setSaving(true); setSaveError(null);
    try {
      if (!editable) {
        await approve({ roomId: room.id, aiBudget: budgets.aiBudget, assistantBudget: budgets.assistantBudget, assistantModel: budgets.assistantModel });
        saveDraft(key, null);
        toast({ title: "Saved the room's budgets" });
        return;
      }
      if (dirtySettings || dirtyName) await saveSetup({ setupId: setup.id, name: trimmed, settings: draft });
      let applied = false;
      if (willApply && !roomOnIt) {
        await applyToRoom({ roomId: room.id, revision: room.revision, setupId: setup.id });
        applied = true;
      }
      if (dirtyBudgets) await approve({ roomId: room.id, aiBudget: budgets.aiBudget, assistantBudget: budgets.assistantBudget, assistantModel: budgets.assistantModel });
      saveDraft(key, null);
      toast({ title: `Saved ${trimmed}`, description: applied || roomOnIt ? `Room ${room.shortCode}'s next game runs it.`
        : running && roomOwner ? `Game ${running.shortCode} is running: pick it for the next game when it ends.` : "It changes no room until its owner picks it." });
      navigate(`/rooms/${room.shortCode}`);
    } catch (e) {
      setSaveError(errCode(e) === "CONFLICT" ? `${errMsg(e)}. Your draft is kept; save again.` : errMsg(e));
    } finally { setSaving(false); }
  };
  const duplicateAndEdit = () => { void act.duplicateSetup(setup.id).catch(e => setSaveError(errMsg(e))); };

  const instance = room.objectInstance && same(draft.typeArgs, room.settings.typeArgs) && draft.objectType === room.settings.objectType ? room.objectInstance : undefined;
  const owner = ownerLabel(setup);

  return (
    <div className="mx-auto max-w-[1280px] px-4 md:px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6 rise">
        <div className="min-w-0">
          <h1 className="font-display text-4xl md:text-5xl leading-none break-words" data-testid="text-setup-title">{editable ? "Edit your setup" : setup.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground" data-testid="text-setup-owner">
            {setup.system ? "A system setup: nobody can edit it." : editable ? "Your setup." : `${owner}'s setup: only ${owner} can edit it.`}
            {" "}{editable ? (willApply ? `Saving also puts room ${room.shortCode}'s next game on it.` : `Saving changes the setup; room ${room.shortCode} ${roomOwner ? `takes it after game ${running?.shortCode} ends` : "changes only when its owner picks it"}.`)
              : "Duplicate it to make your own copy and edit that."}
          </p>
        </div>
        <Link href={`/rooms/${room.shortCode}`} className="text-sm underline underline-offset-4" data-testid="link-back-to-room">Back to room {room.shortCode}</Link>
      </div>
      {!editable && (
        <div className="mb-6 flex flex-wrap items-center gap-3 border bg-card px-4 py-3">
          <Action k="setups.duplicate" label="Duplicate and edit" tone="primary" onClick={duplicateAndEdit} testId="button-duplicate-and-edit" />
          <span className="text-sm text-muted-foreground">Makes your own copy named "{setup.name}'s copy" at once; delete it from its page if you do not need it.</span>
        </div>
      )}
      {elsewhere && (
        <p className="mb-4 border border-accent px-4 py-2 text-sm" data-testid="text-changed-elsewhere" role="status">
          This setup was also saved elsewhere since you started. Saving puts yours in its place.{" "}
          <button type="button" className="underline" onClick={() => { setDraft(setup.settings); setElsewhere(false); }} data-testid="button-load-theirs">Load theirs instead</button>
        </p>
      )}
      {changeError && <div className="mb-4"><ErrorLine message={changeError} /></div>}
      <div className="grid gap-8 lg:grid-cols-[11rem_minmax(0,1fr)_17rem]">
        <nav aria-label="Sections" className="hidden lg:block">
          <ol className="sticky top-20 space-y-1 text-sm">
            <li><a href="#field-name" className="flex items-center gap-2 py-1 hover:underline underline-offset-4"><span className="w-4" />Name</a></li>
            {SECTIONS.map((s, i) => (
              <li key={s.id}><a href={`#section-${s.id}`} className="flex items-center gap-2 py-1 hover:underline underline-offset-4">
                <span className="w-4 text-muted-foreground tabular-nums">{i + 1}</span>{s.title}
              </a></li>
            ))}
          </ol>
        </nav>
        <div className="space-y-10 min-w-0">
          <div className="space-y-2 scroll-mt-20" id="field-name" data-testid="field-name">
            <label htmlFor="input-setup-name" className="font-medium block">What is this setup called?</label>
            <p className="text-sm text-muted-foreground">Everyone finds setups by name in the Setup list; names are unique among your own setups.</p>
            <input id="input-setup-name" value={name} maxLength={SETUP_NAME_MAX + 10} disabled={!editable} onChange={e => setName(e.target.value)}
              aria-invalid={!!nameProblem || undefined} data-testid="input-setup-name"
              className={`w-full max-w-md border bg-background px-3 py-2 text-lg outline-none focus:border-primary disabled:opacity-80 ${nameProblem ? "border-destructive" : ""}`} />
            {editable && nameProblem && <p className="text-sm text-destructive" role="alert" data-testid="error-name">{nameProblem}</p>}
          </div>

          {(["world", "goals", "agents", "energy", "population", "time"] as const).map(section => (
            <FormSection key={section} id={section}>
              {fieldsOf(section).filter(k => SETTINGS_DOCS[k].tier === "ask" && !isHidden(k, draft)).map(k => (
                <Field key={k} k={k} draft={draft} editable={editable} change={change} error={errors[k]} manifest={manifest} type={currentType} />
              ))}
              {fieldsOf(section).some(k => SETTINGS_DOCS[k].tier === "more") && (
                <More section={section} draft={draft}>
                  {fieldsOf(section).filter(k => SETTINGS_DOCS[k].tier === "more" && !isHidden(k, draft)).map(k => (
                    <Field key={k} k={k} draft={draft} editable={editable} change={change} error={errors[k]} manifest={manifest} type={currentType} />
                  ))}
                </More>
              )}
            </FormSection>
          ))}

          <FormSection id="players">
            <PlayersAndAi room={room} editable={budgetsEditable} manifest={manifest} budgets={budgets} setBudgets={b => { setBudgets(b); setConsent(false); }}
              errors={budgetErrors} openPalette={openPalette} />
          </FormSection>

          <FormSection id="review">
            <div className="space-y-4" data-testid="panel-review">
              <div className="border bg-card px-4 py-3 text-sm" data-testid="card-summary">
                <p className="font-medium">{trimmed || setup.name} <span className="text-muted-foreground font-normal">· {owner}</span></p>
                <p className="text-muted-foreground">{settingsSummary(draft, instance)}</p>
              </div>
              {errors._form && <ErrorLine message={errors._form} />}
              {budgetsEditable && dirtyBudgets && (
                <label className="flex items-start gap-2 text-sm text-muted-foreground" data-testid="block-consent">
                  <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1 accent-[hsl(var(--primary))]" data-testid="checkbox-config-consent" />
                  I approve AI players using up to {fmt(budgets.aiBudget)} tokens per game and each player's assistant up to {fmt(budgets.assistantBudget)} tokens per game in this room, billed to the server owner's provider accounts.
                </label>
              )}
              {editable ? (<>
                <p className="text-sm" data-testid="text-unsaved">{dirty ? "You have unsaved changes." : willApply && !roomOnIt ? `Saving puts room ${room.shortCode} on this setup.` : "Nothing to save yet."}</p>
                <div className="flex flex-wrap items-center gap-4">
                  <Action k="setups.save" label={saving ? "Saving…" : willApply ? "Save and use for the next game" : "Save the setup"} tone="primary" onClick={() => void save()}
                    unavailable={saveBlocker} pending={saving} testId="button-save-settings" showReason />
                  <Link href={`/rooms/${room.shortCode}`} className="text-sm underline underline-offset-4">Cancel</Link>
                </div>
                {saveError && <ErrorLine message={saveError} />}
                <DeleteSetup setup={setup} onDeleted={() => { saveDraft(key, null); navigate(`/rooms/${room.shortCode}`); }} remove={() => removeSetup({ setupId: setup.id })}
                  usedHere={room.setup?.id === setup.id} />
              </>) : (<>
                <Action k="setups.duplicate" label="Duplicate and edit" tone="primary" onClick={duplicateAndEdit} testId="button-duplicate-and-edit-review" />
                {budgetsEditable && dirtyBudgets && (
                  <Action k="rooms.approveAiBudget" label={saving ? "Saving…" : "Save the room's budgets"} onClick={() => void save()} unavailable={saveBlocker} pending={saving} testId="button-save-budgets" showReason />
                )}
                {saveError && <ErrorLine message={saveError} />}
              </>)}
            </div>
          </FormSection>
        </div>
        <aside className="lg:block">
          <div className="lg:sticky lg:top-20 border bg-card p-4 space-y-2 text-sm" data-testid="panel-summary">
            <p className="font-medium">Summary</p>
            <p data-testid="text-summary-setup">{trimmed || setup.name}</p>
            <p className="text-muted-foreground">{owner}</p>
            <p>{currentType ? `${currentType.emoji} ${currentType.label}` : draft.objectType} · {playable?.label ?? Object.values(draft.typeArgs).join(" · ")}</p>
            <p>{draft.language === "python" ? "Python" : "TypeScript"}</p>
            <p>Defence goals: {draft.defenceGoals ? "every player" : "off"}</p>
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

/**
 * The room's setup was deleted: the room keeps its settings (a snapshot), shown here; its owner can keep them as a new
 * setup of theirs ("<name>'s copy"), which the room then runs and which opens here for editing.
 */
function DeletedSetup({ room, roomOwner }: { room: RoomState; roomOwner: boolean }) {
  const { setups } = usePage();
  const [, navigate] = useLocation();
  const save = useAction(api.setups.save);
  const apply = useAction(api.owner.settings);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = room.setup!.name;
  const keep = async () => {
    setPending(true); setError(null);
    try {
      const mine = (setups ?? []).filter(s => s.mine).map(s => s.name);
      const copy = await save({ name: freeName(name, "'s copy", mine), settings: room.settings });
      if (!room.activeGame) await apply({ roomId: room.id, revision: room.revision, setupId: copy.id });
      navigate(`/rooms/${room.shortCode}/configure?setup=${encodeURIComponent(copy.id)}`);
    } catch (e) { setError(errMsg(e)); } finally { setPending(false); }
  };
  return (
    <div className="mx-auto max-w-[900px] px-4 md:px-6 py-8 space-y-4" data-testid="panel-deleted-setup">
      <h1 className="font-display text-4xl leading-none">{name} (deleted)</h1>
      <p className="text-sm text-muted-foreground">The setup room {room.shortCode} runs was deleted. The room keeps its settings for the next game; they are listed here.</p>
      {roomOwner && <Action k="setups.save" label={pending ? "Saving…" : "Keep these settings as my setup"} tone="primary" onClick={() => void keep()} pending={pending} testId="button-keep-deleted-setup" />}
      {error && <ErrorLine message={error} />}
      <div className="border bg-card p-4"><SettingsList settings={room.settings} instance={room.objectInstance} /></div>
      <Link href={`/rooms/${room.shortCode}`} className="text-sm underline underline-offset-4">Back to room {room.shortCode}</Link>
    </div>
  );
}

/** Delete the setup (owner only), with a second press to confirm. Rooms that run it keep their settings. */
function DeleteSetup({ setup, remove, onDeleted, usedHere }: { setup: SetupFull; remove: () => Promise<unknown>; onDeleted: () => void; usedHere: boolean }) {
  const { toast } = useToast();
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 5000); return () => clearTimeout(t); }, [armed]);
  return (
    <div className="border-t pt-4 space-y-2 text-sm" data-testid="block-delete-setup">
      <p className="text-muted-foreground">Deleting removes the setup for everyone. Rooms that run it keep its settings and show it as deleted.{usedHere ? " This room runs it." : ""}</p>
      <Action k="setups.remove" tone="danger" label={armed ? "Press again to delete" : "Delete this setup"} pending={pending} testId="button-delete-setup"
        onClick={() => {
          if (!armed) { setArmed(true); return; }
          setArmed(false); setPending(true); setError(null);
          remove().then(() => { toast({ title: `Deleted ${setup.name}` }); onDeleted(); }, e => setError(errMsg(e))).finally(() => setPending(false));
        }} />
      {error && <ErrorLine message={error} />}
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

/** One question: what it asks, what it means and what changing it does (SETTINGS_DOCS), then its control. */
function Question({ k, children, error }: { k: SettingsKey; children?: ReactNode; error?: string }) {
  const doc = SETTINGS_DOCS[k] as FieldDoc;
  return (
    <div className="space-y-2" data-testid={`field-${k}`}>
      <h3 className="font-medium">{doc.question}</h3>
      <p className="text-sm text-muted-foreground">{doc.meaning} {doc.consequence}</p>
      {children}
      {error && <p className="text-sm text-destructive" role="alert" data-testid={`error-${k}`}>{error}</p>}
    </div>
  );
}

type FieldProps = { k: SettingsKey; draft: Settings; editable: boolean; change: (patch: Partial<Settings>) => void; error?: string; manifest?: Manifest; type?: ObjectTypeInfo };

/** A field's control, chosen by its documented control kind (SETTINGS_DOCS[k].control): every field has one. */
function Field({ k, draft, editable, change, error, manifest, type }: FieldProps) {
  const doc = SETTINGS_DOCS[k] as FieldDoc;
  switch (doc.control) {
    case "number":
      return <NumberQuestion k={k} draft={draft} editable={editable} onSet={v => change({ [k]: v })} error={error} />;
    case "typeArgs":
      return <Question k={k}>{type && <ShapeControls type={type} draft={draft} editable={editable} onPick={args => change({ typeArgs: args })} />}</Question>;
    case "switch": {
      // A world without defence goals: the switch cannot go on, and if it is on (from another world) it must go off.
      const none = k === "defenceGoals" ? defenceBlocker(draft) : null;
      const blocked = none && !draft.defenceGoals ? none : null;
      return (
        <Question k={k} error={none && draft.defenceGoals ? `${none} Switch defence goals off.` : undefined}>
          <Switch k={k} value={draft[k] as boolean} editable={editable && !blocked} onChange={v => change({ [k]: v })} />
          {blocked && <p className="text-xs text-muted-foreground" data-testid={`reason-${k}`}>{blocked}</p>}
        </Question>
      );
    }
    case "checklist":
      return (
        <Question k={k}>
          {k === "excludedDefenceFamilies"
            ? <DefenceChecklist draft={draft} editable={editable} change={change} />
            : <RuleShelf title="Rules that can be dealt" entries={shelfEntries(draft.objectType, draft.typeArgs, draft.excludedFamilies)}
                badges={(type?.classes ?? []).map(c => c.badge)}
                onToggleExcluded={editable ? (familyId, out) => change({ excludedFamilies: out ? [...draft.excludedFamilies, familyId] : draft.excludedFamilies.filter(x => x !== familyId) }) : undefined} />}
        </Question>
      );
    case "segmented": {
      if (k === "objectType") {
        return (
          <Question k={k}>
            {manifest ? (
              <div role="radiogroup" aria-label={LABELS.objectType} className="flex flex-wrap gap-1.5">
                {manifest.objectTypes.map(t => (
                  <button key={t.id} type="button" role="radio" aria-checked={t.id === draft.objectType} disabled={!editable} onClick={() => change({ objectType: t.id })}
                    data-testid={`choice-objectType-${t.id}`}
                    className={`border px-3 py-1.5 text-sm text-left ${t.id === draft.objectType ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-muted"} disabled:cursor-default`}>
                    <span className="font-medium">{t.emoji} {t.label}</span><span className="block text-xs text-muted-foreground">{t.kid}</span>
                  </button>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">Loading object types…</p>}
          </Question>
        );
      }
      const choices = k === "utilitySelectorId" ? settingsOptionsFor("utilitySelectorId", draft.language, draft.objectType).map(o => o.id) : stepChoices(k, draft[k]);
      const note = k === "utilitySelectorId" ? dealerNote(type as unknown as PlayableTypes | undefined, draft) : null;
      return (
        <Question k={k} error={error}>
          <Segmented k={k} value={draft[k] as string} choices={choices} editable={editable} onPick={v => change({ [k]: v })} />
          {note && <p className="text-xs text-muted-foreground" data-testid="note-dealer">{note}</p>}
        </Question>
      );
    }
    case "select": {
      const options = selectOptions(k, draft, manifest);
      return (
        <Question k={k} error={error}>
          <select value={String(draft[k])} disabled={!editable} onChange={e => change({ [k]: e.target.value })} data-testid={`select-${k}`} aria-label={LABELS[k]}
            className="max-w-full border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-80">
            {!options.some(o => o.id === draft[k]) && <option value={String(draft[k])} disabled>{String(draft[k])} (not offered here)</option>}
            {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Question>
      );
    }
  }
}

/** The choices of a select: the pre-authored options of this language and type, the shipped priors, the languages. */
function selectOptions(k: SettingsKey, draft: Settings, manifest?: Manifest): { id: string; label: string }[] {
  if (k === "language") return LANGUAGES.map(id => ({ id, label: `${LANGUAGE_LABELS[id] ?? id}${manifest && !manifest.runtimes.includes(id) ? " (runtime unavailable now)" : ""}` }));
  if (k === "priorId") return (manifest?.priors ?? [draft.priorId]).map(id => ({ id, label: PRIOR_LABELS[id] ?? id }));
  return settingsOptionsFor(k as OptionKey, draft.language, draft.objectType).map(o => ({ id: o.id, label: o.label }));
}

/**
 * The object's shape: one control per type argument (Grid: size, symbols and colours). Every playable combination is
 * enabled (a retired or invalid one is disabled with the reason as its tooltip and listed under the control); nothing
 * else moves. A shape whose first game computes rule tables gets a light note with the measured time.
 */
function ShapeControls({ type, draft, editable, onPick }: { type: ObjectTypeInfo; draft: Settings; editable: boolean; onPick: (args: Settings["typeArgs"]) => void }) {
  const controls = argChoices(type as unknown as PlayableTypes, draft.typeArgs);
  const chosen = type.playable.find(o => sameArgs({ ...type.defaults, ...o.args }, { ...type.defaults, ...draft.typeArgs }));
  const note = firstUseNote(type as unknown as PlayableTypes, draft.typeArgs);
  return (
    <div className="space-y-4" data-testid="controls-typeArgs">
      {controls.map(({ param, current, choices }) => {
        const doc = param as typeof param & { question?: string; meaning?: string; consequence?: string };
        const disabled = choices.filter(c => !c.enabled);
        return (
          <div key={param.id} className="space-y-1.5 border-l-2 pl-3" data-testid={`arg-${param.id}`}>
            <p className="text-sm"><span className="font-medium">{doc.question ?? param.label}</span> <span className="text-muted-foreground">{doc.meaning} {doc.consequence}</span></p>
            <div role="radiogroup" aria-label={param.label} className="flex flex-wrap gap-1.5">
              {choices.map(c => (
                <button key={String(c.value)} type="button" role="radio" aria-checked={c.value === current} disabled={!editable || !c.enabled}
                  onClick={() => onPick({ ...type.defaults, ...draft.typeArgs, [param.id]: c.value })} data-testid={`choice-arg-${param.id}-${String(c.value)}`}
                  aria-description={c.reason} data-disabled-reason={c.reason}
                  className={`border px-3 py-1.5 text-sm ${c.value === current ? "border-primary bg-primary/10 ring-1 ring-primary" : c.enabled ? "hover:bg-muted" : "border-dashed text-muted-foreground"} disabled:cursor-not-allowed ${!c.enabled ? "opacity-60 line-through decoration-muted-foreground/50" : ""}`}>
                  {c.label}
                </button>
              ))}
            </div>
            {editable && disabled.length > 0 && (
              <ul className="text-xs text-muted-foreground space-y-0.5" data-testid={`reasons-${param.id}`}>
                {disabled.map(c => <li key={String(c.value)}>{c.label}: {c.reason}.</li>)}
              </ul>
            )}
          </div>
        );
      })}
      {note && <p className="text-xs text-muted-foreground" data-testid="note-first-use">{note}</p>}
      {chosen && <div><BadgeChips badges={chosen.badges} /></div>}
    </div>
  );
}

/** The defence goals that may be dealt: a checklist (ticked = allowed); every player draws one of the ticked ones. */
function DefenceChecklist({ draft, editable, change }: { draft: Settings; editable: boolean; change: (patch: Partial<Settings>) => void }) {
  const entries = shelfEntries(draft.objectType, draft.typeArgs, draft.excludedDefenceFamilies, "defence");
  const allowed = entries.filter(e => !e.excluded).length;
  return (
    <div className="space-y-2" data-testid="checklist-defence">
      <p className="text-sm"><span data-testid="text-defence-allowed">{allowed} of {entries.length}</span> defence goals allowed</p>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {entries.map(e => (
          <li key={e.id}>
            <label className={`flex items-start gap-2 border px-2 py-1.5 text-sm ${e.excluded ? "text-muted-foreground" : ""}`} data-testid={`row-defence-${e.id}`}>
              <input type="checkbox" checked={!e.excluded} disabled={!editable} data-testid={`check-defence-${e.id}`} className="mt-1 accent-[hsl(var(--primary))]"
                onChange={ev => change({ excludedDefenceFamilies: ev.target.checked ? draft.excludedDefenceFamilies.filter(x => x !== e.id) : [...draft.excludedDefenceFamilies, e.id] })} />
              <span><span className="font-medium">{e.emoji} {e.name}</span>{e.theme && <span className="block text-xs text-muted-foreground">{e.theme}</span>}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Switch({ k, value, editable, onChange }: { k: SettingsKey; value: boolean; editable: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={value} aria-label={LABELS[k]} disabled={!editable} onClick={() => onChange(!value)} data-testid={`switch-${k}`}
      className="inline-flex items-center gap-3 text-sm disabled:cursor-not-allowed disabled:opacity-60">
      <span className={`relative h-6 w-11 rounded-full border transition-colors ${value ? "bg-primary border-primary" : "bg-muted"}`}>
        <span className={`absolute top-0.5 h-4.5 w-4.5 h-[18px] w-[18px] rounded-full bg-background shadow transition-all ${value ? "left-[22px]" : "left-0.5"}`} />
      </span>
      <span>{choiceLabel(k, value)}</span>
    </button>
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
  const unit = (SETTINGS_DOCS[k] as FieldDoc).unit;
  return (
    <Question k={k} error={error}>
      {choices.length ? <Segmented k={k} value={value} choices={choices} editable={editable} onPick={v => { setExact(false); onSet(Number(v)); }} /> : null}
      {!editable ? (!choices.length && <p className="text-sm font-mono" data-testid={`value-${k}`}>{formatValue(k, value)}</p>)
      : exact || !choices.length ? (
        <label className="flex items-center gap-2 text-sm">
          <span>Exact value</span>
          <input type="number" step="any" value={raw} onChange={e => { setRaw(e.target.value); onSet(e.target.value.trim() === "" ? NaN : Number(e.target.value)); }} aria-invalid={!!error || undefined}
            className={`w-40 border bg-background px-2 py-1 font-mono text-sm outline-none focus:border-primary ${error ? "border-destructive" : ""}`} data-testid={`input-${k}`} />
          {unit && <span className="text-muted-foreground">{unit}</span>}
        </label>
      ) : <button type="button" className="text-sm underline underline-offset-4" onClick={() => setExact(true)} data-testid={`button-exact-${k}`}>Exact value…</button>}
    </Question>
  );
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
