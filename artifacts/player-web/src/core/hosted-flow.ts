/**
 * The browser client's sign-in steps (pure; test/hosted-flow.test.ts). A browser client holds a room-scoped player
 * token from the engine's OAuth flow (docs/external-clients.md §3.1), the same way any app on any origin does:
 *
 *   ask       no room in the URL (the caller passes no session then): the rooms this browser is connected to, and a code
 *   play      a stored session for the URL's room (routes.ts: /rooms/:room/…)
 *   redirect  none yet: go to the engine's /connect page by itself (the engine approves its own client without a
 *             click for a member, at most act), at most once a minute per room and tab, so a denial never loops
 *   connect   a button: sign in again (redirect), or inside a frame the device flow (Google sign-in refuses frames)
 */
export type SessionRef = { roomId: string; roomCode: string };
export type HostedStep<S extends SessionRef> =
  | { step: "ask" } | { step: "play"; session: S } | { step: "redirect" } | { step: "connect"; framed: boolean };

/** A room reference for matching: upper case, no dashes or spaces (the engine also reads O as 0 and I/L as 1). */
export const roomKey = (room: string) => room.trim().toUpperCase().replace(/[-\s]/g, "");

export function hostedStep<S extends SessionRef>(r: { room: string; session: S | null; framed: boolean; autoAllowed: boolean }): HostedStep<S> {
  if (r.session) return { step: "play", session: r.session };
  if (!r.room) return { step: "ask" };
  if (!r.framed && r.autoAllowed) return { step: "redirect" };
  return { step: "connect", framed: r.framed };
}

const KEY = "codegods.autoConnect";
/** Records the attempt: true when the page may redirect by itself now. */
export function autoRedirectAllowed(storage: Pick<Storage, "getItem" | "setItem"> | null, room: string, now: number): boolean {
  if (!storage) return false;
  let tries: Record<string, number> = {};
  try { tries = JSON.parse(storage.getItem(KEY) ?? "{}"); } catch { /* reset */ }
  if (now - (tries[roomKey(room)] ?? -Infinity) < 60_000) return false;
  tries[roomKey(room)] = now;
  storage.setItem(KEY, JSON.stringify(tries));
  return true;
}
