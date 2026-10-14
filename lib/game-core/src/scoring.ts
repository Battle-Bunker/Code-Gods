export interface PersonalScore {
  ownValue: number;
  othersValueSum: number;
  score: number;
}

function assertValue(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("A deity value must be finite and within [0, 1]");
  }
}

/** Server-only input; never put the input map into a public or player event. */
export function personalScore(values: ReadonlyMap<string, number>, deityId: string): PersonalScore {
  const ownValue = values.get(deityId);
  if (ownValue === undefined) throw new Error("Deity is not in this game's roster");
  let othersValueSum = 0;
  for (const [id, value] of values) {
    assertValue(value);
    if (id !== deityId) othersValueSum += value;
  }
  return { ownValue, othersValueSum, score: ownValue * othersValueSum };
}

export function totalValue(values: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const value of values.values()) {
    assertValue(value);
    total += value;
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
    totalScore: objects.reduce((sum, values) => sum + personalScore(values, deityId).score, 0),
    rank: 0,
  })).sort((a, b) => b.totalScore - a.totalScore || a.deityId.localeCompare(b.deityId));
  for (let i = 0; i < rows.length; i++) {
    rows[i].rank = i > 0 && rows[i].totalScore === rows[i - 1].totalScore
      ? rows[i - 1].rank : i + 1;
  }
  return rows;
}
