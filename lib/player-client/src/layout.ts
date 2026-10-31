/**
 * The player client's dock layout (docs/ui-redesign.md §2.3): a library-independent tree of split groups and tabbed
 * pane groups, stored per human per room (`dockLayouts`), edited by the human through drag and drop and the palette,
 * and by the assistant through the layout tools. The engine validates with `parseLayout` (never throws) and applies
 * the same pure operations the client uses, so a tool call and a drag never disagree about the shape.
 *
 * Sizes are weights (they sum to 100 in every split), never pixels. Exactly one `assistant` pane, never closable;
 * 1–4 lens panes; stored panels and (in dev containers) file panels are panes too.
 */
import { z } from "zod/v4";
import { defaultLensFor, defaultLensParams, isLensId, lensSummary, parseLensParams, type LensId, type Phase } from "./lenses.ts";

export type SetBy = "default" | "human" | "assistant";
export type Pane =
  | { id: string; kind: "lens"; lensId: LensId; params: Record<string, unknown>; setBy: SetBy }
  | { id: string; kind: "assistant" }
  | { id: string; kind: "stored-panel"; slug: string }
  | { id: string; kind: "file-panel"; fileId: string };
export type Direction = "row" | "column";
export type Node =
  | { type: "split"; direction: Direction; sizes: number[]; children: Node[] }
  | { type: "tabs"; panes: string[]; active: string };
export type DockLayout = { version: 1; root: Node; panes: Record<string, Pane> };
export type Place = { relativeTo?: string; direction: "left" | "right" | "above" | "below" | "tab" };

export const LAYOUT_LIMITS = { panes: 12, lensPanes: 4, depth: 6, bytes: 32 * 1024, writesPerMinute: 12 } as const;

/** A refused operation; the engine maps `code` to its ConvexError codes. */
export class LayoutError extends Error {
  readonly code: "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST";
  constructor(code: LayoutError["code"], message: string) { super(message); this.code = code; }
}

// ---------------------------------------------------------------------------------------------
// Schemas (structure only; semantics are checked by parseLayout)
// ---------------------------------------------------------------------------------------------

const paneId = z.string().min(1).max(64);
const setBySchema = z.enum(["default", "human", "assistant"]);
export const placeSchema = z.strictObject({ relativeTo: paneId.optional(), direction: z.enum(["left", "right", "above", "below", "tab"]) });
const paneSchema = z.discriminatedUnion("kind", [
  // lensId, params and setBy are repaired by parseLayout, not refused here.
  z.object({ id: paneId, kind: z.literal("lens"), lensId: z.unknown(), params: z.unknown().optional(), setBy: z.unknown().optional() }),
  z.object({ id: paneId, kind: z.literal("assistant") }),
  z.object({ id: paneId, kind: z.literal("stored-panel"), slug: z.string().min(1).max(64) }),
  z.object({ id: paneId, kind: z.literal("file-panel"), fileId: z.string().min(1).max(128) }),
]);
const nodeSchema: z.ZodType<Node> = z.lazy(() => z.union([
  z.object({ type: z.literal("split"), direction: z.enum(["row", "column"]), sizes: z.array(z.number().finite().min(0)), children: z.array(nodeSchema).max(LAYOUT_LIMITS.panes) }),
  z.object({ type: z.literal("tabs"), panes: z.array(paneId).max(LAYOUT_LIMITS.panes), active: z.string() }),
])) as z.ZodType<Node>;
const layoutSchema = z.object({ version: z.literal(1), root: nodeSchema, panes: z.record(paneId, paneSchema) });

// ---------------------------------------------------------------------------------------------
// Reading a layout
// ---------------------------------------------------------------------------------------------

