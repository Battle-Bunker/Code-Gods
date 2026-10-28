/**
 * Int mutators, designed on the Grid principles (lib/grid-lab/docs/mutators.md §1):
 *
 *   bijections erase nothing and pay only description + motion:
 *     add(k)            x → min + (x − min + k) mod W            W = max − min + 1; D = Elias-γ(|k|) + 1 sign bit
 *     reflect           x → min + max − x                        D = 0
 *     swap_digits(i,j)  swap two decimal places                  D = log2 C(P, 2)
 *     reverse_digits    read the P places backwards              D = 0
 *     rotate_digits(k)  rotate the written places left by k      D = log2 (P − 1)
 *   (the digit maps are injective on the domain; they fail when the result would leave it)
 *   overwrites pay their pointwise erasure log2 |f⁻¹(f(x))|, counted exactly:
 *     set_digit(p, d)   one place becomes d                      E ≈ log2 10, D = log2 P + log2 10
 *     round(p)          to the nearest 10^p, halves away from 0  E ≈ p · log2 10, D = log2 P
 *     set(v)            x → v                                    E = log2 W, D = log2 W
 * so a structured partial edit (one place, the low places) is far cheaper than overwriting the number.
 *
 * Places: P = max(2, decimal digits of max(|min|, |max|)), fixed width with leading zeros; place 0 is
 * the ones, place 1 the tens, ...; the sign is kept (a digit map never changes it). Motion is charged per act
 * by applyCalls on the type's "value" layer (Σ B² / B_tot of the act's net change).
 * Every overwrite is idempotent; every bijection is injective. Int(v, v) offers no mutators.
 */
import type { Instantiation, MutatorDef, MutatorKind, MutatorScope, Rng } from "../types.ts";
import { checkFields, fail, intParam, lg, mdoc, mod } from "../mutators.ts";

type IP = Record<string, number>;

interface IntCtx { readonly min: number; readonly max: number; readonly W: number; readonly P: number }
function ctx(inst: Instantiation): IntCtx {
  const { min, max } = inst.args as { min: number; max: number };
  return { min, max, W: max - min + 1, P: Math.max(2, String(Math.max(Math.abs(min), Math.abs(max))).length) };
}

const inDomain = (c: IntCtx, x: number) => x >= c.min && x <= c.max;
/** Decimal places of |x|, place 0 = ones, padded to P. */
const places = (x: number, P: number): number[] => {
  const s = String(Math.abs(x)).padStart(P, "0");
  return [...s].reverse().map(Number);
};
const fromPlaces = (ds: readonly number[], sign: number): number => {
  const v = Number([...ds].reverse().join(""));
  return v === 0 ? 0 : sign * v;
};
const sgn = (x: number) => (x < 0 ? -1 : 1);
/** Elias-γ length of n ≥ 1. */
const gamma = (n: number) => 2 * Math.floor(Math.log2(n)) + 1;

interface Spec {
  id: string; name: string; emoji: string; summary: string; kind: MutatorKind; scope: MutatorScope;
  fields: readonly string[];
  parse(raw: Readonly<Record<string, unknown>>, c: IntCtx): IP;
  describe(p: IP, c: IntCtx): number;
  apply(x: number, p: IP, c: IntCtx): number | null;
  /** Pointwise erasure (overwrites only). */
  erase?(x: number, p: IP, c: IntCtx): number;
  sample(rng: Rng, c: IntCtx): IP;
  guest: { py: string; js: string; dts: string; doc: [string, string, string][] };
}

