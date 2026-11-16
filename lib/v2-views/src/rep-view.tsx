/**
 * One representation of one line of an object, drawn by its scene's renderer, and the one-line chip. These are the
 * building blocks of the faces (faces.tsx): the compact face is a RepView of the rule's primary representation; the
 * expanded face shows several side by side.
 */
import type { ReactElement } from "react";
import { elementDecl, elementValue, refKey, representation, type ElementRef, type ElementValue, type GridScene, type Mark, type ObjectType, type SceneData, type Term } from "@workspace/v2-core";
import { markRefs, marksForRep, meaningKey, projectRef } from "./refs.ts";
import { labelWithArgs, typesetNote } from "./format.ts";
import { rendererFor, type DrawSize } from "./scene.ts";
import "./render/register.ts";
import { isSingleLine } from "./render/equation.tsx";
import { isGivenOnly } from "./equation-text.ts";

/** Element values of a state; a value that cannot be computed reads as undefined with the reason. */
export function valuesOf<S>(type: ObjectType<S>, state: S, site: number): (r: ElementRef) => ElementValue {
  const cache = new Map<string, ElementValue>();
  return r => {
    const k = refKey(r, true) + `@${site}`;
    let v = cache.get(k);
    if (!v) {
      try { v = elementValue(type, state, r, site); } catch (e) { v = { kind: "undefined", reason: (e as Error).message }; }
      cache.set(k, v);
    }
    return v;
  };
}

export function labelOf<S>(type: ObjectType<S>, r: ElementRef): string {
  try {
    const d = elementDecl(type, r);
    return labelWithArgs(d.label, r.args);
  } catch { return refKey(r); }
}

export interface RepViewProps<S> {
  readonly type: ObjectType<S>;
  readonly state: S;
  readonly rep: string;
  readonly size: DrawSize;
  readonly site?: number;
  /** Marks of the viewer's rule on this site (any representation: only this one's are drawn). */
  readonly marks?: readonly Mark[];
  readonly terms?: readonly Term[];
  /** A previous state: changed elements are emphasised. */
  readonly before?: S;
  /** The state after the nearest improvement, drawn as a hint where the scene can (a dashed line on the plane). */
  readonly next?: S;
  readonly highlight?: string | null;
  readonly onHover?: (meaning: string | null, ref: ElementRef | null) => void;
  /** Accessible name of the drawing. */
  readonly label?: string;
  /** The elements each part of the viewer's rule reads (its sources): badged here and wherever they project by meaning. */
  readonly roles?: readonly { readonly ref: ElementRef; readonly role: "main" | "tb" }[];
  /** The parts of the viewer's rule with their marks: a mark is drawn with its part's glyph, so a mark never relies on colour. */
  readonly parts?: readonly { readonly depth: number; readonly marks: readonly Mark[] }[];
}

/**
 * The marks a grid representation draws: its own elements', and the focus a rule puts on the board's cells it shows
 * (a cell's notes are said under the board itself, not repeated under every view of it).
 */
function gridMarks(repId: string, scene: GridScene, marks: readonly Mark[]): readonly Mark[] {
  const cells = new Set(scene.cells.map(r => refKey({ ...r, site: undefined })));
  return marks.filter(m => markRefs(m).every(r => r.rep === repId || (m.kind === "focus" && cells.has(refKey({ ...r, site: undefined })))));
}

/** A mark's part's depth (0: the main part), by identity: a mark is in at most one part (annotate.ts). */
function markDepthOf(parts: NonNullable<RepViewProps<unknown>["parts"]>): (m: Mark) => number | null {
  const by = new Map<Mark, number>();
  for (const p of parts) for (const m of p.marks) by.set(m, p.depth);
  return m => by.get(m) ?? null;
}

/** The marks with their notes' fractions typeset, once, so every view and its bookkeeping read the same text. */
const typesetMarks = (marks: readonly Mark[]): readonly Mark[] =>
  marks.some(m => m.kind === "note" && /\d\/\d/.test(m.text)) ? marks.map(m => (m.kind === "note" ? { ...m, text: typesetNote(m.text) } : m)) : marks;

