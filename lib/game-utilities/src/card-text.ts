/**
 * Goal-card wording for players (render time). The families' card texts say "scores 1 point" for what the card counts on
 * one object. In the interface "points" is reserved for the payoff the leaderboard adds up, so a card shown to a player
 * says "adds 1 to your rule score" instead. `ruleScoreWording` rewrites a card text (a summary, an example's caption);
 * any "point" it cannot turn into a sentence about the rule score becomes "rule-score point", so the bare word never
 * reaches a player in the card's sense. It leaves a text without "point" alone, and applying it twice changes nothing.
 */
const TIER = "(primary |secondary |tertiary )?";
/** A whole, decimal or negative amount ("2", "0.5", "−2", "-1"), or "that many". */
const AMOUNT = "([−-]?\\d+(?:\\.\\d+)?|that many)";
/** "point(s)" as a verb ("points to a red cell", "Point at a unit") is not the card's word and stays. */
const VERB = "(?!\\s+(?:to|at|towards?|left|right|up|down|away)\\b)";
const BARE = `(?<![Rr]ule-score )\\b(P|p)oint(s?)\\b${VERB}`;
const tier = (t: string | undefined) => t ?? "";

const RULES: readonly [RegExp, (...m: string[]) => string][] = [
  // "This board scores 3 points." / "This board scores the points tuple (3, −5)."
  [/\bThis board scores (?:the points tuple )?([^.]*?)(?: points?)?\./g, (_m, what) => `This board's rule score is ${what}.`],
  // "scores 1 point", "score 2 primary points", "Score 1 point every time", "scores 2 more points", "scores that many points"
  [new RegExp(`\\b([Ss])core(s?) ${AMOUNT} (more )?${TIER}points?\\b`, "g"),
    (_m, s, plural, n, more, t) => `${s === "S" ? "A" : "a"}dd${plural} ${n} ${more ?? ""}to your ${tier(t)}rule score`],
  // "scores as many secondary points as …"
  [new RegExp(`\\b([Ss])core(s?) as many ${TIER}points as\\b`, "g"), (_m, s, plural, t) => `${s === "S" ? "A" : "a"}dd${plural} as much to your ${tier(t)}rule score as`],
  // "deducts 1 point", "loses 2 primary points", "loses 1.5 points"
  [new RegExp(`\\b(?:deducts|loses) ${AMOUNT} ${TIER}points?\\b`, "g"), (_m, n, t) => `takes ${n} off your ${tier(t)}rule score`],
  // "You lose 1 point for each …", "lose as many points as …"
  [new RegExp(`\\b([Ll])ose ${AMOUNT} ${TIER}points?\\b`, "g"), (_m, l, n, t) => `${l}ose ${n} from your ${tier(t)}rule score`],
  [new RegExp(`\\b([Ll])ose(s?) as many ${TIER}points as\\b`, "g"), (_m, l, plural, t) => `${l === "L" ? "T" : "t"}ake${plural} as much off your ${tier(t)}rule score as`],
  // Whatever is left: never the bare word (the verb stays; a "Rule-score point" already reworded is left alone).
  [new RegExp(BARE, "g"), (_m, p, plural) => `${p === "P" ? "Rule-score" : "rule-score"} point${plural}`],
];

export function ruleScoreWording(text: string): string {
  if (!/points?\b/i.test(text)) return text;
  return RULES.reduce((out, [pattern, to]) => out.replace(pattern, to as (...m: string[]) => string), text);
}

/** True when a card text shown to a player still uses "point(s)" in the card's sense (the word is reserved for the payoff). */
export const usesReservedPoints = (text: string): boolean => new RegExp(BARE, "i").test(text);
