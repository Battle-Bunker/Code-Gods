/**
 * The dock: the protected core game UI in the middle, panels in three regions around it (left, right,
 * bottom). Each region stacks its panels or shows them as tabs. Players move, resize and hide panels;
 * the layout persists in localStorage (layout.ts). A panel's manifest only sets its defaults.
 */
import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { panelStore, type PanelEntry } from "./panel-store";
import { PanelBody, usePanelModules, type FrameStatus } from "./panel-frame";
import { layoutStore, useLayout, type Layout } from "./layout";
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
    entry, status, id, title: definition?.title ?? entry.id,
    region: saved.region ?? definition?.placement ?? "right",
    size: saved.size ?? definition?.size ?? "md",
    order: saved.order ?? 1000 + index,
    hidden: saved.hidden ?? false,
  };
}

export function usePanelEntries() {
  return useSyncExternalStore(panelStore.subscribe, panelStore.get, panelStore.get);
}

export function Dock({ children }: { children: ReactNode }) {
  const { entries, generation, buildErrors } = usePanelEntries();
  const statuses = usePanelModules(entries, generation);
  const layout = useLayout();
  const placed = useMemo(() => entries.map((entry, i) => place(entry, statuses[entry.file], layout, i)), [entries, statuses, layout]);

  // A panel that loads again after a compile error clears that error.
  useEffect(() => {
    for (const p of placed) if (p.status?.kind === "ready" && buildErrors[p.entry.file]) panelStore.clearBuildError(p.entry.file);
    // Only the module identity matters here, not every status object.
  }, [placed, buildErrors]);

  const inRegion = (region: Placement) => placed.filter(p => p.region === region && !p.hidden).sort((a, b) => a.order - b.order);
  const hidden = placed.filter(p => p.hidden);
  const width = (region: Placement) => Math.max(...inRegion(region).map(p => WIDTH[p.size]), 0);

  return (
    <div data-testid="dock" className="flex min-h-screen flex-col">
      <DockBar hidden={hidden} count={placed.length} />
      {/* Narrow screens: the core first, then each region stacked full width. */}
      <div className="flex flex-1 min-h-0 flex-col gap-3 px-3 lg:flex-row">
        <Region region="left" panels={inRegion("left")} buildErrors={buildErrors} width={width("left")} />
        <main data-testid="core" className="@container order-first flex-1 min-w-0 lg:order-none">{children}</main>
        <Region region="right" panels={inRegion("right")} buildErrors={buildErrors} width={width("right")} />
      </div>
      <Region region="bottom" panels={inRegion("bottom")} buildErrors={buildErrors} />
    </div>
  );
}

function DockBar({ hidden, count }: { hidden: Placed[]; count: number }) {
  return (
    <div className="flex items-center gap-3 px-3 py-1 text-[11px] opacity-70" data-testid="dock-bar">
      <span>{count} panel{count === 1 ? "" : "s"} from <code>src/panels/</code></span>
      {hidden.map(p => (
        <button key={p.id} type="button" className="underline" onClick={() => layoutStore.placePanel(p.id, { hidden: false })}>show {p.title}</button>
      ))}
      <button type="button" className="ml-auto underline" onClick={() => layoutStore.reset()}>reset layout</button>
    </div>
  );
}

function Region({ region, panels, buildErrors, width }: { region: Placement; panels: Placed[]; buildErrors: Readonly<Record<string, string>>; width?: number }) {
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
      {shown.map(p => <Frame key={p.entry.file} placed={p} buildError={buildErrors[p.entry.file]} onDropBefore={event => onDrop(event, p.id)} vertical={vertical} />)}
    </aside>
  );
}

function Frame({ placed, buildError, onDropBefore, vertical }: { placed: Placed; buildError?: string; onDropBefore: (event: DragEvent) => void; vertical: boolean }) {
  const { entry, status, id, title, size, region } = placed;
  return (
    <section data-testid={`panel-${entry.id}`} data-panel-file={entry.file}
      onDragOver={event => event.preventDefault()} onDrop={onDropBefore}
      style={vertical ? undefined : { width: WIDTH[size], maxWidth: "100%" }}
      className={`panel flex flex-col ${HEIGHT[size]}`}>
      <header draggable onDragStart={event => event.dataTransfer.setData("application/x-cg-panel", id)}
        className="flex items-center gap-2 border-b border-[hsl(var(--card-border))] px-3 py-1.5 cursor-grab">
        <h3 className="label !text-[hsl(var(--foreground))] truncate" title={`src/panels/${entry.file}`}>{title}</h3>
        <span className="ml-auto flex gap-1 text-[11px] opacity-70">
          {REGIONS.filter(r => r !== region).map(r => (
            <button key={r} type="button" title={`Move to ${r}`} onClick={() => layoutStore.placePanel(id, { region: r, order: Date.now() })}>
              {r === "left" ? "◧" : r === "right" ? "◨" : "⬓"}
            </button>
          ))}
          <button type="button" title="Resize" onClick={() => layoutStore.placePanel(id, { size: SIZES[(SIZES.indexOf(size) + 1) % SIZES.length] })}>{size}</button>
          <button type="button" title="Hide" onClick={() => layoutStore.placePanel(id, { hidden: true })}>✕</button>
        </span>
      </header>
      <div className="flex-1 min-h-0 overflow-auto p-3">
        <PanelBody entry={entry} status={status ?? { kind: "loading" }} buildError={buildError} />
      </div>
    </section>
  );
}
