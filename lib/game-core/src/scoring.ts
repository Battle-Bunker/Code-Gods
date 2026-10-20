export interface PersonalScore {
  ownUtility: number;
  othersUtilitySum: number;
  /** ownUtility × othersUtilitySum: an object only pays you if other gods also value it. */
  score: number;
}

function assertUtility(utility: number): void {
  if (!Number.isFinite(utility) || utility < 0 || utility > 1) {
    throw new Error("A god's utility must be finite and within [0, 1]");
  }
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
  return { ownUtility, othersUtilitySum, score: ownUtility * othersUtilitySum };
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
