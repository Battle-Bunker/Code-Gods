/**
 * The agents W2 ships, generated from one description (catalogue.ts) in both languages:
 *
 *  - an EXAMPLE for every family and each of its tie-breakers: what the forge opens with for a player's own dealt
 *    rule, short, commented in plain words, with the moves that can raise that tie-breaker;
 *  - three STARTERS per family (ux-lessons §3.4: "Other starting points"), for whichever tie-breaker is dealt:
 *    Simple (two ways to change the line, small steps), Thorough (every way that keeps a gradient, more plans
 *    priced), Bold (two changes at once, big jumps).
 *
 * Every program has exactly one "Try this:" comment (ux-lessons §3.1). They share one skeleton: read the line once
 * as y = mx + c, try changes in the agent's own head (thinking costs no energy, only time), keep the plans that make
 * the line best for the rule, and pay for the cheapest of them.
 */
import { GRIDS_BEGINNER_ECONOMY, LINES_BEGINNER_ECONOMY } from "@workspace/v2-economy";
import { lineType } from "@workspace/v2-linear";
import type { Language } from "@workspace/v2-sandbox";
import { CATALOGUE, LENSES, type FamilyEntry, type Lens, type LensId } from "./catalogue.ts";
import { gridExampleFor, gridScoreSource, gridShippedAgents, gridStartersFor, isGridFamily, isGridTypeFamily } from "./grid-starters.ts";
import { boardExampleFor, boardScoreSource, boardShippedAgents, boardStartersFor, isBoardFamily, isBoardTypeFamily } from "./board-starters.ts";

export type AgentKind = "example" | "simple" | "thorough" | "bold" | "naive";
export type ShippedLanguage = Extract<Language, "typescript" | "python">;

export interface ShippedAgent {
  readonly family: string;
  readonly kind: AgentKind;
  /** The tie-breaker an example is for; null for a starter (it reads the dealt one). */
  readonly tieBreaker: string | null;
  readonly language: ShippedLanguage;
  /** "Simple", "Thorough", "Bold", or "Example: <tie-breaker title>". */
  readonly title: string;
  /** One sentence for the forge's list. */
  readonly summary: string;
  readonly source: string;
}

const KINDS: Record<Exclude<AgentKind, "example">, { title: string; summary: string; tryThis: string; far: number; quotes: number }> = {
  simple: {
    title: "Simple", summary: "Moves the line up, down, steeper or flatter by a little: the step that raises your points most.",
    tryThis: "add the seq.step line from the Thorough starter: a third way to change the line.", far: 2, quotes: 8,
  },
  thorough: {
    title: "Thorough", summary: "Tries every way it knows to change the line and weighs more steps: the one that raises your points most. When no single step helps, it looks two steps ahead (a few more small reads on that act) and takes the first.",
    tryThis: "change QUOTES = 20 to 6: fewer prices asked, but it may miss a cheaper plan.", far: 3, quotes: 20,
  },
  bold: {
    title: "Bold", summary: "Tries two changes at once and longer steps, so it climbs in fewer, dearer moves (a step of n costs more than n steps of 1).",
    tryThis: "change FAR = 4 to 2: shorter steps, cheaper moves.", far: 4, quotes: 20,
  },
  naive: {
    title: "Naive (for learning)",
    summary: "Chases your rule on every line it is offered, whatever the price, and keeps fighting over lines another player keeps pulling back. Compare it with Simple.",
    tryThis: "summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.", far: 3, quotes: 8,
  },
};

/** The lines every points-aware agent ends with, in plain words (TypeScript, then Python). */
const POINTS = {
  ts: [
    "  // A promise: on these lines, only steps that leave the other players at least as well off.",
    "  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));",
  ],
  py: [
    "    # A promise: on these lines, only steps that leave the other players at least as well off.",
    "    if offer.object in PROTECT:",
    "        options = [(plan, s) for plan, s in options if fair(offer, plan)]",
  ],
};

const familyOf = (id: string) => {
  const f = lineType.families.find(x => x.id === id);
  if (!f) throw new Error(`v2-linear has no family ${id}`);
  return f;
};
const entryOf = (id: string): FamilyEntry => {
  const e = CATALOGUE.find(x => x.family === id);
  if (!e) throw new Error(`no agents are described for ${id}`);
  return e;
};

const HOW = [
  "What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs",
  "no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times",
  "the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line",
  "back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal",
  "with that player and put the line in LEAVE to keep it.",
  "Changing it later costs only what you change. To summon another agent, first move power from your agents to your",
  "own store (energy moves with it), pay, then share the power out again.",
];
const HOW_NAIVE = [
  "What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your",
  "rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps",
  "fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.",
  "It is here to learn from; the other starters fix this.",
];

