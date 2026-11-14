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
  /** The object whose expanded face is open, and the representations it shows side by side (one when switched). */
  focus: { objectId: string; reps: string[] } | null;
  /** The glossary open at a term ("" for its index), or closed. */
  glossary: string | null;
  replay: { gameId: string; seq: number; worldSeconds: number | null; playing: boolean; speed: number } | null;
}

export const EMPTY_VIEW: ViewState = {
  version: 0, panes: [], pins: {}, objects: { sort: "points", filter: {} }, focus: null, glossary: null, replay: null,
};

/** The representation a compact face of this family shows: the family's pin, else the global pin, else the default. */
export function pinnedRep(view: ViewState, family: string, fallback: string): string {
  return view.pins[family] ?? view.pins["*"] ?? fallback;
}

/** View operations the layout performs; signing in is the auth client's, not the layout's. */
export type ViewOpId = Exclude<ClientAffordanceId, "account.signIn">;
type Args<Id extends ViewOpId> = z.output<AffordanceOf<Id>["params"]>;
type Reducer<Id extends ViewOpId> = (v: ViewState, args: Args<Id>) => Omit<ViewState, "version">;

const openPane = (v: ViewState, pane: string, place?: Place) => {
  const at = v.panes.find(p => p.pane === pane);
  const rest = v.panes.filter(p => p.pane !== pane);
  return [...rest, { pane, place: place ?? at?.place ?? "main" }];
};
const replayOf = (v: ViewState) => {
  if (!v.replay) throw new OpFailure("Open a replay first.", "replay.open");
  return v.replay;
};

export const VIEW_REDUCERS: { [Id in ViewOpId]: Reducer<Id> } = {
  "view.openPane": (v, a) => ({ ...v, panes: openPane(v, a.pane, a.place) }),
  "view.closePane": (v, a) => ({ ...v, panes: v.panes.filter(p => p.pane !== a.pane) }),
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
  "replay.open": (v, a) => ({ ...v, replay: { gameId: a.gameId, seq: 0, worldSeconds: null, playing: false, speed: 1 }, panes: openPane(v, "replay") }),
  "replay.play": v => ({ ...v, replay: { ...replayOf(v), playing: true } }),
  "replay.pause": v => ({ ...v, replay: { ...replayOf(v), playing: false } }),
  "replay.seek": (v, a) => {
    const r = replayOf(v);
    if (a.seq === undefined && a.worldSeconds === undefined) throw new OpFailure("Give an event number or a world time.");
    return { ...v, replay: { ...r, seq: a.seq ?? r.seq, worldSeconds: a.worldSeconds ?? null } };
  },
  "replay.step": (v, a) => { const r = replayOf(v); return { ...v, replay: { ...r, seq: Math.max(0, r.seq + a.by), worldSeconds: null, playing: false } }; },
  "replay.speed": (v, a) => ({ ...v, replay: { ...replayOf(v), speed: a.speed } }),
};

export function isViewOp(id: string): id is ViewOpId {
  return Object.hasOwn(VIEW_REDUCERS, id);
}

/**
 * Applies one view operation for a caller, with the same checks as a server affordance: args validated, `refusal`
 * (context, caller, grant, consent), then the reducer. Returns the outcome and the new state (unchanged on failure).
 */
export function applyView(view: ViewState, id: string, raw: unknown, ctx: AffordanceContext, via: Via = "app"): { outcome: OpOutcome; view: ViewState } {
  if (!isViewOp(id)) return { outcome: { ok: false, error: { code: "unknown", message: `${id} is not a view operation.` } }, view };
  const a = AFFORDANCES[id];
  const parsed = a.params.safeParse(raw ?? {});
  if (!parsed.success) return { outcome: { ok: false, error: { code: "invalid_args", message: z.prettifyError(parsed.error) } }, view };
  const no = refusal(a, ctx, parsed.data as Record<string, unknown>, via);
  if (no) return { outcome: { ok: false, error: { code: "refused", message: no.reason, ...(no.fix ? { fix: no.fix } : {}) } }, view };
  try {
    const next = { ...(VIEW_REDUCERS[id] as Reducer<ViewOpId>)(view, parsed.data as never), version: view.version + 1 };
    return { outcome: { ok: true, result: { ok: true, layoutVersion: next.version } }, view: next };
  } catch (e) {
    if (!(e instanceof OpFailure)) throw e;
    return { outcome: { ok: false, error: { code: "failed", message: e.message, ...(e.fix ? { fix: e.fix } : {}) } }, view };
  }
}
