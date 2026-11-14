/**
 * Climbers for measurements (scripts/freeze.ts, scripts/collapse-check.ts): the shipped climbing starter with an escape
 * through the representation shortcuts, and the same move search host side. Analysis only: no game logic changes.
 */
import { applyCall, isInvalid, variantMutators, type Call, type ObjectType, type Variant } from "@workspace/v2-core";
import { riseTogether, TOGETHER } from "../src/collapse.ts";
import { KAPPA, type Economy } from "@workspace/v2-economy";
import { lineType, type LineState } from "@workspace/v2-linear";
import type { Program } from "../src/act.ts";
import { changeCharge, EngineHost, startersFor, type Sandboxes } from "../src/index.ts";
import { runTable, type TableReport } from "../src/table.ts";
import { total, type Rule } from "./landscape-lib.ts";

/** The starter's last line, which the escapes replace. */
export const RETURN = "  return climb(offer, options, score(m, c, p, tie), QUOTES);";
// shortcut: when stuck, the representation mutators as ways across a valley (decision 25): stretch, pivot, mirror.
export const SHORTCUT = `  const now = score(m, c, p, tie), step = climb(offer, options, now, QUOTES);
  if (step) return step;
  const sc = [];
  for (const f of [2, 3, -1, Q.of(1, 2), Q.of(1, 3)]) sc.push([move("mach.stretch", { f }), Q.mul(m, Q.from(f)), Q.mul(c, Q.from(f))]);
  for (const x0 of [-1, 1, 2]) for (const k of [-2, -1, 1, 2]) sc.push([move("cart.pivot", { x0, k }), Q.add(m, Q.from(k)), Q.sub(c, Q.mul(Q.from(k), Q.from(x0)))]);
  sc.push([move("cart.mirror", { axis: "y" }), Q.neg(m), c], [move("cart.mirror", { axis: "x" }), Q.neg(m), Q.neg(c)], [move("cart.mirror", { axis: "origin" }), m, Q.neg(c)]);
  if (!Q.eq(m, Q.of(0))) sc.push([move("cart.mirror", { axis: "diagonal" }), Q.div(Q.of(1), m), Q.neg(Q.div(c, m))]);
  return climb(offer, sc.map(([pl, m2, c2]) => [pl, score(m2, c2, p, tie)]), now, QUOTES);`;

/** The plain ("simple") line starter with its last line swapped for `with_` (or unchanged). */
export function lineStarter(family: string, with_?: string) {
  const a = startersFor(family, "typescript").find(x => x.kind === "simple")!;
  if (!with_) return { language: a.language, source: a.source };
  const source = a.source.replace(RETURN, with_);
  if (source === a.source) throw new Error("the starter's last line moved");
  return { language: a.language, source };
}

/** The starters' own steps: shift or tilt by 1..far. */
export const steps = (far: number): Call[] => Array.from({ length: far }, (_, k) => k + 1).flatMap(k => [k, -k]).flatMap(k => [
  { mutator: "si.shift", site: 0, args: { k: String(k) } }, { mutator: "si.tilt", site: 0, args: { k: String(k) } }]);

/** The rounding helper's steps, host side: to the whole number below or above, by one part, a stretch by the denominator. */
export function rounding(variant: Variant, rule: Rule, s: LineState): Call[] {
  const v = new EngineHost({ type: lineType, variant, state: s, rule, energy: 0 }).handle({ op: "view", rep: "si" } as never, { hostCallsLeft: 5 }) as { ok: boolean; result?: { elements: { m: { q?: string }; c: { q?: string } } } };
  if (!v.ok || !v.result!.elements.m.q || !v.result!.elements.c.q) return [];
  const out: Call[] = [];
  for (const [name, mut] of [["c", "si.shift"], ["m", "si.tilt"]] as const) {
    const [n, d = "1"] = v.result!.elements[name].q!.split("/");
    if (d === "1") continue;
    const N = BigInt(n!), D = BigInt(d), fl = N >= 0n ? N / D : -((-N + D - 1n) / D);
    out.push({ mutator: mut, site: 0, args: { k: `${fl * D - N}/${D}` } }, { mutator: mut, site: 0, args: { k: `${(fl + 1n) * D - N}/${D}` } },
      { mutator: mut, site: 0, args: { k: `1/${D}` } }, { mutator: mut, site: 0, args: { k: `-1/${D}` } }, { mutator: "mach.stretch", site: 0, args: { f: String(D) } });
  }
  return out;
}

