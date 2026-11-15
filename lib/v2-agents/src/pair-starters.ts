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
export type PairKind = "shift" | "tilt" | "stretch" | "turn" | "slide" | "combine" | "reflect" | "quarter";
const ALL_KINDS: readonly PairKind[] = ["shift", "tilt", "stretch", "turn", "slide", "combine", "reflect", "quarter"];

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
    family: "whole-answer", mainSays: "how far the answer (x, y) is from whole numbers, x with your remainder (closer is better)", simple: ["slide", "turn"],
    main: {
      ts: [DIST.ts, PARALLEL.ts, "const X = nearestLeaving(f.x, p.q, p.r);   // x's whole number that leaves your remainder", "const main = Q.neg(Q.add(Q.abs(Q.sub(f.x, X)), dist(f.y)));"],
      py: [DIST.py, ...PARALLEL.py, "X = nearest_leaving(f.x, p[\"q\"], p[\"r\"])   # x's whole number that leaves your remainder", "main = -(abs(f.x - X) + dist(f.y))"],
    },
    tieBreakers: {
      "peg-divisor": T("common(Q.add(Q.abs(X), Q.abs(f.Y)), f.D)", "common(abs(X) + abs(f.Y), f.D)", "|X| + |Y| sharing a big factor with the number you divide by is better", "add \"combine\" to KINDS: it keeps the answer and the number you divide by."),
      "south-west": T("Q.neg(Q.add(X, f.Y))", "-(X + f.Y)", "an answer far down and to the left is better", "change FAR = 3 to 5: the answer slides further in one step."),
    },
  },
  {
    family: "no-fractions", mainSays: "how far the number you divide by is from your number k (closer is better)", simple: ["combine", "turn"],
    main: { ts: [FLOOR.ts, PARALLEL.ts, "const main = Q.neg(Q.abs(Q.sub(Q.abs(f.D), p.k)));"], py: [...PARALLEL.py, "main = -abs(abs(f.D) - p[\"k\"])"] },
    tieBreakers: {
      "answer-prime": T("spf(Q.add(Q.abs(f.X), Q.abs(f.Y)))", "spf(abs(f.X) + abs(f.Y))", "|X| + |Y| with a big smallest prime factor is better", "add \"slide\" to KINDS: it moves the answer along a line."),
      "answer-gradient": T("f.ms === null ? 0 : common(Q.add(Q.abs(f.X), Q.abs(f.Y)), floor(Q.abs(f.ms)))", "0 if f.ms is None else common(abs(f.X) + abs(f.Y), abs(f.ms) // 1)", "|X| + |Y| sharing a big factor with the steeper gradient is better", "add \"tilt\" to KINDS: it changes a gradient directly."),
    },
  },
  {
    family: "right-angle", mainSays: "how far the lines are from crossing at a right angle (closer is better)", simple: ["turn", "quarter", "reflect"],
    main: { ts: ["if (f.offRight === null) return null;   // parallel lines never cross: no score", "const main = Q.neg(f.offRight);"], py: ["if f.off_right is None:   # parallel lines never cross: no score", "    return None", "main = -f.off_right"] },
    tieBreakers: {
      "prime-divisor": T("spf(f.D)", "spf(f.D)", "a number you divide by with a big smallest prime factor is better", "add \"combine\" to KINDS and compare."),
      "divisor-intercept": T("f.cs === null ? 0 : common(f.D, whole(f.cs))", "0 if f.cs is None else common(f.D, whole(f.cs))", "the number you divide by sharing a big factor with the steeper line's y-intercept is better", "add \"shift\" to KINDS: it moves a y-intercept directly."),
    },
  },
  {
    family: "forty-five", mainSays: "how far the lines are from crossing at 45 degrees (closer is better)", simple: ["turn", "quarter", "reflect"],
    main: { ts: ["if (Q.isZero(f.D)) return null;   // parallel lines never cross: no score", "const main = Q.neg(f.off45);"], py: ["if f.D == 0:   # parallel lines never cross: no score", "    return None", "main = -f.off45"] },
    tieBreakers: {
      "smooth-divisor": T("omega(f.D)", "omega(f.D)", "a number you divide by with many prime factors is better", "add \"stretch\" to KINDS: multiplying a line grows the number you divide by."),
      "divisor-gap": T("f.ygap === null ? null : common(f.D, whole(f.ygap))", "None if f.ygap is None else common(f.D, whole(f.ygap))", "the number you divide by sharing a big factor with the y-intercepts' gap is better", "add \"shift\" to KINDS: it changes the gap directly."),
    },
  },
  {
    family: "double-gap", mainSays: "how far the y-intercepts' gap is from a whole number k times the x-intercepts' gap (closer is better)", simple: ["shift", "tilt"],
    main: {
      ts: [DIST.ts, "if (f.ygap === null || f.xgap === null || f.origin) return null;   // no gaps, or a line through (0, 0): no score", "const main = Q.neg(Q.add(Q.abs(Q.sub(f.ygap, Q.mul(p.k, f.xgap))), dist(f.ygap)));"],
      py: [DIST.py, "if f.ygap is None or f.xgap is None or f.origin:   # no gaps, or a line through (0, 0): no score", "    return None", "main = -(abs(f.ygap - p[\"k\"] * f.xgap) + dist(f.ygap))"],
    },
    tieBreakers: {
      "gap-divisor": T("common(whole(f.ygap), f.D)", "common(whole(f.ygap), f.D)", "the gap sharing a big factor with the number you divide by is better", "add \"stretch\" to KINDS: it scales a line's gap."),
      "gap-prime": T("spf(whole(f.ygap))", "spf(whole(f.ygap))", "a gap with a big smallest prime factor is better", "change FAR = 3 to 5 so the gap can jump to a bigger prime."),
    },
  },
  {
    family: "far-crossing", mainSays: "how far the steeper line's x-intercept is from a whole number with your remainder (closer is better)", simple: ["shift", "tilt"],
    main: {
      ts: ["if (f.rs === null) return null;   // the steeper line is flat: no score", "const R = nearestLeaving(f.rs, p.q, p.r);   // the whole number that leaves your remainder", "const main = Q.neg(Q.abs(Q.sub(f.rs, R)));"],
      py: ["if f.rs is None:   # the steeper line is flat: no score", "    return None", "R = nearest_leaving(f.rs, p[\"q\"], p[\"r\"])   # the whole number that leaves your remainder", "main = -abs(f.rs - R)"],
    },
    tieBreakers: {
      "far-right": T("R", "R", "an x-intercept far to the right is better", "add \"stretch\" to KINDS and see if it moves faster."),
      "far-prime": T("spf(R)", "spf(R)", "an x-intercept with a big smallest prime factor is better", "change FAR = 3 to 5 so the crossing can jump to a bigger prime."),
    },
  },
  {
    family: "high-start", mainSays: "how far the gentler line's y-intercept is from a whole number with your remainder (closer is better)", simple: ["shift", "tilt"],
    main: {
      ts: [FLOOR.ts, "if (f.cg === null || f.mg === null) return null;   // the gentler line is upright: no score", "const H = nearestLeaving(f.cg, p.q, p.r);   // the whole number that leaves your remainder", "const main = Q.neg(Q.abs(Q.sub(f.cg, H)));"],
      py: [FLOOR.py, "if f.cg is None or f.mg is None:   # the gentler line is upright: no score", "    return None", "H = nearest_leaving(f.cg, p[\"q\"], p[\"r\"])   # the whole number that leaves your remainder", "main = -abs(f.cg - H)"],
    },
    tieBreakers: {
      "high-and-rising": T("Q.cmp(H, floor(f.mg)) < 0 ? H : floor(f.mg)", "min(H, floor(f.mg))", "the smaller of the gentler line's y-intercept and its gradient's whole part big is better", "add \"stretch\" to KINDS: it raises both, but a steeper gentler line can stop being the gentler one."),
      "start-factors": T("omega(common(H, f.D))", "omega(common(H, f.D))", "a y-intercept sharing many prime factors with the number you divide by is better", "add \"combine\" to KINDS and compare."),
    },
  },
  {
    family: "steep-ratio", mainSays: "how far the steeper line is from a whole number of times as steep as the other, with your remainder (closer is better)", simple: ["tilt", "stretch"],
    main: {
      ts: [
        "if (f.ratio === null) return null;   // no ratio of gradients: no score",
        "const k = nearestLeaving(f.ratio, p.q, p.r, 2);   // the whole number of times with your remainder (at least 2 either way)",
        "const main = Q.neg(Q.abs(Q.sub(f.ratio, k)));",
      ],
      py: [
        "if f.ratio is None:   # no ratio of gradients: no score",
        "    return None",
        "k = nearest_leaving(f.ratio, p[\"q\"], p[\"r\"], 2)   # the whole number of times with your remainder (at least 2 either way)",
        "main = -abs(f.ratio - k)",
      ],
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
    tryThis: "change QUOTES = 16 to 6: fewer prices asked, but it may miss a cheaper plan.", far: 3, quotes: 16,
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
    "  const tries = pairSteps(L, FAR, KINDS);   // [plan, lines after]: moves tried in the agent's own head",
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
    "    tries = pair_steps(L, FAR, KINDS)   # (plan, lines after): moves tried in the agent's own head",
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
