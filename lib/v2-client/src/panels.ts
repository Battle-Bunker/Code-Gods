/**
 * The game screen's panes (integration plan §1.6, §3.3): pure metadata the dock, the palette and the assistant share.
 * A pane is opened, moved and closed with the view affordances (`view.openPane`, `view.movePane`, `view.closePane`),
 * which keep the open panes in the human's view state (`ViewState.panes`), so an assistant can arrange the screen for
 * them and every client of theirs follows. Player words only: points, ✨ rarity, ⚡ energy, power, "line".
 */
import type { Place, ViewState } from "@workspace/v2-affordances";

/** A game's phase, or "replay": an ended game watched at a playhead (the replay's own arrangement). */
export type GamePhase = "planning" | "live" | "paused" | "ended" | "replay";
const PLAY: readonly GamePhase[] = ["planning", "live", "paused", "ended"];
const ALL: readonly GamePhase[] = [...PLAY, "replay"];
const WORLD: readonly GamePhase[] = ["live", "paused", "ended", "replay"];
/**
 * The entry `replay.open` adds to the open panes. It marks the replay as open and is drawn as the game screen's replay
 * bar, never in the dock; closing it (`view.closePane`) ends the replay, so no arrangement of the dock ever closes it.
 */
export const REPLAY_PANE = "replay";
const docked = (p: { pane: string }) => p.pane !== REPLAY_PANE;

export const PANE_IDS = ["overview", "my-card", "objects", "object", "feed", "agents", "forge", "race", "public-chat", "results", "others-care", "points-over-time", "rules"] as const;
export type PaneId = (typeof PANE_IDS)[number];

export interface PaneDefinition {
  id: PaneId;
  title: string;
  /** One sentence for a newcomer (the pane menu and the palette). */
  blurb: string;
  /** Where it has something to show; elsewhere its empty state names the next step. */
  phases: readonly GamePhase[];
  /** Words people search the pane menu with. */
  keywords: readonly string[];
}

const def = (d: PaneDefinition) => d;
export const PANES: Readonly<Record<PaneId, PaneDefinition>> = {
  overview: def({ id: "overview", title: "Where am I", blurb: "What's happening, how you're doing, and the one thing to do next.", phases: PLAY, keywords: ["next step", "status", "help"] }),
  "my-card": def({ id: "my-card", title: "Your secret goal", blurb: "Your rule in plain words, a worked example and the steps to the top.", phases: ALL, keywords: ["rule", "goal", "card", "ladder"] }),
  objects: def({ id: "objects", title: "Lines", blurb: "Which lines earn you points, and why.", phases: WORLD, keywords: ["objects", "lines", "points", "rarity"] }),
  object: def({ id: "object", title: "One line", blurb: "One line in every representation your rule reads, with why it scores.", phases: WORLD, keywords: ["expanded", "representations", "compare"] }),
  feed: def({ id: "feed", title: "What just changed", blurb: "Every move that changed your points, and why.", phases: WORLD, keywords: ["act log", "moves", "why", "feed"] }),
  agents: def({ id: "agents", title: "My agents", blurb: "Your agents, their energy, and what they spent it on.", phases: PLAY, keywords: ["energy", "power", "share"] }),
  forge: def({ id: "forge", title: "Agent code", blurb: "Write, check, summon and replace your agents.", phases: ["planning", "live", "paused"], keywords: ["code", "summon", "replace", "editor"] }),
  race: def({ id: "race", title: "Leaderboard", blurb: "Who's winning, and is anyone catching up.", phases: WORLD, keywords: ["standings", "scores", "race"] }),
  "public-chat": def({ id: "public-chat", title: "Public chat", blurb: "Everything said to everyone.", phases: ALL, keywords: ["talk", "message", "pitch"] }),
  "others-care": def({ id: "others-care", title: "What others care about", blurb: "Every line by your ✨ rarity and how much the others want it: who cares about what.", phases: WORLD, keywords: ["others", "want", "deals", "scatter"] }),
  "points-over-time": def({ id: "points-over-time", title: "Your points over time", blurb: "Your points at every scoreboard, rising and falling.", phases: WORLD, keywords: ["history", "chart", "points", "trend"] }),
  rules: def({ id: "rules", title: "How to play", blurb: "The game in 90 seconds, with this game's settings.", phases: ALL, keywords: ["rules", "help", "how", "settings", "energy", "power"] }),
  results: def({ id: "results", title: "How the game went", blurb: "Final standings and why you finished where you did.", phases: ["ended"], keywords: ["end", "winner", "final"] }),
};

export const isPaneId = (v: unknown): v is PaneId => typeof v === "string" && (PANE_IDS as readonly string[]).includes(v);
export const paneTitle = (id: string): string => (isPaneId(id) ? PANES[id].title : id);

/** At most this many panes at once; opening another replaces the oldest (and says which: ux-lessons 5.4). */
export const MAX_PANES = 5;

export type OpenPane = { pane: string; place: Place };

