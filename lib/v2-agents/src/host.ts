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
  applyCalls, elementDecl, refKey, elementValue, evaluateObject, isInvalid, Qn, ratBits,
  joinTieBreakers, representation, ruleLayers, type Call, type TieBreaker, type ElementRef, type ElementValue, type ObjectType, type Price, type RuleFamily, type Variant,
} from "@workspace/v2-core";
import { BETA, KAPPA } from "@workspace/v2-economy";
import { defenceNet, valueLookup, withUniqueness, type ValueFunction } from "@workspace/v2-valuation";

/**
 * A rule's value function as the server sends it: knots and tail, and the game's uniqueness correction (owner decision
 * 24, spec §2.6) when it has one, applied as the server applies it (`withUniqueness`, at the game's object count).
 */
export type GameValues = Pick<ValueFunction, "knots" | "tail"> & {
  readonly uniqueness?: { readonly ns: readonly number[]; readonly heldMass: readonly number[]; readonly objects: number };
};
/** The lookup a host prices with: the value function, corrected for the game's objects. */
export function gameLookup(values: GameValues) {
  const look = valueLookup(values);
  return values.uniqueness ? withUniqueness(look, values.uniqueness, values.uniqueness.objects) : look;
}
import type { AgentHost, ElementValueWire, HostContext, HostReply, HostRequest } from "@workspace/v2-sandbox";

/**
 * A defence goal dealt beside a rule (v1, restored; owner-decisions call 1): a penalty family of the object type, its
 * parameters, its value function (badness to bits h, no uniqueness correction), E_π η(h) and the game's weight w. A seat
 * with one is worth n = s⁺ − w·(η(h) − E_π η(h)) (lib/v2-valuation defence.ts), as the server's commit values it.
 */
export interface DefenceRef {
  readonly family: string;
  readonly params: unknown;
  readonly values: Pick<ValueFunction, "knots" | "tail">;
  readonly mean: number;
  readonly weight: number;
}

/** A rule as dealt: a family of the object type, its parameters and its tie-breaker. */
export interface RuleRef {
  readonly family: string;
  readonly params: Readonly<Record<string, unknown>>;
  /** The dealt tie-breakers, in order (one id, or several joined by ">"); null for the main layer alone; absent: the family's first (v2-core `ruleLayers`). */
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
  /** The energy the agent earns a second (its share of its player's power), as `budget()` reports it; absent: unknown. */
  readonly income?: number;
  readonly economy?: Economy;
  /** What the offered line is worth to the player now (spec §8, what they see): n_i, Σ n_j and π_i, in bits. */
  readonly value?: { readonly mine: number; readonly others: number; readonly points: number };
  /** The latest moves on the offered line the player may see, newest last (theirs, and others' that changed their points). */
  readonly history?: readonly { readonly mine: boolean; readonly pointsBefore: number; readonly pointsAfter: number }[];
  /**
   * The player's rule's value function (owner decision 23: the server's value record, knots and tail): what a score is
   * worth in bits. Prices `rarity(score)` and gives `myScore()` its bits; `worth()` is only answered with it.
   */
  readonly values?: GameValues;
  /**
   * The other players' rules and value functions, so the host can answer `othersAfter` (their rarity on the line,
   * added up, before and after a plan). The agent never sees them, only the total.
   */
  readonly others?: readonly { readonly rule: RuleRef; readonly values: GameValues; readonly defence?: DefenceRef }[];
  /** The player's own defence goal, when the game deals them: `myScore`, `othersAfter`'s `mine` and the commit clause use it. */
  readonly defence?: DefenceRef;
  /** Owner decision 24 (objects are unique): whether another object already holds this state (as the type encodes it).
   *  A plan whose result is held is not allowed, so quotes, cheapest() and othersAfter skip it. */
  readonly occupied?: (encoded: string) => boolean;
  /**
   * Disclosure noise on the others' sum while a game is live (v1's public-log design §5.2): the noise at a state (as the
   * type encodes it), a keyed function of the state alone, so repeats cannot average it away. `othersAfter` reports
   * exact + noise, unclamped as v1 disclosed it (only points clamp: own × max(0, others)); 0 or absent is exact.
   */
  readonly disclosed?: (encoded: string) => number;
}

