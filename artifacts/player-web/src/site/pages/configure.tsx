/**
 * The configuration page, /rooms/:code/configure (archive/engine-v1 site/pages/configure.tsx, ported onto v2): one long
 * form with a stepper and a sticky summary asks every setting the room's next game can be given, each with its
 * question, meaning and consequence (site/lib/configure-form.ts FIELDS, v1's SETTINGS_DOCS wording), in v1's order
 * Setup → Goals → Agents → Energy → Time → Players & AI → Review, asked questions first and the rest under "More".
 *
 * What changed from v1, because the data shape did: a v2 room plays a preset plus overrides (`room.settings`), not a
 * GameSettings record, so v1's World section (object type and shape) is the choice of setup, and Save sends the preset
 * and only the values that differ from it, through the `room.settings` affordance (its confirmation shows the Review
 * diff). Only the room's owner edits; everyone else reads the same form with every control disabled. A running game
 * keeps the settings it started with (the server freezes them), so the owner may set up the next one meanwhile.
 * The draft survives a reload (localStorage, per room). The room changed elsewhere meanwhile (another tab, the
 * assistant): an untouched draft follows it; an edited one is kept, with an offer to load theirs (v1's behaviour).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "wouter";
import { api } from "@workspace/engine/convex/_generated/api";
import { PRESETS, presetOf } from "@workspace/engine/convex/v2/presets.ts";
import { useAffordance } from "@workspace/v2-affordances/react";
import { useLive } from "@/site/lib/convex";
import { useAuth } from "@/site/hooks/use-auth";
import { Page, openPalette } from "@/site/components/layout";
import { AffordanceButton } from "@/site/components/action";
import { ErrorLine } from "@/site/components/page-parts";
import { Skeleton } from "@/components/ui/skeleton";
import { errMsg } from "@/site/lib/errors";
import { roomPath } from "@/site/lib/routes";
import { affordanceContext } from "@/core/affordance-context";
import { toast } from "@/hooks/use-toast";
import { setupBlurb, setupGroups } from "@/site/lib/setup-picker";
import {
  FIELDS, SECTIONS, choiceLabel, draftErrors, draftOf, fieldsOf, formatValue, lengthLine, overridesFor, reviewDiff, stepChoices,
  type Draft, type FieldKey, type SectionId,
} from "@/site/lib/configure-form";
import type { Room } from "@/sdk/types";

type Stored = { base: { preset: string; draft: Draft }; preset: string; draft: Draft };
const draftKey = (roomId: string) => `code-gods:configure-draft:${roomId}`;
const loadDraft = (k: string): Stored | null => { try { const raw = window.localStorage.getItem(draftKey(k)); return raw ? JSON.parse(raw) as Stored : null; } catch { return null; } };
const saveDraft = (k: string, s: Stored | null) => { try { if (s) window.localStorage.setItem(draftKey(k), JSON.stringify(s)); else window.localStorage.removeItem(draftKey(k)); } catch { /* a convenience */ } };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default function Configure() {
  const { id = "" } = useParams<{ id: string }>();
  const code = id.toUpperCase();
  const { user, isAuthenticated } = useAuth();
  const found = useLive(api.v2.rooms.byCode, isAuthenticated && code ? { code } : "skip");
  const roomId = found.data?.member ? found.data.roomId : null;
  const q = useLive(api.v2.rooms.get, roomId ? { roomId } : "skip");
  const room = q.data;
  useEffect(() => { document.title = `Configure ${code} · Code Gods`; }, [code]);
  const context = affordanceContext({ signedIn: isAuthenticated, admin: !!user?.isAdmin, room: room ?? null });
  return (
    <Page context={context} scope={roomId ? { roomId } : {}} roomPath={roomPath(code)} crumbs={[{ label: code, href: roomPath(code) }, { label: "Configure" }]}
      placeholder={`Search or do anything in ${code}`} chip={room ? `Room ${room.code}` : undefined}>
      <div data-testid="page-configure">
        {!isAuthenticated ? null
        : found.isLoading || (roomId && q.isLoading) ? <div className="mx-auto max-w-[1200px] px-4 md:px-6 py-8 space-y-4"><Skeleton className="h-12 w-1/2" /><Skeleton className="h-96" /></div>
        : !room ? (
          <div className="mx-auto max-w-lg px-4 py-20 space-y-3">
            <ErrorLine message={q.error ? errMsg(q.error) : found.data ? "Join the room to see its setup." : "Room not found. Check the code, or ask the owner for the link."} />
            <Link href={roomPath(code)} className="underline underline-offset-4" data-testid="link-back-to-room">Back to room {code}</Link>
          </div>
        ) : <ConfigureForm key={room.roomId} room={room} admin={!!user?.isAdmin} />}
      </div>
    </Page>
  );
}

