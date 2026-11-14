/**
 * Human activity (W3 #629, v1's idle parking): after 30 minutes with no human activity a live game parks; the app says
 * a human is here by `account.touch`, on real interaction only (a press or a key, never a subscription or a timer), at
 * most once a minute. Pure, so the throttle is unit-tested.
 */
export const TOUCH_EVERY_MS = 60_000;

/** A gate that opens at most once per `everyMs`: true when this interaction should be reported. */
export function touchGate(everyMs = TOUCH_EVERY_MS): (now: number) => boolean {
  let last = -Infinity;
  return now => {
    if (now - last < everyMs) return false;
    last = now;
    return true;
  };
}

/** The game clock's words for a parked game. */
export const PARKED_NOTE = "nobody was here for 30 minutes: it resumes when you act";
