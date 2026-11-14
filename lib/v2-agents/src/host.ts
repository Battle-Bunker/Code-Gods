/**
 * The engine's agent host (spec §6.2–§6.3): it answers an act's priced queries, free quotes and budget from the
 * real object type, so rule, representation and price logic live once, here, in TypeScript (owner decision (d)).
 * Everything is priced by v2-core and the object type: reads by the codes of §2.3, calls by `applyCalls` (so a new
 * price list in v2-linear reaches agents with no change here).
 *
 * Read accounting (§3.1):
 *  - `view(rep, site)` charges the representation's full read: its coordinates' code lengths (a representation with
 *    no coordinates, such as `tri`, is charged its static elements instead, or it would be a free full read).
 *    Derived elements come with it.
 *  - `element(ref)` charges the value's code length. A static element counts towards its representation's full
 *    read; a dynamic one (it has arguments) is charged on its own.
 *  - Repeats are free; a representation is never charged past its full read; static reads in one act are never
 *    charged past one full read of the state (φ, the object type's `readLength`).
 *  - `myScore()` charges the rule's `depends` representations, every line, as if viewed.
 *  - The first `quote` of an act charges the representation the first quoted mutator belongs to, as if viewed.
 */
import {
  applyCalls, elementDecl, refKey, elementValue, evaluateObject, isInvalid, layerLadders, levelOf, objectLadder, Qn, ratBits,
  representation, ruleLayers, type Call, type TieBreaker, type ElementRef, type ElementValue, type ObjectType, type Price, type RuleFamily, type Variant,
} from "@workspace/v2-core";
import { BETA, KAPPA } from "@workspace/v2-economy";
import type { AgentHost, ElementValueWire, HostContext, HostReply, HostRequest } from "@workspace/v2-sandbox";

/** A rule as dealt: a family of the object type, its parameters and its tie-breaker. */
export interface RuleRef {
  readonly family: string;
  readonly params: Readonly<Record<string, unknown>>;
  /** The dealt tie-breaker's id, null for the main layer alone; absent: the family's first (v2-core `ruleLayers`). */
  readonly tieBreaker?: TieBreaker;
}

/**
 * The act's price constants (spec §6.1: reads are κ times cheaper than changes; radical acts cost β·W² more): v2-economy's,
 * unless a caller (an experiment) passes its own.
 */
export interface Economy {
  readonly kappa: number;
  readonly beta: number;
}
export const SPEC_ECONOMY: Economy = { kappa: KAPPA, beta: BETA };

export interface HostInput<S> {
  readonly type: ObjectType<S>;
  readonly variant: Variant;
  readonly state: S;
  readonly rule: RuleRef;
  /** The agent's energy, as `budget()` reports it. */
  readonly energy: number;
  readonly economy?: Economy;
  /** What the offered line is worth to the player now (spec §8, what they see): n_i, Σ n_j and π_i, in bits. */
  readonly value?: { readonly mine: number; readonly others: number; readonly points: number };
  /** The latest moves on the offered line the player may see, newest last (theirs, and others' that changed their points). */
  readonly history?: readonly { readonly mine: boolean; readonly pointsBefore: number; readonly pointsAfter: number }[];
  /**
   * The player's rule's ladder with each rung's rarity (their own calibration: the artefact's rungs, with `layer` and
   * `main` for a joint ladder), rung 0 first. Prices `rarity(score)`; `worth()` is only answered with it.
   */
  readonly rungs?: readonly { readonly score: readonly (string | null)[] | null; readonly bits: number; readonly layer?: number; readonly main?: number }[];
}

/** Read bits charged for `worth()`: three summary numbers the player could read off the line's row. */
export const WORTH_BITS = 6;
/** Read bits charged per move `recent()` returns. */
export const RECENT_BITS_PER_MOVE = 2;
/** Notes an act may leave its owner, and their length. */
export const NOTES_PER_ACT = 3, NOTE_CHARS = 200;

/** The energy an act's changes cost (§6.1): W + β·W². */
export const changeCharge = (w: number, e: Economy = SPEC_ECONOMY): number => w + e.beta * w * w;