function lensesFor(kind: AgentKind, e: FamilyEntry, tieBreaker: string | null): LensId[] {
  if (kind === "example") return [...e.tieBreakers[tieBreaker!]!.lenses];
  if (kind === "simple" || kind === "naive") return [...(e.simple ?? ["shift", "tilt"])];
  if (kind === "bold") return ["shift", "tilt"];
  if (e.thorough) return [...e.thorough];
  return (Object.keys(LENSES) as LensId[]).filter(id => { const l: Lens = LENSES[id]; return !l.only || l.only.includes(e.family); });
}

/** The tie-breaker a vertical line scores: the expression for the ones the rule reads there, else null (the worst). */
function verticalTie(e: FamilyEntry, tieBreaker: string | null, language: ShippedLanguage): string {
  const ts = language === "typescript", none = ts ? "null" : "None";
  const defined = (e.vertical?.defined ?? []).filter(id => e.tieBreakers[id]);
  for (const id of defined) if (e.tieBreakers[id]!.pre) throw new Error(`${e.family}/${id}: a vertical tie-breaker needs no pre lines`);
  const expr = (id: string) => (ts ? e.tieBreakers[id]!.ts : e.tieBreakers[id]!.py);
  if (tieBreaker !== null) return defined.includes(tieBreaker) ? expr(tieBreaker) : none;
  return defined.reduceRight((rest, id) => (ts ? `t === ${JSON.stringify(id)} ? (${expr(id)}) : ${rest}` : `(${expr(id)}) if t == ${JSON.stringify(id)} else ${rest}`), none);
}

/** A tie-breaker's pre line inside tier(t): an early "return [main, x]" (written for a whole score) returns x alone. */
const inTier = (line: string): string => line.replace(/return \[main, (.*?)\](;?)/, "return $1$2");

// ---------------------------------------------------------------- TypeScript

function scoreTs(e: FamilyEntry, tieBreaker: string | null): string[] {
  const f = familyOf(e.family);
  const out = [
    ...(e.helpers ? [...e.helpers.ts, ""] : []),
    "// How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, null is no score.",
    `function score(m, c, p${tieBreaker === null ? ", tie" : ""}) {`,
    ...(e.vertical ? [
      "  if (m === null) {               // the vertical line x = c",
      ...e.vertical.main.ts.map(l => `    ${l}`),
      tieBreaker !== null ? `    return [main, ${verticalTie(e, tieBreaker, "typescript")}];`
        : `    return [main, ...(tie ? tie.split(">") : []).map(t => ${verticalTie(e, tieBreaker, "typescript")})];`,
      "  }",
    ] : []),
    ...e.main.ts.map(l => `  ${l}`),
  ];
  if (tieBreaker !== null) {
    const tb = e.tieBreakers[tieBreaker]!;
    out.push(...(tb.pre?.ts ?? []).map(l => `  ${l}`), `  return [main, ${tb.ts}];   // main: ${e.mainSays}; secondary: ${tb.says}`);
  } else {
    out.push(`  // main: ${e.mainSays}`);
    // Each dealt tie-breaker in order ("a>b": a, then b; any depth); one not described here ranks last (null).
    out.push(`  return [main, ...(tie ? tie.split(">") : []).map(t => {   // each secondary, in order`);
    for (const l of f.tieBreakers.filter(t => e.tieBreakers[t.id])) {
      const tb = e.tieBreakers[l.id]!;
      if (tb.pre) out.push(`    if (t === ${JSON.stringify(l.id)}) {   // ${tb.says}`, ...tb.pre.ts.map(x => `      ${inTier(x)}`), `      return ${tb.ts};`, "    }");
      else out.push(`    if (t === ${JSON.stringify(l.id)}) return ${tb.ts};   // ${tb.says}`);
    }
    out.push("    return null;", "  })];");
  }
  out.push("}");
  return out;
}

/**
 * Every line starter is one simple climber (owner, 17 Nov): it reads the line as y = mx + c, tries whole-number steps on
 * the gradient-and-intercept lens in its own head (lensSteps: add ±1..FAR to a top or bottom, double or halve, negate,
 * round, swap), and takes the one that raises its points most for its price. On a vertical line it tries the
 * abc lens's step that tips it. The kinds differ only in how far a step may go and how many plans they price.
 */
