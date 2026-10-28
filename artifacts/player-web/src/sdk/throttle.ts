/**
 * Rate limits for panels. The engine commits in ticks (about 1–4 per second), so Convex subscriptions
 * already update at most at the tick rate; these hooks cap a panel's re-renders further, so ten panels
 * never cost ten renders per tick. Every live SDK hook takes `hz` (default 2, clamped to 0.2–5).
 */
import { useEffect, useRef, useState } from "react";

export const DEFAULT_HZ = 2;
export const MAX_HZ = 5;
export const clampHz = (hz: number | undefined) => Math.min(MAX_HZ, Math.max(0.2, hz ?? DEFAULT_HZ));

/**
 * The latest `value`, re-rendering at most `hz` times a second. The first value and a change from
 * undefined pass through at once; later changes are sampled on a trailing timer, so the last update is
 * never lost.
 */
export function useThrottled<T>(value: T, hz?: number): T {
  const period = 1000 / clampHz(hz);
  const [shown, setShown] = useState(value);
  const latest = useRef(value);
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  latest.current = value;
  useEffect(() => {
    if (Object.is(value, shown)) return;
    const flush = () => { timer.current = undefined; last.current = Date.now(); setShown(latest.current); };
    if (shown === undefined) { flush(); return; }
    if (timer.current) return;
    const wait = Math.max(0, last.current + period - Date.now());
    timer.current = setTimeout(flush, wait);
  }, [value, shown, period]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return shown;
}

/** A value that re-samples `read()` on an interval (for clocks and derived projections), at most `hz` times a second. */
export function useSnapshot<T>(read: () => T, hz?: number): T {
  const [value, setValue] = useState(read);
  const reader = useRef(read);
  reader.current = read;
  const period = 1000 / clampHz(hz);
  useEffect(() => {
    const t = setInterval(() => setValue(reader.current()), period);
    return () => clearInterval(t);
  }, [period]);
  return value;
}