/** Pane ids in reading order (depth first, left/top first). */
export function paneOrder(root: Node): string[] {
  return root.type === "tabs" ? [...root.panes] : root.children.flatMap(paneOrder);
}
export const panesOf = (layout: DockLayout): Pane[] => paneOrder(layout.root).map(id => layout.panes[id]).filter((p): p is Pane => !!p);
export const lensPanesOf = (layout: DockLayout) => panesOf(layout).filter((p): p is Extract<Pane, { kind: "lens" }> => p.kind === "lens");
export const assistantPaneOf = (layout: DockLayout) => panesOf(layout).find(p => p.kind === "assistant");

function depthOf(node: Node): number {
  return node.type === "tabs" ? 1 : 1 + Math.max(0, ...node.children.map(depthOf));
}
function contains(node: Node, id: string): boolean {
  return node.type === "tabs" ? node.panes.includes(id) : node.children.some(c => contains(c, id));
}

/**
 * Is the assistant beside the lenses ("row": left or right) or above/below them ("column")? Decided at the first
 * split, from the root, where the assistant's branch parts from a branch holding a lens pane. "column" when the
 * assistant shares a tab group with lenses or there is no assistant.
 */
export function assistantSide(layout: DockLayout): Direction {
  const assistant = assistantPaneOf(layout);
  if (!assistant) return "column";
  const lensIds = new Set(lensPanesOf(layout).map(p => p.id));
  let node = layout.root;
  while (node.type === "split") {
    const branch = node.children.find(c => contains(c, assistant.id));
    if (!branch) return "column";
    if (node.children.some(c => c !== branch && paneOrder(c).some(id => lensIds.has(id)))) return node.direction;
    node = branch;
  }
  return "column";
}

/** The pane caption: a lens's summary, or what the other kinds are. */
export function paneCaption(pane: Pane): string {
  switch (pane.kind) {
    case "lens": return lensSummary(pane.lensId, pane.params);
    case "assistant": return "Your assistant (private)";
    case "stored-panel": return `Stored panel ${pane.slug}`;
    case "file-panel": return `File panel ${pane.fileId}`;
  }
}

// ---------------------------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------------------------

const EPSILON = 1e-9;
function rescale(sizes: number[], count: number): number[] {
  const given = sizes.slice(0, count).map(s => (Number.isFinite(s) && s > 0 ? s : 0));
  while (given.length < count) given.push(0);
  const total = given.reduce((a, b) => a + b, 0);
  if (total < EPSILON) return given.map(() => 100 / count);
  // Zero weights get a visible share, so a pane never vanishes.
  const floor = Math.min(5, 100 / count / 2);
  const padded = given.map(s => (s < EPSILON ? floor : s));
  const sum = padded.reduce((a, b) => a + b, 0);
  return padded.map(s => Math.round((s / sum) * 100 * 1000) / 1000);
}

/** Drop empty groups, collapse single-child splits, merge nested same-direction splits, fix sizes and active tabs. */
function normalise(node: Node, known: ReadonlySet<string>): Node | null {
  if (node.type === "tabs") {
    const panes = [...new Set(node.panes.filter(id => known.has(id)))];
    if (!panes.length) return null;
    return { type: "tabs", panes, active: panes.includes(node.active) ? node.active : panes[0] };
  }
  const children: Node[] = [];
  const sizes: number[] = [];
  const scaled = rescale(node.sizes, node.children.length);
  node.children.forEach((child, i) => {
    const kept = normalise(child, known);
    if (!kept) return;
    if (kept.type === "split" && kept.direction === node.direction) {
      kept.children.forEach((grand, j) => { children.push(grand); sizes.push((scaled[i] * kept.sizes[j]) / 100); });
    } else { children.push(kept); sizes.push(scaled[i]); }
  });
  if (!children.length) return null;
  if (children.length === 1) return children[0];
  return { type: "split", direction: node.direction, sizes: rescale(sizes, children.length), children };
}

function normaliseLayout(layout: DockLayout): DockLayout {
  const known = new Set(Object.keys(layout.panes));
  const root = normalise(layout.root, known) ?? { type: "tabs" as const, panes: [], active: "" };
  const used = new Set(paneOrder(root));
  const panes = Object.fromEntries(Object.entries(layout.panes).filter(([id]) => used.has(id)));
  return { version: 1, root, panes };
}