function agentTs(kind: AgentKind, e: FamilyEntry, tieBreaker: string | null, far: number, quotes: number): string[] {
  void e; void tieBreaker;
  const args = kind === "example" ? "p" : "p, tie";
  return [
    `const FAR = ${far};      // how far one change may go`,
    `const QUOTES = ${quotes};  // at most this many plans are priced (each price is a host call)`,
    ...(kind === "naive" ? [] : [
      "const LEAVE = [];      // lines your agent skips, e.g. [19] or [4, 9]: others may still move them",
      "const PROTECT = [];    // lines where you promised not to lower the others, e.g. [7]: only moves that keep them as well off",
    ]),
    "",
    "function agent(offer) {",
    ...(kind === "naive" ? [] : [
      "  if (LEAVE.includes(offer.object)) return null;   // a deal: leave this line alone",
      "  if (saving(offer)) return null;   // under 10 s of your income in hand: save up for a move",
      "  // A tug-of-war (another player taking back your gains on this line, 3 times lately): tell your owner.",
      "  contested(offer, 3);",
    ]),
    "  const v = look(offer, \"si\");      // the line as y = mx + c",
    "  const rule = goal(offer);         // your rule (free)",
    `  const m = v.m, c = v.c, p = rule.params${kind === "example" ? "" : ", tie = rule.tieBreaker"};`,
    "  // [plan, m after, c after]: whole-number steps on one lens, tried in the agent's own head",
    "  const tries = lensSteps(m, c, FAR);",
    `  let options = tries.map(([plan, m2, c2]) => [plan, score(m2, c2, ${args})]);   // each step and the score it reaches`,
    ...(kind === "naive" ? [] : POINTS.ts),
    "  // The step that raises your points most for its price, weighing the QUOTES best; or null.",
    `  return climb(offer, options, score(m, c, ${args}), QUOTES);`,
    "}",
  ];
}

/**
 * For a family that reads vertical lines: the steps from one (the tips into y = mx + c and the slides sideways) in a
 * branch beside the usual steps, so both end in the same points-aware climb (score(null, k) reads x = k).
 */
function verticalBranch(out: string[], language: ShippedLanguage): string[] {
  const ts = language === "typescript";
  const start = out.findIndex(l => l.startsWith(ts ? "  const tries = [];" : "    tries = []"));
  const end = out.findIndex(l => l.startsWith(ts ? "  tries.push(...rounding(" : "    tries += rounding("));
  if (start < 0 || end < start) throw new Error("verticalBranch: the steps were not found");
  const branch = ts ? [
    "  if (!Q.isQ(m)) {                  // a vertical line (x = k): tip it into y = mx + c, or slide it sideways",
    "    m = null, c = look(offer, \"crossing\").x0;   // where it stands: score(null, k) reads the line x = k",
    "    tries.push(...vertical(offer, FAR));   // its tips into y = mx + c and its slides sideways",
    "  } else {",
    ...out.slice(start + 1, end + 1).map(l => `  ${l}`),
    "  }",
  ] : [
    "    if m == None:              # a vertical line (x = k): tip it into y = mx + c, or slide it sideways",
    "        m, c = None, look(offer, \"crossing\").x0   # where it stands: score(None, k) reads the line x = k",
    "        tries += vertical(offer, FAR)   # its tips into y = mx + c and its slides sideways",
    "    else:",
    ...out.slice(start + 1, end + 1).map(l => `    ${l}`),
  ];
  return [...out.slice(0, start + 1), ...branch, ...out.slice(end + 1)];
}

// ---------------------------------------------------------------- Python

function scorePy(e: FamilyEntry, tieBreaker: string | null): string[] {
  const f = familyOf(e.family);
  const out = [
    ...(e.helpers ? [...e.helpers.py, ""] : []),
    `def score(m, c, p${tieBreaker === null ? ", tie" : ""}):`,
    "    # How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, None is no score.",
    ...(e.vertical ? [
      "    if m is None:              # the vertical line x = c",
      ...e.vertical.main.py.map(l => `        ${l}`),
      tieBreaker !== null ? `        return [main, ${verticalTie(e, tieBreaker, "python")}]`
        : `        return [main] + [${verticalTie(e, tieBreaker, "python")} for t in (tie.split(">") if tie else [])]`,
    ] : []),
    ...e.main.py.map(l => `    ${l}`),
  ];
  if (tieBreaker !== null) {
    const tb = e.tieBreakers[tieBreaker]!;
    out.push(...(tb.pre?.py ?? []).map(l => `    ${l}`), `    return [main, ${tb.py}]   # main: ${e.mainSays}; secondary: ${tb.says}`);
  } else {
    out.push(`    # main: ${e.mainSays}`);
    out.push("    def tier(t):   # each secondary, in order (None: ranks last)");
    for (const l of f.tieBreakers.filter(t => e.tieBreakers[t.id])) {
      const tb = e.tieBreakers[l.id]!;
      out.push(`        if t == ${JSON.stringify(l.id)}:   # ${tb.says}`, ...(tb.pre?.py ?? []).map(x => `            ${inTier(x)}`), `            return ${tb.py}`);
    }
    if (!f.tieBreakers.some(t => e.tieBreakers[t.id])) out.push("        return None   # none described (a family with no tie-breakers)");
    out.push(`    return [main] + [tier(t) for t in (tie.split(">") if tie else [])]`);
  }
  return out;
}