function ConfigureForm({ room, admin }: { room: Room; admin: boolean }) {
  const [, navigate] = useLocation();
  const settings = useAffordance("room.settings");
  const owner = !!room.members.find(m => m.me)?.owner;
  const locked = !settings.available ? settings.reason ?? "Settings cannot change now." : null;
  const editable = owner && !settings.hidden && !locked;
  const saved = useMemo(() => ({ preset: room.preset, draft: draftOf(presetOf(room.preset), room.overrides) }), [room.preset, room.overrides]);
  const key = room.roomId;
  const stored = useMemo(() => (owner ? loadDraft(key) : null), [key, owner]);
  const [base, setBase] = useState(() => stored?.base ?? saved);
  const [presetId, setPresetId] = useState(() => stored?.preset ?? saved.preset);
  const [draft, setDraft] = useState<Draft>(() => stored?.draft ?? saved.draft);
  const [elsewhere, setElsewhere] = useState(false);
  const preset = presetOf(presetId);
  const next = { preset: presetId, draft };
  const changes = reviewDiff(saved, next);
  const dirty = !same(next, base);
  const errors = draftErrors(draft);
  const invalid = Object.keys(errors).length > 0;

  // Keep the draft across reloads; clear it once nothing differs.
  useEffect(() => { if (owner) saveDraft(key, dirty ? { base, preset: presetId, draft } : null); }, [owner, key, base, presetId, draft, dirty]);

  // The room changed elsewhere: an untouched draft follows it; an edited one is kept and the owner may load theirs.
  const lastSaved = useRef(saved);
  useEffect(() => {
    if (same(lastSaved.current, saved)) return;
    lastSaved.current = saved;
    if (!dirty || same(next, saved)) { setPresetId(saved.preset); setDraft(saved.draft); setElsewhere(false); }
    else if (!same(saved, base)) setElsewhere(true);
    setBase(saved);
  }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (patch: Partial<Draft>) => { if (editable) setDraft(d => ({ ...d, ...patch })); };
  /** A new setup keeps the values the owner set by hand; everything else follows the new setup (as the server does). */
  const pickPreset = (id: string) => {
    if (!editable || id === presetId) return;
    setDraft(draftOf(presetOf(id), overridesFor(draft, preset)));
    setPresetId(id);
  };
  const saveBlocker = !owner ? "Only the room's owner changes its setup." : locked ? locked : invalid ? "Fix the settings marked in red first." : !changes.length ? "Nothing has changed yet." : null;
  // The page checks every value against the affordance's own limits first (draftErrors), so the draft's numbers are its.
  const args = () => ({ ...(presetId !== room.preset ? { preset: presetId } : {}), overrides: overridesFor(draft, preset) }) as Parameters<typeof settings.run>[0];
  const confirmText = `${changes.map(c => `${c.label}: ${c.from} → ${c.to}`).join("; ")}.`;
  const code = room.code;

  return (
    <div className="mx-auto max-w-[1280px] px-4 md:px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6 rise">
        <div className="min-w-0">
          <h1 className="font-display text-4xl md:text-5xl leading-none break-words" data-testid="text-setup-title">{editable ? "Set up the next game" : preset.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground" data-testid="text-setup-owner">
            {owner ? (locked ? locked : `Saving puts room ${code}'s next game on these settings.`) : "Only the room's owner can change its setup."}
            {room.game ? ` Game ${room.game.number} keeps the settings it started with.` : ""}
          </p>
        </div>
        <Link href={roomPath(code)} className="text-sm underline underline-offset-4" data-testid="link-back-to-room">Back to room {code}</Link>
      </div>
      {elsewhere && (
        <p className="mb-4 border border-accent px-4 py-2 text-sm" data-testid="text-changed-elsewhere" role="status">
          The room's setup was also changed elsewhere since you started. Saving puts yours in its place.{" "}
          <button type="button" className="underline" onClick={() => { setPresetId(saved.preset); setDraft(saved.draft); setElsewhere(false); }} data-testid="button-load-theirs">Load theirs instead</button>
        </p>
      )}
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
          <FormSection id="setup">
            <SetupChoice current={presetId} admin={admin} editable={editable} onPick={pickPreset} />
          </FormSection>

          {(["goals", "agents", "energy", "population", "time"] as const).filter(s => SECTIONS.some(x => x.id === s)).map(section => (
            <FormSection key={section} id={section}>
              {fieldsOf(section).filter(k => FIELDS[k].tier === "ask").map(k => <Field key={k} k={k} draft={draft} editable={editable} change={change} error={errors[k]} />)}
              {fieldsOf(section).some(k => FIELDS[k].tier === "more") && (
                <More section={section}>
                  {fieldsOf(section).filter(k => FIELDS[k].tier === "more").map(k => <Field key={k} k={k} draft={draft} editable={editable} change={change} error={errors[k]} />)}
                </More>
              )}
            </FormSection>
          ))}

          <FormSection id="players">
            <PlayersAndAi room={room} owner={owner} minPlayers={preset.minPlayers} />
          </FormSection>

          <FormSection id="review">
            <div className="space-y-4" data-testid="panel-review">
              <div className="border bg-card px-4 py-3 text-sm" data-testid="card-summary">
                <p className="font-medium">{preset.title}</p>
                <p className="text-muted-foreground">{setupBlurb(preset)} {lengthLine(draft)}.</p>
              </div>
              {changes.length ? (
                <ul className="space-y-1 text-sm" data-testid="list-review-changes">
                  {changes.map(c => (
                    <li key={c.key} data-testid={`change-${c.key}`}><span className="font-medium">{c.label}:</span> <span className="text-muted-foreground line-through">{c.from}</span> → {c.to}</li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground" data-testid="text-no-changes">The next game runs as the room is set now.</p>}
              {owner && (<>
                <p className="text-sm" data-testid="text-unsaved">{dirty ? "You have unsaved changes." : "Nothing to save yet."}</p>
                <div className="flex flex-wrap items-center gap-4">
                  <AffordanceButton id="room.settings" args={args} label="Save and use for the next game" busyLabel="Saving…" tone="primary" testId="button-save-settings"
                    disabledReason={saveBlocker} showReason confirmText={confirmText}
                    onDone={() => { saveDraft(key, null); toast({ title: `Saved: room ${code}'s next game runs ${preset.title}` }); navigate(roomPath(code)); }} />
                  <Link href={roomPath(code)} className="text-sm underline underline-offset-4" data-testid="link-cancel">Cancel</Link>
                  {Object.keys(room.overrides).some(k => k in FIELDS) && (
                    <AffordanceButton id="room.settings" args={{ overrides: {} }} label="Use the setup's own settings" tone="quiet" testId="button-reset-settings"
                      onDone={() => { saveDraft(key, null); toast({ title: `Back to ${presetOf(room.preset).title}'s own settings` }); }} />
                  )}
                </div>
              </>)}
            </div>
          </FormSection>
        </div>
        <aside className="lg:block">
          <div className="lg:sticky lg:top-20 border bg-card p-4 space-y-2 text-sm" data-testid="panel-summary">
            <p className="font-medium">Summary</p>
            <p data-testid="text-summary-setup">{preset.title}</p>
            <p className="text-muted-foreground">{setupBlurb(preset)}</p>
            <p>{lengthLine(draft)}</p>
            <p>{formatValue("startingEnergy", draft.startingEnergy)} to start · looks {formatValue("readPriceWeight", draft.readPriceWeight).toLowerCase()}</p>
            <p>Others' interest: {formatValue("peerNoiseVariance", draft.peerNoiseVariance).toLowerCase()} · scores {formatValue("scoreIntervalSeconds", draft.scoreIntervalSeconds)}</p>
            <p>{(n => `${n} ${n === 1 ? "player" : "players"} in the room`)(room.members.filter(m => !m.spectator).length)}, {preset.minPlayers} or more to start</p>
            {owner && dirty && <p className="text-primary">Unsaved changes</p>}
            {owner && <a href="#section-review" className="underline underline-offset-4">Review and save</a>}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** v1's World section in v2: the setup (a board and its pool of rules), the Lab group for admins only. */
function SetupChoice({ current, admin, editable, onPick }: { current: string; admin: boolean; editable: boolean; onPick: (id: string) => void }) {
  return (
    <div className="space-y-4" data-testid="field-preset">
      <h3 className="font-medium">What does the next game play?</h3>
      <p className="text-sm text-muted-foreground">Each setup is a board and the rules that can be dealt on it. Picking another keeps the values you set by hand below; the rest follow the setup.</p>
      {setupGroups(PRESETS, { admin, current }).map(g => (
        <fieldset key={g.label} className="space-y-2">
          <legend className="label-mono mb-1">{g.label}</legend>
          <div role="radiogroup" aria-label={g.label} className="grid gap-2 sm:grid-cols-2">
            {g.presets.map(p => (
              <button key={p.id} type="button" role="radio" aria-checked={p.id === current} disabled={!editable} onClick={() => onPick(p.id)} data-testid={`choice-preset-${p.id}`}
                className={`border p-3 text-left text-sm ${p.id === current ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-muted"} disabled:cursor-default`}>
                <span className="block font-medium">{p.title}</span>
                <span className="block text-muted-foreground">{setupBlurb(p)}</span>
              </button>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function FormSection({ id, children }: { id: SectionId; children: ReactNode }) {
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

/** One question: what it asks, what it means and what changing it does, then its control. */
function Question({ k, children, error }: { k: FieldKey; children?: ReactNode; error?: string }) {
  const doc = FIELDS[k];
  return (
    <div className="space-y-2" data-testid={`field-${k}`}>
      <h3 className="font-medium">{doc.question}</h3>
      <p className="text-sm text-muted-foreground">{doc.meaning} {doc.consequence}</p>
      {children}
      {error && <p className="text-sm text-destructive" role="alert" data-testid={`error-${k}`}>{error}</p>}
    </div>
  );
}

type FieldProps = { k: FieldKey; draft: Draft; editable: boolean; change: (patch: Partial<Draft>) => void; error?: string };

function Field({ k, draft, editable, change, error }: FieldProps) {
  const doc = FIELDS[k];
  if (doc.control === "number") return <NumberQuestion k={k} value={draft[k] as number} editable={editable} onSet={v => change({ [k]: v })} error={error} />;
  if (doc.control === "switch") return <Question k={k} error={error}><Switch k={k} value={draft[k] as boolean} editable={editable} onChange={v => change({ [k]: v })} /></Question>;
  return (
    <Question k={k} error={error}>
      <Segmented k={k} value={draft[k] as number | string} choices={stepChoices(k, draft[k])} editable={editable} onPick={v => change({ [k]: v })} />
    </Question>
  );
}

function Switch({ k, value, editable, onChange }: { k: FieldKey; value: boolean; editable: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={value} aria-label={FIELDS[k].label} disabled={!editable} onClick={() => onChange(!value)} data-testid={`switch-${k}`}
      className="inline-flex items-center gap-3 text-sm disabled:cursor-not-allowed disabled:opacity-60">
      <span className={`relative h-6 w-11 rounded-full border transition-colors ${value ? "bg-primary border-primary" : "bg-muted"}`}>
        <span className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-background shadow transition-all ${value ? "left-[22px]" : "left-0.5"}`} />
      </span>
      <span>{choiceLabel(k, value)}</span>
    </button>
  );
}

/** Stepped choices as one row of toggle buttons. */
function Segmented({ k, value, choices, editable, onPick }: { k: FieldKey; value: number | string; choices: readonly (number | string)[]; editable: boolean; onPick: (v: number | string) => void }) {
  return (
    <div role="radiogroup" aria-label={FIELDS[k].label} className="flex flex-wrap gap-1.5">
      {choices.map(c => (
        <button key={String(c)} type="button" role="radio" aria-checked={c === value} disabled={!editable} onClick={() => onPick(c)} data-testid={`choice-${k}-${String(c)}`}
          className={`border px-3 py-1.5 text-sm ${c === value ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-muted"} disabled:cursor-default`}>{choiceLabel(k, c)}</button>
      ))}
    </div>
  );
}

function NumberQuestion({ k, value, editable, onSet, error }: { k: FieldKey; value: number; editable: boolean; onSet: (v: number) => void; error?: string }) {
  const doc = FIELDS[k];
  const choices = stepChoices(k, Number.isFinite(value) ? value : undefined) as number[];
  // Durations are typed in minutes and stored in seconds (v1).
  const scale = doc.minutes ? 60 : 1;
  const unit = doc.minutes ? "min" : doc.unit === "s" ? "seconds" : doc.unit;
  const [exact, setExact] = useState(false);
  const [raw, setRaw] = useState(String(value / scale));
  useEffect(() => { if (!exact) setRaw(String(value / scale)); }, [value, exact, scale]);
  return (
    <Question k={k} error={error}>
      {choices.length ? <Segmented k={k} value={value} choices={choices} editable={editable} onPick={v => { setExact(false); onSet(Number(v)); }} /> : null}
      {!editable ? null
      : exact ? (
        <label className="flex items-center gap-2 text-sm">
          <span>{doc.minutes ? "Custom length" : "Exact value"}</span>
          <input type="number" step="any" value={raw} onChange={e => { setRaw(e.target.value); onSet(e.target.value.trim() === "" ? Number.NaN : Math.round(Number(e.target.value) * scale * 1e6) / 1e6); }}
            aria-invalid={!!error || undefined} className={`w-40 border bg-background px-2 py-1 font-mono text-sm outline-none focus:border-primary ${error ? "border-destructive" : ""}`} data-testid={`input-${k}`} />
          {unit && <span className="text-muted-foreground">{unit}</span>}
        </label>
      ) : <button type="button" className="text-sm underline underline-offset-4" onClick={() => setExact(true)} data-testid={`button-exact-${k}`}>{doc.minutes ? "Custom length…" : "Exact value…"}</button>}
    </Question>
  );
}

function More({ section, children }: { section: SectionId; children: ReactNode }) {
  const count = fieldsOf(section).filter(k => FIELDS[k].tier === "more").length;
  return (
    <details className="border-l-2 pl-4 space-y-4" data-testid={`more-${section}`}>
      <summary className="cursor-pointer text-sm">More {SECTIONS.find(s => s.id === section)?.title.toLowerCase()} options ({count})</summary>
      <div className="space-y-6 pt-3">{children}</div>
    </details>
  );
}

/** Who fills the seats (seats change at once, through their own operations) and the AI quotas (room.aiQuotas). */
function PlayersAndAi({ room, owner, minPlayers }: { room: Room; owner: boolean; minPlayers: number }) {
  const ais = room.members.filter(m => m.kind !== "human");
  const players = room.members.filter(m => !m.spectator).length;
  return (
    <div className="space-y-6">
      <div className="space-y-2" data-testid="field-aiSeats">
        <h3 className="font-medium">How many seats do AI players fill?</h3>
        <p className="text-sm text-muted-foreground">AI players play with the same information and actions as humans. More AI seats let games start without waiting, and each one draws on the AI players' quota.</p>
        <p className="text-sm">{ais.length ? ais.map(a => a.name).join(", ") : "No AI players yet."} {players} {players === 1 ? "player is" : "players are"} in the room; a game needs {minPlayers}.</p>
        {owner && !room.game && <p className="text-sm">
          <button type="button" className="underline underline-offset-4" onClick={() => openPalette({ page: "seats.addAi" })} data-testid="button-config-add-ai">Add an AI player</button>
          {ais.length > 0 && <>{" · "}<button type="button" className="underline underline-offset-4" onClick={() => openPalette({ page: "seats.removeAi" })} data-testid="button-config-remove-ai">Remove one</button></>}
          <span className="text-muted-foreground"> (seats change at once, not with Save)</span></p>}
      </div>
      <div className="space-y-2" data-testid="field-aiQuotas">
        <h3 className="font-medium">How many tokens may AI use per game?</h3>
        <p className="text-sm text-muted-foreground">The tokens all AI players together, and each human's assistant, may use in one game, billed to the server owner; zero turns the assistant off. Too low a quota makes AI players stop acting mid-game.</p>
        {owner && <button type="button" className="text-sm underline underline-offset-4" onClick={() => openPalette({ page: "room.aiQuotas" })} data-testid="button-config-ai-quotas">Set the room's AI quotas…</button>}
      </div>
    </div>
  );
}
