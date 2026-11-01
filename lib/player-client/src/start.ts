/**
 * The pending start: what every "Start the game" control shows between the owner's click and the room's subscription
 * showing the game or its preparation. Shared by the player client (overview next step, palette, assistant pane) and
 * the engine UI (room page, palette). Pure view plus a tiny framework-free store; no React, no Convex.
 *
 * Why it exists: `owner.start` is a Node action. On a cold instance it first boots the isolated runtime it checks
 * (about 1–2 s), and a shape new to the server then reports `preparing` while its rule tables compute (tens of
 * seconds). The click must register in the same frame, never twice, and never stick:
 * - the request is held in memory only, so a reload mid-start shows the room as it is (the subscription is the truth);
 * - once the call returns, the room has START_LAG_MS to show the game or the preparation, then the pending view ends;
 * - a call that never settles stops showing as pending after START_TIMEOUT_MS.
 * The engine's start is idempotent per requestId, so one click is one requestId.
 */

/** After the start call returned, how long the UI waits for the room's subscription to catch up. */
export const START_LAG_MS = 8_000;
/** A start call that has not settled by then is no longer shown as pending (the room's state is shown instead). */
export const START_TIMEOUT_MS = 90_000;

export type StartSource = "owner" | "assistant";
export type StartRequest = { requestId: string; since: number; source: StartSource; returnedAt?: number };
/** What the room's subscription says (rooms.get / the player client's room info). */
export type StartRoom = { activeGame: unknown; preparing?: { ready: number; total: number; error?: string } | null };
export type StartView =
  | { phase: "idle" }
  | { phase: "starting"; source: StartSource }
  | { phase: "preparing"; ready: number; total: number };

const isLive = (r: StartRequest | null | undefined, now: number): r is StartRequest =>
  !!r && now - r.since < START_TIMEOUT_MS && (r.returnedAt === undefined || now - r.returnedAt < START_LAG_MS);

/**
 * The start control's state. A live game ends any pending start; a preparation in progress shows its progress; a live
 * request shows "starting" (also over a failed preparation it retries); otherwise the control is idle.
 */
export function startView(request: StartRequest | null | undefined, room: StartRoom | null | undefined, now: number): StartView {
  if (room?.activeGame) return { phase: "idle" };
  const p = room?.preparing;
  if (p && !p.error) return { phase: "preparing", ready: p.ready, total: p.total };
  if (isLive(request, now)) return { phase: "starting", source: request.source };
  return { phase: "idle" };
}

export type Clock = { now: () => number; later: (fn: () => void, ms: number) => unknown };
const realClock: Clock = { now: () => Date.now(), later: (fn, ms) => setTimeout(fn, ms) };

export type StartTracker = ReturnType<typeof createStartTracker>;

/** Pending starts per room, in memory. `subscribe`/`get` fit React's useSyncExternalStore. */
export function createStartTracker(clock: Clock = realClock) {
  const requests = new Map<string, StartRequest>();
  const listeners = new Set<() => void>();
  const emit = () => { for (const l of listeners) l(); };
  const set = (roomId: string, r: StartRequest | null) => { if (r) requests.set(roomId, r); else requests.delete(roomId); emit(); };
  // A request going stale changes no field, so it gets a new identity: useSyncExternalStore skips an equal snapshot.
  const expire = () => { for (const [roomId, r] of requests) requests.set(roomId, { ...r }); emit(); };
  /** Assistant calls this page has seen, so one already running when first seen is never taken for a new start. */
  const seen = new Set<string>();
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    get: (roomId: string): StartRequest | null => requests.get(roomId) ?? null,
    now: () => clock.now(),
    /** Record a start; null when one is already live for the room (a double click). */
    begin(roomId: string, source: StartSource, requestId: string = crypto.randomUUID()): string | null {
      if (isLive(requests.get(roomId), clock.now())) return null;
      set(roomId, { requestId, since: clock.now(), source });
      clock.later(expire, START_TIMEOUT_MS);
      return requestId;
    },
    /** The call returned: the room's subscription now has START_LAG_MS to show the game or its preparation. */
    returned(roomId: string, requestId: string) {
      const r = requests.get(roomId);
      if (r?.requestId !== requestId || r.returnedAt !== undefined) return;
      set(roomId, { ...r, returnedAt: clock.now() });
      clock.later(expire, START_LAG_MS);
    },
    /** The call failed: the control is restored at once (the caller shows the error). */
    failed(roomId: string, requestId: string) {
      if (requests.get(roomId)?.requestId === requestId) set(roomId, null);
    },
    /**
     * Follow an assistant's start_game tool call (its id is the request id): running starts the pending state, ok
     * hands over to the room, error or denial restores the control. Other statuses (awaiting the owner) change nothing.
     * A call already running when this page first sees it (a reload, or a turn cancelled mid-call) is left to the room.
     */
    follow(roomId: string, callId: string, status: string) {
      const known = seen.has(callId);
      seen.add(callId);
      if (status === "running") { if (known && requests.get(roomId)?.requestId !== callId) this.begin(roomId, "assistant", callId); }
      else if (status === "ok") this.returned(roomId, callId);
      else if (status === "error" || status === "denied") this.failed(roomId, callId);
    },
  };
}

/**
 * Run one start through the tracker: refuses (null) while one is live, else calls with a fresh requestId, marks it
 * returned, and on a failure restores the control and rethrows.
 */
export async function trackStart<T>(tracker: StartTracker, roomId: string, call: (requestId: string) => Promise<T>): Promise<T | null> {
  const requestId = tracker.begin(roomId, "owner");
  if (!requestId) return null;
  try {
    const result = await call(requestId);
    tracker.returned(roomId, requestId);
    return result;
  } catch (error) {
    tracker.failed(roomId, requestId);
    throw error;
  }
}

/** The one tracker of this page (both apps import it). */
export const startTracker = createStartTracker();
