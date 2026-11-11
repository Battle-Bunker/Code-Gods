/**
 * Paid observation (docs/energy-model.md §11; settings.observation "paid"). One rule: seeing an object's state at one
 * moment (its value, the viewer's own numbers on it and the others' disclosed sum) costs the object's full read at the
 * read price, whoever asks. A god's view of an object (its objectViews row) is the last state the god was TOLD, with the
 * world time it learned it (`learnedAt`). A god is told an object
 *   1. at its birth (the starting world and every spawn), free: a birth is public, a life is paid;
 *   2. when one of its agents commits a change to it (the cheapest change costs more than a complete look: §2.1);
 *   3. when one of its agents' acts read the whole object (the act paid for it);
 *   4. when the god pays for a look from its own energy (game/looks.ts).
 * Free for everyone: the published scoreboard, the object count, and each object's existence, age, number of changes and
 * time of last change (activity is public; content is paid). An ended game is open, as before.
 * Pure: the tick, the read-model sync and the projections share these.
 */
import { boardsFree, fullReadCharge, paidObservation, type GameSettings } from "@workspace/game-core";

export { godLooks } from "@workspace/game-core";

/** "boards" (a paid live game whose boards are free): the value and own bits of every row follow the object; the others' sum is as last told. */
export const boardsLive = (game: { settings: unknown; phase: string }): boolean => paidLive(game) && boardsFree(game.settings as { observation?: unknown });

/** Whether this game's seated gods see only what they were told: paid observation, and the game has not ended. */
export const paidLive = (game: { settings: unknown; phase: string }): boolean =>
  paidObservation(game.settings as { observation?: unknown }) && game.phase !== "ended";

/** What one look at one object costs, in energy: the object type's full read (bits) at the read price. */
export const lookPriceOf = (settings: GameSettings): number => fullReadCharge(settings);

/** Whether an act that read `readBits` read the whole object (the meter never exceeds the bound; float slack). */
export const readWhole = (readBits: number, bound: number): boolean => bound > 0 && readBits >= bound - 1e-6;

type LoggedEvent = { t: string; ownerId?: string };
/**
 * Whether god `godId` of a paid live game may see this logged event: births (spawns, the planning rescore), phases, and
 * its own agents' acts, summons, destructions and power changes. Another god's transformation is not told.
 */
export const toldEvent = (ev: LoggedEvent, godId: string): boolean =>
  ev.t === "phase" || ev.t === "spawn" || ev.t === "rescore" || ev.ownerId === godId;
