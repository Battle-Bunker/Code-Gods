/**
 * The room's Next game section (integration plan §1.2): the setup picker (the deployed presets, the Lab group for
 * admins only) and the few settings the owner may change for the next game, both through the `room.settings`
 * affordance; everyone else reads the setup and its summary. A running game keeps the settings it started with (the
 * server freezes them in the game), so the owner may set up the next one meanwhile.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useAffordance } from "@workspace/v2-affordances/react";
import { PRESETS, presetOf, type Preset } from "@workspace/engine/convex/v2/presets.ts";
import { Section } from "@/site/components/page-parts";
import { failureText } from "@/site/components/action";
import { useAuth } from "@/site/hooks/use-auth";
import { formOf, nextGameSummary, overridesOf, PEER_NOISE_OPTIONS, setupBlurb, setupGroups, type FormField, type SettingsForm } from "@/site/lib/setup-picker";
import { SCORE_INTERVAL_OPTIONS } from "@workspace/engine/convex/v2/duration.ts";
import { gallerySearch } from "@/site/lib/rule-gallery";
import { ruleGalleryPath } from "@/site/lib/routes";
import { toast } from "@/hooks/use-toast";
import type { Room } from "@/sdk/types";

const rulesLink = (p: Preset) => ruleGalleryPath(gallerySearch({ board: p.variant, params: 0, tb: null }));

function SetupPicker({ room, admin, locked }: { room: Room; admin: boolean; locked: string | null }) {
  const settings = useAffordance("room.settings");
  const [busy, setBusy] = useState<string | null>(null);
  const choose = async (id: string) => {
    if (busy || locked || id === room.preset) return;
    setBusy(id);
    try { await settings.run({ preset: id }); toast({ title: `Next game: ${presetOf(id).title}` }); } catch (e) { toast({ title: "The setup did not change", description: failureText(e), variant: "destructive" }); } finally { setBusy(null); }
  };
  return (
    <div className="space-y-4">
      {setupGroups(PRESETS, { admin, current: room.preset }).map(g => (
        <fieldset key={g.label} className="space-y-2" data-testid={`setup-group-${g.label.startsWith("Lab") ? "lab" : "main"}`}>
          <legend className="label-mono mb-1">{g.label}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {g.presets.map(p => {
              const on = p.id === room.preset;
              return (
                <label key={p.id} className={`flex items-start gap-3 border p-3 ${on ? "border-primary bg-primary/5" : "hover:bg-muted/60"} ${locked ? "opacity-70" : "cursor-pointer"}`} data-testid={`setup-${p.id}`}>
                  <input type="radio" name="setup" className="mt-1" checked={on} disabled={!!locked || !!busy} onChange={() => void choose(p.id)} data-testid={`radio-setup-${p.id}`} />
                  <span className="min-w-0 space-y-0.5 text-sm">
                    <span className="block font-medium">{p.title}{busy === p.id ? " · saving…" : ""}</span>
                    <span className="block text-muted-foreground">{setupBlurb(p)}</span>
                    <Link href={rulesLink(p)} className="text-xs underline underline-offset-4" data-testid={`link-setup-rules-${p.id}`}>See its rules</Link>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

type TextField = Exclude<FormField, "durationMode" | "peerNoiseBits">;
const fields = (mode: SettingsForm["durationMode"]): { key: TextField; label: string; hint: string; list?: string }[] => [
  { key: "planningSeconds", label: "Planning (seconds)", hint: "Time to read your rule and summon an agent before the world starts." },
  mode === "halfLife"
    ? { key: "worldMinutes", label: "Half-life (minutes)", hint: "Half of games end within this; the end is a hidden random moment." }
    : { key: "worldMinutes", label: "Game length (minutes)", hint: "How long the world runs." },
  { key: "startingEnergy", label: "Starting energy", hint: "What each player has to summon agents with." },
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
          <select value={form.peerNoiseBits} onChange={e => setForm({ ...form, peerNoiseBits: e.target.value })} disabled={!!locked || busy}
            className="h-9 border bg-background px-2" data-testid="select-setting-peerNoiseBits">
            {PEER_NOISE_OPTIONS.map(n => <option key={n} value={String(n)}>{n === 0 ? "Exact" : `Blurred by about ${n} bits`}</option>)}
          </select>
          <span className="text-xs text-muted-foreground">Exact after the game ends, whichever you pick.</span>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span>Seeing the world</span>
          <select value={form.observation} onChange={e => setForm({ ...form, observation: e.target.value as SettingsForm["observation"] })} disabled={!!locked || busy}
            className="h-9 border bg-background px-2" data-testid="select-setting-observation">
            <option value="free">Free: everyone sees every change</option>
            <option value="paid">Paid: you see what you last looked at</option>
          </select>
          <span className="text-xs text-muted-foreground">{form.observation === "paid" ? "A look at the world costs energy; your own agents' moves you see for free." : "Every change is shown as it happens."}</span>
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
          <SetupPicker room={room} admin={!!user?.isAdmin} locked={locked} />
          <SettingsEditor room={room} preset={preset} locked={locked} />
        </>) : (
          <div className="space-y-1">
            <p>This room plays <span className="font-medium" data-testid="text-setup">{preset.title}</span>: {setupBlurb(preset)}</p>
            <Link href={rulesLink(preset)} className="text-xs underline underline-offset-4" data-testid="link-setup-rules">See its rules</Link>
          </div>
        )}
        <p className="text-muted-foreground" data-testid="text-next-game-summary">{nextGameSummary(preset, room.overrides)}</p>
        {locked && owner && !settings.hidden && <p className="text-xs text-muted-foreground" data-testid="text-settings-locked">{locked}</p>}
        {room.game && <p className="text-xs text-muted-foreground" data-testid="text-settings-frozen">Game {room.game.number} keeps the settings it started with: these are for the next game.</p>}
      </div>
    </Section>
  );
}
