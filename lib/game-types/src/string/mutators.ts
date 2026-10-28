/**
 * string mutators (ASCII text, 128 characters, 7 bits each), designed on the Grid principles
 * (lib/grid-lab/docs/mutators.md §1). M = maxLength. A span is [start, end) with 0 ≤ start < end ≤ M,
 * clipped to the text; a span starting at or past the end of the text cannot apply (the act fails).
 *
 *   bijections (injective; erase 0; pay description + motion):
 *     swap_chars(i, j)       swap two characters                    D = log2 C(M, 2)
 *     reverse(span?)         read a span (default: all) backwards   D = 1 + [log2 M + log2 (M − start)]
 *     rotate(k)              move the first k characters to the end D = log2 (M − 1)
 *     shift_chars(k, span?)  Caesar shift, code → (code + k) mod 128  D = log2 127 + span
 *     insert(i, text)        insert text at i (fails past M)        D = log2 M + log2 (M − i) + 7·|text|
 *   overwrites (pointwise erasure log2 |f⁻¹(f(x))|):
 *     set_char(i, c)         E = 7                                  D = log2 M + 7
 *     write(i, text)         a run: one position plus the chars     E = 7·|text|, D = log2 M + log2 (M − i) + 7·|text|
 *     fill(c, span?)         every character of a span becomes c    E = 7·(span ∩ text), D = 7 + span
 *     delete(span)           cut a span out                         E ≈ 7·(span ∩ text), D = log2 M + log2 (M − start)
 *     truncate(n)            keep the first n characters            E ≈ 7·(M − n), D = log2 M
 * A run (write, fill) names one position and its characters, so it is much cheaper than the same
 * characters set one by one (each paying log2 M for its own position). Overwrites are idempotent
 * except delete (it removes what is there now); the insert/delete pair are the only length changers
 * besides truncate. Motion is charged per act on the act's net change
 * (Σ B² / B_tot over "text"), so shifting the whole text along (insert or delete near the front,
 * rotate) moves a lot.
 */
import type { Instantiation, MutatorDef, MutatorKind, MutatorScope, Rng } from "../types.ts";
import { checkFields, fail, intParam, lg, mdoc } from "../mutators.ts";

type SP = { i?: number; j?: number; k?: number; n?: number; c?: string; text?: string; range?: [number, number] };

const maxLen = (inst: Instantiation) => (inst.args as { maxLength: number }).maxLength;
const LOG127 = Math.log2(127);
/** log2 Σ_{j=a}^{b} 128^j for 0 ≤ a ≤ b, stably. */
const log2Sum128 = (a: number, b: number) => 7 * a + 7 * (b - a + 1) + Math.log2(1 - 2 ** (-7 * (b - a + 1))) - LOG127;

function charParam(raw: Readonly<Record<string, unknown>>, name: string): string {
  const v = raw[name];
  if (typeof v !== "string" || v.length !== 1 || v.charCodeAt(0) > 127) fail(`"${name}" must be one ASCII character`);
  return v;
}
function textParam(raw: Readonly<Record<string, unknown>>, name: string, max: number): string {
  const v = raw[name];
  if (typeof v !== "string" || v.length < 1 || !/^[\x00-\x7f]*$/.test(v)) fail(`"${name}" must be some ASCII text`);
  if (v.length > max) fail(`"${name}" is too long here (at most ${max} characters)`);
  return v;
}
function rangeParam(raw: Readonly<Record<string, unknown>>, M: number, required = false): [number, number] | undefined {
  const v = raw.range;
  if (v === undefined && !required) return undefined;
  if (!Array.isArray(v) || v.length !== 2) fail(`"range" must be [start, end]`);
  const r = { s: v[0], e: v[1] };
  const s = intParam(r, "s", 0, M - 1);
  return [s, intParam(r, "e", s + 1, M)];
}
/** Span description bits: 1 bit whole/span, then start and end (end > start). */
const rangeBits = (r: [number, number] | undefined, M: number) => 1 + (r ? lg(M) + lg(M - r[0]) : 0);
const sampleRange = (rng: Rng, M: number): [number, number] | undefined => {
  if (rng.int(2) === 0) return undefined;
  const s = rng.int(M);
  return [s, s + 1 + rng.int(M - s)];
};
/** The span on text x, or null if it starts past the end. */
const span = (x: string, r: [number, number] | undefined): [number, number] | null =>
  !r ? (x.length ? [0, x.length] : null) : r[0] >= x.length ? null : [r[0], Math.min(r[1], x.length)];
