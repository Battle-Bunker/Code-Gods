/** Exact rationals over bigint (spec §2.1). Always in lowest terms with a positive denominator. */
export interface Q {
  readonly n: bigint;
  readonly d: bigint;
}

export function gcd(a: bigint, b: bigint): bigint {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

/** A rational from a numerator and denominator (integers, numbers must be safe integers). */
export function q(n: bigint | number, d: bigint | number = 1n): Q {
  let nn = toBig(n), dd = toBig(d);
  if (dd === 0n) throw new RangeError("A rational's denominator cannot be 0");
  if (dd < 0n) { nn = -nn; dd = -dd; }
  const g = gcd(nn, dd);
  return g === 1n ? { n: nn, d: dd } : { n: nn / g, d: dd / g };
}

function toBig(x: bigint | number): bigint {
  if (typeof x === "bigint") return x;
  if (!Number.isSafeInteger(x)) throw new RangeError(`${x} is not a safe integer`);
  return BigInt(x);
}

export const ZERO: Q = { n: 0n, d: 1n };
export const ONE: Q = { n: 1n, d: 1n };

export const add = (a: Q, b: Q): Q => (a.d === b.d ? q(a.n + b.n, a.d) : q(a.n * b.d + b.n * a.d, a.d * b.d));
export const sub = (a: Q, b: Q): Q => (a.d === b.d ? q(a.n - b.n, a.d) : q(a.n * b.d - b.n * a.d, a.d * b.d));
export const mul = (a: Q, b: Q): Q => q(a.n * b.n, a.d * b.d);
export function div(a: Q, b: Q): Q {
  if (b.n === 0n) throw new RangeError("Division by zero");
  return q(a.n * b.d, a.d * b.n);
}
export const neg = (a: Q): Q => ({ n: -a.n, d: a.d });
export const abs = (a: Q): Q => (a.n < 0n ? { n: -a.n, d: a.d } : a);
export const inv = (a: Q): Q => div(ONE, a);
export const isZero = (a: Q): boolean => a.n === 0n;
export const isInteger = (a: Q): boolean => a.d === 1n;
export const sign = (a: Q): -1 | 0 | 1 => (a.n < 0n ? -1 : a.n > 0n ? 1 : 0);
export function cmp(a: Q, b: Q): -1 | 0 | 1 {
  const l = a.n * b.d, r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
}
export const eq = (a: Q, b: Q): boolean => a.n === b.n && a.d === b.d;
export const min = (a: Q, b: Q): Q => (cmp(a, b) <= 0 ? a : b);
export const max = (a: Q, b: Q): Q => (cmp(a, b) >= 0 ? a : b);
/** The greatest integer ≤ a. */
export function floor(a: Q): bigint {
  const t = a.n / a.d; // truncates towards zero
  return a.n < 0n && t * a.d !== a.n ? t - 1n : t;
}
export function ceil(a: Q): bigint {
  return -floor(neg(a));
}
export const fromInt = (n: bigint | number): Q => q(n);
/** For display and floating diagnostics only; never for scores or prices. */
export const toNumber = (a: Q): number => Number(a.n) / Number(a.d);

/** Wire form: "p" or "p/q". */
export function toWire(a: Q): string {
  return a.d === 1n ? a.n.toString() : `${a.n}/${a.d}`;
}
const WIRE = /^(-?\d+)(?:\/(\d+))?$/;
export function parse(s: string): Q {
  const m = WIRE.exec(s.trim());
  if (!m) throw new SyntaxError(`Not a rational: ${JSON.stringify(s)}`);
  return q(BigInt(m[1]), m[2] === undefined ? 1n : BigInt(m[2]));
}
/** Accepts a Q, a wire string, a bigint or a safe integer. */
export function from(x: Q | string | bigint | number): Q {
  if (typeof x === "string") return parse(x);
  if (typeof x === "bigint" || typeof x === "number") return q(x);
  if (typeof x === "object" && x !== null && typeof x.n === "bigint" && typeof x.d === "bigint") return q(x.n, x.d);
  throw new TypeError("Not a rational");
}
