/**
 * The grid's shipped agents, generated from grid-catalogue.ts in both languages, beside the line's (starters.ts, which
 * hands grid families here):
 *
 *  - an EXAMPLE for every family and each of its tie-breakers: reads the board, tries the moves that can raise that
 *    tie-breaker in its own head, and pays for the cheapest change to the best board it found;
 *  - SIMPLE, THOROUGH and BOLD starters per family, for whichever tie-breaker is dealt, that play for the owner's
 *    POINTS: a board scores the owner's rarity there times the other players' rarity there added up (spec §8). Each
 *    finds the cheapest change to the best board it can reach; once its energy is below RESERVE it pays only when the
 *    change is worth at least a point per ⚡ ((the bits it gains + 1) × (the others' bits + 1), from `worth` and
 *    `rarity`), keeping its energy for boards where points count. Above RESERVE it climbs (energy left idle is lost
 *    to the store's cap, and a game where every agent waits for the others never starts). When the game does not say
 *    what boards are worth, it climbs its rule;
 *  - NAIVE (for learning): the example's search on the starters' moves, with none of the care.
 *
 * Every program has exactly one "Try this:" comment (ux-lessons §3.1).
 */
import { grid4, gridType } from "@workspace/v2-grid";
import type { RuleFamily } from "@workspace/v2-core";
import { GRID_CATALOGUE, GRID_LENSES, type GridFamilyEntry, type GridLensId } from "./grid-catalogue.ts";
import type { AgentKind, ShippedAgent, ShippedLanguage } from "./starters.ts";

const familyOf = (id: string): RuleFamily<unknown, unknown> => {
  const f = gridType.families.find(x => x.id === id);
  if (!f) throw new Error(`v2-grid has no family ${id}`);
  return f as RuleFamily<unknown, unknown>;
};
const entryOf = (id: string): GridFamilyEntry => {
  const e = GRID_CATALOGUE.find(x => x.family === id);
  if (!e) throw new Error(`no grid agents are described for ${id}`);
  return e;
};

/** Is this a grid family with shipped agents? */
export const isGridFamily = (id: string): boolean => GRID_CATALOGUE.some(e => e.family === id) && gridType.families.some(f => f.id === id);
/** Is this a family of the grid type (described or not)? Such a family never falls through to the line catalogue. */
export const isGridTypeFamily = (id: string): boolean => gridType.families.some(f => f.id === id);

type StarterKind = Exclude<AgentKind, "example">;
const KINDS: Record<StarterKind, { title: string; summary: string; tryThis: string; far: number; quotes: number }> = {
  simple: {
    title: "Simple", summary: "Changes one cell, or the board in your rule's own way, by a little; below its reserve, only changes worth a point per ⚡.",
    tryThis: "add the \"trade\" line from the Thorough starter: moving an amount from one cell to another keeps their total.", far: 3, quotes: 4,
  },
  thorough: {
    title: "Thorough", summary: "Tries every cell and every pair of cells (moving an amount from one to the other), prices more plans; below its reserve, only changes worth a point per ⚡.",
    tryThis: "change QUOTES = 6 to 2: fewer prices asked, but it may miss a cheaper plan.", far: 2, quotes: 6,
  },
  bold: {
    title: "Bold", summary: "Moves amounts of 2 or more between two cells, or changes the board in your rule's own way, so it gets there in fewer, dearer moves; below its reserve, only changes worth a point per ⚡.",
    tryThis: "change FAR = 3 to 2: jumps of 2 only, cheaper moves.", far: 3, quotes: 6,
  },
  naive: {
    title: "Naive (for learning)",
    summary: "Chases your rule on every board it is offered, whatever the price and whatever the others think of the board. Compare it with Simple.",
    tryThis: "summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.", far: 3, quotes: 8,
  },
};

const HOW_EXAMPLE = [
  "What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only",
  "time), keeps the ones that make the board best for your rule, and pays for the cheapest of them. A tug-of-war",
  "(another player pulling the board back again and again) scores nothing for either of you: it walks away from one",
  "and leaves you a note so you can talk to that player. It never spends more than a quarter of its energy on one move.",
];
const HOW_POINTS = [
  "What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only",
  "time) and finds the cheapest change to the best board for your rule. Your points on a board are your rarity there",
  "times the other players' rarity there added up, so once its energy is below RESERVE it only pays for a change worth",
  "a point per ⚡ (the bits it gains you times the others' bits), keeping the rest for boards where points count. It",
  "walks away from a tug-of-war (leaving you a note) and never spends more than a quarter of its energy on one move.",
];
const HOW_NAIVE = [
  "What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every",
  "board it is offered, whatever it costs and whatever the other players think of the board. It keeps fighting over a",
  "board another player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn",
  "from; the other starters fix this.",
];

