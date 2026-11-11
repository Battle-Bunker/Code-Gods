/**
 * A toggle that a double click must not undo (pure). "Play the next game" flips to "Watch the next game" as soon as the
 * room updates, so the second click of a double click, or a second click made before the page visibly changed, sent the
 * opposite and left the player where they started. `oncePerKey` wraps the call: while a call for the same key is in
 * flight, and for `quietMs` after it settles, further calls for that key are dropped (they resolve to undefined).
 */
export function oncePerKey<A extends unknown[], R>(fn: (...args: A) => Promise<R>, keyOf: (...args: A) => string, quietMs = 800, now: () => number = Date.now) {
  const busy = new Set<string>(), quietUntil = new Map<string, number>();
  return (...args: A): Promise<R | undefined> => {
    const key = keyOf(...args);
    if (busy.has(key) || now() < (quietUntil.get(key) ?? 0)) return Promise.resolve(undefined);
    busy.add(key);
    const settle = () => { busy.delete(key); quietUntil.set(key, now() + quietMs); };
    let call: Promise<R>;
    try { call = fn(...args); } catch (e) { settle(); return Promise.reject(e); }
    return call.finally(settle);
  };
}
