import { useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type CSSProperties, type PointerEvent } from "react";
import * as Popover from "@radix-ui/react-popover";
import { createObjectTypeRegistry, type ObjectContext, type ObjectValue } from "./registry.ts";
import {
  changedCells, getColourCue, gridModel, gridSummary, looksLikeGrid, patternStyle, setColourCue, subscribeColourCue,
  type ColourCue, type GridCellModel, type GridModel,
} from "./grid-display.ts";

export interface ObjectViewProps extends ObjectContext {
  /** The object's value as the public API carries it. */
  value: ObjectValue;
  /** The previous value, in transformation feeds: grids outline the cells that changed. */
  compareTo?: ObjectValue;
  className?: string;
  /** Also give text values a native tooltip with their full text (for truncated cells). */
  showTitle?: boolean;
}

export type ObjectComponent = ComponentType<ObjectViewProps>;

/**
 * Every object type's renderer. To add an object type, write one component that takes
 * `ObjectViewProps` and register it:
 *
 *   objectViews.register({ type: "Tree", component: TreeObject, infer: (v) => isTree(v) });
 *
 * `type` matches the room setting `objectType`; `infer` (optional) claims values whose type the
 * caller does not know. Nothing else needs to change: every list renders through `ObjectView`.
 */
export const objectViews = createObjectTypeRegistry<ObjectComponent>();

/** Text form used today for Int and string values: numbers as-is, strings JSON-quoted so spaces, quotes and control characters stay visible. */
export function objectText(value: ObjectValue): string {
  return typeof value === "number" ? String(value) : JSON.stringify(value);
}

export function IntObject({ value, className, showTitle }: ObjectViewProps) {
  const text = objectText(value);
  return <span className={className} title={showTitle ? text : undefined} data-object-type="Int">{text}</span>;
}

export function StringObject({ value, className, showTitle }: ObjectViewProps) {
  const text = objectText(value);
  return <span className={className} title={showTitle ? text : undefined} data-object-type="string">{text}</span>;
}

function useColourCue(): ColourCue {
  return useSyncExternalStore(subscribeColourCue, getColourCue, () => "pattern");
}

const compactPx = (n: number) => (n <= 5 ? 14 : n <= 7 ? 12 : 10);
const detailPx = (n: number) => (n <= 4 ? 40 : n <= 5 ? 36 : n <= 6 ? 32 : n <= 7 ? 28 : 20);

function Cell({ cell, px, wide, cue, changed, detail }: {
  cell: GridCellModel; px: number; wide: boolean; cue: ColourCue; changed: boolean; detail: boolean;
}) {
  const showPattern = cue === "pattern";
  const style: CSSProperties = {
    width: wide ? Math.round(px * 1.5) : px, height: px,
    backgroundColor: cell.css,
    ...(showPattern ? patternStyle(cell.letter, cell.ink, detail ? 7 : 5) : {}),
    fontSize: detail ? Math.round(px * (cell.glyph.length > 2 ? 0.34 : 0.42)) : px * (cell.compactGlyph.length > 1 ? 0.56 : 0.66),
    textShadow: showPattern ? `0 0 2px ${cell.css}, 0 0 1px ${cell.css}` : undefined,
    // Changed cells get an outline in the surrounding text colour (inherited), not a hue.
    ...(changed ? { outline: "2px solid currentColor", zIndex: 1 } : {}),
  };
  return (
    <span className="relative flex items-center justify-center font-mono font-semibold leading-none select-none" style={style} data-cell={`${cell.code}${cell.letter}`} data-changed={changed || undefined}>
      <span style={{ color: cell.ink, paddingBottom: detail ? Math.round(px * 0.12) : undefined }}>
        {detail ? cell.glyph : cell.compactGlyph}
        {!detail && wide && <span style={{ fontSize: "0.72em", marginLeft: 1 }}>{cell.letter}</span>}
      </span>
      {detail && <span className="absolute bottom-0.5 right-0.5 leading-none" style={{ fontSize: 9, color: cell.ink }}>{cell.letter}</span>}
    </span>
  );
}

function Cells({ model, px, cue, changes, detail, label }: {
  model: GridModel; px: number; cue: ColourCue; changes: boolean[][] | null; detail: boolean; label?: string;
}) {
  const wide = !detail && cue === "letter";
  return (
    <span
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      className="inline-grid gap-px bg-border p-px align-middle text-foreground"
      style={{ gridTemplateColumns: `repeat(${model.size}, auto)` }}
    >
      {model.rows.flatMap((row, r) => row.map((cell, k) => (
        <Cell key={`${r}-${k}`} cell={cell} px={px} wide={wide} cue={cue} detail={detail} changed={!!changes?.[r][k]} />
      )))}
    </span>
  );
}

function CueToggle({ cue }: { cue: ColourCue }) {
  const opt = (id: ColourCue, label: string) => (
    <button type="button" aria-pressed={cue === id} onClick={() => setColourCue(id)}
      className={`px-2 py-0.5 border text-xs ${cue === id ? "bg-foreground text-background" : "hover:bg-muted"}`}
      data-testid={`button-colour-cue-${id}`}>{label}</button>
  );
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Colour cue in compact grids">
      <span className="text-xs text-muted-foreground mr-1">Colour cue</span>{opt("pattern", "Pattern")}{opt("letter", "Letter")}
    </div>
  );
}

