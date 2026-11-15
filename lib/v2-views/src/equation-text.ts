/**
 * An equation as a person writes it, as text (no JSX, so the server can use it too): the template's elements resolved,
 * signs folded into operators ("+ −3" reads "− 3"), a coefficient of ±1 carried by its variable ("−x"), a term whose
 * number is 0 left out ("y = 59x", never "+ 0"), and a lone variable said solved ("x = 3"). render/equation.tsx draws the
 * same pieces, so the drawn equation and its text agree, except that the text says a lone variable solved (the general
 * form's view still draws "x − 3 = 0"; a chip says "x = 3"). One writer for every equation a player reads (playtest
 * round 10: "y = −1x + 12", "y = 59x + 0").
 */
import { Qn, ref, type ElementRef, type ElementValue, type Q } from "@workspace/v2-core";
import type { EquationScene, EquationTemplate } from "@workspace/v2-linear";
import { fmtQ, fmtValue, MINUS } from "./format.ts";

export type Eq = EquationScene;
/** An element piece; a coefficient of ±1 carries its variable instead of a "1" ("−x" is one node). */
export type Piece = { kind: "text"; text: string } | { kind: "el"; r: ElementRef; v: ElementValue; op: string; mag: string; variable: string };
export type Pieces = Piece[] | { undefined: string };

const startsWithVar = (s: string | undefined) => !!s && /^[a-z]/i.test(s);

/** Resolve a template into pieces: operators folded into signs, implied coefficients marked, zero terms dropped. */
export function pieces(t: EquationTemplate, rep: string, values: (r: ElementRef) => ElementValue): Pieces {
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
    const implied = coef && x.n === x.d; // a coefficient of ±1 (its sign is already taken off): "x", "−x"
    absorbed = implied;
    out.push({ kind: "el", r, v, op, mag: implied ? "" : fmtQ(x), variable: implied ? (next as string)[0]! : "" });
  }
  return tidy(out);
}

/** One token of an equation: an element (with its variable when it is a coefficient), an operator, "=", or other words. */
type Tok = { k: "el"; p: Extract<Piece, { kind: "el" }>; variable: string } | { k: "op"; op: "+" | typeof MINUS } | { k: "eq" } | { k: "word"; text: string };
const isZero = (p: Extract<Piece, { kind: "el" }>) => p.v.kind === "number" && Qn.isZero(p.v.q);

/**
 * Written as a person writes it (playtest round 10: "y = 59x + 0", "x + 0y − 3 = 0"): a term whose number is 0 is left
 * out with its operator and variable ("y = 59x", "x − 3 = 0"); a side left with nothing is "0". One function, so the
 * drawn equation and its text always agree.
 */
function tidy(ps: Piece[]): Piece[] {
  const toks: Tok[] = [];
  for (const p of ps) {
    if (p.kind === "el") { toks.push({ k: "el", p, variable: p.variable }); continue; }
    let t = p.text;
    // A variable written straight after an element is its coefficient's ("3" then "x + ").
    const last = toks[toks.length - 1];
    if (last?.k === "el" && !last.variable && /^[a-z]/i.test(t)) { last.variable = t[0]!; t = t.slice(1); }
    for (const m of t.matchAll(/(=)|([+−])|([^\s=+−]+)/g)) toks.push(m[1] ? { k: "eq" } : m[2] ? { k: "op", op: m[2] as "+" } : { k: "word", text: m[3]! });
  }
  // Sides, each a list of signed terms.
  // `joined`: an operator came before it (a term of a sum); without one, a token is written straight after the last.
  type Term = { sign: "+" | typeof MINUS; tok: Tok; joined: boolean };
  const sides: Term[][] = [[]];
  let sign: Term["sign"] = "+", joined = false;
  for (const t of toks) {
    if (t.k === "eq") { sides.push([]); sign = "+"; joined = false; continue; }
    if (t.k === "op") { sign = t.op === MINUS ? (sign === MINUS ? "+" : MINUS) : sign; joined = true; continue; }
    sides[sides.length - 1]!.push({ sign, tok: t, joined });
    sign = "+"; joined = false;
  }
  const out: Piece[] = [];
  const text = (s: string) => { const l = out[out.length - 1]; if (l?.kind === "text") l.text += s; else out.push({ kind: "text", text: s }); };
  sides.forEach((side, i) => {
    if (i > 0) text(" = ");
    const kept = side.filter(t => t.tok.k !== "el" || !isZero(t.tok.p));
    const terms = kept.length ? kept : side.slice(-1).map(t => ({ ...t, tok: { ...(t.tok as Extract<Tok, { k: "el" }>), variable: "" } }));
    terms.forEach((t, j) => {
      // The sign: an element's own leading minus, or the one before it.
      const neg = (t.sign === MINUS) !== (t.tok.k === "el" && t.tok.p.op === MINUS);
      if (j > 0) text(t.joined || neg ? (neg ? ` ${MINUS} ` : " + ") : " ");
      if (t.tok.k === "el") {
        const p = t.tok.p, variable = t.tok.variable;
        // A coefficient written as a number before its variable, unless it is 1 (then the variable carries it).
        out.push({ ...p, op: j === 0 && neg ? MINUS : "", mag: p.variable ? "" : p.mag, variable: p.variable || "" });
        if (variable && !p.variable) text(variable);
      } else {
        text(`${j === 0 && neg ? MINUS : ""}${(t.tok as { text: string }).text}`);
      }
    });
  });
  return out;
}