// ---------------------------------------------------------------------------------------------
// Defaults and presets
// ---------------------------------------------------------------------------------------------

const lensPane = (id: string, lensId: LensId, setBy: SetBy = "default"): Pane => ({ id, kind: "lens", lensId, params: defaultLensParams(lensId) ?? {}, setBy });
const tabs = (...panes: string[]): Node => ({ type: "tabs", panes, active: panes[0] });
const split = (direction: Direction, sizes: number[], children: Node[]): Node => ({ type: "split", direction, sizes, children });

/** One lens (the phase's default) on top, the assistant below, 50/50. */
export const DEFAULT_LAYOUT = (phase: Phase): DockLayout => ({
  version: 1,
  root: split("column", [50, 50], [tabs("p1"), tabs("p2")]),
  panes: { p1: lensPane("p1", defaultLensFor(phase)), p2: { id: "p2", kind: "assistant" } },
});

/** A fresh pane id: p<n> past every number in use. */
export function nextPaneId(layout: DockLayout, prefix = "p"): string {
  const used = new Set(Object.keys(layout.panes));
  let n = Object.keys(layout.panes).reduce((max, id) => { const m = /^p(\d+)$/.exec(id); return m ? Math.max(max, Number(m[1])) : max; }, 0) + 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** The panes of a layout regrouped: `groups` of lens panes (each a tab group) plus the other panes as one tab group each. */
function regroup(current: DockLayout, build: (lensGroups: Node[], others: Node[], assistant: Node) => Node, lensGroups: (lenses: string[]) => string[][]): DockLayout {
  const assistant = assistantPaneOf(current);
  let panes = { ...current.panes };
  let assistantId = assistant?.id;
  if (!assistantId) { assistantId = nextPaneId({ ...current, panes }); panes = { ...panes, [assistantId]: { id: assistantId, kind: "assistant" } }; }
  const lenses = lensPanesOf(current).map(p => p.id);
  const others = panesOf(current).filter(p => p.kind === "stored-panel" || p.kind === "file-panel").map(p => tabs(p.id));
  const groups = lensGroups(lenses).filter(g => g.length).map(g => tabs(...g));
  return normaliseLayout({ version: 1, root: build(groups, others, tabs(assistantId)), panes });
}
/** Layout presets the palette and the assistant apply to the current layout; lens panes are kept, never dropped. */
export const PRESET_LAYOUTS: Record<"stacked" | "side-by-side" | "two-lenses", (current: DockLayout) => DockLayout> = {
  /** Every lens as tabs in one group on top, the assistant below (the default shape). */
  stacked: current => {
    const out = regroup(current, (groups, others, assistant) => split("column", [50, 50], [split("row", [], [...groups, ...others]), assistant]), lenses => [lenses]);
    return ensureLens(out);
  },
  /** Lenses left (62 %), the assistant right. */
  "side-by-side": current => ensureLens(regroup(current, (groups, others, assistant) => split("row", [62, 38], [split("column", [], [...groups, ...others]), assistant]), lenses => [lenses])),
  /** Two lens groups stacked on the left, the assistant right; a second lens is opened when there is only one. */
  "two-lenses": current => {
    let layout = ensureLens(current);
    if (lensPanesOf(layout).length < 2) {
      const first = lensPanesOf(layout)[0];
      layout = openPane(layout, lensPane("", first.lensId === "objects" ? "race" : "objects"), { relativeTo: first.id, direction: "below" }).layout;
    }
    return regroup(layout, (groups, others, assistant) => split("row", [62, 38], [split("column", [50, 50], [...groups, ...others]), assistant]),
      lenses => [[lenses[0]], lenses.slice(1)]);
  },
};

/** A layout with at least one lens pane (the default lens above everything else when none is left). */
function ensureLens(layout: DockLayout, phase: Phase = "running"): DockLayout {
  if (lensPanesOf(layout).length) return layout;
  const id = nextPaneId(layout);
  return normaliseLayout({ version: 1, root: split("column", [50, 50], [tabs(id), layout.root]), panes: { ...layout.panes, [id]: lensPane(id, defaultLensFor(phase)) } });
}
/** A layout with exactly one assistant pane (added below everything else when missing). */
function ensureAssistant(layout: DockLayout): DockLayout {
  if (assistantPaneOf(layout)) return layout;
  const id = nextPaneId(layout);
  return normaliseLayout({ version: 1, root: split("column", [60, 40], [layout.root, tabs(id)]), panes: { ...layout.panes, [id]: { id, kind: "assistant" } } });
}

// ---------------------------------------------------------------------------------------------
// parseLayout: never throws
// ---------------------------------------------------------------------------------------------

export type ParseContext = { phase: Phase; storedSlugs: readonly string[]; fileIds?: readonly string[] };

/**
 * A stored or submitted layout made safe to render: unknown lenses become the phase's default lens, invalid lens
 * parameters their defaults, unknown stored panels and files are dropped, duplicate assistants and pane ids are
 * removed, the tree is normalised and bounded, and a missing assistant or lens pane is added. Anything structurally
 * wrong (or too large or too deep) yields DEFAULT_LAYOUT(phase). Every repair is named in `warnings`.
 */
export function parseLayout(raw: unknown, ctx: ParseContext): { layout: DockLayout; warnings: string[] } {
  const warnings: string[] = [];
  const reset = (why: string) => { warnings.push(`layout reset: ${why}`); return { layout: DEFAULT_LAYOUT(ctx.phase), warnings }; };
  let text: string;
  try { text = JSON.stringify(raw) ?? ""; } catch { return reset("not serialisable"); }
  if (text.length > LAYOUT_LIMITS.bytes) return reset(`larger than ${LAYOUT_LIMITS.bytes} bytes`);
  const parsed = layoutSchema.safeParse(raw);
  if (!parsed.success) return reset(parsed.error.issues.slice(0, 3).map(i => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "));
  if (depthOf(parsed.data.root) > LAYOUT_LIMITS.depth) return reset(`deeper than ${LAYOUT_LIMITS.depth} levels`);

  const panes: Record<string, Pane> = {};
  let assistantSeen = false, lensCount = 0;
  for (const id of paneOrder(parsed.data.root)) {
    const pane = parsed.data.panes[id];
    if (!pane) { warnings.push(`pane ${id}: not defined, removed`); continue; }
    if (panes[id]) { warnings.push(`pane ${id}: listed twice, the first place is kept`); continue; }
    if (pane.id !== id) { warnings.push(`pane ${id}: id mismatch, repaired`); }
    switch (pane.kind) {
      case "assistant":
        if (assistantSeen) { warnings.push(`pane ${id}: a second assistant pane, removed`); continue; }
        assistantSeen = true;
        panes[id] = { id, kind: "assistant" };
        break;
      case "lens": {
        if (lensCount >= LAYOUT_LIMITS.lensPanes) { warnings.push(`pane ${id}: more than ${LAYOUT_LIMITS.lensPanes} lens panes, removed`); continue; }
        lensCount++;
        let lensId: LensId, params: Record<string, unknown>;
        let setBy: SetBy = "default";
        if (pane.setBy !== undefined) {
          if (setBySchema.safeParse(pane.setBy).success) setBy = pane.setBy as SetBy;
          else warnings.push(`pane ${id}: unknown setBy, default used`);
        }
        if (!isLensId(pane.lensId)) {
          warnings.push(`pane ${id}: unknown lens "${String(pane.lensId).slice(0, 40)}", showing ${defaultLensFor(ctx.phase)}`);
          lensId = defaultLensFor(ctx.phase); params = defaultLensParams(lensId) ?? {}; setBy = "default";
        } else {
          lensId = pane.lensId;
          const result = parseLensParams(lensId, pane.params);
          if (result.ok) params = result.params;
          else {
            const defaults = defaultLensParams(lensId);
            if (defaults) { params = defaults; warnings.push(`pane ${id}: invalid ${lensId} parameters (${result.issues.join("; ")}), defaults used`); }
            else { warnings.push(`pane ${id}: ${lensId} needs its parameters (${result.issues.join("; ")}), showing ${defaultLensFor(ctx.phase)}`); lensId = defaultLensFor(ctx.phase); params = defaultLensParams(lensId) ?? {}; setBy = "default"; }
          }
        }
        panes[id] = { id, kind: "lens", lensId, params, setBy };
        break;
      }
      case "stored-panel":
        if (!ctx.storedSlugs.includes(pane.slug)) { warnings.push(`pane ${id}: no stored panel "${pane.slug}", removed`); continue; }
        panes[id] = { id, kind: "stored-panel", slug: pane.slug };
        break;
      case "file-panel":
        if (ctx.fileIds && !ctx.fileIds.includes(pane.fileId)) { warnings.push(`pane ${id}: no file panel "${pane.fileId}", removed`); continue; }
        panes[id] = { id, kind: "file-panel", fileId: pane.fileId };
        break;
    }
  }
  for (const id of Object.keys(parsed.data.panes)) if (!paneOrder(parsed.data.root).includes(id)) warnings.push(`pane ${id}: not placed, removed`);
  if (Object.keys(panes).length > LAYOUT_LIMITS.panes) return reset(`more than ${LAYOUT_LIMITS.panes} panes`);

  let layout = normaliseLayout({ version: 1, root: parsed.data.root, panes });
  if (!assistantPaneOf(layout)) { warnings.push("no assistant pane, added below"); layout = ensureAssistant(layout); }
  if (!lensPanesOf(layout).length) { warnings.push(`no lens pane, ${defaultLensFor(ctx.phase)} added above`); layout = ensureLens(layout, ctx.phase); }
  return { layout: followPhase(layout, ctx.phase), warnings };
}

// ---------------------------------------------------------------------------------------------
// Operations (pure; they throw LayoutError when refused)
// ---------------------------------------------------------------------------------------------

function requirePane(layout: DockLayout, id: string): Pane {
  const pane = layout.panes[id];
  if (!pane || !contains(layout.root, id)) throw new LayoutError("NOT_FOUND", `No pane ${id}`);
  return pane;
}
function activateIn(node: Node, id: string): Node {
  if (node.type === "tabs") return node.panes.includes(id) ? { ...node, active: id } : node;
  return { ...node, children: node.children.map(c => activateIn(c, id)) };
}
/** Bring a pane to the front of its tab group. */
export function activatePane(layout: DockLayout, paneId: string): DockLayout {
  requirePane(layout, paneId);
  return { ...layout, root: activateIn(layout.root, paneId) };
}

/** Insert `fresh` next to the tab group holding `target`. */
function insertNode(node: Node, target: string, fresh: string, direction: Place["direction"]): Node {
  if (node.type === "tabs") {
    if (!node.panes.includes(target)) return node;
    if (direction === "tab") return { type: "tabs", panes: [...node.panes, fresh], active: fresh };
    const group = tabs(fresh);
    const first = direction === "left" || direction === "above";
    return split(direction === "left" || direction === "right" ? "row" : "column", [50, 50], first ? [group, node] : [node, group]);
  }
  return { ...node, children: node.children.map(c => insertNode(c, target, fresh, direction)) };
}
function removeNode(node: Node, id: string): Node {
  if (node.type === "tabs") return { ...node, panes: node.panes.filter(p => p !== id) };
  return { ...node, children: node.children.map(c => removeNode(c, id)) };
}

/** Where a new pane goes when the caller gives no place (docs/ui-redesign.md §2.3). */
function defaultPlace(layout: DockLayout, pane: Pane): Place {
  const lenses = lensPanesOf(layout);
  const last = lenses.at(-1);
  if (!last) {
    const assistant = assistantPaneOf(layout) ?? panesOf(layout).at(-1);
    return assistant ? { relativeTo: assistant.id, direction: "above" } : { direction: "tab" };
  }
  return { relativeTo: last.id, direction: assistantSide(layout) === "row" ? "below" : "right" };
}

/**
 * Add a pane. A fifth lens pane, a second assistant or a 13th pane is refused (CONFLICT). `pane.id` is replaced by a
 * fresh id when empty or taken. Returns the new pane's id.
 */
export function openPane(layout: DockLayout, pane: Pane, place?: Place): { layout: DockLayout; paneId: string } {
  if (pane.kind === "assistant" && assistantPaneOf(layout)) throw new LayoutError("CONFLICT", "There is already an assistant pane");
  if (Object.keys(layout.panes).length >= LAYOUT_LIMITS.panes) throw new LayoutError("CONFLICT", `At most ${LAYOUT_LIMITS.panes} panes; close one first`);
  const want = place ?? defaultPlace(layout, pane);
  if (want.relativeTo !== undefined) requirePane(layout, want.relativeTo);
  const direction = want.direction;
  // parseLayout drops lens panes past the limit, so a fifth one is refused here rather than silently lost later.
  if (pane.kind === "lens" && lensPanesOf(layout).length >= LAYOUT_LIMITS.lensPanes) {
    throw new LayoutError("CONFLICT", `At most ${LAYOUT_LIMITS.lensPanes} lens panes; change a pane's lens (set_lens_params or the lens menu) or close one first`);
  }
  const id = pane.id && !layout.panes[pane.id] ? pane.id : nextPaneId(layout);
  const fresh: Pane = { ...pane, id } as Pane;
  const panes = { ...layout.panes, [id]: fresh };
  if (!Object.keys(layout.panes).length) return { layout: normaliseLayout({ version: 1, root: tabs(id), panes }), paneId: id };
  const target = want.relativeTo ?? defaultPlace(layout, pane).relativeTo ?? paneOrder(layout.root).at(-1)!;
  if (!layout.panes[target]) throw new LayoutError("NOT_FOUND", `No pane ${target}`);
  const root = insertNode(layout.root, target, id, direction);
  return { layout: normaliseLayout({ version: 1, root, panes }), paneId: id };
}

/** Move a pane next to another (or into its tab group). */
export function movePane(layout: DockLayout, paneId: string, place: Place): DockLayout {
  requirePane(layout, paneId);
  const target = place.relativeTo ?? defaultPlace({ ...layout, root: removeNode(layout.root, paneId) }, layout.panes[paneId]).relativeTo;
  if (!target) throw new LayoutError("BAD_REQUEST", "Nothing to place the pane next to");
  if (target === paneId) throw new LayoutError("BAD_REQUEST", "A pane cannot be placed next to itself");
  requirePane(layout, target);
  const without = removeNode(layout.root, paneId);
  const root = insertNode(without, target, paneId, place.direction);
  return normaliseLayout({ version: 1, root, panes: layout.panes });
}

/** Close a pane; the assistant and the last lens pane stay. */
export function closePane(layout: DockLayout, paneId: string): DockLayout {
  const pane = requirePane(layout, paneId);
  if (pane.kind === "assistant") throw new LayoutError("CONFLICT", "The assistant pane cannot be closed");
  if (pane.kind === "lens" && lensPanesOf(layout).length <= 1) throw new LayoutError("CONFLICT", "The last lens pane cannot be closed; change its lens instead");
  const { [paneId]: _closed, ...panes } = layout.panes;
  return normaliseLayout({ version: 1, root: removeNode(layout.root, paneId), panes });
}

/** Set a lens pane's parameters (validated against its lens; the output has every default filled in). */
export function setPaneParams(layout: DockLayout, paneId: string, params: Record<string, unknown>, setBy: SetBy): DockLayout {
  const pane = requirePane(layout, paneId);
  if (pane.kind !== "lens") throw new LayoutError("BAD_REQUEST", `Pane ${paneId} is not a lens`);
  const parsed = parseLensParams(pane.lensId, params);
  if (!parsed.ok) throw new LayoutError("BAD_REQUEST", `Invalid ${pane.lensId} parameters: ${parsed.issues.join("; ")}`);
  return { ...layout, panes: { ...layout.panes, [paneId]: { ...pane, params: parsed.params, setBy } } };
}

/** Change a lens pane's lens (the human's dropdown): the lens's defaults, with the given setBy. */
export function setPaneLens(layout: DockLayout, paneId: string, lensId: LensId, setBy: SetBy, params?: Record<string, unknown>): DockLayout {
  const pane = requirePane(layout, paneId);
  if (pane.kind !== "lens") throw new LayoutError("BAD_REQUEST", `Pane ${paneId} is not a lens`);
  const parsed = parseLensParams(lensId, params);
  if (!parsed.ok) throw new LayoutError("BAD_REQUEST", `Invalid ${lensId} parameters: ${parsed.issues.join("; ")}`);
  return { ...layout, panes: { ...layout.panes, [paneId]: { id: paneId, kind: "lens", lensId, params: parsed.params, setBy } } };
}

/**
 * The layout a human carries into another room: the same arrangement with every lens's parameters reset (they name
 * one game's objects) and `setBy: "default"` (so the first pane follows the new room's phase); stored panels stay
 * (they belong to the human across rooms). A lens that needs parameters (what-if) becomes the overview.
 */
export function carryLayout(layout: DockLayout): DockLayout {
  const panes = Object.fromEntries(Object.entries(layout.panes).map(([id, pane]) => [id, pane.kind === "lens" ? lensPane(id, survivesReset(pane.lensId)) : pane]));
  return { ...layout, panes };
}

/** A lens whose parameters can be reset to defaults keeps its lens; one that needs parameters (what-if) becomes the overview. */
const survivesReset = (lensId: LensId): LensId => (defaultLensParams(lensId) ? lensId : "overview");

/**
 * The same layout when a new game starts in the room: every lens keeps its lens and who chose it, but its parameters
 * go back to the defaults (they named the previous game's objects); a lens that cannot show anything without
 * parameters becomes the overview.
 */
export function resetLensParams(layout: DockLayout): DockLayout {
  const panes = Object.fromEntries(Object.entries(layout.panes).map(([id, pane]) => {
    if (pane.kind !== "lens") return [id, pane];
    const lensId = survivesReset(pane.lensId);
    return [id, { ...pane, lensId, params: defaultLensParams(lensId) ?? {} }];
  }));
  return { ...layout, panes };
}

/**
 * The first lens pane follows the phase's default lens while nobody (neither the player nor the assistant) chose its
 * lens (`setBy: "default"`); every other pane is left alone. Part of parseLayout, so the engine's view and the client's
 * agree.
 */
export function followPhase(layout: DockLayout, phase: Phase): DockLayout {
  const first = lensPanesOf(layout)[0];
  const lensId = defaultLensFor(phase);
  if (!first || first.setBy !== "default" || first.lensId === lensId) return layout;
  return { ...layout, panes: { ...layout.panes, [first.id]: { ...first, lensId, params: defaultLensParams(lensId) ?? {} } } };
}

/** One line per pane for the assistant's briefing: "[p1] objects — Top 12 by payoff (set by you)". */
export function describeLayout(layout: DockLayout): string[] {
  const side = assistantSide(layout) === "row" ? "beside" : "below";
  return panesOf(layout).map(pane => {
    if (pane.kind === "assistant") return `[${pane.id}] this conversation (${side} the lenses)`;
    if (pane.kind !== "lens") return `[${pane.id}] ${paneCaption(pane)}`;
    const by = pane.setBy === "assistant" ? "set by you" : pane.setBy === "human" ? "chosen by the player" : "default";
    return `[${pane.id}] ${pane.lensId} — ${paneCaption(pane)} (${by})`;
  });
}

