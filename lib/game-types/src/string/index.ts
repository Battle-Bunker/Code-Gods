/** The string object type: string(maxLength), any ASCII text (codes 0..127) of at most maxLength characters. */
import { assemblePrelude, availableOf, floatLit, fmtBits, helper, js as jsLit, memo } from "../prelude.ts";
import type { Codec, Instantiation, InstanceInfo, ObjectTypeDef, ParamSchema, Rng, TypeArgs } from "../types.ts";
import { draw, drawBig } from "../util.ts";
import { STRING_MUTATORS } from "./mutators.ts";

/** Longest string a room may use: the protocol's wire cap. */
export const STRING_MAX_LENGTH = 1024;

const PARAMS: readonly ParamSchema[] = Object.freeze([
  { kind: "int", id: "maxLength", label: "Longest", min: 0, max: STRING_MAX_LENGTH, presets: [16, 128],
    question: "How long can a piece of text be?", meaning: "Every object is a piece of text at most this many characters long.",
    consequence: "A shorter limit makes objects simpler and leaves fewer possible values." },
]);

export const STRING_PRESETS: readonly TypeArgs[] = Object.freeze([{ maxLength: 128 }, { maxLength: 16 }]);

export function stringArgs(inst: Instantiation): { maxLength: number } {
  if (inst.objectType !== "string") throw new Error(`${inst.key} is not a string type`);
  return inst.args as unknown as { maxLength: number };
}

/** Number of ASCII strings of length ≤ L: (128^(L+1) − 1) / 127. */
export const stringPopulation = (L: number): bigint => (128n ** BigInt(L + 1) - 1n) / 127n;

/** Rank all ASCII strings by length, then base-128 lexicographic order. */
export function asciiStringAtRank(rank: bigint, maxLength: number): string {
  if (!Number.isSafeInteger(maxLength) || maxLength < 0) throw new Error("Invalid length cap");
  if (rank < 0n) throw new Error("Invalid string rank");
  let length = 0, size = 1n;
  while (rank >= size && length <= maxLength) { rank -= size; size *= 128n; length++; }
  if (length > maxLength) throw new Error("String rank is outside the domain");
  const chars: string[] = [];
  for (let i = 0; i < length; i++) { chars.push(String.fromCharCode(Number(rank % 128n))); rank /= 128n; }
  return chars.reverse().join("");
}

const cache = new Map<string, Instantiation>();
function instantiate(raw: TypeArgs): Instantiation {
  const args = { ...STRING.defaults, ...raw };
  const extra = Object.keys(args).filter(k => k !== "maxLength");
  if (extra.length) throw new Error(`Unknown string parameter ${extra[0]}`);
  const L = args.maxLength;
  if (typeof L !== "number" || !Number.isSafeInteger(L) || L < 0 || L > STRING_MAX_LENGTH) throw new Error("Invalid length cap");
  const key = `string(${L})`;
  let inst = cache.get(key);
  if (!inst) {
    inst = Object.freeze({ objectType: "string", args: Object.freeze({ maxLength: L }), key, terms: Object.freeze({ "length.max": L }), classes: Object.freeze([]) });
    cache.set(key, inst);
  }
  return inst;
}

const isAscii = (s: string) => /^[\x00-\x7f]*$/.test(s);

const codec = memo((inst): Codec<string> => {
  const { maxLength } = stringArgs(inst);
  const isValid = (wire: unknown): wire is string => typeof wire === "string" && wire.length <= maxLength && isAscii(wire);
  const check = (wire: unknown): string => {
    if (!isValid(wire)) throw new Error(`Not ASCII text of at most ${maxLength} characters`);
    return wire;
  };
  return Object.freeze({
    maxLength, decode: check, encode: check, isValid,
    assert(wire: unknown): asserts wire is string { check(wire); },
  });
});

/** Uniform over every ASCII string of length ≤ maxLength (so almost all have the full length). */
function spawn(inst: Instantiation, rng: Rng): string {
  const { maxLength } = stringArgs(inst);
  return asciiStringAtRank(drawBig(rng, stringPopulation(maxLength)), maxLength);
}

/**
 * Symmetric proposals for μ uniform over strings of length ≤ L. With u uniform in 0..515:
 *   0..127   insert a uniform character at a uniform position of n+1 (stays when n = L)
 *   128      delete the character at a uniform position (stays when n = 0)
 *   129..451 change one character to one of the 127 others
 *   452..515 resample the whole string from μ
 * Insert and delete balance: q(x→y) = (128/516)·m/((n+1)·128) = (1/516)·m/(n+1) = q(y→x), where m
 * counts the insertions of x that give y (equal to the deletions of y that give x).
 */
