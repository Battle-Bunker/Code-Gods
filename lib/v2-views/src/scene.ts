/**
 * The renderer contract (integration plan §3.2, spec §11): one renderer per scene kind, never per rule family. A
 * renderer draws a representation's `layout(state, site)` with the marks that cite its elements; dynamic elements a mark
 * cites (a prime on the y axis, the point at x = q, a machine run) are drawn by the renderer from their refs. The
 * registry is open: an object type that brings a new scene kind registers its renderer beside these.
 */
import type { ReactElement } from "react";
import type { ElementRef, ElementValue, Mark, SceneData, Term, TermId } from "@workspace/v2-core";

export type FaceSize = "chip" | "compact" | "expanded";
export type DrawSize = Exclude<FaceSize, "chip">;

export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

export interface RenderProps<D extends SceneData = SceneData> {
  /** The representation drawn ("si", "cart"). */
  readonly rep: string;
  readonly scene: D;
  /** Every element's value on this state (any representation: a plane may need the line's intercepts). */
  readonly values: (ref: ElementRef) => ElementValue;
  /** Only the marks whose refs belong to this representation. */
  readonly marks: readonly Mark[];
  readonly terms: ReadonlyMap<TermId, Term>;
  readonly size: DrawSize;
  /** A previous state's values: changed elements are emphasised. */
  readonly before?: (ref: ElementRef) => ElementValue;
  /** Cross-highlight (spec §11.3): elements whose meaning key equals this are lit. */
  readonly highlight: string | null;
  /** The meaning key of an element, for cross-highlighting. */
  readonly meaningOf: (ref: ElementRef) => string;
  /** Pointing at an element (null: pointing away). */
  readonly onHover?: (ref: ElementRef | null) => void;
  /** Words for an element ("gradient"), for titles and screen readers. */
  readonly labelOf: (ref: ElementRef) => string;
}

export interface SceneRenderer<D extends SceneData = SceneData> {
  readonly kind: D["kind"];
  /** Nominal box per size, in CSS pixels: compact ≈ 160 × 100, expanded ≈ 320 × 220. */
  readonly box: Readonly<Record<DrawSize, { readonly w: number; readonly h: number }>>;
  render(props: RenderProps<D>): ReactElement;
  /** The plain-text form: chips, act log, screen readers, the assistant. */
  text(scene: D, values: (ref: ElementRef) => ElementValue, rep: string): string;
}

const registry = new Map<string, SceneRenderer<any>>();

/** Register (or replace) the renderer for a scene kind. */
export function registerRenderer<D extends SceneData>(r: SceneRenderer<D>): void {
  registry.set(r.kind, r);
}
export function rendererFor(kind: string): SceneRenderer<any> | undefined {
  return registry.get(kind);
}
export function registeredKinds(): readonly string[] {
  return [...registry.keys()];
}