function lensesFor(kind: AgentKind, e: GridFamilyEntry, tieBreaker: string | null): GridLensId[] {
  const ids: GridLensId[] = kind === "example" ? [...e.tieBreakers[tieBreaker!]!.lenses]
    : kind === "simple" || kind === "naive" ? ["add", ...e.simple]
    : kind === "bold" ? ["trade", ...e.simple]
    : ["add", "trade"];
  return [...new Set(ids)];
}

/** The main part as the score's first part: saturated at its top when a tie-breaker follows (v2-core scoreOf). */
function saturated(f: RuleFamily<unknown, unknown>, language: ShippedLanguage): string {
  // The top is written into the agent, so it must be the same for every dealable set of the rule's numbers.
  const tops = new Set(f.dealable(grid4).map(p => { const ts = f.main.thresholds(p, grid4); return Number(ts[ts.length - 1]!.n); }));
  if (tops.size !== 1) throw new Error(`${f.id}: the main part's top depends on the rule's numbers; the agents need it as a parameter`);
  const [top] = [...tops] as [number];
  if (f.main.sense === "min") return top === 0 ? "main" : language === "typescript" ? `Math.max(main, -${top})` : `max(main, -${top})`;
  return language === "typescript" ? `Math.min(main, ${top})` : `min(main, ${top})`;
}

// ---------------------------------------------------------------- TypeScript

function scoreTs(e: GridFamilyEntry, tieBreaker: string | null): string[] {
  const f = familyOf(e.family), main = saturated(f, "typescript");
  const out = [
    "// How good is the board b (its 16 numbers, row by row) for your rule? [main part, tie-breaker]: bigger is better.",
    `function score(b, p${tieBreaker === null ? ", tie" : ""}) {`,
    ...e.main.ts.map(l => `  ${l}`),
  ];
  const ret = (id: string) => { const tb = e.tieBreakers[id]!; return `[${main}, ${tb.ts}]`; };
  if (tieBreaker !== null) {
    const tb = e.tieBreakers[tieBreaker]!;
    out.push(...(tb.pre?.ts ?? []).map(l => `  ${l}`), `  return ${ret(tieBreaker)};   // main: ${e.mainSays}; tie-breaker: ${tb.says}`);
  } else {
    out.push(`  // main: ${e.mainSays}`);
    for (const t of f.tieBreakers.filter(x => e.tieBreakers[x.id])) {
      const tb = e.tieBreakers[t.id]!;
      if (tb.pre) out.push(`  if (tie === ${JSON.stringify(t.id)}) {   // ${tb.says}`, ...tb.pre.ts.map(x => `    ${x}`), `    return ${ret(t.id)};`, "  }");
      else out.push(`  if (tie === ${JSON.stringify(t.id)}) return ${ret(t.id)};   // ${tb.says}`);
    }
    out.push("  return [main];");
  }
  out.push("}");
  return out;
}

/** The tables the family's score and the agent's moves read. */
const needsOf = (e: GridFamilyEntry, lenses: readonly GridLensId[]) =>
  new Set([...(e.needs ?? []), ...lenses.flatMap(id => (GRID_LENSES[id] as { needs?: readonly string[] }).needs ?? [])]);

/**
 * Whether the agent defines `add(i, k)` (the move adding k to cell i): only when two or more of its moves use it, as a
 * helper used once costs more to summon than spelling the move out.
 */
const addHelper = (lenses: readonly GridLensId[]) =>
  lenses.filter(id => ((GRID_LENSES[id] as { needs?: readonly string[] }).needs ?? []).includes("add")).length >= 2;

/** A lens's code as the agent has it: `add(i, k)` spelled out as the move when the agent has no `add` helper. */
function snippet(code: string, lenses: readonly GridLensId[], language: ShippedLanguage): string {
  if (addHelper(lenses)) return code;
  return code.replace(/\badd\((i2?), (-?k)\)/g, (_m, i: string, k: string) =>
    language === "typescript" ? `move("cells.add", { cell: NAME[${i}], ${k === "k" ? "k" : `k: ${k}`} })` : `move("cells.add", cell=NAME[${i}], k=${k})`);
}

