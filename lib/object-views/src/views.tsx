import { useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type CSSProperties, type PointerEvent } from "react";
import * as Popover from "@radix-ui/react-popover";
import { createObjectTypeRegistry, type GridSettings, type ObjectContext, type ObjectRendererOf, type ObjectValue } from "./registry.ts";
import {
  DIGIT_TYPE, changedCells, getColourCue, gridDigitsLines, gridModel, gridSummary, looksLikeGrid, patternStyle, setColourCue, subscribeColourCue,
  textShadeVar, type ColourCue, type GridCellModel, type GridModel,
} from "./grid-display.ts";
import { GoalBoard } from "./explain/GoalBoard.tsx";
import { CellGlyph, RankGlyph } from "./glyph.tsx";
import { useGoalExplainer } from "./explain/context.tsx";
export interface ObjectViewProps extends ObjectContext {
  /** The object's value as the public API carries it. */
  value: ObjectValue;
  /** The previous value, in transformation feeds: grids mark the cells that changed. */
  compareTo?: ObjectValue;
  className?: string;
  /** Also give text values a native tooltip with their full text (for truncated cells). */
  showTitle?: boolean;
  /** Draw with this renderer of the type (e.g. "tiles") instead of the viewer's choice or the type's default. */
  renderer?: string;
}

export type ObjectComponent = ComponentType<ObjectViewProps>;
export type ObjectRenderer = ObjectRendererOf<ObjectComponent>;

/**
 * Every object type's renderers. To add an object type, write a component that takes
 * `ObjectViewProps` and register it:
 *
 *   objectViews.register({ type: "Tree", component: TreeObject, infer: (v) => isTree(v) });
 *
 * or, with several ways to draw it (the viewer picks; `defaultRenderer` applies until they do):
 *
 *   objectViews.register({ type: "Tree", defaultRenderer: "outline", infer: isTree, renderers: [
 *     { id: "outline", label: "Outline", blurb: "Indented text.", Component: TreeOutline },
 *     { id: "drawing", label: "Drawing", blurb: "Boxes and lines.", Component: TreeDrawing },
 *   ] });
 *
 * `type` matches the room setting `objectType`; `infer` (optional) claims values whose type the
 * caller does not know. Nothing else needs to change: every list renders through `ObjectView`.
 */
export const objectViews = createObjectTypeRegistry<ObjectComponent>();

/** A type's renderers (id, label, blurb), for toggles and palettes. */
export const objectRenderers = (type: string): readonly ObjectRenderer[] => objectViews.renderers(type);
/** The renderer id in effect for this viewer: their remembered choice, else the type's default. */
export const getObjectRenderer = (type: string): string | undefined => objectViews.choice(type);
/** Remembers this viewer's renderer for a type (localStorage, guarded); every ObjectView of the type redraws. */
export const setObjectRenderer = (type: string, id: string): boolean => objectViews.choose(type, id);
export const subscribeObjectRenderer = (listener: () => void): (() => void) => objectViews.subscribe(listener);

/** The renderer id in effect for this viewer, live. */
export function useObjectRenderer(type: string): string | undefined {
  return useSyncExternalStore(subscribeObjectRenderer, () => getObjectRenderer(type), () => objectViews.get(type)?.defaultRenderer);
}

/** Text form used today for Int and string values: numbers as-is, strings JSON-quoted so spaces, quotes and control characters stay visible. */
export function objectText(value: ObjectValue): string {
  return typeof value === "number" ? String(value) : JSON.stringify(value);
}

/** Int and string values: the text. */
function TextObject({ value, className, showTitle, type }: ObjectViewProps & { type: "Int" | "string" }) {
  const text = objectText(value);
  return <span className={className} title={showTitle ? text : undefined} data-object-type={type}>{text}</span>;
}

export function IntObject(props: ObjectViewProps) {
  return <TextObject {...props} type="Int" />;
}

export function StringObject(props: ObjectViewProps) {
  return <TextObject {...props} type="string" />;
}

function useColourCue(): ColourCue {
  return useSyncExternalStore(subscribeColourCue, getColourCue, () => "pattern");
}

