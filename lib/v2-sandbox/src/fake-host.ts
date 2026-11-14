/**
 * An in-memory agent host over a toy object, so the sandbox can be tested alone. The real host is the engine's
 * (lib/v2-agents, PR 7); this one implements the same messages over one integer line y = mx + c with two
 * representations and four mutators, priced by the spec's codes:
 *
 *   si   y = mx + c       coordinates m, c; derived sign (of m); dynamic y(q)
 *   seq  growth pattern   coordinates first = y(1), step = m; derived zeroth = c; dynamic term(n)
 *
 *   si.shift(k)  c += k            seq.step(k)    m += k, c −= k
 *   si.tilt(k)   m += k            cart.slide(u, v)  c += v − m·u   (the toy has no cart view; it reads as si)
 *
 * Reads (spec §3.1): a view costs its coordinates' rat codes; repeats are free; no representation is charged past
 * its full read and the act's static reads never pass one full read of si. Prices (§5.2): log2 N + argument bits +
 * the growth of φ = int(m) + int(c). Charge (§6.1): R/κ + W + βW².
 */
import type { Call, ElementRef, ElementValueWire, HostReply, HostRequest, QWire } from "./agent-api.ts";
import type { AgentHost, HostContext } from "./channel.ts";

// --- Exact rationals (bigint) and the codes of spec §2.3, just what the toy needs.
interface Q { n: bigint; d: bigint }
const abs = (x: bigint) => (x < 0n ? -x : x);
const gcd = (a: bigint, b: bigint): bigint => { a = abs(a); b = abs(b); while (b) [a, b] = [b, a % b]; return a; };
function q(n: bigint, d = 1n): Q {
  if (d === 0n) throw new RangeError("division by zero");
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}
const add = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Q, b: Q) => q(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q) => q(a.n * b.d, a.d * b.n);
const cmp = (a: Q, b: Q) => { const x = a.n * b.d - b.n * a.d; return x < 0n ? -1 : x > 0n ? 1 : 0; };
const qabs = (a: Q) => q(abs(a.n), a.d);
const wire = (a: Q): QWire => (a.d === 1n ? String(a.n) : `${a.n}/${a.d}`);
function parseQ(x: unknown): Q | null {
  if (typeof x === "number" && Number.isSafeInteger(x)) return q(BigInt(x));
  if (typeof x !== "string") return null;
  const m = /^(-?\d{1,40})(?:\/(\d{1,40}))?$/.exec(x);
  if (!m || m[2] === "0" || /^0+$/.test(m[2] ?? "1")) return null;
  return q(BigInt(m[1]), BigInt(m[2] ?? "1"));
}

const bitLength = (n: bigint) => n.toString(2).length;
export const codes = {
  /** Elias gamma, n ≥ 1: 2⌊log2 n⌋ + 1. */
  gamma: (n: number | bigint) => 2 * (bitLength(BigInt(n)) - 1) + 1,
  /** Integers by zigzag then gamma. */
  int: (n: bigint) => codes.gamma((n >= 0n ? 2n * n : -2n * n - 1n) + 1n),
  /** Nonzero integers: a sign bit and gamma of the magnitude. */
  nonzero: (n: bigint) => 1 + codes.gamma(abs(n)),
  rat: (x: Q) => codes.int(x.n) + codes.gamma(x.d),
};

// --- The toy line.
export interface Line { m: bigint; c: bigint }
type Value = ElementValueWire;
const num = (x: Q): Value => ({ kind: "number", q: wire(x) });
const valueBits = (v: Value): number =>
  v.kind === "number" ? codes.rat(parseQ(v.q)!)
    : v.kind === "point" ? codes.rat(parseQ(v.x)!) + codes.rat(parseQ(v.y)!)
      : v.kind === "symbol" ? 2 : v.kind === "undefined" ? 1 : 0;