/** The representation shortcuts the shortcut climber tries. */
export const SHORTCUTS: Call[] = [
  ...["2", "3", "-1", "1/2", "1/3"].map(f => ({ mutator: "mach.stretch", site: 0, args: { f } })),
  ...["-1", "1", "2"].flatMap(x0 => ["-2", "-1", "1", "2"].map(k => ({ mutator: "cart.pivot", site: 0, args: { x0, k } }))),
  ...["x", "y", "origin", "diagonal"].map(axis => ({ mutator: "cart.mirror", site: 0, args: { axis } })),
];

/** The shortcut climber's whole move search on a line: its steps, rounding, and the shortcuts. */
export const lineShortcutMoves = (variant: Variant, rule: Rule, s: LineState): Call[] => [...steps(3), ...rounding(variant, rule, s), ...SHORTCUTS];

/** Every call of every mutator of the variant priced at most maxBits before its surcharge (an object with one site). */
export function callsUpTo<S>(type: ObjectType<S>, variant: Variant, maxBits: number): Call[] {
  return variantMutators(type, variant).flatMap(m => {
    const code = m.args(variant);
    return [...(code.enumerate?.(maxBits) ?? [])].map(a => ({ mutator: m.id, site: 0, args: code.encode(a) }));
  });
}

/**
 * Test 1's directions: from each start, repeat each call (TOGETHER.repeats times; the path ends at an invalid step) and
 * read the seated rules' bits at the start, the midpoint and the end. Returns, per direction that ever raises rules
 * together, how many starts it does so from, and from how many without an adversary.
 */
export function directions<S>(o: { type: ObjectType<S>; variant: Variant; rules: readonly Rule[]; bits: (r: Rule) => (s: S) => number; starts: readonly S[]; calls: (s: S) => readonly Call[] }) {
  const bs = o.rules.map(r => o.bits(r));
  const read = (s: S) => bs.map(b => b(s));
  const found = new Map<string, { call: Call; together: number; unopposed: number; example?: { from: string; to: string; gains: number[] } }>();
  for (const s0 of o.starts) {
    const b0 = read(s0);
    for (const call of o.calls(s0)) {
      let s = s0, mid: number[] | null = null, ok = true;
      for (let r = 1; r <= TOGETHER.repeats; r++) {
        const a = applyCall(o.type, o.variant, s, call);
        if (isInvalid(a)) { ok = false; break; }
        s = a.result;
        if (r === TOGETHER.repeats / 2) mid = read(s);
      }
      if (!ok || !mid) continue;
      const end = read(s), v = riseTogether(b0, mid, end);
      if (!v.together) continue;
      const key = `${call.mutator} ${JSON.stringify(call.args)}`;
      const f = found.get(key) ?? { call, together: 0, unopposed: 0 };
      f.together++;
      if (!v.adversary) { f.unopposed++; f.example ??= { from: o.type.encode(s0), to: o.type.encode(s), gains: end.map((x, i) => x - b0[i]!) }; }
      found.set(key, f);
    }
  }
  return [...found.entries()].map(([key, f]) => ({ key, ...f })).sort((a, b) => b.unopposed - a.unopposed || b.together - a.together);
}