const TOP_LEFT = { r: 0, c: 0 } as const;
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
    // Every rank is one character cell (the ten included, CellGlyph), so every cell of a grid draws at one size.
    fontSize: detail ? Math.round(px * 0.42) : px * 0.66,
    textShadow: showPattern ? `0 0 2px ${cell.css}, 0 0 1px ${cell.css}` : undefined,
    // Changed cells get an outline in the surrounding text colour (inherited), not a hue.
    ...(changed ? { outline: "2px solid currentColor", zIndex: 1 } : {}),
  };
  return (
    <span className="relative flex items-center justify-center font-mono font-semibold leading-none select-none" style={style} data-cell={`${cell.code}${cell.letter}`} data-changed={changed || undefined}>
      <span style={{ color: cell.ink, paddingBottom: detail ? Math.round(px * 0.12) : undefined }}>
        {detail ? <CellGlyph parts={cell.parts} /> : <RankGlyph parts={cell.parts} />}
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

/**
 * The digits renderer's compact form: one monospace line per row, each glyph in its colour's text shade
 * (`--cg-ink-<set>-<letter>`), no tiles. Every grid size draws its digits as DIGIT_TYPE (14 pt bold, WCAG large text):
 * the light shades are only 3:1 on the paper, and their thick strokes are what keep the colours apart at a distance.
 * Changed cells are underlined and bold, never marked by colour alone.
 * Laid out as a CSS grid of fixed-width cells (CellGlyph: every rank one character cell, the ten included, and every
 * suit a fixed box), so every column is the same width in every row, with or without tens, whatever font draws the
 * suits. Changed cells are underlined with a border: text decoration does not reach into the glyph's inline blocks.
 */
function Digits({ model, cue, changes, label }: { model: GridModel; cue: ColourCue; changes: boolean[][] | null; label: string }) {
  const lines = useMemo(() => gridDigitsLines(model, changes, { letters: cue === "letter" }), [model, changes, cue]);
  return (
    <span role="img" aria-label={label} className="inline-grid justify-items-end font-mono leading-[1.1] select-none"
      style={{ fontSize: DIGIT_TYPE.px, fontWeight: DIGIT_TYPE.weight, gridTemplateColumns: `repeat(${model.size}, auto)`, columnGap: "0.45ch" }} data-renderer="digits">
      {lines.flatMap((line, r) => line.cells.map((c, k) => (
          <span key={`${r}-${k}`} data-cell={`${model.rows[r][k].code}${c.letter}`} data-changed={c.changed || undefined}
            style={{
              color: textShadeVar(c.letter, model.colours),
              ...(c.changed ? { fontWeight: 800, boxShadow: "0 2px 0 currentColor" } : {}),
            }}>
            <CellGlyph parts={c.parts} letter={cue === "letter" ? c.letter : undefined} />
          </span>
      )))}
    </span>
  );
}

const toggleButton = (pressed: boolean) => `px-2 py-0.5 border text-xs ${pressed ? "bg-foreground text-background" : "hover:bg-muted"}`;

function CueToggle({ cue, mode }: { cue: ColourCue; mode: GridRendererId }) {
  const opt = (id: ColourCue, label: string) => (
    <button type="button" aria-pressed={cue === id} onClick={() => setColourCue(id)} className={toggleButton(cue === id)}
      data-testid={`button-colour-cue-${id}`}>{label}</button>
  );
  // Patterns need tiles; on digits the first option means "the colour alone".
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Colour cue in compact grids">
      <span className="text-xs text-muted-foreground mr-1">Colour cue</span>{opt("pattern", mode === "tiles" ? "Pattern" : "Colour only")}{opt("letter", "Letter")}
    </div>
  );
}

/** Switches every grid this viewer sees between the Grid renderers (remembered per browser). */
function RendererToggle({ mode }: { mode: GridRendererId }) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="How compact grids are drawn">
      <span className="text-xs text-muted-foreground mr-1">Display</span>
      {objectRenderers("Grid").map(r => (
        <button key={r.id} type="button" aria-pressed={mode === r.id} title={r.blurb} onClick={() => setObjectRenderer("Grid", r.id)}
          className={toggleButton(mode === r.id)} data-testid={`button-grid-renderer-${r.id}`}>{r.label}</button>
      ))}
    </div>
  );
}

