/**
 * How to play (integration plan §1.6): the 90-second explanation of the game on lines, in player words, with this
 * game's values (its header's planning, length and starting energy; its preset's title, players, power and bidding),
 * then the same values as a short table.
 */
import { presetOf } from "@workspace/engine/convex/v2/presets.ts";
import { useState } from "react";
import { agentPrimer } from "@workspace/v2-agents/pure";
import { objectTypeOf, useGame, useGameDetails, useLeaderboard, variantOf } from "@/sdk";
import { endReasonLabel, fmtDuration, fmtWhen, toMs } from "@/site/lib/time";
import { toast } from "@/hooks/use-toast";
import { rulesFacts, rulesForAi, rulesParagraphs, type RulesInput } from "./rules-words";

/** v1's "Copy game rules for an AI": this pane's text and the agent primer, ready to paste into any assistant. */
function CopyForAi({ input, variant }: { input: RulesInput; variant: string }) {
  const [shown, setShown] = useState<string | null>(null);
  const copy = () => {
    const text = rulesForAi(input, agentPrimer(objectTypeOf(variant), variantOf(variant)));
    void navigator.clipboard.writeText(text).then(
      () => toast({ title: "Rules copied", description: "Paste them into any AI assistant." }),
      () => setShown(text));   // no clipboard here: show the text to copy by hand
  };
  return (
    <section className="space-y-1.5">
      <button type="button" className="text-sm underline underline-offset-4" onClick={copy} data-testid="button-copy-rules-ai">Copy the rules for an AI assistant</button>
      {shown && <textarea readOnly value={shown} className="h-48 w-full border bg-muted/40 p-2 font-mono text-[11px]" data-testid="text-rules-ai" onFocus={e => e.currentTarget.select()} />}
    </section>
  );
}

export function RulesPane() {
  const header = useGame();
  if (!header) return null;
  const preset = presetOf(header.preset);
  const input: RulesInput = {
    title: preset.title, minPlayers: preset.minPlayers,
    planningSeconds: header.planningSeconds, worldSeconds: header.worldSeconds, startingEnergy: header.startingEnergy,
    powerPerSecond: preset.economy.powerPerSecond, fullChargeSeconds: preset.economy.fullChargeSeconds, bid: preset.bid ?? null,
    durationMode: header.durationMode, scoreIntervalSeconds: header.scoreIntervalSeconds, peerNoiseBits: header.peerNoiseBits, readPriceWeight: header.readPriceWeight, driftSeconds: header.driftSeconds,
  };
  return (
    <div className="space-y-4 p-4" data-testid="rules">
      <div className="max-w-[68ch] space-y-3 text-[15px] leading-relaxed" data-testid="text-rules">
        {rulesParagraphs(input).map((p, i) => <p key={i}>{p}</p>)}
      </div>
      <section className="space-y-1.5">
        <h3 className="text-sm font-semibold">This game</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm" data-testid="rules-facts">
          {rulesFacts(input).flatMap(([k, v]) => [
            <dt key={`${k}-k`} className="text-muted-foreground">{k}</dt>,
            <dd key={`${k}-v`} className="tabular-nums">{v}</dd>,
          ])}
        </dl>
      </section>
      <Timings />
      <DealtRules />
      <CopyForAi input={input} variant={header.variant} />
    </div>
  );
}

/** v1's game details after the end: who held which rule (v2/games:details; hidden while the game runs). */
function DealtRules() {
  const d = useGameDetails();
  if (!d?.rules?.length) return null;
  return (
    <section className="space-y-1.5" data-testid="dealt-rules">
      <h3 className="text-sm font-semibold">Who held which rule</h3>
      <ul className="space-y-1.5 text-sm">
        {d.rules.map(r => (
          <li key={r.memberId} data-testid="row-dealt-rule">
            <span className="font-medium">{r.name}</span>{r.kind !== "human" ? <span className="text-muted-foreground"> ({r.kind === "ai" ? "AI player" : "practice partner"})</span> : null}: <span className="font-medium">{r.title}.</span> {r.card}
            {r.handicap ? <span className="text-muted-foreground"> Won by bid: −{r.handicap}%.</span> : null}
            {r.drifts > 0 ? <span className="text-muted-foreground"> Its numbers changed {r.drifts} time{r.drifts === 1 ? "" : "s"} during the game.</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * v1's "Game details" timings: when the game started and ended (with how long it ran), why it ended, and the world time
 * (the last published standings' while it runs; where it ended after the end).
 */
function Timings() {
  const d = useGameDetails();
  const standings = useLeaderboard();
  if (!d) return null;
  const ended = d.phase === "ended";
  const world = ended ? d.endWorld : standings?.worldSeconds ?? null;
  return (
    <section className="space-y-1.5" data-testid="game-timings">
      <h3 className="text-sm font-semibold">Game details</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Started</dt><dd data-testid="text-started">{fmtWhen(d.startedAt ?? d.createdAt)}</dd>
        <dt className="text-muted-foreground">Ended</dt>
        <dd data-testid="text-ended">{ended && d.endedAt ? `${fmtWhen(d.endedAt)} (${fmtDuration(toMs(d.endedAt) - toMs(d.startedAt ?? d.createdAt))})` : "still running"}</dd>
        <dt className="text-muted-foreground">End reason</dt><dd data-testid="text-end-reason">{ended ? endReasonLabel(d.endReason) : "—"}</dd>
        <dt className="text-muted-foreground">World time</dt><dd className="tabular-nums" data-testid="text-world-t">{world === null ? "—" : `${Math.round(world * 10) / 10} s`}</dd>
      </dl>
    </section>
  );
}
