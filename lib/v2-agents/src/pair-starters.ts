/**
 * The two-line pairs' shipped agents (lib/v2-pair), generated in both languages from the catalogue below, beside the
 * line's (starters.ts) and the grid's (grid-starters.ts):
 *
 *  - an EXAMPLE for every family and each of its tie-breakers;
 *  - SIMPLE, THOROUGH and BOLD starters per family, which read the dealt tie-breaker and climb for the owner's POINTS
 *    with the line starters' policy: each act scores every step it tries (pairSteps, the guest's two-line kit) and
 *    `climb` takes the one that most raises rarity × the others' rarity after it; on PROTECT objects only steps that keep
 *    the others as well off (`fair`);
 *  - NAIVE (for learning): the best step for its own rule, whatever the others want.
 *
 * A family's score reads `solved(L)` (the guest kit: the number you divide by, the answer, the steeper line's numbers,
 * the gaps, the angle), so each entry is a few lines that mirror lib/v2-pair families.ts exactly (test/pairs.test.ts
 * checks every family and tie-breaker against the engine in both languages). Every program has exactly one "Try this:".
 */
import type { RuleFamily } from "@workspace/v2-core";
import { pairType } from "@workspace/v2-pair";
import type { AgentKind, ShippedAgent, ShippedLanguage } from "./starters.ts";

/** The moves a pair agent can try in its own head (pairSteps' kinds). */
export type PairKind = "shift" | "tilt" | "stretch" | "turn" | "slide" | "combine" | "reflect" | "quarter" | "translate";
const ALL_KINDS: readonly PairKind[] = ["shift", "tilt", "stretch", "turn", "slide", "combine", "reflect", "quarter", "translate"];

interface Lines { readonly ts: readonly string[]; readonly py: readonly string[] }
interface PairTieBreakerEntry { readonly ts: string; readonly py: string; readonly says: string; readonly tryThis: string }
export interface PairFamilyEntry {
  readonly family: string;
  readonly mainSays: string;
  /** Lines computing `main` from `f = solved(L)`; they return null / None for no score (the worst). */
  readonly main: Lines;
  readonly tieBreakers: Readonly<Record<string, PairTieBreakerEntry>>;
  /** The Simple starter's and the examples' moves (Thorough tries every kind). */
  readonly simple: readonly PairKind[];
}

const DIST = { ts: "const dist = v => Q.abs(Q.sub(v, whole(v)));   // how far a number is from the whole number nearest it", py: "dist = lambda v: abs(v - whole(v))   # how far a number is from the whole number nearest it" };
const FLOOR = { ts: "const floor = v => whole(Q.sub(v, Q.of(1, 2)));   // rounded down", py: "floor = lambda v: v // 1   # rounded down" };
const PARALLEL = { ts: "if (f.x === null) return null;   // parallel lines never cross: no score", py: ["if f.x is None:   # parallel lines never cross: no score", "    return None"] };
const T = (ts: string, py: string, says: string, tryThis: string): PairTieBreakerEntry => ({ ts, py, says, tryThis });

