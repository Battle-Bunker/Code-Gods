/** The Int object type: Int(min, max), whole numbers in a signed 32-bit range. The wire is the number. */
import { CLASSES } from "../constraints.ts";
import { assemblePrelude, availableOf, floatLit, fmtBits, helper, js as jsLit, memo } from "../prelude.ts";
import type { Codec, Instantiation, InstanceInfo, ObjectTypeDef, ParamSchema, Rng, TypeArgs } from "../types.ts";
import { draw } from "../util.ts";
import { INT_MUTATORS } from "./mutators.ts";

export const INT32_MIN = -2147483648, INT32_MAX = 2147483647;

const PARAMS: readonly ParamSchema[] = Object.freeze([
  { kind: "int", id: "min", label: "Smallest", min: INT32_MIN, max: INT32_MAX, presets: [INT32_MIN, 0],
    question: "What is the smallest number?", meaning: "Every object is a whole number no smaller than this.",
    consequence: "A narrower range makes collisions with existing values, which always fail, more common." },
  { kind: "int", id: "max", label: "Biggest", min: INT32_MIN, max: INT32_MAX, presets: [INT32_MAX, 9999],
    question: "What is the biggest number?", meaning: "Every object is a whole number no bigger than this.",
    consequence: "A narrower range makes collisions with existing values, which always fail, more common." },
]);

/** The settings presets: full signed 32-bit (default) and 0..9999. */
export const INT_PRESETS: readonly TypeArgs[] = Object.freeze([{ min: INT32_MIN, max: INT32_MAX }, { min: 0, max: 9999 }]);

export function intArgs(inst: Instantiation): { min: number; max: number } {
  if (inst.objectType !== "Int") throw new Error(`${inst.key} is not an Int`);
  return inst.args as unknown as { min: number; max: number };
}

/** Bits needed for x − min (0 for a one-value range). */
const width = (min: number, max: number) => (max - min).toString(2).length - (max === min ? 1 : 0);

const cache = new Map<string, Instantiation>();
function instantiate(raw: TypeArgs): Instantiation {
  const args = { ...INT.defaults, ...raw };
  const extra = Object.keys(args).filter(k => k !== "min" && k !== "max");
  if (extra.length) throw new Error(`Unknown Int parameter ${extra[0]}`);
  const { min, max } = args;
  if (typeof min !== "number" || typeof max !== "number" || !Number.isSafeInteger(min) || !Number.isSafeInteger(max)
    || min < INT32_MIN || max > INT32_MAX || min > max) throw new Error("Invalid integer domain");
  const key = `Int(${min},${max})`;
  let inst = cache.get(key);
  if (!inst) {
    inst = Object.freeze({
      objectType: "Int", args: Object.freeze({ min, max }), key,
      terms: Object.freeze({ "bounds.min": min, "bounds.max": max, "bounds.bits": width(min, max) }),
      classes: Object.freeze(min >= 0 ? ["Natural"] : []),
    });
    cache.set(key, inst);
  }
  return inst;
}

const codec = memo((inst): Codec<number> => {
  const { min, max } = intArgs(inst);
  const isValid = (wire: unknown): wire is number => Number.isSafeInteger(wire) && (wire as number) >= min && (wire as number) <= max;
  return Object.freeze({
    maxLength: 0,
    decode(wire: unknown) {
      if (!isValid(wire)) throw new Error(`Not a whole number from ${min} to ${max}`);
      return wire;
    },
    encode(x: number) {
      if (!isValid(x)) throw new Error(`Not a whole number from ${min} to ${max}`);
      return x;
    },
    isValid,
    assert(wire: unknown): asserts wire is number {
      if (!isValid(wire)) throw new Error(`Not a whole number from ${min} to ${max}`);
    },
  });
});

function spawn(inst: Instantiation, rng: Rng): number {
  const { min, max } = intArgs(inst);
  return min + draw(rng, max - min + 1);
}

/**
 * Symmetric proposals on y = x − min: flip one of the range's bits (2/5), change one decimal digit
 * to another digit (2/5), or resample uniformly (1/5). A move that leaves the range stays put, so
 * every kernel is symmetric and μ (uniform) is invariant.
 */
function propose(x: number, inst: Instantiation, rng: Rng): number {
  const { min, max } = intArgs(inst), span = max - min + 1, y = x - min, move = draw(rng, 5);
  if (span === 1) return x;
  let next: number;
  if (move < 2) {
    const p = 2 ** draw(rng, width(min, max));
    next = Math.floor(y / p) % 2 ? y - p : y + p;
  } else if (move < 4) {
    const p = 10 ** draw(rng, String(span - 1).length), d = Math.floor(y / p) % 10;
    next = y + (((d + 1 + draw(rng, 9)) % 10) - d) * p;
  } else next = draw(rng, span);
  return next < span ? min + next : x;
}

