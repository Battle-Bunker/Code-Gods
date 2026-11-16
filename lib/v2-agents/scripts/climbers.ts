/**
 * Climbers for measurements (scripts/freeze.ts, scripts/collapse-check.ts): the shipped climbing starter with an escape
 * through the representation shortcuts, and the same move search host side. Analysis only: no game logic changes.
 */
import { applyCall, isInvalid, variantMutators, type Call, type ObjectType, type Variant } from "@workspace/v2-core";
import { riseTogether, TOGETHER } from "../src/collapse.ts";
import { KAPPA, type Economy } from "@workspace/v2-economy";
import { lineType, type LineState } from "@workspace/v2-linear";
import type { Program } from "../src/act.ts";
import { changeCharge, EngineHost, scoreSource, startersFor, type Sandboxes } from "../src/index.ts";
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

/** The five lens mutators of line-q-lenses (lenses-and-mutators.md §5). */
export const LENS_IDS = ["rot.turn", "coef.swap", "basis.lean", "basis.zoom", "fold"] as const;
/**
 * lens: when stuck, the shortcuts above plus lens moves of line-q-lenses (all five, or those in `only`): a turn about a pin,
 * the m ↔ c swap, a lean, a zoom, a level fold about a pin. Each option carries the (m, c) it reaches. `mirrors: false`
 * drops cart.mirror from the shortcuts (to measure what the reflections add).
 */
