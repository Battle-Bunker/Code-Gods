/**
 * The equation scene (si, gen, crossing …): the template with each coordinate as an element node. A number after "+ "
 * takes the operator's place ("+ −3" reads "− 3"); a coefficient of 1 or 0 is kept, faint, so every coordinate stays a
 * node that a mark or a hover can light. The text form drops them ("y = x + 3").
 *
 * A worked equation (the crossing) also has steps, one line each, and a caption of words under them: "0 = 3x − 7",
 * "3x = 7", "x = 2⅓", then "nearest whole number 2, off by ⅓". A step that needs an element the line lacks (a vertical
 * line has no gradient) is left out, and so is a step that reads the same as the one before ("x = 4" twice); when the
 * last step itself is undefined, its sentence is the whole scene. A compact face shows the last step and the caption.
 */
import { Qn, ref, type ElementRef, type ElementValue } from "@workspace/v2-core";
import type { EquationScene, EquationTemplate } from "@workspace/v2-linear";
import { fmtQ, fmtValue, MINUS } from "../format.ts";
import type { RenderProps, SceneRenderer } from "../scene.ts";
import { compactMarks, El, key, markState, Readouts } from "./common.tsx";

type Eq = EquationScene;
/** An element piece; a coefficient of ±1 carries its variable instead of a "1" ("−x" is one node). */
type Piece = { kind: "text"; text: string } | { kind: "el"; r: ElementRef; v: ElementValue; op: string; mag: string; variable: string };
type Pieces = Piece[] | { undefined: string };

const startsWithVar = (s: string | undefined) => !!s && /^[a-z]/i.test(s);

/** Resolve a template into pieces: operators folded into signs, implied coefficients marked. */
function pieces(t: EquationTemplate, rep: string, values: (r: ElementRef) => ElementValue): Pieces {
  const out: Piece[] = [];
  let absorbed = false;
  for (let i = 0; i < t.length; i++) {
    const part = t[i]!;
    if (typeof part === "string") { out.push({ kind: "text", text: absorbed ? part.slice(1) : part }); absorbed = false; continue; }
    const r = ref(rep, part.el);
    const v = values(r);
    if (v.kind === "undefined") return { undefined: v.reason };
    if (v.kind !== "number") { out.push({ kind: "el", r, v, op: "", mag: v.kind === "symbol" ? v.text : "?", variable: "" }); continue; }
    const prev = out[out.length - 1];
    const next = t[i + 1];
    const coef = typeof next === "string" && startsWithVar(next);
    let op = "", x = v.q;
    if (prev?.kind === "text" && /\+ $/.test(prev.text) && x.n < 0n) {
      prev.text = prev.text.replace(/\+ $/, `${MINUS} `);
      x = Qn.abs(x);
    } else if (x.n < 0n) {
      op = MINUS; x = Qn.abs(x);
    }
    const implied = coef && x.n === x.d; // a coefficient of ±1: "x", "−x"
    absorbed = implied;
    out.push({ kind: "el", r, v, op, mag: implied ? "" : fmtQ(x), variable: implied ? (next as string)[0]! : "" });
  }
  return out;
}

/** One line as plain text: "y = −3x + 10", "3x + y − 10 = 0", without implied 1s and zero terms. */
function lineText(ps: Piece[]): string {
  let s = ps.map(p => (p.kind === "text" ? p.text : p.op + p.mag + p.variable)).join("");
  s = s.replace(/(^|= )0[a-z] ([+−]) /g, (_m, pre: string, op: string) => pre + (op === MINUS ? MINUS : "")); // leading 0x
  s = s.replace(/ [+−] 0[a-z]/g, "");                     // "+ 0y"
  s = s.replace(/ [+−] 0(?= =|$)/g, "");                  // "+ 0" at the end of a side
  return s.replace(/\s+/g, " ").trim();
}

/** A caption: words and the representation's elements, each value written as it is ("2", "⅓"); null if one is undefined. */
type CaptionPiece = string | { r: ElementRef; text: string };
function caption(t: EquationTemplate | undefined, rep: string, values: (r: ElementRef) => ElementValue): CaptionPiece[] | null {
  if (!t) return null;
  const out: CaptionPiece[] = [];
  for (const part of t) {
    if (typeof part === "string") { out.push(part); continue; }
    const r = ref(rep, part.el), v = values(r);
    if (v.kind === "undefined") return null;
    out.push({ r, text: fmtValue(v) });
  }
  return out;
}
const captionText = (c: CaptionPiece[]): string => c.map(x => (typeof x === "string" ? x : x.text)).join("");

