/** What every scene renderer shares: element nodes with their mark and highlight state, readouts, mark lookups. */
import type { ReactNode } from "react";
import { refKey, type ElementRef, type ElementValue, type Mark, type Q } from "@workspace/v2-core";
import { fmtTermValue, fmtValue } from "../format.ts";
import { markRefs, markTerm } from "../refs.ts";
import type { RenderProps } from "../scene.ts";

/** The key an element's node carries in `data-ref`: "si.m", "mach.out(q=3)" (site-less: a view draws one line). */
export const key = (r: ElementRef): string => refKey({ ...r, site: undefined });

/** Which marks cite an element, by kind. */
export interface MarkState { focus: boolean; cand: Mark | null; notes: string[]; measures: Mark[] }
export function markState(marks: readonly Mark[], r: ElementRef): MarkState {
  const k = key(r);
  const s: MarkState = { focus: false, cand: null, notes: [], measures: [] };
  for (const m of marks) {
    if (!markRefs(m).some(x => key(x) === k)) continue;
    if (m.kind === "focus") s.focus = true;
    else if (m.kind === "candidate") s.cand = m;
    else if (m.kind === "note") s.notes.push(m.text);
    else s.measures.push(m);
  }
  return s;
}

/** The value of a term a mark cites, formatted (empty when none). */
export function termText(p: RenderProps, m: Mark | null | undefined): string {
  const t = m ? markTerm(m) : undefined;
  const term = t ? p.terms.get(t) : undefined;
  return term ? fmtTermValue(term.value) : "";
}
export function termQ(p: RenderProps, m: Mark): Q | null {
  const t = markTerm(m);
  const v = t ? p.terms.get(t)?.value : undefined;
  return v && "n" in v ? v : null;
}

export const numberOf = (v: ElementValue): Q | null => (v.kind === "number" ? v.q : null);

/** Data attributes for an element's node: data-ref, focus, candidate, cross-highlight, changed. */
export function elAttrs(p: RenderProps, r: ElementRef, extra: { changedFrom?: boolean } = {}): Record<string, string | undefined> {
  const st = markState(p.marks, r);
  const lit = p.highlight !== null && p.meaningOf(r) === p.highlight;
  let changed = false;
  if (p.before && extra.changedFrom !== false) {
    try { changed = fmtValue(p.before(r)) !== fmtValue(p.values(r)); } catch { changed = false; }
  }
  return {
    "data-ref": key(r),
    "data-focus": st.focus ? "" : undefined,
    "data-cand": st.cand ? "" : undefined,
    "data-lit": lit ? "" : undefined,
    "data-changed": changed ? "" : undefined,
  };
}

/** Pointer handlers that report the element (for cross-highlighting). */
export function hover(p: RenderProps, r: ElementRef) {
  if (!p.onHover) return {};
  return { onMouseEnter: () => p.onHover!(r), onMouseLeave: () => p.onHover!(null), onFocus: () => p.onHover!(r), onBlur: () => p.onHover!(null) };
}

/** An HTML element node: a number in an equation, a machine stage, a table cell. */
export function El(props: { p: RenderProps; r: ElementRef; children: ReactNode; className?: string; title?: string }) {
  const { p, r } = props;
  return (
    <span className={`v2v-el ${props.className ?? ""}`} {...elAttrs(p, r)} {...hover(p, r)} title={props.title ?? p.labelOf(r)}>
      {props.children}
    </span>
  );
}

/**
 * Elements of this representation that marks cite but the scene has no place for (a derived number, a dynamic value):
 * listed as "label value" readouts under the picture, so every mark has a node.
 */
/** Notes longer than this are listed under the picture rather than drawn beside their element. */
export const NOTE_MAX = 24;

export function Readouts({ p, placed, drawnNotes }: { p: RenderProps; placed: ReadonlySet<string>; drawnNotes?: ReadonlySet<string> }) {
  const seen = new Set<string>();
  const items: ElementRef[] = [];
  for (const m of p.marks) for (const r of markRefs(m)) {
    const k = key(r);
    if (r.rep !== p.rep || placed.has(k) || seen.has(k)) continue;
    seen.add(k);
    items.push(r);
  }
  const shown = new Set(items.map(r => fmtValue(p.values(r))));
  // Notes the scene drew are in the picture; a note repeating a readout's sentence is dropped.
  const notes = p.size === "expanded"
    ? p.marks.filter((m): m is Extract<Mark, { kind: "note" }> => m.kind === "note" && !drawnNotes?.has(m.text) && !shown.has(m.text)).map(m => m.text)
    : [];
  if (p.size === "compact") {
    // A compact face has no room under the picture: focused numbers only, as one short overlay line.
    const focused = items.filter(r => markState(p.marks, r).focus);
    if (!focused.length) return null;
    return (
      <div className="v2v-overlay">
        {focused.map(r => <span key={key(r)}>{p.labelOf(r).replace(/\s*\(.*\)/, "")} <El p={p} r={r}>{fmtValue(p.values(r))}</El></span>)}
      </div>
    );
  }
  if (!items.length && !notes.length) return null;
  return (
    <>
      {items.length > 0 && (
        <div className="v2v-readouts">
          {items.map(r => (
            <span key={key(r)}>{p.labelOf(r)} <El p={p} r={r}>{fmtValue(p.values(r))}</El></span>
          ))}
        </div>
      )}
      {notes.length > 0 && <ul className="v2v-notes">{[...new Set(notes)].map(n => <li key={n}>{n}</li>)}</ul>}
    </>
  );
}

/** In a compact face only focus marks and the nearest candidate (smallest term value) are drawn (plan §5 risks). */
export function compactMarks(p: RenderProps): readonly Mark[] {
  if (p.size !== "compact") return p.marks;
  const cands = p.marks.filter(m => m.kind === "candidate");
  let best: Mark | null = null, bestV = Infinity;
  for (const c of cands) {
    const q = termQ(p, c);
    const v = q ? Math.abs(Number(q.n) / Number(q.d)) : Infinity;
    if (best === null || v < bestV) { best = c; bestV = v; }
  }
  return p.marks.filter(m => m.kind === "focus" || m.kind === "measure" || m === best);
}