const wire = (v: ElementValue): ElementValueWire => {
  switch (v.kind) {
    case "number": return { kind: "number", q: Qn.toWire(v.q) };
    case "point": return { kind: "point", x: Qn.toWire(v.x), y: Qn.toWire(v.y) };
    case "segment": return { kind: "segment", from: { x: Qn.toWire(v.from.x), y: Qn.toWire(v.from.y) }, to: { x: Qn.toWire(v.to.x), y: Qn.toWire(v.to.y) } };
    case "symbol": return { kind: "symbol", text: v.text };
    case "undefined": return { kind: "undefined", reason: v.reason };
  }
};

/** An element value's code length (§3.1): rat per number, both coordinates of a point, 1 bit for undefined. */
export function valueBits(v: ElementValue): number {
  switch (v.kind) {
    case "number": return ratBits(v.q);
    case "point": return ratBits(v.x) + ratBits(v.y);
    case "segment": return ratBits(v.from.x) + ratBits(v.from.y) + ratBits(v.to.x) + ratBits(v.to.y);
    case "symbol": return 2; // a guess: symbols are short words from a few choices; none is a coordinate today
    case "undefined": return 1;
  }
}

const ok = (result: unknown, bits: number): HostReply => ({ ok: true, result, bits } as HostReply);
const err = (error: string): HostReply => ({ ok: false, error });

export class EngineHost<S> implements AgentHost {
  readonly type: ObjectType<S>;
  readonly variant: Variant;
  readonly state: S;
  readonly family: RuleFamily<S, unknown>;
  readonly params: unknown;
  /** The dealt tie-breaker (null: the main layer alone). */
  readonly tieBreaker: TieBreaker;
  readonly energy: number;
  readonly economy: Economy;
  /** Notes the agent left its owner this act. */
  readonly notes: string[] = [];
  private readonly input: HostInput<S>;
  /** Read bits charged so far this act, in total and by representation id. */
  readBits = 0;
  readonly readsByRep = new Map<string, number>();
  private readonly sites: number;
  private readonly phi: number;
  private staticCharged = 0;
  private readonly repCharged = new Map<string, number>();
  private readonly asked = new Set<string>();
  private quoted = false;

  constructor(input: HostInput<S>) {
    this.type = input.type; this.variant = input.variant; this.state = input.state;
    const family = input.type.families.find(f => f.id === input.rule.family);
    if (!family) throw new Error(`${input.type.id} has no rule family ${input.rule.family}`);
    this.family = family as RuleFamily<S, unknown>;
    this.params = input.rule.params;
    const layers = ruleLayers(this.family, input.rule.tieBreaker);
    this.tieBreaker = layers[1]?.id ?? null;
    this.energy = input.energy;
    this.economy = input.economy ?? SPEC_ECONOMY;
    this.input = input;
    this.sites = input.type.sites(input.state, input.variant);
    this.phi = input.type.readLength(input.state, input.variant);
  }

  handle(request: HostRequest, context: HostContext): HostReply {
    let reply: HostReply;
    try { reply = this.answer(request, context); } catch (e) { reply = err((e as Error).message); }
    if (reply.ok) this.readBits += reply.bits;
    return reply;
  }

  private answer(request: HostRequest, context: HostContext): HostReply {
    switch (request.op) {
      case "view": return this.view(request.rep, request.site ?? 0);
      case "element": return this.element(request.ref);
      case "myRule": return ok({
        family: this.family.id, params: this.params, tieBreaker: this.tieBreaker, card: this.family.card(this.params, this.tieBreaker),
        layers: ruleLayers(this.family, this.tieBreaker).map(l => ({ id: l.id, title: l.title, sense: l.sense })),
      }, 0);
      case "myScore": return this.score();
      case "quote": return this.quote(request.calls);
      case "budget": return ok({ energy: this.energy, readPrice: 1 / this.economy.kappa, beta: this.economy.beta, hostCallsLeft: context.hostCallsLeft }, 0);
      case "worth": {
        const v = this.input.rungs?.length ? this.input.value : undefined;   // worth comes with rarity, or not at all
        return v ? ok({ mine: v.mine, others: v.others, points: v.points }, this.charged("worth", WORTH_BITS)) : err("this game does not say what lines are worth to agents");
      }
      case "rarity": {
        const rungs = this.input.rungs;
        if (!rungs?.length) return err("this game does not say what scores are worth");
        const s = request.score;
        if (s !== null && (!Array.isArray(s) || s.length > 4 || s.some(x => x !== null && typeof x !== "string"))) return err("a score is a list of parts, or null");
        const score = s === null ? null : s.map(x => (x === null ? null : Qn.parse(x)));
        const ladder = rungs.map(g => ({ score: g.score === null ? null : g.score.map(x => (x === null ? null : Qn.parse(x))), label: "", layer: g.layer ?? 0, ...(g.main !== undefined ? { main: g.main } : {}) }));
        return ok({ bits: rungs[levelOf(score, ladder)]!.bits }, 0);
      }
      case "recent": {
        const moves = (this.input.history ?? []).slice(-8).map(m => ({ mine: m.mine, pointsBefore: m.pointsBefore, pointsAfter: m.pointsAfter }));
        return ok({ moves }, this.charged("recent", RECENT_BITS_PER_MOVE * moves.length));
      }
      case "note": {
        const text = typeof request.text === "string" ? request.text.trim().slice(0, NOTE_CHARS) : "";
        if (!text) return err("a note needs some text");
        if (this.notes.length >= NOTES_PER_ACT) return ok({ kept: false }, 0);
        this.notes.push(text);
        return ok({ kept: true }, 0);
      }
    }
  }