const randomText = (rng: Rng, n: number) => String.fromCharCode(...Array.from({ length: n }, () => rng.int(128)));

interface Spec {
  id: string; name: string; emoji: string; summary: string; kind: MutatorKind; scope: MutatorScope; minLength: number;
  fields: readonly string[]; optional?: readonly string[];
  parse(raw: Readonly<Record<string, unknown>>, M: number): SP;
  describe(p: SP, M: number): number;
  apply(x: string, p: SP, M: number): string | null;
  erase?(x: string, p: SP, M: number): number;
  sample(rng: Rng, M: number): SP;
  guest: { py: string; js: string; dts: string; doc: [string, string, string][] };
}

function def(s: Spec): MutatorDef<string, SP> {
  return Object.freeze({
    id: s.id, name: s.name, emoji: s.emoji, summary: s.summary, scope: s.scope, kind: s.kind,
    requires: [{ term: "length.max", op: ">=" as const, value: s.minLength }],
    parse: (raw: Readonly<Record<string, unknown>>, inst: Instantiation) => {
      checkFields(raw, s.fields, s.optional);
      const p = s.parse(raw, maxLen(inst));
      if (p.range === undefined) delete p.range;
      return p;
    },
    describeBits: (p: SP, inst: Instantiation) => s.describe(p, maxLen(inst)),
    apply: (x: string, p: SP, inst: Instantiation) => s.apply(x, p, maxLen(inst)),
    erasureBits: (x: string, p: SP, inst: Instantiation) => (s.erase ? s.erase(x, p, maxLen(inst)) : 0),
    sample: (rng: Rng, inst: Instantiation) => s.sample(rng, maxLen(inst)),
    guest: { python: s.guest.py, js: s.guest.js, dts: s.guest.dts, docs: s.guest.doc.map(([p, t, k]) => mdoc(p, t, k)) },
  });
}

// guest support rides on set_char (first, available whenever any mutator is)
const SUPPORT_PY = `
def _M_CALL(_m, **params):
    params["__m"] = _m
    return params


def _M_INT(x, what):
    if isinstance(x, bool) or not isinstance(x, int):
        raise ValueError(what + " must be a whole number, not " + repr(x))
    return x


def _M_CHAR(x):
    if not isinstance(x, str) or len(x) != 1 or ord(x) > 127:
        raise ValueError("expected one ASCII character, not " + repr(x))
    return x


def _M_TEXT(x):
    if not isinstance(x, str) or not x or any(ord(ch) > 127 for ch in x):
        raise ValueError("expected some ASCII text, not " + repr(x))
    return x


def _M_RANGE(start, end):
    s = 0 if start is None else _M_INT(start, "start")
    e = MAX_LENGTH if end is None else _M_INT(end, "end")
    return {} if (s == 0 and e == MAX_LENGTH) else {"range": [s, e]}

`;
const SUPPORT_JS = `
function __M_INT(x, what) {
  if (!Number.isInteger(x)) throw new Error(what + " must be a whole number, not " + JSON.stringify(x));
  return x;
}
function __M_CHAR(x) {
  if (typeof x !== "string" || x.length !== 1 || x.charCodeAt(0) > 127) throw new Error("expected one ASCII character, not " + JSON.stringify(x));
  return x;
}
function __M_TEXT(x) {
  if (typeof x !== "string" || !x.length || !/^[\\x00-\\x7f]*$/.test(x)) throw new Error("expected some ASCII text, not " + JSON.stringify(x));
  return x;
}
function __M_RANGE(start, end) {
  const s = start == null ? 0 : __M_INT(start, "start"), e = end == null ? MAX_LENGTH : __M_INT(end, "end");
  return s === 0 && e === MAX_LENGTH ? {} : { range: [s, e] };
}

`;
const SPAN_DOC = "start/end pick a part (end not included; leave them out for the whole text)";

const setChar = (x: string, p: SP) => (p.i! < x.length ? x.slice(0, p.i) + p.c + x.slice(p.i! + 1) : null);