/** The arrangement a new player sees in each phase (before they change anything). */
export function defaultPanes(phase: GamePhase): OpenPane[] {
  switch (phase) {
    case "planning": return [{ pane: "my-card", place: "main" }, { pane: "forge", place: "right" }, { pane: "overview", place: "left" }];
    case "ended": return [{ pane: "results", place: "main" }, { pane: "my-card", place: "left" }, { pane: "race", place: "right" }];
    case "replay": return [{ pane: "objects", place: "main" }, { pane: "my-card", place: "left" }, { pane: "feed", place: "right" }, { pane: "race", place: "right" }];
    default: return [
      { pane: "objects", place: "main" }, { pane: "my-card", place: "left" }, { pane: "feed", place: "right" },
      { pane: "agents", place: "bottom" }, { pane: "race", place: "bottom" },
    ];
  }
}

const inPhase = (id: string, phase: GamePhase) => isPaneId(id) && PANES[id].phases.includes(phase);
/** A pane that needs the world (not offered in planning). */
const needsWorld = (id: string) => isPaneId(id) && !PANES[id].phases.includes("planning");

/**
 * The panes to show now: the human's own arrangement once they have one (an empty view follows the phase's default),
 * without panes this phase has nothing for (the forge after the end). An arrangement made before the world started
 * (no pane that needs the world) meets the world's defaults when it starts, so a change made in planning never hides
 * the lines and the act log for the whole game. After the end the results come first even when not open (shown, not
 * stored). Unknown pane ids are dropped (a pane removed since the view was saved).
 */
export function shownPanes(view: Pick<ViewState, "panes">, phase: GamePhase): OpenPane[] {
  const own = view.panes.filter(p => docked(p) && inPhase(p.pane, phase));
  let panes = own.length ? own : defaultPanes(phase);
  if (own.length && phase !== "planning" && !view.panes.some(p => docked(p) && needsWorld(p.pane))) {
    const defaults = defaultPanes(phase);
    panes = [...own, ...defaults.filter(d => !own.some(p => p.pane === d.pane))].slice(0, MAX_PANES);
  }
  if (phase === "ended" && !panes.some(p => p.pane === "results")) return [{ pane: "results", place: "main" }, ...panes];
  return panes;
}

export type ViewOp = { id: "view.openPane" | "view.closePane" | "view.movePane"; args: Record<string, unknown> };

/**
 * The view operations that make the stored arrangement what the human sees now (the defaults, or an arrangement
 * merged with the world's defaults), so a change keeps what is on screen; none when they already agree.
 */
export function keepShown(view: Pick<ViewState, "panes">, phase: GamePhase): ViewOp[] {
  const shown = shownPanes(view, phase);
  const stored = view.panes.filter(docked);
  const same = stored.length === shown.length && stored.every((p, i) => p.pane === shown[i]!.pane && p.place === shown[i]!.place);
  if (same) return [];
  return [
    ...stored.map((p): ViewOp => ({ id: "view.closePane", args: { pane: p.pane } })),
    ...shown.map((p): ViewOp => ({ id: "view.openPane", args: { pane: p.pane, place: p.place } })),
  ];
}

/**
 * What opening `pane` does to the shown arrangement: nothing when it is open (a move, with `place`); else it joins at
 * `place`, and when MAX_PANES are already open the oldest other pane goes (`replaced`). The ops start with
 * `keepShown`, so the panes on screen stay.
 */
export function openPlan(view: Pick<ViewState, "panes">, phase: GamePhase, pane: string, place?: Place): { ops: ViewOp[]; replaced: string | null } {
  const shown = shownPanes(view, phase);
  const ops = keepShown(view, phase);
  if (shown.some(p => p.pane === pane)) return { ops: place ? [...ops, { id: "view.movePane", args: { pane, place } }] : ops, replaced: null };
  let replaced: string | null = null;
  if (shown.length >= MAX_PANES) {
    // The oldest pane goes, but never the one line's own pane, nor the list a line is opened from.
    replaced = (shown.find(p => p.pane !== "object" && !(pane === "object" && p.pane === "objects")) ?? shown[0]!).pane;
    ops.push({ id: "view.closePane", args: { pane: replaced } });
  }
  ops.push({ id: "view.openPane", args: { pane, ...(place ? { place } : {}) } });
  return { ops, replaced };
}

/** Closing a shown pane: the shown arrangement kept, then the pane closed. */
export function closePlan(view: Pick<ViewState, "panes">, phase: GamePhase, pane: string): ViewOp[] {
  return [...keepShown(view, phase), { id: "view.closePane", args: { pane } }];
}

/** The desktop arrangement: columns left, main, right, then a bottom row; an empty column takes no room. */
export function columns(panes: readonly OpenPane[]): Record<Place, string[]> {
  const out: Record<Place, string[]> = { left: [], main: [], right: [], bottom: [] };
  for (const p of panes) out[p.place].push(p.pane);
  if (!out.main.length) {
    // Never an empty middle: the first pane of the widest other column moves in.
    const from = (["right", "left", "bottom"] as const).find(k => out[k].length);
    if (from) out.main.push(out[from].shift()!);
  }
  return out;
}

/** Reading order for a phone: main first, then left, right and bottom. */
export function readingOrder(panes: readonly OpenPane[]): string[] {
  const c = columns(panes);
  return [...c.main, ...c.left, ...c.right, ...c.bottom];
}
