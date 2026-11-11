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
}
export interface PlanningLine {
  text: string;
  /** Show the owner's "Start the world now" button (rooms.startWorldNow). */
  startNow: boolean;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** null outside planning and once the countdown is over (the timer then says what the world waits for). */
export function planningLine(i: PlanningInput): PlanningLine | null {
  if (i.phase !== "planning" || !i.planningEndsAt || i.planningEndsAt <= i.nowMs) return null;
  const left = clock(Math.ceil((i.planningEndsAt - i.nowMs) / 1000));
  const what = i.seated ? "summon your first agent" : "the players are writing their first agents";
  return { text: `Planning: ${what}. The world starts in ${left}.${i.owner ? "" : " The owner can start early."}`, startNow: i.owner };
}
