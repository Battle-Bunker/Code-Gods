/**
 * The global header, 44 px on the page background: where am I. Identity (initials and full name), the phase pill
 * (the only primary-coloured element here), energy, the connection dot, the room code and the client mode in small
 * print, and the command palette (search field + menu; Cmd/Ctrl+K). Everything else lives in the palette.
 */
import { CommandPalette, PaletteTrigger } from "@workspace/ui-kit";
import { useRoom } from "@/sdk";
import { useDock } from "@/dock/store";
import { SAFE_MODE } from "@/shell/safe-mode";
import { useNow, useSituation, type Situation } from "@/core/game/situation";
import { runner, useGameCommands, useRunner } from "@/core/game/runner";
import { noticeStore, useNotices } from "./notices";
import { composer } from "@/core/chat/composer";
import { paletteStore, usePaletteState } from "./palette/store";
import { usePlayerCommands } from "./palette/use-commands";
import { useWide } from "./use-wide";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("") || "?";
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const bits = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));

function phasePill(s: Situation, now: number): string {
  const obs = s.obs;
  if (!obs) return "Connecting";
  const countdown = (until?: number) => (until && until > now ? clock(Math.ceil((until - now) / 1000)) : null);
  const live = obs.phase === "planning" || obs.phase === "running" || obs.phase === "paused";
  if (live && !s.seated) return `Spectating · ${obs.phase}`;
  switch (obs.phase) {
    case "lobby": { const ready = s.room?.members.filter(m => m.ready).length; return s.room ? `Lobby · ${ready} of ${s.members} ready` : "Lobby"; }
    case "planning": { const left = countdown(obs.planningEndsAt); return left ? `Planning · starts in ${left}` : "Planning"; }
    case "running": return `Running · ${clock(obs.economy?.worldSeconds ?? 0)}`;
    case "paused": { const left = countdown(obs.pauseEndsAt); return left ? `Paused · resumes ${left}` : "Paused"; }
    case "ended": return "Ended · game over";
  }
}

export function Header() {
  const { permission, mode, roomId } = useRoom();
  const s = useSituation();
  const now = useNow(1000);
  const { focused } = useDock();
  const palette = usePaletteState();
  const { commands, context } = usePlayerCommands(palette.open ? palette.scopePaneId : focused);
  const wide = useWide();
  const self = s.obs?.self;
  const live = s.obs?.phase === "planning" || s.obs?.phase === "running" || s.obs?.phase === "paused";
  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-[hsl(var(--card-border))] bg-background px-3 md:gap-4 md:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden className="inline-flex h-7 w-7 shrink-0 items-center justify-center bg-secondary font-mono text-[11px] font-semibold text-secondary-foreground">{self ? initials(self.label) : "·"}</span>
        <span className="hidden truncate text-sm font-semibold sm:inline" data-testid="text-self-label">{self?.label ?? "—"}</span>
        {permission === "read" && <span className="label shrink-0">view only</span>}
      </div>
      <span data-testid="text-phase" className="shrink-0 bg-primary px-2 py-0.5 font-mono text-[11px] font-semibold text-primary-foreground">{phasePill(s, now)}</span>
      {self && live && s.seated && <span className="hidden shrink-0 font-mono text-xs tabular-nums sm:inline" title="Your energy: it pays for summons and refills every second" data-testid="text-energy">⚡ {bits(self.energy)} bits</span>}
      <span data-testid="status-connection" className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" title={s.obs ? "Live" : "Connecting to the engine"}>
        <span aria-hidden className={`h-2 w-2 ${s.obs ? "bg-[hsl(var(--accent))]" : "beat bg-muted-foreground"}`} />
        <span className={s.obs ? "sr-only" : ""}>{s.obs ? "live" : "connecting"}</span>
      </span>
      <span className="hidden min-w-0 truncate font-mono text-[11px] text-muted-foreground lg:inline">
        room <span data-testid="text-room">{s.obs?.roomShortCode ?? s.room?.shortCode ?? roomId}</span> · <span data-testid="text-mode">{mode === "devserver" ? "your player app" : "hosted client"}</span>
      </span>
      {SAFE_MODE && <span className="shrink-0 text-xs text-muted-foreground" data-testid="text-safe-mode">Safe mode: panels are off</span>}
      <div className="ml-auto shrink-0">
        <PaletteTrigger placeholder="Search or do…" onOpen={init => paletteStore.open(focused, init)} compact={!wide} />
      </div>
      {/* The dock shell binds Cmd/Ctrl+K, "/" and "?" itself (it knows the focused pane), so the palette's own hotkeys stay off. */}
      <CommandPalette commands={commands} context={context} open={palette.open} onOpenChange={open => (open ? paletteStore.open(focused) : paletteStore.close())}
        init={palette.init} hotkeys={false} handoff={draft => composer.fill(draft.text)}
        placeholder="Search or do…" recentKey="cg.palette.player" suggested={["ui.forge.edit", "ui.panel.add.objects", "ui.chat", "ui.layout.side-by-side"]} />
    </header>
  );
}

/** Under the header: an uncertain command waiting for its identical retry, and short notices. */
export function HeaderBanners() {
  const { unknown, busy } = useRunner();
  const commands = useGameCommands();
  const notices = useNotices();
  return (
    <>
      {unknown && (
        <div data-testid="banner-unknown" role="alert" className="flex flex-wrap items-center gap-3 border-b border-[hsl(var(--card-border))] bg-[hsl(var(--chart-4)/0.25)] px-4 py-1.5 text-sm">
          <span>Your <strong>{unknown.envelope.command.type}</strong> may not have arrived: {unknown.error}</span>
          <button type="button" data-testid="button-retry-command" disabled={!!busy} onClick={() => void commands.retry(unknown.envelope)} className="font-semibold underline">Retry the same command</button>
          <button type="button" className="underline opacity-70" onClick={() => runner.dismissUnknown()}>It didn't apply</button>
        </div>
      )}
      {notices.length > 0 && (
        <div role="status" className="space-y-0.5 border-b border-[hsl(var(--card-border))] px-4 py-1 text-xs" data-testid="text-palette-notice">
          {notices.map(n => (
            <p key={n.id} className={`flex items-center gap-2 ${n.tone === "error" ? "text-destructive" : "text-muted-foreground"}`}>
              <span className="min-w-0 flex-1 break-words">{n.text}</span>
              <button type="button" className="shrink-0 underline" onClick={() => noticeStore.dismiss(n.id)}>dismiss</button>
            </p>
          ))}
        </div>
      )}
    </>
  );
}
