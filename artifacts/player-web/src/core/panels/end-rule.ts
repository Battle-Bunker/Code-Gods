/**
 * How this room's game ends, in one sentence for "How to play" (panels/rules.tsx), from the room's own settings: a
 * fixed game ends on its public countdown; a half-life game at a hidden random moment. Pure and unit-tested
 * (test/end-rule.test.ts), so the primer never contradicts the timer.
 */
const span = (seconds: number) => {
  const [n, unit] = seconds >= 60 && seconds % 60 === 0 ? [seconds / 60, "minute"] : [seconds, "second"];
  return `${n.toLocaleString("en")} ${unit}${n === 1 ? "" : "s"}`;
};

export function endRuleSentence(settings: { durationMode?: unknown; halfLifeSeconds?: unknown }): string {
  const length = typeof settings.halfLifeSeconds === "number" && settings.halfLifeSeconds > 0 ? settings.halfLifeSeconds : null;
  if (settings.durationMode === "fixed") {
    return length ? `The game ends when its countdown reaches zero, ${span(length)} after the world starts.` : "The game ends when its countdown reaches zero.";
  }
  if (settings.durationMode === "halfLife") {
    return length ? `The game ends at a hidden random moment: half of games end within ${span(length)} of the world starting, and the timer shows a range, not an exact time.`
      : "The game ends at a hidden random moment: the timer shows a range, not an exact time.";
  }
  // The room's settings have not arrived: both rules, without choosing.
  return "The game ends when its countdown reaches zero, or in some setups at a hidden random moment.";
}
