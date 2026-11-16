/**
 * Locks (docs/engine-v2/locks.md): a predicate over an object's readings, defended with energy. This module is the
 * predicate language (parse, canonical text, plain words, evaluation), its information content under the stationary
 * law, and the lock arithmetic (fee, upkeep, decay, which locks a state breaks). Pure and shared by every object type.
 */
import type { ElementRef, ObjectType, Variant, Invalid } from "./contracts.ts";
import { elementDecl, elementValue, refKey } from "./evaluate.ts";
import { cmp, eq, parse as parseQ, q, toWire, type Q } from "./q.ts";
import { rng, type Rng } from "./rng.ts";

/** At most this many live locks on one object (the move check stays a few documents). */
export const LOCKS_PER_OBJECT = 8;
/** At most this many atoms in a predicate, members in a set, characters in its text, functions nested. */
export const MAX_ATOMS = 6;
export const MAX_SET = 16;
export const MAX_PREDICATE_TEXT = 400;
export const MAX_NESTING = 3;
/** Draws from the law that estimate a predicate's information content, and the hits below which it is bounded. */
export const INFO_DRAWS = 65_536;
export const INFO_MIN_HITS = 16;
/** Energy per bit of information to create a lock (burned), the unit of a move's price. */
export const CREATE_PER_BIT = 1;

export type LockFn = "digitsum" | "lastdigit" | "isqrt" | "abs";
export const LOCK_FNS: readonly LockFn[] = ["digitsum", "lastdigit", "isqrt", "abs"];
export type LockProp = "prime" | "square" | "integer";
export const LOCK_PROPS: readonly LockProp[] = ["prime", "square", "integer"];

export type LockTerm = { readonly kind: "read"; readonly ref: ElementRef } | { readonly kind: "fn"; readonly fn: LockFn; readonly arg: LockTerm };
export type LockAtom =
  | { readonly op: "=" | ">=" | "<="; readonly t: LockTerm; readonly k: Q }
  | { readonly op: "in"; readonly t: LockTerm; readonly ks: readonly Q[] }
  | { readonly op: "is"; readonly t: LockTerm; readonly prop: LockProp }
  | { readonly op: "multiple"; readonly t: LockTerm; readonly k: bigint };
export interface Predicate {
  readonly atoms: readonly LockAtom[];
}

const bad = (invalid: string): Invalid => ({ invalid });

// ---------------------------------------------------------------- parsing

const TOKEN = /\s*(>=|<=|=|\{|\}|\(|\)|,|-?\d+(?:\/\d+)?|[A-Za-z_][A-Za-z0-9_]*(?::)?|\.)/y;

function tokenize(text: string): string[] | Invalid {
  const out: string[] = [];
  TOKEN.lastIndex = 0;
  let i = 0;
  while (i < text.length) {
    if (/^\s*$/.test(text.slice(i))) break;
    TOKEN.lastIndex = i;
    const m = TOKEN.exec(text);
    if (!m) return bad(`cannot read "${text.slice(i).trim().slice(0, 20)}"`);
    out.push(m[1]!);
    i = TOKEN.lastIndex;
  }
  return out;
}

class Parser {
  i = 0;
  readonly toks: string[];
  constructor(toks: string[]) { this.toks = toks; }
  peek(): string | undefined { return this.toks[this.i]; }
  next(): string | undefined { return this.toks[this.i++]; }
  expect(t: string): void {
    const got = this.next();
    if (got !== t) throw new Error(`expected "${t}"${got === undefined ? " at the end" : `, not "${got}"`}`);
  }
}

const isNum = (t: string | undefined): t is string => t !== undefined && /^-?\d+(\/\d+)?$/.test(t);

function num(p: Parser): Q {
  const t = p.next();
  if (!isNum(t)) throw new Error(`expected a number${t === undefined ? " at the end" : `, not "${t}"`}`);
  return parseQ(t);
}