/** The Grid renderers' ids: coloured digits (the default) or tiles. */
export type GridRendererId = "digits" | "tiles";
const asGridRenderer = (id: string | undefined): GridRendererId => (id === "tiles" ? "tiles" : "digits");

/** The Grid renderer in effect for this viewer, live (for palettes and menus). */
export function useGridRenderer(): GridRendererId {
  return asGridRenderer(useObjectRenderer("Grid"));
}

function GridView({ model, previous, typeLabel, className, mode, grid }: {
  model: GridModel; previous: GridModel | null; typeLabel?: string; className?: string; mode: GridRendererId; grid?: GridSettings;
}) {
  const cue = useColourCue();
  // The viewer's own goal, when the app provides it: the rich view explains this grid with it (annotations-design.md §3).
  const goal = useGoalExplainer();
  const explained = !!goal?.rich && model.strict && !!grid;
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const summary = useMemo(() => gridSummary(model), [model]);
  const changes = useMemo(() => changedCells(model, previous), [model, previous]);
  const nChanged = changes ? changes.flat().filter(Boolean).length : 0;
  const label = nChanged ? `${summary} ${nChanged} cell${nChanged === 1 ? "" : "s"} changed.` : summary;

  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = undefined; };
  const hoverIn = (e: PointerEvent) => { if (e.pointerType !== "mouse") return; clear(); if (!open) timer.current = setTimeout(() => setOpen(true), 120); };
  const hoverOut = (e: PointerEvent) => { if (e.pointerType !== "mouse" || pinned.current) return; clear(); timer.current = setTimeout(() => setOpen(false), 160); };

  const view = (
    <Popover.Root open={open} onOpenChange={(o) => { clear(); pinned.current = o; setOpen(o); }}>
      <Popover.Trigger asChild>
        <button type="button" data-object-type="Grid" data-renderer={mode} data-testid="grid-object"
          className={`inline-flex align-middle rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${className ?? ""}`}
          onPointerEnter={hoverIn} onPointerLeave={hoverOut}
          onClick={(e) => {
            // Click pins a hover-opened view, or toggles; Radix's own toggle is skipped.
            e.preventDefault(); clear();
            if (open && !pinned.current) { pinned.current = true; return; }
            pinned.current = !open; setOpen(!open);
          }}>
          {mode === "digits"
            ? <Digits model={model} cue={cue} changes={changes} label={label} />
            : <Cells model={model} px={compactPx(model.size)} cue={cue} changes={changes} detail={false} label={label} />}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="start" sideOffset={6} collisionPadding={8}
          onOpenAutoFocus={(e) => { if (!pinned.current) e.preventDefault(); }}
          onPointerEnter={clear} onPointerLeave={hoverOut}
          aria-label={`Grid ${model.size} by ${model.size} details`}
          className={`z-50 ${explained ? "w-[min(calc(100vw-16px),46rem)] max-h-[min(90vh,48rem)]" : "w-[min(calc(100vw-16px),22rem)] max-h-[min(80vh,36rem)]"} overflow-auto border bg-popover text-popover-foreground shadow-lg p-3 space-y-3 text-left whitespace-normal font-sans`}
          data-testid="grid-object-detail">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">Grid {model.size}×{model.size}</span>
            {typeLabel && <span className="font-mono text-xs text-muted-foreground truncate">{typeLabel}</span>}
          </div>
          {explained
            ? <GoalBoard goal={goal!} value={model.canonical} grid={grid!} initialFocus={TOP_LEFT} changed={changes} steady testId="grid-object-goal" />
            : <div className="flex justify-center"><Cells model={model} px={detailPx(model.size)} cue={cue} changes={changes} detail /></div>}
          {changes && <p className="text-xs text-muted-foreground">{nChanged ? `${nChanged} cell${nChanged === 1 ? "" : "s"} changed (outlined).` : "No cells changed."}</p>}
          <code className="block font-mono text-xs break-all bg-muted px-2 py-1 select-all" data-testid="grid-object-canonical">{model.canonical}</code>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <RendererToggle mode={mode} />
            <CueToggle cue={cue} mode={mode} />
          </div>
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
  return view;
}

