/**
 * The glossary (docs/research/ui-redesign/onboarding-and-config.md §2, plus the client's own words): one line per
 * term, shown by <Term> as a tooltip, listed by the palette's "Explain a term…", and reused by the assistant's primer.
 */
export const GLOSSARY = {
  room: { term: "Room", gloss: "The table you play at: a short code, an owner and up to 8 seats; it hosts game after game." },
  game: { term: "Game", gloss: "One round in a room: a planning minute, then a running world that ends at a random moment." },
  god: { term: "God", gloss: "A player, human or AI." },
  object: { term: "Object", gloss: "One thing in the world (a grid, a number, a piece of text); no two are ever identical." },
  "utility-function": { term: "Utility function", gloss: "Your secret rule that scores every object; only which object is better matters." },
  "defence-goal": { term: "Defence goal", gloss: "An optional second secret rule: objects that are unusually bad for it cost you bits." },
  bits: { term: "Bits", gloss: "How rare an object is by your rule: 1 in 8 random objects as good means 3 bits." },
  "others-care": { term: "Others' care", gloss: "The other gods' bits for an object added together (never below 0): the only thing you learn about their rules." },
  payoff: { term: "Payoff", gloss: "Your bits × others' care for one object; your score is the sum over all live objects." },
  "points-tuple": { term: "Points tuple", gloss: "A rule's score: primary points, then secondary (tertiary…), like (3, −5). Compared primary first, then secondary; your bits are its rarity." },
  salience: { term: "Salience", gloss: "Everyone's bits for an object added up: public, so you can see what the table cares about." },
  agent: { term: "Agent", gloss: "Your small program, agent(obj), which returns up to 16 moves when the world picks it." },
  summon: { term: "Summon", gloss: "Paying energy to put an agent into the world; the price is the program's description bits (shorter is cheaper)." },
  energy: { term: "Energy", gloss: "Your own bits for summoning agents. The power you keep for yourself refills it, until it is full: it holds only so many seconds of it." },
  "agent-energy": { term: "Agent energy", gloss: "An agent's own bits: income fills them until the store is full, each act pays from them. At or below 0 it waits for income." },
  power: { term: "Power", gloss: "Your fixed income in bits per second. You split it: a share to each agent, and the rest refills your own energy." },
  "power-share": { term: "Power share", gloss: "The slice of your power one agent gets (0 to 100%). That slice is its income; all your agents' shares add up to at most 100%." },
  "read-bits": { term: "Read bits", gloss: "What an act pays for looking at the object: a small fraction of a bit per bit read, since looking is much cheaper than changing. Never free." },
  "change-cost": { term: "Change cost", gloss: "The extra bits an act pays when it really changes the object, on top of reading it. No change, no change cost." },
  skip: { term: "Skip", gloss: "A turn where the agent looked and changed nothing. It pays only for reading, so skipping is cheap." },
  turn: { term: "Turn", gloss: "A chance to act on one object. The world hands turns out at random: more energy means more turns, at most 4 a second each." },
  pause: { term: "Pause", gloss: "Each god may stop the world once per game (3 minutes by default) to negotiate." },
  palette: { term: "Command palette", gloss: "The search box (Ctrl/Cmd+K) that runs every command you have: the same repertoire your assistant has." },
  panel: { term: "Panel", gloss: "A view of the game in a pane: a built-in one you pick (your assistant sets its parameters) or one of your own." },
  pane: { term: "Pane", gloss: "One tile of your screen: a panel or your assistant; drag it anywhere." },
} as const satisfies Record<string, { term: string; gloss: string }>;

export type GlossaryId = keyof typeof GLOSSARY;
export const GLOSSARY_IDS = Object.keys(GLOSSARY) as GlossaryId[];