function propose(x: string, inst: Instantiation, rng: Rng): string {
  const { maxLength } = stringArgs(inst), n = x.length, u = draw(rng, 516);
  if (u < 128) {
    if (n >= maxLength) return x;
    const i = draw(rng, n + 1);
    return x.slice(0, i) + String.fromCharCode(draw(rng, 128)) + x.slice(i);
  }
  if (u === 128) {
    if (n === 0) return x;
    const i = draw(rng, n);
    return x.slice(0, i) + x.slice(i + 1);
  }
  if (u < 452) {
    if (n === 0) return x;
    const i = draw(rng, n), c = (x.charCodeAt(i) + 1 + draw(rng, 127)) % 128;
    return x.slice(0, i) + String.fromCharCode(c) + x.slice(i + 1);
  }
  return spawn(inst, rng);
}

/** 7 bits per position (up to the longer length) whose character differs. */
function changedBits(a: string, b: string): Record<string, number> {
  let d = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a.charCodeAt(i) !== b.charCodeAt(i)) d++;
  return { text: 7 * d };
}

/** log2 of the number of strings: 7(L+1) − log2 127 + log2(1 − 2^(−7(L+1))). */
function layerBits(inst: Instantiation): Record<string, number> {
  const L = stringArgs(inst).maxLength;
  return { text: 7 * (L + 1) - Math.log2(127) + Math.log2(1 - 2 ** (-7 * (L + 1))) };
}

/** Operators the Python Text view forwards to the str (each reads the whole text first). */
const PY_TEXT_DUNDERS = ["__eq__", "__ne__", "__lt__", "__le__", "__gt__", "__ge__", "__add__", "__radd__", "__mul__", "__rmul__",
  "__mod__", "__hash__", "__str__", "__repr__", "__format__"];

