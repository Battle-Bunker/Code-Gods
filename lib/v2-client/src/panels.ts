/**
 * The game screen's panes (integration plan §1.6, §3.3): pure metadata the dock, the palette and the assistant share.
 * A pane is opened, moved and closed with the view affordances (`view.openPane`, `view.movePane`, `view.closePane`),
 * which keep the open panes in the human's view state (`ViewState.panes`), so an assistant can arrange the screen for
 * them and every client of theirs follows. How they are laid out on a desktop is the view state's `dock` (`dockFor`).
 * Player words only: points, rarity in bits, energy, power, "line".
 */
import { defaultDock, dockGroups, dockInsert, dockKindOf, dockPanes, dockWithout, formatDock, parseDock, type DockNode, type Place, type ViewState } from "@workspace/v2-affordances";

/** A game's phase, or "replay": an ended game watched at a playhead (the replay's own arrangement). */
export type GamePhase = "planning" | "live" | "paused" | "ended" | "replay";
const PLAY: readonly GamePhase[] = ["planning", "live", "paused", "ended"];
const ALL: readonly GamePhase[] = [...PLAY, "replay"];
const WORLD: readonly GamePhase[] = ["live", "paused", "ended", "replay"];
/** The board: born, valued and scored at game start (W3 #931), so it shows in planning too. */
const BOARD: readonly GamePhase[] = ["planning", ...WORLD];
/**
 * The entry `replay.open` adds to the open panes. It marks the replay as open and is drawn as the game screen's replay
 * bar, never in the dock; closing it (`view.closePane`) ends the replay, so no arrangement of the dock ever closes it.
 */
export const REPLAY_PANE = "replay";
const docked = (p: { pane: string }) => p.pane !== REPLAY_PANE;

export const PANE_IDS = ["overview", "my-card", "objects", "object", "what-if", "feed", "agents", "forge", "race", "public-chat", "results", "others-care", "points-over-time", "rules", "assistant", "my-panels", "code-output"] as const;
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
  /** Where it joins the dock when opened without a place (beside the panes it belongs with). */
  home: Place;
}

const def = (d: PaneDefinition) => d;
export const PANES: Readonly<Record<PaneId, PaneDefinition>> = {
  overview: def({ id: "overview", title: "Where am I", blurb: "What's happening, how you're doing, and the one thing to do next.", phases: PLAY, keywords: ["next step", "status", "help"], home: "left" }),
  "my-card": def({ id: "my-card", title: "Your secret goal", blurb: "Your rule in plain words, a worked example and the steps to the top.", phases: ALL, keywords: ["rule", "goal", "card", "ladder"], home: "left" }),
  objects: def({ id: "objects", title: "Lines", blurb: "Which lines earn you points, and why.", phases: BOARD, keywords: ["objects", "lines", "points", "rarity"], home: "main" }),
  object: def({ id: "object", title: "One line", blurb: "One line in every representation your rule reads, with why it scores.", phases: BOARD, keywords: ["expanded", "representations", "compare"], home: "main" }),
  "what-if": def({ id: "what-if", title: "What if", blurb: "Try a change and see what it does to your rarity in bits and your points, without making it.", phases: BOARD, keywords: ["what if", "try", "preview", "price", "change", "quote"], home: "main" }),
  feed: def({ id: "feed", title: "What just changed", blurb: "Every move that changed your points, and why.", phases: WORLD, keywords: ["act log", "moves", "why", "feed"], home: "right" }),
  agents: def({ id: "agents", title: "My agents", blurb: "Your agents, their energy, and what they spent it on.", phases: PLAY, keywords: ["energy", "power", "share"], home: "left" }),
  forge: def({ id: "forge", title: "Agent code", blurb: "Write, check, summon and replace your agents.", phases: ["planning", "live", "paused"], keywords: ["code", "summon", "replace", "editor"], home: "main" }),
  race: def({ id: "race", title: "Leaderboard", blurb: "Who's winning, and is anyone catching up.", phases: BOARD, keywords: ["standings", "scores", "race"], home: "right" }),
  "public-chat": def({ id: "public-chat", title: "Public chat", blurb: "Everything said to everyone.", phases: ALL, keywords: ["talk", "message", "pitch"], home: "right" }),
  "others-care": def({ id: "others-care", title: "What others care about", blurb: "Every line by your bits and the others' bits: who cares about what.", phases: WORLD, keywords: ["others", "want", "deals", "scatter"], home: "main" }),
  "points-over-time": def({ id: "points-over-time", title: "Your points over time", blurb: "Your points at every scoreboard, rising and falling.", phases: WORLD, keywords: ["history", "chart", "points", "trend"], home: "main" }),
  rules: def({ id: "rules", title: "How to play", blurb: "The game in 90 seconds, with this game's settings.", phases: ALL, keywords: ["rules", "help", "how", "settings", "energy", "power"], home: "main" }),
  assistant: def({ id: "assistant", title: "Your assistant", blurb: "Ask your assistant for help, or let it play for you.", phases: ALL, keywords: ["assistant", "ask", "help", "autopilot", "ai"], home: "right" }),
  "my-panels": def({ id: "my-panels", title: "Your panels", blurb: "Panels you or your assistant wrote: open, edit, roll back or turn them off.", phases: ALL, keywords: ["panels", "custom", "widgets", "code"], home: "right" }),
  "code-output": def({ id: "code-output", title: "Code results", blurb: "Your scripts' runs over the game's data: the table or JSON each returned, what it printed, and its code.", phases: ALL, keywords: ["code", "script", "run", "analysis", "results", "table"], home: "main" }),
  results: def({ id: "results", title: "How the game went", blurb: "Final standings and why you finished where you did.", phases: ["ended"], keywords: ["end", "winner", "final"], home: "main" }),
};

