/**
 * The dock's geometry (part of the human's view state, `ViewState.dock`): per kind of game screen, a tree of splits
 * whose leaves are single panes. It is library-independent (the desktop app maps it onto dockview), reduced by the
 * same code in the browser and on the server (`view.arrangeDock`), and travels as a short text an assistant can read
 * and write:
 *
 *   row(column(my-card 50, agents 50) 28, objects 42, column(feed 55, race 45) 30)
 *
 * `row(...)` lays its children side by side, `column(...)` one above the other; the number after a child is its weight
 * (weights are shares, never pixels; a missing weight is an equal share). A pane holds one panel: there are no tabs
 * (production's dock, lib/player-client/src/layout.ts on `main`: one pane per leaf, a drop on a pane replaces it).
 */

export const DOCK_KINDS = ["planning", "live", "ended", "replay"] as const;
/** The game screens that each keep their own arrangement (a paused game keeps the live one). */
export type DockKind = (typeof DOCK_KINDS)[number];
export type DockDirection = "row" | "column";
export type DockLeaf = { pane: string };
export type DockSplit = { split: DockDirection; sizes: number[]; children: DockNode[] };
export type DockNode = DockLeaf | DockSplit;

export const DOCK_LIMITS = { panes: 24, depth: 6, text: 2000 } as const;

export const isLeaf = (n: DockNode): n is DockLeaf => "pane" in n;

/** The dock a phase shows (null outside a game screen). */
export function dockKindOf(phase: string): DockKind | null {
  if (phase === "paused") return "live";
  return (DOCK_KINDS as readonly string[]).includes(phase) ? (phase as DockKind) : null;
}

/** Pane ids in reading order (depth first, left/top first). */
export function dockPanes(n: DockNode | null | undefined): string[] {
  if (!n) return [];
  return isLeaf(n) ? [n.pane] : n.children.flatMap(dockPanes);
}

