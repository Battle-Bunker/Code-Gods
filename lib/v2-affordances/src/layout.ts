/**
 * View operations (client affordances) as one pure reducer over the human's view state, the part of their layout
 * (`v2Layouts` pane params) the directory's view operations change. The same reducer runs in the browser (a button,
 * the palette) and on the server (an assistant or an MCP credential acting for the human, through `defineViewOps`),
 * and every open client of that human renders the stored result, so a remote assistant changes what the human sees.
 */
import { z } from "zod/v4";
import type { ObjectsShow, ObjectsSort } from "./objects-view.ts";
import { AFFORDANCES, refusal, type AffordanceOf, type ClientAffordanceId, type Via } from "./directory.ts";
import { OpFailure, type OpOutcome } from "./server.ts";
import type { AffordanceContext } from "./types.ts";
import { DockSyntaxError, defaultDock, dockActivate, dockGroups, dockInsert, dockKindOf, dockPanes, dockWithout, parseDock, type DockKind, type DockNode } from "./dock.ts";

export type Place = "main" | "left" | "right" | "bottom";

export interface ViewState {
  /** Bumped by every change; returned to the caller as `layoutVersion`. */
  version: number;
  /** Open panes in order, each at a place. */
  panes: { pane: string; place: Place }[];
  /**
   * The desktop dock's arrangement per game screen (`view.arrangeDock`; dock.ts), absent where the human has not
   * arranged it (the screen's default). It holds geometry only: which panes show is `panes`; a shown pane it lacks joins
   * at its place, and a pane it has that is not shown is left out. Moving or closing a pane takes it out of every
   * arrangement, so a moved pane joins at its new place. Rows stored before the dock lacked it: read as `{}`.
   */
  dock: Partial<Record<DockKind, DockNode>>;
  /** The representation compact faces use, per rule family, "*" for every object. Replaces per-device pins. */
  pins: Record<string, string>;
  objects: { sort: ObjectsSort; filter: { mine?: boolean; minBits?: number; show?: ObjectsShow } };
  /**
   * The object whose expanded face is open, and the representations it shows side by side (one when switched; none:
   * every representation the viewer's rule depends on, the expanded face's default).
   */
  focus: { objectId: string; reps: string[]; from?: string } | null;
  /** The pane shown over the others on the desktop dock (view.maximisePane); absent or null: none. */
  maximised?: string | null;
  /** The glossary open at a term ("" for its index), or closed. */
  glossary: string | null;
  /** The replay open on screen; `as`: the player whose eyes it is watched through (absent: the human's own seat). */
  replay: { gameId: string; cursor: ReplayCursor; playing: boolean; speed: number; as?: string } | null;
}

/**
 * Where a replay is: an event number, or a world time plus a number of events after it. The replay pane, which holds
 * the events, resolves a time to the first event at or after it and then moves `plus` events (clamped to the game).
 */
export type ReplayCursor = { seq: number } | { worldSeconds: number; plus: number };

/** The glossary's page for "How scoring works" (view.showScoring): not a term, so no request for a term opens it. */
export const SCORING_PAGE = "@scoring";

export const EMPTY_VIEW: ViewState = {
  version: 0, panes: [], dock: {}, pins: {}, objects: { sort: "points", filter: {} }, focus: null, glossary: null, replay: null,
};

/** The representation a compact face of this family shows: the family's pin, else the global pin, else the default. */
export function pinnedRep(view: ViewState, family: string, fallback: string): string {
  const own = (k: string) => Object.hasOwn(view.pins, k) ? view.pins[k] : undefined;
  return own(family) ?? own("*") ?? fallback;
}

/** View operations the layout performs; signing in is the auth client's, not the layout's. */
export type ViewOpId = Exclude<ClientAffordanceId, "account.signIn">;
type Args<Id extends ViewOpId> = z.output<AffordanceOf<Id>["params"]>;
type Reducer<Id extends ViewOpId> = (v: ViewState, args: Args<Id>, ctx: AffordanceContext) => Omit<ViewState, "version">;

/** Opens a pane, or moves it when a place is given; an open pane keeps its position in the order. */
const openPane = (v: ViewState, pane: string, place?: Place) =>
  v.panes.some(p => p.pane === pane)
    ? v.panes.map(p => p.pane === pane && place ? { ...p, place } : p)
    : [...v.panes, { pane, place: place ?? "main" }];

