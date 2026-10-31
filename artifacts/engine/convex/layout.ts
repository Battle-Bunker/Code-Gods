/**
 * The player client's dock layout (docs/ui-redesign.md §2.3–2.4): one row per human per room in `dockLayouts`.
 *
 *   current({roomId})                       read   the room's layout, or the human's most recent one from another room
 *                                                  with panel parameters reset, or DEFAULT_LAYOUT(phase)
 *   set({roomId, layout, ifUpdatedAt?})     write  a whole layout (a drag, the dropdown, the palette); CONFLICT when
 *                                                  `ifUpdatedAt` is stale, RATE_LIMITED past 12 writes a minute
 *
 * Internal twins `currentAs`/`setAs` take `principal: {credentialId}`; the layout tools' executors use the operation
 * twins below (openPanelAs, setPanelParamsAs, movePaneAs, closePaneAs), each one read-modify-write in a
 * single mutation, so an assistant's change lands on the latest layout and never on a stale client copy. Every
 * operation is the pure function of lib/player-client/src/layout.ts the client also uses; validation never reads game
 * tables (the layout is view state), and built-in panels' parameters are checked against the panel catalogue's schemas.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  DEFAULT_LAYOUT, LAYOUT_LIMITS, LayoutError, activatePane, carryLayout, closePane, panelPanesOf, movePane, openPane, paneCaption, panesOf, parseLayout, resetPanelParams,
  placeSchema, setPanePanel, setPaneParams, type DockLayout, type Pane, type Place,
} from "@workspace/player-client/layout";
import { PANEL_IDS, isPanelId, panelCatalog, parsePanelParams, type PanelId, type Phase } from "@workspace/player-client/panels";
import type { Viewer } from "./auth/access";
import { fail } from "./lib/errors";
import { requireMemberAs, requireRoom } from "./lib/rooms";
import { authorOf, principal, resolveViewer, type Principal } from "./panels/access";

type Ctx = QueryCtx | MutationCtx;
type Row = Doc<"dockLayouts">;
export type LayoutSource = "room" | "carried" | "default";
export type CurrentLayout = {
  layout: DockLayout; warnings: string[]; source: LayoutSource; phase: Phase;
  updatedAt: number | null; setBy: Row["setBy"] | null;
};
export type LayoutChange = { paneId: string; layout: DockLayout; summary: string; reused: boolean };

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value) ?? "").length;

/** The phase of a room as the panels see it: the active game's (recovery counts as paused), `ended` after the last game, else lobby. */
export async function phaseOf(ctx: Ctx, room: Doc<"rooms">): Promise<Phase> {
  const gameId = room.activeGameId ?? room.currentGameId;
  const game = gameId ? await ctx.db.get(gameId) : null;
  if (!game) return "lobby";
  return game.phase === "recovery" ? "paused" : game.phase;
}

async function storedSlugs(ctx: Ctx, subject: string): Promise<string[]> {
  const rows = await ctx.db.query("panels").withIndex("by_subject_slug", q => q.eq("subject", subject)).take(64);
  return rows.filter(p => p.enabled).map(p => p.slug);
}
const rowOf = (ctx: Ctx, subject: string, roomId: Id<"rooms">) =>
  ctx.db.query("dockLayouts").withIndex("by_subject_room", q => q.eq("subject", subject).eq("roomId", roomId)).unique();

/** The caller as a member of the room (read suffices: a layout is the human's own view state). */
async function memberIn(ctx: Ctx, viewer: Viewer, roomRef: string) {
  const room = await requireRoom(ctx, roomRef);
  await requireMemberAs(ctx, viewer, room, "read");
  return room;
}
/** A principal's room: the one its credential is bound to. */
async function roomOf(ctx: Ctx, viewer: Viewer) {
  if (!viewer.roomId) fail("FORBIDDEN", "This connection is not bound to a room");
  return memberIn(ctx, viewer, viewer.roomId);
}

