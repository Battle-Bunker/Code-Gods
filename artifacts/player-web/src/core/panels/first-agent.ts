/**
 * The forge's first agent: a player with no agents opens the editor and finds a working example for their own goal
 * already in it (lib/game-utilities/src/example-agents.ts), named, so Summon needs no typing. Pure decisions, so they
 * are unit-tested without a DOM (test/first-agent.test.ts):
 * - an empty editor is filled once per opening (a player who clears it keeps their empty editor);
 * - switching the language swaps the example while it is untouched;
 * - an edited draft is never overwritten, and players who already have agents keep the editor as it was.
 */
export interface Example { readonly name: string; readonly source: string; readonly specific: boolean }
/** The example per language the game allows (absent: none can be offered, e.g. the goal card has not arrived). */
export type Examples = Readonly<Record<string, Example | undefined>>;

export interface FirstAgentState {
  /** The player can edit and summon here (not a replay, not read-only). */
  readonly editable: boolean;
  /** The player's live agents, or undefined while that is not known yet. */
  readonly agents: number | undefined;
  /** The editor's text and its selected language. */
  readonly source: string;
  readonly language: string;
  readonly examples: Examples;
  /** This opening of the editor already offered the example once. */
  readonly offered: boolean;
}

/** The language whose example the editor holds unchanged, or null when the player has typed something of their own. */
export function untouchedExample(source: string, examples: Examples): string | null {
  for (const [language, example] of Object.entries(examples)) if (example && example.source === source) return language;
  return null;
}

/** What to put in the editor now, or null to leave it alone. */
export function firstAgentFill(s: FirstAgentState): Example | null {
  if (!s.editable || s.agents !== 0) return null;
  const example = s.examples[s.language];
  if (!example || example.source === s.source) return null;
  if (!s.source.trim()) return s.offered ? null : example;
  const held = untouchedExample(s.source, s.examples);
  return held !== null && held !== s.language ? example : null;
}

export const FIRST_AGENT_HINT = "This agent already works for your goal. Summon it, then try changing it.";
export const STARTER_AGENT_HINT = "This starter agent runs, but it does not chase your goal yet. Summon it, then try changing it.";
/** The line above the editor while it holds the untouched example in the selected language. */
export function firstAgentHint(source: string, language: string, examples: Examples): string | null {
  const example = examples[language];
  if (!example || example.source !== source) return null;
  return example.specific ? FIRST_AGENT_HINT : STARTER_AGENT_HINT;
}

/**
 * Whether to validate the untouched example by itself (validation is free), so its cost shows and Summon is ready
 * without a click: once per text, only when validation can run and nothing else is in flight.
 */
export function validatesExample(s: { untouched: boolean; validated: boolean; busy: boolean; ready: boolean; tried: boolean }): boolean {
  return s.untouched && !s.validated && !s.busy && s.ready && !s.tried;
}
