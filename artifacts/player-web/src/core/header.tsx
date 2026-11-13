/**
 * The global header, 44 px on the page background: where am I. Identity (initials and full name), the phase pill
 * (the only primary-coloured element here), energy ("overdrawn by 312 ⚡" when it is below zero), the connection dot, the room code and the client mode in small
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
import { Link } from "./navigation";
import { SUMMON_FIRST, planningLine } from "./planning-line";
import { useMyAgents } from "@/sdk";
import { useDockActions } from "@/dock/actions";
import { useAffordances } from "@/core/use-affordances";
import { useOwnerActions } from "@/core/game/owner";
import { owedText } from "./panels/energy-capacity";

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
    case "lobby": { const ready = s.room?.members.filter(m => m.ready && !m.spectator).length; return s.room ? `Lobby · ${ready} of ${s.players} ready` : "Lobby"; }
    case "planning": {
      const left = countdown(obs.planningEndsAt);
      // The countdown itself is the planning line's, under the header (PlanningBar): one countdown on screen.
      if (left) return "Planning";
      // Past the deadline, planning holds until every allowed language's agent sandbox is warm.
      if (obs.sandboxes?.some(sb => sb.state !== "ready")) return "Planning · agent sandboxes warming up";
      // …and until hold rarity's corrections for this player count are computed (docs/energy-model.md §8).
      return obs.holdRarity?.state === "computing" ? "Planning · computing scoring for this many players" : "Planning";
    }
    case "running": return `Running · ${clock(obs.economy?.worldSeconds ?? 0)}`;
    case "paused": {
      if (obs.notice?.kind === "idle") return "Paused · idle";
      if (obs.notice?.kind === "safety") return "Paused for safety";
      const left = countdown(obs.pauseEndsAt); return left ? `Paused · resumes ${left}` : "Paused";
    }
    case "ended": return "Ended · game over";
  }
}

export function Header() {
  const { permission, mode, roomId } = useRoom();
  const s = useSituation();
  const now = useNow(1000);
  const wide = useWide();
  const self = s.obs?.self;
  const live = s.obs?.phase === "planning" || s.obs?.phase === "running" || s.obs?.phase === "paused";
  const roomCode = s.obs?.roomShortCode ?? s.room?.shortCode;
  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-[hsl(var(--card-border))] bg-background px-3 md:gap-4 md:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden className="inline-flex h-7 w-7 shrink-0 items-center justify-center bg-secondary font-mono text-[11px] font-semibold text-secondary-foreground">{self ? initials(self.label) : "·"}</span>
        <span className="hidden truncate text-sm font-semibold sm:inline" data-testid="text-self-label">{self?.label ?? "—"}</span>
        {permission === "read" && <span className="label shrink-0">view only</span>}
      </div>
      <span data-testid="text-phase" className="shrink-0 bg-primary px-2 py-0.5 font-mono text-[11px] font-semibold text-primary-foreground">{phasePill(s, now)}</span>
      {self && live && s.seated && <span className="hidden shrink-0 font-mono text-xs tabular-nums sm:inline" title={owedText(self.energy) ? "Your energy is overdrawn: you cannot summon until your income has covered it" : `Your energy: it pays for summons${s.obs?.economy?.lookPrice !== undefined ? " and looks" : ""} and refills every second${self.capacity !== undefined ? `, until it is full at ${bits(self.capacity)} ⚡` : ""}`} data-testid="text-energy">{owedText(self.energy) ?? `⚡ ${bits(self.energy)} energy`}</span>}
      <span data-testid="status-connection" className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" title={s.obs ? "Live" : "Connecting to the engine"}>
        <span aria-hidden className={`h-2 w-2 ${s.obs ? "bg-[hsl(var(--accent))]" : "beat bg-muted-foreground"}`} />
        <span className={s.obs ? "sr-only" : ""}>{s.obs ? "live" : "connecting"}</span>
      </span>
      <span className="hidden min-w-0 truncate font-mono text-[11px] text-muted-foreground lg:inline">
        room <span data-testid="text-room">{roomCode ?? roomId}</span> · <span data-testid="text-mode">{mode === "devserver" ? "your player app" : "hosted client"}</span>
        {roomCode && <> · <Link to={{ kind: "room", room: roomCode }} className="underline" data-testid="link-room-page">room page</Link></>}
      </span>
      {SAFE_MODE && <span className="shrink-0 text-xs text-muted-foreground" data-testid="text-safe-mode">Safe mode: panels are off</span>}
      <PlayerPalette compact={!wide} />
    </header>
  );
}

/** The command palette: its trigger (search field + menu) and the palette itself. The live header and the replay's both carry it. */
export function PlayerPalette({ compact, suggested = ["ui.forge.edit", "ui.panel.add.objects", "ui.chat", "ui.layout.side-by-side"] }: { compact: boolean; suggested?: string[] }) {
  const { focused } = useDock();
  const palette = usePaletteState();
  const { commands, context } = usePlayerCommands(palette.open ? palette.scopePaneId : focused);
  return (
    <>
      <div className="ml-auto shrink-0">
        <PaletteTrigger placeholder="Search or do…" onOpen={init => paletteStore.open(focused, init)} compact={compact} />
      </div>
      {/* The dock shell binds Cmd/Ctrl+K, "/" and "?" itself (it knows the focused pane), so the palette's own hotkeys stay off. */}
      <CommandPalette commands={commands} context={context} open={palette.open} onOpenChange={open => (open ? paletteStore.open(focused) : paletteStore.close())}
        init={palette.init} hotkeys={false} handoff={draft => composer.fill(draft.text)}
        placeholder="Search or do…" recentKey="cg.palette.player" suggested={suggested} />
    </>
  );
}

