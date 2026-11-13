/**
 * The glossary (docs/research/ui-redesign/onboarding-and-config.md §2, plus the client's own words): one line per
 * term, shown by <Term> as a tooltip, listed by the palette's "Explain a term…", and reused by the assistant's primer.
 */

/**
 * The score vocabulary, fixed once (first-time players read "point" on their card and "points" on the leaderboard as
 * the same thing). Every surface a new player meets uses these words and no others for these four things:
 *   rule score   what your goal card counts on ONE object ("each SET adds 1 to your rule score");
 *   ✨ rarity    how rare that rule score is among random objects, in bits (the only thing "bits" names);
 *   points       what the leaderboard adds up: for each object, your ✨ rarity × how much the others want it;
 *   ⚡ energy    what you earn every second and spend on summoning agents and on their moves (never "bits").
 */
export const SCORE_WORDS = {
  ruleScore: "rule score",
  rarity: "✨ rarity",
  points: "points",
  energy: "⚡ energy",
  /** The unit after an amount of energy: "42 ⚡", "16 ⚡/s". */
  energyUnit: "⚡",
  others: "how much the others want it",
} as const;

/** One plain sentence per word, for tooltips and the scoring explainer. */
export const SCORE_LINES = {
  ruleScore: "Your rule score is what your goal card counts on one object. Your agents change objects to raise it.",
  rarity: "✨ Rarity is how hard your rule score is to get by chance, in bits: 1 random object in 8 doing as well is ✨ 3. Each ✨ is twice as rare.",
  points: "Points are what the leaderboard adds up. One object gives you its ✨ rarity by your rule × how much the others want it (their ✨ added up, never below 0).",
  total: "Your points now are the points of every object in the world added up. This is your total as last counted for you, so it can be a few seconds old.",
  moves: "Every object on the table gives you points when it is rare by your rule and the others want it too, so this moves when anyone changes an object.",
  nobody: "An object only you want gives you 0 points, however high your rule score is.",
  energy: "You earn ⚡ energy every second. Summoning an agent spends yours once; each agent then earns its share and spends some on every move.",
} as const;

/** SCORE_LINES.moves in the table's own noun ("grid", "number"): why your points move while you do nothing. */
export const scoreMovesLine = (noun: string = "object"): string =>
  noun === "object" ? SCORE_LINES.moves : SCORE_LINES.moves.replace("Every object", `Every ${noun}`).replace("an object", `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`);

export const GLOSSARY = {
  room: { term: "Room", gloss: "The table you play at: a short code, an owner and up to 8 seats; it hosts game after game." },
  game: { term: "Game", gloss: "One round in a room: a planning minute, then a running world that ends at a random moment." },
  god: { term: "God", gloss: "A player, human or AI." },
  object: { term: "Object", gloss: "One thing in the world (a grid, a number, a piece of text); no two are ever identical." },
  "utility-function": { term: "Utility function", gloss: "Your secret rule: it gives every object a rule score; only which object is better matters." },
  "rule-score": { term: "Rule score", gloss: SCORE_LINES.ruleScore },
  "defence-goal": { term: "Defence goal", gloss: "An optional second secret rule: objects that are unusually bad for it take ✨ rarity away from you." },
  bits: { term: "✨ Rarity (bits)", gloss: SCORE_LINES.rarity },
  "others-care": { term: "Others' care", gloss: "The other gods' ✨ rarity for an object added together (never below 0): the only thing you learn about their rules." },
  payoff: { term: "Points", gloss: "One object gives you its ✨ rarity by your rule × how much the others want it. The leaderboard adds up every object, so your total moves when anyone changes one." },
  "points-tuple": { term: "Points tuple", gloss: "A rule score with parts: primary, then secondary (tertiary…), like (3, −5). Compared primary first, then secondary; its ✨ is how rare it is." },
  salience: { term: "Salience", gloss: "Everyone's ✨ rarity for an object added up: public, so you can see what the table cares about." },
  agent: { term: "Agent", gloss: "Your small program, agent(obj), which returns up to 16 moves when the world picks it." },
  summon: { term: "Summon", gloss: "Paying ⚡ energy to put an agent into the world; the price grows with the program's length (shorter is cheaper)." },
  energy: { term: "Energy", gloss: "What you spend to summon agents. The power you do not give to your agents refills it every second, until it is full: it holds only so many seconds of it." },
  "agent-energy": { term: "Agent energy", gloss: "An agent's own ⚡ energy: its income fills it until its store is full, each act pays from it. Above 0 it can get turns; at or below 0 it waits for income." },
  power: { term: "Power", gloss: "Your fixed income of ⚡ energy per second. You split it: a share to each agent, and the rest refills your own energy." },
  "power-share": { term: "Power share", gloss: "The slice of your power one agent gets (0 to 100%). That slice is its income; all your agents' shares add up to at most 100%." },
  "read-bits": { term: "Reading cost", gloss: "The ⚡ energy an act pays for looking at the object: a little for each bit it reads. Looking is much cheaper than changing. Never free." },
  "change-cost": { term: "Change cost", gloss: "The extra ⚡ energy an act pays when it really changes the object, on top of reading it. No change, no change cost." },
  look: { term: "Look", gloss: "Where looking costs energy: paying your own ⚡ energy to see one object, or all of them, as it is right now." },
  "last-seen": { term: "Last seen", gloss: "Where looking costs energy, an object shows as you last saw it: at its birth, after your agent changed or fully read it, or after a look." },
  skip: { term: "Skip", gloss: "A turn where the agent looked and changed nothing. It pays only for reading (and a little for the turn itself), so skipping is cheap." },
  turn: { term: "Turn", gloss: "A chance to act on one object. The world hands turns out at random: more energy means more turns, however many agents hold it." },
  pause: { term: "Pause", gloss: "Each god may stop the world once per game (3 minutes by default) to negotiate." },
  palette: { term: "Command palette", gloss: "The search box (Ctrl/Cmd+K) that runs every command you have: the same repertoire your assistant has." },
  panel: { term: "Panel", gloss: "A view of the game in a pane: a built-in one you pick (your assistant sets its parameters) or one of your own." },
  pane: { term: "Pane", gloss: "One tile of your screen: a panel or your assistant; drag it anywhere." },
} as const satisfies Record<string, { term: string; gloss: string }>;

export type GlossaryId = keyof typeof GLOSSARY;
export const GLOSSARY_IDS = Object.keys(GLOSSARY) as GlossaryId[];