const prelude = memo(inst => {
  const L = stringArgs(inst).maxLength;
  // Read costs (docs/energy-model.md §3.2): the length log2(L + 1); one character log2 A (A = 128: ASCII codes 0..127,
  // as the codec above); the whole text length + length · log2 A, which also caps everything read in one act.
  const lengthBits = Math.log2(L + 1), charBits = Math.log2(128);
  const agentPython = `

def __read_bits():
    """The bits the agent has read so far this act (the meter __agent_view replaces)."""
    return 0.0


def __agent_view(wire):
    """Canonical wire -> the Text an agent receives: s.length, s.char(i) and s.text are metered (len(s), s[i], slices,
    iteration, "in", str(s), == and comparisons too). The text and the meter live in this function's closure
    (docs/energy-model.md 3.2)."""
    global __read_bits
    if type(wire) is not str or len(wire) > MAX_LENGTH or any(ord(ch) > 127 for ch in wire):
        raise ValueError("not text of this room")
    t = wire
    n = len(wire)
    cap = ${floatLit(lengthBits)} + n * ${floatLit(charBits)}
    bits = [0.0]
    seen = bytearray(n + 2)

    def pay(b):
        bits[0] += b
        if bits[0] > cap:
            bits[0] = cap

    def size():
        if not seen[0]:
            seen[0] = 1
            pay(${floatLit(lengthBits)})
        return n

    def whole():
        if not seen[1]:
            seen[1] = 1
            seen[0] = 1
            bits[0] = cap
        return t

    def char(i):
        if i >= n:
            size()
            raise IndexError("there is no character at place %r" % (i,))
        if not seen[1] and not seen[2 + i]:
            seen[2 + i] = 1
            pay(${floatLit(charBits)})
        return t[i]

    class Text:
        __slots__ = ()

        @property
        def length(self):
            return size()

        @property
        def text(self):
            return whole()

        def char(self, place):
            if type(place) is not int or place < 0:
                raise ValueError("character places count from 0")
            return char(place)

        def __len__(self):
            return size()

        def __bool__(self):
            return size() > 0

        def __getitem__(self, i):
            if type(i) is slice:
                size()
                out = []
                for j in range(*i.indices(n)):
                    out.append(char(j))
                return "".join(out)
            if type(i) is not int:
                raise TypeError("text places must be whole numbers")
            if i < 0:
                size()
                i += n
                if i < 0:
                    raise IndexError("there is no character at place %r" % (i - n,))
            return char(i)

        def __iter__(self):
            size()
            i = 0
            while i < n:
                yield char(i)
                i += 1

        def __contains__(self, other):
            return (whole() if isinstance(other, Text) else other) in whole()

        def __getattr__(self, name):
            if name.startswith("_") or not callable(getattr(str, name, None)):
                raise AttributeError("text has no " + name)
            whole()
            return getattr(t, name)

    reflected = {"__radd__": lambda x, other: other + x, "__rmul__": str.__mul__}

    def forward(name):
        method = reflected.get(name) or getattr(str, name)

        def operator(self, *others):
            x = whole()
            return method(x, *[whole() if isinstance(o, Text) else o for o in others])
        return operator

    for name in ${jsLit(PY_TEXT_DUNDERS)}:
        setattr(Text, name, forward(name))

    def read_bits():
        return bits[0]

    __read_bits = read_bits
    return Text()
`;
  const agentJs = `

function __read_bits() { return 0; }

class Text {}

function __agent_view(wire) {
  if (typeof wire !== "string" || wire.length > MAX_LENGTH || !/^[\\x00-\\x7f]*$/.test(wire)) throw new Error("not text of this room");
  const t = wire, n = wire.length, cap = ${floatLit(lengthBits)} + n * ${floatLit(charBits)};
  const bits = new Float64Array(1), seen = new Uint8Array(n + 2);
  const pay = (b) => { bits[0] += b; if (bits[0] > cap) bits[0] = cap; };
  const size = () => { if (seen[0] === 0) { seen[0] = 1; pay(${floatLit(lengthBits)}); } return n; };
  const whole = () => { if (seen[1] === 0) { seen[1] = 1; seen[0] = 1; bits[0] = cap; } return t; };
  const s = Object.create(Text.prototype);
  Object.defineProperty(s, "length", { enumerable: true, get() { return size(); } });
  Object.defineProperty(s, "text", { enumerable: true, get() { return whole(); } });
  Object.defineProperty(s, "char", { value(place) {
    if (typeof place !== "number" || place % 1 !== 0 || place < 0) throw new RangeError("character places count from 0");
    if (place >= n) { size(); throw new RangeError("there is no character at place " + place); }
    if (seen[1] === 0 && seen[2 + place] === 0) { seen[2 + place] = 1; pay(${floatLit(charBits)}); }
    return t[place];
  } });
  Object.defineProperty(s, "valueOf", { value() { return whole(); } });
  Object.defineProperty(s, "toString", { value() { return whole(); } });
  Object.defineProperty(s, Symbol.toPrimitive, { value() { return whole(); } });
  __read_bits = () => bits[0];
  return Object.freeze(s);
}
`;
  const agentDts = `
/** The text an agent receives. Reading it costs bits (first read per act): length, each character, or all of it. */
declare class Text {
  private constructor();
  /** How many characters it has. */
  readonly length: number;
  /** The character at place i (0 = the first). */
  char(place: number): string;
  /** All of it. */
  readonly text: string;
}
declare function __agent_view(wire: string): Text;
/** Bits the agent has read so far this act. */
declare function __read_bits(): number;
`;
  return assemblePrelude(inst, {
    python: `
MAX_LENGTH = ${L}


def __decode(wire):
    if type(wire) is not str or len(wire) > MAX_LENGTH or any(ord(ch) > 127 for ch in wire):
        raise ValueError("not text of this room")
    return wire
`,
    js: `
const MAX_LENGTH = ${L};

function __decode(wire) {
  if (typeof wire !== "string" || wire.length > MAX_LENGTH || !/^[\\x00-\\x7f]*$/.test(wire)) throw new Error("not text of this room");
  return wire;
}
`,
    dts: `
type Score = number | number[];
/** The longest text allowed in this room. */
declare const MAX_LENGTH: ${L};
declare function __decode(wire: string): string;
`,
    agentPython, agentJs, agentDts, agentAttrs: ["char", "length", "text"],
    helpers: [
      helper("MAX_LENGTH", "MAX_LENGTH -> int", "MAX_LENGTH: number", `The longest text allowed in this room (${L} characters)`),
      helper("s.length", "len(s) or s.length -> int", "s.length: number", `How many characters it has. Reads ${fmtBits(lengthBits)} bits`),
      helper("s.char", "s.char(i) or s[i] -> str", "s.char(place: number): string",
        `The character at place i; place 0 is the first. Reads ${fmtBits(charBits)} bits`),
      helper("s.text", "s.text -> str", "s.text: string", `Reads all of it: its length, then ${fmtBits(charBits)} bits per character`),
    ],
  }, STRING_MUTATORS);
});

const describe = memo((inst): InstanceInfo => {
  const { maxLength } = stringArgs(inst);
  return Object.freeze({
    objectType: "string", args: inst.args, key: inst.key,
    label: `Text up to ${maxLength} characters`,
    badges: [], terms: inst.terms,
    display: { maxLength, alphabet: "ascii" },
    codec: { format: "ascii-string-v1", maxLength },
    mutators: availableOf(STRING_MUTATORS, inst).map(m => ({ id: m.id, name: m.name, emoji: m.emoji, summary: m.summary })),
    helpers: prelude(inst).helpers,
  });
});

export const STRING: ObjectTypeDef<string> = Object.freeze({
  id: "string", label: "string", emoji: "🔤", kid: "A piece of text",
  params: PARAMS,
  defaults: STRING_PRESETS[0],
  classes: [],
  instantiate,
  representatives: () => [0, 1, 2, 5, 16, 20, 64, 128, 1024].map(maxLength => ({ maxLength })),
  codec,
  spawn,
  propose,
  changedBits,
  layerBits,
  get mutators() { return STRING_MUTATORS; },
  prelude,
  describe,
});
