/**
 * How to play (integration plan §1.6): the 90-second explanation of the game on lines, in player words, with this
 * game's values (its header's planning, length and starting energy; its preset's title, players, power and bidding),
 * then the same values as a short table.
 */
import { presetOf } from "@workspace/engine/convex/v2/presets.ts";
import { useGame } from "@/sdk";
import { rulesFacts, rulesParagraphs, type RulesInput } from "./rules-words";

export function RulesPane() {
  const header = useGame();
  if (!header) return null;
  const preset = presetOf(header.preset);
  const input: RulesInput = {
    title: preset.title, minPlayers: preset.minPlayers,
    planningSeconds: header.planningSeconds, worldSeconds: header.worldSeconds, startingEnergy: header.startingEnergy,
    powerPerSecond: preset.economy.powerPerSecond, fullChargeSeconds: preset.economy.fullChargeSeconds, bid: preset.bid ?? null,
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
    </div>
  );
}
