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
import { LINES_BEGINNER_ECONOMY } from "@workspace/v2-economy";
import { lineType } from "@workspace/v2-linear";
import type { Language } from "@workspace/v2-sandbox";
import { CATALOGUE, LENSES, type FamilyEntry, type Lens, type LensId } from "./catalogue.ts";
import { gridExampleFor, gridScoreSource, gridShippedAgents, gridStartersFor, isGridFamily, isGridTypeFamily } from "./grid-starters.ts";

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
    title: "Simple", summary: "Moves the line up, down, steeper or flatter by a little, and pays for the cheapest of the best.",
    tryThis: "add the seq.step line from the Thorough starter: a third way to change the line.", far: 3, quotes: 8,
  },
  thorough: {
    title: "Thorough", summary: "Tries every way it knows to change the line, prices more plans, and pays for the cheapest of the best.",
    tryThis: "change QUOTES = 20 to 6: fewer prices asked, but it may miss a cheaper plan.", far: 5, quotes: 20,
  },
  bold: {
    title: "Bold", summary: "Tries two changes at once and big jumps, so it gets there in fewer, dearer moves.",
    tryThis: "change FAR = 6 to 3: smaller jumps, cheaper moves.", far: 6, quotes: 20,
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
    "  if (!plans.length) return null;",
    "  const plan = cheapest(offer, plans.slice(0, QUOTES));   // the cheapest of the best",
    "  if (!plan || price(offer, plan) > energy(offer) * SPEND) return null;   // too dear: keep the energy for more turns",
    "  return plan;",
  ],
  py: [
    "    if not plans:",
    "        return None",
    "    plan = cheapest(offer, plans[:QUOTES])   # the cheapest of the best",
    "    if plan is None or price(offer, plan) > energy(offer) * SPEND:   # too dear: keep the energy for more turns",
    "        return None",
    "    return plan",
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
  "What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs",
  "no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.",
  "Your points on a line are your rarity times the others' rarity, so a tug-of-war (another player pulling the line",
  "back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal",
  "with that player and change the agent to keep it. It never spends more than a quarter of its energy on one move.",
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
  return (Object.keys(LENSES) as LensId[]).filter(id => { const l: Lens = LENSES[id]; return !l.only || l.only.includes(e.family); });
}

// ---------------------------------------------------------------- TypeScript

function scoreTs(e: FamilyEntry, tieBreaker: string | null): string[] {
  const f = familyOf(e.family);
  const out = [
    "// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.",
    `function score(m, c, p${tieBreaker === null ? ", tie" : ""}) {`,
    ...e.main.ts.map(l => `  ${l}`),
  ];
  if (tieBreaker !== null) {
    const tb = e.tieBreakers[tieBreaker]!;
    out.push(...(tb.pre?.ts ?? []).map(l => `  ${l}`), `  return [main, ${tb.ts}];   // main: ${e.mainSays}; tie-breaker: ${tb.says}`);
  } else {
    out.push(`  // main: ${e.mainSays}`);
    for (const l of f.tieBreakers.filter(t => e.tieBreakers[t.id])) {   // a tie-breaker not yet described scores the main part alone
      const tb = e.tieBreakers[l.id]!;
      if (tb.pre) out.push(`  if (tie === ${JSON.stringify(l.id)}) {   // ${tb.says}`, ...tb.pre.ts.map(x => `    ${x}`), `    return [main, ${tb.ts}];`, "  }");
      else out.push(`  if (tie === ${JSON.stringify(l.id)}) return [main, ${tb.ts}];   // ${tb.says}`);
    }
    out.push("  return [main];");
  }
  out.push("}");
  return out;
}