function term<S>(type: ObjectType<S>, p: Parser, depth: number): LockTerm {
  if (depth > MAX_NESTING) throw new Error(`at most ${MAX_NESTING} functions inside one another`);
  let t = p.next();
  if (t === undefined) throw new Error("expected a reading at the end");
  if ((LOCK_FNS as readonly string[]).includes(t) && p.peek() === "(") {
    p.expect("(");
    const arg = term(type, p, depth + 1);
    p.expect(")");
    return { kind: "fn", fn: t as LockFn, arg };
  }
  let site: number | undefined;
  const lineTag = /^L(\d+):$/.exec(t);
  if (lineTag) {
    site = Number(lineTag[1]) - 1;
    if (site < 0) throw new Error("lines are numbered from 1");
    t = p.next();
  }
  if (t === undefined || !/^[A-Za-z_]/.test(t)) throw new Error(`expected a reading such as si.c, not "${t ?? "the end"}"`);
  p.expect(".");
  const name = p.next();
  if (name === undefined || !/^[A-Za-z_]/.test(name)) throw new Error(`expected an element name after "${t}."`);
  const args: Record<string, string> = {};
  if (p.peek() === "(") {
    p.expect("(");
    for (;;) {
      const k = p.next();
      if (k === undefined || !/^[A-Za-z_]/.test(k)) throw new Error("expected an argument name");
      p.expect("=");
      args[k] = toWire(num(p));
      if (p.peek() === ",") { p.next(); continue; }
      p.expect(")");
      break;
    }
  }
  const ref: ElementRef = { rep: t, name, ...(site === undefined ? {} : { site }), ...(Object.keys(args).length ? { args } : {}) };
  let decl;
  try { decl = elementDecl(type, ref); } catch { throw new Error(`there is no reading ${refKey(ref)}`); }
  if (decl.kind !== "number") throw new Error(`${refKey(ref)} is not a number`);
  const want = (decl.params ?? []).map(x => x.name).sort().join(), given = Object.keys(args).sort().join();
  if (want !== given) throw new Error(`${refKey(ref)} takes ${want ? `(${want})` : "no arguments"}`);
  for (const d of decl.params ?? []) if (d.domain === "Z" && parseQ(args[d.name]!).d !== 1n) throw new Error(`${d.name} must be a whole number`);
  return { kind: "read", ref };
}

function atom<S>(type: ObjectType<S>, p: Parser): LockAtom {
  const t = term(type, p, 0);
  const op = p.next();
  if (op === "=" || op === ">=" || op === "<=") return { op, t, k: num(p) };
  if (op === "in") {
    p.expect("{");
    const ks: Q[] = [num(p)];
    while (p.peek() === ",") { p.next(); ks.push(num(p)); }
    p.expect("}");
    if (ks.length > MAX_SET) throw new Error(`a set holds at most ${MAX_SET} numbers`);
    return { op, t, ks: dedupe(ks) };
  }
  if (op === "is") {
    const w = p.next();
    if (w === "multiple") {
      p.expect("of");
      const k = num(p);
      if (k.d !== 1n || k.n <= 0n) throw new Error("a multiple is of a positive whole number");
      return { op: "multiple", t, k: k.n };
    }
    if ((LOCK_PROPS as readonly string[]).includes(w ?? "")) return { op: "is", t, prop: w as LockProp };
    throw new Error(`"is" takes prime, square, integer or multiple of k, not "${w ?? "nothing"}"`);
  }
  throw new Error(`expected =, >=, <=, in or is${op === undefined ? " at the end" : `, not "${op}"`}`);
}

function dedupe(ks: readonly Q[]): Q[] {
  const out: Q[] = [];
  for (const k of [...ks].sort(cmp)) if (!out.length || !eq(out[out.length - 1]!, k)) out.push(k);
  return out;
}

/** A predicate from its text, or why not. The result is canonical (sorted, duplicates removed). */
export function parsePredicate<S>(type: ObjectType<S>, text: string): Predicate | Invalid {
  if (typeof text !== "string" || !text.trim()) return bad("a lock needs a predicate, such as \"si.c is prime\"");
  if (text.length > MAX_PREDICATE_TEXT) return bad(`a predicate is at most ${MAX_PREDICATE_TEXT} characters`);
  const toks = tokenize(text);
  if ("invalid" in toks) return toks;
  const p = new Parser(toks);
  const atoms: LockAtom[] = [];
  try {
    for (;;) {
      atoms.push(atom(type, p));
      if (p.peek() === undefined) break;
      const w = p.next();
      if (w !== "and") throw new Error(`atoms are joined by "and", not "${w}"`);
    }
  } catch (e) {
    return bad((e as Error).message);
  }
  const canon = canonicalAtoms(atoms);
  if (canon.length > MAX_ATOMS) return bad(`a predicate has at most ${MAX_ATOMS} parts`);
  return { atoms: canon };
}

// ---------------------------------------------------------------- text