/** Read bits charged for `worth()`: three summary numbers the player could read off the line's row. */
export const WORTH_BITS = 6;
/** Read bits charged for each `othersAfter(plan)`: two summary numbers, like worth, every time (each plan differs). */
export const OTHERS_AFTER_BITS = 6;
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
  /** The other players' rules, ready to score a state, and their value lookups (for othersAfter). */
  private readonly others: { family: RuleFamily<S, unknown>; params: unknown; tieBreaker: TieBreaker; look: ReturnType<typeof valueLookup>; defence: ((s: S, reward: number) => number) | null }[] | undefined;
  /** The player's own defence goal as a function of a state and its reward bits (null: none dealt). */
  private readonly defence: ((s: S, reward: number) => number) | null;
  /** The value function's lookup, when the game gives one. */
  private readonly lookup: ReturnType<typeof valueLookup> | undefined;

  constructor(input: HostInput<S>) {
    this.type = input.type; this.variant = input.variant; this.state = input.state;
    const family = input.type.families.find(f => f.id === input.rule.family);
    if (!family) throw new Error(`${input.type.id} has no rule family ${input.rule.family}`);
    this.family = family as RuleFamily<S, unknown>;
    this.params = input.rule.params;
    const layers = ruleLayers(this.family, input.rule.tieBreaker);
    this.tieBreaker = joinTieBreakers(layers.slice(1).map(l => l.id));   // the whole ordered list (any depth)
    this.energy = input.energy;
    this.economy = input.economy ?? SPEC_ECONOMY;
    this.input = input;
    this.lookup = input.values ? gameLookup(input.values) : undefined;
    this.others = input.others?.map(o => {
      const family = input.type.families.find(f => f.id === o.rule.family);
      if (!family) throw new Error(`${input.type.id} has no rule family ${o.rule.family}`);
      return { family: family as RuleFamily<S, unknown>, params: o.rule.params, tieBreaker: joinTieBreakers(ruleLayers(family as RuleFamily<S, unknown>, o.rule.tieBreaker).slice(1).map(l => l.id)), look: gameLookup(o.values), defence: o.defence ? this.netOf(o.defence) : null };
    });
    this.defence = input.defence ? this.netOf(input.defence) : null;
    this.sites = input.type.sites(input.state, input.variant);
    this.phi = input.type.readLength(input.state, input.variant);
  }

  /**
   * The player's points at a state as the player sees them (the commit clause decides on these; v1's commitRaises):
   * own bits exact, the others' sum as `othersAfter` discloses it (noise included, unclamped), and points own ×
   * max(0, others). Null when the game does not say what lines are worth (no value function or no others).
   */
  payoffAt(state: S): { mine: number; others: number; points: number } | null {
    if (!this.lookup || !this.others?.length) return null;
    const mine = this.mineAt(state);
    const others = this.othersDisclosed(state);
    return { mine, others, points: mine * Math.max(0, others) };
  }
  /**
   * The others' sum at a state as the player is shown it: exact + noise, unclamped (v1's public-log design §2). The one
   * place it is computed: `othersAfter` and the commit clause must show and decide on the same number.
   */
  private othersDisclosed(state: S): number {
    return this.others!.reduce((t, o) => {
      const reward = o.look(evaluateObject(this.type, o.family, o.params, state, this.variant, o.tieBreaker).score).bits;
      return t + (o.defence ? o.defence(state, reward) : reward);
    }, 0)
      + (this.input.disclosed?.(this.type.encode(state)) ?? 0);
  }
  /** The player's own bits at a state, as the commit values them (with the defence goal, when one is dealt). */
  private mineAt(state: S): number {
    const reward = this.lookup!(evaluateObject(this.type, this.family, this.params, state, this.variant, this.tieBreaker).score).bits;
    return this.defence ? this.defence(state, reward) : reward;
  }
  /** A defence goal as a function of a state and its reward bits: n = s⁺ − w·(η(h) − E_π η(h)). */
  private netOf(d: DefenceRef): (s: S, reward: number) => number {
    const pf = this.type.penalties?.find(f => f.id === d.family);
    if (!pf) throw new Error(`${this.type.id} has no defence goal ${d.family}`);
    const look = valueLookup(d.values);
    return (s, reward) => defenceNet(reward, look(evaluateObject(this.type, pf as RuleFamily<S, unknown>, d.params, s, this.variant, null).score).bits, d.weight, d.mean);
  }
  /** Plans already asked `othersAfter` this act, as parsed calls (the commit clause does not charge twice for one). */
  private readonly othersAsked = new Set<string>();
  /**
   * The commit clause's read: what `othersAfter` on the plan charges, through the host's accounting, unless the agent
   * already asked `othersAfter` on this very plan this act (then it knows the answer and pays nothing more).
   */
  clauseRead(calls: readonly Call[]): number {
    const key = JSON.stringify(calls);
    if (this.othersAsked.has(key)) return 0;
    this.othersAsked.add(key);
    const bits = this.attribute("othersAfter", OTHERS_AFTER_BITS);
    this.readBits += bits;
    return bits;
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
        object: this.type.id,   // what the agent changes ("line", "grid"): its own words name it
        family: this.family.id, params: this.params, tieBreaker: this.tieBreaker, card: this.family.card(this.params, this.tieBreaker),
        layers: ruleLayers(this.family, this.tieBreaker).map(l => ({ id: l.id, title: l.title, sense: l.sense })),
        mutators: this.variant.mutators,   // the moves this game offers (its menu)
        defence: this.input.defence ? { family: this.input.defence.family, params: this.input.defence.params, weight: this.input.defence.weight } : null,
      }, 0);
      case "myScore": return this.score();
      case "quote": return this.quote(request.calls);
      case "budget": return ok({ energy: this.energy, income: this.input.income ?? null, readPrice: 1 / this.economy.kappa, beta: this.economy.beta, hostCallsLeft: context.hostCallsLeft }, 0);
      case "worth": {
        const v = this.input.values ? this.input.value : undefined;   // worth comes with rarity, or not at all
        return v ? ok({ mine: v.mine, others: v.others, points: v.points }, this.charged("worth", WORTH_BITS)) : err("this game does not say what lines are worth to agents");
      }
      case "othersAfter": {
        if (!this.others?.length) return err("this game does not say what lines are worth to the others");
        const priced = this.price(request.calls);
        { const parsed = parseCalls(request.calls); if (typeof parsed !== "string") this.othersAsked.add(JSON.stringify(parsed)); }
        // As v1 disclosed it (public-log-design §2): others = exact + noise, unclamped; only points clamp at 0.
        const total = (s: S) => this.othersDisclosed(s);
        // The others' totals and nothing else: a failure scoring another player's rule must not name it in its message.
        let before: number, after: number | null;
        try { before = total(this.state); after = priced.valid ? total(priced.result) : null; }
        catch { return err("the others' worth could not be worked out for this plan"); }
        // With a defence goal the player's own bits after a plan are not their rule's rarity of the score it reaches: say them
        // (the player's own number; it discloses nothing of the others).
        if (this.defence && this.lookup) {
          const mine = { before: this.mineAt(this.state), after: priced.valid ? this.mineAt(priced.result) : null };
          return ok({ before, after, mine }, this.attribute("othersAfter", OTHERS_AFTER_BITS));
        }
        return ok({ before, after }, this.attribute("othersAfter", OTHERS_AFTER_BITS));
      }
      case "rarity": {
        if (!this.lookup) return err("this game does not say what scores are worth");
        const s = request.score;
        if (s !== null && (!Array.isArray(s) || s.length > 4 || s.some(x => x !== null && typeof x !== "string"))) return err("a score is a list of parts, or null");
        const score = s === null ? null : s.map(x => (x === null ? null : Qn.parse(x)));
        return ok({ bits: this.lookup(score).bits }, 0);
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
    // The utilities (owner decision 23: plain lexicographic, bigger better, nothing saturates), and what they are worth.
    const u = e.score;
    const multi = e.sites.length > 1;
    const terms = e.sites.flatMap((ev, i) => ev.terms.map(t => ({
      id: multi ? `L${i + 1}:${t.id}` : t.id,
      value: "undefined" in t.value ? null : Qn.toWire(t.value),
    })));
    return ok({
      score: u === null ? null : u.map(x => (x === null ? null : Qn.toWire(x))),
      bits: this.lookup ? (this.defence ? this.mineAt(this.state) : this.lookup(u).bits) : null,
      layers: ruleLayers(this.family, this.tieBreaker).map(l => ({ id: l.id })),
      terms,
    }, bits);
  }

  /** The calls' prices on the offered state, in order, or why they are not allowed. */
  price(calls: unknown): { valid: true; prices: Price[]; total: number; result: S } | { valid: false; reason: string } {
    const parsed = parseCalls(calls);
    if (typeof parsed === "string") return { valid: false, reason: parsed };
    if (!parsed.length) return { valid: false, reason: "a plan needs at least one move" };
    const applied = applyCalls(this.type, this.variant, this.state, parsed);
    if (isInvalid(applied)) return { valid: false, reason: applied.invalid };
    if (this.input.occupied?.(this.type.encode(applied.result))) return { valid: false, reason: "another object is already in that state" };
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
