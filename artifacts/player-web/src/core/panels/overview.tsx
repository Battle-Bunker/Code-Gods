/**
 * Where am I: three sentences (the situation, how you're doing, the next step), three big numbers (rank, total
 * payoff, agents acting) and ONE next-step button. Lobby variant: who is here and ready, the owner, what happens
 * when the game starts, and its rule tables' progress while a first game on a new shape prepares them. `focus` (set by the assistant) chooses what the middle sentence is about.
 */
import { useMemo } from "react";
import { useLeaderboard, useObjects } from "@/sdk";
import { useNow, useSituation } from "@/core/game/situation";
import type { nextStep } from "./next-step";
import { useNextStep } from "./use-next-step";
import { BigNumber, PreparingNote, PrimaryButton, clock, fmt, ordinal, type PanelProps } from "./kit";

export default function Overview({ paneId, params, phase }: PanelProps<"overview">) {
  const { step, go, situation: s, agents } = useNextStep(paneId, phase);
  const objects = useObjects({ hz: 1 });
  const board = useLeaderboard({ hz: 1 });
  const now = useNow();
  const standing = useMemo(() => {
    const ranked = [...board].sort((a, b) => b.totalPayoff - a.totalPayoff);
    const index = ranked.findIndex(r => r.godId === s.obs?.self.godId);
    return { rank: index >= 0 ? index + 1 : null, of: ranked.length, total: objects.reduce((sum, o) => sum + o.payoff, 0) };
  }, [board, objects, s.obs?.self.godId]);
  const acting = agents.filter(a => a.eligible).length;

  if (phase === "lobby") return <Lobby next={step} onNext={go} />;

  const obs = s.obs;
  const until = phase === "planning" ? obs?.planningEndsAt : phase === "paused" ? obs?.pauseEndsAt : undefined;
  const left = until && until > now ? Math.ceil((until - now) / 1000) : null;
  const situation = phase === "planning" ? `Planning: the world starts ${left ? `in ${left} s` : "any moment"}.`
    : phase === "running" ? `The world is running (world time ${clock(obs?.economy?.worldSeconds ?? 0)}).`
    : phase === "paused" ? `The world is paused${left ? `; it resumes in ${left} s` : ""}.`
    : `The game is over (world time ${clock(obs?.economy?.worldSeconds ?? 0)}): every panel shows its final state.`;
  const focus = params.focus === "auto" ? (phase === "planning" ? "goal" : "standing") : params.focus;
  const middle = !s.seated && phase !== "ended" ? "You're watching this game; you play in the next one."
    : focus === "goal" ? (obs?.self.utility ? `Your secret goal: ${obs.self.utility.summary}` : "Your secret goal is dealt when the game starts.")
    : focus === "agents" ? (agents.length ? `You have ${agents.length} agent${agents.length === 1 ? "" : "s"}; ${acting} can act now.` : "You have no agents yet.")
    : standing.rank ? `You're ${ordinal(standing.rank)} of ${standing.of}, with ${fmt(standing.total)} bits of payoff.` : "Nobody has scored yet.";

  return (
    <div className="space-y-6" data-testid="panel-overview">
      {/* After a game ended, the next one may be preparing its rule tables. */}
      {s.room?.preparing && <PreparingNote preparing={s.room.preparing} />}
      <div className="max-w-[68ch] space-y-1 text-base leading-relaxed">
        <p>{situation}</p>
        <p>{middle}</p>
        <p>Next: {step.why}</p>
      </div>
      <dl className="grid grid-cols-3 gap-4">
        <BigNumber label="Rank" value={standing.rank ? `${standing.rank}/${standing.of}` : "–"} testId="stat-rank" />
        <BigNumber label="Payoff" value={fmt(standing.total)} testId="stat-payoff" tone={standing.total > 0 ? "good" : standing.total < 0 ? "bad" : undefined} />
        {phase === "ended"
          ? <BigNumber label="Agents" value={String(agents.length)} testId="stat-agents" />
          : <BigNumber label="Agents acting" value={agents.length ? `${acting}/${agents.length}` : "0"} testId="stat-agents" />}
      </dl>
      <PrimaryButton onClick={go} testId="button-next-step">{step.label}</PrimaryButton>
    </div>
  );
}

function Lobby({ next, onNext }: { next: ReturnType<typeof nextStep>; onNext: () => void }) {
  const { room, obs } = useSituation();
  return (
    <div className="space-y-6" data-testid="panel-overview">
      <div className="max-w-[68ch] space-y-1 text-base leading-relaxed">
        <p>You're in the lobby of room {room?.shortCode ?? obs?.roomShortCode ?? "…"}{room ? `, run by ${room.ownerName}` : ""}.</p>
        <p>When the owner starts the game, everyone gets a secret goal, then a short planning time to write a first agent before the world runs.</p>
        <p>Next: {next.why}</p>
      </div>
      {room?.preparing && <PreparingNote preparing={room.preparing} />}
      {room && (
        <ul className="grid gap-1 text-sm sm:grid-cols-2" aria-label="Who is here">
          {room.members.map(m => (
            <li key={m.id} className="flex items-center gap-2" data-testid={`row-member-${m.id}`}>
              <span aria-hidden className={m.ready ? "text-[hsl(var(--accent))]" : "text-muted-foreground"}>{m.ready ? "✓" : "○"}</span>
              <span className="truncate">{m.name}</span>
              {m.kind === "ai" && <span className="label">AI</span>}
              {m.id === room.ownerId && <span className="label">owner</span>}
              <span className="sr-only">{m.ready ? "ready" : "not ready"}</span>
            </li>
          ))}
        </ul>
      )}
      <PrimaryButton onClick={onNext} testId="button-next-step">{next.label}</PrimaryButton>
    </div>
  );
}
