import type { RoomState } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Copy } from "lucide-react";

function rulesFor(room: RoomState) {
  const s = room.settings;
  return `# Code Gods — rules for an AI assistant

Room: ${room.shortCode}${room.game ? `\nGame: ${room.game.shortCode}` : ""}

## Goal and scoring
Each player is a distinct god with a private utility function u_i: T -> [0, 1].
For each CURRENT object x:
  my_object_score(x) = u_me(x) * sum(u_other(x) for every other god)
My TOTAL SCORE is the SUM of my_object_score(x) over ALL current objects.
It is NOT the average, the highest object score, or a cumulative score over time.
A transformation replaces the old object's contribution. A new object adds a contribution.
The leaderboard ranks gods by this total; maximize your total when the game ends.
An object that only you value gives you zero score. Cooperation can benefit multiple gods, but their incentives differ.

## World and agents
Object type T: ${s.objectType === "Int" ? `integer from ${s.intMin} through ${s.intMax}, inclusive` : `ASCII string, maximum ${s.stringMaxLength} characters`}.
All object values are unique. A transformation to an existing value, including its own unchanged value, fails without changing the world. Spawns redraw duplicates.
Language: ${s.language}. Submit source code that evaluates to a callable T -> T.
Grammar: ${s.grammarId}. Only the supported sandbox computational libraries/built-ins are available, not unrestricted host access. Read-only time and randomness are allowed; filesystem, network and process access are not.
Summoning adds an agent to the shared world. Agents remain available for random selection; they do not belong to individual objects.
At each interaction a random agent acts on a random object. You cannot choose its target.
The interaction rate is a cap, not a guaranteed throughput: ${s.interactionRateHz} interactions/second.
Per-interaction guest compute budget: ${s.interactionComputeMs} ms (excluding compilation/startup; separate safety limits also apply).
Invalid, out-of-domain, duplicate or over-budget results do not transform the object.
Starting objects: ${s.startingObjectCount}. Uniform-random spawning: ${s.spawnRateHz} objects/second of world time, subject to domain capacity and server limits.

## Energy and timing
Starting energy: ${s.startingEnergy}. Power: ${s.energyPerSecond} energy/real-world second.
Energy accrues during planning and pauses too. Summoning succeeds only if you can afford its complexity cost at that moment.
Complexity rule (${s.complexityFunctionId}): 1 per non-comment AST node, except constants cost 1 per byte. Validate source with the server to get its actual cost before summoning. Validation itself does not summon or spend energy.
Planning lasts ${s.planningSeconds} seconds; the world does not move during planning.
Each god may pause a running game once, for ${s.pauseSeconds} seconds. World time stops during pauses.
Game half-life: ${s.halfLifeSeconds} seconds of world time. This is a random lifetime, NOT a fixed duration: each half-life has a 50% chance of survival. The exact end time is hidden.

## Information and politics
You receive your full utility-function source, your utility for each object, the aggregate utility of all OTHER gods for it, and your object score.
Individual opponents' utilities are not disclosed. Public standings show total scores; the shared object table shows the sum of ALL gods' utilities.
Chat is global and public to every human and AI player; there are no private chats.
Frontier AI assistance and customized Replit clients/analytics are allowed. Negotiate about transformations and shared incentives; do not assume opponents share your goals.
Utility assignment uses ${s.utilitySelectorId}; functions and parameters differ between gods. Use your assigned source, not an invented utility.
The room owner configures settings between games and starts the game. Ready indicators do not prevent starting. At least three players are required, and AI players can fill seats.

## Assistant instructions
Use the authorized player client/API for observations, code validation, summoning, ready status, pause and public chat. A copied rules sheet is not authentication.
Check fresh world state and energy before acting. Distinguish your utility, others' aggregate utility and the product score. Optimize the SUM across the current world, not only a single object's score.
`;
}

export function GameRules({ room }: { room: RoomState }) {
  const { toast } = useToast();
  const text = rulesFor(room);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Game rules copied", description: "Paste into your AI assistant." });
    } catch {
      toast({ title: "Could not copy automatically", description: "Select the rules below and copy them manually.", variant: "destructive" });
    }
  }
  return (
    <section className="border bg-card" aria-label="Game rules">
      <div className="p-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Game rules for your AI</h2>
          <p className="text-xs text-muted-foreground">Includes this room’s current settings.</p>
        </div>
        <button onClick={copy} className="border px-3 py-2 text-sm inline-flex items-center gap-2 hover:bg-muted shrink-0" data-testid="button-copy-rules"><Copy className="h-4 w-4" />Copy rules</button>
      </div>
      <details className="border-t p-4">
        <summary className="cursor-pointer text-sm">Read or select the full rules</summary>
        <textarea readOnly value={text} aria-label="Copyable game rules" className="mt-3 w-full h-80 border bg-background p-3 font-mono text-xs resize-y" onFocus={event => event.currentTarget.select()} />
      </details>
    </section>
  );
}
