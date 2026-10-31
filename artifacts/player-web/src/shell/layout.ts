/**
 * Panel layout. It follows the player across devices through panels.setLayout (layout-sync.ts); localStorage is
 * the boot cache. A player's choice (region, order, size, hidden) wins over a panel's manifest; "Reset layout"
 * returns every panel to its manifest defaults.
 */
import { useSyncExternalStore } from "react";
import type { PanelSize, Placement } from "./panel-types";

export type PanelPlacement = { region?: Placement; order?: number; size?: PanelSize; hidden?: boolean };
export type RegionMode = "stack" | "tabs";
export type Layout = {
  version: 1;
  panels: Record<string, PanelPlacement>;
  regions: Partial<Record<Placement, { mode: RegionMode; active?: string }>>;
};

const KEY = "cg.layout.v1";
const empty = (): Layout => ({ version: 1, panels: {}, regions: {} });

function read(): Layout {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null") as Layout | null;
    return parsed?.version === 1 && parsed.panels && parsed.regions ? parsed : empty();
  } catch { return empty(); }
}

let layout = typeof localStorage === "undefined" ? empty() : read();
const listeners = new Set<() => void>();
function set(next: Layout) {
  layout = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: keep it in memory */ }
  for (const listener of listeners) listener();
}

export const layoutStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  get: () => layout,
  placePanel(id: string, patch: PanelPlacement) {
    set({ ...layout, panels: { ...layout.panels, [id]: { ...layout.panels[id], ...patch } } });
  },
  /** Move a panel to a region, at the end (or before `beforeId`). */
  move(id: string, region: Placement, orderedIdsInRegion: string[], beforeId?: string) {
    const ids = orderedIdsInRegion.filter(other => other !== id);
    const at = beforeId ? Math.max(0, ids.indexOf(beforeId)) : ids.length;
    ids.splice(at, 0, id);
    const panels = { ...layout.panels };
    ids.forEach((panelId, order) => { panels[panelId] = { ...panels[panelId], region: panelId === id ? region : panels[panelId]?.region, order }; });
    set({ ...layout, panels, regions: { ...layout.regions, [region]: { mode: layout.regions[region]?.mode ?? "stack", active: id } } });
  },
  setRegion(region: Placement, patch: { mode?: RegionMode; active?: string }) {
    const current = layout.regions[region] ?? { mode: "stack" as RegionMode };
    set({ ...layout, regions: { ...layout.regions, [region]: { ...current, ...patch } } });
  },
  reset() { set(empty()); },
  /** Adopt a layout from elsewhere (panels.layout, the player's other devices); ignored unless well-formed. */
  replace(next: unknown) { if (isLayout(next)) set(next); },
};

export function isLayout(value: unknown): value is Layout {
  const v = value as Layout | null;
  return !!v && v.version === 1 && !!v.panels && typeof v.panels === "object" && !!v.regions && typeof v.regions === "object";
}

export function useLayout(): Layout {
  return useSyncExternalStore(layoutStore.subscribe, layoutStore.get, layoutStore.get);
}
