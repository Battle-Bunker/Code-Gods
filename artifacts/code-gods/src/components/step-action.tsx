/** A next step rendered as the page's one filled button or as a text link; it runs the same command as its palette row. */
import { usePage } from "@/components/layout";
import { Action } from "@/components/action";
import type { StepId } from "@/lib/next-step";

/** Test ids the e2e suites rely on, per step. */
const TEST_IDS: Partial<Record<StepId, string>> = {
  "ui.auth.signIn": "button-login-room", "rooms.join": "button-join", "ui.nav.playerClient": "link-player", "rooms.setReady": "button-ready",
  "ui.copyInviteLink": "button-copy-link", "rooms.addAi": "button-add-ai", "owner.start": "button-start", "ui.nav.game": "link-running-game",
  "rooms.resume": "button-resume", "ui.nav.room": "button-back-to-room",
};

export function StepAction({ id, primary, roomCode, gameCode }: { id: StepId; primary?: boolean; roomCode?: string | null; gameCode?: string | null }) {
  const { run, command, unavailable } = usePage();
  const c = command(id);
  if (!c) return null;
  const tone = primary ? "primary" : "link";
  const testId = TEST_IDS[id];
  // Links stay links: the player client opens in a new tab, the game page is a route.
  if (id === "ui.nav.playerClient" && roomCode) {
    return <Action k={id} tone={tone} href={`/player/?room=${encodeURIComponent(roomCode)}`} external unavailable={unavailable(id)} testId={testId} showReason={primary} />;
  }
  if (id === "ui.nav.game" && gameCode) return <Action k={id} tone={tone} href={`/games/${gameCode}`} testId={testId} />;
  if (id === "ui.nav.room" && roomCode) return <Action k={id} label={`Back to room ${roomCode}`} tone={tone} href={`/rooms/${roomCode}`} testId={testId} />;
  return <Action k={id} label={c.human.title} tone={tone} onClick={() => run(id)} unavailable={unavailable(id)} testId={testId} showReason={primary} />;
}