function agentTs(kind: AgentKind, e: FamilyEntry, tieBreaker: string | null, far: number, quotes: number): string[] {
  const args = kind === "example" ? "p" : "p, tie";
  const out = [
    `const FAR = ${far};      // how far one change may go`,
    `const QUOTES = ${quotes};  // at most this many plans are priced (each price is a host call)`,
    ...(kind === "naive" ? [] : [
      "const SPEND = 0.25;    // never spend more than a quarter of your energy on one move",
    ]),
    "",
    "function agent(offer) {",
    ...(kind === "naive" ? [] : [
      "  // A tug-of-war (another player taking back your gains on this line, 3 times lately) burns energy on both",
      "  // sides: tell your owner, who can make a deal. (Leaving the line instead gives it away: try it and compare.)",
      "  contested(offer, 3);",
    ]),
    "  const v = look(offer, \"si\");      // the line as y = mx + c",
    "  const rule = goal(offer);         // your rule (free)",
    `  const m = v.m, c = v.c, p = rule.params${kind === "example" ? "" : ", tie = rule.tieBreaker"};`,
    "  if (!Q.isQ(m)) return null;       // a vertical line has no y = mx + c: skip",
    "  const tries = [];                 // [plan, m after, c after]: changes tried in the agent's own head",
    "  for (let k = -FAR; k <= FAR; k++) {",
    "    if (k === 0) continue;",
  ];
  if (kind === "bold") {
    out.push(
      "    tries.push([move(\"si.shift\", { k }), m, Q.add(c, k)]);     // move the line up or down",
      "    tries.push([move(\"si.tilt\", { k }), Q.add(m, k), c]);      // make it steeper or flatter",
      "    for (let j = -FAR; j <= FAR; j++) {                          // both at once",
      "      if (j !== 0) tries.push([[move(\"si.shift\", { k }), move(\"si.tilt\", { k: j })], Q.add(m, j), Q.add(c, k)]);",
      "    }",
    );
  } else {
    for (const id of lensesFor(kind, e, tieBreaker)) {
      const l = LENSES[id];
      if ("pre" in l && l.pre) out.push(`    ${l.pre.ts}`);
      out.push(`    tries.push(${l.ts});   // ${l.comment}`);
    }
  }
  out.push(
    "  }",
    `  let top = score(m, c, ${args}), plans = [];`,
    "  for (const [plan, m2, c2] of tries) {",
    `    const s = score(m2, c2, ${args});`,
    "    if (better(s, top)) { top = s; plans = [plan]; }               // a new best",
    "    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides",
    "  }",
    ...(kind === "naive" ? ["  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip"] : POINTS.ts),
    "}",
  );
  return out;
}

// ---------------------------------------------------------------- Python

function scorePy(e: FamilyEntry, tieBreaker: string | null): string[] {
  const f = familyOf(e.family);
  const out = [
    `def score(m, c, p${tieBreaker === null ? ", tie" : ""}):`,
    "    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.",
    ...e.main.py.map(l => `    ${l}`),
  ];
  if (tieBreaker !== null) {
    const tb = e.tieBreakers[tieBreaker]!;
    out.push(...(tb.pre?.py ?? []).map(l => `    ${l}`), `    return [main, ${tb.py}]   # main: ${e.mainSays}; tie-breaker: ${tb.says}`);
  } else {
    out.push(`    # main: ${e.mainSays}`);
    for (const l of f.tieBreakers.filter(t => e.tieBreakers[t.id])) {
      const tb = e.tieBreakers[l.id]!;
      out.push(`    if tie == ${JSON.stringify(l.id)}:   # ${tb.says}`, ...(tb.pre?.py ?? []).map(x => `        ${x}`), `        return [main, ${tb.py}]`);
    }
    out.push("    return [main]");
  }
  return out;
}

function agentPy(kind: AgentKind, e: FamilyEntry, tieBreaker: string | null, far: number, quotes: number): string[] {
  const args = kind === "example" ? "p" : "p, tie";
  const out = [
    `FAR = ${far}      # how far one change may go`,
    `QUOTES = ${quotes}  # at most this many plans are priced (each price is a host call)`,
    ...(kind === "naive" ? [] : [
      "SPEND = 0.25    # never spend more than a quarter of your energy on one move",
    ]),
    "",
    "",
    "def agent(offer):",
    ...(kind === "naive" ? [] : [
      "    # A tug-of-war (another player taking back your gains on this line, 3 times lately) burns energy on both",
      "    # sides: tell your owner, who can make a deal. (Leaving the line instead gives it away: try it and compare.)",
      "    contested(offer, 3)",
    ]),
    "    v = look(offer, \"si\")      # the line as y = mx + c",
    "    rule = goal(offer)         # your rule (free)",
    kind === "example" ? "    m, c, p = v.m, v.c, rule.params" : "    m, c, p, tie = v.m, v.c, rule.params, rule.tie_breaker",
    "    if m == None:              # a vertical line has no y = mx + c: skip",
    "        return None",
    "    tries = []                 # (plan, m after, c after): changes tried in the agent's own head",
    "    for k in range(-FAR, FAR + 1):",
    "        if k == 0:",
    "            continue",
  ];
  if (kind === "bold") {
    out.push(
      "        tries.append((move(\"si.shift\", k=k), m, c + k))     # move the line up or down",
      "        tries.append((move(\"si.tilt\", k=k), m + k, c))      # make it steeper or flatter",
      "        for j in range(-FAR, FAR + 1):                         # both at once",
      "            if j != 0:",
      "                tries.append(([move(\"si.shift\", k=k), move(\"si.tilt\", k=j)], m + j, c + k))",
    );
  } else {
    for (const id of lensesFor(kind, e, tieBreaker)) {
      const l = LENSES[id];
      if ("pre" in l && l.pre) out.push(`        ${l.pre.py}`);
      out.push(`        tries.append(${l.py})   # ${l.comment}`);
    }
  }
  out.push(
    `    top, plans = score(m, c, ${args}), []`,
    "    for plan, m2, c2 in tries:",
    `        s = score(m2, c2, ${args})`,
    "        if better(s, top):",
    "            top, plans = s, [plan]         # a new best",
    "        elif plans and not better(top, s):",
    "            plans.append(plan)             # as good as the best: the price decides",
    ...(kind === "naive" ? ["    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip"] : POINTS.py),
  );
  return out;
}