const set_char = def({
  id: "set_char", name: "Set a letter", emoji: "✏️", summary: "Change one character.",
  kind: "overwrite", scope: "local", minLength: 1, fields: ["i", "c"],
  parse: (raw, M) => ({ i: intParam(raw, "i", 0, M - 1), c: charParam(raw, "c") }),
  describe: (_p, M) => lg(M) + 7,
  apply: setChar,
  erase: () => 7,
  sample: (rng, M) => ({ i: rng.int(M), c: randomText(rng, 1) }),
  guest: {
    py: `${SUPPORT_PY}def set_char(i, ch):
    return _M_CALL("set_char", i=_M_INT(i, "position"), c=_M_CHAR(ch))
`,
    js: `${SUPPORT_JS}function setChar(i, ch) {
  return { __m: "set_char", i: __M_INT(i, "position"), c: __M_CHAR(ch) };
}
`,
    dts: `declare function setChar(i: number, ch: string): MutatorCall;\n`,
    doc: [["set_char(i, ch)", "setChar(i, ch)", "Change the character at position i (0 = the first) to ch."]],
  },
});

const write = def({
  id: "write", name: "Write", emoji: "📝", summary: "Write over the text from one position: a run of new characters.",
  kind: "overwrite", scope: "line", minLength: 1, fields: ["i", "text"],
  parse: (raw, M) => { const i = intParam(raw, "i", 0, M - 1); return { i, text: textParam(raw, "text", M - i) }; },
  describe: (p, M) => lg(M) + lg(M - p.i!) + 7 * p.text!.length,
  apply: (x, p) => (p.i! + p.text!.length <= x.length ? x.slice(0, p.i) + p.text + x.slice(p.i! + p.text!.length) : null),
  erase: (_x, p) => 7 * p.text!.length,
  sample: (rng, M) => { const i = rng.int(M); return { i, text: randomText(rng, 1 + rng.int(M - i)) }; },
  guest: {
    py: `def write(i, text):
    return _M_CALL("write", i=_M_INT(i, "position"), text=_M_TEXT(text))
`,
    js: `function write(i, text) {
  return { __m: "write", i: __M_INT(i, "position"), text: __M_TEXT(text) };
}
`,
    dts: `declare function write(i: number, text: string): MutatorCall;\n`,
    doc: [["write(i, text)", "write(i, text)", "Write text over the characters from position i on (it must fit inside the text): cheaper than setting them one by one."]],
  },
});

const fillApply = (x: string, p: SP): string | null => {
  const sp = span(x, p.range);
  return sp && x.slice(0, sp[0]) + p.c!.repeat(sp[1] - sp[0]) + x.slice(sp[1]);
};

const fill = def({
  id: "fill", name: "Fill", emoji: "🪣", summary: "Make every character of a part of the text the same.",
  kind: "overwrite", scope: "region", minLength: 1, fields: ["c"], optional: ["range"],
  parse: (raw, M) => ({ c: charParam(raw, "c"), range: rangeParam(raw, M) }),
  describe: (p, M) => 7 + rangeBits(p.range, M),
  apply: fillApply,
  erase: (x, p) => { const sp = span(x, p.range)!; return 7 * (sp[1] - sp[0]); },
  sample: (rng, M) => ({ c: randomText(rng, 1), range: sampleRange(rng, M) }),
  guest: {
    py: `def fill(ch, start=None, end=None):
    return _M_CALL("fill", c=_M_CHAR(ch), **_M_RANGE(start, end))
`,
    js: `function fill(ch, start = null, end = null) {
  return { __m: "fill", c: __M_CHAR(ch), ...__M_RANGE(start, end) };
}
`,
    dts: `declare function fill(ch: string, start?: number | null, end?: number | null): MutatorCall;\n`,
    doc: [["fill(ch, start=None, end=None)", "fill(ch, start = null, end = null)", `Make every character ch; ${SPAN_DOC}.`]],
  },
});

const swap_chars = def({
  id: "swap_chars", name: "Swap letters", emoji: "🔀", summary: "Swap two characters.",
  kind: "bijective", scope: "local", minLength: 2, fields: ["i", "j"],
  parse: (raw, M) => { const i = intParam(raw, "i", 0, M - 2); return { i, j: intParam(raw, "j", i + 1, M - 1) }; },
  describe: (p, M) => lg(M - 1) + lg(M - 1 - p.i!),
  apply: (x, p) => (p.j! < x.length ? x.slice(0, p.i) + x[p.j!] + x.slice(p.i! + 1, p.j) + x[p.i!] + x.slice(p.j! + 1) : null),
  sample: (rng, M) => { const i = rng.int(M - 1); return { i, j: i + 1 + rng.int(M - 1 - i) }; },
  guest: {
    py: `def swap_chars(i, j):
    i, j = sorted([_M_INT(i, "position"), _M_INT(j, "position")])
    return _M_CALL("swap_chars", i=i, j=j)
`,
    js: `function swapChars(i, j) {
  const [a, b] = [__M_INT(i, "position"), __M_INT(j, "position")].sort((x, y) => x - y);
  return { __m: "swap_chars", i: a, j: b };
}
`,
    dts: `declare function swapChars(i: number, j: number): MutatorCall;\n`,
    doc: [["swap_chars(i, j)", "swapChars(i, j)", "Swap the characters at positions i and j (0 = the first)."]],
  },
});

