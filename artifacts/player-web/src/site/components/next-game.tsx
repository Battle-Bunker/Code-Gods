/**
 * The room's Next game section (integration plan §1.2): v1's searchable setup combobox (setup-combobox.tsx: the deployed
 * presets, the Lab for admins, everyone's saved setups) and the few settings the owner may change for the next game, through the `room.settings`
 * affordance; everyone else reads the setup and its summary. A running game keeps the settings it started with (the
 * server freezes them in the game), so the owner may set up the next one meanwhile.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useAffordance } from "@workspace/v2-affordances/react";
import { presetOf, type Preset } from "@workspace/engine/convex/v2/presets.ts";
import { Section } from "@/site/components/page-parts";
import { SetupCombobox } from "@/site/components/setup-combobox";
import { failureText } from "@/site/components/action";
import { useAuth } from "@/site/hooks/use-auth";
import { weightText, formOf, nextGameSummary, noiseWords, overridesOf, PEER_NOISE_VARIANCE_OPTIONS, setupBlurb, type FormField, type SettingsForm } from "@/site/lib/setup-picker";
import { SCORE_INTERVAL_OPTIONS } from "@workspace/engine/convex/v2/duration.ts";
import { gallerySearch } from "@/site/lib/rule-gallery";
import { configurePath, ruleGalleryPath } from "@/site/lib/routes";
import { toast } from "@/hooks/use-toast";
import type { Room } from "@/sdk/types";

const rulesLink = (p: Preset) => ruleGalleryPath(gallerySearch({ board: p.variant, params: 0, tb: null }));


type TextField = Exclude<FormField, "durationMode" | "peerNoiseVariance">;
const fields = (mode: SettingsForm["durationMode"]): { key: TextField; label: string; hint: string; list?: string }[] => [
  { key: "planningSeconds", label: "Planning (seconds)", hint: "Time to read your rule and summon an agent before the world starts." },
  mode === "halfLife"
    ? { key: "worldMinutes", label: "Half-life (minutes)", hint: "Half of games end within this; the end is a hidden random moment." }
    : { key: "worldMinutes", label: "Game length (minutes)", hint: "How long the world runs." },
  { key: "startingEnergy", label: "Starting energy", hint: "What each player has to summon agents with." },
  { key: "driftSeconds", label: "Rules get new numbers every (seconds)", hint: "Each player's rule keeps its kind but may get a new target; a rule with one set of numbers keeps it. 0: never." },
  { key: "scoreIntervalSeconds", label: "Totals counted every (seconds)", hint: "How often the standings are counted and published.", list: "score-interval-options" },
];

function SettingsEditor({ room, preset, locked }: { room: Room; preset: Preset; locked: string | null }) {
  const settings = useAffordance("room.settings");
  const saved = formOf(preset, room.overrides);
  const [form, setForm] = useState<SettingsForm>(saved);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(saved);
  // The room changed elsewhere (another tab, the assistant, a new preset): start again from what it holds now.
  if (JSON.stringify(shown) !== JSON.stringify(saved)) { setShown(saved); setForm(saved); }
  const checked = overridesOf(form, preset);
  const errors = checked.ok ? {} : checked.errors;
  const changed = JSON.stringify(form) !== JSON.stringify(saved);
  const custom = Object.keys(room.overrides).length > 0;
  const send = async (overrides: object, done: string) => {
    setBusy(true);
    try { await settings.run({ overrides }); toast({ title: done }); } catch (e) { toast({ title: "The settings did not change", description: failureText(e), variant: "destructive" }); } finally { setBusy(false); }
  };
  return (
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (checked.ok && changed && !locked) void send(checked.overrides, "Settings saved for the next game"); }} data-testid="form-room-settings">
      <p className="label-mono">Settings</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span>How the game ends</span>
          <select value={form.durationMode} onChange={e => setForm({ ...form, durationMode: e.target.value as SettingsForm["durationMode"] })} disabled={!!locked || busy}
            className="h-9 border bg-background px-2" data-testid="select-setting-durationMode">
            <option value="fixed">At its length (everyone sees the countdown)</option>
            <option value="halfLife">At a hidden random moment</option>
          </select>
          <span className="text-xs text-muted-foreground">{form.durationMode === "halfLife" ? "The clock shows a range, not an exact time." : "The end is public."}</span>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span>Price of a look</span>
          <select value={form.readPriceWeight} onChange={e => setForm({ ...form, readPriceWeight: e.target.value })} disabled={!!locked || busy}
            className="h-9 border bg-background px-2" data-testid="select-setting-readPriceWeight">
            {[...new Set([0, 0.5, 1, 2, 3, 4, preset.readPriceWeight, Number(form.readPriceWeight)])].filter(n => Number.isFinite(n)).sort((a, b) => a - b)
              .map(n => <option key={n} value={String(n)}>{n === 0 ? "Free: see everything as it is" : `${weightText(n)}×${Math.abs(n - preset.readPriceWeight) < 1e-9 ? " (the setup's own)" : ""}`}</option>)}
          </select>
          <span className="text-xs text-muted-foreground">Times the read price. Everyone sees each line or grid as they or their agents last saw it; a look costs energy.</span>
        </label>
        {fields(form.durationMode).map(f => (
          <label key={f.key} className="flex min-w-0 flex-col gap-1 text-sm">
            <span>{f.label}</span>
            <input value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} disabled={!!locked || busy} inputMode="decimal" list={f.list}
              aria-invalid={!!errors[f.key] || undefined} className="h-9 border bg-background px-2" data-testid={`input-setting-${f.key}`} />
            <span className={`text-xs ${errors[f.key] ? "text-destructive" : "text-muted-foreground"}`} data-testid={errors[f.key] ? `error-setting-${f.key}` : undefined}>{errors[f.key] ?? f.hint}</span>
          </label>
        ))}
        <datalist id="score-interval-options">{SCORE_INTERVAL_OPTIONS.map(n => <option key={n} value={n} />)}</datalist>
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span>Others' bits on each object while live (totals are always exact)</span>
          <select value={form.peerNoiseVariance} onChange={e => setForm({ ...form, peerNoiseVariance: e.target.value })} disabled={!!locked || busy}
            className="h-9 border bg-background px-2" data-testid="select-setting-peerNoiseVariance">
            {PEER_NOISE_VARIANCE_OPTIONS.map(n => <option key={n} value={String(n)}>{noiseWords(n)}</option>)}
          </select>
          <span className="text-xs text-muted-foreground">Exact after the game ends, whichever you pick.</span>
        </label>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <button type="submit" disabled={!!locked || busy || !changed || !checked.ok} className={`px-4 py-2 text-sm font-medium disabled:opacity-50 ${changed ? "bg-primary text-primary-foreground" : "border text-muted-foreground"}`} data-testid="button-save-settings">
          {busy ? "Saving…" : changed ? "Save settings" : "No changes to save"}
        </button>
        {custom && (
          <button type="button" disabled={!!locked || busy} onClick={() => void send({}, `Back to ${preset.title}'s own settings`)} className="border px-4 py-2 text-sm disabled:opacity-50" data-testid="button-reset-settings">
            Use the setup's own settings
          </button>
        )}
      </div>
    </form>
  );
}

export function NextGame({ room }: { room: Room }) {
  const preset = presetOf(room.preset);
  const settings = useAffordance("room.settings");
  const { user } = useAuth();
  const owner = room.members.find(m => m.me)?.owner;
  const locked = !settings.available ? settings.reason ?? "Settings cannot change now." : null;
  return (
    <Section title="Next game" testId="section-next-game">
      <div className="p-4 space-y-4 text-sm">
        {owner && !settings.hidden ? (<>
          <div className="space-y-1" data-testid="field-setup">
            <p className="label-mono">Setup</p>
            <SetupCombobox room={room} admin={!!user?.isAdmin} locked={locked} />
            <p className="text-muted-foreground">{setupBlurb(preset)} <Link href={rulesLink(preset)} className="text-xs underline underline-offset-4" data-testid="link-setup-rules">See its rules</Link></p>
          </div>
          <SettingsEditor room={room} preset={preset} locked={locked} />
        </>) : (
          <div className="space-y-1">
            <p>This room plays <span className="font-medium" data-testid="text-setup">{preset.title}</span>: {setupBlurb(preset)}</p>
            <Link href={rulesLink(preset)} className="text-xs underline underline-offset-4" data-testid="link-setup-rules">See its rules</Link>
          </div>
        )}
        <p className="text-muted-foreground" data-testid="text-next-game-summary">{nextGameSummary(preset, room.overrides)}</p>
        <Link href={configurePath(room.code)} className="inline-block underline underline-offset-4" data-testid="link-configure">{owner ? "Every setting, with a review before saving" : "See all settings"} →</Link>
        {locked && owner && !settings.hidden && <p className="text-xs text-muted-foreground" data-testid="text-settings-locked">{locked}</p>}
        {room.game && <p className="text-xs text-muted-foreground" data-testid="text-settings-frozen">Game {room.game.number} keeps the settings it started with: these are for the next game.</p>}
      </div>
    </Section>
  );
}
