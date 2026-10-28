export interface PersonalScore {
  ownUtility: number;
  othersUtilitySum: number;
  /**
   * ownUtility × max(0, othersUtilitySum): an object only pays you if other gods also value it.
   * Int and string utilities lie in [0, 1], so the floor never applies and this is the original
   * product. Grid utilities are signed net bits (surprisal minus a defence goal's excess penalty);
   * the floor means "if, overall, the other gods don't care about a grid, nobody scores from it".
   */
  score: number;
}

/**
 * Utilities are finite numbers. game-utilities guarantees the range per object type: [0, 1] for
 * Int and string, signed net bits for Grid.
 */
function assertUtility(utility: number): void {
  if (!Number.isFinite(utility)) throw new Error("A god's utility must be finite");
}

/** Server-only input; never put the input map into a public or player event. */
export function personalScore(utilities: ReadonlyMap<string, number>, deityId: string): PersonalScore {
  const ownUtility = utilities.get(deityId);
  if (ownUtility === undefined) throw new Error("Deity is not in this game's roster");
  let othersUtilitySum = 0;
  for (const [id, utility] of utilities) {
    assertUtility(utility);
    if (id !== deityId) othersUtilitySum += utility;
  }
  return { ownUtility, othersUtilitySum, score: ownUtility * Math.max(0, othersUtilitySum) };
}

export function totalUtility(utilities: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const utility of utilities.values()) {
    assertUtility(utility);
    total += utility;
  }
  return total;
}

export function leaderboard(
  roster: readonly string[],
  objects: readonly ReadonlyMap<string, number>[],
): { deityId: string; totalScore: number; rank: number }[] {
  if (new Set(roster).size !== roster.length) throw new Error("Duplicate deity in roster");
  const rows = roster.map(deityId => ({
    deityId,
    totalScore: objects.reduce((sum, utilities) => sum + personalScore(utilities, deityId).score, 0),
    rank: 0,
  })).sort((a, b) => b.totalScore - a.totalScore || a.deityId.localeCompare(b.deityId));
  for (let i = 0; i < rows.length; i++) {
    rows[i].rank = i > 0 && rows[i].totalScore === rows[i - 1].totalScore
      ? rows[i - 1].rank : i + 1;
  }
  return rows;
}