/** Bits of x − min that differ (XOR without 32-bit truncation). */
function changedBits(a: number, b: number, inst: Instantiation): Record<string, number> {
  const { min } = intArgs(inst);
  let ya = a - min, yb = b - min, c = 0;
  for (; ya > 0 || yb > 0; ya = Math.floor(ya / 2), yb = Math.floor(yb / 2)) c += (ya % 2) !== (yb % 2) ? 1 : 0;
  return { value: c };
}

/** Operators the Python Num view forwards to the int (each reads the whole number first). */
const PY_NUM_BINARY = ["add", "sub", "mul", "truediv", "floordiv", "mod", "divmod", "pow", "lshift", "rshift", "and", "or", "xor"];
const PY_NUM_DUNDERS = [
  ...PY_NUM_BINARY.flatMap(o => [`__${o}__`, `__r${o}__`]),
  "__neg__", "__pos__", "__abs__", "__invert__", "__eq__", "__ne__", "__lt__", "__le__", "__gt__", "__ge__", "__bool__", "__hash__",
  "__index__", "__int__", "__float__", "__round__", "__trunc__", "__floor__", "__ceil__", "__str__", "__repr__", "__format__",
];

const prelude = memo(inst => {
  const { min, max } = intArgs(inst);
  // Read costs (docs/energy-model.md §3.2): the whole number log2 W; a decimal digit log2 10; the sign 1 bit (free when the
  // range has one sign); all capped at log2 W per act.
  const span = max - min + 1, wBits = Math.log2(span), places = String(Math.max(Math.abs(min), Math.abs(max))).length;
  const signBits = min < 0 && max >= 0 ? 1 : 0, digitBits = Math.log2(10);
  const python = `
LOWEST = ${min}
HIGHEST = ${max}


def digits(x):
    """The decimal digits of a whole number, biggest first: digits(-305) == [3, 0, 5]."""
    return [int(d) for d in str(abs(int(x)))]


def from_digits(ds):
    """The number some digits make: from_digits([3, 0, 5]) == 305."""
    n = 0
    for d in ds:
        n = n * 10 + d
    return n


def __decode(wire):
    if type(wire) is not int or not LOWEST <= wire <= HIGHEST:
        raise ValueError("not a number of this room")
    return wire
`;
  const js = `
const LOWEST = ${min};
const HIGHEST = ${max};

function digits(x) {
  return String(Math.abs(Math.trunc(x))).split("").map(Number);
}

function fromDigits(ds) {
  let n = 0;
  for (const d of ds) n = n * 10 + d;
  return n;
}

function __decode(wire) {
  if (!Number.isSafeInteger(wire) || wire < LOWEST || wire > HIGHEST) throw new Error("not a number of this room");
  return wire;
}
`;
  const agentPython = `

def __read_bits():
    """The bits the agent has read so far this act (the meter __agent_view resets and replaces)."""
    return 0.0


def __agent_view(wire):
    """Canonical wire -> the Num an agent receives: n.value reads the whole number, n.digit(p) one decimal place, n.negative
    the sign; used as a number (n + 1, n > 5, range(n), str(n)) it reads the whole number. The number and the meter live in
    this function's closure (docs/energy-model.md 3.2)."""
    global __read_bits
    if type(wire) is not int or not LOWEST <= wire <= HIGHEST:
        raise ValueError("not a number of this room")
    v = wire
    cap = ${floatLit(wBits)}
    bits = [0.0]
    seen = bytearray(${places + 2})

    def pay(b):
        bits[0] += b
        if bits[0] > cap:
            bits[0] = cap

    def whole():
        if not seen[0]:
            seen[0] = 1
            bits[0] = cap
        return v

    class Num:
        __slots__ = ()

        @property
        def value(self):
            return whole()

        def digit(self, place):
            if type(place) is not int or place < 0:
                raise ValueError("digit places count from 0, the ones place")
            if place >= ${places}:
                return 0
            if not seen[0] and not seen[2 + place]:
                seen[2 + place] = 1
                pay(${floatLit(digitBits)})
            return (abs(v) // 10 ** place) % 10

        @property
        def negative(self):
            if not seen[0] and not seen[1]:
                seen[1] = 1
                pay(${floatLit(signBits)})
            return v < 0

    def forward(name):
        method = getattr(int, name)

        def operator(self, *others):
            x = whole()
            return method(x, *[whole() if isinstance(o, Num) else o for o in others])
        return operator

    for name in ${jsLit(PY_NUM_DUNDERS)}:
        setattr(Num, name, forward(name))

    def read_bits():
        return bits[0]

    __read_bits = read_bits
    return Num()
`;

  const agentJs = `

function __read_bits() { return 0; }

class Num {}

function __agent_view(wire) {
  if (!Number.isSafeInteger(wire) || wire < LOWEST || wire > HIGHEST) throw new Error("not a number of this room");
  const v = wire, cap = ${floatLit(wBits)}, bits = new Float64Array(1), seen = new Uint8Array(${places + 2});
  const pay = (b) => { bits[0] += b; if (bits[0] > cap) bits[0] = cap; };
  const whole = () => { if (seen[0] === 0) { seen[0] = 1; bits[0] = cap; } return v; };
  const n = Object.create(Num.prototype);
  Object.defineProperty(n, "value", { enumerable: true, get() { return whole(); } });
  Object.defineProperty(n, "negative", { enumerable: true, get() {
    if (seen[0] === 0 && seen[1] === 0) { seen[1] = 1; pay(${floatLit(signBits)}); }
    return v < 0;
  } });
  Object.defineProperty(n, "digit", { value(place) {
    if (typeof place !== "number" || place % 1 !== 0 || place < 0) throw new RangeError("digit places count from 0, the ones place");
    if (place >= ${places}) return 0;
    if (seen[0] === 0 && seen[2 + place] === 0) { seen[2 + place] = 1; pay(${floatLit(digitBits)}); }
    const a = v < 0 ? -v : v, p = 10 ** place;
    return ((a - (a % p)) / p) % 10;
  } });
  Object.defineProperty(n, "valueOf", { value() { return whole(); } });
  Object.defineProperty(n, "toString", { value() { return "" + whole(); } });
  Object.defineProperty(n, Symbol.toPrimitive, { value(hint) { return hint === "string" ? "" + whole() : whole(); } });
  __read_bits = () => bits[0];
  return Object.freeze(n);
}
`;

  const dts = `
type Score = number | number[];
/** The smallest and biggest numbers in this room. */
declare const LOWEST: ${min};
declare const HIGHEST: ${max};
declare function digits(x: number | Num): number[];
declare function fromDigits(ds: readonly number[]): number;
declare function __decode(wire: number): number;
`;
  const agentDts = `
/** The number an agent receives. Reading it costs bits (first read per act): value all of them, digit(p) one place. */
declare class Num {
  private constructor();
  /** The whole number. */
  readonly value: number;
  /** One decimal digit of its size: place 0 is the ones. */
  digit(place: number): number;
  /** Whether it is below zero. */
  readonly negative: boolean;
}
declare function __agent_view(wire: number): Num;
/** Bits the agent has read so far this act. */
declare function __read_bits(): number;
`;
  return assemblePrelude(inst, {
    python, js, dts, agentPython, agentJs, agentDts, agentAttrs: ["digit", "negative", "value"], helpers: [
      helper("LOWEST", "LOWEST -> int", "LOWEST: number", `The smallest number in this room (${min})`),
      helper("HIGHEST", "HIGHEST -> int", "HIGHEST: number", `The biggest number in this room (${max})`),
      helper("n.value", "n.value -> int", "n.value: number", `Reads the whole number: ${fmtBits(wBits)} bits`),
      helper("n.digit", "n.digit(place) -> int", "n.digit(place: number): number",
        `One decimal digit of the number's size; place 0 is the ones. Reads ${fmtBits(digitBits)} bits`),
      helper("n.negative", "n.negative -> bool", "n.negative: boolean", `Whether it is below zero. Reads ${fmtBits(signBits)} bit`),
      helper("digits", "digits(x) -> list[int]", "digits(x: number): number[]", `The digits of a number, biggest first: digits(305) is [3, 0, 5]. Reads the whole number: ${fmtBits(wBits)} bits`),
      helper("from_digits", "from_digits(ds) -> int", "fromDigits(ds: number[]): number", "The number some digits make: from_digits([3, 0, 5]) is 305"),
    ],
  }, INT_MUTATORS);
});