function tablesTs(e: GridFamilyEntry, lenses: readonly GridLensId[], edit = true): string[] {
  const needs = needsOf(e, lenses);
  const out: string[] = [];
  if (needs.has("lines")) out.push(
    "const LINE = [], LINES = [];   // rows then columns: their names, and their cells",
    "for (let i = 0; i < 4; i++) { LINE.push(\"row\" + i); LINES.push([4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 3]); }",
    "for (let i = 0; i < 4; i++) { LINE.push(\"col\" + i); LINES.push([i, i + 4, i + 8, i + 12]); }",
  );
  if (needs.has("boxes")) out.push("const BOXES = [0, 2, 8, 10].map(r => [r, r + 1, r + 4, r + 5]);   // the corner boxes' cells: top-left, top-right, bottom-left, bottom-right");
  if (edit) out.push(
    "",
    "// The board after adding f(0), f(1), ... to the cells listed; the board unchanged if a number would leave 0 ... 9",
    "// (such a move is not allowed, and an unchanged board is never better).",
    "function edit(b, cells, f) {",
    "  const out = b.slice();",
    "  for (let j = 0; j < cells.length; j++) out[cells[j]] += f(j);",
    "  return out.every(x => x >= 0 && x <= 9) ? out : b;",
    "}",
  );
  return out;
}

type Ending = "naive" | "climb" | "points";
const CLIMB_TS = (args: string, end: Ending) => [
  `  let top = score(b, ${args}), plans = [];`,
  "  for (const [plan, b2] of tries) {",
  `    const s = score(b2, ${args});`,
  "    if (better(s, top)) { top = s; plans = [plan]; }               // a new best",
  "    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides",
  "  }",
  ...(end === "naive" ? ["  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip"] : [
    "  const plan = cheapest(offer, plans.slice(0, QUOTES));   // the cheapest of the best",
    "  if (!plan) return null;           // nothing better (or nothing allowed): skip",
    "  const cost = price(offer, plan), e = energy(offer);",
    "  if (cost > e * SPEND) return null;   // too dear: keep the energy for more turns",
    ...(end === "points" ? [
      "  // Your points on a board are your rarity there times the other players' rarity there, added up. So what this",
      "  // change is worth is the bits it gains you (+1: a better board is a step towards the next rung) times the",
      "  // others' bits (+1: a board nobody else wants yet is worth a little). Below RESERVE ⚡ it only pays for a change",
      "  // worth at least 1 point per ⚡ (when the game does not say what boards are worth, worth is null: it pays).",
      "  const w = worth(offer);",
      "  if (w && e < RESERVE && (rarity(offer, top) - w.mine + 1) * (w.others + 1) < cost) return null;",
    ] : []),
    "  return plan;",
  ]),
];

function agentTs(kind: AgentKind, e: GridFamilyEntry, tieBreaker: string | null, far: number, quotes: number): string[] {
  const lenses = lensesFor(kind, e, tieBreaker), points = kind === "simple" || kind === "thorough" || kind === "bold";
  const out = [
    `const FAR = ${far};      // how far one change may go`,
    `const QUOTES = ${quotes};  // at most this many plans are priced (each price is a host call)`,
    ...(points ? ["const RESERVE = 300;  // below this much ⚡, only pay for changes that add points (see the end)"] : []),
    ...(kind === "naive" ? [] : ["const SPEND = 0.25;    // never spend more than a quarter of your energy on one move"]),
    ...tablesTs(e, lenses),
    "",
    "function agent(offer) {",
    ...(kind === "naive" ? [] : [
      "  // A tug-of-war (another player taking back your gains on this board, 3 times lately) only burns energy on",
      "  // both sides: leave the board, with a note telling your owner to talk to that player.",
      "  if (contested(offer, 3)) return null;",
    ]),
    "  const v = look(offer, \"cells\");   // the board",
    `  const { params: p${kind === "example" ? "" : ", tieBreaker: tie"} } = goal(offer);   // your rule's numbers${kind === "example" ? "" : " and tie-breaker"} (free)`,
    "  const NAME = Object.keys(v).slice(0, 16);   // the cells' names, r0c0 ... r3c3, row by row",
    "  const b = NAME.map(n => Q.toNumber(v[n]));   // their 16 numbers",
    ...(addHelper(lenses) ? ["  const add = (i, k) => move(\"cells.add\", { cell: NAME[i], k });   // the move that adds k to cell i"] : []),
    "  const tries = [];                 // [plan, board after]: changes tried in the agent's own head",
    "  for (let k = -FAR; k <= FAR; k++) {",
    kind === "bold" ? "    if (k > -2 && k < 2) continue;   // only jumps of 2 or more" : "    if (k === 0) continue;",
  ];
  for (const id of lenses.filter(id => GRID_LENSES[id].k)) out.push(`    ${snippet(GRID_LENSES[id].ts, lenses, "typescript")}   // ${GRID_LENSES[id].comment}`);
  out.push("  }");
  for (const id of lenses.filter(id => !GRID_LENSES[id].k)) out.push(`  ${snippet(GRID_LENSES[id].ts, lenses, "typescript")}   // ${GRID_LENSES[id].comment}`);
  out.push(...CLIMB_TS(kind === "example" ? "p" : "p, tie", kind === "naive" ? "naive" : points ? "points" : "climb"), "}");
  return out;
}

