/** A next step rendered as the page's one filled button or as a text link; it runs the same command as its palette row. */
import { usePage } from "@/site/components/layout";
import { Action } from "@/site/components/action";
import { Spinner } from "@/components/ui/spinner";
import type { StepId } from "@/site/lib/next-step";
import { gamePath, roomPath } from "@/site/lib/routes";

/** Test ids the e2e suites rely on, per step. */
const TEST_IDS: Partial<Record<StepId, string>> = {
  "ui.auth.signIn": "button-login-room", "rooms.join": "button-join", "rooms.setReady": "button-ready",
  "ui.copyInviteLink": "button-copy-link", "ui.practiceGame": "button-practice-game", "owner.start": "button-start", "ui.nav.game": "link-running-game",
  "rooms.resume": "button-resume", "ui.nav.room": "button-back-to-room",
  "rooms.setSpectator": "button-spectator",
};

export function StepAction({ id, primary, roomCode, gameCode }: { id: StepId; primary?: boolean; roomCode?: string | null; gameCode?: string | null }) {
  const { run, command, unavailable, start } = usePage();
  const c = command(id);
  if (!c) return null;
  const tone = primary ? "primary" : "link";
  const testId = TEST_IDS[id];
  // Links stay links: the game and the room are routes.
  if (id === "ui.nav.game" && gameCode && roomCode) return <Action k={id} tone={tone} href={gamePath(roomCode, gameCode)} testId={testId} />;
  if (id === "ui.nav.room" && roomCode) return <Action k={id} label={`Back to room ${roomCode}`} tone={tone} href={roomPath(roomCode)} testId={testId} />;
  // The start registers in the same frame: busy, spinner, no second click, until the room shows the game or its preparation.
  if (id === "owner.start" && start.phase === "starting") {
    return <Action k={id} label="Starting…" tone={tone} pending icon={<Spinner aria-hidden className="size-4" />} testId={testId} />;
  }
  return <Action k={id} label={c.human.title} tone={tone} onClick={() => run(id)} unavailable={unavailable(id)} testId={testId} showReason={primary} />;
}
