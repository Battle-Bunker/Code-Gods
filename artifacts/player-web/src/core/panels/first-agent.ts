/**
 * The forge's first agent: a player with no agents opens the editor and finds a working example for their own goal
 * already in it (lib/game-utilities/src/example-agents.ts), named, so Summon needs no typing and no validation first. Pure decisions, so they
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
 * Whether Summon is one click away. The untouched example needs no validation first: the summon examines the agent
 * itself, so that is one pass through the sandbox, not two (a busy sandbox once kept Summon off until planning ran
 * out). The player's own code is validated first, and the price must be covered. `price` is the current validation's,
 * when there is one for exactly this code.
 */
export function summonReady(s: { untouched: boolean; valid: boolean; price: number | undefined; energy: number }): boolean {
  if (s.price !== undefined) return s.valid && s.price <= s.energy;
  return s.untouched;
}

/** The engine refused a summon for lack of energy (its receipt's message): the forge then waits for the energy instead. */
export const lacksEnergy = (message: string | undefined): boolean => /insufficient energy|not enough energy/i.test(message ?? "");

/** Said once an agent is summoned: where it is, when it acts, and the next thing to try. */
export function summonedText(name: string, planning: boolean): string {
  return `Summoned: ${name} is in the game. ${planning ? "It acts when the world starts." : "It acts whenever it gets a turn."} Watch 'My agents' for what it does. Then try the change suggested in the code and summon again.`;
}

/** My agents during planning, once the player has an agent: nothing left to write, only to wait for the world. */
export function readyText(names: readonly (string | undefined)[]): string | null {
  if (!names.length) return null;
  const first = names[0]?.trim() || "Your agent";
  return names.length === 1 ? `${first} is ready. It acts when the world starts.` : `${first} and ${names.length - 1} more ${names.length === 2 ? "agent are" : "agents are"} ready. They act when the world starts.`;
}

/** How long until the player's own energy covers a price: "about 4 s after the world starts", "in about 25 s", or null when unknown. */
export function energyWait(s: { cost: number; energy: number; income?: number; planning: boolean }): string | null {
  if (s.income === undefined || s.income <= 0) return null;
  const seconds = Math.max(1, Math.ceil((s.cost - s.energy) / s.income));
  const wait = `about ${seconds < 10 ? seconds : 5 * Math.ceil(seconds / 5)} s`;
  return s.planning ? `${wait} after the world starts` : `in ${wait}`;
}

/**
 * What to say when an agent costs more to summon than the player has: the two numbers, and when it will be payable.
 * `income` is the player's own energy per world second (their unallocated power); the world does not run in planning,
 * so there the wait starts when the world does. Null when the player can pay.
 */
export function energyHint(s: { cost: number; energy: number; income?: number; planning: boolean }): string | null {
  if (s.cost <= s.energy) return null;
  const have = `This agent costs ${Math.ceil(s.cost)} energy and you have ${Math.floor(s.energy)}.`;
  if (s.income !== undefined && s.income <= 0) return `${have} All your power goes to your agents, so your own energy is not growing. Lower an agent's share in My agents, then come back.`;
  const wait = energyWait(s);
  if (!wait) return `${have} ${s.planning ? "You earn more once the world starts." : "You earn more as the world runs."}`;
  return `${have} You will have enough ${wait}.`;
}

/**
 * "Summon as soon as I have the energy": a one-shot the player arms for a validated agent they cannot pay for yet. The
 * forge fires the ordinary summon command once, when the player's live energy reaches the price. Pure: `armedStep`
 * says what to do on each change, and the caller clears the armed summon BEFORE sending, so it can never fire twice.
 */
export interface ArmedSummon { readonly name: string; readonly description?: string; readonly language: string; readonly source: string; readonly cost: number }
export type ArmedStep = "idle" | "wait" | "fire" | "disarm";
export function armedStep(armed: ArmedSummon | null, s: { source: string; language: string; energy: number | undefined; busy: boolean; canSummon: boolean; /** The game has ended, or gameplay is off for this player: nothing will ever fire. */ over?: boolean }): ArmedStep {
  if (!armed) return "idle";
  // An edit (or another language) is a different agent: the price no longer holds.
  if (armed.source !== s.source || armed.language !== s.language) return "disarm";
  if (s.over) return "disarm";
  if (s.energy === undefined || s.energy < armed.cost || s.busy || !s.canSummon) return "wait";
  return "fire";
}
/** The line under the buttons while a summon is armed. */
export function armedText(armed: ArmedSummon, s: { energy: number; income?: number; planning: boolean }): string {
  const wait = energyWait({ cost: armed.cost, energy: s.energy, income: s.income, planning: s.planning });
  return `Armed: ${armed.name} will be summoned ${wait ?? "as soon as you have the energy"}. Keep this pane open.`;
}