const reverse = def({
  id: "reverse", name: "Reverse", emoji: "↔️", summary: "Write the text (or part of it) backwards.",
  kind: "bijective", scope: "line", minLength: 1, fields: [], optional: ["range"],
  parse: (raw, M) => ({ range: rangeParam(raw, M) }),
  describe: (p, M) => rangeBits(p.range, M),
  apply: (x, p) => {
    const sp = span(x, p.range);
    return sp && x.slice(0, sp[0]) + [...x.slice(sp[0], sp[1])].reverse().join("") + x.slice(sp[1]);
  },
  sample: (rng, M) => ({ range: sampleRange(rng, M) }),
  guest: {
    py: `def reverse(start=None, end=None):
    return _M_CALL("reverse", **_M_RANGE(start, end))
`,
    js: `function reverse(start = null, end = null) {
  return { __m: "reverse", ...__M_RANGE(start, end) };
}
`,
    dts: `declare function reverse(start?: number | null, end?: number | null): MutatorCall;\n`,
    doc: [["reverse(start=None, end=None)", "reverse(start = null, end = null)", `Write the text backwards; ${SPAN_DOC}.`]],
  },
});

const rotate = def({
  id: "rotate", name: "Rotate", emoji: "🔄", summary: "Move the first few characters round to the end.",
  kind: "bijective", scope: "global", minLength: 2, fields: ["k"],
  parse: (raw, M) => ({ k: intParam(raw, "k", 1, M - 1) }),
  describe: (_p, M) => lg(M - 1),
  apply: (x, p) => { const k = x.length ? p.k! % x.length : 0; return x.slice(k) + x.slice(0, k); },
  sample: (rng, M) => ({ k: 1 + rng.int(M - 1) }),
  guest: {
    py: `def rotate(steps=1):
    return _M_CALL("rotate", k=_M_INT(steps, "steps"))
`,
    js: `function rotate(steps = 1) {
  return { __m: "rotate", k: __M_INT(steps, "steps") };
}
`,
    dts: `declare function rotate(steps?: number): MutatorCall;\n`,
    doc: [["rotate(steps=1)", "rotate(steps = 1)", "Move the first `steps` characters round to the end: rotate(2) turns \"hello\" into \"llohe\" (to go the other way, use len(text) - steps)."]],
  },
});

const shift_chars = def({
  id: "shift_chars", name: "Secret code", emoji: "🔐", summary: "Shift every character along the ASCII table, wrapping round (a Caesar cipher).",
  kind: "bijective", scope: "region", minLength: 1, fields: ["k"], optional: ["range"],
  parse: (raw, M) => ({ k: intParam(raw, "k", 1, 127), range: rangeParam(raw, M) }),
  describe: (p, M) => LOG127 + rangeBits(p.range, M),
  apply: (x, p) => {
    const sp = span(x, p.range);
    if (!sp) return null;
    const mid = [...x.slice(sp[0], sp[1])].map(ch => String.fromCharCode((ch.charCodeAt(0) + p.k!) % 128)).join("");
    return x.slice(0, sp[0]) + mid + x.slice(sp[1]);
  },
  sample: (rng, M) => ({ k: 1 + rng.int(127), range: sampleRange(rng, M) }),
  guest: {
    py: `def shift_chars(steps, start=None, end=None):
    k = _M_INT(steps, "steps") % 128
    if k == 0:
        raise ValueError("shifting by a whole lap of 128 does nothing")
    return _M_CALL("shift_chars", k=k, **_M_RANGE(start, end))
`,
    js: `function shiftChars(steps, start = null, end = null) {
  const k = ((__M_INT(steps, "steps") % 128) + 128) % 128;
  if (k === 0) throw new Error("shifting by a whole lap of 128 does nothing");
  return { __m: "shift_chars", k, ...__M_RANGE(start, end) };
}
`,
    dts: `declare function shiftChars(steps: number, start?: number | null, end?: number | null): MutatorCall;\n`,
    doc: [["shift_chars(steps, start=None, end=None)", "shiftChars(steps, start = null, end = null)",
      `Secret code: move every character \`steps\` places along the ASCII table, wrapping round ("a" + 1 is "b"); ${SPAN_DOC}.`]],
  },
});