async function currentImpl(ctx: Ctx, viewer: Viewer, room: Doc<"rooms">): Promise<CurrentLayout> {
  const phase = await phaseOf(ctx, room);
  const slugs = await storedSlugs(ctx, viewer.subject);
  const row = await rowOf(ctx, viewer.subject, room._id);
  if (row) {
    const parsed = parseLayout(row.layout, { phase, storedSlugs: slugs });
    // A new game since the row was written: panel parameters named the previous game's objects, so they reset.
    const newGame = !!row.gameId && !!room.activeGameId && row.gameId !== room.activeGameId;
    return { ...parsed, layout: newGame ? resetPanelParams(parsed.layout) : parsed.layout, source: "room", phase, updatedAt: row.updatedAt, setBy: row.setBy };
  }
  const carried = await ctx.db.query("dockLayouts").withIndex("by_subject_updated", q => q.eq("subject", viewer.subject)).order("desc").first();
  if (carried) {
    // Carry (reset parameters, forget who chose) and then parse, so what is returned is exactly what a write would store.
    const parsed = parseLayout(carryLayout(parseLayout(carried.layout, { phase, storedSlugs: slugs }).layout), { phase, storedSlugs: slugs });
    return { ...parsed, source: "carried", phase, updatedAt: null, setBy: null };
  }
  return { layout: DEFAULT_LAYOUT(phase), warnings: [], source: "default", phase, updatedAt: null, setBy: null };
}

/** Write a layout: the rate limit, then insert or patch the row. Returns the new updatedAt. */
async function writeLayout(ctx: MutationCtx, viewer: Viewer, room: Doc<"rooms">, layout: DockLayout, row: Row | null): Promise<number> {
  const now = Date.now();
  const recent = (row?.recent ?? []).filter(at => at > now - 60_000);
  if (recent.length >= LAYOUT_LIMITS.writesPerMinute) fail("RATE_LIMITED", `At most ${LAYOUT_LIMITS.writesPerMinute} layout changes a minute; try again shortly`);
  const setBy = await authorOf(ctx, viewer);
  const fields = { layout, gameId: room.activeGameId as string | undefined, setBy, updatedAt: now, recent: [...recent, now] };
  if (row) await ctx.db.patch(row._id, fields);
  else await ctx.db.insert("dockLayouts", { subject: viewer.subject, roomId: room._id, ...fields });
  return now;
}

/** The caller's layout in a room (see currentImpl). */
export const current = query({
  args: { roomId: v.string() },
  handler: async (ctx, { roomId }): Promise<CurrentLayout> => { const viewer = await resolveViewer(ctx); return currentImpl(ctx, viewer, await memberIn(ctx, viewer, roomId)); },
});
export const currentAs = internalQuery({
  args: { principal },
  handler: async (ctx, { principal: p }): Promise<CurrentLayout> => { const viewer = await resolveViewer(ctx, p); return currentImpl(ctx, viewer, await roomOf(ctx, viewer)); },
});

const setArgs = { roomId: v.string(), layout: v.any(), ifUpdatedAt: v.optional(v.number()) };
async function setImpl(ctx: MutationCtx, viewer: Viewer, room: Doc<"rooms">, args: { layout: unknown; ifUpdatedAt?: number }) {
  if (bytes(args.layout) > LAYOUT_LIMITS.bytes) fail("BAD_REQUEST", `A layout is at most ${LAYOUT_LIMITS.bytes} bytes`);
  const row = await rowOf(ctx, viewer.subject, room._id);
  if (args.ifUpdatedAt !== undefined && row && row.updatedAt !== args.ifUpdatedAt) fail("CONFLICT", "The layout changed elsewhere; take the current one and apply your change again");
  const { layout, warnings } = parseLayout(args.layout, { phase: await phaseOf(ctx, room), storedSlugs: await storedSlugs(ctx, viewer.subject) });
  const updatedAt = await writeLayout(ctx, viewer, room, layout, row);
  return { layout, warnings, updatedAt };
}
/** Store a whole layout (drags, the panel dropdown, the palette). `ifUpdatedAt` makes it compare-and-set. */
export const set = mutation({
  args: setArgs,
  handler: async (ctx, { roomId, ...args }) => { const viewer = await resolveViewer(ctx); return setImpl(ctx, viewer, await memberIn(ctx, viewer, roomId), args); },
});
export const setAs = internalMutation({
  args: { principal, ...setArgs },
  handler: async (ctx, { principal: p, roomId, ...args }) => { const viewer = await resolveViewer(ctx, p); return setImpl(ctx, viewer, await memberIn(ctx, viewer, roomId), args); },
});