/** One line as plain text: "y = −3x + 10", "3x + y − 10 = 0". */
export function lineText(ps: Piece[]): string {
  return ps.map(p => (p.kind === "text" ? p.text : p.op + p.mag + p.variable)).join("").replace(/\s+/g, " ").trim();
}

/**
 * A one-line equation with a single variable term, solved for it ("x − 3 = 0" → "x = 3", "3x − 7 = 0" → "x = 2⅓"):
 * how a chip names a vertical line. Null when the equation is not of that shape.
 */
export function solvedText(ps: Piece[]): string | null {
  const els = ps.filter((p): p is Extract<Piece, { kind: "el" }> => p.kind === "el");
  const vars = lineText(ps).match(/[a-z]/gi) ?? [];
  if (vars.length !== 1) return null;
  const withVar = els.find(p => p.variable || ps[ps.indexOf(p) + 1]?.kind === "text" && /^[a-z]/i.test((ps[ps.indexOf(p) + 1] as { text: string }).text));
  const consts = els.filter(p => p !== withVar);
  if (!/= 0$/.test(lineText(ps)) || consts.length > 1 || els.some(p => p.v.kind !== "number")) return null;
  // Each number as written: its magnitude, and the sign shown before it (its own "−", or "− " after the term before).
  const shown = (p: Extract<Piece, { kind: "el" }>) => {
    const before = ps[ps.indexOf(p) - 1];
    const neg = p.op === MINUS || (before?.kind === "text" && before.text.endsWith(`${MINUS} `));
    const mag = Qn.abs((p.v as { q: Q }).q);
    return neg ? Qn.neg(mag) : mag;
  };
  const a = withVar ? (withVar.mag === "" ? (withVar.op === MINUS ? Qn.neg(Qn.ONE) : Qn.ONE) : shown(withVar)) : Qn.ONE;
  const c = consts[0] ? shown(consts[0]) : Qn.ZERO;
  if (Qn.isZero(a)) return null;
  return `${vars[0]} = ${fmtQ(Qn.div(Qn.neg(c), a))}`;
}

/** A caption: words and the representation's elements, each value written as it is ("2", "⅓"); null if one is undefined. */
export type CaptionPiece = string | { r: ElementRef; text: string };
export function caption(t: EquationTemplate | undefined, rep: string, values: (r: ElementRef) => ElementValue): CaptionPiece[] | null {
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
export const captionText = (c: CaptionPiece[]): string => c.map(x => (typeof x === "string" ? x : x.text)).join("");

/** `given`: how many of `lines` are given side by side (a system's equations) rather than worked from the one before. */
export interface Worked { readonly lines: readonly Piece[][]; readonly given: number; readonly caption: CaptionPiece[] | null }
/**
 * The lines a worked equation shows (undefined steps and repeats left out), or the last step's sentence. A given line
 * (a system's equation) is always kept: a repeat is two equal equations, and one that cannot be written says why in
 * its place ("line 2 is upright: x = 3").
 */
export function worked(scene: Eq, rep: string, values: (r: ElementRef) => ElementValue): Worked | { undefined: string } {
  const all = [scene.template, ...(scene.steps ?? [])].map(t => pieces(t, rep, values));
  const given = Math.min(scene.given ?? 0, all.length);
  const last = all[all.length - 1]!;
  if ("undefined" in last && all.length > given) return last;
  const lines: Piece[][] = [];
  all.forEach((ps, i) => {
    if (i < given) { lines.push("undefined" in ps ? [{ kind: "text", text: ps.undefined }] : ps); return; }
    if ("undefined" in ps) return;
    if (lines.length > given && lineText(lines[lines.length - 1]!) === lineText(ps)) return;
    lines.push(ps);
  });
  return { lines, given, caption: caption(scene.caption, rep, values) };
}

export const isWorked = (scene: Eq): boolean => !!(scene.steps?.length || scene.caption || scene.given);

/** The plain text; a worked equation reads "0 = 3x − 7, so 3x = 7, so x = 2⅓ (nearest whole number 2, off by ⅓)". */
export function text(scene: Eq, values: (r: ElementRef) => ElementValue, rep: string): string {
  if (!isWorked(scene)) {
    const ps = pieces(scene.template, rep, values);
    // A lone variable is said solved ("x = 3" for a vertical line's general form): how a chip names it.
    return "undefined" in ps ? ps.undefined : solvedText(ps) ?? lineText(ps);
  }
  const w = worked(scene, rep, values);
  if ("undefined" in w) return w.undefined;
  const given = w.lines.slice(0, w.given).map(lineText).join(" and ");
  const rest = w.lines.slice(w.given).map(lineText);
  return [...(given ? [given] : []), ...rest].join(", so ") + (w.caption ? ` (${captionText(w.caption)})` : "");
}