// ---------------------------------------------------------------- assembly

function render(kind: AgentKind, familyId: string, tieBreaker: string | null, language: ShippedLanguage): ShippedAgent {
  const e = entryOf(familyId), f = familyOf(familyId);
  const tb = tieBreaker === null ? null : f.tieBreakers.find(t => t.id === tieBreaker);
  if (tieBreaker !== null && (!tb || !e.tieBreakers[tieBreaker])) throw new Error(`${familyId} has no tie-breaker ${tieBreaker} to write an example for`);
  const meta = kind === "example"
    ? { title: `Example: ${tb!.title}`, summary: `Gets the main part right, then works on the tie-breaker (${tb!.title}).`, tryThis: e.tieBreakers[tieBreaker!]!.tryThis, far: e.tieBreakers[tieBreaker!]!.steps, quotes: 8 }
    : KINDS[kind];
  const rule = tb ? `Main part: ${f.main.title}. Tie-breaker: ${tb.title}.` : `Main part: ${f.main.title}. Tie-breaker: whichever you were dealt (${f.tieBreakers.filter(t => e.tieBreakers[t.id]).map(t => t.title).join("; ")}).`;
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
export function exampleFor(family: string, tieBreaker: string, language: ShippedLanguage): ShippedAgent | null {
  if (isGridTypeFamily(family)) return gridExampleFor(family, tieBreaker, language);
  const e = CATALOGUE.find(x => x.family === family);
  return e?.tieBreakers[tieBreaker] ? render("example", family, tieBreaker, language) : null;
}

/** The Simple, Thorough and Bold starters for a family, then Naive (a teaching example, never a default), in one language. */
export function startersFor(family: string, language: ShippedLanguage, tieBreaker?: string | null): ShippedAgent[] {
  if (isGridTypeFamily(family)) return gridStartersFor(family, language, tieBreaker);   // grids: written for the dealt tie-breaker (lines read it themselves)
  return (["simple", "thorough", "bold", "naive"] as const).map(k => render(k, family, null, language));
}

/** Every shipped agent: per family, each tie-breaker's example and the four starters, in both languages; lines, then grids. */
export function shippedAgents(): ShippedAgent[] {
  // Only what v2-linear still deals: a catalogue entry for a family or tie-breaker it dropped is skipped (stale()).
  return CATALOGUE.filter(e => lineType.families.some(f => f.id === e.family)).flatMap(e => LANGUAGES.flatMap(language => [
    ...Object.keys(e.tieBreakers).filter(tb => familyOf(e.family).tieBreakers.some(t => t.id === tb)).map(tb => render("example", e.family, tb, language)),
    ...startersFor(e.family, language),
  ])).concat(gridShippedAgents());
}

/**
 * Does a family of any object type have shipped agents (an example per tie-breaker and the starters)? The deal should
 * deal only families that do (artifacts/engine/convex/v2/deal.ts still checks the line-only CATALOGUE), so a player
 * can always summon one.
 */
export function hasStarters(family: string): boolean {
  return isGridFamily(family) || (CATALOGUE.some(e => e.family === family) && lineType.families.some(f => f.id === family));
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
  const e = entryOf(family);
  return (language === "typescript" ? scoreTs(e, tieBreaker) : scorePy(e, tieBreaker)).join("\n") + "\n";
}

/** Starting energy of the beginner economy (v2-economy's Lines · beginner; grids have none of their own yet); every shipped agent fits. */
export const BEGINNER_STARTING_ENERGY = LINES_BEGINNER_ECONOMY.startingEnergy;

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