export const isPaneId = (v: unknown): v is PaneId => typeof v === "string" && (PANE_IDS as readonly string[]).includes(v);

/**
 * A stored panel (the human's own TSX, `panel.*`) opens as the pane `panel:<slug>`, in every phase. Its title is the
 * panel's own, which the dock reads from the panel list; here the slug stands in.
 */
const STORED = "panel:";
export const storedPane = (slug: string): string => `${STORED}${slug}`;
export const storedSlugOf = (pane: string): string | null => (pane.startsWith(STORED) && pane.length > STORED.length ? pane.slice(STORED.length) : null);

/** A file panel (src/panels/*.tsx in the app, v1's file panels) opens as the pane `file:<id>`, in every phase. */
const FILE = "file:";
export const filePane = (id: string): string => `${FILE}${id}`;
export const fileIdOf = (pane: string): string | null => (pane.startsWith(FILE) && pane.length > FILE.length ? pane.slice(FILE.length) : null);

export const paneTitle = (id: string): string => (isPaneId(id) ? PANES[id].title : storedSlugOf(id) ?? fileIdOf(id) ?? id);

export type OpenPane = { pane: string; place: Place };

/** The arrangement a new player sees in each phase (before they change anything). */
/**
 * The owner's layout (17 November), the default of every game screen: in this order on a phone the goal, the lines, the
 * agents, the leaderboard, the assistant (a room without AI does not draw it: dock.tsx). "Where am I" and "Agent code"
 * are opened from the palette or the pane menu.
 */
const OWNERS_LAYOUT: readonly OpenPane[] = [
  { pane: "my-card", place: "main" }, { pane: "objects", place: "main" }, { pane: "agents", place: "right" },
  { pane: "race", place: "right" }, { pane: "assistant", place: "bottom" },
];

export function defaultPanes(phase: GamePhase): OpenPane[] {
  switch (phase) {
    // The owner's layout is the default of every game screen (17 November); the end screen adds the results.
    case "ended": return [{ pane: "results", place: "main" }, ...OWNERS_LAYOUT];
    case "replay": return [{ pane: "objects", place: "main" }, { pane: "my-card", place: "left" }, { pane: "feed", place: "right" }, { pane: "race", place: "right" }];
    default: return [...OWNERS_LAYOUT];
  }
}

/**
 * A spectator's arrangement before they change anything (v1's spectator page: Leaderboard with roster, Objects, Public
 * chat): the goal card, the act log and the agents are a seated player's, empty for someone watching. Before the world
 * the leaderboard has nothing, so How to play stands in; after the end the results lead.
 */
export function spectatorPanes(phase: GamePhase): OpenPane[] {
  switch (phase) {
    case "planning": return [{ pane: "objects", place: "main" }, { pane: "rules", place: "left" }, { pane: "public-chat", place: "right" }];
    case "ended": return [{ pane: "results", place: "main" }, { pane: "race", place: "left" }, { pane: "public-chat", place: "right" }];
    case "replay": return defaultPanes(phase);
    default: return [{ pane: "objects", place: "main" }, { pane: "race", place: "left" }, { pane: "public-chat", place: "right" }];
  }
}

/**
 * The view the dock shows and plans from: a spectator who has arranged nothing sees `spectatorPanes`, so the panes on
 * screen and the operations that keep them (openPlan, closePlan) agree; a seated player's, or anyone's own arrangement,
 * is the view itself.
 */
export function viewerView<V extends Pick<ViewState, "panes" | "dock">>(view: V, phase: GamePhase, seated: boolean): V {
  if (seated || phase === "replay" || view.panes.some(docked)) return view;
  const kind = dockKindOf(phase) ?? "live";
  return { ...view, panes: spectatorPanes(phase), dock: { ...view.dock, [kind]: view.dock?.[kind] ?? SPECTATOR_TREES[kind] } };
}

