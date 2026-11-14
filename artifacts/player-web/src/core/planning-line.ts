/**
 * The planning line under the dock's header: what planning is for, the one countdown to the world's start, and who
 * may start it early (the owner gets the "Start the world now" button; everyone else is told the owner can). Pure, so
 * the wording and the button's visibility are unit-tested (test/planning-line.test.ts).
 */
export interface PlanningInput {
  phase: string;
  /** Dealt into this game (a spectator watches). */
  seated: boolean;
  /** The room's owner, acting with a credential that may act (not view only). */
  owner: boolean;
  /** When planning ends (ms since the epoch), as the observation gives it. */
  planningEndsAt?: number | null;
  nowMs: number;
  /** The player's live agents; undefined while that is not known yet (never read as "none"). */
  agents?: number;
  /** The player may write and summon here (not view only). */
  canSummon?: boolean;
}
export interface PlanningLine {
  text: string;
  /** Show the owner's "Start the world now" button (the game.startWorldNow affordance). */
  startNow: boolean;
  /** Show the primary "Summon my first agent" button, which opens the agent editor: the player has no agent yet. */
  summon: boolean;
}

export const SUMMON_FIRST = "Summon my first agent";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * null outside planning and once the countdown is over (the timer then says what the world waits for), except for a
 * seated player with no agent while the world runs: one line with the same button, since nothing scores without one.
 */
export function planningLine(i: PlanningInput): PlanningLine | null {
  const none = i.seated && i.agents === 0;
  const summon = none && i.canSummon !== false;
  if (i.phase === "live" && none) return { text: "You have no agent yet. Summon one to start scoring.", startNow: false, summon };
  if (i.phase !== "planning" || !i.planningEndsAt || i.planningEndsAt <= i.nowMs) return null;
  const left = clock(Math.ceil((i.planningEndsAt - i.nowMs) / 1000));
  const what = !i.seated ? "the players are writing their first agents" : i.agents ? "your agent is ready" : "summon your first agent";
  return { text: `Planning: ${what}. The world starts in ${left}.${i.owner ? "" : " The owner can start early."}`, startNow: i.owner, summon };
}