function agentPy(kind: AgentKind, e: FamilyEntry, tieBreaker: string | null, far: number, quotes: number): string[] {
  void e; void tieBreaker;
  const args = kind === "example" ? "p" : "p, tie";
  return [
    `FAR = ${far}      # how far one change may go`,
    `QUOTES = ${quotes}  # at most this many plans are priced (each price is a host call)`,
    ...(kind === "naive" ? [] : [
      "LEAVE = []      # lines your agent skips, e.g. [19] or [4, 9]: others may still move them",
      "PROTECT = []    # lines where you promised not to lower the others, e.g. [7]: only moves that keep them as well off",
    ]),
    "",
    "",
    "def agent(offer):",
    ...(kind === "naive" ? [] : [
      "    if offer.object in LEAVE:   # a deal: leave this line alone",
      "        return None",
      "    if saving(offer):   # under 10 s of your income in hand: save up for a move",
      "        return None",
      "    # A tug-of-war (another player taking back your gains on this line, 3 times lately): tell your owner.",
      "    contested(offer, 3)",
    ]),
    "    v = look(offer, \"si\")      # the line as y = mx + c",
    "    rule = goal(offer)         # your rule (free)",
    kind === "example" ? "    m, c, p = v.m, v.c, rule.params" : "    m, c, p, tie = v.m, v.c, rule.params, rule.tie_breaker",
    "    # (plan, m after, c after): whole-number steps on one lens, tried in the agent's own head",
    "    tries = lens_steps(m, c, FAR)",
    `    options = [(plan, score(m2, c2, ${args})) for plan, m2, c2 in tries]   # each step and the score it reaches`,
    ...(kind === "naive" ? [] : POINTS.py),
    "    # The step that raises your points most for its price, weighing the QUOTES best; or None.",
    `    return climb(offer, options, score(m, c, ${args}), QUOTES)`,
  ];
}

// ---------------------------------------------------------------- assembly

function render(kind: AgentKind, familyId: string, tieBreaker: string | null, language: ShippedLanguage): ShippedAgent {
  const e = entryOf(familyId), f = familyOf(familyId);
  const tb = tieBreaker === null ? null : f.tieBreakers.find(t => t.id === tieBreaker);
  if (tieBreaker !== null && (!tb || !e.tieBreakers[tieBreaker])) throw new Error(`${familyId} has no tie-breaker ${tieBreaker} to write an example for`);
  const meta = kind === "example"
    ? { title: `Example: ${tb!.title}`, summary: `Gets the main part right, then works on the secondary preference (${tb!.title}).`, tryThis: e.tieBreakers[tieBreaker!]!.tryThis, far: e.tieBreakers[tieBreaker!]!.steps, quotes: 8 }
    : KINDS[kind];
  const rule = tb ? `Main part: ${f.main.title}. Secondary preference: ${tb.title}.` : `Main part: ${f.main.title}. Secondary preference: whichever you were dealt (${f.tieBreakers.filter(t => e.tieBreakers[t.id]).map(t => t.title).join("; ")}).`;
  const header = [`${f.title} · ${meta.title}`, rule, ...(kind === "naive" ? HOW_NAIVE : HOW), `Try this: ${meta.tryThis}`];
  const ts = language === "typescript";
  const c = ts ? "//" : "#";
  const lines = [
    ...header.map(l => `${c} ${l}`),
    ...(ts ? [""] : ["", ""]),
    ...(ts ? scoreTs(e, tieBreaker) : scorePy(e, tieBreaker)),
    ...(ts ? [""] : ["", ""]),
    ...(ts ? agentTs(kind, e, tieBreaker, meta.far, meta.quotes) : agentPy(kind, e, tieBreaker, meta.far, meta.quotes)),
  ];
  return { family: familyId, kind, tieBreaker, language, title: meta.title, summary: meta.summary, source: lines.join("\n") + "\n" };
}

const LANGUAGES: readonly ShippedLanguage[] = ["typescript", "python"];

