/**
 * The equation scene (si, gen, int …): the template with each coordinate as an element node. A number after "+ " takes
 * the operator's place ("+ −3" reads "− 3"); a coefficient of 1 or 0 is kept, faint, so every coordinate stays a node
 * that a mark or a hover can light. The text form drops them ("y = x + 3").
 */
import { Qn, ref, type ElementRef, type ElementValue, type SceneData } from "@workspace/v2-core";
import { fmtQ, MINUS } from "../format.ts";
import type { RenderProps, SceneRenderer } from "../scene.ts";
import { compactMarks, El, key, Readouts } from "./common.tsx";

type Eq = Extract<SceneData, { kind: "equation" }>;
/** An element piece; a coefficient of ±1 carries its variable instead of a "1" ("−x" is one node). */
type Piece = { kind: "text"; text: string } | { kind: "el"; r: ElementRef; v: ElementValue; op: string; mag: string; variable: string };

const startsWithVar = (s: string | undefined) => !!s && /^[a-z]/i.test(s);

/** Resolve a template into pieces: operators folded into signs, implied coefficients marked. */
function pieces(scene: Eq, rep: string, values: (r: ElementRef) => ElementValue): Piece[] | { undefined: string } {
  const out: Piece[] = [];
  const t = scene.template;
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

/** The plain text: "y = −3x + 10", "3x + y − 10 = 0", without implied 1s and zero terms. */
function text(scene: Eq, values: (r: ElementRef) => ElementValue, rep: string): string {
  const ps = pieces(scene, rep, values);
  if ("undefined" in ps) return ps.undefined;
  let s = ps.map(p => (p.kind === "text" ? p.text : p.op + p.mag + p.variable)).join("");
  s = s.replace(/(^|= )0[a-z] ([+−]) /g, (_m, pre: string, op: string) => pre + (op === MINUS ? MINUS : "")); // leading 0x
  s = s.replace(/ [+−] 0[a-z]/g, "");                     // "+ 0y"
  s = s.replace(/ [+−] 0(?= =|$)/g, "");                  // "+ 0" at the end of a side
  return s.replace(/\s+/g, " ").trim();
}

function Template({ p }: { p: RenderProps<Eq> }) {
  const ps = pieces(p.scene, p.rep, p.values);
  if ("undefined" in ps) return <div className="v2v-undef">{ps.undefined}</div>;
  const placed = new Set(ps.filter(x => x.kind === "el").map(x => key((x as { r: ElementRef }).r)));
  const marks = compactMarks(p);
  const q = { ...p, marks };
  return (
    <div className="v2v-eq">
      <div className="v2v-eq-line" aria-label={text(p.scene, p.values, p.rep)}>
        {ps.map((x, i) => x.kind === "text"
          ? <span key={i}>{x.text.split(/([a-z])/i).map((t, j) => (/^[a-z]$/i.test(t) ? <span key={j} className="v2v-var">{t}</span> : t))}</span>
          : (
            <El key={i} p={q} r={x.r}>
              {p.before && p.size === "expanded" ? <Was p={p} r={x.r} /> : null}
              {x.op}{x.mag}{x.variable && <span className="v2v-var">{x.variable}</span>}
            </El>
          ))}
      </div>
      <Readouts p={q} placed={placed} />
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
