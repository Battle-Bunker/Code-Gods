/**
 * The grid's shipped agents, generated from grid-catalogue.ts in both languages, beside the line's (starters.ts, which
 * hands grid families here):
 *
 *  - an EXAMPLE for every family and each of its tie-breakers: reads the board, tries the moves that can raise that
 *    tie-breaker in its own head, and pays for the cheapest change to the best board it found;
 *  - SIMPLE, THOROUGH and BOLD starters per family, for whichever tie-breaker is dealt, that climb for the owner's
 *    POINTS (a board scores the owner's rarity there times the other players' rarity there added up, spec §8), with
 *    the line starters' policy (lib/v2-agents starters.ts): each act scores every step it tries and `climb` takes the
 *    one that most raises rarity × the others' rarity after it (weighing the QUOTES best for the owner's rule); on
 *    PROTECT boards only steps that keep the others as well off (`fair`). The owner: "hill climb a combined landscape
 *    that improves several rules at once";
 *  - NAIVE (for learning): the example's search on the starters' moves, with none of the care.
 *
 * Every program has exactly one "Try this:" comment (ux-lessons §3.1).
 */
import { gridType } from "@workspace/v2-grid";
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
    title: "Simple", summary: "Nudges the numbers a little at a time, taking the change that raises your points most: good for your rule and for the other players too.",
    tryThis: "add the \"trade\" line from the Thorough starter: moving an amount from one cell to another keeps their total.", far: 1, quotes: 4,
  },
  thorough: {
    title: "Thorough", summary: "Like Simple, but it also moves an amount from one number to another and compares more prices before it pays.",
    tryThis: "change QUOTES = 6 to 2: fewer prices asked, but it may miss a cheaper plan.", far: 1, quotes: 6,
  },
  bold: {
    title: "Bold", summary: "Makes changes of 2 at a time, so it gets there in fewer moves, each twice the price of a single step.",
    tryThis: "change FAR = 2 to 1: single steps, the same price per step, but more turns to get there.", far: 2, quotes: 6,
  },
  naive: {
    title: "Naive (for learning)",
    summary: "Chases your rule on every grid, whatever it costs and whatever the others want. It is here to learn from: compare it with Simple.",
    tryThis: "summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.", far: 1, quotes: 8,
  },
};

const HOW_EXAMPLE = [
  "What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only",
  "time), keeps the ones that make the board best for your rule, and pays for the cheapest of them. A tug-of-war",
  "(another player pulling the board back again and again) burns energy on both sides: when it finds one it leaves you",
  "a note, so you can make a deal with that player. Of the changes that are best for your rule, it takes the one that",
  "raises your points most (your rarity times the other players').",
];
const HOW_POINTS = [
  "What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only",
  "time) and takes the change that raises your points most. Your points on a board are your rarity there times the",
  "other players' rarity there added up, so a change that suits your rule but spoils the board for the others can",
  "lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.",
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
    : kind === "bold" ? ["trade", ...e.simple.filter(id => id !== "swap" && id !== "twin")]   // two cells at once already
    : ["add", "trade"];
  return [...new Set(ids)];
}

// ---------------------------------------------------------------- TypeScript

