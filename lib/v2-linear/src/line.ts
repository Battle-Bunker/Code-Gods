/**
 * The line object (spec §12.1): a tuple of k lines, each the primitive integer triple (a, b, c) of a·x + b·y + c = 0
 * with gcd 1 and b > 0, or b = 0 and a > 0.
 */
import { argBits, gcd, mixedIntCode, Qn, q, stepsIntCode, type Invalid, type IntCode, type Q, type Variant } from "@workspace/v2-core";

export interface Line {
  readonly a: bigint;
  readonly b: bigint;
  readonly c: bigint;
}
export interface LineState {
  readonly lines: readonly Line[];
}

export type Domain = "Z" | "Q";
export interface LineParams {
  readonly domain: Domain;
  readonly linesPerObject: number;
  readonly argDomain: Domain;
}

export function lineParams(v: Variant): LineParams {
  const p = v.params as Partial<Record<keyof LineParams, unknown>>;
  const domain = p.domain === "Q" ? "Q" : "Z";
  return {
    domain,
    linesPerObject: typeof p.linesPerObject === "number" ? p.linesPerObject : 1,
    argDomain: p.argDomain === "Q" || p.argDomain === "Z" ? p.argDomain : domain,
  };
}

/** The primitive, sign-normalised triple, or why there is no line. */
export function normalise(a: bigint, b: bigint, c: bigint): Line | Invalid {
  if (a === 0n && b === 0n) return { invalid: c === 0n ? "0 = 0 is not a line" : "that equation has no solutions" };
  const g = gcd(gcd(a, b), c);
  let [na, nb, nc] = [a / g, b / g, c / g];
  if (nb < 0n || (nb === 0n && na < 0n)) [na, nb, nc] = [-na, -nb, -nc];
  return { a: na, b: nb, c: nc };
}

/**
 * The line in the variant's domain, or why not. There is no box on the coefficients (owner decision 26): a bigger
 * number is only dearer, through φ (the mixed number code), never refused.
 */
export function inDomain(line: Line | Invalid, p: LineParams): Line | Invalid {
  if ("invalid" in line) return line;
  if (p.domain === "Z" && line.b !== 1n) {
    return { invalid: line.b === 0n ? "a vertical line is not on this board" : "this board only has whole-number gradients and intercepts" };
  }
  return line;
}

/** y = mx + c as a line (b > 0). */
export function fromMC(m: Q, c: Q): Line {
  // −m·x + y − c = 0, scaled by the denominators' product.
  const L = m.d * c.d;
  return normalise(-m.n * (L / m.d), L, -c.n * (L / c.d)) as Line;
}

export const isVertical = (l: Line): boolean => l.b === 0n;
/** The gradient of a non-vertical line. */
export const slope = (l: Line): Q => q(-l.a, l.b);
/** The y-intercept of a non-vertical line. */
export const intercept = (l: Line): Q => q(-l.c, l.b);
/** y at x = t for a non-vertical line. */
export const yAt = (l: Line, t: Q): Q => Qn.add(Qn.mul(slope(l), t), intercept(l));
/** x at y = t for a non-horizontal line. */
export const xAt = (l: Line, t: Q): Q => q(-l.c * t.d - l.b * t.n, l.a * t.d);

/**
 * The code of each coefficient of the primitive triple on fraction lines (`line-q`; docs/engine-v2/fractions.md §4,
 * code C3, a trial): a and c by the mixed (factorisation) code with p(0) = 1/8, b by steps with p(0) = 1/16, so
 * b = 1, 2, 3, 4 cost 0, ½, 1, 1½ bits more. Vertical (b = 0), horizontal (a = 0) and through-origin (c = 0) lines are
 * rarer than under the mixed code's p(0) = ½, and small denominators cheap. Each code is complete and unbounded.
 */
export const LINE_Q_CODES: { readonly a: IntCode; readonly b: IntCode; readonly c: IntCode } =
  { a: mixedIntCode(1 / 8), b: stepsIntCode(1 / 16), c: mixedIntCode(1 / 8) };

/**
 * φ, the bits of a full read (17 Nov: the turn law's own code, v2-core surprise.ts argBits, Rissanen's universal code
 * with a sign bit): (m, c) as whole numbers on whole-number boards; the primitive triple (a, b, c) on fraction boards,
 * b ≥ 0 so it carries no sign.
 */
export function lineBits(l: Line, p: LineParams): number {
  if (p.domain === "Z") return argBits(-l.a, true) + argBits(-l.c, true);
  return argBits(l.a, true) + argBits(l.b, false) + argBits(l.c, true);
}

export const encodeLine = (l: Line): string => `${l.a},${l.b},${l.c}`;
export function decodeLine(s: string): Line {
  const parts = s.split(",");
  if (parts.length !== 3 || !parts.every(x => /^-?\d+$/.test(x))) throw new SyntaxError(`Not a line: ${s}`);
  const [a, b, c] = parts.map(x => BigInt(x)) as [bigint, bigint, bigint];
  const n = normalise(a, b, c);
  if ("invalid" in n || n.a !== a || n.b !== b || n.c !== c) throw new SyntaxError(`Not a canonical line: ${s}`);
  return n;
}

/** "y = 2x + 1", "x = 3", "y = −½x" style, for messages. */
export function describeLine(l: Line): string {
  if (isVertical(l)) return `x = ${Qn.toWire(q(-l.c, l.a))}`;
  const m = slope(l), c = intercept(l);
  const mt = Qn.isZero(m) ? "" : Qn.eq(m, Qn.ONE) ? "x" : Qn.eq(m, q(-1)) ? "-x" : `${Qn.toWire(m)}x`;
  if (!mt) return `y = ${Qn.toWire(c)}`;
  if (Qn.isZero(c)) return `y = ${mt}`;
  return `y = ${mt} ${c.n < 0n ? "-" : "+"} ${Qn.toWire(Qn.abs(c))}`;
}
