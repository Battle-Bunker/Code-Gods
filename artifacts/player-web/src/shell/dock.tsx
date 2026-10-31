/**
 * The dock: the protected core game UI in the middle, panels in three regions around it (left, right,
 * bottom). Each region stacks its panels or shows them as tabs. Players move, resize and hide panels; the layout
 * follows the player across devices (layout-sync.ts) with localStorage as its boot cache. A panel's manifest only
 * sets its defaults.
 *
 * Panels come from two sources (registry-merge.ts): file panels (src/panels/*.tsx, in-process with HMR) and
 * stored panels (panels.list, each in a sandboxed frame: stored-frame.tsx). `?panels=off` is safe mode.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/engine/convex/_generated/api";
import { useRoom } from "@/sdk/context";
import { panelStore, type PanelEntry } from "./panel-store";
import { PanelBody, PanelBoundary, usePanelModules, type FrameStatus } from "./panel-frame";
import { layoutStore, useLayout, type Layout } from "./layout";
import { useLayoutSync } from "./layout-sync";
import { mergePanels } from "./registry-merge";
import { SandboxedFilePanelBody, StoredPanelBody } from "./stored-frame";
import { Confirmations } from "./confirmations";
import { policyStore } from "./policy-store";
import { SAFE_MODE } from "./safe-mode";
import type { PanelSize, Placement } from "./panel-types";
import "./registry";

const REGIONS: Placement[] = ["left", "right", "bottom"];
const SIZES: PanelSize[] = ["sm", "md", "lg"];
const HEIGHT: Record<PanelSize, string> = { sm: "min-h-[140px]", md: "min-h-[240px]", lg: "min-h-[400px]" };
const WIDTH: Record<PanelSize, number> = { sm: 280, md: 360, lg: 480 };

type Placed = { entry: PanelEntry; status: FrameStatus | undefined; id: string; title: string; region: Placement; size: PanelSize; order: number; hidden: boolean };

function place(entry: PanelEntry, status: FrameStatus | undefined, layout: Layout, index: number): Placed {
  const definition = status?.kind === "ready" ? status.loaded.definition : undefined;
  const id = definition?.id ?? entry.id;
  const saved = layout.panels[id] ?? {};
  return {
    entry, status, id, title: entry.stored?.title ?? definition?.title ?? entry.id,
    region: saved.region ?? entry.stored?.placement ?? definition?.placement ?? "right",
    size: saved.size ?? entry.stored?.size ?? definition?.size ?? "md",
    order: saved.order ?? 1000 + index,
    hidden: saved.hidden ?? false,
  };
}

export function usePanelEntries() {
  return useSyncExternalStore(panelStore.subscribe, panelStore.get, panelStore.get);
}

/** File panels the player chose to run sandboxed (this page only; dev servers only). */
const sandboxed = (() => {
  let ids: ReadonlySet<string> = new Set();
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    get: () => ids,
    toggle(id: string) { const next = new Set(ids); if (!next.delete(id)) next.add(id); ids = next; for (const l of listeners) l(); },
  };
})();

