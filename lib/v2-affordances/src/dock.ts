/**
 * The dock's geometry (part of the human's view state, `ViewState.dock`): per kind of game screen, a tree of splits
 * whose leaves are tab groups of panes. It is library-independent (the desktop app maps it onto dockview), reduced by
 * the same code in the browser and on the server (`view.arrangeDock`), and travels as a short text an assistant can
 * read and write:
 *
 *   row(column(my-card 50, agents 50) 28, column(objects 45, object 55) 42, column(feed|*public-chat 55, race 45) 30)
 *
 * `row(...)` lays its children side by side, `column(...)` one above the other; the number after a child is its weight
 * (weights are shares, never pixels; a missing weight is an equal share); `a|b` is one group with tabs a and b, and `*`
 * marks the tab shown (else the first). Copied and cleaned from the v1 dock layout (archive/engine-v1,
 * lib/player-client/src/layout.ts), with tab groups instead of one pane per leaf.
 */

export const DOCK_KINDS = ["planning", "live", "ended", "replay"] as const;
/** The game screens that each keep their own arrangement (a paused game keeps the live one). */
export type DockKind = (typeof DOCK_KINDS)[number];
export type DockDirection = "row" | "column";
export type DockGroup = { tabs: string[]; active: string };
export type DockSplit = { split: DockDirection; sizes: number[]; children: DockNode[] };
export type DockNode = DockGroup | DockSplit;

export const DOCK_LIMITS = { panes: 24, depth: 6, text: 2000 } as const;

export const isGroup = (n: DockNode): n is DockGroup => "tabs" in n;

/** The dock a phase shows (null outside a game screen). */
export function dockKindOf(phase: string): DockKind | null {
  if (phase === "paused") return "live";
  return (DOCK_KINDS as readonly string[]).includes(phase) ? (phase as DockKind) : null;
}

/** Pane ids in reading order (depth first, left/top first; a group's tabs in order). */
export function dockPanes(n: DockNode | null | undefined): string[] {
  if (!n) return [];
  return isGroup(n) ? [...n.tabs] : n.children.flatMap(dockPanes);
}

export function depthOf(n: DockNode): number {
  return isGroup(n) ? 1 : 1 + Math.max(0, ...n.children.map(depthOf));
}

const round = (x: number) => Math.round(x * 10) / 10;
/** Weights summing to 100; a missing or non-positive weight is an equal share of what is given (a pane never vanishes). */
function rescale(sizes: readonly (number | undefined)[], count: number): number[] {
  const given = Array.from({ length: count }, (_, i) => sizes[i]).map(s => (s !== undefined && Number.isFinite(s) && s > 0 ? s : undefined));
  const known = given.filter((s): s is number => s !== undefined);
  const fill = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const padded = given.map(s => s ?? fill);
  const sum = padded.reduce((a, b) => a + b, 0) || 1;
  return padded.map(s => round((s / sum) * 100));
}

/**
 * The tree made tidy: a pane kept in its first place only, a group's shown tab one of its tabs, empty groups and
 * splits dropped, a one-child split replaced by its child, a split inside a split of the same direction merged into it,
 * weights summing to 100. Null when nothing is left.
 */
export function normaliseDock(n: DockNode | null | undefined, seen = new Set<string>()): DockNode | null {
  if (!n) return null;
  if (isGroup(n)) {
    const tabs = n.tabs.filter(t => !seen.has(t) && (seen.add(t), true));
    if (!tabs.length) return null;
    return { tabs, active: tabs.includes(n.active) ? n.active : tabs[0]! };
  }
  const scaled = rescale(n.sizes, n.children.length);
  const children: DockNode[] = [];
  const sizes: number[] = [];
  n.children.forEach((child, i) => {
    const kept = normaliseDock(child, seen);
    if (!kept) return;
    if (!isGroup(kept) && kept.split === n.split) {
      kept.children.forEach((grand, j) => { children.push(grand); sizes.push((scaled[i]! * kept.sizes[j]!) / 100); });
    } else { children.push(kept); sizes.push(scaled[i]!); }
  });
  if (!children.length) return null;
  if (children.length === 1) return children[0]!;
  return { split: n.split, sizes: rescale(sizes, children.length), children };
}

/** The tree without the panes `drop` names (normalised). */
export function dockWithout(n: DockNode | null | undefined, drop: (pane: string) => boolean): DockNode | null {
  if (!n) return null;
  const strip = (m: DockNode): DockNode => isGroup(m) ? { tabs: m.tabs.filter(t => !drop(t)), active: m.active } : { ...m, children: m.children.map(strip) };
  return normaliseDock(strip(n));
}

