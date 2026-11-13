/**
 * The panel bridge protocol: postMessage between the player client (host) and a stored panel's sandboxed frame
 * (src/frame/runtime.tsx). Pure: shared by both builds and the unit tests.
 *
 *   frame → host   ready | subscribe {id, name, args, hz} | unsubscribe {id} | command {id, envelope}
 *                  | calibration {id} | resize {height} | status {status, message?}      (each carries `nonce`)
 *   host → frame   boot {room, panel, theme} | load {panel} | data {id, value} | error {id, message}
 *                  | result {id, ok, value | message}
 *
 * The frame may read only the queries the SDK itself uses, always for the host's current room (BRIDGE_QUERIES
 * rewrites every argument), and submit commands through the host, which may ask the player first.
 */
import { OBJECT_FILTERS, OBJECT_PAGE_MAX, OBJECT_SORTS } from "@workspace/player-client/objects-page";

export type QueryName = "player.observation" | "player.events" | "player.myUtility" | "player.trajectories" | "player.objectsPage" | "rooms.get"
  | "player.objectIds" | "player.object" | "player.objectsTop" | "player.objectRank" | "player.totals" | "player.staleCount"
  | "dock.state" | "dock.agents" | "dock.transformations" | "dock.agentSeries" | "games.standings" | "games.standingsHistory" | "rooms.chat";

const int = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : fallback;
/** An id argument (a game's or an object's): a short string, else the query is refused. */
const id = (value: unknown) => (typeof value === "string" && value.length > 0 && value.length <= 64 ? value : null);
const sortOf = (value: unknown) => OBJECT_SORTS.find(s => s === value) ?? "payoff";
/** The per-god read model's queries read only the viewer's own rows (engine player.ts), whatever game or object is named. */
const objectCursor = (after: unknown) => {
  const a = after as { key?: unknown; at?: unknown } | null | undefined;
  return a && (a.key === null || (typeof a.key === "number" && Number.isFinite(a.key))) && typeof a.at === "number" && Number.isFinite(a.at)
    ? { after: { key: a.key as number | null, at: a.at } } : {};
};

