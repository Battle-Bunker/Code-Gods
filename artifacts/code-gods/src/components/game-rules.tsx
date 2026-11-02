import { LANGUAGE_SPECS, allowedLanguages, complexityFor, grammarFor, type Language } from "@workspace/game-core";
import type { InstanceInfo, Settings } from "@/lib/types";

const AGENT_SHAPES: Partial<Record<Language, string>> = { python: "def agent(grid):", typescript: "function agent(grid) { ... }" };

/** The room's or game's rules as text for any AI assistant (the palette's "Copy game rules for an AI"). */
export function rulesFor(s: Settings, roomCode?: string | null, gameCode?: string | null, instance?: InstanceInfo) {
  const languages = allowedLanguages(s);
  const agent = languages.map(l => `\`${AGENT_SHAPES[l] ?? LANGUAGE_SPECS[l].grammarLabel}\` (${LANGUAGE_SPECS[l].label})`).join(" or ");
  const t = instance ? `${instance.label} (${instance.key}, wire format ${instance.codec.format})` : `${s.objectType} ${JSON.stringify(s.typeArgs)}`;
  const moves = instance?.mutators.length ? instance.mutators.map(m => `${m.emoji} ${m.id}: ${m.summary}`).join("\n  ") : "(see the room's helpers)";
  return `# Code Gods — rules for an AI assistant

${roomCode ? `Room: ${roomCode}` : "Room: (no longer available)"}${gameCode ? `\nGame: ${gameCode}` : ""}

## Goal and scoring (information scoring, payoffs in bits²)
Each player is a god with a private utility function: it scores every object; bigger is better, and only the order matters.
The server turns your score into ✨ rarity bits: if only 1 random object in N is at least as good, that is log2(N) bits.
${s.defenceGoals ? `Every god also has a defence goal (penalty(x), bigger is worse) that takes ⚠️ bits away only when an object is worse than usual (weight ${s.penaltyWeight ?? 1}).` : "Defence goals are off in this game: no god has one."}
Net bits n = ✨ − weight × (⚠️ − its average). For each CURRENT object x:
  payoff_me(x) = n_me(x) * max(0, sum(n_other(x) for every other god))
My TOTAL PAYOFF is the SUM of payoff_me(x) over ALL current objects (not an average, not cumulative over time).
If, overall, the others don't care about an object, nobody scores from it. You cannot win by hating things together.

## World and agents
Object type: ${t}.
An agent is ordinary code in one of this game's languages, chosen per agent: ${agent}, against the room's helper prelude. It returns a list of at most 16 mutator calls; objects change only through these mutators:
  ${moves}
Each act costs bits (naming the moves and their parameters, erased information and how much of the object moved).
Summoning costs the agent's description bits (counted in its own language: ${languages.map(l => `${LANGUAGE_SPECS[l].label} ${complexityFor(l)}`).join(", ")}) from your god energy. Each agent then has its own ⚡ energy: it earns ${s.agentEnergyPerSecond ?? 2} bits per second of world time (up to ${s.agentBatteryActs ?? 2} acts' worth), acts only while its energy covers its expected act cost, and pays each act's actual cost (it may go below zero: a cooldown). You may destroy your own agents at any time, for free. At most ${s.maxAgentsPerGod ?? 200} agents per god.
All object values are unique. A transformation to an existing value, including the object's own, fails without changing the world. Spawns redraw duplicates.
Grammar: ${languages.map(grammarFor).join(" or ")}. Only the supported sandbox computational libraries/built-ins are available, not unrestricted host access. Read-only time and randomness are allowed; filesystem, network and process access are not.
At each interaction a random eligible agent acts on a random object. You cannot choose its target.
Interaction cap (not guaranteed throughput): ${s.interactionRateHz} interactions/second. Guest compute budget: ${s.interactionComputeMs} ms per interaction.
Starting objects: ${s.startingObjectCount}. Uniform-random spawning: ${s.spawnRateHz} objects/second of world time.

## Energy and timing
God energy: start ${s.startingEnergy} bits, income ${s.energyPerSecond} bits per real-world second, also during planning and pauses. Validation shows an agent's summon cost and expected cost per act without spending energy.
Planning lasts ${s.planningSeconds} seconds; the world does not move during planning.
Each god may pause a running game once, for ${s.pauseSeconds} seconds. World time stops during pauses.
Game half-life: ${s.halfLifeSeconds} seconds of world time. This is a random lifetime, NOT a fixed duration. The exact end time is hidden.

## Information and politics
You receive your own utility card (and defence goal), your own bits for each object, the SUM of all OTHER gods' net bits for it, the floored peer care and your payoff.
Every transformation and spawn is public to every player as it happens (object, value before and after, world time), without saying whose agent made it.
Individual opponents' utilities and bits are not disclosed. Public standings show total payoffs, updated for everyone at once every ${s.scoreIntervalSeconds ?? 10} seconds of world time (your own score is live); while the game runs, the other gods' summed bits carry random noise of about ${s.peerNoiseBits ?? 0} bits (fixed per change; exact after the end); the shared object table shows salience, the sum of ALL gods' net bits.
Chat is global and public to every human and AI player; there are no private chats.
Utility assignment uses ${s.utilitySelectorId}; the public catalog of possible utility functions is listed in the room.
The room owner configures settings between games and starts each game; every game uses a snapshot of the room's settings taken at launch. At least three players are required, and AI players can fill seats.

## Assistant instructions
Use the authorized player client/API (protocol code-gods.player.v3) for observations, validation, summoning, destroying agents, ready status, pause and public chat. A copied rules sheet is not authentication.
Check fresh world state and energy before acting. Optimize the SUM across the current world, not one object.
`;
}