function GridView({ model, previous, typeLabel, className }: { model: GridModel; previous: GridModel | null; typeLabel?: string; className?: string }) {
  const cue = useColourCue();
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const summary = useMemo(() => gridSummary(model), [model]);
  const changes = useMemo(() => changedCells(model, previous), [model, previous]);
  const nChanged = changes ? changes.flat().filter(Boolean).length : 0;

  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = undefined; };
  const hoverIn = (e: PointerEvent) => { if (e.pointerType !== "mouse") return; clear(); if (!open) timer.current = setTimeout(() => setOpen(true), 120); };
  const hoverOut = (e: PointerEvent) => { if (e.pointerType !== "mouse" || pinned.current) return; clear(); timer.current = setTimeout(() => setOpen(false), 160); };

  return (
    <Popover.Root open={open} onOpenChange={(o) => { clear(); pinned.current = o; setOpen(o); }}>
      <Popover.Trigger asChild>
        <button type="button" data-object-type="Grid" data-testid="grid-object"
          className={`inline-flex align-middle rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${className ?? ""}`}
          onPointerEnter={hoverIn} onPointerLeave={hoverOut}
          onClick={(e) => {
            // Click pins a hover-opened view, or toggles; Radix's own toggle is skipped.
            e.preventDefault(); clear();
            if (open && !pinned.current) { pinned.current = true; return; }
            pinned.current = !open; setOpen(!open);
          }}>
          <Cells model={model} px={compactPx(model.size)} cue={cue} changes={changes} detail={false}
            label={nChanged ? `${summary} ${nChanged} cell${nChanged === 1 ? "" : "s"} changed.` : summary} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="start" sideOffset={6} collisionPadding={8}
          onOpenAutoFocus={(e) => { if (!pinned.current) e.preventDefault(); }}
          onPointerEnter={clear} onPointerLeave={hoverOut}
          aria-label={`Grid ${model.size} by ${model.size} details`}
          className="z-50 w-[min(calc(100vw-16px),22rem)] max-h-[min(80vh,36rem)] overflow-auto border bg-popover text-popover-foreground shadow-lg p-3 space-y-3 text-left whitespace-normal font-sans"
          data-testid="grid-object-detail">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">Grid {model.size}×{model.size}</span>
            {typeLabel && <span className="font-mono text-xs text-muted-foreground truncate">{typeLabel}</span>}
          </div>
          <div className="flex justify-center"><Cells model={model} px={detailPx(model.size)} cue={cue} changes={changes} detail /></div>
          {changes && <p className="text-xs text-muted-foreground">{nChanged ? `${nChanged} cell${nChanged === 1 ? "" : "s"} changed (outlined).` : "No cells changed."}</p>}
          <code className="block font-mono text-xs break-all bg-muted px-2 py-1 select-all" data-testid="grid-object-canonical">{model.canonical}</code>
          <CueToggle cue={cue} />
          <ol className="text-xs space-y-1 max-h-40 overflow-auto" aria-label="Cells by row">
            {model.rows.map((row, r) => (
              <li key={r}><span className="text-muted-foreground">Row {r + 1}: </span>{row.map((c, k) => (
                <span key={k}><span className={changes?.[r][k] ? "font-semibold underline" : undefined}>{c.name}</span>{k < row.length - 1 ? "; " : ""}</span>
              ))}</li>
            ))}
          </ol>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function GridObject(props: ObjectViewProps) {
  const { value, compareTo, grid, className } = props;
  const key = `${grid?.size}|${grid?.symbols}|${grid?.colours}`;
  const model = useMemo(() => gridModel(value, grid), [value, key]);
  const previous = useMemo(() => (compareTo === undefined ? null : gridModel(compareTo, grid)), [compareTo, key]);
  if (!model) return <StringObject {...props} />;
  const typeLabel = grid?.size && grid.symbols && grid.colours ? `Grid(${grid.size},${grid.symbols},${grid.colours})` : undefined;
  return <GridView model={model} previous={previous} typeLabel={typeLabel} className={className} />;
}

// Built-in types. Later registrations are tried first when inferring, so Grid wins over string.
objectViews.register({ type: "string", component: StringObject, infer: (v) => typeof v === "string" });
objectViews.register({ type: "Int", component: IntObject, infer: (v) => typeof v === "number" });
objectViews.register({ type: "Grid", component: GridObject, infer: looksLikeGrid });

/** Native tooltip text for a value's container: the text form, or undefined for grids (they have their own detail view). */
export function objectTitle(value: ObjectValue, context?: ObjectContext): string | undefined {
  const entry = objectViews.resolve(value, context);
  return entry?.type === "Grid" && gridModel(value, context?.grid) ? undefined : objectText(value);
}

/** Renders any object value with its type's registered component. */
export function ObjectView(props: ObjectViewProps) {
  const entry = objectViews.resolve(props.value, props);
  const Component = entry?.component ?? StringObject;
  return <Component {...props} />;
}
