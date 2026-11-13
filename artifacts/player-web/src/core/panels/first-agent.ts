/**
 * The forge's first agent: a player with no agents opens the editor and finds a working example for their own goal
 * already in it (lib/game-utilities/src/example-agents.ts), named, so Summon needs no typing and no validation first. Pure decisions, so they
 * are unit-tested without a DOM (test/first-agent.test.ts):
 * - an empty editor is filled once per opening (a player who clears it keeps their empty editor);
 * - switching the language swaps the example while it is untouched;
 * - an edited draft is never overwritten, and players who already have agents keep the editor as it was.
 */
import { BEGINNER_AGENT_BUDGET_BITS, firstAgentShare } from "@workspace/game-core";
import { SUMMON_FIRST } from "../planning-line.ts";

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

/** Said once an agent is summoned: where it is and when it acts (the forge adds a button to My agents and the next thing to try). */
export function summonedText(name: string, planning: boolean): string {
  return `Summoned: ${name} is in the game. ${planning ? "It acts when the world starts." : "It acts whenever it gets a turn."}`;
}
export const SUMMONED_NEXT = "Then try the change suggested in the code and press Replace.";

/**
 * What the summoned agent took and what the player keeps, from the real numbers: the share it was summoned with and
 * the player's own income after it (⚡ per second). Null when either is unknown.
 */
export function storeAfterSummonText(s: { share: number | undefined; income: number | undefined }): string | null {
  if (s.share === undefined || !(s.share > 0) || s.income === undefined || !Number.isFinite(s.income)) return null;
  const part = Math.abs(s.share - 0.75) < 0.005 ? "Three quarters" : Math.abs(s.share - 0.5) < 0.005 ? "Half" : `${Math.round(s.share * 100)}%`;
  const keep = Math.round(s.income * 10) / 10;
  return keep > 0 ? `${part} of your power now feeds this agent; you keep ${keep.toLocaleString("en-US", { maximumFractionDigits: 1 })} ⚡/s for replacing it or adding another.`
    : `${part} of your power now feeds this agent; you keep none for yourself, so you cannot summon or replace until you take some back in My agents.`;
}

/**
 * The share a summon from the forge asks for. A beginner's FIRST agent (a beginner rule on the beginner board) takes as
 * close to three quarters of the player's power as still leaves their own store able to pay for the dearest agent they
 * may want next: the dearest shipped starter (BEGINNER_AGENT_BUDGET_BITS), a dearer one remembered in this game, or the
 * agent being summoned (game-core firstAgentShare). Every other summon sends nothing and takes the engine's default
 * (half of what is unallocated): another setup, a later agent, the agent list not known yet, or a first summon already
 * sent in this game (the list can lag the receipt, and a second summon at the large share would be refused).
 */
export function summonShare(s: {
  agents: number | undefined; allocated: number | undefined; beginner: boolean; firstSent: boolean;
  powerPerSecond: number | undefined; fullChargeSeconds: number | undefined;
  /** The price of the agent being summoned, when checked. */ price?: number;
  /** Prices of starters checked in this game. */ prices?: Iterable<number>;
}): number | undefined {
  if (!s.beginner || s.firstSent || s.agents !== 0 || s.allocated === undefined || s.powerPerSecond === undefined) return undefined;
  let need = Math.max(BEGINNER_AGENT_BUDGET_BITS, s.price ?? 0);
  for (const p of s.prices ?? []) need = Math.max(need, p);
  return firstAgentShare({ allocated: s.allocated, powerPerSecond: s.powerPerSecond, fullChargeSeconds: s.fullChargeSeconds, need });
}

/**
 * Beside the price, before a summon: energy moves with power, so when the player's own store would hold more than its
 * new limit ((unallocated − share) × power × fullChargeSeconds) after paying the price, the excess goes to the new
 * agent. Null when nothing would move, the price is not payable, or the game has no capacity.
 */
