/**
 * The glossary (docs/research/ui-redesign/onboarding-and-config.md §2, plus the client's own words): one line per
 * term, shown by <Term> as a tooltip, listed by the palette's "Explain a term…", and reused by the assistant's primer.
 */

/**
 * The score vocabulary, fixed once (first-time players read "point" on their card and "points" on the leaderboard as
 * the same thing). Every surface a new player meets uses these words and no others for these things, and never a
 * pictograph in their place (the owner, 2026-11-15: "Stop using emojis to communicate. I need names for every concept."):
 *   rule score   what your goal card counts on ONE line or grid;
 *   rarity       how rare that rule score is among random ones, in bits (the only thing "bits" names);
 *   others' bits every other player's rarity on it, added together;
 *   points       your rarity on it × the others' bits; the leaderboard adds them up;
 *   energy       what you earn every second and spend on summoning agents, on their moves and on looks (never "bits").
 */
export const SCORE_WORDS = {
  ruleScore: "rule score",
  rarity: "rarity",
  points: "points",
  energy: "energy",
  /** The unit after an amount of energy: "42.00 energy", "16.00 energy a second". */
  energyUnit: "energy",
  others: "others' bits",
} as const;

/** One plain sentence per word, for tooltips and the scoring explainer. */
export const SCORE_LINES = {
  ruleScore: "Your rule score is what your goal card counts on one line or grid. Your agents change them to raise it.",
  rarity: "Rarity is how hard your rule score is to get by chance, in bits: if 1 random one in 8 does as well, that is 3 bits. Each bit is twice as rare.",
  points: "Points are what the leaderboard adds up. Each line or grid gives you your rarity on it × the others' bits on it (never below 0).",
  total: "Your points now are the points of every line or grid in the world added up, as last counted, so it can be a few seconds old.",
  moves: "Every object on the table gives you points when it is rare by your rule and the others want it too, so this moves when anyone changes an object.",
  nobody: "An object only you want gives you 0 points, however high your rule score is.",
  energy: "You earn energy every second. Summoning an agent spends yours once; each agent then earns its share and spends some on every move.",
} as const;

/** SCORE_LINES.moves in the table's own noun ("line", "grid"): why your points move while you do nothing. */
export const scoreMovesLine = (noun: string = "object"): string =>
  noun === "object" ? SCORE_LINES.moves : SCORE_LINES.moves.replace("Every object", `Every ${noun}`).replace("an object", `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`);

/** One entry per concept, under the one name every surface uses for it. */
export const GLOSSARY = {
  room: { term: "Room", gloss: "The table you play at: a short code, an owner and up to 8 seats; it hosts game after game." },
  game: { term: "Game", gloss: "One round in a room: a planning time, then the world runs until the game ends." },
  // The owner's names stay (product memory): players are gods; a rule is a utility function; a rule with parts is a points tuple.
  god: { term: "God", gloss: "A player seated in a game: a person, a practice partner or an AI player. Each has a secret utility function." },
  object: { term: "Line or grid", gloss: "One thing in the world: a line in a line game, a grid of digits in a grid game. No two are ever the same." },
  "utility-function": { term: "Utility function", gloss: "Your secret rule, on your goal card: it gives every line or grid a rule score. Nobody else sees it, nor you theirs." },
  "rule-score": { term: "Rule score", gloss: SCORE_LINES.ruleScore },
  "main-part": { term: "Main part", gloss: "What your rule counts first. Your secondary preference only decides between lines or grids that are equal on the main part." },
  "points-tuple": { term: "Points tuple", gloss: "A rule score with parts, like (3, 1): the main part first, then the secondary preference, compared in that order." },
  "secondary-preference": { term: "Secondary preference", gloss: "A second goal tied to where your main part stands. It decides between lines that are equal on the main part; a new rung of the main part starts it again." },
  bits: { term: "Rarity (bits)", gloss: SCORE_LINES.rarity },
  "others-bits": { term: "Others' bits", gloss: "Every other player's rarity on a line or grid, added together: the only thing you learn about their rules." },
  points: { term: "Points", gloss: SCORE_LINES.points },
  look: { term: "Look", gloss: "Paying a little energy to see a line or grid as it is now. Until you or your agents look, you see it as last seen." },
  agent: { term: "Agent", gloss: "Your small program. The world offers it a line or grid; it may change it, paying energy." },
  summon: { term: "Summon", gloss: "Paying energy to put an agent into the world; the price grows with the program's length (shorter is cheaper)." },
  energy: { term: "Energy", gloss: "What you spend on summoning agents and on looks. The power you keep refills it every second, until it is full." },
  "agent-energy": { term: "Agent energy", gloss: "An agent's own energy: its share of your power fills it, and each move pays from it. At or below 0 it waits." },
  power: { term: "Power", gloss: "Your fixed income of energy each second. You split it: a share to each agent, and the rest refills your own energy." },
  "power-share": { term: "Power share", gloss: "The slice of your power one agent gets (0 to 100%). That slice is its income; all shares add up to at most 100%." },
  "read-bits": { term: "Reading cost", gloss: "The energy an agent's turn pays for looking at a line or grid: a little for each bit it reads. Never free." },
  "change-cost": { term: "Change cost", gloss: "The energy a move pays for changing a line or grid, on top of reading it. A far change costs more than small steps." },
  skip: { term: "Skip", gloss: "A turn where the agent looked and changed nothing. It pays only for reading, so skipping is cheap." },
  turn: { term: "Turn", gloss: "A chance for an agent to act on one line or grid. Turns go out at random: more energy, more turns." },
  "tug-of-war": { term: "Tug-of-war", gloss: "Your agent and another player's keep moving the same line or grid back and forth: both of you burn energy. Talk." },
  "leave-alone": { term: "Leave alone", gloss: "A list of lines or grids your agent never moves: how you keep your side of a deal." },
  representation: { term: "View", gloss: "One way to see a line or grid, e.g. slope-intercept or the line on the plane. Your rule reads some of them." },
  palette: { term: "Command palette", gloss: "The search box (Ctrl or Cmd+K) that runs every command you have: the same ones your assistant has." },
  panel: { term: "Panel", gloss: "A view of the game in a pane: a built-in one, or one you or your assistant wrote." },
  pane: { term: "Pane", gloss: "One tile of your screen: a panel or your assistant; move it anywhere." },
} as const satisfies Record<string, { term: string; gloss: string }>;

export type GlossaryId = keyof typeof GLOSSARY;
export const GLOSSARY_IDS = Object.keys(GLOSSARY) as GlossaryId[];