  private readonly once = new Set<string>();
  /** Charge a summary read once per act (a repeat is free, like a repeated view). */
  private charged(what: string, bits: number): number {
    if (this.once.has(what)) return 0;
    this.once.add(what);
    return this.attribute(what, bits);
  }

  private site(site: number): string | null {
    return Number.isInteger(site) && site >= 0 && site < this.sites ? null
      : this.sites === 1 ? `there is only one ${this.type.id === "line" ? "line" : "board"} here: use 0, not ${site}` : `lines are numbered 0 to ${this.sites - 1}`;
  }

  private value(rep: string, name: string, site: number): ElementValue {
    return elementValue(this.type, this.state, { rep, name, site }, site);
  }

  /** The bits of a full read of one representation on one line. */
  private full(rep: string, site: number): number {
    const r = representation(this.type, rep);
    const coords = r.elements.filter(e => e.role === "coordinate");
    const priced = coords.length ? coords : r.elements.filter(e => e.role === "derived");
    return priced.reduce((t, e) => t + valueBits(this.value(rep, e.name, site)), 0);
  }

  /** Charge static read bits of (rep, site), within its full read and the act's one full read of the state. */
  private chargeStatic(rep: string, site: number, bits: number): number {
    const key = `${rep}@${site}`;
    const room = Math.min(this.full(rep, site) - (this.repCharged.get(key) ?? 0), this.phi - this.staticCharged);
    const charged = Math.max(0, Math.min(bits, room));
    this.repCharged.set(key, (this.repCharged.get(key) ?? 0) + charged);
    this.staticCharged += charged;
    return this.attribute(rep, charged);
  }
  private attribute(rep: string, bits: number): number {
    if (bits > 0) this.readsByRep.set(rep, (this.readsByRep.get(rep) ?? 0) + bits);
    return bits;
  }
  private chargeView(rep: string, site: number): number {
    return this.chargeStatic(rep, site, this.full(rep, site));
  }

  private view(rep: string, site: number): HostReply {
    if (!this.type.representations.some(r => r.id === rep)) return err(`unknown view ${JSON.stringify(rep)}`);
    const bad = this.site(site);
    if (bad) return err(bad);
    const elements: Record<string, ElementValueWire> = {};
    for (const e of representation(this.type, rep).elements) {
      if (e.role !== "dynamic") elements[e.name] = wire(this.value(rep, e.name, site));
    }
    const bits = this.full(rep, site);
    return ok({ rep, site, elements, bits }, this.chargeView(rep, site));
  }

  private element(ref: ElementRef): HostReply {
    if (!this.type.representations.some(r => r.id === ref?.rep)) return err(`unknown view ${JSON.stringify(ref?.rep)}`);
    const site = ref.site ?? 0;
    const bad = this.site(site);
    if (bad) return err(bad);
    const decl = elementDecl(this.type, ref);
    const value = elementValue(this.type, this.state, { ...ref, site }, site);
    const bits = valueBits(value);
    const key = refKey({ ...ref, site }, true);
    const repeat = this.asked.has(key);
    this.asked.add(key);
    const charged = repeat ? 0 : decl.role === "dynamic" ? this.attribute(ref.rep, bits) : this.chargeStatic(ref.rep, site, bits);
    return ok({ ref, value: wire(value), bits }, charged);
  }