export const PAIR_CATALOGUE: readonly PairFamilyEntry[] = [
  {
    family: "whole-answer", mainSays: "the answer's level: whole numbers, y on your ladder (higher is better)", simple: ["slide", "turn", "stretch"],
    main: {
      ts: [DIST.ts, PARALLEL.ts, "const { score: main, n: Yv } = valuationLadder(f.y, p.q, p.r, dist(f.x));   // y on your ladder, x a whole number"],
      py: [DIST.py, ...PARALLEL.py, "main, Yv = valuation_ladder(f.y, p[\"q\"], p[\"r\"], dist(f.x))   # y on your ladder, x a whole number"],
    },
    tieBreakers: {
      "peg-divisor": T("common(Q.add(Q.abs(f.X), Q.abs(Yv)), f.D)", "common(abs(f.X) + abs(Yv), f.D)", "|X| + |Y| sharing a big factor with the number you divide by is better", "add \"combine\" to KINDS: it keeps the answer and the number you divide by."),
      "south-west": T("Q.neg(Q.add(f.X, Yv))", "-(f.X + Yv)", "an answer far down and to the left is better", "change FAR = 3 to 5: the answer slides further in one step."),
    },
  },
  {
    family: "no-fractions", mainSays: "the level of the number you divide by on k, k², k³, … (higher is better)", simple: ["combine", "turn", "stretch"],
    main: {
      ts: [PARALLEL.ts, "const main = powerLadder(p.k, t => Q.abs(Q.sub(Q.abs(f.D), t)));   // the number you divide by on k, k², k³, …", "const nx = Q.mul(f.x, f.D), ny = Q.mul(f.y, f.D);   // the answer's numerators"],
      py: [...PARALLEL.py, "main = power_ladder(p[\"k\"], lambda t: abs(abs(f.D) - t))   # the number you divide by on k, k^2, k^3, ...", "nx, ny = f.x * f.D, f.y * f.D   # the answer's numerators"],
    },
    tieBreakers: {
      "numerator-smooth": T("omega(Q.add(Q.abs(nx), Q.abs(ny)))", "omega(abs(nx) + abs(ny))", "numerators adding up to a number with many prime factors are better", "add \"slide\" to KINDS: it moves the answer, and so the numerators."),
      "numerator-shared": T("common(nx, ny)", "common(nx, ny)", "numerators sharing a big factor are better", "add \"stretch\" to KINDS and compare."),
    },
  },
  {
    family: "right-angle", mainSays: "the corner's level: a right angle at a grid point, y on your ladder (higher is better)", simple: ["turn", "slide", "translate"],
    main: {
      ts: [DIST.ts, FLOOR.ts, "if (f.offRight === null || f.x === null) return null;   // parallel lines never cross: no score", "const { score: main, n: Yc } = ladder(f.y, p.q, p.r, Q.add(f.offRight, dist(f.x)));   // a right angle at a grid point, y on your ladder", "const t = Q.add(Q.abs(f.X), Q.abs(Yc));   // the corner's |x| + |y|"],
      py: [DIST.py, FLOOR.py, "if f.off_right is None or f.x is None:   # parallel lines never cross: no score", "    return None", "main, Yc = ladder(f.y, p[\"q\"], p[\"r\"], f.off_right + dist(f.x))   # a right angle at a grid point, y on your ladder", "t = abs(f.X) + abs(Yc)   # the corner's |x| + |y|"],
    },
    tieBreakers: {
      "corner-prime": T("spf(t)", "spf(t)", "a corner whose |x| + |y| has a big smallest prime factor is better", "add \"quarter\" to KINDS: a quarter turn keeps the right angle."),
      "corner-steep": T("f.ms === null ? 0 : common(t, floor(Q.abs(f.ms)))", "0 if f.ms is None else common(t, abs(f.ms) // 1)", "a corner whose |x| + |y| shares a big factor with the steeper gradient is better", "add \"tilt\" to KINDS: it changes a gradient directly."),
    },
  },
  {
    family: "forty-five", mainSays: "the corner's level: 45 degrees at a grid point, |x| + |y| on your ladder (higher is better)", simple: ["turn", "slide", "translate"],
    main: {
      ts: [DIST.ts, "if (Q.isZero(f.D)) return null;   // parallel lines never cross: no score", "const { score: main, n: S } = ladder(Q.add(Q.abs(f.x), Q.abs(f.y)), p.q, p.r, Q.add(f.off45, dist(f.x)));   // 45 degrees at a grid point, |x| + |y| on your ladder"],
      py: [DIST.py, "if f.D == 0:   # parallel lines never cross: no score", "    return None", "main, S = ladder(abs(f.x) + abs(f.y), p[\"q\"], p[\"r\"], f.off45 + dist(f.x))   # 45 degrees at a grid point, |x| + |y| on your ladder"],
    },
    tieBreakers: {
      "corner-smooth": T("omega(S)", "omega(S)", "a corner whose |x| + |y| has many prime factors is better", "add \"stretch\" to KINDS: a stretch moves the corner further out."),
      "corner-gap": T("f.ygap === null ? null : common(S, whole(f.ygap))", "None if f.ygap is None else common(S, whole(f.ygap))", "a corner whose |x| + |y| shares a big factor with the y-intercepts' gap is better", "add \"shift\" to KINDS: it changes the gap directly."),
    },
  },
  {
    family: "double-gap", mainSays: "the gaps' level: the y-intercepts' gap whole and k, k², … times the x-intercepts' gap (higher is better)", simple: ["shift", "tilt", "stretch"],
    main: {
      ts: [DIST.ts, "if (f.ygap === null || f.xgap === null || f.origin) return null;   // no gaps, or a line through (0, 0): no score", "const main = powerLadder(p.k, t => Q.add(dist(f.ygap), Q.abs(Q.sub(f.ygap, Q.mul(t, f.xgap)))));"],
      py: [DIST.py, "if f.ygap is None or f.xgap is None or f.origin:   # no gaps, or a line through (0, 0): no score", "    return None", "main = power_ladder(p[\"k\"], lambda t: dist(f.ygap) + abs(f.ygap - t * f.xgap))"],
    },
    tieBreakers: {
      "gap-divisor": T("common(whole(f.ygap), f.D)", "common(whole(f.ygap), f.D)", "the gap sharing a big factor with the number you divide by is better", "add \"stretch\" to KINDS: it scales a line's gap."),
      "gap-prime": T("spf(whole(f.ygap))", "spf(whole(f.ygap))", "a gap with a big smallest prime factor is better", "change FAR = 3 to 5 so the gap can jump to a bigger prime."),
    },
  },
  {
    family: "far-crossing", mainSays: "the level of the steeper line's x-intercept on your ladder (higher is better)", simple: ["shift", "tilt"],
    main: {
      ts: ["if (f.rs === null) return null;   // the steeper line is flat: no score", "const { score: main, n: R } = ladder(f.rs, p.q, p.r);   // the x-intercept on your ladder"],
      py: ["if f.rs is None:   # the steeper line is flat: no score", "    return None", "main, R = ladder(f.rs, p[\"q\"], p[\"r\"])   # the x-intercept on your ladder"],
    },
    tieBreakers: {
      "far-right": T("R", "R", "an x-intercept far to the right is better", "add \"stretch\" to KINDS and see if it moves faster."),
      "far-prime": T("spf(R)", "spf(R)", "an x-intercept with a big smallest prime factor is better", "change FAR = 3 to 5 so the crossing can jump to a bigger prime."),
    },
  },
  {
    family: "high-start", mainSays: "the level of the gentler line's y-intercept on your ladder (higher is better)", simple: ["shift", "tilt", "stretch"],
    main: {
      ts: [FLOOR.ts, "if (f.cg === null || f.mg === null) return null;   // the gentler line is upright: no score", "const { score: main, n: H } = valuationLadder(f.cg, p.q, p.r);   // the y-intercept on your ladder"],
      py: [FLOOR.py, "if f.cg is None or f.mg is None:   # the gentler line is upright: no score", "    return None", "main, H = valuation_ladder(f.cg, p[\"q\"], p[\"r\"])   # the y-intercept on your ladder"],
    },
    tieBreakers: {
      "high-and-rising": T("Q.cmp(H, floor(f.mg)) < 0 ? H : floor(f.mg)", "min(H, floor(f.mg))", "the smaller of the gentler line's y-intercept and its gradient's whole part big is better", "add \"stretch\" to KINDS: it raises both, but a steeper gentler line can stop being the gentler one."),
      "start-factors": T("omega(common(H, f.D))", "omega(common(H, f.D))", "a y-intercept sharing many prime factors with the number you divide by is better", "add \"combine\" to KINDS and compare."),
    },
  },
  {
    family: "steep-ratio", mainSays: "the level of the whole number of times as steep on your ladder (higher is better)", simple: ["tilt", "stretch"],
    main: {
      ts: ["if (f.ratio === null) return null;   // no ratio of gradients: no score", "const { score: main, n: k } = valuationLadder(f.ratio, p.q, p.r, 0, 2);   // the whole number of times (at least 2 either way) on your ladder"],
      py: ["if f.ratio is None:   # no ratio of gradients: no score", "    return None", "main, k = valuation_ladder(f.ratio, p[\"q\"], p[\"r\"], 0, 2)   # the whole number of times (at least 2 either way) on your ladder"],
    },
    tieBreakers: {
      "ratio-gap": T("f.ygap === null ? null : common(k, whole(f.ygap))", "None if f.ygap is None else common(k, whole(f.ygap))", "that number sharing a big factor with the y-intercepts' gap is better", "add \"shift\" to KINDS: it changes the gap directly."),
      "ratio-prime": T("spf(k)", "spf(k)", "that number with a big smallest prime factor is better", "change FAR = 3 to 5 so the ratio can jump to a bigger prime."),
    },
  },
];