/** Every arrangement changed by `f`; one left empty goes (that screen shows its default again). */
function eachDock(v: ViewState, f: (n: DockNode) => DockNode | null): ViewState["dock"] {
  const out: ViewState["dock"] = {};
  for (const [kind, n] of Object.entries(v.dock) as [DockKind, DockNode][]) { const next = f(n); if (next) out[kind] = next; }
  return out;
}
/** Takes a pane out of every arrangement (it joins again at its place while shown). */
const undock = (v: ViewState, pane: string) => eachDock(v, n => dockWithout(n, p => p === pane));
/**
 * `dock` with `pane` placed and shown in the arrangement of the screen in view (that screen's default when the human
 * has none yet); outside a game screen nothing changes (the pane joins at its place when a game shows it).
 */
function placed(dock: ViewState["dock"], pane: string, place: Place, ctx: AffordanceContext, show = true): ViewState["dock"] {
  const kind = dockKindOf(ctx.context);
  if (!kind) return dock;
  const tree = dock[kind] ?? defaultDock(kind);
  // A pane the arrangement already places (a default the panes list did not hold yet) stays where it is, behind or in front.
  if (dockPanes(tree).includes(pane)) return dock;
  return { ...dock, [kind]: dockInsert(tree, pane, place, show) };
}
/**
 * Opening `pane`: it joins the open panes and, unless the screen in view already places it, is shown there at its place,
 * nothing taken away to make room; an open one given a place moves there (out of every arrangement, then placed), and an
 * open one without a place comes to the front of its tab group.
 */
function opened(v: ViewState, pane: string, place: Place | undefined, ctx: AffordanceContext): Omit<ViewState, "version"> {
  const open = v.panes.some(p => p.pane === pane);
  const panes = openPane(v, pane, place);
  const at = panes.find(p => p.pane === pane)!.place;
  if (open && !place) {
    // In front wherever it is arranged; on the screen in view, placed first if that arrangement lacks it.
    const dock = eachDock(v, n => dockActivate(n, pane)), kind = dockKindOf(ctx.context);
    return { ...v, panes, dock: kind && !dockPanes(dock[kind] ?? defaultDock(kind)).includes(pane) ? placed(dock, pane, at, ctx) : dock };
  }
  // A pane opened at a place joins that place behind the tab shown there (the panes on screen, stored before a change,
  // keep their tabs); without a place, or moved, it comes to the front. The assistant always does: a conversation
  // opened to talk in is no use behind a tab.
  return { ...v, panes, dock: placed(open ? undock(v, pane) : v.dock, pane, at, ctx, open || !place || pane === "assistant") };
}
/**
 * The arrangements after closing `pane`: out of the screen in view's (other screens keep its place there for when it is
 * shown again; while closed it is left out); out of every one outside a game screen.
 */
function closed(v: ViewState, pane: string, ctx: AffordanceContext): ViewState["dock"] {
  const kind = dockKindOf(ctx.context);
  if (!kind) return undock(v, pane);
  const { [kind]: tree, ...rest } = v.dock;
  const left = tree && dockWithout(tree, p => p === pane);
  return left ? { ...rest, [kind]: left } : rest;
}
const replayOf = (v: ViewState) => {
  if (!v.replay) throw new OpFailure("Open a replay first.", "replay.open");
  return v.replay;
};

/**
 * Whether a pane the arrangement names is open: the human's open panes once they have any (the arrangement keeps a
 * closed pane's place, but it is not drawn); every pane of a screen still at its defaults.
 */
const isOpen = (v: ViewState) => (pane: string) => !v.panes.length || v.panes.some(p => p.pane === pane);
/** The game screen in view, whose dock a layout command changes. */
function screenOf(ctx: AffordanceContext): DockKind {
  const kind = dockKindOf(ctx.context);
  if (!kind) throw new OpFailure("Open a game first: only a game screen has a dock.");
  return kind;
}
/** v1's "Two panels": the first two shown panes stacked on the left; every other pane as tabs of one group on the right. */
function twoPanels(v: ViewState, tree: DockNode): DockNode {
  const open = isOpen(v);
  const panes = [...dockPanes(tree).filter(open), ...v.panes.map(p => p.pane).filter(p => !dockPanes(tree).includes(p))];
  const shown = [...dockGroups(tree).map(l => l.group.active).filter(open), ...panes];
  const left = [...new Set(shown)].slice(0, 2);
  const rest = panes.filter(p => !left.includes(p));
  const stack: DockNode = left.length < 2 ? { tabs: left, active: left[0]! } : { split: "column", sizes: [50, 50], children: left.map(p => ({ tabs: [p], active: p })) };
  if (!rest.length) return stack;
  return { split: "row", sizes: [40, 60], children: [stack, { tabs: rest, active: shown.find(p => rest.includes(p)) ?? rest[0]! }] };
}

