/**
 * How to play (integration plan §1.6): the 90-second explanation of the game on lines, in player words, with this
 * game's values (its header's planning, length and starting energy; its preset's title, players, power and bidding),
 * then the same values as a short table.
 */
import { presetOf } from "@workspace/engine/convex/v2/presets.ts";
import { useState } from "react";
import { agentPrimer } from "@workspace/v2-agents/pure";
import { objectTypeOf, useGame, variantOf } from "@/sdk";
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
      <CopyForAi input={input} variant={header.variant} />
    </div>
  );
}
