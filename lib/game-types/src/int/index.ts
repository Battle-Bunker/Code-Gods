/** The Int object type: Int(min, max), whole numbers in a signed 32-bit range. The wire is the number. */
import { CLASSES } from "../constraints.ts";
import { assemblePrelude, availableOf, floatLit, fmtBits, helper, js as jsLit, memo } from "../prelude.ts";
import type { Codec, Instantiation, InstanceInfo, ObjectTypeDef, ParamSchema, Rng, TypeArgs } from "../types.ts";
import { draw } from "../util.ts";
import {
  DEFAULT_COST_MODEL, flatGenerator, generatorOf, locationBits, magnitudeBits, siteWork,
  type CostModel, type CostRow, type Generator, type Layer,
} from "../structure/index.ts";
import { INT_MUTATORS, placesOf } from "./mutators.ts";

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


/**
 * Int's structure (structure/index.ts; docs/mutation-cost-design.md §4.3, §5.2). Two generator families, so ℓ_which =
 * log2 2 = 1 bit:
 *   add       a site is a decimal place (P of them, ℓ_where = log2 P); the argument is a signed digit ±1 … ±9, the
 *             argument space of a slider of ten values (the same one a Grid digit's `add` has). Adds wrap in the range,
 *             so every add is a bijection and erases nothing.
 *   multiply  one site (the number); the argument is ±m, m ≥ 2. Out of range it fails, so it is injective.
 * What a cost model decides is the argument code:
 *   set-v1       every signed digit costs log2 18 (a flat code); ×m costs 1 (the sign) + Σ over its prime factors p of
 *                (log2 p + 1). That multiply code is NOT a prefix code: Σ over ±m of 2^(−w) diverges (Σ 1/p does). It
 *                stays as it is, because stored games were charged by it.
 *   distance-v1  a signed digit d costs λ·|d|, λ = 1.5849 the slider's Kraft-tight rate, so a net change of Δ costs
 *                its cheapest signed-digit representation (the positional norm: +999 = +1000 − 1 is two one-step
 *                digits); ×m costs λ×·log2 |m|, λ× = 2.1853 (structure MAGNITUDE_RATE), additive in the factors and a
 *                prefix code.
 */
const DIGIT: Layer = { kind: "ordinal", n: 10 };
const FLAT_DIGIT = flatGenerator(DIGIT);
const INT_FAMILIES = 2;
/** The generator of one decimal place under a model: its arguments are the signed digits ±1 … ±9. */
export const intDigitGenerator = (model: CostModel = DEFAULT_COST_MODEL): Generator =>
  (model === "distance-v1" ? generatorOf(DIGIT, model)! : FLAT_DIGIT);

/** W of the elementary add d·10ᵖ (d = ±1 … ±9): ℓ_which + ℓ_where + the signed digit's bits. */
export const digitWork = (inst: Instantiation, d: number, model: CostModel = DEFAULT_COST_MODEL): number =>
  siteWork({ generator: intDigitGenerator(model), sites: placesOf(inst) }, INT_FAMILIES, 0, Math.abs(d));

/**
 * The information cost w of Int's elementary mutators under set-v1 (docs/energy-model.md §4.1). One bit names the op (2
 * elementary ops).
 * - add d·10ᵖ: + log2 P (the place) + log2 18 (the signed digit ±1…±9). A bijection (adds wrap), so it erases nothing.
 *   Through the structure this is, bit for bit, the old closed form 1 + log2 P + log2 18 (test/cost-models-int-string).
 * - multiply by m: + 1 (the sign) + Σ over m's prime factors p, with multiplicity, of (log2 p + 1). A prime is the
 *   elementary step, so w(×ab) = w(×a) + w(×b) − 2. Out of range it fails, so it is injective and erases nothing.
 */
export const digitAddCost = (inst: Instantiation): number => digitWork(inst, 1, "set-v1");
export function multiplyCost(m: number): number {
  let n = Math.abs(m), bits = 2;
  for (let p = 2; p * p <= n; p += p === 2 ? 1 : 2) while (n % p === 0) { bits += Math.log2(p) + 1; n /= p; }
  if (n > 1) bits += Math.log2(n) + 1;
  return bits;
}
/** W of ×m (|m| ≥ 2) under a model: set-v1's per-prime code, or distance-v1's ℓ_which + λ×·log2 |m|. */
export const multiplyWork = (m: number, model: CostModel = DEFAULT_COST_MODEL): number =>
  (model === "distance-v1" ? locationBits({ sites: 1 }, INT_FAMILIES) + magnitudeBits(m) : multiplyCost(m));
/**
 * The fewest digit adds (d·10ᵖ, d ∈ ±1…±9) that sum to n: the minimal number of nonzero digits of a base-10 signed-digit
 * representation. A carry helps only on runs of nines (999 = 1000 − 1); a DP over the digits with carry 0 or 1 finds it.
 */
export function signedDigits(n: number): number {
  let x = Math.abs(n), noCarry = 0, carry = Infinity;   // fewest digits so far, without / with a carry into this place
  while (x > 0) {
    const v = x % 10;
    x = (x - v) / 10;
    // digit v + c here: emit it (v + c ≤ 9, no carry out; 10 emits 0 and carries), or emit v + c − 10 and carry 1.
    const step = (c: number, prev: number, out: [number, number]) => {
      const t = v + c;
      if (t === 10) { out[1] = Math.min(out[1], prev); return; }
      out[0] = Math.min(out[0], prev + (t === 0 ? 0 : 1));
      if (t > 0) out[1] = Math.min(out[1], prev + 1);
    };
    const out: [number, number] = [Infinity, Infinity];
    step(0, noCarry, out);
    if (carry !== Infinity) step(1, carry, out);
    [noCarry, carry] = out;
  }
  return Math.min(noCarry, carry + 1);
}