export const VIEW_REDUCERS: { [Id in ViewOpId]: Reducer<Id> } = {
  "view.openPane": (v, a, ctx) => opened(v, a.pane, a.place, ctx),
  // Closing the object or replay pane closes what it showed, so nothing acts on a pane the human cannot see.
  "view.closePane": (v, a, ctx) => ({
    ...v, panes: v.panes.filter(p => p.pane !== a.pane), dock: closed(v, a.pane, ctx),
    ...(a.pane === "object" ? { focus: null } : {}), ...(a.pane === "replay" ? { replay: null } : {}),
    ...(v.maximised === a.pane ? { maximised: null } : {}),
  }),
  "view.movePane": (v, a, ctx) => {
    if (!v.panes.some(p => p.pane === a.pane)) throw new OpFailure(`The ${a.pane} pane is not open.`, "view.openPane");
    return opened(v, a.pane, a.place, ctx);
  },
  "view.arrangeDock": (v, a, ctx) => {
    const kind = a.phase ?? dockKindOf(ctx.context);
    if (!kind) throw new OpFailure("Say which screen's dock to arrange: planning, live, ended or replay.");
    const { [kind]: _old, ...rest } = v.dock;
    if (!a.dock.trim()) return { ...v, dock: rest };
    try {
      let tree = parseDock(a.dock);
      // An assistant (a delegated caller) arranging the screen keeps its own conversation in front, as the human had it.
      const before = v.dock[kind] ?? defaultDock(kind);
      if (ctx.grant && dockGroups(before).some(l => l.group.active === "assistant") && dockPanes(tree).includes("assistant")) tree = dockActivate(tree, "assistant");
      return { ...v, dock: { ...rest, [kind]: tree } };
    }
    catch (e) { if (e instanceof DockSyntaxError) throw new OpFailure(e.message); throw e; }
  },
  "view.maximisePane": (v, a, ctx) => {
    const { maximised: now, ...rest } = v;
    if (a.pane ? now === a.pane : now) return rest;
    if (a.pane) return { ...rest, maximised: a.pane };
    const kind = screenOf(ctx);
    const groups = dockGroups(v.dock[kind] ?? defaultDock(kind)).filter(l => isOpen(v)(l.group.active));
    if (!groups.length) throw new OpFailure("Name the pane to maximise.");
    const largest = groups.reduce((best, l) => (l.rect.w * l.rect.h > best.rect.w * best.rect.h ? l : best));
    return { ...rest, maximised: largest.group.active };
  },
  "view.twoPanels": (v, _a, ctx) => {
    const kind = screenOf(ctx);
    return { ...v, dock: { ...v.dock, [kind]: twoPanels(v, v.dock[kind] ?? defaultDock(kind)) } };
  },
  "view.resetLayout": (v, _a, ctx) => {
    const { [screenOf(ctx)]: _old, ...rest } = v.dock;
    return { ...v, dock: rest };
  },
  "view.pinRepresentation": (v, a) => ({ ...v, pins: { ...v.pins, [a.family ?? "*"]: a.rep } }),
  "view.showRepresentation": (v, a, ctx) => ({ ...opened(v, "object", undefined, ctx), focus: { objectId: a.objectId, reps: [a.rep] } }),
  "view.compareRepresentations": (v, a, ctx) => ({ ...opened(v, "object", undefined, ctx), focus: { objectId: a.objectId, reps: [...new Set(a.reps)] } }),
  "view.openObject": (v, a, ctx) => ({ ...opened(v, "object", undefined, ctx), focus: { objectId: a.objectId, reps: v.focus?.objectId === a.objectId ? v.focus.reps : [], ...(a.from ? { from: a.from } : {}) } }),
  "view.sortObjects": (v, a) => ({ ...v, objects: { ...v.objects, sort: a.sort } }),
  "view.filterObjects": (v, a) => ({ ...v, objects: { ...v.objects, filter: { ...(a.mine !== undefined ? { mine: a.mine } : {}), ...(a.minBits !== undefined ? { minBits: a.minBits } : {}), ...(a.show !== undefined && a.show !== "all" ? { show: a.show } : {}) } } }),
  "view.showGlossary": (v, a) => ({ ...v, glossary: a.term ?? "" }),
  "view.showScoring": v => ({ ...v, glossary: SCORING_PAGE }),
  "view.closeGlossary": v => ({ ...v, glossary: null }),
  "replay.open": (v, a) => ({ ...v, replay: { gameId: a.gameId, cursor: { seq: 0 }, playing: false, speed: 1 }, panes: openPane(v, "replay") }),
  "replay.play": v => ({ ...v, replay: { ...replayOf(v), playing: true } }),
  "replay.pause": v => ({ ...v, replay: { ...replayOf(v), playing: false } }),
  "replay.seek": (v, a) => {
    const r = replayOf(v);
    if ((a.seq === undefined) === (a.worldSeconds === undefined)) throw new OpFailure("Give an event number or a world time, not both.");
    return { ...v, replay: { ...r, cursor: a.seq !== undefined ? { seq: a.seq } : { worldSeconds: a.worldSeconds!, plus: 0 } } };
  },
  "replay.step": (v, a) => {
    const r = replayOf(v), c = r.cursor;
    return { ...v, replay: { ...r, playing: false, cursor: "seq" in c ? { seq: Math.max(0, c.seq + a.by) } : { ...c, plus: c.plus + a.by } } };
  },
  "replay.speed": (v, a) => ({ ...v, replay: { ...replayOf(v), speed: a.speed } }),
  "replay.watchAs": (v, a) => ({ ...v, replay: { ...replayOf(v), as: a.memberId } }),
};

