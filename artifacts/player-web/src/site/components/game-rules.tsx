import { CHANGE_READ_RATIO, changeCostExplained, costModelOf, fullReadCharge, LANGUAGE_SPECS, allowedLanguages, complexityFor, grammarFor, type Language } from "@workspace/game-core";
import type { InstanceInfo, Settings } from "@/site/lib/types";

const AGENT_SHAPES: Partial<Record<Language, string>> = { python: "def agent(grid):", typescript: "function agent(grid) { ... }" };

/** The room's or game's rules as text for any AI assistant (the palette's "Copy game rules for an AI"). */
export function rulesFor(s: Settings, roomCode?: string | null, gameCode?: string | null, instance?: InstanceInfo) {
  const languages = allowedLanguages(s);
  const agent = languages.map(l => `\`${AGENT_SHAPES[l] ?? LANGUAGE_SPECS[l].grammarLabel}\` (${LANGUAGE_SPECS[l].label})`).join(" or ");
  const t = instance ? `${instance.label} (${instance.key}, wire format ${instance.codec.format})` : `${s.objectType} ${JSON.stringify(s.typeArgs)}`;
  // A game started before the capacity rule has no fullChargeSeconds: its rules say nothing about filling up.
  const fill: number | undefined = s.fullChargeSeconds;
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
An act pays only what it does: what it READS (each value the first time it looks, repeats are free; where cells are is free) plus, only when it changes the object, the bits of its CHANGE. Looking is ${CHANGE_READ_RATIO}× cheaper than changing: each bit of the object it reads costs 1/${CHANGE_READ_RATIO} bit of energy (a look at every value of one object here costs ${fullReadCharge(s).toFixed(1)} bits). Returning no calls is a skip: it pays only its reads and is not a failure. Being given an object is itself a small read (which of the live objects it is), so every turn costs a little, even one that looks at nothing; there is no other charge per act.
${changeCostExplained(s, costModelOf(s))}
Summoning costs the agent's description bits (counted in its own language: ${languages.map(l => `${LANGUAGE_SPECS[l].label} ${complexityFor(l)}`).join(", ")}) from your god energy. You have ${s.powerPerSecond ?? 8} bits of power per world second to share between your agents: each gets a share of it (a new agent gets half of what you have not shared yet; you can change a share any time, and a destroyed agent's share comes back). Each agent has its own ⚡ energy: it earns its share of the power${fill === undefined ? ", with no cap" : ""}, and pays each act's actual cost (it may go below zero: it then waits for its income). The expected cost per act that validation shows is only an estimate; nothing is charged from it. More agents do not make more power: they divide it. So look before you change, return no calls when nothing is worth doing, and save energy to act more often.${fill === undefined ? "" : ` Energy fills up in ${fill} seconds and then stops: use it or re-allocate it. An agent holds at most ${fill} seconds of its share of the power; when you lower a share, what the agent holds above its new limit is lost.`} Python agents may not use names or attributes that start with an underscore, getattr/setattr/delattr, attrgetter/methodcaller, format/format_map, or frame/closure introspection. You may destroy your own agents at any time, for free. At most ${s.maxAgentsPerGod ?? 200} agents per god.
All object values are unique. A transformation to an existing value, including the object's own, fails without changing the world. Spawns redraw duplicates.
Grammar: ${languages.map(grammarFor).join(" or ")}. Only the supported sandbox computational libraries/built-ins are available, not unrestricted host access. Read-only time and randomness are allowed; filesystem, network and process access are not.
At each interaction a random object is picked, then an agent with positive energy, with probability proportional to its energy. Turns follow energy, not the number of agents: several agents sharing the same power get, together, the same turns as one. You cannot choose its target.
Interaction cap (not guaranteed throughput): ${s.interactionRateHz} interactions/second. Guest compute budget: ${s.interactionComputeMs} ms per interaction.
Starting objects: ${s.startingObjectCount}. Uniform-random spawning: ${s.spawnRateHz} objects/second of world time.

## Energy and timing
Your own energy: start ${s.startingEnergy} bits, income the power you have not shared with agents (${s.powerPerSecond ?? 8} bits per world second in all, so it stops while the world does: in planning and pauses).${fill === undefined ? "" : ` It fills up in ${fill} seconds and then stops: it holds at most ${fill} seconds of that income, so giving an agent more power lowers what you can hold (what you hold above the new limit is lost), and with all your power shared you hold nothing and cannot summon until you take power back.`} Validation shows an agent's summon price and estimated cost per act (reading and changing) without spending energy.
Planning lasts ${s.planningSeconds} seconds; the world does not move during planning.
Each god may pause a running game once, for ${s.pauseSeconds} seconds. World time stops during pauses.
${s.durationMode === "fixed" ? `Game length: exactly ${s.halfLifeSeconds} seconds of world time. The end time is public.` : `Game half-life: ${s.halfLifeSeconds} seconds of world time. This is a random lifetime, NOT a fixed duration. The exact end time is hidden.`}

## Information and politics
${s.observation === "paid" || s.observation === "boards" || s.observation === "agents" ? `LOOKING COSTS ENERGY in this game: ${s.observation === "boards" ? "every board is shown as it is, but the other gods' summed bits on it (and so your payoff) are as you were last told them" : "you see each object as you were last told it"} (with how long ago): at its birth (free: the starting world and every new object), when one of your agents changes it or reads all of it${s.observation === "agents" ? ". You cannot pay to look yourself: your agents are your only eyes." : ", or when you pay for a look from your own energy (the price of reading the whole object, shown on the Look button; the same energy pays for summons)."} An object's birth is public; its life is paid. Activity is public; content is paid. Everyone sees for free the leaderboard, how many objects there are and how often and when each has changed, but not what it changed to. Other gods' changes reach you only when you are told the object again; after the game everything is open.
` : ""}You receive your own utility card (and defence goal), your own bits for each object, the SUM of all OTHER gods' net bits for it, the floored peer care and your payoff.
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
