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

export type AgentKind = "example" | "simple" | "thorough" | "bold";
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
];

function lensesFor(kind: AgentKind, e: FamilyEntry, tieBreaker: string | null): LensId[] {
  if (kind === "example") return [...e.tieBreakers[tieBreaker!]!.lenses];
  if (kind === "simple") return [...(e.simple ?? ["shift", "tilt"])];
  if (kind === "bold") return ["shift", "tilt"];
  const params = new Set(familyOf(e.family).params.map(p => p.name));
  return (Object.keys(LENSES) as LensId[]).filter(id => { const l: Lens = LENSES[id]; return !l.needs || params.has(l.needs); });
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
    for (const l of f.tieBreakers) {
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
    "",
    "function agent(offer) {",
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
    "  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip",
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
    for (const l of f.tieBreakers) {
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
    "",
    "",
    "def agent(offer):",
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
    "    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip",
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
  const rule = tb ? `Main part: ${f.main.title}. Tie-breaker: ${tb.title}.` : `Main part: ${f.main.title}. Tie-breaker: whichever you were dealt (${f.tieBreakers.map(t => t.title).join("; ")}).`;
  const header = [`${f.title} · ${meta.title}`, rule, ...HOW, `Try this: ${meta.tryThis}`];
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
  const e = CATALOGUE.find(x => x.family === family);
  return e?.tieBreakers[tieBreaker] ? render("example", family, tieBreaker, language) : null;
}

/** The Simple, Thorough and Bold starters for a family, in one language. */
export function startersFor(family: string, language: ShippedLanguage): ShippedAgent[] {
  return (["simple", "thorough", "bold"] as const).map(k => render(k, family, null, language));
}

/** Every shipped agent: per family, each tie-breaker's example and the three starters, in both languages. */
export function shippedAgents(): ShippedAgent[] {
  return CATALOGUE.flatMap(e => LANGUAGES.flatMap(language => [
    ...Object.keys(e.tieBreakers).map(tb => render("example", e.family, tb, language)),
    ...startersFor(e.family, language),
  ]));
}

/** Where a shipped agent's rendered copy is committed (for reading and review): agents/<family>/<name>.<ext>. */
export function shippedPath(a: ShippedAgent): string {
  const name = a.kind === "example" ? `example-${a.tieBreaker}` : a.kind;
  return `agents/${a.family}/${name}.${a.language === "python" ? "py" : "ts"}`;
}

/**
 * Just the `score` function of a shipped agent (with a `tie` parameter when tieBreaker is null), for tests that
 * check an agent's own idea of the score against the engine's.
 */
export function scoreSource(family: string, tieBreaker: string | null, language: ShippedLanguage): string {
  const e = entryOf(family);
  return (language === "typescript" ? scoreTs(e, tieBreaker) : scorePy(e, tieBreaker)).join("\n") + "\n";
}

/** Starting energy of the beginner economy (v2-economy's Lines · beginner); every shipped agent fits. */
export const BEGINNER_STARTING_ENERGY = LINES_BEGINNER_ECONOMY.startingEnergy;