const familyOf = (id: string): RuleFamily<unknown, unknown> => {
  const f = pairType.families.find(x => x.id === id);
  if (!f) throw new Error(`v2-pair has no family ${id}`);
  return f as RuleFamily<unknown, unknown>;
};
const entryOf = (id: string): PairFamilyEntry => {
  const e = PAIR_CATALOGUE.find(x => x.family === id);
  if (!e) throw new Error(`no pair agents are described for ${id}`);
  return e;
};
/** Is this a pair family with shipped agents? */
export const isPairFamily = (id: string): boolean => PAIR_CATALOGUE.some(e => e.family === id) && pairType.families.some(f => f.id === id);
/** Is this a family of the pair type (described or not)? Such a family never falls through to the line catalogue. */
export const isPairTypeFamily = (id: string): boolean => pairType.families.some(f => f.id === id);

type StarterKind = Exclude<AgentKind, "example">;
const KINDS: Record<StarterKind, { title: string; summary: string; tryThis: string; far: number; quotes: number }> = {
  simple: {
    title: "Simple", summary: "Tries small moves of either line, taking the one that raises your points most: good for your rule and for the other players too.",
    tryThis: "add a move from the Thorough starter's KINDS and compare.", far: 2, quotes: 8,
  },
  thorough: {
    title: "Thorough", summary: "Like Simple, but it tries every kind of move of either line and compares more prices before it pays.",
    tryThis: "change QUOTES = 16 to 6: fewer prices asked, but it may miss a cheaper plan.", far: 2, quotes: 16,
  },
  bold: {
    title: "Bold", summary: "Makes bigger moves (up to 4 at a time), so it gets there in fewer moves, each dearer.",
    tryThis: "change FAR = 4 to 2: shorter steps, cheaper moves.", far: 4, quotes: 12,
  },
  naive: {
    title: "Naive (for learning)",
    summary: "Chases your rule on every pair, whatever it costs and whatever the others want. It is here to learn from: compare it with Simple.",
    tryThis: "summon it beside a friend's agent on the same pairs and watch your points: then switch to Simple.", far: 2, quotes: 8,
  },
};
const HOW_POINTS = [
  "What it does: reads the two lines once (a small read), tries moves of either line in its own head (thinking costs",
  "no energy, only time) and takes the move that raises your points most. Your points on a pair are your rarity there",
  "times the other players' rarity there added up, so a move that suits your rule but spoils the pair for the others",
  "can lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.",
];
const HOW_EXAMPLE = [
  "What it does: reads the two lines once (a small read), tries moves of either line in its own head, and takes the one",
  "that raises your points most (your rarity times the other players'). A tug-of-war burns energy on both sides: when",
  "it finds one it leaves you a note, so you can make a deal with that player.",
];
const HOW_NAIVE = [
  "What it does: reads the two lines once, tries moves in its own head, and pays for the best one for your rule on every",
  "pair it is offered, whatever it costs and whatever the other players think. It keeps fighting over a pair another",
  "player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn from.",
];