export function RepView<S>(props: RepViewProps<S>): ReactElement {
  const { type, state, rep: repId, size } = props;
  const site = props.site ?? 0;
  const rep = representation(type, repId);
  const renderer = rendererFor(rep.scene);
  const scene = rep.layout(state, site);
  const values = valuesOf(type, state, site);
  const meaningOf = (r: ElementRef) => meaningKey(type, r);
  // An element is badged when a part reads it, or reads what it means in another view (si.c and the plane's y-intercept).
  const roleKeys = new Map<string, "main" | "tb">();
  for (const { ref, role } of props.roles ?? []) {
    for (const r of [ref, ...projectRef(type, ref, [repId])]) {
      const k = refKey({ ...r, site: undefined });
      if (!roleKeys.has(k) || role === "main") roleKeys.set(k, role);
    }
  }
  const roleOf = roleKeys.size ? (r: ElementRef) => roleKeys.get(refKey({ ...r, site: undefined })) ?? null : undefined;
  if (!renderer) {
    return <div className="v2v-rep" data-size={size} data-rep={repId}><div className="v2v-undef">{rep.title}: no drawing for “{rep.scene}” yet</div></div>;
  }
  // A view that cannot show this object (a vertical line has no y = mx + c) names it first ("x = 3"), so a reader knows
  // what it is before reading why the view has nothing to draw.
  const chip = chipRep(type, state, undefined, site);
  const worked = scene.kind === "equation" && !isSingleLine(scene as never);
  const named = expresses(type, state, repId, site) || worked || chip === repId || !expresses(type, state, chip, site) ? null : repText(type, state, chip, site);
  return (
    <div className="v2v-rep" data-size={size} data-rep={repId} data-scene={rep.scene} aria-label={props.label ?? rep.title}>
      {named && <div className="v2v-undef-what" data-testid="text-rep-object">{named}</div>}
      {renderer.render({
        rep: repId, scene, values, size,
        // A plane also draws the marks of other representations that project onto it by meaning.
        // A grid representation draws the board's cells too, so it also draws the marks a rule puts on them.
        marks: typesetMarks(rep.scene === "plane" ? (props.marks ?? []) : scene.kind === "grid" ? gridMarks(repId, scene, props.marks ?? []) : marksForRep(repId, props.marks ?? [])),
        project: (r, reps) => projectRef(type, r, reps),
        terms: new Map((props.terms ?? []).map(t => [t.id, t])),
        before: props.before === undefined ? undefined : valuesOf(type, props.before, site),
        next: props.next === undefined ? undefined : valuesOf(type, props.next, site),
        highlight: props.highlight ?? null,
        meaningOf,
        onHover: props.onHover ? r => props.onHover!(r ? meaningOf(r) : null, r) : undefined,
        labelOf: r => labelOf(type, r),
        roleOf,
        markDepth: props.parts ? markDepthOf(props.parts) : undefined,
      })}
    </div>
  );
}

/** The plain text of one representation of a line: "y = −3x + 10". */
export function repText<S>(type: ObjectType<S>, state: S, repId: string, site = 0): string {
  const rep = representation(type, repId);
  const renderer = rendererFor(rep.scene);
  const scene = rep.layout(state, site);
  return renderer ? renderer.text(scene, valuesOf(type, state, site), repId) : rep.title;
}

/** The element refs a scene shows (its coordinates as drawn): to tell whether a representation expresses a line. */
function sceneRefs(rep: string, scene: SceneData, site: number): ElementRef[] {
  switch (scene.kind) {
    case "equation": return scene.template.filter((x): x is { el: string } => typeof x !== "string").map(x => ({ rep, name: x.el, site }));
    case "table": return scene.columns.map(c => c.el);
    case "sequence": return scene.terms.map(t => t.el);
    case "machine": return scene.stages.filter(s => s.el).map(s => ({ rep, name: s.el!, site }));
    case "plane": return scene.items.filter(i => i.draw === "line").map(i => i.el);
    case "pegboard": return [scene.on];
    case "grid": return [...scene.cells];
    default: return [];
  }
}

/** The representation a viewer without a rule sees (a spectator, a replay): the object type's first (the board, for a grid). */
export const defaultRep = <S,>(type: ObjectType<S>): string => type.representations[0]!.id;

/** The element refs a scene shows, exported for the move line (what changed between two states). */
export const shownRefs = <S,>(type: ObjectType<S>, state: S, repId: string, site = 0): ElementRef[] =>
  sceneRefs(repId, representation(type, repId).layout(state, site), site);

/** Whether a representation can express this line (none of what its scene shows is undefined). */
export function expresses<S>(type: ObjectType<S>, state: S, repId: string, site = 0): boolean {
  const values = valuesOf(type, state, site);
  return sceneRefs(repId, representation(type, repId).layout(state, site), site).every(r => values(r).kind !== "undefined");
}

/**
 * The representation a chip writes: the one asked for when it is an equation that expresses the line, else the
 * object type's first equation that does (for a line: slope-intercept, or the general form for a vertical line).
 */
export function chipRep<S>(type: ObjectType<S>, state: S, preferred?: string, site = 0): string {
  // A one-line equation only: a worked one (the crossing) is several lines, too long for a chip.
  const writes = (id: string) => {
    const scene = representation(type, id).layout(state, site);
    return scene.kind === "equation" && (isSingleLine(scene) || isGivenOnly(scene as never)) && expresses(type, state, id, site);
  };
  if (preferred && writes(preferred)) return preferred;
  const eq = type.representations.find(r => r.scene === "equation" && writes(r.id));
  return eq?.id ?? preferred ?? type.representations[0]!.id;
}

/** One line of text for an object: every line's form in the representation, with optional extra words. */
export function ObjectChip<S>(props: { type: ObjectType<S>; state: S; rep?: string; extra?: string; sites?: number }): ReactElement {
  const k = props.sites ?? 1;
  const text = Array.from({ length: k }, (_, i) => repText(props.type, props.state, chipRep(props.type, props.state, props.rep, i), i)).join(" · ");
  return (
    <span className="v2v v2v-chip">
      <span className="v2v-chip-eq">{text}</span>
      {props.extra && <span className="v2v-chip-extra">{props.extra}</span>}
    </span>
  );
}
