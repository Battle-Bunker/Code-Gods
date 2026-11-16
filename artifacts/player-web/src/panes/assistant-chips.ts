/**
 * v1's starter chips (archive: player-web core/chat/suggestions.ts, lib/player-client chips.ts): at most three
 * questions for the situation, each sent to the assistant as it reads. Questions, never a destination to hold (the
 * game is a metastable ecosystem). Pure.
 */
export interface ChipContext { phase: "planning" | "live" | "paused" | "ended"; seated: boolean; agents: number; noun: string }

export function suggestionsFor(c: ChipContext): string[] {
  if (!c.seated && c.phase !== "ended") return ["What's happening?", "Who's winning?", "How do I join the next game?"];
  switch (c.phase) {
    case "planning": return ["Explain my goal simply", c.agents > 0 ? "Is my agent any good?" : "Write me a first agent", "What should my agent do?"];
    case "live": return [c.agents > 0 ? "What should I do next?" : "Write me an agent", `Which ${c.noun}s matter to me?`, "What do the others want?"];
    case "paused": return ["What changed?", "Draft a public proposal", "Should I change my agents?"];
    case "ended": return ["Why did I finish there?", "What would have worked better?", "Show the results"];
  }
}