const insert = def({
  id: "insert", name: "Insert", emoji: "➕", summary: "Insert new text at a position (the text must stay short enough).",
  kind: "bijective", scope: "line", minLength: 1, fields: ["i", "text"],
  parse: (raw, M) => { const i = intParam(raw, "i", 0, M - 1); return { i, text: textParam(raw, "text", M - i) }; },
  describe: (p, M) => lg(M) + lg(M - p.i!) + 7 * p.text!.length,
  apply: (x, p, M) => (p.i! <= x.length && x.length + p.text!.length <= M ? x.slice(0, p.i) + p.text + x.slice(p.i) : null),
  sample: (rng, M) => { const i = rng.int(M); return { i, text: randomText(rng, 1 + rng.int(M - i)) }; },
  guest: {
    py: `def insert(i, text):
    return _M_CALL("insert", i=_M_INT(i, "position"), text=_M_TEXT(text))
`,
    js: `function insert(i, text) {
  return { __m: "insert", i: __M_INT(i, "position"), text: __M_TEXT(text) };
}
`,
    dts: `declare function insert(i: number, text: string): MutatorCall;\n`,
    doc: [["insert(i, text)", "insert(i, text)", "Insert text before position i (i = len(text) adds it at the end). Fails if the result would be longer than MAX_LENGTH."]],
  },
});

const del = def({
  id: "delete", name: "Delete", emoji: "✂️", summary: "Cut a part out of the text.",
  kind: "overwrite", scope: "line", minLength: 1, fields: ["range"],
  parse: (raw, M) => ({ range: rangeParam(raw, M, true) }),
  describe: (p, M) => lg(M) + lg(M - p.range![0]),
  apply: (x, p) => { const sp = span(x, p.range); return sp && x.slice(0, sp[0]) + x.slice(sp[1]); },
  // len(y) > start: exactly the 128^(e−s) cut contents; len(y) = start: any 1..e−s characters were cut
  erase: (x, p) => {
    const [s, e] = p.range!;
    return x.length > e ? 7 * (e - s) : log2Sum128(1, e - s);
  },
  sample: (rng, M) => { const s = rng.int(M); return { range: [s, s + 1 + rng.int(M - s)] as [number, number] }; },
  guest: {
    py: `def remove(start, end=None):
    s = _M_INT(start, "start")
    return _M_CALL("delete", range=[s, s + 1 if end is None else _M_INT(end, "end")])
`,
    js: `function remove(start, end = null) {
  const s = __M_INT(start, "start");
  return { __m: "delete", range: [s, end == null ? s + 1 : __M_INT(end, "end")] };
}
`,
    dts: `declare function remove(start: number, end?: number | null): MutatorCall;\n`,
    doc: [["remove(start, end=None)", "remove(start, end = null)", "Cut out the characters from start up to (not including) end; remove(3) cuts just the character at 3."]],
  },
});

const truncate = def({
  id: "truncate", name: "Cut short", emoji: "📏", summary: "Keep only the first few characters.",
  kind: "overwrite", scope: "global", minLength: 1, fields: ["n"],
  parse: (raw, M) => ({ n: intParam(raw, "n", 0, M - 1) }),
  describe: (_p, M) => lg(M),
  apply: (x, p) => x.slice(0, p.n),
  // every text of length n..M that starts with the result
  erase: (_x, p, M) => log2Sum128(0, M - p.n!),
  sample: (rng, M) => ({ n: rng.int(M) }),
  guest: {
    py: `def truncate(length):
    return _M_CALL("truncate", n=_M_INT(length, "length"))
`,
    js: `function truncate(length) {
  return { __m: "truncate", n: __M_INT(length, "length") };
}
`,
    dts: `declare function truncate(length: number): MutatorCall;\n`,
    doc: [["truncate(length)", "truncate(length)", "Keep only the first `length` characters. Throwing text away is expensive: every lost character costs 7 bits."]],
  },
});

export const STRING_MUTATORS: readonly MutatorDef<string, SP>[] = Object.freeze([
  set_char, write, fill, swap_chars, reverse, rotate, shift_chars, insert, del, truncate,
]);