/** The example for a dealt rule, in one language (null: no example for that family or tie-breaker). */
export function exampleFor(family: string, tieBreaker: string | null, language: ShippedLanguage): ShippedAgent | null {
  if (tieBreaker === null) return null;
  if (isGridTypeFamily(family)) return gridExampleFor(family, tieBreaker, language);
  if (isBoardTypeFamily(family)) return boardExampleFor(family, tieBreaker, language);
  const e = CATALOGUE.find(x => x.family === family);
  return e?.tieBreakers[tieBreaker] ? render("example", family, tieBreaker, language) : null;
}

/** The Simple, Thorough and Bold starters for a family, then Naive (a teaching example, never a default), in one language. */
export function startersFor(family: string, language: ShippedLanguage, tieBreaker?: string | null): ShippedAgent[] {
  if (isGridTypeFamily(family)) return gridStartersFor(family, language, tieBreaker);   // grids: written for the dealt tie-breaker (lines read it themselves)
  if (isBoardTypeFamily(family)) return boardStartersFor(family, language, tieBreaker);   // coloured boards: likewise
  return (["simple", "thorough", "bold", "naive"] as const).map(k => render(k, family, null, language));
}

/** Every shipped agent: per family, each tie-breaker's example and the four starters, in both languages; lines, then grids, then pairs. */
export function shippedAgents(): ShippedAgent[] {
  // Only what v2-linear still deals: a catalogue entry for a family or tie-breaker it dropped is skipped (stale()).
  return CATALOGUE.filter(e => lineType.families.some(f => f.id === e.family)).flatMap(e => LANGUAGES.flatMap(language => [
    ...Object.keys(e.tieBreakers).filter(tb => familyOf(e.family).tieBreakers.some(t => t.id === tb)).map(tb => render("example", e.family, tb, language)),
    ...startersFor(e.family, language),
  ])).concat(gridShippedAgents(), boardShippedAgents());
}

/**
 * Does a family of any object type have shipped agents (an example per tie-breaker and the starters)? The deal should
 * deal only families that do (artifacts/engine/convex/v2/deal.ts still checks the line-only CATALOGUE), so a player
 * can always summon one.
 */
export function hasStarters(family: string): boolean {
  return isGridFamily(family) || isBoardFamily(family) || (CATALOGUE.some(e => e.family === family) && lineType.families.some(f => f.id === family));
}

/** Where a shipped agent's rendered copy is committed (for reading and review): agents/<family>/<name>.<ext>. */
export function shippedPath(a: ShippedAgent): string {
  const name = a.kind === "example" ? `example-${a.tieBreaker}` : a.tieBreaker ? `${a.kind}-${a.tieBreaker}` : a.kind;   // grid starters are written per tie-breaker
  return `agents/${a.family}/${name}.${a.language === "python" ? "py" : "ts"}`;
}

/**
 * Just the `score` function of a shipped agent (with a `tie` parameter when tieBreaker is null), for tests that
 * check an agent's own idea of the score against the engine's.
 */
export function scoreSource(family: string, tieBreaker: string | null, language: ShippedLanguage): string {
  if (isGridTypeFamily(family)) return gridScoreSource(family, tieBreaker, language);
  if (isBoardTypeFamily(family)) return boardScoreSource(family, tieBreaker, language);
  const e = entryOf(family);
  return (language === "typescript" ? scoreTs(e, tieBreaker) : scorePy(e, tieBreaker)).join("\n") + "\n";
}

/** Starting energy of the beginner economy (v2-economy's Lines · beginner; grids have none of their own yet); every shipped agent fits. */
export const BEGINNER_STARTING_ENERGY = LINES_BEGINNER_ECONOMY.startingEnergy;
/** Starting energy of the beginner grid economy (Grids · beginner); every shipped grid agent fits. */
export const GRID_BEGINNER_STARTING_ENERGY = GRIDS_BEGINNER_ECONOMY.startingEnergy;

/** Families and tie-breakers of the line type that have no shipped agents yet (each needs a catalogue entry). */
export function undescribed(): string[] {
  return lineType.families.flatMap(f => {
    const e = CATALOGUE.find(x => x.family === f.id);
    return e ? f.tieBreakers.filter(t => !e.tieBreakers[t.id]).map(t => `${f.id}/${t.id}`) : [f.id];
  });
}

/** Catalogue entries v2-linear no longer has (a family or tie-breaker it dropped or renamed). */
export function stale(): string[] {
  return CATALOGUE.flatMap(e => {
    const f = lineType.families.find(x => x.id === e.family);
    return f ? Object.keys(e.tieBreakers).filter(tb => !f.tieBreakers.some(t => t.id === tb)).map(tb => `${e.family}/${tb}`) : [e.family];
  });
}