/** A stored view as the reducers read it (rows stored before the dock have none). */
export const withDock = (view: ViewState): ViewState => (view.dock ? view : { ...view, dock: {} });

export function isViewOp(id: string): id is ViewOpId {
  return Object.hasOwn(VIEW_REDUCERS, id);
}

/**
 * Applies one view operation for a caller, with the same checks as a server affordance: args validated, `refusal`
 * (context, caller, grant, consent), then the reducer. Returns the outcome, the new state (unchanged on failure) and
 * whether it changed: an operation that changes nothing keeps the version, and the host need not write it.
 */
export function applyView(view: ViewState, id: string, raw: unknown, ctx: AffordanceContext, via: Via = "app"): { outcome: OpOutcome; view: ViewState; changed: boolean } {
  const fail = (outcome: OpOutcome) => ({ outcome, view, changed: false });
  if (!isViewOp(id)) return fail({ ok: false, error: { code: "unknown", message: `${id} is not a view operation.` } });
  const a = AFFORDANCES[id];
  const parsed = a.params.safeParse(raw ?? {});
  if (!parsed.success) return fail({ ok: false, error: { code: "invalid_args", message: z.prettifyError(parsed.error) } });
  const no = refusal(a, ctx, parsed.data as Record<string, unknown>, via);
  if (no) return fail({ ok: false, error: { code: "refused", message: no.reason, ...(no.fix ? { fix: no.fix } : {}) } });
  try {
    const { version: _, ...reduced } = { ...(VIEW_REDUCERS[id] as Reducer<ViewOpId>)(withDock(view), parsed.data as never, ctx), version: 0 };
    const { version: __, ...before } = withDock(view);
    if (JSON.stringify(reduced) === JSON.stringify(before)) return { outcome: { ok: true, result: { ok: true, layoutVersion: view.version } }, view, changed: false };
    const next = { ...reduced, version: view.version + 1 };
    return { outcome: { ok: true, result: { ok: true, layoutVersion: next.version } }, view: next, changed: true };
  } catch (e) {
    if (!(e instanceof OpFailure)) throw e;
    return fail({ ok: false, error: { code: "failed", message: e.message, ...(e.fix ? { fix: e.fix } : {}) } });
  }
}