const refText = (r: ElementRef): string => refKey(r, r.site !== undefined);
export const termText = (t: LockTerm): string => (t.kind === "read" ? refText(t.ref) : `${t.fn}(${termText(t.arg)})`);
export function atomText(a: LockAtom): string {
  const t = termText(a.t);
  switch (a.op) {
    case "=": case ">=": case "<=": return `${t} ${a.op} ${toWire(a.k)}`;
    case "in": return `${t} in {${a.ks.map(toWire).join(", ")}}`;
    case "is": return `${t} is ${a.prop}`;
    case "multiple": return `${t} is multiple of ${a.k}`;
  }
}
function canonicalAtoms(atoms: readonly LockAtom[]): LockAtom[] {
  const byText = new Map<string, LockAtom>();
  for (const a of atoms) byText.set(atomText(a), a);
  return [...byText.keys()].sort().map(k => byText.get(k)!);
}
/** The one spelling of a predicate: two predicates are the same lock predicate iff these are equal. */
export const canonicalPredicate = (p: Predicate): string => canonicalAtoms(p.atoms).map(atomText).join(" and ");

const FN_WORDS: Record<LockFn, string> = { digitsum: "the digit sum of", lastdigit: "the last digit of", isqrt: "the whole square root of", abs: "the size of" };
function termWords<S>(type: ObjectType<S>, t: LockTerm): string {
  if (t.kind === "fn") return `${FN_WORDS[t.fn]} ${termWords(type, t.arg)}`;
  let label = elementDecl(type, t.ref).label;
  for (const [k, v] of Object.entries(t.ref.args ?? {})) label = label.replace(new RegExp(`\\b${k}\\b`, "g"), v);
  return `${t.ref.site !== undefined ? `line ${t.ref.site + 1}'s ` : "the "}${label}`;
}
const PROP_WORDS: Record<LockProp, string> = { prime: "prime", square: "a perfect square", integer: "a whole number" };
/** A predicate in words for players ("the y-intercept is prime and the gradient is -2"). */
export function plainWords<S>(type: ObjectType<S>, p: Predicate): string {
  return p.atoms.map(a => {
    const t = termWords(type, a.t);
    switch (a.op) {
      case "=": return `${t} is ${toWire(a.k)}`;
      case ">=": return `${t} is at least ${toWire(a.k)}`;
      case "<=": return `${t} is at most ${toWire(a.k)}`;
      case "in": return `${t} is one of ${a.ks.map(toWire).join(", ")}`;
      case "is": return `${t} is ${PROP_WORDS[a.prop]}`;
      case "multiple": return `${t} is a multiple of ${a.k}`;
    }
  }).join(" and ");
}

// ---------------------------------------------------------------- evaluation

const absB = (n: bigint): bigint => (n < 0n ? -n : n);
export function isqrtB(n: bigint): bigint {
  if (n < 2n) return n < 0n ? 0n : n;
  // Newton's method from a power of two above the root: exact for any size, O(log bits) steps.
  let x = 1n << (BigInt(n.toString(2).length + 1) / 2n);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}
function modPow(b: bigint, e: bigint, m: bigint): bigint {
  let r = 1n;
  b %= m;
  while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; }
  return r;
}
const SMALL_PRIMES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n, 53n, 59n, 61n, 67n, 71n];
/** Deterministic Miller–Rabin with the first 20 prime bases: exact below 3.3·10^24, the same answer everywhere above. */
export function isPrimeB(n: bigint): boolean {
  if (n < 2n) return false;
  for (const p of SMALL_PRIMES) { if (n === p) return true; if (n % p === 0n) return false; }
  let d = n - 1n, s = 0;
  while ((d & 1n) === 0n) { d >>= 1n; s++; }
  outer: for (const a of SMALL_PRIMES) {
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let i = 1; i < s; i++) { x = (x * x) % n; if (x === n - 1n) continue outer; }
    return false;
  }
  return true;
}
const digitSum = (n: bigint): bigint => [...absB(n).toString()].reduce((s, c) => s + BigInt(c), 0n);

/** A term's value on a state, or null (undefined, not a number, or a function that does not apply). */
export function termValue<S>(type: ObjectType<S>, state: S, t: LockTerm): Q | null {
  if (t.kind === "read") {
    let v;
    try { v = elementValue(type, state, t.ref); } catch { return null; }
    return v.kind === "number" ? v.q : null;
  }
  const x = termValue(type, state, t.arg);
  if (x === null) return null;
  if (t.fn === "abs") return x.n < 0n ? { n: -x.n, d: x.d } : x;
  if (x.d !== 1n) return null;
  switch (t.fn) {
    case "digitsum": return q(digitSum(x.n));
    case "lastdigit": return q(absB(x.n) % 10n);
    case "isqrt": return x.n < 0n ? null : q(isqrtB(x.n));
  }
}