interface Rep {
  coordinates: Record<string, (s: Line) => Q>;
  derived: Record<string, (s: Line) => Value>;
  dynamic: Record<string, { params: string[]; value: (s: Line, a: Record<string, Q>) => Value }>;
}
const lineAt = (s: Line, x: Q) => add(mul(q(s.m), x), q(s.c));
const REPS: Record<string, Rep> = {
  si: {
    coordinates: { m: s => q(s.m), c: s => q(s.c) },
    derived: { sign: s => ({ kind: "symbol", text: s.m > 0n ? "+" : s.m < 0n ? "-" : "0" }) },
    dynamic: { y: { params: ["q"], value: (s, a) => num(lineAt(s, a.q)) } },
  },
  seq: {
    coordinates: { first: s => q(s.m + s.c), step: s => q(s.m) },
    derived: { zeroth: s => num(q(s.c)) },
    dynamic: { term: { params: ["n"], value: (s, a) => num(lineAt(s, a.n)) } },
  },
};

interface ToyMutator { rep: string; args: string[]; apply(s: Line, a: Record<string, bigint>): Line; bits(a: Record<string, bigint>): number; check?(a: Record<string, bigint>): string | null }
const nz = (name: string) => (a: Record<string, bigint>) => (a[name] === 0n ? `${name} must be a nonzero integer` : null);
const MUTATORS: Record<string, ToyMutator> = {
  "si.shift": { rep: "si", args: ["k"], check: nz("k"), bits: a => codes.nonzero(a.k), apply: (s, a) => ({ m: s.m, c: s.c + a.k }) },
  "si.tilt": { rep: "si", args: ["k"], check: nz("k"), bits: a => codes.nonzero(a.k), apply: (s, a) => ({ m: s.m + a.k, c: s.c }) },
  "seq.step": { rep: "seq", args: ["k"], check: nz("k"), bits: a => codes.nonzero(a.k), apply: (s, a) => ({ m: s.m + a.k, c: s.c - a.k }) },
  "cart.slide": {
    rep: "si", args: ["u", "v"], bits: a => codes.int(a.u) + codes.int(a.v),
    check: a => (a.u === 0n && a.v === 0n ? "(u, v) must not be (0, 0)" : null),
    apply: (s, a) => ({ m: s.m, c: s.c + a.v - s.m * a.u }),
  },
};
const WHICH_BITS = Math.log2(Object.keys(MUTATORS).length);
const phi = (s: Line) => codes.int(s.m) + codes.int(s.c);

// --- The toy rules: a distance on the Z ladder d ≤ 13, 8, 5, 3, 2, 1, 0 (spec §12.5).
const LADDER = [13n, 8n, 5n, 3n, 2n, 1n, 0n].map(t => q(t));
function nearestPrimeDistance(m: bigint): bigint {
  const prime = (p: bigint) => { if (p < 2n) return false; for (let d = 2n; d * d <= p; d++) if (p % d === 0n) return false; return true; };
  for (let d = 0n; ; d++) if (prime(m - d) || prime(m + d)) return d;
}
const FAMILIES: Record<string, { card: string; gap(s: Line, params: Record<string, unknown>): Q | null }> = {
  "m-meets-c": { card: "Make the gradient and the y-intercept as close as possible to each other.", gap: s => q(abs(s.m - s.c)) },
  "prime-gradient": { card: "Make the gradient as close as possible to a prime number.", gap: s => q(nearestPrimeDistance(s.m)) },
  "triangle-area": {
    card: "The line and the two axes make a triangle; make its area as close as possible to A.",
    gap: (s, p) => (s.m === 0n || s.c === 0n ? null : qabs(sub(div(q(s.c * s.c), q(2n * abs(s.m))), q(BigInt(p.A as number))))),
  },
};

export interface FakeHostOptions {
  line: { m: number | string | bigint; c: number | string | bigint };
  rule: { family: string; params: Record<string, unknown> };
  energy?: number;
}

export interface Settlement {
  outcome: "committed" | "skipped" | "failed";
  reason?: string;
  prices: number[];
  total: number;
  readBits: number;
  charge: number;
  state: { m: string; c: string };
}

export const KAPPA = 32;
export const BETA = 0.05;
const ok = (result: unknown, bits: number): HostReply => ({ ok: true, result, bits } as HostReply);
const err = (error: string): HostReply => ({ ok: false, error });

