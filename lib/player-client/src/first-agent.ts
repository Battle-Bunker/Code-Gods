/**
 * The first agent the assistant starts from when a player asks for one ("Write me a first agent"): a short, commented,
 * working example for the player's own rule, carried in the writing-agents skill (skills.ts) so a real model and the
 * scripted mock provider read the same text.
 *
 * The example for the player's own rule comes from the shared generator (lib/game-utilities example-agents.ts), which
 * the engine's load_skill passes to skillBody (convex/agent/registry.ts firstAgentOf); `firstAgentFor` here is the
 * fallback when it has none (another object type, a caller without the engine): a generic move per object type.
 * Pure: no Convex or provider code.
 */
export interface FirstAgent { name: string; source: string }
export interface FirstAgentContext {
  /** The player's rule family (observation self.utility.familyId), for the shared generator. */
  familyId?: string;
  /** The game's object type: "Grid", "Int" or "string". */
  objectType?: string;
  language: string;
  /** The mutator names the game offers in that language; an example that needs a missing one is not offered. Absent: not checked. */
  mutators?: readonly string[];
}

const comment = (language: string, lines: readonly string[]) => lines.map(l => `${language === "python" ? "#" : "//"} ${l}`);
const INTRO = (what: string) => [
  "A first agent: one small, cheap move that keeps changing things.",
  `Each time it acts, it ${what}.`,
  "Watch your rule score: if it drops, change the move below.",
];
/** Per object type: the mutator the move needs, what it does in words, and the call in each language. */
const GENERIC: Record<string, { name: string; needs: string; what: string; note: string; call: string }> = {
  Grid: { name: "Row slider", needs: "slide", what: "slides the top row one step sideways", note: "row(0) is the top row; 1 is one step.", call: "slide(row(0), 1)" },
  Int: { name: "Step up", needs: "add", what: "adds 1 to the number", note: "A small step costs little energy.", call: "add(1)" },
  string: { name: "Letter turner", needs: "rotate", what: "moves the letters round by one place", note: "1 is one place.", call: "rotate(1)" },
};
const PARAM: Record<string, string> = { Grid: "grid", Int: "x", string: "s" };

/** The first agent for a player's rule in a language, or null when none can be offered (unknown object type, missing mutator). */
export function firstAgentFor({ objectType, language, mutators }: FirstAgentContext): FirstAgent | null {
  const g = objectType ? GENERIC[objectType] : undefined;
  if (!g || (mutators && !mutators.includes(g.needs))) return null;
  const param = PARAM[objectType!];
  const head = comment(language, INTRO(g.what));
  const body = language === "python"
    ? [`def agent(${param}):`, `    # ${g.note}`, `    return [${g.call}]`]
    : [`function agent(${param}) {`, `  // ${g.note}`, `  return [${g.call}];`, "}"];
  return { name: g.name, source: [...head, ...body].join("\n") };
}

const OPEN = /^FIRST AGENT EXAMPLE \(([a-z]+); name: ([^)]{1,40})\)/m;
const CLOSE = "END OF FIRST AGENT EXAMPLE";
/** The example as a section of the writing-agents skill. */
export function firstAgentSection(agent: FirstAgent, language: string): string {
  return [`FIRST AGENT EXAMPLE (${language}; name: ${agent.name}). Asked for a first agent, start from this one, adapt it to the player's rule when you can, and keep it 5 to 15 commented lines:`,
    agent.source, CLOSE].join("\n");
}
/** The example in a writing-agents skill body (firstAgentSection), or null when it has none. */
export function firstAgentIn(body: string): (FirstAgent & { language: string }) | null {
  const open = OPEN.exec(body);
  if (!open) return null;
  const from = body.indexOf("\n", open.index) + 1, to = body.indexOf(`\n${CLOSE}`, from);
  if (from <= 0 || to < 0) return null;
  return { language: open[1]!, name: open[2]!, source: body.slice(from, to) };
}