export function atomHolds<S>(type: ObjectType<S>, state: S, a: LockAtom): boolean {
  const x = termValue(type, state, a.t);
  if (x === null) return false;
  switch (a.op) {
    case "=": return eq(x, a.k);
    case ">=": return cmp(x, a.k) >= 0;
    case "<=": return cmp(x, a.k) <= 0;
    case "in": return a.ks.some(k => eq(k, x));
    case "multiple": return x.d === 1n && x.n % a.k === 0n;
    case "is":
      if (a.prop === "integer") return x.d === 1n;
      if (x.d !== 1n) return false;
      if (a.prop === "prime") return isPrimeB(x.n);
      if (x.n < 0n) return false;
      { const r = isqrtB(x.n); return r * r === x.n; }
  }
}

/** Whether a state meets a predicate (every atom holds). */
export const holds = <S,>(type: ObjectType<S>, p: Predicate, state: S): boolean => p.atoms.every(a => atomHolds(type, state, a));

// ---------------------------------------------------------------- information content

export interface InformationContent {
  /** I(P) = −log2 π{P}, bits; or the bound φ(s) when the draws saw too few hits. */
  readonly bits: number;
  readonly hits: number;
  readonly draws: number;
  /** True when the predicate was rarer than the draws see and `bits` is the bound φ of the state it was made on. */
  readonly bounded: boolean;
}

/**
 * A predicate's information content under the variant's stationary law: `INFO_DRAWS` direct draws from π (`draw`, null
 * for a draw that is not a canonical state, which does not count), seeded by the variant and the canonical text so every
 * machine gets the same number. With at least `INFO_MIN_HITS` hits, −log2 of the share that meet it; otherwise `phi`, the
 * read length of the state the lock is made on (a predicate the state meets has mass at least 2^−φ(s), so φ bounds it).
 * Never more than `phi`.
 */
export function informationContent<S>(type: ObjectType<S>, variant: Variant, p: Predicate, draw: (r: Rng) => S | null, phi: number,
  draws = INFO_DRAWS): InformationContent {
  const r = rng("lock-info", variant.valuesOf ?? variant.id, canonicalPredicate(p));
  let hits = 0, valid = 0;
  for (let i = 0; i < draws; i++) {
    const s = draw(r);
    if (s === null) continue;
    valid++;
    if (holds(type, p, s)) hits++;
  }
  if (hits < INFO_MIN_HITS || valid === 0) return { bits: phi, hits, draws: valid, bounded: true };
  const est = -Math.log2(hits / valid);
  return est >= phi ? { bits: phi, hits, draws: valid, bounded: true } : { bits: est, hits, draws: valid, bounded: false };
}

// ---------------------------------------------------------------- lock arithmetic

/** The energy burned to create a lock of `info` bits (its opening amount is on top). */
export const lockFee = (info: number): number => CREATE_PER_BIT * info;
/** Upkeep, energy per world second: a lock re-pays its creation fee once per full-charge period. */
export const lockRate = (info: number, fullChargeSeconds: number): number => lockFee(info) / fullChargeSeconds;

export interface LockEnergy {
  readonly energy: number;
  readonly settledAt: number;
  readonly rate: number;
}
/** What a lock holds at world second `world` (upkeep settled lazily; never below 0). */
export const lockEnergyAt = (l: LockEnergy, world: number): number => Math.max(0, l.energy - l.rate * Math.max(0, world - l.settledAt));
/** The world second a lock's energy reaches 0 (Infinity with no upkeep). */
export const lockEndsAt = (l: LockEnergy): number => (l.rate > 0 ? l.settledAt + l.energy / l.rate : Infinity);

export interface LiveLock extends LockEnergy {
  readonly n: number;
  readonly predicate: Predicate;
}
/** The numbers of the locks still holding energy at `world` whose predicate `state` breaks, in order. */
export function breaksLocks<S>(type: ObjectType<S>, locks: readonly LiveLock[], state: S, world: number): number[] {
  return locks.filter(l => lockEnergyAt(l, world) > 0 && !holds(type, l.predicate, state)).map(l => l.n).sort((a, b) => a - b);
}