/** The spectator's screens side by side (each a third or so: no pane behind a tab), as `spectatorPanes` places them. */
const SPECTATOR_DOCKS: Readonly<Record<"planning" | "live" | "ended", string>> = {
  planning: "row(rules 28, objects 44, public-chat 28)",
  live: "row(race 28, objects 44, public-chat 28)",
  ended: "row(race 28, results 44, public-chat 28)",
};
const SPECTATOR_TREES = Object.fromEntries(Object.entries(SPECTATOR_DOCKS).map(([k, t]) => [k, parseDock(t)])) as Record<string, DockNode>;

/**
 * The view operations that store a spectator's default screen and panes before their first change (the server would
 * otherwise start it from the player's): none for a seated player, an own arrangement, or a screen already stored.
 */
export function spectatorArrange(view: Pick<ViewState, "panes" | "dock">, phase: GamePhase, seated: boolean): ViewOp[] {
  const kind = dockKindOf(phase) ?? "live";
  if (seated || phase === "replay" || view.panes.some(docked) || view.dock?.[kind] || !SPECTATOR_TREES[kind]) return [];
  return [
    { id: "view.arrangeDock", args: { dock: formatDock(SPECTATOR_TREES[kind]!), phase } },
    ...spectatorPanes(phase).map((p): ViewOp => ({ id: "view.openPane", args: { pane: p.pane, place: p.place } })),
  ];
}

const inPhase = (id: string, phase: GamePhase) => (isPaneId(id) ? PANES[id].phases.includes(phase) : storedSlugOf(id) !== null || fileIdOf(id) !== null);

/**
 * The panes to show now: the human's own arrangement once they have one (an empty view follows the phase's default),
 * without panes this phase has nothing for (the forge after the end). An arrangement made before the world started
 * (no pane that needs the world) meets the world's defaults when it starts, so a change made in planning never hides
 * the lines and the act log for the whole game; one made after the end (with the results) meets the planning defaults
 * when the next game starts. An arrangement with none of the phase's default panes (a pane an
 * assistant opened on the empty view, which the server stores as it is) meets the defaults the same way, the defaults
 * first. Nothing is ever left out to make room (the desktop dock adds tabs). After the end the results come
 * first even when not open (shown, not stored). Unknown pane ids are dropped (a pane removed since the view was saved); a stored panel's pane is shown in every phase.
 */
/** The panes a game screen shows by default (a replay's act log is one players open themselves). */
const OTHER_DEFAULTS = new Set((["planning", "live", "ended"] as const).flatMap(p => defaultPanes(p).map(d => d.pane)));

export function shownPanes(view: Pick<ViewState, "panes">, phase: GamePhase): OpenPane[] {
  const own = view.panes.filter(p => docked(p) && inPhase(p.pane, phase));
  const defaults = defaultPanes(phase);
  let panes = own.length ? own : defaults;
  // Before the world (arranged in planning) or after the end (the last game's results): the phase's defaults join.
  // Planning and the live game share one default (the owner's layout); an arrangement stored on the end screen holds the
  // results, so the next game's screens meet their defaults again.
  const fromOtherPhase = phase !== "ended" && view.panes.some(p => p.pane === "results");
  const lacksDefaults = !own.some(p => defaults.some(d => d.pane === p.pane));
  if (own.length && (fromOtherPhase || lacksDefaults)) {
    panes = [...defaults.filter(d => !own.some(p => p.pane === d.pane)), ...own];
  }
  // Another screen's default panes stay on their screen (they came along as tabs inside this screen's panes: the
  // planning screen's next step and agent code inside the live game), unless the player put them in this screen's own
  // arrangement: a screen shows its defaults, what the player arranged on it and the other panes the player opened.
  const kind = dockKindOf(phase) ?? "live";
  const arranged = new Set(dockPanes((view as Partial<Pick<ViewState, "dock">>).dock?.[kind]));
  const mine = new Set(defaults.map(d => d.pane));
  panes = panes.filter(p => mine.has(p.pane) || arranged.has(p.pane) || !OTHER_DEFAULTS.has(p.pane));
  if (phase === "ended" && !panes.some(p => p.pane === "results")) return [{ pane: "results", place: "main" }, ...panes];
  return panes;
}

export type ViewOp = { id: "view.openPane" | "view.closePane" | "view.movePane" | "view.arrangeDock"; args: Record<string, unknown> };

/**
 * The view operations that make the stored panes what the human sees now (the defaults, or an arrangement merged with
 * the defaults of this phase), so a change keeps what is on screen: the shown panes not stored are opened and the
 * stored panes not shown are closed. A pane stored and shown is left alone, so its place in the dock stays; closing
 * changes only this screen's arrangement, so a closed pane keeps its place on the other screens. None when they agree.
 */