/** One seat of a measured table: its rule and its program. */
export interface PlaySeat { readonly rule: Rule; readonly program: Program }
export interface Played<S> {
  readonly objects: { readonly start: number; readonly end: number };
  /** Of the seats' acts in the last 60 s, the share that changed nothing (mean over seats). */
  readonly idle: number;
  /** Distinct objects changed in the last 60 s, as a share of the objects. */
  readonly movingLastMinute: number;
  /** The table's gains from play (Σ over committed moves of the change in Σ_i points_i), by the midpoint and the end. */
  readonly gainedByMid: number;
  readonly gainedByEnd: number;
  readonly seats: readonly { readonly rule: string; readonly gained: number; readonly end: number }[];
  readonly final: readonly S[];
  readonly byMutator: TableReport["byMutator"];
}

/** A table of scripted seats under unique objects (owner decision 24), measured for dynamics. */
export async function playTable<S>(boxes: Sandboxes, o: {
  type: ObjectType<S>; variant: Variant; seats: readonly PlaySeat[]; bits: (r: Rule) => (s: S) => number; beta: number;
  objects: number; birthsPerSecond: number; seconds: number; seed: string; economy?: Economy; summonCap?: number;
}): Promise<Played<S>> {
  const bs = o.seats.map(s => o.bits(s.rule));
  const F = (s: S) => total(bs.map(b => b(s)));
  let gained = 0, byMid: number | null = null;
  const report = await runTable(boxes, {
    type: o.type, variant: o.variant, lines: o.objects, birthsPerSecond: o.birthsPerSecond, seed: o.seed, seconds: o.seconds, unique: true,
    seats: o.seats.map((s, k) => ({ name: `P${k}`, kind: "starter", rule: s.rule, program: s.program })),
    actEconomy: { kappa: KAPPA, beta: o.beta }, ...(o.economy ? { economy: o.economy } : {}), ...(o.summonCap !== undefined ? { summonCap: o.summonCap } : {}),
    onAct: e => {
      if (byMid === null && e.at >= o.seconds / 2) byMid = gained;
      if (e.committed) gained += F(e.state) - F(e.before);
    },
  });
  return {
    objects: { start: o.objects, end: report.objects },
    idle: report.seats.reduce((t, s) => t + s.lateIdleShare, 0) / report.seats.length,
    movingLastMinute: report.late.objectsMoved / report.objects,
    gainedByMid: byMid ?? gained, gainedByEnd: gained,
    seats: report.seats.map(s => ({ rule: s.rule, gained: s.gained, end: s.end })),
    final: report.final as S[], byMutator: report.byMutator,
  };
}

/**
 * The share of objects on which a climber with `moves` finds no improving move: no call (affordable from a full charge,
 * onto a state no other object holds) that raises any seat's points n_i · Σ_{j≠i} n_j.
 */
export function frozenShare<S>(o: {
  type: ObjectType<S>; variant: Variant; rules: readonly Rule[]; bits: (r: Rule) => (s: S) => number; beta: number; final: readonly S[];
  moves: (s: S) => readonly Call[]; fullCharge: number;
}): number {
  const bs = o.rules.map(r => o.bits(r));
  const points = (s: S) => { const n = bs.map(b => b(s)), t = n.reduce((a, b) => a + b, 0); return n.map(x => x * (t - x)); };
  const held = new Set(o.final.map(s => o.type.encode(s)));
  let stuck = 0;
  for (const s of o.final) {
    const now = points(s);
    const host = new EngineHost({ type: o.type, variant: o.variant, state: s, rule: o.rules[0]!, energy: 0 });
    let any = false;
    for (const call of o.moves(s)) {
      const priced = host.price([call]);
      if (!priced.valid || changeCharge(priced.total, { kappa: KAPPA, beta: o.beta }) > o.fullCharge) continue;
      if (held.has(o.type.encode(priced.result))) continue;
      const after = points(priced.result);
      if (after.some((x, i) => x > now[i]! + 1e-9)) { any = true; break; }
    }
    if (!any) stuck++;
  }
  return o.final.length ? stuck / o.final.length : 0;
}