const kindsFor = (kind: AgentKind, e: PairFamilyEntry): readonly PairKind[] => (kind === "thorough" ? ALL_KINDS : e.simple);

// ---------------------------------------------------------------- the score

function scoreTs(e: PairFamilyEntry, tieBreaker: string | null): string[] {
  const f = familyOf(e.family);
  const out = [
    "// How good are the two lines L for your rule? [main part, tie-breaker]: bigger is better, null is no score.",
    `function score(L, p${tieBreaker === null ? ", tie" : ""}) {`,
    "  const f = solved(L);   // what the two lines give together (the answer, the number you divide by, ...)",
    ...e.main.ts.map(l => `  ${l}`),
  ];
  if (tieBreaker !== null) out.push(`  return [main, ${e.tieBreakers[tieBreaker]!.ts}];   // main: ${e.mainSays}; tie-breaker: ${e.tieBreakers[tieBreaker]!.says}`);
  else {
    out.push(`  // main: ${e.mainSays}`);
    for (const t of f.tieBreakers.filter(t => e.tieBreakers[t.id])) out.push(`  if (tie === ${JSON.stringify(t.id)}) return [main, ${e.tieBreakers[t.id]!.ts}];   // ${e.tieBreakers[t.id]!.says}`);
    out.push("  return [main];");
  }
  out.push("}");
  return out;
}