// ---------------------------------------------------------------- Python

function scorePy(e: GridFamilyEntry, tieBreaker: string | null): string[] {
  const f = familyOf(e.family), main = saturated(f, "python");
  const out = [
    `def score(b, p${tieBreaker === null ? ", tie" : ""}):`,
    "    # How good is the board b (its 16 numbers, row by row) for your rule? [main part, tie-breaker]: bigger is better.",
    ...e.main.py.map(l => `    ${l}`),
  ];
  if (tieBreaker !== null) {
    const tb = e.tieBreakers[tieBreaker]!;
    out.push(...(tb.pre?.py ?? []).map(l => `    ${l}`), `    return [${main}, ${tb.py}]   # main: ${e.mainSays}; tie-breaker: ${tb.says}`);
  } else {
    out.push(`    # main: ${e.mainSays}`);
    for (const t of f.tieBreakers.filter(x => e.tieBreakers[x.id])) {
      const tb = e.tieBreakers[t.id]!;
      out.push(`    if tie == ${JSON.stringify(t.id)}:   # ${tb.says}`, ...(tb.pre?.py ?? []).map(x => `        ${x}`), `        return [${main}, ${tb.py}]`);
    }
    out.push("    return [main]");
  }
  return out;
}

function tablesPy(e: GridFamilyEntry, lenses: readonly GridLensId[], edit = true): string[] {
  const needs = needsOf(e, lenses);
  const out: string[] = [];
  if (needs.has("lines")) out.push(
    "LINE = [\"row\" + str(i) for i in range(4)] + [\"col\" + str(i) for i in range(4)]   # rows then columns: their names",
    "LINES = [[4 * i + j for j in range(4)] for i in range(4)] + [[i + 4 * j for j in range(4)] for i in range(4)]   # and their cells",
  );
  if (needs.has("boxes")) out.push("BOXES = [[r, r + 1, r + 4, r + 5] for r in (0, 2, 8, 10)]   # the corner boxes' cells: top-left, top-right, bottom-left, bottom-right");
  if (edit) out.push(
    "", "",
    "def edit(b, cells, f):",
    "    # The board after adding f(0), f(1), ... to the cells listed; the board unchanged if a number would leave 0 ... 9",
    "    # (such a move is not allowed, and an unchanged board is never better).",
    "    out = list(b)",
    "    for j in range(len(cells)):",
    "        out[cells[j]] += f(j)",
    "    return out if all(0 <= x <= 9 for x in out) else b",
  );
  return out;
}

const CLIMB_PY = (args: string, end: Ending) => [
  `    top, plans = score(b, ${args}), []`,
  "    for plan, b2 in tries:",
  `        s = score(b2, ${args})`,
  "        if better(s, top):",
  "            top, plans = s, [plan]         # a new best",
  "        elif plans and not better(top, s):",
  "            plans.append(plan)             # as good as the best: the price decides",
  ...(end === "naive" ? ["    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip"] : [
    "    plan = cheapest(offer, plans[:QUOTES])   # the cheapest of the best",
    "    if plan is None:           # nothing better (or nothing allowed): skip",
    "        return None",
    "    cost, e = price(offer, plan), energy(offer)",
    "    if cost > e * SPEND:   # too dear: keep the energy for more turns",
    "        return None",
    ...(end === "points" ? [
      "    # Your points on a board are your rarity there times the other players' rarity there, added up. So what this",
      "    # change is worth is the bits it gains you (+1: a better board is a step towards the next rung) times the",
      "    # others' bits (+1: a board nobody else wants yet is worth a little). Below RESERVE ⚡ it only pays for a change",
      "    # worth at least 1 point per ⚡ (when the game does not say what boards are worth, worth is None: it pays).",
      "    w = worth(offer)",
      "    if w and e < RESERVE and (rarity(offer, top) - w.mine + 1) * (w.others + 1) < cost:",
      "        return None",
    ] : []),
    "    return plan",
  ]),
];