/**
 * Planning, under the header: what it is for, the one countdown to the world's start, the player's one next step as a
 * button while they have no agent ("Summon my first agent" opens the agent editor, which already holds a working
 * agent), and the owner's visible "Start the world now" (the palette's rooms.startWorldNow). Once the world runs, a
 * player still without an agent keeps the line and the button. The game timer stands down while the planning line
 * shows (game-timer.tsx). On a phone the two buttons stack under the text.
 */
export function PlanningBar() {
  const { permission } = useRoom();
  const s = useSituation();
  const now = useNow(1000);
  const owner = useOwnerActions();
  const dock = useDockActions();
  const { loading } = useMyAgents();
  const { editCode } = useAffordances().can;
  // The button summons the pre-filled example itself (dock.summonFirst), so it says so while the summon is in flight.
  const summoning = useRunner().busy === "summon";
  const line = planningLine({
    phase: s.phase, seated: s.seated, owner: s.isOwner && permission !== "read", planningEndsAt: s.obs?.planningEndsAt, nowMs: now,
    agents: loading ? undefined : s.agents, canSummon: editCode.ok,
  });
  if (!line) return null;
  return (
    <div role={s.phase === "planning" ? "timer" : "status"} aria-live="off" data-testid="banner-planning" className="flex flex-col items-center justify-center gap-x-4 gap-y-2 border-b border-[hsl(var(--card-border))] bg-muted px-3 py-2 text-center text-sm sm:flex-row sm:flex-wrap sm:text-left">
      <span className="font-medium tabular-nums" data-testid="text-planning">{line.text}</span>
      {line.summon && (
        <button type="button" data-testid="button-summon-first-agent" onClick={() => dock.summonFirst()} disabled={summoning} aria-busy={summoning || undefined}
          className="w-full shrink-0 bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-70 sm:w-auto sm:py-1">{summoning ? "Summoning…" : SUMMON_FIRST}</button>
      )}
      {line.startNow && (
        <button type="button" data-testid="button-start-world-now" onClick={() => void owner.startWorldNow()}
          className={`w-full shrink-0 px-3 py-1.5 text-sm font-semibold hover:opacity-90 sm:w-auto sm:py-1 ${line.summon ? "border border-primary bg-background text-primary" : "bg-primary text-primary-foreground"}`}>Start the world now</button>
      )}
    </div>
  );
}

/** Under the header: an uncertain command waiting for its identical retry, and short notices. */
export function HeaderBanners() {
  const { unknown, busy } = useRunner();
  const commands = useGameCommands();
  const notices = useNotices();
  const gameNotice = useSituation().obs?.notice;
  return (
    <>
      <PlanningBar />
      {gameNotice && (
        // Why the game is not moving (an idle park, a pause for safety, or the engine retrying): never mistaken for a crash.
        <div data-testid="banner-game-notice" data-kind={gameNotice.kind} role="status"
          className={`border-b border-[hsl(var(--card-border))] px-4 py-1.5 text-sm ${gameNotice.kind === "retrying" ? "bg-[hsl(var(--destructive)/0.15)]" : "bg-[hsl(var(--chart-4)/0.25)]"}`}>
          {gameNotice.text}
        </div>
      )}
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