function scorePy(e: PairFamilyEntry, tieBreaker: string | null): string[] {
  const f = familyOf(e.family);
  const out = [
    `def score(L, p${tieBreaker === null ? ", tie" : ""}):`,
    "    # How good are the two lines L for your rule? [main part, tie-breaker]: bigger is better, None is no score.",
    "    f = solved(L)   # what the two lines give together (the answer, the number you divide by, ...)",
    ...e.main.py.map(l => `    ${l}`),
  ];
  if (tieBreaker !== null) out.push(`    return [main, ${e.tieBreakers[tieBreaker]!.py}]   # main: ${e.mainSays}; tie-breaker: ${e.tieBreakers[tieBreaker]!.says}`);
  else {
    out.push(`    # main: ${e.mainSays}`);
    for (const t of f.tieBreakers.filter(t => e.tieBreakers[t.id])) out.push(`    if tie == ${JSON.stringify(t.id)}:   # ${e.tieBreakers[t.id]!.says}`, `        return [main, ${e.tieBreakers[t.id]!.py}]`);
    out.push("    return [main]");
  }
  return out;
}

// ---------------------------------------------------------------- the agent

function agentTs(kind: AgentKind, e: PairFamilyEntry, tieBreaker: string | null, far: number, quotes: number): string[] {
  const args = tieBreaker !== null ? "p" : "p, tie";
  return [
    `const FAR = ${far};      // how far one move may go`,
    `const QUOTES = ${quotes};  // at most this many plans are priced (each price is a host call)`,
    `const KINDS = ${JSON.stringify(kindsFor(kind, e))};   // the moves it tries: ${ALL_KINDS.join(", ")}`,
    ...(kind === "naive" ? [] : [
      "const LEAVE = [];      // pairs you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them",
      "const PROTECT = [];    // pairs where you promised not to lower the others, e.g. [7]: only moves that keep them as well off",
    ]),
    "",
    "function agent(offer) {",
    ...(kind === "naive" ? [] : [
      "  if (LEAVE.includes(offer.object)) return null;   // a deal: leave this pair alone",
      "  if (saving(offer)) return null;   // under 10 s of your income in hand: save up for a move (the game still tells you the pair)",
      "  // A tug-of-war (another player taking back your gains on this pair, 3 times lately) burns energy on both",
      "  // sides: tell your owner, who can make a deal. (Leaving the pair instead gives it away: try it and compare.)",
      "  contested(offer, 3);",
    ]),
    "  const L = pairOf(offer);          // the two lines, a·x + b·y + c = 0 each",
    `  const { params: p${tieBreaker !== null ? "" : ", tieBreaker: tie"} } = goal(offer);   // your rule${tieBreaker !== null ? "" : " and tie-breaker"} (free)`,
    "  // Your rule's shortcut: a stretch by its dealt number (q or k) climbs its ladder in one move.",
    "  const tries = pairSteps(L, FAR, KINDS, [p.q ?? p.k].filter(Boolean));   // [plan, lines after]: moves tried in the agent's own head",
    ...(kind === "naive" ? [
      `  let top = score(L, ${args}), plans = [];`,
      "  for (const [plan, L2] of tries) {",
      `    const s = score(L2, ${args});`,
      "    if (better(s, top)) { top = s; plans = [plan]; }               // a new best",
      "    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides",
      "  }",
      "  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip",
    ] : [
      `  let options = tries.map(([plan, L2]) => [plan, score(L2, ${args})]);   // each move and the score it reaches`,
      "  // A promise: on these pairs, only moves that leave the other players at least as well off.",
      "  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));",
      "  // The move that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.",
      `  return climb(offer, options, score(L, ${args}), QUOTES);`,
    ]),
    "}",
  ];
}