export class FakeHost implements AgentHost {
  state: Line;
  readonly rule: FakeHostOptions["rule"];
  readonly energy: number;
  /** Requests that reached this host. */
  calls = 0;
  /** Read bits charged this act. */
  readBits = 0;
  private repCharged = new Map<string, number>();
  private staticCharged = 0;
  private asked = new Set<string>();
  private quoted = false;

  constructor({ line, rule, energy = 100 }: FakeHostOptions) {
    this.state = { m: BigInt(line.m), c: BigInt(line.c) };
    if (!FAMILIES[rule.family]) throw new Error(`the fake host has no rule family ${rule.family}`);
    this.rule = rule;
    this.energy = energy;
  }

  handle(request: HostRequest, context: HostContext): HostReply {
    this.calls++;
    const reply = this.answer(request, context);
    if (reply.ok) this.readBits += reply.bits;
    return reply;
  }

  private answer(request: HostRequest, context: HostContext): HostReply {
    switch (request.op) {
      case "view": return this.view(request.rep, request.site);
      case "element": return this.element(request.ref);
      case "myRule": return ok({ family: this.rule.family, params: this.rule.params, tieBreaker: null, card: FAMILIES[this.rule.family].card, layers: [{ id: "gap", title: "the gap", sense: "min" }] }, 0);
      case "myScore": return this.score();
      case "quote": return this.quote(request.calls);
      case "budget": return ok({ energy: this.energy, readPrice: 1 / KAPPA, beta: BETA, hostCallsLeft: context.hostCallsLeft }, 0);
    }
  }

  /** The full read of a representation: its coordinates' code lengths. */
  private full(rep: string) { return Object.values(REPS[rep].coordinates).reduce((n, f) => n + codes.rat(f(this.state)), 0); }
  /** Charge static reads of `rep`, never past its full read nor past one full read of si for the act. */
  private chargeStatic(rep: string, bits: number) {
    const room = Math.min(this.full(rep) - (this.repCharged.get(rep) ?? 0), this.full("si") - this.staticCharged);
    const charged = Math.max(0, Math.min(bits, room));
    this.repCharged.set(rep, (this.repCharged.get(rep) ?? 0) + charged);
    this.staticCharged += charged;
    return charged;
  }

  private view(rep: string, site = 0): HostReply {
    const r = REPS[rep];
    if (!r) return err(`unknown representation ${JSON.stringify(rep)}`);
    if (site !== 0) return err(`the toy object has one line: site ${site} does not exist`);
    const elements: Record<string, Value> = {};
    for (const [name, f] of Object.entries(r.coordinates)) elements[name] = num(f(this.state));
    for (const [name, f] of Object.entries(r.derived)) elements[name] = f(this.state);
    const bits = this.full(rep);
    return ok({ rep, site, elements, bits }, this.chargeStatic(rep, bits));
  }

  private element(ref: ElementRef): HostReply {
    const r = REPS[ref?.rep];
    if (!r) return err(`unknown representation ${JSON.stringify(ref?.rep)}`);
    if ((ref.site ?? 0) !== 0) return err(`the toy object has one line: site ${ref.site} does not exist`);
    const key = JSON.stringify([ref.rep, ref.name, ref.args ?? {}]);
    const repeat = this.asked.has(key);
    let value: Value, bits: number;
    if (r.coordinates[ref.name]) {
      value = num(r.coordinates[ref.name](this.state));
      bits = valueBits(value);
      this.asked.add(key);
      return ok({ ref, value, bits }, repeat ? 0 : this.chargeStatic(ref.rep, bits));
    }
    if (r.derived[ref.name]) value = r.derived[ref.name](this.state);
    else if (r.dynamic[ref.name]) {
      const d = r.dynamic[ref.name], args: Record<string, Q> = {};
      for (const p of d.params) {
        const v = parseQ(ref.args?.[p]);
        if (!v) return err(`${ref.rep}.${ref.name} needs ${p} as a rational ("p/q")`);
        args[p] = v;
      }
      value = d.value(this.state, args);
    } else return err(`${ref.rep} has no element ${JSON.stringify(ref.name)}`);
    bits = valueBits(value);
    this.asked.add(key);
    return ok({ ref, value, bits }, repeat ? 0 : bits);
  }