/**
 * Both Grid renderers: `renderer` "tiles" draws tiles, anything else coloured digits. One component serves both so
 * an open detail view stays open when the viewer switches the display from inside it.
 */
export function GridObject(props: ObjectViewProps) {
  const { value, compareTo, grid, className } = props;
  const mode = asGridRenderer(props.renderer);
  const key = `${grid?.size}|${grid?.symbols}|${grid?.colours}`;
  const model = useMemo(() => gridModel(value, grid), [value, key]);
  const previous = useMemo(() => (compareTo === undefined ? null : gridModel(compareTo, grid)), [compareTo, key]);
  if (!model) return <StringObject {...props} />;
  const typeLabel = grid?.size && grid.symbols && grid.colours ? `Grid(${grid.size},${grid.symbols},${grid.colours})` : undefined;
  return <GridView model={model} previous={previous} typeLabel={typeLabel} className={className} mode={mode} grid={grid} />;
}

// Built-in types. Later registrations are tried first when inferring, so Grid wins over string.
objectViews.register({ type: "string", infer: (v) => typeof v === "string",
  renderers: [{ id: "text", label: "Text", blurb: "The string in quotes, so spaces and symbols stay visible.", Component: StringObject }] });
objectViews.register({ type: "Int", infer: (v) => typeof v === "number",
  renderers: [{ id: "text", label: "Text", blurb: "The number.", Component: IntObject }] });
objectViews.register({ type: "Grid", infer: looksLikeGrid, defaultRenderer: "digits", renderers: [
  { id: "digits", label: "Digits", blurb: "Rows of coloured digits (cards: rank and suit), compact enough for lists.", Component: GridObject },
  { id: "tiles", label: "Tiles", blurb: "A small board of coloured tiles, with a pattern or letter for each colour.", Component: GridObject },
] satisfies (ObjectRenderer & { id: GridRendererId })[] });

/** Native tooltip text for a value's container: the text form, or undefined for grids (they have their own detail view). */
export function objectTitle(value: ObjectValue, context?: ObjectContext): string | undefined {
  const entry = objectViews.resolve(value, context);
  return entry?.type === "Grid" && gridModel(value, context?.grid) ? undefined : objectText(value);
}

/**
 * Renders any object value with its type's renderer: the `renderer` prop when the type has it, else the
 * viewer's choice for the type, else the type's default. Redraws when the viewer switches. The component
 * receives the chosen renderer's id as `renderer`, so one component may serve several renderers.
 */
export function ObjectView(props: ObjectViewProps) {
  const entry = objectViews.resolve(props.value, props);
  const chosen = useObjectRenderer(entry?.type ?? "");
  const picked = entry ? objectViews.pick(entry.type, props.renderer ?? chosen) : undefined;
  const Component = picked?.Component ?? StringObject;
  return <Component {...props} renderer={picked?.id ?? props.renderer} />;
}

/** The `ObjectView` context for a resolved instantiation (the API's `InstanceInfo`). */
export function objectContext(instance: { objectType: string; args: { [key: string]: number | string } } | undefined | null): ObjectContext {
  if (!instance) return {};
  return instance.objectType === "Grid"
    ? { objectType: "Grid", grid: instance.args as GridSettings }
    : { objectType: instance.objectType };
}

/** One transformation: the before and after objects; grids outline the cells that changed. */
export function TransformationView({ before, after, className = "", ...context }: ObjectContext & { before: ObjectValue; after: ObjectValue; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`} data-testid="transformation">
      <span className="opacity-80 min-w-0 truncate"><ObjectView value={before} {...context} /></span>
      <span aria-label="became" className="text-primary">→</span>
      <span className="min-w-0 truncate font-semibold"><ObjectView value={after} compareTo={before} {...context} /></span>
    </span>
  );
}