export function startsWithLine(s: { energy: number; cost: number; allocated: number | undefined; share: number | undefined; powerPerSecond: number | undefined; fullChargeSeconds: number | undefined; /** Replace is the main button: the line is about "Summon beside it". */ beside?: boolean }): string | null {
  if (s.share === undefined || s.powerPerSecond === undefined || s.fullChargeSeconds === undefined || s.cost > s.energy) return null;
  const limit = Math.max(0, 1 - (s.allocated ?? 0) - s.share) * s.powerPerSecond * s.fullChargeSeconds;
  const moved = Math.round(s.energy - s.cost - limit);
  if (moved < 1) return null;
  return `${s.beside ? "Summoned beside it, the new agent starts" : "It starts"} with ${moved.toLocaleString("en-US")} ⚡ of your energy that would no longer fit in your own store.`;
}

/** A starter's remembered price: by language and exact source, in one game (the price depends on the game's settings). */
export const priceKey = (language: string, source: string): string => `${language}\u0000${source}`;
export interface PriceMemory { readonly gameId: string; readonly prices: ReadonlyMap<string, number> }
export function rememberPrice(memory: PriceMemory, gameId: string, key: string, cost: number): PriceMemory {
  if (memory.gameId === gameId && memory.prices.get(key) === cost) return memory;
  return { gameId, prices: new Map(memory.gameId === gameId ? memory.prices : []).set(key, cost) };
}

/** The description a replace sends: only one the player changed for this draft (else the engine keeps the agent's own). */
export function descriptionToSend(description: string, base: string | undefined): string | undefined {
  const typed = description.trim();
  return typed && typed !== (base ?? "").trim() ? typed : undefined;
}
/** Under the name box while a replace is offered: the name is the agent's, whatever the box says. */
export const keepsNameNote = (name: string): string => `Replacing keeps the name ${name}. A new name here is for 'Summon beside it'.`;

/**
 * "Summon my first agent" (the planning banner, My agents' empty state, a pane outside its phase): the editor is
 * opened, and then
 * - "summon": it holds the untouched example and its Summon button is on, so the click summons it (the forge's own
 *   summon, with its busy retries and its wait for energy);
 * - "ring": the player's own code, an editor they cleared, or Summon is off: the Summon button is brought into view
 *   with an attention ring, and nothing is summoned for them;
 * - "wait": a command is in flight, or the example has not arrived in the editor yet.
 */
export type FirstSummonStep = "idle" | "wait" | "summon" | "ring" | "expire";
/** A request never outlives its click: after this long it is dropped, not acted on. */
export const FIRST_SUMMON_MAX_AGE_MS = 10_000;
/** While the sandbox warms (the banner says "Getting ready…") the request may wait this long. */
export const FIRST_SUMMON_WARMING_MS = 60_000;
export function firstSummonStep(s: {
  requested: boolean; busy: boolean; agents: number | undefined; source: string; untouched: boolean;
  /** The example is about to be put in the editor (firstAgentFill). */ filling: boolean;
  /** The Summon button is on. */ enabled: boolean;
  /** Summon is off only for now: the sandbox is warming or restarting, or an uncertain command waits for its retry. */ warming: boolean;
  /** This editor has not summoned an agent yet (the agent list can lag the receipt). */ first: boolean;
  /** How long ago the button was pressed. */ ageMs: number;
}): FirstSummonStep {
  if (!s.requested) return "idle";
  const mine = s.first && s.agents === 0 && s.untouched;
  if (s.ageMs > (mine && s.warming && !s.busy ? FIRST_SUMMON_WARMING_MS : FIRST_SUMMON_MAX_AGE_MS)) return "expire";
  if (s.busy) return "wait";
  if (s.first && !s.source.trim() && (s.agents === undefined || s.filling)) return "wait";
  if (!mine) return "ring";
  // Off only for now: the request waits (it is not used up), and is summoned when the sandbox is ready.
  if (s.warming) return "wait";
  return s.enabled ? "summon" : "ring";
}
/** What a "Summon my first agent" button says: while its request waits for the sandbox, and while the summon is in flight. */
export function firstSummonLabel(s: { summoning: boolean; pending: boolean }): string {
  return s.summoning ? "Summoning…" : s.pending ? "Getting ready…" : SUMMON_FIRST;
}