/** Allowed queries → the arguments the host actually sends (null: refused). The room is always the host's. */
export const BRIDGE_QUERIES: Record<QueryName, (args: Record<string, unknown>, roomId: string) => Record<string, unknown> | null> = {
  "player.observation": (_args, roomId) => ({ roomId }),
  "player.events": (args, roomId) => ({ roomId, limit: int(args.limit, 1, 50, 20) }),
  "player.myUtility": (_args, roomId) => ({ roomId }),
  "player.trajectories": (args, roomId) => typeof args.gameId === "string" && args.gameId.length <= 64
    ? { roomId, gameId: args.gameId, afterSeq: int(args.afterSeq, -1, Number.MAX_SAFE_INTEGER, -1), limit: int(args.limit, 1, 200, 200),
      ...(typeof args.upTo === "number" && Number.isFinite(args.upTo) ? { upTo: int(args.upTo, -1, Number.MAX_SAFE_INTEGER, -1) } : {}) }
    : null,
  "player.objectsPage": (args, roomId) => {
    const after = args.after as { key?: unknown; id?: unknown } | null | undefined;
    return {
      roomId, sort: OBJECT_SORTS.find(s => s === args.sort) ?? "payoff", filter: OBJECT_FILTERS.find(f => f === args.filter) ?? "all",
      limit: int(args.limit, 1, OBJECT_PAGE_MAX, 12),
      ...(after && typeof after.key === "number" && Number.isFinite(after.key) && typeof after.id === "string" && after.id.length <= 64 ? { after: { key: after.key, id: after.id } } : {}),
    };
  },
  "rooms.get": (_args, roomId) => ({ room: roomId }),
  "player.objectIds": args => {
    const gameId = id(args.gameId);
    return gameId ? { gameId, sort: sortOf(args.sort), filter: OBJECT_FILTERS.find(f => f === args.filter) ?? "all", limit: int(args.limit, 1, 90, 30), ...objectCursor(args.after) } : null;
  },
  "player.object": args => { const objectId = id(args.objectId); return objectId ? { objectId } : null; },
  "player.objectsTop": args => {
    const gameId = id(args.gameId);
    return gameId ? { gameId, by: sortOf(args.by), n: int(args.n, 1, 20, 10), ...(args.dir === "asc" ? { dir: "asc" } : {}) } : null;
  },
  "player.objectRank": args => { const objectId = id(args.objectId); return objectId ? { objectId } : null; },
  "player.totals": args => { const gameId = id(args.gameId); return gameId ? { gameId } : null; },
  "player.staleCount": args => { const gameId = id(args.gameId); return gameId ? { gameId } : null; },
  "dock.state": (_args, roomId) => ({ roomId }),
  "dock.agents": (_args, roomId) => ({ roomId }),
  "dock.transformations": (args, roomId) => ({ roomId, ...(args.limit !== undefined ? { limit: int(args.limit, 1, 90, 90) } : {}) }),
  "dock.agentSeries": args => { const gameId = id(args.gameId); return gameId ? { gameId, ...after(args.after) } : null; },
  "games.standings": args => { const gameId = id(args.gameId); return gameId ? { gameId } : null; },
  "games.standingsHistory": args => { const gameId = id(args.gameId); return gameId ? { gameId, ...after(args.after) } : null; },
  // The host's room's chat, the newest page only (a dock shows the latest messages).
  "rooms.chat": (args, roomId) => {
    const o = args.paginationOpts as { numItems?: unknown } | undefined;
    return { roomId, paginationOpts: { numItems: int(o?.numItems, 1, 90, 50), cursor: null } };
  },
};
/** A series cursor (world time or seq): a finite number, else from the start. */
function after(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? { after: value } : {}; }
export const isQueryName = (name: unknown): name is QueryName => typeof name === "string" && Object.hasOwn(BRIDGE_QUERIES, name);

export const DEFAULT_HZ = 2;
export const MAX_HZ = 5;
export const clampHz = (hz: unknown) => Math.min(MAX_HZ, Math.max(0.2, typeof hz === "number" && Number.isFinite(hz) ? hz : DEFAULT_HZ));

export type BridgeRoom = { roomId: string; permission: "read" | "act" | "owner"; mode: "devserver" | "site" };
/** `version`: a stored version number, or a source hash for a file panel run sandboxed. */
export type BridgePanel = { slug: string; version: number | string; compiled: string; title: string };

export type FrameMessage =
  | { type: "ready" }
  | { type: "subscribe"; id: string; name: string; args: Record<string, unknown>; hz?: number }
  | { type: "unsubscribe"; id: string }
  | { type: "command"; id: string; envelope: unknown }
  | { type: "calibration"; id: string }
  | { type: "resize"; height: number }
  | { type: "status"; status: "ready" | "failed" | "crashed"; message?: string };

export type HostMessage =
  | { type: "boot"; room: BridgeRoom; panel: BridgePanel; theme: { dark: boolean } }
  | { type: "load"; panel: BridgePanel }
  | { type: "data"; id: string; value: unknown }
  | { type: "error"; id: string; message: string }
  | { type: "result"; id: string; ok: true; value: unknown }
  | { type: "result"; id: string; ok: false; message: string };

/** What the frame's evaluator needs, sent once per (game, god): your descriptor, the settings and its calibration tables. */
export type CalibrationReply = { key: string; settings: unknown; utility: unknown; reward: unknown; penalty?: unknown; hold?: unknown };

const FRAME_TYPES = new Set(["ready", "subscribe", "unsubscribe", "command", "calibration", "resize", "status"]);
export const isFrameMessage = (data: unknown): data is FrameMessage & { nonce: string } =>
  !!data && typeof data === "object" && typeof (data as { type?: unknown }).type === "string" && FRAME_TYPES.has((data as { type: string }).type);
