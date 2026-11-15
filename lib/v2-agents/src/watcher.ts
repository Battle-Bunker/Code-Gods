/**
 * The Watcher (owner decisions 33 and 35; v1's observer agent, archive docs/energy-model.md §11.3): an ordinary agent
 * that reads the whole object it is offered and makes no change. The server tells its owner every object such an act
 * read in full, at one look's price from the agent's own energy, so a Watcher keeps a player's objects fresh without
 * the player looking themselves.
 *
 * One view is a full read: `gen` (a·x + b·y + c = 0) for a line, `cells` for a board (test/watcher.test.ts checks it).
 */
import type { ShippedLanguage } from "./starters.ts";

/** The object types a Watcher is written for. */
export type WatcherType = "lines" | "grids";

export interface WatcherAgent {
  readonly kind: "watch";
  readonly title: "Watcher";
  readonly summary: string;
  readonly language: ShippedLanguage;
  readonly source: string;
}

const VIEW: Record<WatcherType, { rep: string; noun: string; says: string }> = {
  lines: { rep: "gen", noun: "line", says: "the line as a·x + b·y + c = 0: the whole line in one view" },
  grids: { rep: "cells", noun: "board", says: "every cell of the board: the whole board in one view" },
};

/** The Watcher for an object type, in TypeScript or Python. */
export function watcherFor(type: WatcherType, language: ShippedLanguage): WatcherAgent {
  const v = VIEW[type];
  const head = [
    `Watcher: reads each ${v.noun} it is offered in full and changes nothing. You are told every ${v.noun} it reads, at one`,
    `look's price from its energy, so your ${v.noun}s stay fresh without you looking. Give it a small share of your power:`,
    "the more energy it holds, the more often it is offered a turn.",
    `Try this: run it beside a climbing starter, and lower its share if your climber gets too few turns.`,
  ];
  const source = language === "typescript" ? [
    ...head.map(l => `// ${l}`),
    "",
    "function agent(offer) {",
    `  look(offer, "${v.rep}");   // ${v.says}`,
    "  return null;              // no change: the read is the point",
    "}",
    "",
  ] : [
    ...head.map(l => `# ${l}`),
    "",
    "",
    "def agent(offer):",
    `    look(offer, "${v.rep}")   # ${v.says}`,
    "    return None              # no change: the read is the point",
    "",
  ];
  return {
    kind: "watch", title: "Watcher", language, source: source.join("\n"),
    summary: `Changes nothing: reads each ${v.noun} it is offered, so you are told it (one look's price each).`,
  };
}