const sameName = (a: string | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();
/** `name`, or `name` with the next free number ("Keeper 2", "Keeper 3") when the player already has an agent of that name. */
export function nextFreeName(name: string, existing: readonly (string | undefined)[], max = 40): string {
  const wanted = name.trim();
  if (!wanted || !existing.some(n => sameName(n, wanted))) return wanted;
  const numbered = /^(.*\S)\s+(\d+)$/.exec(wanted);
  const stem = numbered ? numbered[1] : wanted;
  for (let n = numbered ? Number(numbered[2]) + 1 : 2; ; n++) {
    const suffix = ` ${n}`, next = `${stem.slice(0, Math.max(1, max - suffix.length)).trimEnd()}${suffix}`;
    if (!existing.some(e => sameName(e, next))) return next;
  }
}
/** The name to put in the field instead, or null to leave it: only a name the player did not type themselves is changed. */
export function proposedName(s: { name: string; typed: boolean; existing: readonly (string | undefined)[] }): string | null {
  if (s.typed || !s.name.trim()) return null;
  const next = nextFreeName(s.name, s.existing);
  return next === s.name.trim() ? null : next;
}

/** The editor holds exactly the code of an agent the player already has: Summon makes a copy, and the pane says so. */
export const COPY_LABEL = "Summon another copy";
export const COPY_HINT = "You already have this agent. A copy acts as well, at the same price; changing the code first is more useful.";
export function isCopy(source: string, language: string, agents: readonly { source?: string; language?: string }[]): boolean {
  return !!source.trim() && agents.some(a => a.source === source && (a.language === undefined || a.language === language));
}

/**
 * Whether replacing the editor's code with a template must be asked first: only for code that would be lost, that is
 * code the player wrote or edited which is not the code of one of their summoned agents (nor an untouched example).
 */
export function replaceNeedsConfirm(s: { source: string; untouched: boolean; copy: boolean }): boolean {
  return !!s.source.trim() && !s.untouched && !s.copy;
}
export const REPLACE_QUESTION = "Replace the code in the editor with the observer? Your summoned agents are not affected.";

/** Above the editor once the player has an agent: what summoning another one means. */
export function secondAgentHint(agents: number | undefined): string | null {
  if (!agents) return null;
  return agents === 1 ? "A second agent runs beside the first. To replace the first one instead, destroy it in My agents."
    : "A new agent runs beside the ones you have. To replace one instead, destroy it in My agents.";
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

/**
 * Replace, not a second agent. A changed copy of an agent the player has, summoned beside it, undoes its work (two
 * walks: "Its last 30 moves: −916 points", the total halved). So when the draft started from one of the player's
 * agents and has been changed, the primary button replaces that agent and "Summon beside it" is the secondary.
 */
type OwnAgent = { id: string; name?: string; source?: string; language?: string };
/**
 * The agent the draft started from: the one whose code the editor holds now, else the previous origin while it still
 * exists (the draft is an edit of it). Null for an empty editor, or when that agent is gone.
 */
export function draftOrigin(previous: string | null, source: string, language: string, agents: readonly OwnAgent[]): string | null {
  if (!source.trim()) return null;
  const same = agents.find(a => a.source === source && (a.language === undefined || a.language === language));
  if (same) return same.id;
  return previous !== null && agents.some(a => a.id === previous) ? previous : null;
}
/** Whether the draft is a changed version of `origin` (an unchanged one is a copy: isCopy). */
export const replaceOffer = (origin: OwnAgent | undefined, source: string): boolean => !!origin && !!source.trim() && origin.source !== source;
export const replaceLabel = (name: string): string => `Replace ${name} with this version`;
export const REPLACE_WHY = "Two agents with different ideas undo each other's work; replacing keeps one.";

/** Several agents run the code the draft started from: only the one it came from is replaced, and the pane says so. */
export function sameVersionNote(origin: OwnAgent | undefined, agents: readonly OwnAgent[]): string | null {
  if (!origin) return null;
  const twins = agents.filter(a => a.source === origin.source).length;
  return twins > 1 ? `You have ${twins} agents running the old version; this replaces ${origin.name?.trim() || "one of them"} only.` : null;
}

/**
 * A replace in flight, kept by the runner (core/game/runner.ts). It is ONE engine command ("replace": the agent keeps
 * its id, name, power share, energy and counts; the player pays the new program's summon price), so there is nothing to
 * finish afterwards; the intent is kept only so that the confirmation and the previous-version memory are written on
 * whichever path its receipt arrives: the first send, the forge's "Try again", or "Retry the same command" under the
 * header. The same envelope keeps it; any other command, a refusal, a dismissal or PENDING_REPLACE_MS drop it.
 */
export interface PendingReplace {
  readonly commandId: string; readonly agentId: string; readonly name: string; readonly source: string; readonly at: number;
  /** The price paid (the check's), for the confirmation. */ readonly cost?: number;
  /** The version being replaced, kept for "Put the previous version back" and the before/since comparison. */ readonly previous?: PreviousVersion;
  /** This replace puts a previous version back: its confirmation says so, and the editor, if it still holds `outgoingSource` (the version going away), is given the restored code. */
  readonly putBack?: boolean; readonly outgoingSource?: string; readonly language?: string;
}
export const PENDING_REPLACE_MS = 10 * 60_000;
export function pendingReplaceOnSend(pending: PendingReplace | null, commandId: string, now: number): "none" | "keep" | "clear" {
  if (!pending) return "none";
  return pending.commandId === commandId && now - pending.at <= PENDING_REPLACE_MS ? "keep" : "clear";
}
/** The receipt of the pending replace: "done" when accepted (write the confirmation and the memory), "clear" when refused, "keep" for no answer or another command's receipt. */
export function pendingReplaceOnReceipt(pending: PendingReplace | null, commandId: string, receipt: { accepted: boolean } | undefined): "none" | "keep" | "done" | "clear" {
  if (!pending) return "none";
  if (pending.commandId !== commandId || !receipt) return "keep";
  return receipt.accepted ? "done" : "clear";
}
const whole = (x: number) => Math.round(x).toLocaleString("en-US");
const forPrice = (cost: number | undefined): string => (cost !== undefined && Number.isFinite(cost) && cost > 0 ? ` for ${whole(cost)} ⚡` : "");
/** "Replaced: NAME now runs your new version for 178 ⚡." (our own words: never the engine's raw sentence in bits). */
export const replacedText = (name: string, s: { cost?: number } = {}): string => `Replaced: ${name} now runs your new version${forPrice(s.cost)}.`;
/** "Put back: NAME runs the previous version again for 169 ⚡." (the put-back's own words: it is not "your new version"). */
export const putBackText = (name: string, s: { cost?: number } = {}): string => `Put back: ${name} runs the previous version again${forPrice(s.cost)}.`;
/** The put-back's button: it pays the previous version's summon price again. */
export const putBackLabel = (cost: number | undefined): string =>
  `Put the previous version back · costs ${cost !== undefined && Number.isFinite(cost) ? `${(Math.round(cost * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 })} ⚡` : "its summon price again"}`;
export const PUTTING_BACK = "Putting the previous version back…";
export const BUSY_NOTHING_CHANGED = "The game is busy; nothing changed. Try again.";

/**
 * One press: "Check and replace NAME" (or "Check and summon") validates first and goes straight on. After the check:
 * "go" when the code is valid and the player's energy covers the price, "short" when it is valid but not payable yet
 * (the pane's energy line says when it will be), "invalid" when the check found a problem or gave no answer.
 */
export function afterCheck(check: { accepted: boolean; valid: boolean | undefined; cost: number | undefined; energy: number } | undefined): "go" | "short" | "invalid" {
  if (!check || !check.accepted || !check.valid || check.cost === undefined) return "invalid";
  return check.cost <= check.energy ? "go" : "short";
}
/** The progress line once the price is known: "Checked: 174 ⚡. Replacing…". */
export function checkedLine(cost: number, then: "replace" | "summon"): string {
  const price = (Math.round(cost * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 });
  return `Checked: ${price} ⚡. ${then === "replace" ? "Replacing" : "Summoning"}…`;
}

/**
 * The version a replace replaced, remembered for this game on the agent it happened to (a replace keeps the agent's
 * id): its code, language, name and price, and what its moves had earned when it was replaced.
 */
export interface PreviousVersion {
  /** The game and the agent it belongs to: it is never shown in another game, on another agent, or after that agent is gone. */
  readonly gameId: string;
  readonly agentId: string;
  readonly source: string; readonly language: string; readonly name: string;
  /** What the previous version cost to summon, for the put-back's label. */
  readonly cost?: number;
  /** The source of the version that replaced it. */
  readonly newSource: string;
  /** The old program's counted moves when it was replaced ("before"). */
  readonly before?: { moves: number; points: number; objects: number };
  /** The dock's world time when Replace was pressed: only an `agent.replaced` event at or after it is this replace's (an earlier one is the previous replace's). */
  readonly sentWorld?: number;
  /** The world time of the replace: only moves after it are the new version's. `fromEvent`: it is the replace's own `agent.replaced` event's; otherwise the time its receipt was seen stands in until that event arrives. */
  readonly replacedWorld?: number;
  readonly fromEvent?: boolean;
  /** The new version's first counted moves since then, accumulated as they arrive and frozen at COMPARE_OVER (score-line.ts accumulateFirstMoves). */
  readonly since?: { readonly moves: number; readonly points: number; readonly keys: readonly string[]; readonly frozen: boolean };
  /** This memory is of a put-back: the agent runs the restored version; its line says how that is going, and no further put-back is offered. */
  readonly restored?: boolean;
}
/** The fewest counted moves of the new version before it is compared, and how many it is compared over (then frozen). */
export const COMPARE_MOVES = 8, COMPARE_OVER = 20;
/** Always under the comparison: why it is only a rough guide. */
export const COMPARISON_CAVEAT = "Every agent earns most just after it starts, so read this as a rough guide; your total points over the next minute are the real test.";
/** What "a move" is, said once beside the comparison (the row also counts "acts", which include looks). */
export const MOVE_MEANS = "A move is an act that changed a grid; acts that only looked are not counted.";
/**
 * Did the change help, like for like and stable. "Before" is the old version's average over its last counted moves
 * when it was replaced; "since" is the new version's average over its FIRST counted moves (score-line.ts
 * accumulateFirstMoves: up to COMPARE_OVER, then frozen), never a rolling window, because every agent earns most right
 * after it starts and a rolling figure mostly measured how recently it started (a player undid a good change over it).
 * Null until COMPARE_MOVES are in. `restored`: the line for a version that was put back. `estimate`: live points are "about".
 */
export function versionComparison(before: { moves: number; points: number } | undefined, since: { moves: number; points: number; frozen?: boolean } | undefined, o: { estimate?: boolean; restored?: boolean } = {}): string | null {
  if (!since || since.moves < COMPARE_MOVES) return null;
  const each = (e: { moves: number; points: number }) => { const r = Math.round(e.points / e.moves * 10) / 10; return `${o.estimate ? "about " : ""}${r === 0 ? "+0" : `${r > 0 ? "+" : "−"}${Math.abs(r).toLocaleString("en-US", { maximumFractionDigits: 1 })}`}`; };
  const over = `${since.frozen ? "" : "so far, "}over its first ${since.moves.toLocaleString("en-US")} moves`;
  if (o.restored) return `Back on the previous version: ${each(since)} points a move ${over} since.`;
  if (!before || before.moves < 1) return `Since your change: ${each(since)} points a move ${over}. Nothing was counted for the version before it.`;
  return `Before your change: ${each(before)} points a move. Since: ${each(since)} a move ${over}.`;
}

/**
 * Whether the remembered previous version still belongs here: its own game and its own agent, alive. Another game, or
 * the agent gone: the memory is cleared. (The agent's id does not change in a replace, so nothing is identified by
 * source: a twin with the same code never gets the line.)
 */
export function previousTarget(previous: PreviousVersion | null, gameId: string | undefined, agents: readonly { id: string }[]): { none: true } | { wait: true } | { clear: true } | { target: string } {
  if (!previous) return { none: true };
  if (gameId === undefined) return { wait: true };
  if (previous.gameId !== gameId) return { clear: true };
  return agents.some(a => a.id === previous.agentId) ? { target: previous.agentId } : { clear: true };
}

/**
 * The starter shelf ("Other starting points" in the forge): the ready-made agents for the player's goal
 * (game-utilities starterAgents), to pick without typing. Each row says where it already is: in the editor, running as
 * one of the player's agents, or available. The price is not known before a check, and none is run eagerly.
 */
export interface Starter { readonly id: string; readonly title: string; readonly blurb: string; readonly name: string; readonly source: string; readonly specific: boolean }
export interface ShelfRow extends Starter { readonly state: "editor" | "running" | "available"; readonly note: string }
export const PRICE_AFTER_CHECK = "Its price is shown after Check.";
export function starterShelf(starters: readonly Starter[], s: { source: string; agents: readonly { source?: string; name?: string }[]; /** The starters' prices checked in this game, by priceKey(language, source) (never hard-coded): shown once known. */ prices?: ReadonlyMap<string, number>; language?: string }): ShelfRow[] {
  return starters.map(starter => {
    const price = s.prices?.get(priceKey(s.language ?? "", starter.source));
    const runs = s.agents.find(a => a.source === starter.source);
    const state = starter.source === s.source ? "editor" as const : runs ? "running" as const : "available" as const;
    return {
      ...starter, state,
      // Written as the agent's own comment ("my goal"); here it is said to the player.
      blurb: starter.blurb.replace(/\bmy goal\b/g, "your goal"),
      note: `${state === "editor" ? "In the editor now." : state === "running" ? `You are running this one (${runs!.name?.trim() || starter.name}).` : ""}${
        price !== undefined ? `${state === "available" ? "" : " "}It costs about ${Math.round(price).toLocaleString("en-US")} ⚡ to summon.` : state === "available" ? PRICE_AFTER_CHECK : ""}`,
    };
  });
}
export const replaceQuestion = (title: string): string => `Replace the code in the editor with the ${title} agent? Your summoned agents are not affected.`;
/**
 * Under a starter loaded beside agents the player runs. Whether two of them undo each other's work is not known here
 * (it depends on the rule and the two ideas), so the line says only what is true of any pair.
 */
export const DIFFERENT_IDEAS = "Two agents with different ideas can undo each other's work; watch your points.";
/** The shelf opens by itself once the player has an agent and energy for another like it (about 100 when no price is known). */
export function shelfOpen(s: { agents: readonly { summonCost?: number }[]; energy: number; ended?: boolean }): boolean {
  if (s.ended || !s.agents.length) return false;
  return s.energy >= (s.agents[0]?.summonCost ?? 100);
}

/**
 * A language switch with an untouched starter in the editor: the same starter (same id) in the new language, or null
 * to leave the editor alone (the player's own code, a starter the new language does not have, or already this
 * language's). Without it the old language's code stayed and the check failed.
 */
export function starterSwap(source: string, language: string, byLanguage: Readonly<Record<string, readonly { id: string; source: string }[] | undefined>>): string | null {
  if (!source.trim() || byLanguage[language]?.some(s => s.source === source)) return null;
  for (const [other, starters] of Object.entries(byLanguage)) {
    if (other === language) continue;
    const held = starters?.find(s => s.source === source);
    if (held) return byLanguage[language]?.find(s => s.id === held.id)?.source ?? null;
  }
  return null;
}

/**
 * When the remembered replace happened, for the "since" count: its own `agent.replaced` event (the agent's, at or
 * after the press: an earlier one is a previous replace's, and taking it compared a version with itself), which
 * overwrites a stand-in; until that event is among the events, the world time now stands in (the receipt was just
 * seen). Null: nothing to change.
 */
export function replaceBoundary(previous: Pick<PreviousVersion, "agentId" | "sentWorld" | "replacedWorld" | "fromEvent"> | null,
  events: readonly { type: string; agentId?: string; worldSeconds?: number }[], worldNow: number | undefined): { world: number; fromEvent: boolean } | null {
  if (!previous || previous.fromEvent) return null;
  const own = [...events].reverse().find(e => e.type === "agent.replaced" && e.agentId === previous.agentId && typeof e.worldSeconds === "number" && e.worldSeconds >= (previous.sentWorld ?? -Infinity));
  if (own) return { world: own.worldSeconds!, fromEvent: true };
  if (previous.replacedWorld !== undefined || typeof worldNow !== "number") return null;
  return { world: worldNow, fromEvent: false };
}

/** The remembered replace as the boundary of that agent's earnings (score-line.ts agentEarnings): only its later moves are its current program's. */
export function boundaryOf(previous: Pick<PreviousVersion, "agentId" | "replacedWorld"> | null | undefined): ReadonlyMap<string, number> | undefined {
  return previous && previous.replacedWorld !== undefined ? new Map([[previous.agentId, previous.replacedWorld]]) : undefined;
}