function agentPy(kind: AgentKind, e: PairFamilyEntry, tieBreaker: string | null, far: number, quotes: number): string[] {
  const args = tieBreaker !== null ? "p" : "p, tie";
  return [
    `FAR = ${far}      # how far one move may go`,
    `QUOTES = ${quotes}  # at most this many plans are priced (each price is a host call)`,
    `KINDS = ${JSON.stringify(kindsFor(kind, e))}   # the moves it tries: ${ALL_KINDS.join(", ")}`,
    ...(kind === "naive" ? [] : [
      "LEAVE = []      # pairs you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them",
      "PROTECT = []    # pairs where you promised not to lower the others, e.g. [7]: only moves that keep them as well off",
    ]),
    "",
    "",
    "def agent(offer):",
    ...(kind === "naive" ? [] : [
      "    if offer.object in LEAVE:   # a deal: leave this pair alone",
      "        return None",
      "    if saving(offer):   # under 10 s of your income in hand: save up for a move (the game still tells you the pair)",
      "        return None",
      "    # A tug-of-war (another player taking back your gains on this pair, 3 times lately) burns energy on both",
      "    # sides: tell your owner, who can make a deal. (Leaving the pair instead gives it away: try it and compare.)",
      "    contested(offer, 3)",
    ]),
    "    L = pair_of(offer)          # the two lines, a*x + b*y + c = 0 each",
    "    rule = goal(offer)          # your rule (free)",
    tieBreaker !== null ? "    p = rule.params" : "    p, tie = rule.params, rule.tie_breaker",
    "    # Your rule's shortcut: a stretch by its dealt number (q or k) climbs its ladder in one move.",
    "    tries = pair_steps(L, FAR, KINDS, [f for f in (p.get(\"q\"), p.get(\"k\")) if f])   # (plan, lines after): moves tried in the agent's own head",
    ...(kind === "naive" ? [
      `    top, plans = score(L, ${args}), []`,
      "    for plan, L2 in tries:",
      `        s = score(L2, ${args})`,
      "        if better(s, top):",
      "            top, plans = s, [plan]         # a new best",
      "        elif plans and not better(top, s):",
      "            plans.append(plan)             # as good as the best: the price decides",
      "    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip",
    ] : [
      `    options = [(plan, score(L2, ${args})) for plan, L2 in tries]   # each move and the score it reaches`,
      "    # A promise: on these pairs, only moves that leave the other players at least as well off.",
      "    if offer.object in PROTECT:",
      "        options = [(plan, s) for plan, s in options if fair(offer, plan)]",
      "    # The move that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.",
      `    return climb(offer, options, score(L, ${args}), QUOTES)`,
    ]),
  ];
}

