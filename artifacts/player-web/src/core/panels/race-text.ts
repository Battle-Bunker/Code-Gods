/**
 * The leaderboard's words (pure, unit-tested). The race pane shows the scoreboard as last PUBLISHED, while "Your
 * points now" is fresher, so the two disagree for a few seconds ("593.8 at the top but the leaderboard says 272.
 * Which one?"): the pane says how old its scores are and when the next ones come.
 */
const seconds = (s: number) => `${Math.max(1, Math.round(s))} s`;

/**
 * "Scores as published 12 s ago; the next update is in about 3 s." With no interval known, only the age; with no
 * publication time known, null. After the end nothing more is published.
 */
export function publishedLine(s: { worldNow: number | undefined; publishedAt: number | undefined | null; interval?: number; ended?: boolean }): string | null {
  if (typeof s.worldNow !== "number" || typeof s.publishedAt !== "number" || !Number.isFinite(s.worldNow) || !Number.isFinite(s.publishedAt)) return null;
  if (s.ended) return "Final scores.";
  const age = Math.max(0, s.worldNow - s.publishedAt);
  const head = age < 1.5 ? "Scores as published just now" : `Scores as published ${seconds(age)} ago`;
  if (typeof s.interval !== "number" || !(s.interval > 0)) return `${head}.`;
  const left = s.interval - age;
  return left <= 0.5 ? `${head}; the next update is due.` : `${head}; the next update is in about ${seconds(left)}.`;
}

/**
 * The player's own row: the fresher figure the page already holds (score-line.ts fresherPoints), when it is newer
 * than the publication and shows differently. Null: the published figure stands alone.
 */
export function ownNow(s: { published: number; publishedAt: number | undefined | null; fresher: { score: number; world?: number } | null; format: (v: number) => string }): string | null {
  const f = s.fresher;
  if (!f || f.world === undefined || typeof s.publishedAt !== "number" || f.world <= s.publishedAt) return null;
  return s.format(f.score) === s.format(s.published) ? null : s.format(f.score);
}