// ------------------------------------------------------------------------------------------------
// Operations for the layout tools: read-modify-write in one mutation each
// ------------------------------------------------------------------------------------------------

const refuse = (error: unknown): never => {
  if (error instanceof LayoutError) return fail(error.code, error.message);
  throw error;
};
const placeV = v.optional(v.any());
function parsePlace(raw: unknown): Place | undefined {
  if (raw === undefined || raw === null) return undefined;
  const parsed = placeSchema.safeParse(raw);
  if (!parsed.success) fail("BAD_REQUEST", `Invalid place: ${parsed.error.issues.map(i => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`);
  return parsed.data;
}
function requirePanelId(raw: string): PanelId {
  if (!isPanelId(raw)) fail("BAD_REQUEST", `Unknown panel "${raw.slice(0, 40)}"; the panels are ${PANEL_IDS.join(", ")}`);
  return raw;
}
/** Panel parameters parsed against the panel, or BAD_REQUEST carrying the panel's JSON Schema so the model can correct itself. */
function requireParams(panelId: PanelId, raw: unknown): Record<string, unknown> {
  const parsed = parsePanelParams(panelId, raw);
  if (parsed.ok) return parsed.params;
  const schema = panelCatalog().find(l => l.id === panelId)?.paramsSchema;
  return fail("BAD_REQUEST", `Invalid ${panelId} parameters: ${parsed.issues.join("; ")}. Schema: ${JSON.stringify(schema)}`.slice(0, 4000));
}

/** Load, apply a pure operation, write, and describe the change for the chat chip. */
async function change(ctx: MutationCtx, p: Principal, apply: (layout: DockLayout) => { layout: DockLayout; paneId: string; reused?: boolean }): Promise<LayoutChange> {
  const viewer = await resolveViewer(ctx, p);
  const room = await roomOf(ctx, viewer);
  const before = await currentImpl(ctx, viewer, room);
  let next: { layout: DockLayout; paneId: string; reused?: boolean };
  try { next = apply(before.layout); } catch (error) { return refuse(error); }
  const row = await rowOf(ctx, viewer.subject, room._id);
  await writeLayout(ctx, viewer, room, next.layout, row);
  const pane = next.layout.panes[next.paneId];
  return { paneId: next.paneId, layout: next.layout, summary: pane ? paneCaption(pane) : "closed", reused: next.reused ?? false };
}

/** A built-in panel the assistant chose, with its parameters: reuse, switch or open (see openPanelAs). */
function showBuiltIn(layout: DockLayout, panelId: PanelId, params: Record<string, unknown>, place: Place | undefined) {
  if (!place) {
    const panels = panelPanesOf(layout);
    const open = panels.find(pane => pane.panelId === panelId);
    if (open) return { layout: activatePane(setPaneParams(layout, open.id, params, "assistant"), open.id), paneId: open.id, reused: true };
    const target = panels.find(pane => pane.setBy === "default") ?? panels.filter(pane => pane.setBy === "assistant").at(-1);
    if (target) return { layout: activatePane(setPanePanel(layout, target.id, panelId, "assistant", params), target.id), paneId: target.id, reused: false };
  }
  const pane: Pane = { id: "", kind: "panel", panelId, params, setBy: "assistant" };
  return openPane(layout, pane, place);
}

