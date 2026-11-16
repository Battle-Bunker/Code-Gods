/**
 * Two-state cycles (playtest rounds 32 and 33: a line toggled between two states for the whole last third, the cheapest
 * tug there is): folded move by move into a player's tug row (loop.ts foldTugs), so the end summary can name the pair.
 */
/** The pair (a < b, as wires) and how many moves went between exactly those two states. */
export interface Cycle { a: string; b: string; moves: number }

/**
 * One move into the fold: `lastStates` are the states the last two moves left the line in (oldest first). A move that
 * returns the line to the state two moves before (A → B → A) makes {A, B} the cycle: a new pair counts its two moves
 * (A → B and B → A), and each further move within the same pair counts one more.
 */
export function stepCycle(lastStates: readonly string[], cycle: Cycle | null, state: string): { lastStates: string[]; cycle: Cycle | null } {
  const [twoBack, oneBack] = lastStates.length === 2 ? lastStates : [undefined, lastStates[0]];
  let next = cycle;
  if (twoBack !== undefined && state === twoBack && state !== oneBack) {
    const [a, b] = [state, oneBack!].sort() as [string, string];
    next = cycle && cycle.a === a && cycle.b === b ? { a, b, moves: cycle.moves + 1 } : { a, b, moves: 2 };
  }
  return { lastStates: [...lastStates, state].slice(-2), cycle: next };
}
