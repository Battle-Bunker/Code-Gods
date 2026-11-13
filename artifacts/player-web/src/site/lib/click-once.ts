/**
 * A toggle that a double click must not undo (pure). "Play the next game" flips to "Watch the next game" as soon as the
 * room updates, so the second click of a double click, or a second click made before the page visibly changed, sent the
 * opposite and left the player where they started. `oncePerKey` wraps the call. For one key (one member's seat):
 *   - the same value again, while its call is in flight or within `quietMs` of the click that sent it, is dropped: a
 *     repeat of the same click (the page had not changed yet);
 *   - the other value within `quietMs` of the previous click is dropped too: the second click of a double click, made on
 *     the label that had just flipped;
 *   - the other value later than that is sent: a deliberate toggle the other way, however recently the first call settled;
 *   - after a call that failed nothing is dropped: the player may retry at once.
 * A dropped call resolves to undefined.
 */
export function oncePerKey<A extends unknown[], R>(fn: (...args: A) => Promise<R>, keyOf: (...args: A) => string,
  valueOf: (...args: A) => unknown = () => "", quietMs = 300, now: () => number = Date.now) {
  /** Per key: the last click sent (its value and when), and the values with a call in flight. */
  const last = new Map<string, { value: unknown; at: number }>(), busy = new Map<string, Set<unknown>>();
  return (...args: A): Promise<R | undefined> => {
    const key = keyOf(...args), value = valueOf(...args), at = now();
    const inFlight = busy.get(key) ?? new Set<unknown>();
    busy.set(key, inFlight);
    const previous = last.get(key);
    if (inFlight.has(value) || (previous && at - previous.at < quietMs)) return Promise.resolve(undefined);
    const click = { value, at };
    last.set(key, click);
    inFlight.add(value);
    const failed = () => { inFlight.delete(value); if (last.get(key) === click) last.delete(key); };
    let call: Promise<R>;
    try { call = fn(...args); } catch (e) { failed(); return Promise.reject(e); }
    return call.then(r => { inFlight.delete(value); return r; }, e => { failed(); throw e; });
  };
}