  private score(): HostReply {
    let bits = 0;
    for (const rep of this.family.depends) for (let s = 0; s < this.sites; s++) bits += this.chargeView(rep, s);
    const e = evaluateObject(this.type, this.family, this.params, this.state, this.variant, this.tieBreaker);
    const ladder = objectLadder(this.type, this.family, this.params, this.variant, this.tieBreaker);
    // Each layer on its own ladder ("main part: step 5 of 7"), summed over the lines.
    const layers = layerLadders(this.family, this.params, this.variant, this.tieBreaker).map((rungs, j) => ({
      id: ruleLayers(this.family, this.tieBreaker)[j]!.id,
      level: e.sites.reduce((t, ev) => t + levelOf(ev.score === null ? null : [ev.score[j] ?? null], rungs), 0),
      top: (rungs.length - 1) * e.sites.length,
    }));
    const multi = e.sites.length > 1;
    const terms = e.sites.flatMap((ev, i) => ev.terms.map(t => ({
      id: multi ? `L${i + 1}:${t.id}` : t.id,
      value: "undefined" in t.value ? null : Qn.toWire(t.value),
    })));
    return ok({
      score: e.score === null ? null : e.score.map(x => (x === null ? null : Qn.toWire(x))),
      level: levelOf(e.score, ladder), top: ladder.length - 1, layers, terms,
    }, bits);
  }

  /** The calls' prices on the offered state, in order, or why they are not allowed. */
  price(calls: unknown): { valid: true; prices: Price[]; total: number; result: S } | { valid: false; reason: string } {
    const parsed = parseCalls(calls);
    if (typeof parsed === "string") return { valid: false, reason: parsed };
    if (!parsed.length) return { valid: false, reason: "a plan needs at least one move" };
    const applied = applyCalls(this.type, this.variant, this.state, parsed);
    if (isInvalid(applied)) return { valid: false, reason: applied.invalid };
    return { valid: true, prices: [...applied.prices], total: applied.total, result: applied.result };
  }

  private quote(calls: unknown): HostReply {
    let bits = 0;
    if (!this.quoted && Array.isArray(calls) && calls.length) {
      const first = calls[0] as { mutator?: unknown; site?: unknown };
      const site = typeof first?.site === "number" ? first.site : 0;
      const rep = typeof first?.mutator === "string" ? lensOf(this.type, first.mutator) : undefined;
      if (rep && !this.site(site)) { this.quoted = true; bits = this.chargeView(rep, site); }
    }
    const priced = this.price(calls);
    if (!priced.valid) return ok({ valid: false, reason: priced.reason, bits: [], total: 0, charge: 0 }, bits);
    return ok({ valid: true, bits: priced.prices.map(p => p.total), total: priced.total, charge: changeCharge(priced.total, this.economy) }, bits);
  }
}

/** The view a mutator belongs to first ("si" for si.shift): the lens a change is made through and charged as. */
export function lensOf<S>(type: ObjectType<S>, mutator: string): string | undefined {
  return type.mutators.find(x => x.id === mutator)?.reps.find(r => type.representations.some(x => x.id === r));
}

/** Shape-check calls from an agent (untrusted) into v2-core's wire calls, or say what is wrong. */
export function parseCalls(calls: unknown): Call[] | string {
  if (!Array.isArray(calls)) return "the calls must be a list";
  const out: Call[] = [];
  for (const c of calls) {
    if (typeof c !== "object" || c === null) return "a call is an object made with call(mutator, args)";
    const { mutator, site = 0, args = {} } = c as { mutator?: unknown; site?: unknown; args?: unknown };
    if (typeof mutator !== "string") return "a call names its mutator";
    if (!Number.isSafeInteger(site) || (site as number) < 0) return `${mutator}: site must be a line number from 0`;
    if (typeof args !== "object" || args === null || Array.isArray(args)) return `${mutator}: the arguments are an object`;
    const a: Record<string, string> = {};
    for (const [k, v] of Object.entries(args)) {
      if (typeof v !== "string") return `${mutator}: argument ${k} must be a number`;
      a[k] = v;
    }
    out.push({ mutator, site: site as number, args: a });
  }
  return out;
}