export function Dock({ children }: { children: ReactNode }) {
  const { entries: files, generation, buildErrors } = usePanelEntries();
  const room = useRoom();
  const stored = useQuery(api.panels.list, SAFE_MODE ? "skip" : {});
  const previous = useRef<PanelEntry[]>([]);
  const entries = useMemo(() => (previous.current = SAFE_MODE ? [] : mergePanels(files, stored ?? [], previous.current)), [files, stored]);
  const statuses = usePanelModules(files, generation);
  const layout = useLayout();
  const placed = useMemo(() => entries.map((entry, i) => place(entry, statuses[entry.file], layout, i)), [entries, statuses, layout]);
  useLayoutSync(!SAFE_MODE, room.permission !== "read");

  // A "let it act" grant ends when its panel is gone or a non-browser author wrote a newer version.
  useEffect(() => {
    if (stored === undefined) return;
    policyStore.dispatch({ type: "panels", panels: [
      ...stored.map(p => ({ key: `stored:${p.slug}`, currentVersion: p.currentVersion, lastForeignVersion: p.lastForeignVersion })),
      ...files.map(f => ({ key: `file:${f.id}`, currentVersion: 0, lastForeignVersion: 0 })),
    ] });
  }, [stored, files]);

  // A panel that loads again after a compile error clears that error.
  useEffect(() => {
    for (const p of placed) if (p.status?.kind === "ready" && buildErrors[p.entry.file]) panelStore.clearBuildError(p.entry.file);
    // Only the module identity matters here, not every status object.
  }, [placed, buildErrors]);

  const inRegion = (region: Placement) => placed.filter(p => p.region === region && !p.hidden).sort((a, b) => a.order - b.order);
  const hidden = placed.filter(p => p.hidden);
  const width = (region: Placement) => Math.max(...inRegion(region).map(p => WIDTH[p.size]), 0);
  const regionProps = { buildErrors, generation };

  return (
    <div data-testid="dock" className="flex min-h-screen flex-col">
      <DockBar hidden={hidden} files={placed.filter(p => p.entry.origin === "file").length} stored={placed.filter(p => p.entry.origin === "stored").length} />
      {/* Narrow screens: the core first, then each region stacked full width. */}
      <div className="flex flex-1 min-h-0 flex-col gap-3 px-3 lg:flex-row">
        <Region region="left" panels={inRegion("left")} width={width("left")} {...regionProps} />
        <main data-testid="core" className="@container order-first flex-1 min-w-0 lg:order-none">{children}</main>
        <Region region="right" panels={inRegion("right")} width={width("right")} {...regionProps} />
      </div>
      <Region region="bottom" panels={inRegion("bottom")} {...regionProps} />
      <Confirmations entries={entries} />
    </div>
  );
}

