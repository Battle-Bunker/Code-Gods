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
export type QueryName = "player.observation" | "player.events" | "player.myUtility" | "player.trajectories" | "rooms.get";

const int = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : fallback;

/** Allowed queries → the arguments the host actually sends (null: refused). The room is always the host's. */
export const BRIDGE_QUERIES: Record<QueryName, (args: Record<string, unknown>, roomId: string) => Record<string, unknown> | null> = {
  "player.observation": (_args, roomId) => ({ roomId }),
  "player.events": (args, roomId) => ({ roomId, limit: int(args.limit, 1, 50, 20) }),
  "player.myUtility": (_args, roomId) => ({ roomId }),
  "player.trajectories": (args, roomId) => typeof args.gameId === "string" && args.gameId.length <= 64
    ? { roomId, gameId: args.gameId, afterSeq: int(args.afterSeq, -1, Number.MAX_SAFE_INTEGER, -1), limit: int(args.limit, 1, 200, 200) }
    : null,
  "rooms.get": (_args, roomId) => ({ room: roomId }),
};
export const isQueryName = (name: unknown): name is QueryName => typeof name === "string" && Object.hasOwn(BRIDGE_QUERIES, name);

export const DEFAULT_HZ = 2;
export const MAX_HZ = 5;
export const clampHz = (hz: unknown) => Math.min(MAX_HZ, Math.max(0.2, typeof hz === "number" && Number.isFinite(hz) ? hz : DEFAULT_HZ));

export type BridgeRoom = { roomId: string; permission: "read" | "act" | "owner"; mode: "devserver" | "hosted" };
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
export type CalibrationReply = { key: string; settings: unknown; utility: unknown; reward: unknown; penalty?: unknown };

const FRAME_TYPES = new Set(["ready", "subscribe", "unsubscribe", "command", "calibration", "resize", "status"]);
export const isFrameMessage = (data: unknown): data is FrameMessage & { nonce: string } =>
  !!data && typeof data === "object" && typeof (data as { type?: unknown }).type === "string" && FRAME_TYPES.has((data as { type: string }).type);
