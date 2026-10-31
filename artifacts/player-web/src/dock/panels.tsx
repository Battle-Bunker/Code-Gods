/**
 * Panels as panes. Two sources merge into one registry (shell/registry-merge.ts): file panels (src/panels/*.tsx,
 * in-process with HMR, dev servers only) and stored panels (panels.list, each in its sandboxed frame:
 * shell/stored-frame.tsx). A pane names a stored panel by slug and a file panel by file id; this module renders its
 * body and keeps the "let it act" grants and compile errors in step with the registry. `?panels=off` loads neither.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/engine/convex/_generated/api";
import { panelStore, type PanelEntry, type StoredPanelMeta } from "@/shell/panel-store";
import { PanelBody, PanelBoundary, usePanelModules, type FrameStatus } from "@/shell/panel-frame";
import { mergePanels, policyKey } from "@/shell/registry-merge";
import { SandboxedFilePanelBody, StoredPanelBody } from "@/shell/stored-frame";
import { policyStore } from "@/shell/policy-store";
import { SAFE_MODE } from "@/shell/safe-mode";
import "@/shell/registry";

export type Panels = {
  /** Every panel this client can show (file panels first; disabled stored panels left out). */
  entries: PanelEntry[];
  /** Every stored panel, enabled or not (for the palette), or undefined while loading. */
  stored: StoredPanelMeta[] | undefined;
  statuses: Record<string, FrameStatus>;
  buildErrors: Readonly<Record<string, string>>;
  generation: number;
  /** The file panels (src/panels/*.tsx) this build or dev server has; none in safe mode. */
  fileIds: readonly string[];
};
const PanelsContext = createContext<Panels | null>(null);
export function usePanels(): Panels {
  const panels = useContext(PanelsContext);
  if (!panels) throw new Error("Panels are provided by PlayerShell");
  return panels;
}

/** The registry and its side effects (grants, compile errors): mounted once by PlayerShell. */
export function usePanelRegistry(): Panels {
  const { entries: files, generation, buildErrors } = useSyncExternalStore(panelStore.subscribe, panelStore.get, panelStore.get);
  const stored = useQuery(api.panels.list, SAFE_MODE ? "skip" : {}) as StoredPanelMeta[] | undefined;
  const previous = useRef<PanelEntry[]>([]);
  const entries = useMemo(() => (previous.current = SAFE_MODE ? [] : mergePanels(files, stored ?? [], previous.current)), [files, stored]);
  const statuses = usePanelModules(files, generation);

  // A "let it act" grant ends when its panel is gone or a non-browser author wrote a newer version.
  useEffect(() => {
    if (stored === undefined) return;
    policyStore.dispatch({ type: "panels", panels: [
      ...mergePanels([], stored).map(e => ({ key: policyKey(e), currentVersion: e.stored!.currentVersion, lastForeignVersion: e.stored!.lastForeignVersion })),
      ...files.map(f => ({ key: policyKey(f), currentVersion: 0, lastForeignVersion: 0 })),
    ] });
  }, [stored, files]);
  // A panel that loads again after a compile error clears that error.
  useEffect(() => {
    for (const entry of files) if (statuses[entry.file]?.kind === "ready" && buildErrors[entry.file]) panelStore.clearBuildError(entry.file);
  }, [files, statuses, buildErrors]);

  const fileIds = useMemo(() => (SAFE_MODE ? [] : files.map(f => f.id)), [files]);
  return useMemo(() => ({ entries, stored: SAFE_MODE ? [] : stored, statuses, buildErrors, generation, fileIds }), [entries, stored, statuses, buildErrors, generation, fileIds]);
}

export function PanelsProvider({ value, children }: { value: Panels; children: ReactNode }) {
  return <PanelsContext.Provider value={value}>{children}</PanelsContext.Provider>;
}

/** File panels the player chose to run sandboxed (this page only; dev servers only). */
export const sandboxed = (() => {
  let ids: ReadonlySet<string> = new Set();
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    get: () => ids,
    toggle(id: string) { const next = new Set(ids); if (!next.delete(id)) next.add(id); ids = next; for (const l of listeners) l(); },
  };
})();
export const useSandboxed = () => useSyncExternalStore(sandboxed.subscribe, sandboxed.get, sandboxed.get);

/** The entry a stored-panel or file-panel pane shows. */
export function entryFor(panels: Panels, kind: "stored-panel" | "file-panel", ref: string): PanelEntry | undefined {
  return kind === "stored-panel" ? panels.entries.find(e => e.origin === "stored" && e.id === ref) ?? panels.entries.find(e => e.origin === "file" && e.id === ref && e.shadows !== undefined)
    : panels.entries.find(e => e.origin === "file" && e.id === ref);
}
export const panelTitle = (entry: PanelEntry | undefined, statuses: Panels["statuses"], fallback: string) => {
  const status = entry && statuses[entry.file];
  return entry?.stored?.title ?? (status?.kind === "ready" ? status.loaded.definition.title : undefined) ?? fallback;
};

/** The body of your panel's pane: the sandboxed frame of a stored panel, a file panel in-process (or sandboxed). */
export function PanelPaneBody({ entry, missing }: { entry: PanelEntry | undefined; missing: string }) {
  const { statuses, buildErrors, generation } = usePanels();
  const isSandboxed = useSandboxed().has(entry?.id ?? "");
  if (!entry) return <p className="text-sm text-muted-foreground">{missing}</p>;
  // The boundary catches a failing panels.code query (a panel removed or a version pruned mid-render).
  if (entry.origin === "stored") return <PanelBoundary resetKey={entry.version} file={entry.file}><StoredPanelBody entry={entry} /></PanelBoundary>;
  if (isSandboxed) return <PanelBoundary resetKey={generation} file={entry.file}><SandboxedFilePanelBody entry={entry} generation={generation} /></PanelBoundary>;
  return <PanelBody entry={entry} status={statuses[entry.file] ?? { kind: "loading" }} buildError={buildErrors[entry.file]} />;
}