interface Worked { readonly lines: readonly Piece[][]; readonly caption: CaptionPiece[] | null }
/** The lines a worked equation shows (undefined steps and repeats left out), or the last step's sentence. */
function worked(scene: Eq, rep: string, values: (r: ElementRef) => ElementValue): Worked | { undefined: string } {
  const all = [scene.template, ...(scene.steps ?? [])].map(t => pieces(t, rep, values));
  const last = all[all.length - 1]!;
  if ("undefined" in last) return last;
  const lines: Piece[][] = [];
  for (const ps of all) {
    if ("undefined" in ps) continue;
    if (lines.length && lineText(lines[lines.length - 1]!) === lineText(ps)) continue;
    lines.push(ps);
  }
  return { lines, caption: caption(scene.caption, rep, values) };
}

const isWorked = (scene: Eq): boolean => !!(scene.steps?.length || scene.caption);

/** The plain text; a worked equation reads "0 = 3x − 7, so 3x = 7, so x = 2⅓ (nearest whole number 2, off by ⅓)". */
function text(scene: Eq, values: (r: ElementRef) => ElementValue, rep: string): string {
  if (!isWorked(scene)) {
    const ps = pieces(scene.template, rep, values);
    return "undefined" in ps ? ps.undefined : lineText(ps);
  }
  const w = worked(scene, rep, values);
  if ("undefined" in w) return w.undefined;
  return w.lines.map(lineText).join(", so ") + (w.caption ? ` (${captionText(w.caption)})` : "");
}

/** One line of an equation: its text with italic variables, its numbers as element nodes. */
function Line({ p, ps, label }: { p: RenderProps<Eq>; ps: Piece[]; label: string }) {
  return (
    <div className="v2v-eq-line" aria-label={label}>
      {ps.map((x, i) => x.kind === "text"
        ? <span key={i}>{x.text.split(/([a-z])/i).map((t, j) => (/^[a-z]$/i.test(t) ? <span key={j} className="v2v-var">{t}</span> : t))}</span>
        : (
          <El key={i} p={p} r={x.r}>
            {p.before && p.size === "expanded" ? <Was p={p} r={x.r} /> : null}
            {x.op}{x.mag}
            {/* A coefficient of 1 a rule cites is shown, faint, so the mark has a number to sit on. */}
            {x.variable && markState(p.marks, x.r).focus && <span className="v2v-implied">1</span>}
            {x.variable && <span className="v2v-var">{x.variable}</span>}
          </El>
        ))}
    </div>
  );
}

function Template({ p }: { p: RenderProps<Eq> }) {
  const marks = compactMarks(p);
  const q = { ...p, marks };
  if (isWorked(p.scene)) return <WorkedScene p={q} />;
  const ps = pieces(p.scene.template, p.rep, p.values);
  if ("undefined" in ps) return <div className="v2v-undef">{ps.undefined}</div>;
  const placed = new Set(ps.flatMap(x => (x.kind === "el" ? [key(x.r)] : [])));
  return (
    <div className="v2v-eq">
      <Line p={q} ps={ps} label={lineText(ps)} />
      <Readouts p={q} placed={placed} />
    </div>
  );
}

function WorkedScene({ p }: { p: RenderProps<Eq> }) {
  const w = worked(p.scene, p.rep, p.values);
  if ("undefined" in w) return <div className="v2v-undef">{w.undefined}</div>;
  const lines = p.size === "compact" ? w.lines.slice(-1) : w.lines;
  const placed = new Set([
    ...lines.flatMap(ps => ps.flatMap(x => (x.kind === "el" ? [key(x.r)] : []))),
    ...(w.caption ?? []).flatMap(x => (typeof x === "string" ? [] : [key(x.r)])),
  ]);
  return (
    <div className="v2v-eq" data-worked="" aria-label={text(p.scene, p.values, p.rep)}>
      <div className="v2v-eq-steps">
        {lines.map((ps, i) => <Line key={i} p={p} ps={ps} label={lineText(ps)} />)}
      </div>
      {w.caption && (
        <div className="v2v-eq-caption">
          {w.caption.map((x, i) => (typeof x === "string" ? <span key={i}>{x}</span> : <El key={i} p={p} r={x.r}>{x.text}</El>))}
        </div>
      )}
      <Readouts p={p} placed={placed} />
    </div>
  );
}

/** The previous value, struck through, when it changed. */
function Was({ p, r }: { p: RenderProps; r: ElementRef }) {
  const b = p.before!(r), v = p.values(r);
  if (b.kind !== "number" || v.kind !== "number" || Qn.eq(b.q, v.q)) return null;
  return <span className="v2v-was">{fmtQ(b.q)}</span>;
}

export const equationRenderer: SceneRenderer<Eq> = {
  kind: "equation",
  box: { compact: { w: 160, h: 100 }, expanded: { w: 320, h: 220 } },
  render: p => <Template p={p} />,
  text,
};

/** Whether an equation scene is a single line (a chip can write it) rather than worked out in steps. */
export const isSingleLine = (scene: Eq): boolean => !isWorked(scene);