/**
 * Show a panel (the open_panel tool): exactly one of `panelId` (built-in) and `slug` (one of the human's stored panels).
 *
 * Built-in, with parameters the assistant chose. Without `place`, no pane is added: an open pane of that panel is
 * reused (its parameters replaced, its tab activated); else a built-in panel nobody chose (setBy default) or one the
 * assistant set earlier is switched to it (the player's own choices are never overridden); only when every built-in
 * panel is the player's does a new pane open. The assistant adds panes only when asked, with `place`.
 *
 * Stored: without `place`, an open pane of that panel is activated; else it opens in a new pane.
 */
export const openPanelAs = internalMutation({
  args: { principal, panelId: v.optional(v.string()), slug: v.optional(v.string()), params: v.optional(v.any()), place: placeV },
  handler: async (ctx, { principal: p, panelId: rawPanel, slug, params: rawParams, place: rawPlace }): Promise<LayoutChange> => {
    if ((rawPanel === undefined) === (slug === undefined)) fail("BAD_REQUEST", "Give exactly one of panelId (a built-in panel) and slug (a stored panel)");
    const place = parsePlace(rawPlace);
    if (rawPanel !== undefined) {
      const panelId = requirePanelId(rawPanel);
      const params = requireParams(panelId, rawParams);
      return change(ctx, p, layout => showBuiltIn(layout, panelId, params, place));
    }
    const storedSlug = slug!;
    if (rawParams !== undefined) fail("BAD_REQUEST", "A stored panel takes no params; they are for built-in panels");
    const viewer = await resolveViewer(ctx, p);
    const panel = await ctx.db.query("panels").withIndex("by_subject_slug", q => q.eq("subject", viewer.subject).eq("slug", storedSlug)).unique();
    if (!panel) fail("NOT_FOUND", `No stored panel "${storedSlug.slice(0, 60)}"`);
    if (!panel.enabled) fail("CONFLICT", `Panel "${storedSlug}" is turned off (panels.setEnabled)`);
    return change(ctx, p, layout => {
      const open = place ? undefined : panesOf(layout).find(pane => pane.kind === "stored-panel" && pane.slug === storedSlug);
      if (open) return { layout: activatePane(layout, open.id), paneId: open.id, reused: true };
      return openPane(layout, { id: "", kind: "stored-panel", slug: storedSlug }, place);
    });
  },
});

export const setPanelParamsAs = internalMutation({
  args: { principal, paneId: v.string(), params: v.any() },
  handler: async (ctx, { principal: p, paneId, params }): Promise<LayoutChange> => change(ctx, p, layout => {
    const pane = layout.panes[paneId];
    if (!pane) throw new LayoutError("NOT_FOUND", `No pane ${paneId}`);
    if (pane.kind !== "panel") throw new LayoutError("BAD_REQUEST", `Pane ${paneId} shows ${paneCaption(pane)}, not a built-in panel`);
    return { layout: activatePane(setPaneParams(layout, paneId, requireParams(pane.panelId, params), "assistant"), paneId), paneId };
  }),
});

export const movePaneAs = internalMutation({
  args: { principal, paneId: v.string(), place: v.any() },
  handler: async (ctx, { principal: p, paneId, place: rawPlace }): Promise<LayoutChange> => {
    const place = parsePlace(rawPlace) ?? fail("BAD_REQUEST", "A place is required: {direction, relativeTo?}");
    return change(ctx, p, layout => ({ layout: movePane(layout, paneId, place), paneId }));
  },
});

export const closePaneAs = internalMutation({
  args: { principal, paneId: v.string() },
  handler: async (ctx, { principal: p, paneId }): Promise<LayoutChange> => change(ctx, p, layout => ({ layout: closePane(layout, paneId), paneId })),
});