function DockBar({ hidden, files, stored }: { hidden: Placed[]; files: number; stored: number }) {
  if (SAFE_MODE) {
    return (
      <div className="flex items-center gap-3 px-3 py-1 text-[11px] opacity-70" data-testid="dock-bar">
        <span data-testid="text-safe-mode">Safe mode: panels are off.</span>
        <a className="underline" href={location.pathname + location.search.replace(/([?&])panels=off&?/, "$1").replace(/[?&]$/, "")}>turn panels on</a>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 px-3 py-1 text-[11px] opacity-70" data-testid="dock-bar">
      <span>{files} panel{files === 1 ? "" : "s"} from <code>src/panels/</code>, {stored} stored</span>
      {hidden.map(p => (
        <button key={p.id} type="button" className="underline" onClick={() => layoutStore.placePanel(p.id, { hidden: false })}>show {p.title}</button>
      ))}
      <a className="underline" href={`${location.pathname}${location.search ? `${location.search}&` : "?"}panels=off`} title="Load only the core console">safe mode</a>
      <button type="button" className="ml-auto underline" onClick={() => layoutStore.reset()}>reset layout</button>
    </div>
  );
}

type RegionProps = { region: Placement; panels: Placed[]; buildErrors: Readonly<Record<string, string>>; generation: number; width?: number };
function Region({ region, panels, buildErrors, generation, width }: RegionProps) {
  const layout = useLayout();
  const mode = layout.regions[region]?.mode ?? "stack";
  const [over, setOver] = useState(false);
  const ids = panels.map(p => p.id);
  const onDrop = (event: DragEvent, beforeId?: string) => {
    event.preventDefault(); event.stopPropagation(); setOver(false);
    const id = event.dataTransfer.getData("application/x-cg-panel");
    if (id) layoutStore.move(id, region, ids, beforeId);
  };
  const vertical = region !== "bottom";
  const active = panels.find(p => p.id === layout.regions[region]?.active) ?? panels[0];
  const shown = mode === "tabs" ? (active ? [active] : []) : panels;
  const empty = panels.length === 0;
  return (
    <aside data-testid={`region-${region}`}
      onDragOver={event => { event.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={event => onDrop(event)}
      style={vertical && !empty ? { "--region-width": `${width}px` } as CSSProperties : undefined}
      className={`${vertical ? "flex flex-col shrink-0 lg:w-[var(--region-width)]" : "flex flex-row flex-wrap px-3 pb-3"} gap-3 ${empty ? (vertical ? "lg:w-3" : "min-h-3") : ""} ${over ? "outline outline-2 outline-dashed outline-[hsl(var(--primary))]" : ""}`}>
      {!empty && panels.length > 1 && (
        <div className="flex items-center gap-2 text-[11px] w-full">
          <button type="button" className="underline opacity-70" onClick={() => layoutStore.setRegion(region, { mode: mode === "tabs" ? "stack" : "tabs" })}>
            {mode === "tabs" ? "stack" : "tabs"}
          </button>
          {mode === "tabs" && panels.map(p => (
            <button key={p.id} type="button" onClick={() => layoutStore.setRegion(region, { active: p.id })}
              className={p.id === active?.id ? "font-semibold underline" : "opacity-70"}>{p.title}</button>
          ))}
        </div>
      )}
      {shown.map(p => <Frame key={p.entry.file} placed={p} buildError={buildErrors[p.entry.file]} generation={generation} onDropBefore={event => onDrop(event, p.id)} vertical={vertical} />)}
    </aside>
  );
}

function Frame({ placed, buildError, generation, onDropBefore, vertical }: { placed: Placed; buildError?: string; generation: number; onDropBefore: (event: DragEvent) => void; vertical: boolean }) {
  const { entry, status, id, title, size, region } = placed;
  const isSandboxed = useSyncExternalStore(sandboxed.subscribe, sandboxed.get, sandboxed.get).has(entry.id);
  const where = entry.origin === "stored" ? `stored panel ${entry.id} v${entry.version}` : `src/panels/${entry.file}`;
  let body: ReactNode;
  // The boundary catches a failing panels.code query (a panel removed or a version pruned mid-render).
  if (entry.origin === "stored") body = <PanelBoundary resetKey={entry.version} file={entry.file}><StoredPanelBody entry={entry} /></PanelBoundary>;
  else if (isSandboxed) body = <PanelBoundary resetKey={generation} file={entry.file}><SandboxedFilePanelBody entry={entry} generation={generation} /></PanelBoundary>;
  else body = <PanelBody entry={entry} status={status ?? { kind: "loading" }} buildError={buildError} />;
  return (
    <section data-testid={`panel-${entry.id}`} data-panel-file={entry.file} data-panel-origin={entry.origin}
      onDragOver={event => event.preventDefault()} onDrop={onDropBefore}
      style={vertical ? undefined : { width: WIDTH[size], maxWidth: "100%" }}
      className={`panel flex flex-col ${HEIGHT[size]}`}>
      <header draggable onDragStart={event => event.dataTransfer.setData("application/x-cg-panel", id)}
        className="flex items-center gap-2 border-b border-[hsl(var(--card-border))] px-3 py-1.5 cursor-grab">
        <h3 className="label !text-[hsl(var(--foreground))] truncate" title={where}>{title}</h3>
        {entry.origin === "stored" && (
          <span data-testid={`badge-stored-${entry.id}`} className="text-[10px] opacity-60" title={entry.stored?.author ? `by ${entry.stored.author.label} (${entry.stored.author.kind})` : undefined}>
            stored v{entry.version}
          </span>
        )}
        {entry.shadows !== undefined && <span data-testid={`badge-shadows-${entry.id}`} className="text-[10px] opacity-60">shadows stored v{entry.shadows}</span>}
        <span className="ml-auto flex gap-1 text-[11px] opacity-70">
          {import.meta.env.DEV && entry.origin === "file" && (
            <button type="button" data-testid={`button-sandbox-${entry.id}`} title={isSandboxed ? "Run in-process (HMR)" : "Run sandboxed, as a stored panel would"}
              onClick={() => sandboxed.toggle(entry.id)}>{isSandboxed ? "in-process" : "sandbox"}</button>
          )}
          {REGIONS.filter(r => r !== region).map(r => (
            <button key={r} type="button" title={`Move to ${r}`} onClick={() => layoutStore.placePanel(id, { region: r, order: Date.now() })}>
              {r === "left" ? "◧" : r === "right" ? "◨" : "⬓"}
            </button>
          ))}
          <button type="button" title="Resize" onClick={() => layoutStore.placePanel(id, { size: SIZES[(SIZES.indexOf(size) + 1) % SIZES.length] })}>{size}</button>
          <button type="button" title="Hide" onClick={() => layoutStore.placePanel(id, { hidden: true })}>✕</button>
        </span>
      </header>
      <div className="flex-1 min-h-0 overflow-auto p-3">{body}</div>
    </section>
  );
}
