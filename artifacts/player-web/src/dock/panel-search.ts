/**
 * The panel picker's filtering (the pane header's panel menu), pure so it is tested without a DOM. It reuses the
 * palette's fuzzy matcher (lib/ui-kit search.ts `matchScore`): a typed query matches a panel's title and its synonyms
 * (a synonym scores 10 % below the title), keeps the sections ("For now", "Other panels", "Your panels"), and ranks
 * the best match first within each. An empty query lists everything in the given order.
 */
import { matchScore } from "@workspace/ui-kit/core";
import type { PanelId } from "@workspace/player-client/panels";

export type PickerSection = "now" | "later" | "mine";
export type PickerChoice = { key: string; title: string; section: PickerSection; keywords?: readonly string[]; disabled?: boolean; detail?: string };

export const PICKER_SECTIONS: readonly { id: PickerSection; title: string }[] = [
  { id: "now", title: "For now" }, { id: "later", title: "Other panels" }, { id: "mine", title: "Your panels" },
];

/** Other names a player may type for a built-in panel. */
export const PANEL_SYNONYMS: Readonly<Record<PanelId, readonly string[]>> = {
  overview: ["overview", "home", "status", "summary", "next step"],
  "my-card": ["card", "goal", "utility", "secret", "objective"],
  objects: ["objects", "payoff", "world", "grids", "things", "items"],
  "others-care": ["others", "opponents", "interests", "rivals"],
  "bits-over-time": ["points", "score", "history", "progress", "chart"],
  race: ["leaderboard", "standings", "ranking", "winning"],
  agents: ["agents", "energy", "bots"],
  feed: ["changes", "events", "log", "news", "activity"],
  "what-if": ["whatif", "simulate", "predict", "move"],
  "public-chat": ["chat", "messages", "talk", "say"],
  forge: ["code", "editor", "write agent", "program"],
  results: ["final", "standings", "ended", "outcome", "summary"],
  rules: ["help", "how to play", "settings", "explain"],
  "code-output": ["analytics", "tables", "output", "results"],
  timeline: ["replay", "scrub", "history"],
};

/** The best score of a query against a choice: its title, or a synonym at 90 %. 0 = no match. */
export function scoreChoice(choice: PickerChoice, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  let best = matchScore(choice.title, q);
  for (const word of choice.keywords ?? []) best = Math.max(best, matchScore(word, q) * 0.9);
  // Several words: every one must match the title or a synonym.
  if (best === 0 && q.includes(" ")) {
    const parts = q.split(/\s+/).map(token => Math.max(matchScore(choice.title, token), ...(choice.keywords ?? []).map(k => matchScore(k, token) * 0.9)));
    if (parts.every(s => s > 0)) best = parts.reduce((a, b) => a + b, 0) / parts.length * 0.85;
  }
  return best;
}

/** The choices to show for a query, by section in the sections' order; best match first when typing, input order otherwise. */
export function filterChoices(choices: readonly PickerChoice[], query: string): { section: { id: PickerSection; title: string }; choices: PickerChoice[] }[] {
  const typed = query.trim() !== "";
  return PICKER_SECTIONS.map(section => {
    const scored = choices.filter(c => c.section === section.id).map((choice, order) => ({ choice, order, score: scoreChoice(choice, query) })).filter(x => x.score > 0);
    if (typed) scored.sort((a, b) => b.score - a.score || a.order - b.order);
    return { section, choices: scored.map(x => x.choice) };
  }).filter(group => group.choices.length > 0);
}