function def(s: Spec): MutatorDef<number, IP> {
  return Object.freeze({
    id: s.id, name: s.name, emoji: s.emoji, summary: s.summary,
    // a one-value domain has nothing to change
    requires: [{ term: "bounds.bits", op: ">=" as const, value: 1 }], scope: s.scope, kind: s.kind,
    parse: (raw: Readonly<Record<string, unknown>>, inst: Instantiation) => { checkFields(raw, s.fields); return s.parse(raw, ctx(inst)); },
    describeBits: (p: IP, inst: Instantiation) => s.describe(p, ctx(inst)),
    apply: (x: number, p: IP, inst: Instantiation) => s.apply(x, p, ctx(inst)),
    erasureBits: (x: number, p: IP, inst: Instantiation) =>
      (s.erase && s.apply(x, p, ctx(inst)) !== null ? s.erase(x, p, ctx(inst)) : 0),
    sample: (rng: Rng, inst: Instantiation) => s.sample(rng, ctx(inst)),
    guest: { python: s.guest.py, js: s.guest.js, dts: s.guest.dts, docs: s.guest.doc.map(([p, t, k]) => mdoc(p, t, k)) },
  });
}

/** Distinct preimages among `candidates` that `f` maps to y. */
function preimages(candidates: Iterable<number>, f: (x: number) => number | null, y: number): number {
  const seen = new Set<number>();
  for (const x of candidates) if (f(x) === y) seen.add(x);
  return seen.size;
}

// guest support rides on `add` (first, always available)
const SUPPORT_PY = `
def _M_CALL(_m, **params):
    params["__m"] = _m
    return params


def _M_INT(x, what):
    if isinstance(x, bool) or not isinstance(x, int):
        raise ValueError(what + " must be a whole number, not " + repr(x))
    return x

`;
const SUPPORT_JS = `
function __M_INT(x, what) {
  if (!Number.isInteger(x)) throw new Error(what + " must be a whole number, not " + JSON.stringify(x));
  return x;
}

`;

const add = def({
  id: "add", name: "Add", emoji: "➕", summary: "Add a number, wrapping round from the biggest back to the smallest.",
  kind: "bijective", scope: "local", fields: ["k"],
  parse: (raw, c) => {
    const k = intParam(raw, "k", -(c.W - 1), c.W - 1);
    if (k === 0) fail(`"k" must not be 0`);
    return { k };
  },
  describe: p => gamma(Math.abs(p.k)) + 1,
  apply: (x, p, c) => c.min + mod(x - c.min + p.k, c.W),
  sample: (rng, c) => {
    if (c.W < 2) return { k: 1 };
    for (;;) {
      let L = 0;
      while (rng.int(2) === 1 && L < 52) L++;
      const n = 2 ** L + (L ? rng.int(2 ** L) : 0);
      if (n <= c.W - 1) return { k: rng.int(2) ? n : -n };
    }
  },
  guest: {
    py: `${SUPPORT_PY}def add(k):
    return _M_CALL("add", k=_M_INT(k, "k"))
`,
    js: `${SUPPORT_JS}function add(k) {
  return { __m: "add", k: __M_INT(k, "k") };
}
`,
    dts: `declare function add(k: number): MutatorCall;\n`,
    doc: [["add(k)", "add(k)", "Add k (or take it away if k is negative), wrapping round from the biggest number back to the smallest."]],
  },
});

const reflect = def({
  id: "reflect", name: "Mirror", emoji: "🪞", summary: "Flip the number to the other end of the range: the smallest becomes the biggest.",
  kind: "bijective", scope: "global", fields: [],
  parse: () => ({}), describe: () => 0,
  apply: (x, _p, c) => c.min + c.max - x,
  sample: () => ({}),
  guest: {
    py: `def reflect():
    return _M_CALL("reflect")
`,
    js: `function reflect() {
  return { __m: "reflect" };
}
`,
    dts: `declare function reflect(): MutatorCall;\n`,
    doc: [["reflect()", "reflect()", "Flip to the other end of the range: the smallest number becomes the biggest, and the middle stays put."]],
  },
});

const digitMap = (f: (ds: number[], p: IP, c: IntCtx) => number[]) => (x: number, p: IP, c: IntCtx): number | null => {
  const y = fromPlaces(f(places(x, c.P), p, c), sgn(x));
  return inDomain(c, y) ? y : null;
};