export function lensClimber(only: readonly string[] = LENS_IDS, mirrors = true): string {
  let base = SHORTCUT;
  if (!mirrors) {
    base = base.replace(/  sc\.push\(\[move\("cart\.mirror", \{ axis: "y" \}\).*\n/, "").replace(/  if \(!Q\.eq\(m, Q\.of\(0\)\)\) sc\.push\(\[move\("cart\.mirror".*\n/, "");
    if (base.includes("cart.mirror")) throw new Error("the shortcut climber's mirror lines moved");
  }
  const out = base.replace("  return climb(offer, sc.map(", `${lensLines(only)}\n  return climb(offer, sc.map(`);
  if (out === base) throw new Error("the shortcut climber's last line moved");
  return out;
}

/** Lines that push the lens moves in `only` onto `sc` as [plan, m, c] (the line each reaches), for a climber's body. */
function lensLines(only: readonly string[]): string {
  const has = (id: string) => only.includes(id);
  return [
    "  const one = Q.of(1), zero = Q.of(0);",
    has("coef.swap") ? '  sc.push([move("coef.swap", { pair: "m-c" }), c, m]);' : "",
    has("rot.turn") || has("fold") ? `  for (const x0 of [0, 1, -1]) {
    const X = Q.from(x0), y0 = Q.add(Q.mul(m, X), c);${has("rot.turn") ? `
    for (const t of ["left", 1, -1, 2, -2, Q.of(1, 2), Q.of(-1, 2), Q.of(3, 4), Q.of(-3, 4)]) {
      let m2 = null;
      if (t === "left") { if (!Q.eq(m, zero)) m2 = Q.neg(Q.div(one, m)); }
      else { const den = Q.sub(one, Q.mul(m, Q.from(t))); if (!Q.eq(den, zero)) m2 = Q.div(Q.add(m, Q.from(t)), den); }
      if (m2 !== null) sc.push([move("rot.turn", { centre: x0, turn: t }), m2, Q.sub(y0, Q.mul(m2, X))]);
    }` : ""}${has("fold") ? `
    sc.push([move("fold", { x0, s: 0 }), Q.neg(m), Q.add(y0, Q.mul(m, X))]);` : ""}
  }` : "",
    has("basis.lean") ? `  if (!Q.eq(m, zero)) {
    const run = Q.div(one, m), xi = Q.neg(Q.div(c, m));
    for (const k of [1, -1, Q.of(1, 2), Q.of(-1, 2)]) { const r2 = Q.sub(run, Q.from(k)); if (!Q.eq(r2, zero)) { const m2 = Q.div(one, r2); sc.push([move("basis.lean", { k }), m2, Q.neg(Q.mul(m2, xi))]); } }
  }` : "",
    has("basis.zoom") ? '  if (!Q.eq(c, zero)) for (const f of [2, 3, -2, Q.of(1, 2), Q.of(1, 3)]) sc.push([move("basis.zoom", { f }), m, Q.mul(c, Q.from(f))]);' : "",
  ].filter(Boolean).join("\n");
}

/** The stretch factors offered beside the steps (the coordinator's ask, 15 Nov: stretch by 2, 3, 5, 7), and their inverses. */
export const STRETCH_FACTORS = "[2, 3, 5, 7, Q.of(1, 2), Q.of(1, 3), Q.of(1, 5), Q.of(1, 7)]";
/**
 * Moves offered beside the starter's own steps, every act (not only when stuck), each scored and then priced by the
 * starter's own climb: a stretch by the STRETCH_FACTORS when `stretch`, and the lens moves in `lens` (line-q-lenses).
 * The starter's promise (PROTECT) filters them too.
 */
export function optionsClimber(stretch: boolean, lens: readonly string[] = []): string {
  return [
    "  const sc = [];",
    stretch ? `  for (const f of ${STRETCH_FACTORS}) sc.push([move("mach.stretch", { f }), Q.mul(m, Q.from(f)), Q.mul(c, Q.from(f))]);` : "",
    lens.length ? lensLines(lens) : "",
    "  for (const [pl, m2, c2] of sc) options.push([pl, score(m2, c2, p, tie)]);",
    "  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));",
    RETURN,
  ].filter(Boolean).join("\n");
}

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

/**
 * A cooperating pair (the coordinator, 16 Nov; the owner allows "specific states to be calculated in advance and then
 * effortfully pursued by multiple cooperating agents over many steps"): two seats that have shared their rules carry both
 * score functions. Each act on a line, both compute the same plan: the best state within two steps (shifts and tilts up
 * to 2) that is no worse for either rule and better for one, ordered by the leader's score, then the follower's, then
 * the shorter path. Each takes the plan's next step if it can pay for it, though that step alone may lower its own points
 * (the partner does not undo it: it follows the same plan). With nothing better for the pair within reach it skips.
 * TypeScript only; an experiment, not a shipped starter.
 */
export function pairClimber(own: { family: string }, partner: { family: string; params: unknown; tieBreaker: string | null }, leader: boolean): Program {
  const mine = scoreSourceOf(own.family), theirs = scoreSourceOf(partner.family).replace(/\bfunction score\(/, "function scoreB(");
  const body = `
const PB = ${JSON.stringify(partner.params)}, TB = ${JSON.stringify(partner.tieBreaker)}, LEADER = ${leader};
function agent(offer) {
  if (saving(offer)) return null;
  const v = look(offer, "si"), rule = goal(offer), m = v.m, c = v.c, p = rule.params, tie = rule.tieBreaker;
  if (!Q.isQ(m)) return null;
  const A = (m2, c2) => score(m2, c2, p, tie), B = (m2, c2) => scoreB(m2, c2, PB, TB);
  const a0 = A(m, c), b0 = B(m, c);
  const steps = [];
  for (const k of [-2, -1, 1, 2]) { steps.push([move("si.shift", { k }), 0, k]); steps.push([move("si.tilt", { k }), k, 0]); }
  const paths = [];
  for (const s1 of steps) {
    paths.push([[s1[0]], Q.add(m, s1[1]), Q.add(c, s1[2])]);
    for (const s2 of steps) paths.push([[s1[0], s2[0]], Q.add(m, s1[1] + s2[1]), Q.add(c, s1[2] + s2[2])]);
  }
  let best = null;
  for (const [plan, m2, c2] of paths) {
    if (stepsLeft() < 0.5 * stepBudget()) break;
    const a = A(m2, c2), b = B(m2, c2);
    if (better(a0, a) || better(b0, b) || !(better(a, a0) || better(b, b0))) continue;   // worse for one of us, or no gain
    const key = LEADER ? [a, b] : [b, a];   // the leader's score first, in both agents: the same plan
    if (!best || better(key[0], best.key[0]) || (!better(best.key[0], key[0]) && (better(key[1], best.key[1]) || (!better(best.key[1], key[1]) && plan.length < best.plan.length)))) best = { key, plan };
  }
  if (!best) return null;
  const first = [best.plan[0]], pr = price(offer, first);
  return pr !== null && pr <= allowance(offer) ? first : null;
}
`;
  return { language: "typescript", source: `${mine}\n${theirs}\n${body}` };
}

const scoreSourceOf = (family: string): string => scoreSource(family, null, "typescript");