// ---------------------------------------------------------------- assembly

function render(kind: AgentKind, familyId: string, tieBreaker: string | null, language: ShippedLanguage): ShippedAgent {
  const e = entryOf(familyId), f = familyOf(familyId);
  const tb = tieBreaker === null ? null : f.tieBreakers.find(t => t.id === tieBreaker);
  if (tieBreaker !== null && (!tb || !e.tieBreakers[tieBreaker])) throw new Error(`${familyId} has no tie-breaker ${tieBreaker} to write an example for`);
  const meta = kind === "example"
    ? { title: `Example: ${tb!.title}`, summary: `Gets the main part right, then works on the tie-breaker (${tb!.title}).`, tryThis: e.tieBreakers[tieBreaker!]!.tryThis, far: 3, quotes: 8 }
    : KINDS[kind];
  const rule = tb ? `Main part: ${f.main.title}. Tie-breaker: ${tb.title}.`
    : `Main part: ${f.main.title}. Tie-breaker: whichever you were dealt (${f.tieBreakers.filter(t => e.tieBreakers[t.id]).map(t => t.title).join("; ")}).`;
  const how = kind === "naive" ? HOW_NAIVE : kind === "example" ? HOW_EXAMPLE : HOW_POINTS;
  const header = [`${f.title} · ${meta.title}`, rule, ...how, `Try this: ${meta.tryThis}`];
  const ts = language === "typescript", c = ts ? "//" : "#";
  const lines = [
    ...header.map(l => `${c} ${l}`),
    ...(ts ? [""] : ["", ""]),
    ...(ts ? scoreTs(e, tieBreaker) : scorePy(e, tieBreaker)),
    ...(ts ? [""] : ["", ""]),
    ...(ts ? agentTs(kind, e, tieBreaker, meta.far, meta.quotes) : agentPy(kind, e, tieBreaker, meta.far, meta.quotes)),
  ];
  return { family: familyId, kind, tieBreaker, language, title: meta.title, summary: meta.summary, source: lines.join("\n") + "\n" };
}

export function pairExampleFor(family: string, tieBreaker: string, language: ShippedLanguage): ShippedAgent | null {
  return isPairFamily(family) && entryOf(family).tieBreakers[tieBreaker] && familyOf(family).tieBreakers.some(t => t.id === tieBreaker)
    ? render("example", family, tieBreaker, language) : null;
}

/** The Simple, Thorough and Bold starters for a pair family (reading the dealt tie-breaker), then Naive. */
export function pairStartersFor(family: string, language: ShippedLanguage): ShippedAgent[] {
  if (!isPairFamily(family)) return [];
  return (["simple", "thorough", "bold", "naive"] as const).map(k => render(k, family, null, language));
}

export function pairShippedAgents(): ShippedAgent[] {
  return PAIR_CATALOGUE.filter(e => isPairFamily(e.family)).flatMap(e => (["typescript", "python"] as const).flatMap(language => [
    ...familyOf(e.family).tieBreakers.filter(t => e.tieBreakers[t.id]).map(t => render("example", e.family, t.id, language)),
    ...pairStartersFor(e.family, language),
  ]));
}

export function pairScoreSource(family: string, tieBreaker: string | null, language: ShippedLanguage): string {
  const e = entryOf(family);
  return (language === "typescript" ? scoreTs(e, tieBreaker) : scorePy(e, tieBreaker)).join("\n") + "\n";
}

/** Pair families and tie-breakers that have no shipped agents yet (each needs a PAIR_CATALOGUE entry). */
export function pairUndescribed(): string[] {
  return pairType.families.flatMap(f => {
    const e = PAIR_CATALOGUE.find(x => x.family === f.id);
    return e ? f.tieBreakers.filter(t => !e.tieBreakers[t.id]).map(t => `${f.id}/${t.id}`) : [f.id];
  });
}