/** The tree with `pane`'s tab shown in its group (unchanged when it is not in the tree). */
export function dockActivate(n: DockNode, pane: string): DockNode {
  if (isGroup(n)) return n.tabs.includes(pane) ? { ...n, active: pane } : n;
  return { ...n, children: n.children.map(c => dockActivate(c, pane)) };
}

// ---------------------------------------------------------------------------------------------
// The text form
// ---------------------------------------------------------------------------------------------

export class DockSyntaxError extends Error {}

const PANE_ID = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,59}/;

/** Reads the text form (see the module comment); throws DockSyntaxError with what is wrong and where. */
export function parseDock(text: string): DockNode {
  if (text.length > DOCK_LIMITS.text) throw new DockSyntaxError(`The arrangement is longer than ${DOCK_LIMITS.text} characters.`);
  let i = 0;
  const fail = (what: string): never => { throw new DockSyntaxError(`${what} at character ${i + 1} of "${text.length > 80 ? `${text.slice(0, 77)}...` : text}".`); };
  const space = () => { while (i < text.length && /\s/.test(text[i]!)) i++; };
  const eat = (c: string) => { space(); if (text[i] === c) { i++; return true; } return false; };
  const paneId = (): string => {
    space();
    const m = PANE_ID.exec(text.slice(i));
    if (!m) return fail("Expected a pane id");
    i += m[0].length;
    return m[0];
  };
  const node = (depth: number): DockNode => {
    if (depth > DOCK_LIMITS.depth) fail(`Nested deeper than ${DOCK_LIMITS.depth} levels`);
    space();
    const kw = /^(row|column)\s*\(/.exec(text.slice(i));
    if (kw) {
      i += kw[0].length;
      const children: DockNode[] = [];
      const sizes: (number | undefined)[] = [];
      do {
        children.push(node(depth + 1));
        space();
        const w = /^\d+(\.\d+)?/.exec(text.slice(i));
        if (w) { sizes.push(Number(w[0])); i += w[0].length; } else sizes.push(undefined);
      } while (eat(","));
      if (!eat(")")) fail('Expected "," or ")"');
      return { split: kw[1] as DockDirection, sizes: sizes as number[], children };
    }
    const tabs: string[] = [];
    let active: string | undefined;
    do {
      const star = eat("*");
      const id = paneId();
      tabs.push(id);
      if (star) active = id;
    } while (eat("|"));
    return { tabs, active: active ?? tabs[0]! };
  };
  const root = node(1);
  space();
  if (i < text.length) fail("Unexpected text");
  // Sizes not given are filled in by normaliseDock (rescale); the parsed tree is always normalised.
  const tidy = normaliseDock(root);
  if (!tidy) return fail("No panes");
  if (dockPanes(tidy).length > DOCK_LIMITS.panes) fail(`More than ${DOCK_LIMITS.panes} panes`);
  return tidy;
}

const num = (x: number) => String(round(x));
/** The text form of a tree (parseDock reads it back to the same tree). */
export function formatDock(n: DockNode): string {
  if (isGroup(n)) return n.tabs.map((t, k) => (t === n.active && k > 0 ? `*${t}` : t)).join("|");
  return `${n.split}(${n.children.map((c, k) => `${formatDock(c)} ${num(n.sizes[k] ?? 0)}`).join(", ")})`;
}

// ---------------------------------------------------------------------------------------------
// Defaults and placing a pane
// ---------------------------------------------------------------------------------------------

/**
 * Each screen's arrangement before the human changes it, sized so every pane has a usable body at 1280×720 and up:
 * planning the next step over the goal card, the starting lines (W3 #931) in the middle and the agent code; a live game the goal card over the
 * agents, the lines in the middle (one line opens below them) and what just changed over the leaderboard; after the end
 * the results in the middle at full height.
 */
export const DEFAULT_DOCKS: Readonly<Record<DockKind, string>> = {
  // The owner's layout (17 November) on every game screen: your secret goal over the leaderboard, the lines, my agents;
  // the assistant in a full-width row below. The end screen puts the results above the lines.
  planning: "column(row(column(my-card 50, race 50) 33, objects 37, agents 30) 67, assistant 33)",
  live: "column(row(column(my-card 50, race 50) 33, objects 37, agents 30) 67, assistant 33)",
  ended: "column(row(column(my-card 50, race 50) 33, column(results 60, objects 40) 37, agents 30) 67, assistant 33)",
  // An ended game is its replay (v1): the same layout with the replay's Timeline in the assistant's place.
  replay: "column(row(column(my-card 50, race 50) 33, objects 37, agents 30) 67, timeline 33)",
};
const DEFAULT_TREES = Object.fromEntries(DOCK_KINDS.map(k => [k, parseDock(DEFAULT_DOCKS[k])])) as Record<DockKind, DockNode>;
/** A screen's default arrangement (parsed once; the trees are never changed in place). */
export const defaultDock = (kind: DockKind): DockNode => DEFAULT_TREES[kind];

/** Where a pane goes when it is opened; the same four places the pane menu offers. */
export type DockPlace = "main" | "left" | "right" | "bottom";
type Rect = { x: number; y: number; w: number; h: number };
type Leaf = { group: DockGroup; path: number[]; rect: Rect };

/** The groups in reading order, each with its share of the dock (x, y, width and height from 0 to 1). */
export function dockGroups(n: DockNode, rect: Rect = { x: 0, y: 0, w: 1, h: 1 }, path: number[] = []): Leaf[] {
  if (isGroup(n)) return [{ group: n, path, rect }];
  const total = n.sizes.reduce((a, b) => a + b, 0) || 1;
  let at = 0;
  return n.children.flatMap((child, i) => {
    const share = (n.sizes[i] ?? 0) / total;
    const r = n.split === "row" ? { x: rect.x + rect.w * at, y: rect.y, w: rect.w * share, h: rect.h } : { x: rect.x, y: rect.y + rect.h * at, w: rect.w, h: rect.h * share };
    at += share;
    return dockGroups(child, r, [...path, i]);
  });
}

function replaceAt(n: DockNode, path: readonly number[], f: (m: DockNode) => DockNode): DockNode {
  if (!path.length) return f(n);
  if (isGroup(n)) return n;
  const [i, ...rest] = path;
  return { ...n, children: n.children.map((c, k) => (k === i ? replaceAt(c, rest, f) : c)) };
}

const EDGE = 1e-6;
/**
 * The group a place means: the biggest group for "main", the widest group along the bottom for "bottom", else the last
 * group (the lowest) along that edge. A group showing the assistant's conversation is passed over while there is another: what the assistant
 * opens for the human never covers the conversation they are having with it.
 */
function anchorOf(all: Leaf[], place: DockPlace): Leaf {
  const free = all.filter(l => l.group.active !== "assistant");
  const leaves = free.length ? free : all;
  const along = (f: (r: Rect) => boolean) => leaves.filter(l => f(l.rect)).at(-1);
  const bottom = leaves.filter(l => l.rect.y + l.rect.h > 1 - EDGE).reduce<Leaf | undefined>((best, l) => (!best || l.rect.w > best.rect.w + EDGE ? l : best), undefined);
  const edge = place === "left" ? along(r => r.x < EDGE) : place === "right" ? along(r => r.x + r.w > 1 - EDGE) : place === "bottom" ? bottom : undefined;
  return edge ?? leaves.reduce((best, l) => (l.rect.w * l.rect.h > best.rect.w * best.rect.h + EDGE ? l : best));
}

/**
 * The tree with `pane` added at `place` (unchanged when it is already in it): one line ("object") gets a group of its
 * own below the lines it is opened from (when they are in front), so the list stays in view; any other pane opened to
 * the front (`show`) gets a group of its own beside the group at that place, so nothing in view is covered (up to
 * MAX_SPLIT groups; then it is a tab in front there); a pane carried over from elsewhere joins behind the tab shown there.
 * Nothing is ever taken out to make room.
 */
export function dockInsert(n: DockNode | null, pane: string, place: DockPlace, show: boolean): DockNode {
  if (!n) return { tabs: [pane], active: pane };
  if (dockPanes(n).includes(pane)) return n;
  const leaves = dockGroups(n);
  const lines = pane === "object" ? leaves.find(l => l.group.active === "objects") : undefined;
  if (lines) return normaliseDock(replaceAt(n, lines.path, g => ({ split: "column", sizes: [45, 55], children: [g, { tabs: [pane], active: pane }] })))!;
  const anchor = anchorOf(leaves, place);
  // A pane opened to the front gets a group of its own beside the one at that place, so the pane the player acted from
  // stays in view (One line opened from Results covered Results). Past MAX_SPLIT groups it becomes a tab instead.
  if (show && leaves.length < MAX_SPLIT) {
    const wide = anchor.rect.w * 16 > anchor.rect.h * 9 * 1.6;
    return normaliseDock(replaceAt(n, anchor.path, g => ({ split: wide ? "row" : "column", sizes: [50, 50], children: [g, { tabs: [pane], active: pane }] })))!;
  }
  return replaceAt(n, anchor.path, g => {
    const group = g as DockGroup;
    return { tabs: [...group.tabs, pane], active: show ? pane : group.active };
  });
}
/** Groups on one screen before an opened pane joins a group as a tab rather than splitting it. */
export const MAX_SPLIT = 10;
