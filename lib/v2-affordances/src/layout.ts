/**
 * View operations (client affordances) as one pure reducer over the human's view state, the part of their layout
 * (`v2Layouts` pane params) the directory's view operations change. The same reducer runs in the browser (a button,
 * the palette) and on the server (an assistant or an MCP credential acting for the human, through `defineViewOps`),
 * and every open client of that human renders the stored result, so a remote assistant changes what the human sees.
 */
import { z } from "zod/v4";
import { AFFORDANCES, refusal, type AffordanceOf, type ClientAffordanceId, type Via } from "./directory.ts";
import { OpFailure, type OpOutcome } from "./server.ts";
import type { AffordanceContext } from "./types.ts";

export type Place = "main" | "left" | "right" | "bottom";
export interface ViewState {
  /** Bumped by every change; returned to the caller as `layoutVersion`. */
  version: number;
  /** Open panes in order, each at a place. */
  panes: { pane: string; place: Place }[];
  /** The representation compact faces use, per rule family, "*" for every object. Replaces per-device pins. */
  pins: Record<string, string>;
  objects: { sort: "points" | "level" | "recent"; filter: { mine?: boolean; minLevel?: number } };
  /**
   * The object whose expanded face is open, and the representations it shows side by side (one when switched; none:
   * every representation the viewer's rule depends on, the expanded face's default).
   */
  focus: { objectId: string; reps: string[] } | null;
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

export const EMPTY_VIEW: ViewState = {
  version: 0, panes: [], pins: {}, objects: { sort: "points", filter: {} }, focus: null, glossary: null, replay: null,
};

/** The representation a compact face of this family shows: the family's pin, else the global pin, else the default. */
export function pinnedRep(view: ViewState, family: string, fallback: string): string {
  const own = (k: string) => Object.hasOwn(view.pins, k) ? view.pins[k] : undefined;
  return own(family) ?? own("*") ?? fallback;
}

/** View operations the layout performs; signing in is the auth client's, not the layout's. */
export type ViewOpId = Exclude<ClientAffordanceId, "account.signIn">;
type Args<Id extends ViewOpId> = z.output<AffordanceOf<Id>["params"]>;
type Reducer<Id extends ViewOpId> = (v: ViewState, args: Args<Id>) => Omit<ViewState, "version">;

/** Opens a pane, or moves it when a place is given; an open pane keeps its position in the order. */
const openPane = (v: ViewState, pane: string, place?: Place) =>
  v.panes.some(p => p.pane === pane)
    ? v.panes.map(p => p.pane === pane && place ? { ...p, place } : p)
    : [...v.panes, { pane, place: place ?? "main" }];
const replayOf = (v: ViewState) => {
  if (!v.replay) throw new OpFailure("Open a replay first.", "replay.open");
  return v.replay;
};

export const VIEW_REDUCERS: { [Id in ViewOpId]: Reducer<Id> } = {
  "view.openPane": (v, a) => ({ ...v, panes: openPane(v, a.pane, a.place) }),
  // Closing the object or replay pane closes what it showed, so nothing acts on a pane the human cannot see.
  "view.closePane": (v, a) => ({
    ...v, panes: v.panes.filter(p => p.pane !== a.pane),
    ...(a.pane === "object" ? { focus: null } : {}), ...(a.pane === "replay" ? { replay: null } : {}),
  }),
  "view.movePane": (v, a) => {
    if (!v.panes.some(p => p.pane === a.pane)) throw new OpFailure(`The ${a.pane} pane is not open.`, "view.openPane");
    return { ...v, panes: v.panes.map(p => p.pane === a.pane ? { ...p, place: a.place } : p) };
  },
  "view.pinRepresentation": (v, a) => ({ ...v, pins: { ...v.pins, [a.family ?? "*"]: a.rep } }),
  "view.showRepresentation": (v, a) => ({ ...v, focus: { objectId: a.objectId, reps: [a.rep] }, panes: openPane(v, "object") }),
  "view.compareRepresentations": (v, a) => ({ ...v, focus: { objectId: a.objectId, reps: [...new Set(a.reps)] }, panes: openPane(v, "object") }),
  "view.openObject": (v, a) => ({ ...v, focus: { objectId: a.objectId, reps: v.focus?.objectId === a.objectId ? v.focus.reps : [] }, panes: openPane(v, "object") }),
  "view.sortObjects": (v, a) => ({ ...v, objects: { ...v.objects, sort: a.sort } }),
  "view.filterObjects": (v, a) => ({ ...v, objects: { ...v.objects, filter: { ...(a.mine !== undefined ? { mine: a.mine } : {}), ...(a.minLevel !== undefined ? { minLevel: a.minLevel } : {}) } } }),
  "view.showGlossary": (v, a) => ({ ...v, glossary: a.term ?? "" }),
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
    const { version: _, ...reduced } = { ...(VIEW_REDUCERS[id] as Reducer<ViewOpId>)(view, parsed.data as never), version: 0 };
    const { version: __, ...before } = view;
    if (JSON.stringify(reduced) === JSON.stringify(before)) return { outcome: { ok: true, result: { ok: true, layoutVersion: view.version } }, view, changed: false };
    const next = { ...reduced, version: view.version + 1 };
    return { outcome: { ok: true, result: { ok: true, layoutVersion: next.version } }, view: next, changed: true };
  } catch (e) {
    if (!(e instanceof OpFailure)) throw e;
    return fail({ ok: false, error: { code: "failed", message: e.message, ...(e.fix ? { fix: e.fix } : {}) } });
  }
}