function agentPy(kind: AgentKind, e: GridFamilyEntry, tieBreaker: string | null, far: number, quotes: number): string[] {
  const lenses = lensesFor(kind, e, tieBreaker), points = kind === "simple" || kind === "thorough" || kind === "bold";
  const out = [
    `FAR = ${far}      # how far one change may go`,
    `QUOTES = ${quotes}  # at most this many plans are priced (each price is a host call)`,
    ...(points ? ["RESERVE = 300  # below this much ⚡, only pay for changes that add points (see the end)"] : []),
    ...(kind === "naive" ? [] : ["SPEND = 0.25    # never spend more than a quarter of your energy on one move"]),
    ...tablesPy(e, lenses),
    "",
    "",
    "def agent(offer):",
    ...(kind === "naive" ? [] : [
      "    # A tug-of-war (another player taking back your gains on this board, 3 times lately) only burns energy on",
      "    # both sides: leave the board, with a note telling your owner to talk to that player.",
      "    if contested(offer, 3):",
      "        return None",
    ]),
    "    v = look(offer, \"cells\")   # the board",
    "    rule = goal(offer)         # your rule (free)",
    kind === "example" ? "    p = rule.params" : "    p, tie = rule.params, rule.tie_breaker",
    "    NAME = list(v.keys())[:16]   # the cells' names, r0c0 ... r3c3, row by row",
    "    b = [int(v[n]) for n in NAME]   # their 16 numbers",
    ...(addHelper(lenses) ? ["    add = lambda i, k: move(\"cells.add\", cell=NAME[i], k=k)   # the move that adds k to cell i"] : []),
    "    tries = []                 # (plan, board after): changes tried in the agent's own head",
    "    for k in range(-FAR, FAR + 1):",
    ...(kind === "bold" ? ["        if -2 < k < 2:          # only jumps of 2 or more", "            continue"] : ["        if k == 0:", "            continue"]),
  ];
  const k = lenses.filter(id => GRID_LENSES[id].k), flat = lenses.filter(id => !GRID_LENSES[id].k);
  for (const id of k) { const l = { ...GRID_LENSES[id], py: GRID_LENSES[id].py.map(x => snippet(x, lenses, "python")) }; out.push(`        ${l.py[0]}   # ${l.comment}`, ...l.py.slice(1).map(x => `        ${x}`)); }
  for (const id of flat) { const l = { ...GRID_LENSES[id], py: GRID_LENSES[id].py.map(x => snippet(x, lenses, "python")) }; out.push(`    ${l.py[0]}   # ${l.comment}`, ...l.py.slice(1).map(x => `    ${x}`)); }
  out.push(...CLIMB_PY(kind === "example" ? "p" : "p, tie", kind === "naive" ? "naive" : points ? "points" : "climb"));
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

export function gridExampleFor(family: string, tieBreaker: string, language: ShippedLanguage): ShippedAgent | null {
  return isGridFamily(family) && entryOf(family).tieBreakers[tieBreaker] && familyOf(family).tieBreakers.some(t => t.id === tieBreaker)
    ? render("example", family, tieBreaker, language) : null;
}

export function gridStartersFor(family: string, language: ShippedLanguage): ShippedAgent[] {
  if (!isGridFamily(family)) return [];   // a grid family with no agents described yet (gridUndescribed())
  return (["simple", "thorough", "bold", "naive"] as const).map(k => render(k, family, null, language));
}

export function gridShippedAgents(): ShippedAgent[] {
  return GRID_CATALOGUE.filter(e => isGridFamily(e.family)).flatMap(e => (["typescript", "python"] as const).flatMap(language => [
    ...familyOf(e.family).tieBreakers.filter(t => e.tieBreakers[t.id]).map(t => render("example", e.family, t.id, language)),
    ...gridStartersFor(e.family, language),
  ]));
}

export function gridScoreSource(family: string, tieBreaker: string | null, language: ShippedLanguage): string {
  const e = entryOf(family), ts = language === "typescript";
  // The tables the score reads (BOXES, LINES), then the score.
  return [...(ts ? tablesTs(e, [], false) : tablesPy(e, [], false)), ...(ts ? scoreTs(e, tieBreaker) : scorePy(e, tieBreaker))].join("\n") + "\n";
}

/** Grid families and tie-breakers that have no shipped agents yet (each needs a GRID_CATALOGUE entry). */
export function gridUndescribed(): string[] {
  return gridType.families.flatMap(f => {
    const e = GRID_CATALOGUE.find(x => x.family === f.id);
    return e ? f.tieBreakers.filter(t => !e.tieBreakers[t.id]).map(t => `${f.id}/${t.id}`) : [f.id];
  });
}