export function keepShown(view: Pick<ViewState, "panes">, phase: GamePhase): ViewOp[] {
  const shown = shownPanes(view, phase);
  const stored = view.panes.filter(docked);
  return [
    ...stored.filter(p => !shown.some(s => s.pane === p.pane)).map((p): ViewOp => ({ id: "view.closePane", args: { pane: p.pane } })),
    ...shown.filter(s => !stored.some(p => p.pane === s.pane)).map((p): ViewOp => ({ id: "view.openPane", args: { pane: p.pane, place: p.place } })),
  ];
}

/** Where a pane joins when opened without a place. */
export const homeOf = (pane: string): Place => (isPaneId(pane) ? PANES[pane].home : "main");

/**
 * What opening `pane` does: the panes on screen stay (`keepShown` first) and nothing is closed to make room. A pane not
 * shown joins at `place` (else its home) and is shown in front; a shown one comes to the front of its tab group, or
 * moves when given a place.
 */
export function openPlan(view: Pick<ViewState, "panes">, phase: GamePhase, pane: string, place?: Place): ViewOp[] {
  const shown = shownPanes(view, phase).some(p => p.pane === pane);
  const ops = keepShown(view, phase);
  if (shown && place) return [...ops, { id: "view.movePane", args: { pane, place } }];
  const front: ViewOp = { id: "view.openPane", args: { pane } };
  // A pane the arrangement already places joins there; the last op brings it to the front (a no-op when it is).
  return shown ? [...ops, front] : [...ops, { id: "view.openPane", args: { pane, place: place ?? homeOf(pane) } }, front];
}

/** Closing a shown pane: the shown arrangement kept, then the pane closed. */
export function closePlan(view: Pick<ViewState, "panes">, phase: GamePhase, pane: string): ViewOp[] {
  return [...keepShown(view, phase), { id: "view.closePane", args: { pane } }];
}

/**
 * The desktop dock for a phase: the human's arrangement of that screen (else its default) holding exactly the shown
 * panes. A pane it names that is not shown (closed, or nothing to show in this phase, or an unknown id) is left out; a
 * shown pane it lacks joins at its place behind the tab shown there (a pane carried over from another screen never
 * covers one the screen arranged), except the one line, which opens below the lines. Null when nothing is shown.
 */
export function dockFor(view: Pick<ViewState, "panes" | "dock">, phase: GamePhase): DockNode | null {
  const kind = dockKindOf(phase) ?? "live";
  const shown = shownPanes(view, phase);
  const ids = new Set(shown.map(p => p.pane));
  const keep = (n: DockNode) => dockWithout(n, p => !ids.has(p));
  // An arrangement holding none of the shown panes would put them all in one group: the default's places serve instead.
  let tree = (view.dock?.[kind] && keep(view.dock[kind])) || keep(defaultDock(kind));
  // A pane joining this screen's dock goes behind its group's tab, except the assistant when it was in front in the
  // arrangement it comes from (re-walk: the conversation went behind a tab when the world started).
  // A pane joining this screen's dock gets a place of its own beside the pane at its place, never a tab inside another
  // (the coordinator, 17 November: nothing arrives as a tab by default).
  for (const p of shown) tree = dockInsert(tree, p.pane, p.place, true);
  return tree;
}

/**
 * The panes a drop replaced (v1: a pane dragged onto the centre of another replaces it, never stacks as a tab): the
 * other members of each group that a pane joined from another group. A move to an edge, a tab click and a gutter
 * dragged replace nothing; tabs a screen already had stay.
 */
export function droppedOnto(before: DockNode | null, now: DockNode | null): string[] {
  if (!before || !now) return [];
  const groupOf = new Map<string, number>();
  dockGroups(before).forEach((l, i) => { for (const t of l.group.tabs) groupOf.set(t, i); });
  const out: string[] = [];
  for (const { group } of dockGroups(now)) {
    const homes = new Set(group.tabs.map(t => groupOf.get(t)));
    if (homes.size < 2) continue;
    // The joiner is the pane whose old group the others did not share; the others are what it was dropped onto.
    const counts = new Map<number | undefined, number>();
    for (const t of group.tabs) counts.set(groupOf.get(t), (counts.get(groupOf.get(t)) ?? 0) + 1);
    const joiner = group.tabs.find(t => counts.get(groupOf.get(t)) === 1 && t === group.active) ?? group.tabs.find(t => counts.get(groupOf.get(t)) === 1);
    if (joiner) out.push(...group.tabs.filter(t => t !== joiner));
  }
  return out;
}

/** The phone's arrangement: columns left, main, right, then a bottom row; an empty column takes no room. */
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
