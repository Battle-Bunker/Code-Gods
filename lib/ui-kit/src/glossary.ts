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
  salience: { term: "Salience", gloss: "Everyone's bits for an object added up: public, so you can see what the table cares about." },
  agent: { term: "Agent", gloss: "Your small program, agent(obj), which returns up to 16 moves when the world picks it." },
  summon: { term: "Summon", gloss: "Paying energy to put an agent into the world; the price is the program's description bits (shorter is cheaper)." },
  energy: { term: "Energy", gloss: "Your god's bits for summoning; it refills every real second, even during planning and pauses." },
  "agent-energy": { term: "Agent energy", gloss: "Each agent's own battery; it charges in world time and pays for every move it tries." },
  pause: { term: "Pause", gloss: "Each god may stop the world once per game (3 minutes by default) to negotiate." },
  palette: { term: "Command palette", gloss: "The search box (Ctrl/Cmd+K) that runs every command you have: the same repertoire your assistant has." },
  panel: { term: "Panel", gloss: "A view of the game in a pane: a built-in one you pick (your assistant sets its parameters) or one of your own." },
  pane: { term: "Pane", gloss: "One tile of your screen: a panel or your assistant; drag it anywhere." },
} as const satisfies Record<string, { term: string; gloss: string }>;

export type GlossaryId = keyof typeof GLOSSARY;
export const GLOSSARY_IDS = Object.keys(GLOSSARY) as GlossaryId[];
