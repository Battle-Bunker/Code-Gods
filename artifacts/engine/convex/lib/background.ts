/**
 * Background work (pure): what runs in Node actions but is not a game's tick: agent examinations (validate, summon
 * measurement, an AI seat's summons: hundreds of sandbox runs each) and hold-table computations (seconds of CPU each).
 * A deployment runs a bounded number of Node actions at once and each tick needs one (plus one per language for its
 * acts), so background work is capped deployment-wide (engine/background.ts): past the cap it waits, and ticks keep
 * their capacity however many games start or summon at the same moment.
 */

/**
 * Background jobs of each kind running at once, deployment-wide. A backend runs 64 actions at once (the local one and
 * the cloud's smaller plans). An examination holds up to three (itself, its acts' action, a compilation), so eight leave
 * about forty for ticks (each one action, plus one per language while a wave runs). A hold computation is seconds
 * of CPU in one action; they have their own, smaller cap so a burst of starts never keeps players' summons waiting.
 *
 * Hold computations and AI seats' turns (seconds each: a provider call, then the seat's own validations and summons)
 * are scheduled functions, as ticks are, and the scheduler runs only about ten at once, oldest first: measured with 20
 * games starting together, forty seats' first turns (or forty hold tables) kept every game's planning-end tick waiting
 * 30–70 s. Three of each leave the scheduler to the ticks, which are short. A seat's turn past the cap runs a few
 * seconds later (ai/turn.ts); its examinations run under the turn's own slot.
 */
export const BACKGROUND_LIMITS = { examination: 8, hold: 3, turn: 3 } as const;
export type BackgroundKind = keyof typeof BACKGROUND_LIMITS;
/** A slot is given back when its job ends; one whose action died is free again after this long. */
export const BACKGROUND_SLOT_MS = 2 * 60_000;
/**
 * How long an examination a player is waiting for (validate, summon) waits for a slot before answering "busy; try
 * again". Short on purpose: the waiting action is itself one of the backend's 64 (measured: 80 summons at once, each
 * waiting up to 12 s, were refused actions themselves), so past a moment the player's own retry is the queue.
 */
export const EXAMINATION_WAIT_MS = 3_000;
/** How long a seat's turn past the cap waits before asking again (plus up to as much again, at random). */
export const TURN_SLOT_WAIT_MS = 3_000;
/**
 * When a job waiting up to `waitMs` for a slot asks again: a few times, further apart each time (1, 2, 3… s plus up
 * to a second at random), so fifty waiters cost a handful of mutations a second, not a hundred. `random` in [0, 1).
 */
export function slotAttemptDelays(waitMs: number, random: () => number = Math.random): number[] {
  const delays: number[] = [];
  for (let step = 1, total = 0; ; step++) {
    const delay = step * 1000 + Math.floor(random() * 1000);
    if (total + delay > waitMs) return delays;
    delays.push(delay); total += delay;
  }
}

/**
 * A running game's tick is overdue when its last commit is older than this: ticks commit about once a second and wake
 * at least every 5 s, so twice that means the loop is behind (engine/tick.ts). An AI seat's turn waits for it.
 */
export const TICK_OVERDUE_MS = 10_000;
export const tickOverdue = (game: { phase: string; lastTick: number }, now: number): boolean =>
  game.phase === "running" && now - game.lastTick > TICK_OVERDUE_MS;

/** Whether a job may take a slot, given the slots its kind holds (their expiry times) and its cap. */
export const slotFree = (expiries: readonly number[], now: number, limit: number): boolean =>
  expiries.filter(at => at > now).length < limit;
