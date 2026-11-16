/**
 * The stored-panel bridge (integration plan §1.7 "Stored panels and the panel SDK"): postMessage between the app
 * (the host, src/panes/stored-panel.tsx) and a panel's sandboxed frame (src/frame/runtime.tsx). Pure: shared by both
 * builds and the unit tests.
 *
 * The frame's `@sdk` is version 2: the app's own SDK hooks (src/sdk/hooks.ts), each answered by the host, which runs
 * the real hook inside the pane, so the panel sees exactly what the app's panes see, for the room and game in view
 * (and in a replay, the replay at the playhead). The frame never names a query, a room or a game.
 *
 *   frame → host   ready {sdk} | watch {id, hook, args} | unwatch {id} | more {id, n} | resize {height}
 *                  | status {status, message?} | act {id, op, args}                      (each carries `nonce`)
 *   host → frame   boot {scope, panel, dark} | load {panel} | value {id, value} | error {id, message} | acted {id, outcome}
 *
 * `act` asks to do something as the player: one of a few affordances (action-policy.ts PANEL_ACTIONS), checked and,
 * for most, confirmed by the player in the host page before it runs; `acted` is the affordance's outcome (or a refusal).
 *
 * Every value the host sends is the hook's current answer, as it changes (no sampling); a paged hook's answer is
 * {results, status, isLoading}, and `more` asks for the next page.
 */
import { PANEL_SDK } from "../sdk/panel.ts";

const SORTS = ["points", "rarity", "want", "born", "recent"] as const;
type HookArgs = (args: readonly unknown[]) => unknown[];

const int = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : fallback;
/** An object's or an agent's id: a short string, else nothing (the hook then answers nothing). */
const id = (value: unknown) => (typeof value === "string" && value.length > 0 && value.length <= 64 ? value : null);
const none: HookArgs = () => [];
const page = (fallback: number): HookArgs => a => [int(a[0], 1, 100, fallback)];

/**
 * The panel SDK's hooks: every game hook of src/sdk/hooks.ts, by name, with how its arguments are cleaned. The
 * assistant's hooks are not here (a player's private conversation is not panel data), nor `noteSummoned` (a write).
 */
export const PANEL_HOOKS = {
  useRoomInfo: { kind: "value", args: none },
  useGame: { kind: "value", args: none },
  useMe: { kind: "value", args: none },
  useMyRule: { kind: "value", args: none },
  useMyAgents: { kind: "value", args: none },
  useAgentCount: { kind: "value", args: none },
  useLeaderboard: { kind: "value", args: none },
  useStandingsHistory: { kind: "value", args: none },
  useDigest: { kind: "value", args: none },
  useMyObject: { kind: "value", args: a => [id(a[0])] },
  useMyObjects: { kind: "value", args: a => [(Array.isArray(a[0]) ? a[0] : []).map(id).filter((x): x is string => x !== null).slice(0, 100)] },
  useAgentEnergy: { kind: "value", args: a => [id(a[0])] },
  useAgentPrograms: { kind: "value", args: a => [id(a[0])] },
  useObjectIds: { kind: "paged", args: a => [SORTS.find(s => s === a[0]) ?? "points", int(a[1], 1, 100, 30)] },
  useSpectatorObjectIds: { kind: "paged", args: page(30) },
  useMoves: { kind: "paged", args: page(30) },
  useChat: { kind: "paged", args: page(50) },
} as const satisfies Record<string, { kind: "value" | "paged"; args: HookArgs }>;
export type HookName = keyof typeof PANEL_HOOKS;
export const isHookName = (name: unknown): name is HookName => typeof name === "string" && Object.hasOwn(PANEL_HOOKS, name);

/** A watch the host runs, or why not. */
export function checkCall(hook: unknown, args: unknown): { hook: HookName; args: unknown[] } | { error: string } {
  if (!isHookName(hook)) return { error: `${String(hook).slice(0, 80)} is not available to panels.` };
  return { hook, args: PANEL_HOOKS[hook].args(Array.isArray(args) ? args : []) };
}

/** A paged hook's answer as it crosses the bridge (loadMore stays behind: the frame sends `more`). */
export interface PagedAnswer<T = unknown> { results: T[]; status: string; isLoading: boolean }
export const MORE_MAX = 100;
/** Watches one panel may hold at once (a row per object is one each); past it a watch is refused with a reason. */
export const WATCHES_MAX = 500;

export interface PanelScope { roomId: string; gameId: string | null; seated: boolean }
/** One version of a stored panel, as the frame loads it. */
export interface BridgePanel { slug: string; version: number; compiled: string; title: string }

export type FrameMessage =
  | { type: "ready"; sdk: number }
  | { type: "watch"; id: string; hook: string; args: unknown[] }
  | { type: "unwatch"; id: string }
  | { type: "more"; id: string; n: number }
  | { type: "resize"; height: number }
  | { type: "status"; status: "ready" | "failed" | "crashed"; message?: string }
  | { type: "act"; id: string; op: string; args: Record<string, unknown> };

export type HostMessage =
  | { type: "boot"; scope: PanelScope; panel: BridgePanel; dark: boolean }
  | { type: "load"; panel: BridgePanel }
  | { type: "value"; id: string; value: unknown }
  | { type: "error"; id: string; message: string }
  | { type: "acted"; id: string; outcome: ActOutcome };

/** An action's outcome as the panel gets it: the affordance's own, or why it did not run. */
export type ActOutcome = { ok: true; result: unknown } | { ok: false; error: { code: string; message: string } };

const str = (v: unknown) => typeof v === "string" && v.length <= 64;
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const SHAPES: Record<FrameMessage["type"], (m: Record<string, unknown>) => boolean> = {
  ready: () => true,
  watch: m => str(m.id) && typeof m.hook === "string" && Array.isArray(m.args),
  unwatch: m => str(m.id),
  more: m => str(m.id) && num(m.n),
  resize: m => num(m.height),
  status: m => m.status === "ready" || m.status === "failed" || m.status === "crashed",
  act: m => str(m.id) && str(m.op) && !!m.args && typeof m.args === "object" && !Array.isArray(m.args),
};

export function isFrameMessage(data: unknown): data is FrameMessage {
  if (!data || typeof data !== "object") return false;
  const type = (data as { type?: unknown }).type;
  return typeof type === "string" && Object.hasOwn(SHAPES, type) && SHAPES[type as FrameMessage["type"]](data as Record<string, unknown>);
}

/**
 * Accept a message only from `frame` (the panel's own iframe window) with the boot nonce; anything else (another frame,
 * another tab, an extension) is dropped.
 */
export function acceptMessage(event: { source: unknown; data: unknown }, frame: unknown, nonce: string): (FrameMessage & { nonce: string }) | null {
  if (!frame || event.source !== frame || !isFrameMessage(event.data)) return null;
  return (event.data as { nonce?: unknown }).nonce === nonce ? event.data as FrameMessage & { nonce: string } : null;
}

/** A frame that speaks another SDK version (a page kept open across a deploy) is not served. */
export function frameVersionProblem(message: { type: "ready"; sdk?: unknown }): string | null {
  return message.sdk === PANEL_SDK ? null : "This panel frame is from an older version of the app. Reload the page to run it.";
}