const describe = memo((inst): InstanceInfo => {
  const { min, max } = intArgs(inst);
  return Object.freeze({
    objectType: "Int", args: inst.args, key: inst.key,
    label: `Whole numbers from ${min} to ${max}`,
    badges: inst.classes.map(id => CLASSES.find(c => c.id === id)!.badge),
    terms: inst.terms,
    display: { min, max },
    codec: { format: "int-v1", maxLength: 0 },
    mutators: availableOf(INT_MUTATORS, inst).map(m => ({ id: m.id, name: m.name, emoji: m.emoji, summary: m.summary })),
    helpers: prelude(inst).helpers,
  });
});

export const INT: ObjectTypeDef<number> = Object.freeze({
  id: "Int", label: "Int", emoji: "🔢", kid: "A whole number",
  params: PARAMS,
  defaults: INT_PRESETS[0],
  classes: CLASSES.filter(c => c.slot === "bounds"),
  instantiate,
  representatives: () => [...INT_PRESETS, { min: 0, max: 0 }, { min: -1, max: 1 }, { min: 0, max: 1 }, { min: -100, max: -1 },
    { min: 7, max: 1000 }, { min: INT32_MIN, max: INT32_MIN + 2 }, { min: INT32_MAX - 2, max: INT32_MAX }],
  codec,
  spawn,
  propose,
  changedBits,
  layerBits: (inst: Instantiation) => { const { min, max } = intArgs(inst); return { value: width(min, max) }; },
  get mutators() { return INT_MUTATORS; },
  prelude,
  describe,
});