  private score(): HostReply {
    const bits = this.chargeStatic("si", this.full("si"));
    const d = FAMILIES[this.rule.family].gap(this.state, this.rule.params);
    const level = d === null ? 0 : LADDER.filter(t => cmp(d, t) <= 0).length;
    return ok({ score: d === null ? null : [wire(q(-d.n, d.d))], level, top: LADDER.length, layers: [{ id: "gap", level, top: LADDER.length }], terms: [{ id: "gap", value: d === null ? null : wire(d) }] }, bits);
  }

  /** Prices of `calls` applied in order from `state`, or why one is invalid. */
  price(calls: unknown, state = this.state): { valid: true; prices: number[]; state: Line } | { valid: false; reason: string } {
    if (!Array.isArray(calls)) return { valid: false, reason: "calls must be a list" };
    const prices: number[] = [];
    for (const call of calls as Call[]) {
      const m = MUTATORS[call?.mutator];
      if (!m) return { valid: false, reason: `unknown mutator ${JSON.stringify(call?.mutator)}` };
      if ((call.site ?? 0) !== 0) return { valid: false, reason: `${call.mutator}: the toy object has one line` };
      const args: Record<string, bigint> = {};
      for (const name of m.args) {
        const v = parseQ(call.args?.[name]);
        if (!v || v.d !== 1n) return { valid: false, reason: `${call.mutator}: ${name} must be ${m.check && name === "k" ? "a nonzero integer" : "an integer"}` };
        args[name] = v.n;
      }
      const why = m.check?.(args);
      if (why) return { valid: false, reason: `${call.mutator}: ${why}` };
      const next = m.apply(state, args);
      if (next.m === state.m && next.c === state.c) return { valid: false, reason: `${call.mutator}: the call changes nothing` };
      prices.push(WHICH_BITS + m.bits(args) + Math.max(0, phi(next) - phi(state)));
      state = next;
    }
    return { valid: true, prices, state };
  }

  private quote(calls: Call[]): HostReply {
    let bits = 0;
    if (!this.quoted && Array.isArray(calls) && calls.length && MUTATORS[calls[0]?.mutator]) {
      this.quoted = true;
      const rep = MUTATORS[calls[0].mutator].rep;
      bits = this.chargeStatic(rep, this.full(rep));
    }
    const priced = this.price(calls);
    if (!priced.valid) return ok({ valid: false, reason: priced.reason, bits: [], total: 0, charge: 0 }, bits);
    const total = priced.prices.reduce((a, b) => a + b, 0);
    return ok({ valid: true, bits: priced.prices, total, charge: total + BETA * total * total }, bits);
  }

  /** Apply what an act returned (the sandbox's untrusted calls text), as the engine's act step 3–4 does. */
  settle(callsText: string): Settlement {
    const state = { m: String(this.state.m), c: String(this.state.c) };
    const reads = this.readBits / KAPPA;
    const nothing = (outcome: "skipped" | "failed", reason?: string): Settlement =>
      ({ outcome, ...(reason ? { reason } : {}), prices: [], total: 0, readBits: this.readBits, charge: reads, state });
    let calls: unknown;
    try { calls = JSON.parse(callsText); } catch { return nothing("failed", "the calls are not JSON"); }
    if (calls === null || (Array.isArray(calls) && calls.length === 0)) return nothing("skipped");
    const priced = this.price(calls);
    if (!priced.valid) return nothing("failed", priced.reason);
    this.state = priced.state;
    const total = priced.prices.reduce((a, b) => a + b, 0);
    return {
      outcome: "committed", prices: priced.prices, total, readBits: this.readBits,
      charge: reads + total + BETA * total * total, state: { m: String(this.state.m), c: String(this.state.c) },
    };
  }
}
