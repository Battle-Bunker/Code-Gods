/**
 * A virtualised list of fixed-height rows (docs/convex-read-architecture.md R1): only the rows in view (plus a few
 * either side) mount, so a row component that subscribes to its own item holds that subscription only while it is
 * visible and drops it when scrolled away. `onNearEnd` asks the skeleton for its next page.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { visibleWindow, wantsMore } from "@/lib/virtual-window";

export function VirtualRows<T>({ rows, rowHeight, maxHeight, overscan = 4, keyOf, render, onNearEnd, testId }: {
  rows: readonly T[]; rowHeight: number; maxHeight: number; overscan?: number;
  keyOf: (row: T) => string; render: (row: T, index: number) => ReactNode; onNearEnd?: () => void; testId?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setView({ top: el.scrollTop, height: el.clientHeight });
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => observer?.disconnect();
  }, []);
  const { start, end } = visibleWindow({ scrollTop: view.top, viewport: view.height, rowHeight, count: rows.length, overscan });
  const near = wantsMore({ end, count: rows.length });
  useEffect(() => { if (near) onNearEnd?.(); }, [near, rows.length, onNearEnd]);
  return (
    <div ref={box} className="overflow-auto" style={{ maxHeight }} data-testid={testId}
      onScroll={e => { const el = e.currentTarget; setView({ top: el.scrollTop, height: el.clientHeight }); }}>
      <div style={{ height: rows.length * rowHeight, position: "relative" }}>
        <div style={{ position: "absolute", top: start * rowHeight, left: 0, right: 0 }}>
          {rows.slice(start, end).map((row, i) => <div key={keyOf(row)} style={{ height: rowHeight }}>{render(row, start + i)}</div>)}
        </div>
      </div>
    </div>
  );
}
