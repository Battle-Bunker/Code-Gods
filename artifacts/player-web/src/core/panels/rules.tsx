/**
 * How to play: the 90-second explanation (docs/research/ui-redesign/onboarding-and-config.md §2), how scoring works,
 * and this room's settings, with the full rules as the assistant reads them (rulesText) one click away.
 */
import { HowScoringWorks } from "@workspace/object-views";
import { rulesText } from "@workspace/player-client/rules";
import { Term } from "@workspace/ui-kit";
import { useObjectContext, useRoomInfo } from "@/sdk";
import { Section, type PanelProps } from "./kit";

function Primer({ world }: { world: string }) {
  return (
    <div className="max-w-[68ch] space-y-3 text-[15px] leading-relaxed" data-testid="text-primer">
      <p>Code Gods is a game about a shared world and secret wishes.</p>
      <p>The world is a crowd of <Term id="object">objects</Term>: {world}. Every player is a god with a secret <Term id="utility-function">utility function</Term>, a short rule that scores every object. The rarer an object is by your rule, the more <Term id="bits">bits</Term> it is worth to you.</p>
      <p>You cannot touch objects yourself. You <Term id="summon">summon</Term> <Term id="agent">agents</Term>: tiny Python or TypeScript programs that, when the world picks them, make a few moves on a random object. Summoning costs your <Term id="energy">energy</Term>, which refills every second, and shorter programs cost less. Each agent then earns its own energy and spends some on every move.</p>
      <p>Here is the twist. Your <Term id="payoff">payoff</Term> from an object is your bits times how much the other gods, together, care about it. An object only you love earns you nothing. You cannot see anyone else's rule, only the total. So talk: say what you want in the public chat, find overlaps, strike deals.</p>
      <p>The game ends at a random moment. Your score is your payoff added up over every object alive then. Your assistant can explain, write agents and draft messages for you.</p>
    </div>
  );
}

export default function Rules({ params }: PanelProps<"rules">) {
  const room = useRoomInfo();
  const { noun } = useObjectContext();
  const settings = (room?.settings ?? {}) as Record<string, unknown>;
  const objectType = typeof settings.objectType === "string" ? settings.objectType : undefined;
  const world = objectType === "Grid" || !objectType ? "usually small grids of coloured numbers" : objectType === "Int" ? "whole numbers" : "pieces of text";
  const all = params.section === "all";
  const rows: [string, unknown][] = [
    ["Objects", objectType], ["Language", settings.language], ["Planning", settings.planningSeconds !== undefined ? `${settings.planningSeconds} s` : undefined],
    ["Starting energy", settings.startingEnergy !== undefined ? `${settings.startingEnergy} bits` : undefined], ["Energy per second", settings.energyPerSecond],
    ["Pause length", settings.pauseSeconds !== undefined ? `${settings.pauseSeconds} s` : undefined], ["Game half-life", settings.halfLifeSeconds !== undefined ? `${settings.halfLifeSeconds} world s` : undefined],
  ];
  return (
    <div className="space-y-6" data-testid="panel-rules">
      {(all || params.section === "primer") && <Primer world={world} />}
      {(all || params.section === "scoring") && <HowScoringWorks noun={noun} open={params.section === "scoring"} />}
      {(all || params.section === "settings") && (
        <Section title="This room's next game">
          {!room ? <p className="text-sm text-muted-foreground">Loading the room…</p> : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
              {rows.filter(([, v]) => v !== undefined).flatMap(([k, v]) => [<dt key={`${k}-k`} className="text-muted-foreground">{k}</dt>, <dd key={`${k}-v`} className="font-mono">{String(v)}</dd>])}
            </dl>
          )}
          {room && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">The full rules, as your assistant reads them</summary>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap font-mono text-[12px]">{rulesText(settings)}</pre>
            </details>
          )}
        </Section>
      )}
    </div>
  );
}