/**
 * The cheapest signed-digit representation of n when a digit of size t costs price[t] (t = 1 … 9): the least
 * Σ price[|digit|] over the base-10 representations of n with digits −9 … 9. `signedDigits` is the case price ≡ 1. The
 * same DP over the places, lowest first, with a carry of 0 or 1 into each: the place's digit v plus the carry c is
 * written as it is (t = v + c), or as t − 10 with a carry of 1 into the next place.
 */
export function signedDigitWork(n: number, price: readonly number[]): number {
  let x = Math.abs(n), noCarry = 0, carry = Infinity;
  while (x > 0) {
    const v = x % 10;
    x = (x - v) / 10;
    let out0 = Infinity, out1 = Infinity;
    for (const [c, prev] of [[0, noCarry], [1, carry]] as const) {
      if (prev === Infinity) continue;
      const t = v + c;
      if (t === 10) { out1 = Math.min(out1, prev); continue; }
      out0 = Math.min(out0, t === 0 ? prev : prev + price[t]);
      if (t > 0) out1 = Math.min(out1, prev + price[10 - t]);
    }
    noCarry = out0;
    carry = out1;
  }
  return Math.min(noCarry, carry + price[1]);
}

const digitPrices = new Map<string, readonly number[]>();
/** price[t], t = 1 … 9, of this instantiation's digit add under distance-v1 (price[0] is 0, unused). */
function distancePrices(inst: Instantiation): readonly number[] {
  let p = digitPrices.get(inst.key);
  if (!p) digitPrices.set(inst.key, p = Object.freeze(Array.from({ length: 10 }, (_, t) => digitWork(inst, t, "distance-v1"))));
  return p;
}

/**
 * W of a net change of `delta` made by digit adds alone: the cheapest signed-digit representation of delta, or of
 * delta ∓ W (adds wrap in the range). set-v1: the fewest digits × one digit add. distance-v1: each digit also pays for
 * its size, so 7 at a place is cheaper as the next place up less 3.
 */
export function addWork(delta: number, inst: Instantiation, model: CostModel = DEFAULT_COST_MODEL): number {
  const { min, max } = intArgs(inst), W = max - min + 1, ds = [delta, delta - W, delta + W];
  if (model !== "distance-v1") return Math.min(...ds.map(signedDigits)) * digitAddCost(inst);
  const price = distancePrices(inst);
  return Math.min(...ds.map(d => signedDigitWork(d, price)));
}

/**
 * W of one Int call.
 * set-v1: `multiply` (elementary) by its parameter; any other call by the cheaper decomposition of its net effect: the
 * fewest digit adds for Δ = after − before (or Δ ∓ W, since adds wrap), or, when after = before · m, the prime factors
 * of m.
 * distance-v1: every call, `multiply` too, by its net effect: the cheaper of the digit adds for Δ and, when
 * after = before · m with |m| ≥ 2, the multiplication.
 * An upper bound on the cheapest decomposition, exact for the elementary mutators. A model Int does not offer
 * (supportsCostModel) is priced as set-v1; settings validation never lets a room have one.
 */
function callWork(a: number, b: number, call: { readonly id: string; readonly params: unknown }, inst: Instantiation,
  model: CostModel = DEFAULT_COST_MODEL): number {
  const m = a !== 0 ? b / a : 0, product = Number.isInteger(m) && Math.abs(m) >= 2;
  if (model === "distance-v1") {
    const adds = addWork(b - a, inst, model);
    return product ? Math.min(adds, multiplyWork(m, model)) : adds;
  }
  if (call.id === "multiply") return multiplyCost((call.params as { m: number }).m);
  const digits = addWork(b - a, inst, "set-v1");
  // multiplyCost(m) ≥ 3 + log2 |m|: factor only when that bound can beat the digits.
  const mult = product && 3 + Math.log2(Math.abs(m)) < digits ? multiplyCost(m) : Infinity;
  return Math.min(digits, mult);
}

/** The multipliers a cost table lists (those the range allows). */
const TABLE_MULTIPLIERS = [2, 3, 5, 7, 10];
/**
 * Int's cost table under a model (the texts that explain change cost): W of one digit add of each size, and of a few
 * multipliers. Under distance-v1 a digit of 7, 8 or 9 is listed at its net-effect price, which is the next place up
 * less 3, 2 or 1.
 */
export function intCostTable(inst: Instantiation, model: CostModel = DEFAULT_COST_MODEL): readonly CostRow[] {
  const { min, max } = intArgs(inst), big = Math.max(2, Math.abs(min), Math.abs(max)), rows: CostRow[] = [];
  if (min === max) return rows;
  if (model === "distance-v1") {
    const price = distancePrices(inst);
    for (let k = 1; k <= 9; k++) rows.push({ move: `move one digit place by ${k}`, work: signedDigitWork(k, price) });
  } else rows.push({ move: "change one digit place", work: digitAddCost(inst) });
  for (const m of TABLE_MULTIPLIERS) if (m <= big) rows.push({ move: `multiply by ${m}`, work: multiplyWork(m, model) });
  return rows;
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
  callWork,
  // Int's digits and multipliers have the two codes above; the other models are Grid's (a dial, a logarithm, modulo 10).
  supportsCostModel: (_inst: Instantiation, model: CostModel) => model === "set-v1" || model === "distance-v1",
  costTable: intCostTable,
  layerBits: (inst: Instantiation) => { const { min, max } = intArgs(inst); return { value: width(min, max) }; },
  get mutators() { return INT_MUTATORS; },
  prelude,
  describe,
});