const swap_digits = def({
  id: "swap_digits", name: "Swap digits", emoji: "🔀", summary: "Swap two digits of the number (ones, tens, hundreds, ...).",
  kind: "bijective", scope: "local", fields: ["i", "j"],
  parse: (raw, c) => {
    const i = intParam(raw, "i", 0, c.P - 2);
    return { i, j: intParam(raw, "j", i + 1, c.P - 1) };
  },
  describe: (p, c) => lg(c.P - 1) + lg(c.P - 1 - p.i),
  apply: digitMap((ds, p) => { [ds[p.i], ds[p.j]] = [ds[p.j], ds[p.i]]; return ds; }),
  sample: (rng, c) => { const i = rng.int(c.P - 1); return { i, j: i + 1 + rng.int(c.P - 1 - i) }; },
  guest: {
    py: `def swap_digits(i, j):
    i, j = sorted([_M_INT(i, "place"), _M_INT(j, "place")])
    return _M_CALL("swap_digits", i=i, j=j)
`,
    js: `function swapDigits(i, j) {
  const [a, b] = [__M_INT(i, "place"), __M_INT(j, "place")].sort((x, y) => x - y);
  return { __m: "swap_digits", i: a, j: b };
}
`,
    dts: `declare function swapDigits(i: number, j: number): MutatorCall;\n`,
    doc: [["swap_digits(i, j)", "swapDigits(i, j)", "Swap two digits; place 0 is the ones, 1 the tens, 2 the hundreds. swap_digits(0, 1) turns 1234 into 1243."]],
  },
});

const reverse_digits = def({
  id: "reverse_digits", name: "Reverse digits", emoji: "↔️", summary: "Write the digits backwards (with leading zeros to the full width).",
  kind: "bijective", scope: "global", fields: [],
  parse: () => ({}), describe: () => 0,
  apply: digitMap(ds => ds.reverse()),
  sample: () => ({}),
  guest: {
    py: `def reverse_digits():
    return _M_CALL("reverse_digits")
`,
    js: `function reverseDigits() {
  return { __m: "reverse_digits" };
}
`,
    dts: `declare function reverseDigits(): MutatorCall;\n`,
    doc: [["reverse_digits()", "reverseDigits()", "Write the digits backwards, padded with zeros to the room's full width: 0123 becomes 3210."]],
  },
});

const rotate_digits = def({
  id: "rotate_digits", name: "Rotate digits", emoji: "🔄", summary: "Move the written digits round to the left, the front ones going to the back.",
  kind: "bijective", scope: "global", fields: ["k"],
  parse: (raw, c) => ({ k: intParam(raw, "k", 1, c.P - 1) }),
  describe: (_p, c) => lg(c.P - 1),
  apply: digitMap((ds, p) => { const w = [...ds].reverse(); return [...w.slice(p.k), ...w.slice(0, p.k)].reverse(); }),
  sample: (rng, c) => ({ k: 1 + rng.int(c.P - 1) }),
  guest: {
    py: `def rotate_digits(steps=1):
    return _M_CALL("rotate_digits", k=_M_INT(steps, "steps"))
`,
    js: `function rotateDigits(steps = 1) {
  return { __m: "rotate_digits", k: __M_INT(steps, "steps") };
}
`,
    dts: `declare function rotateDigits(steps?: number): MutatorCall;\n`,
    doc: [["rotate_digits(steps=1)", "rotateDigits(steps = 1)", "Move the written digits left by some steps, the front ones going round to the back: 0123 becomes 1230."]],
  },
});

const setDigit = (x: number, p: IP, c: IntCtx): number | null => {
  const ds = places(x, c.P);
  ds[p.place] = p.digit;
  const y = fromPlaces(ds, sgn(x));
  return inDomain(c, y) ? y : null;
};