function scoreTs(e: GridFamilyEntry, tieBreaker: string | null): string[] {
  const f = familyOf(e.family), main = "main";
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
    "const LINE = [], LINES = [];   // the rows and columns: their names, and their cells",
    "for (let i = 0; i < 4; i++) { LINE.push(\"row\" + i, \"col\" + i); LINES.push([4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 3], [i, i + 4, i + 8, i + 12]); }",
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

type Ending = "naive" | "points";
const CLIMB_TS = (args: string, end: Ending) => end === "naive" ? [
  `  let top = score(b, ${args}), plans = [];`,
  "  for (const [plan, b2] of tries) {",
  `    const s = score(b2, ${args});`,
  "    if (better(s, top)) { top = s; plans = [plan]; }               // a new best",
  "    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides",
  "  }",
  "  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip",
] : [
  `  let options = tries.map(([plan, b2]) => [plan, score(b2, ${args})]);   // each step and the score it reaches`,
  "  // A promise: on these boards, only steps that leave the other players at least as well off.",
  "  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));",
  "  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.",
  `  return climb(offer, options, score(b, ${args}), QUOTES);`,
];

function agentTs(kind: AgentKind, e: GridFamilyEntry, tieBreaker: string | null, far: number, quotes: number): string[] {
  const lenses = lensesFor(kind, e, tieBreaker);
  const out = [
    `const FAR = ${far};      // how far one change may go`,
    `const QUOTES = ${quotes};  // at most this many plans are priced (each price is a host call)`,
    ...(kind === "naive" ? [] : [
      "const LEAVE = [];      // boards you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them",
      "const PROTECT = [];    // boards where you promised not to lower the others, e.g. [7]: only moves that keep them as well off",
    ]),
    ...tablesTs(e, lenses),
    "",
    "function agent(offer) {",
    ...(kind === "naive" ? [] : [
      "  if (LEAVE.includes(offer.object)) return null;   // a deal: leave this board alone",
      "  // A tug-of-war (another player taking back your gains on this board, 3 times lately) burns energy on both",
      "  // sides: tell your owner, who can make a deal. (Leaving the board instead gives it away: try it and compare.)",
      "  contested(offer, 3);",
    ]),
    "  const v = look(offer, \"cells\");   // the board",
    `  const { params: p${tieBreaker !== null ? "" : ", tieBreaker: tie"} } = goal(offer);   // your rule's numbers${tieBreaker !== null ? "" : " and tie-breaker"} (free)`,
    "  const NAME = Object.keys(v).slice(0, 16);   // the cells' names, r0c0 ... r3c3, row by row",
    "  const b = NAME.map(n => Q.toNumber(v[n]));   // their 16 numbers",
    ...(addHelper(lenses) ? ["  const add = (i, k) => move(\"cells.add\", { cell: NAME[i], k });   // the move that adds k to cell i"] : []),
    "  const tries = [];                 // [plan, board after]: changes tried in the agent's own head",
    "  for (let k = -FAR; k <= FAR; k++) {",
    kind === "bold" ? "    if (k * k < 4) continue;   // only steps of 2 (each costs two single steps)" : "    if (k === 0) continue;",
  ];
  for (const id of lenses.filter(id => GRID_LENSES[id].k)) out.push(`    ${snippet(GRID_LENSES[id].ts, lenses, "typescript")}   // ${GRID_LENSES[id].comment}`);
  out.push("  }");
  for (const id of lenses.filter(id => !GRID_LENSES[id].k)) out.push(`  ${snippet(GRID_LENSES[id].ts, lenses, "typescript")}   // ${GRID_LENSES[id].comment}`);
  out.push(...CLIMB_TS(tieBreaker !== null ? "p" : "p, tie", kind === "naive" ? "naive" : "points"), "}");
  return out;
}

// ---------------------------------------------------------------- Python

function scorePy(e: GridFamilyEntry, tieBreaker: string | null): string[] {
  const f = familyOf(e.family), main = "main";
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
    "LINE, LINES = [], []   # the rows and columns: their names, and their cells",
    "for i in range(4):",
    "    LINE += [\"row\" + str(i), \"col\" + str(i)]",
    "    LINES += [[4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 3], [i, i + 4, i + 8, i + 12]]",
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

const CLIMB_PY = (args: string, end: Ending) => end === "naive" ? [
  `    top, plans = score(b, ${args}), []`,
  "    for plan, b2 in tries:",
  `        s = score(b2, ${args})`,
  "        if better(s, top):",
  "            top, plans = s, [plan]         # a new best",
  "        elif plans and not better(top, s):",
  "            plans.append(plan)             # as good as the best: the price decides",
  "    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip",
] : [
  `    options = [(plan, score(b2, ${args})) for plan, b2 in tries]   # each step and the score it reaches`,
  "    # A promise: on these boards, only steps that leave the other players at least as well off.",
  "    if offer.object in PROTECT:",
  "        options = [(plan, s) for plan, s in options if fair(offer, plan)]",
  "    # The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.",
  `    return climb(offer, options, score(b, ${args}), QUOTES)`,
];

function agentPy(kind: AgentKind, e: GridFamilyEntry, tieBreaker: string | null, far: number, quotes: number): string[] {
  const lenses = lensesFor(kind, e, tieBreaker);
  const out = [
    `FAR = ${far}      # how far one change may go`,
    `QUOTES = ${quotes}  # at most this many plans are priced (each price is a host call)`,
    ...(kind === "naive" ? [] : [
      "LEAVE = []      # boards you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them",
      "PROTECT = []    # boards where you promised not to lower the others, e.g. [7]: only moves that keep them as well off",
    ]),
    ...tablesPy(e, lenses),
    "",
    "",
    "def agent(offer):",
    ...(kind === "naive" ? [] : [
      "    if offer.object in LEAVE:   # a deal: leave this board alone",
      "        return None",
      "    # A tug-of-war (another player taking back your gains on this board, 3 times lately) burns energy on both",
      "    # sides: tell your owner, who can make a deal. (Leaving the board instead gives it away: try it and compare.)",
      "    contested(offer, 3)",
    ]),
    "    v = look(offer, \"cells\")   # the board",
    "    rule = goal(offer)         # your rule (free)",
    tieBreaker !== null ? "    p = rule.params" : "    p, tie = rule.params, rule.tie_breaker",
    "    NAME = list(v.keys())[:16]   # the cells' names, r0c0 ... r3c3, row by row",
    "    b = [int(v[n]) for n in NAME]   # their 16 numbers",
    ...(addHelper(lenses) ? ["    add = lambda i, k: move(\"cells.add\", cell=NAME[i], k=k)   # the move that adds k to cell i"] : []),
    "    tries = []                 # (plan, board after): changes tried in the agent's own head",
    "    for k in range(-FAR, FAR + 1):",
    ...(kind === "bold" ? ["        if k * k < 4:          # only steps of 2 (each costs two single steps)", "            continue"] : ["        if k == 0:", "            continue"]),
  ];
  const k = lenses.filter(id => GRID_LENSES[id].k), flat = lenses.filter(id => !GRID_LENSES[id].k);
  for (const id of k) { const l = { ...GRID_LENSES[id], py: GRID_LENSES[id].py.map(x => snippet(x, lenses, "python")) }; out.push(`        ${l.py[0]}   # ${l.comment}`, ...l.py.slice(1).map(x => `        ${x}`)); }
  for (const id of flat) { const l = { ...GRID_LENSES[id], py: GRID_LENSES[id].py.map(x => snippet(x, lenses, "python")) }; out.push(`    ${l.py[0]}   # ${l.comment}`, ...l.py.slice(1).map(x => `    ${x}`)); }
  out.push(...CLIMB_PY(tieBreaker !== null ? "p" : "p, tie", kind === "naive" ? "naive" : "points"));
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

/**
 * The starters for a grid family. With the dealt tie-breaker (the shipped ones), each scores that tie-breaker only:
 * a board's scores take more code than a line's, and a starter scoring all three tie-breakers would cost more than
 * the starting energy to summon. Without one, the starters read the dealt tie-breaker themselves (all three scored;
 * dearer, and not shipped).
 */
export function gridStartersFor(family: string, language: ShippedLanguage, tieBreaker?: string | null): ShippedAgent[] {
  if (!isGridFamily(family)) return [];   // a grid family with no agents described yet (gridUndescribed())
  if (tieBreaker && !(entryOf(family).tieBreakers[tieBreaker] && familyOf(family).tieBreakers.some(t => t.id === tieBreaker))) throw new Error(`${family} has no tie-breaker ${tieBreaker} with shipped agents`);
  const tb = tieBreaker || null;
  return (["simple", "thorough", "bold", "naive"] as const).map(k => render(k, family, tb, language));
}

export function gridShippedAgents(): ShippedAgent[] {
  return GRID_CATALOGUE.filter(e => isGridFamily(e.family)).flatMap(e => (["typescript", "python"] as const).flatMap(language =>
    familyOf(e.family).tieBreakers.filter(t => e.tieBreakers[t.id]).flatMap(t => [
      render("example", e.family, t.id, language),
      ...gridStartersFor(e.family, language, t.id),
    ])));
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