export function depthOf(n: DockNode): number {
  return isLeaf(n) ? 1 : 1 + Math.max(0, ...n.children.map(depthOf));
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
 * The tree made tidy: a pane kept in its first place only, empty splits dropped, a one-child split replaced by its
 * child, a split inside a split of the same direction merged into it, weights summing to 100. Null when nothing is
 * left. An arrangement stored while the dock had tab groups (`{ tabs }`) reads as those panes stacked in a column.
 */
export function normaliseDock(n: DockNode | null | undefined, seen = new Set<string>()): DockNode | null {
  if (!n) return null;
  const legacy = (n as { tabs?: unknown }).tabs;
  if (Array.isArray(legacy)) {
    const panes = legacy.filter((t): t is string => typeof t === "string");
    return normaliseDock({ split: "column", sizes: panes.map(() => 1), children: panes.map(pane => ({ pane })) }, seen);
  }
  if (isLeaf(n)) {
    if (seen.has(n.pane)) return null;
    seen.add(n.pane);
    return { pane: n.pane };
  }
  const scaled = rescale(n.sizes, n.children.length);
  const children: DockNode[] = [];
  const sizes: number[] = [];
  n.children.forEach((child, i) => {
    const kept = normaliseDock(child, seen);
    if (!kept) return;
    if (!isLeaf(kept) && kept.split === n.split) {
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
  const strip = (m: DockNode): DockNode | null => {
    if (isLeaf(m)) return drop(m.pane) ? null : m;
    const kept = m.children.map((c, i) => ({ c: strip(c), size: m.sizes[i] ?? 0 })).filter((k): k is { c: DockNode; size: number } => !!k.c);
    return kept.length ? { split: m.split, sizes: kept.map(k => k.size), children: kept.map(k => k.c) } : null;
  };
  return normaliseDock(strip(n));
}

/** The tree with the pane `from` replaced by `to` in its place (production's "change this panel"); `to` leaves any other place. */
export function dockReplace(n: DockNode, from: string, to: string): DockNode | null {
  const swap = (m: DockNode): DockNode => isLeaf(m) ? (m.pane === from ? { pane: to } : m) : { ...m, children: m.children.map(swap) };
  return normaliseDock(swap(dockWithout(n, p => p === to && from !== to) ?? n));
}

/** The tree with `pane` beside the pane `target` (production's "Add panel below / to the right"), or unchanged without it. */
export function dockBeside(n: DockNode, target: string, pane: string, direction: "right" | "below"): DockNode {
  const without = dockWithout(n, p => p === pane) ?? n;
  const put = (m: DockNode): DockNode => isLeaf(m)
    ? (m.pane === target ? { split: direction === "right" ? "row" : "column", sizes: [50, 50], children: [m, { pane }] } : m)
    : { ...m, children: m.children.map(put) };
  return normaliseDock(put(without)) ?? n;
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
    const pane = paneId();
    space();
    if (text[i] === "|") fail("A pane holds one panel (there are no tabs): put the panes in a row(...) or column(...)");
    return { pane };
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
  if (isLeaf(n)) return n.pane;
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
  planning: "row(column(overview 45, my-card 55) 33, objects 37, forge 30)",
  live: "row(column(my-card 45, agents 55) 33, objects 37, column(feed 50, race 50) 30)",
  ended: "row(my-card 28, results 44, race 28)",
  replay: "row(my-card 28, objects 42, column(feed 50, race 50) 30)",
};
const DEFAULT_TREES = Object.fromEntries(DOCK_KINDS.map(k => [k, parseDock(DEFAULT_DOCKS[k])])) as Record<DockKind, DockNode>;
/** A screen's default arrangement (parsed once; the trees are never changed in place). */
export const defaultDock = (kind: DockKind): DockNode => DEFAULT_TREES[kind];

/** Where a pane goes when it is opened; the same four places the pane menu offers. */
export type DockPlace = "main" | "left" | "right" | "bottom";
type Rect = { x: number; y: number; w: number; h: number };
type Leaf = { pane: string; path: number[]; rect: Rect };

/** The panes in reading order, each with its share of the dock (x, y, width and height from 0 to 1). */
export function dockLeaves(n: DockNode, rect: Rect = { x: 0, y: 0, w: 1, h: 1 }, path: number[] = []): Leaf[] {
  if (isLeaf(n)) return [{ pane: n.pane, path, rect }];
  const total = n.sizes.reduce((a, b) => a + b, 0) || 1;
  let at = 0;
  return n.children.flatMap((child, i) => {
    const share = (n.sizes[i] ?? 0) / total;
    const r = n.split === "row" ? { x: rect.x + rect.w * at, y: rect.y, w: rect.w * share, h: rect.h } : { x: rect.x, y: rect.y + rect.h * at, w: rect.w, h: rect.h * share };
    at += share;
    return dockLeaves(child, r, [...path, i]);
  });
}

function replaceAt(n: DockNode, path: readonly number[], f: (m: DockNode) => DockNode): DockNode {
  if (!path.length) return f(n);
  if (isLeaf(n)) return n;
  const [i, ...rest] = path;
  return { ...n, children: n.children.map((c, k) => (k === i ? replaceAt(c, rest, f) : c)) };
}

const EDGE = 1e-6;
/**
 * The pane a place means: the biggest pane for "main", the widest pane along the bottom for "bottom", else the last
 * pane (the lowest) along that edge. The assistant's conversation is passed over while there is another pane: what the
 * assistant opens for the human goes beside something else.
 */
function anchorOf(all: Leaf[], place: DockPlace): Leaf {
  const free = all.filter(l => l.pane !== "assistant");
  const leaves = free.length ? free : all;
  const along = (f: (r: Rect) => boolean) => leaves.filter(l => f(l.rect)).at(-1);
  const bottom = leaves.filter(l => l.rect.y + l.rect.h > 1 - EDGE).reduce<Leaf | undefined>((best, l) => (!best || l.rect.w > best.rect.w + EDGE ? l : best), undefined);
  const edge = place === "left" ? along(r => r.x < EDGE) : place === "right" ? along(r => r.x + r.w > 1 - EDGE) : place === "bottom" ? bottom : undefined;
  return edge ?? leaves.reduce((best, l) => (l.rect.w * l.rect.h > best.rect.w * best.rect.h + EDGE ? l : best));
}

/**
 * The tree with `pane` added at `place` (unchanged when it is already in it): a pane of its own beside the pane at that
 * place, side by side when that pane is wide, else below it, so nothing in view is covered or taken out.
 */
export function dockInsert(n: DockNode | null, pane: string, place: DockPlace): DockNode {
  if (!n) return { pane };
  if (dockPanes(n).includes(pane)) return n;
  const anchor = anchorOf(dockLeaves(n), place);
  const wide = anchor.rect.w * 16 > anchor.rect.h * 9 * 1.6;
  return normaliseDock(replaceAt(n, anchor.path, g => ({ split: wide ? "row" : "column", sizes: [50, 50], children: [g, { pane }] })))!;
}