const set_digit = def({
  id: "set_digit", name: "Set a digit", emoji: "✏️", summary: "Change one digit of the number.",
  kind: "overwrite", scope: "local", fields: ["place", "digit"],
  parse: (raw, c) => ({ place: intParam(raw, "place", 0, c.P - 1), digit: intParam(raw, "digit", 0, 9) }),
  describe: (_p, c) => lg(c.P) + Math.log2(10),
  apply: setDigit,
  erase: (x, p, c) => {
    const y = setDigit(x, p, c)!, ds = places(y, c.P), cands: number[] = [];
    for (const s of y === 0 ? [1, -1] : [sgn(y)]) for (let e = 0; e < 10; e++) { ds[p.place] = e; cands.push(fromPlaces(ds, s)); }
    return Math.log2(preimages(cands.filter(v => inDomain(c, v)), v => setDigit(v, p, c), y));
  },
  sample: (rng, c) => ({ place: rng.int(c.P), digit: rng.int(10) }),
  guest: {
    py: `def set_digit(place, digit):
    return _M_CALL("set_digit", place=_M_INT(place, "place"), digit=_M_INT(digit, "digit"))
`,
    js: `function setDigit(place, digit) {
  return { __m: "set_digit", place: __M_INT(place, "place"), digit: __M_INT(digit, "digit") };
}
`,
    dts: `declare function setDigit(place: number, digit: number): MutatorCall;\n`,
    doc: [["set_digit(place, digit)", "setDigit(place, digit)", "Change one digit; place 0 is the ones, 1 the tens. set_digit(1, 7) turns 1234 into 1274."]],
  },
});

const roundTo = (x: number, p: IP, c: IntCtx): number | null => {
  const q = 10 ** p.places, y = sgn(x) * Math.floor((Math.abs(x) + q / 2) / q) * q;
  return inDomain(c, y) ? (y === 0 ? 0 : y) : null;
};

const round = def({
  id: "round", name: "Round", emoji: "🎯", summary: "Round to the nearest ten, hundred, thousand, ... (halves round away from zero).",
  kind: "overwrite", scope: "region", fields: ["places"],
  parse: (raw, c) => ({ places: intParam(raw, "places", 1, c.P) }),
  describe: (_p, c) => lg(c.P),
  apply: roundTo,
  erase: (x, p, c) => {
    const y = roundTo(x, p, c)!, h = 10 ** p.places / 2;
    const [lo, hi] = y > 0 ? [y - h, y + h - 1] : y < 0 ? [y - h + 1, y + h] : [-(h - 1), h - 1];
    return Math.log2(Math.min(hi, c.max) - Math.max(lo, c.min) + 1);
  },
  sample: (rng, c) => ({ places: 1 + rng.int(c.P) }),
  guest: {
    py: `def round_off(places=1):
    return _M_CALL("round", places=_M_INT(places, "places"))
`,
    js: `function roundOff(places = 1) {
  return { __m: "round", places: __M_INT(places, "places") };
}
`,
    dts: `declare function roundOff(places?: number): MutatorCall;\n`,
    doc: [["round_off(places=1)", "roundOff(places = 1)", "Round to the nearest 10 (places=1), 100 (places=2), ...: round_off(2) turns 1250 into 1300."]],
  },
});

const set = def({
  id: "set", name: "Set", emoji: "🎰", summary: "Replace the number with any number you choose.",
  kind: "overwrite", scope: "global", fields: ["value"],
  parse: (raw, c) => ({ value: intParam(raw, "value", c.min, c.max) }),
  describe: (_p, c) => lg(c.W),
  apply: (_x, p) => p.value,
  erase: (_x, _p, c) => lg(c.W),
  sample: (rng, c) => ({ value: c.min + rng.int(c.W) }),
  guest: {
    py: `def set_to(value):
    return _M_CALL("set", value=_M_INT(value, "value"))
`,
    js: `function setTo(value) {
  return { __m: "set", value: __M_INT(value, "value") };
}
`,
    dts: `declare function setTo(value: number): MutatorCall;\n`,
    doc: [["set_to(value)", "setTo(value)", "Replace the number with one you choose. It's the most expensive move: it wipes out every digit."]],
  },
});

export const INT_MUTATORS: readonly MutatorDef<number, IP>[] = Object.freeze([
  add, reflect, swap_digits, reverse_digits, rotate_digits, set_digit, round, set,
]);
