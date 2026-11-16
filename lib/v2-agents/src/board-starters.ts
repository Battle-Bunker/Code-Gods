/**
 * The shipped agents of the coloured boards (lib/v2-grid-boards: the old game's colour families, ported as v1), beside
 * the digit grid's (grid-starters.ts) and the pair's (pair-starters.ts), with the same policy: each act scores the steps
 * it tries in its own head and `climb` takes the one that most raises the owner's rarity × the others' (spec §8).
 *
 * An agent reads the board once (`look(offer, "cells")`) into B: its side n, its numbers v (a card's value, ace 1 …
 * king 13), its colours c (names: "red", …) and, on cards, its suits s. Its moves need no knowledge of the board's
 * palette: add k to one cell, swap two cells' colours, trade two colours that are on the board. Scores mirror the
 * families exactly (test/board-starters.test.ts checks them against the engine on sampled boards).
 */
import { BOARD_FAMILIES } from "@workspace/v2-grid-boards";
import type { RuleFamily } from "@workspace/v2-core";
import type { AgentKind, ShippedAgent, ShippedLanguage } from "./starters.ts";

/** Code lines in each language. */
interface Lines { readonly ts: readonly string[]; readonly py: readonly string[] }
export interface BoardFamilyEntry {
  readonly family: string;
  /** Lines that set `main` (and anything the tie-breakers read) from B and p. */
  readonly main: Lines;
  readonly mainSays: string;
  /** Each tie-breaker: an expression over what `main` set. */
  readonly tieBreakers: Readonly<Record<string, { readonly ts: string; readonly py: string; readonly says: string; readonly tryThis: string }>>;
  /** Moves that matter: numbers (add), colours (swap and trade). */
  readonly moves: readonly ("add" | "colours")[];
}

const NEIGHBOURS_TS = "const right = i => (i % B.n < B.n - 1 ? i + 1 : -1), down = i => (i + B.n < B.n * B.n ? i + B.n : -1);";
const NEIGHBOURS_PY = "right = lambda i: i + 1 if i % B.n < B.n - 1 else -1\ndown = lambda i: i + B.n if i + B.n < B.n * B.n else -1";

export const BOARD_CATALOGUE: readonly BoardFamilyEntry[] = [
  {
    family: "chessmaster", moves: ["colours"], mainSays: "2×2 chessboards of your two colours",
    main: {
      ts: [
        "const opp = (i, j) => (B.c[i] === p.first && B.c[j] === p.second) || (B.c[i] === p.second && B.c[j] === p.first);",
        NEIGHBOURS_TS,
        "let main = 0, seams = 0;",
        "for (let i = 0; i < B.n * B.n; i++) {",
        "  for (const o of [right(i), down(i)]) if (o >= 0 && opp(i, o)) seams++;",
        "  if (right(i) >= 0 && down(i) >= 0 && opp(i, right(i)) && opp(i, down(i)) && B.c[down(i) + 1] === B.c[i]) main++;",
        "}",
      ],
      py: [
        "opp = lambda i, j: (B.c[i] == p[\"first\"] and B.c[j] == p[\"second\"]) or (B.c[i] == p[\"second\"] and B.c[j] == p[\"first\"])",
        ...NEIGHBOURS_PY.split("\n"),
        "main, seams = 0, 0",
        "for i in range(B.n * B.n):",
        "    for o in (right(i), down(i)):",
        "        if o >= 0 and opp(i, o):",
        "            seams += 1",
        "    if right(i) >= 0 and down(i) >= 0 and opp(i, right(i)) and opp(i, down(i)) and B.c[down(i) + 1] == B.c[i]:",
        "        main += 1",
      ],
    },
    tieBreakers: { seams: { ts: "seams", py: "seams", says: "places your two colours touch", tryThis: "let it also try trading colours on the whole board (add \"colours\" moves): a trade can turn a stripe into a chessboard." } },
  },
  {
    family: "parity-painter", moves: ["add", "colours"], mainSays: "cells in their kind's colour, less those in the other kind's",
    main: {
      ts: [
        "let main = 0;",
        "for (let i = 0; i < B.n * B.n; i++) {",
        "  const [want, wrong] = B.v[i] % 2 === 0 ? [p.even, p.odd] : [p.odd, p.even];",
        "  if (B.c[i] === want) main++; else if (B.c[i] === wrong) main--;",
        "}",
      ],
      py: [
        "main = 0",
        "for i in range(B.n * B.n):",
        "    want, wrong = (p[\"even\"], p[\"odd\"]) if B.v[i] % 2 == 0 else (p[\"odd\"], p[\"even\"])",
        "    if B.c[i] == want:",
        "        main += 1",
        "    elif B.c[i] == wrong:",
        "        main -= 1",
      ],
    },
    tieBreakers: {},
  },
  {
    family: "colour-mirror", moves: ["colours"], mainSays: "rows or columns that mirror their colours",
    main: {
      ts: [
        "let main = 0, pairs = 0;",
        "for (let k = 0; k < B.n; k++) {",
        "  const run = [...Array(B.n).keys()].map(j => (p.axis === \"rows\" ? k * B.n + j : j * B.n + k));",
        "  let m = 0;",
        "  for (let j = 0; j < B.n >> 1; j++) if (B.c[run[j]] === B.c[run[B.n - 1 - j]]) m++;",
        "  pairs += m;",
        "  if (m === B.n >> 1) main++;",
        "}",
      ],
      py: [
        "main, pairs = 0, 0",
        "for k in range(B.n):",
        "    run = [k * B.n + j if p[\"axis\"] == \"rows\" else j * B.n + k for j in range(B.n)]",
        "    m = sum(1 for j in range(B.n // 2) if B.c[run[j]] == B.c[run[B.n - 1 - j]])",
        "    pairs += m",
        "    if m == B.n // 2:",
        "        main += 1",
      ],
    },
    tieBreakers: { "colour-pairs": { ts: "pairs", py: "pairs", says: "matching colour pairs", tryThis: "change FAR to 2: it then also tries bigger number changes, which this rule ignores: watch the price go up for nothing." } },
  },
  {
    family: "picture-frame", moves: ["add", "colours"], mainSays: "your colour and symbol on the edge, a clear middle",
    main: {
      ts: [
        "const glyph = i => (B.s ? [\"A\", \"2\", \"3\", \"4\", \"5\", \"6\", \"7\", \"8\", \"9\", \"10\", \"J\", \"Q\", \"K\"][B.v[i] - 1] + { spades: \"♠\", hearts: \"♥\", diamonds: \"♦\", clubs: \"♣\" }[B.s[i]] : \"0123456789ABCDEF\"[B.v[i]]);",
        "let main = 0;",
        "for (let i = 0; i < B.n * B.n; i++) {",
        "  const hits = (B.c[i] === p.colour) + (glyph(i) === p.symbol);",
        "  if (!hits) continue;",
        "  const r = Math.floor(i / B.n), c = i % B.n, edge = r === 0 || c === 0 || r === B.n - 1 || c === B.n - 1;",
        "  main += (edge ? 1 : -1) * (hits === 2 ? 4 : 1);",
        "}",
      ],
      py: [
        "def glyph(i):",
        "    if B.s:",
        "        return [\"A\", \"2\", \"3\", \"4\", \"5\", \"6\", \"7\", \"8\", \"9\", \"10\", \"J\", \"Q\", \"K\"][B.v[i] - 1] + {\"spades\": \"♠\", \"hearts\": \"♥\", \"diamonds\": \"♦\", \"clubs\": \"♣\"}[B.s[i]]",
        "    return \"0123456789ABCDEF\"[B.v[i]]",
        "main = 0",
        "for i in range(B.n * B.n):",
        "    hits = (B.c[i] == p[\"colour\"]) + (glyph(i) == p[\"symbol\"])",
        "    if hits:",
        "        r, c = i // B.n, i % B.n",
        "        edge = r == 0 or c == 0 or r == B.n - 1 or c == B.n - 1",
        "        main += (1 if edge else -1) * (4 if hits == 2 else 1)",
      ],
    },
    tieBreakers: {},
  },
  {
    family: "colour-bonds", moves: ["add", "colours"], mainSays: "touching same-colour pairs that add up to the target",
    main: {
      ts: [
        NEIGHBOURS_TS,
        "let main = 0;",
        "for (let i = 0; i < B.n * B.n; i++) for (const o of [right(i), down(i)]) if (o >= 0 && B.v[i] + B.v[o] === p.target && B.c[i] === B.c[o]) main++;",
      ],
      py: [
        ...NEIGHBOURS_PY.split("\n"),
        "main = sum(1 for i in range(B.n * B.n) for o in (right(i), down(i)) if o >= 0 and B.v[i] + B.v[o] == p[\"target\"] and B.c[i] == B.c[o])",
      ],
    },
    tieBreakers: {},
  },
  {
    family: "honest-minesweeper", moves: ["add", "colours"], mainSays: "honest cells' numbers, added up",
    main: {
      ts: [
        "let main = 0;",
        "for (let i = 0; i < B.n * B.n; i++) {",
        "  if (B.c[i] === p.mine) continue;",
        "  const r = Math.floor(i / B.n), c = i % B.n;",
        "  let mines = 0;",
        "  for (let y = r - 1; y <= r + 1; y++) for (let x = c - 1; x <= c + 1; x++) if ((y !== r || x !== c) && y >= 0 && y < B.n && x >= 0 && x < B.n && B.c[y * B.n + x] === p.mine) mines++;",
        "  if (B.v[i] === mines) main += mines;",
        "}",
      ],
      py: [
        "main = 0",
        "for i in range(B.n * B.n):",
        "    if B.c[i] == p[\"mine\"]:",
        "        continue",
        "    r, c = i // B.n, i % B.n",
        "    mines = sum(1 for y in range(r - 1, r + 2) for x in range(c - 1, c + 2) if (y, x) != (r, c) and 0 <= y < B.n and 0 <= x < B.n and B.c[y * B.n + x] == p[\"mine\"])",
        "    if B.v[i] == mines:",
        "        main += mines",
      ],
    },
    tieBreakers: {},
  },
  {
    family: "kingdom", moves: ["colours"], mainSays: "cells in your biggest patch",
    main: {
      ts: [
        "const seen = new Set();",
        "let main = 0;",
        "for (let s = 0; s < B.n * B.n; s++) {",
        "  if (seen.has(s) || B.c[s] !== p.colour) continue;",
        "  const g = [s];",
        "  seen.add(s);",
        "  for (let k = 0; k < g.length; k++) {",
        "    const i = g[k], r = Math.floor(i / B.n), c = i % B.n;",
        "    for (const o of [r > 0 ? i - B.n : -1, r < B.n - 1 ? i + B.n : -1, c > 0 ? i - 1 : -1, c < B.n - 1 ? i + 1 : -1]) {",
        "      if (o >= 0 && !seen.has(o) && B.c[o] === p.colour) { seen.add(o); g.push(o); }",
        "    }",
        "  }",
        "  main = Math.max(main, g.length);",
        "}",
      ],
      py: [
        "seen, main = set(), 0",
        "for s in range(B.n * B.n):",
        "    if s in seen or B.c[s] != p[\"colour\"]:",
        "        continue",
        "    g = [s]",
        "    seen.add(s)",
        "    for i in g:",
        "        r, c = i // B.n, i % B.n",
        "        for o in (i - B.n if r > 0 else -1, i + B.n if r < B.n - 1 else -1, i - 1 if c > 0 else -1, i + 1 if c < B.n - 1 else -1):",
        "            if o >= 0 and o not in seen and B.c[o] == p[\"colour\"]:",
        "                seen.add(o)",
        "                g.append(o)",
        "    main = max(main, len(g))",
      ],
    },
    tieBreakers: {},
  },
  {
    family: "set-spotter", moves: ["add", "colours"], mainSays: "SETs of three in a row",
    main: {
      ts: [
        "let main = 0;",
        "for (let r = 0; r < B.n; r++) for (let c = 0; c < B.n; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {",
        "  const r2 = r + 2 * dr, c2 = c + 2 * dc;",
        "  if (r2 < 0 || r2 >= B.n || c2 < 0 || c2 >= B.n) continue;",
        "  const a = r * B.n + c, b = (r + dr) * B.n + c + dc, d = r2 * B.n + c2;",
        "  if (new Set([B.c[a], B.c[b], B.c[d]]).size !== 2 && B.v[b] - B.v[a] === B.v[d] - B.v[b]) main++;",
        "}",
      ],
      py: [
        "main = 0",
        "for r in range(B.n):",
        "    for c in range(B.n):",
        "        for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):",
        "            r2, c2 = r + 2 * dr, c + 2 * dc",
        "            if 0 <= r2 < B.n and 0 <= c2 < B.n:",
        "                a, b, d = r * B.n + c, (r + dr) * B.n + c + dc, r2 * B.n + c2",
        "                if len({B.c[a], B.c[b], B.c[d]}) != 2 and B.v[b] - B.v[a] == B.v[d] - B.v[b]:",
        "                    main += 1",
      ],
    },
    tieBreakers: {},
  },
];

const familyOf = (id: string): RuleFamily<unknown, unknown> => {
  const f = BOARD_FAMILIES.find(x => x.id === id);
  if (!f) throw new Error(`v2-grid-boards has no family ${id}`);
  return f as unknown as RuleFamily<unknown, unknown>;
};
const entryOf = (id: string): BoardFamilyEntry => {
  const e = BOARD_CATALOGUE.find(x => x.family === id);
  if (!e) throw new Error(`no board agents are described for ${id}`);
  return e;
};

/** Is this a coloured-board family with shipped agents? */
export const isBoardFamily = (id: string): boolean => BOARD_CATALOGUE.some(e => e.family === id) && BOARD_FAMILIES.some(f => f.id === id);
/** Is this a family of the coloured boards (described or not)? Such a family never falls through to the line catalogue. */
export const isBoardTypeFamily = (id: string): boolean => BOARD_FAMILIES.some(f => f.id === id);

type StarterKind = Exclude<AgentKind, "example">;
const KINDS: Record<StarterKind, { title: string; summary: string; tryThis: string; far: number; quotes: number; colours: boolean }> = {
  simple: {
    title: "Simple", summary: "Changes one number by 1 or swaps two cells' colours, taking the change that raises your points most: good for your rule and for the other players too.",
    tryThis: "change QUOTES = 4 to 8: more prices compared before it pays.", far: 1, quotes: 4, colours: true,
  },
  thorough: {
    title: "Thorough", summary: "Like Simple, but it also trades two colours all over the board and compares more prices before it pays.",
    tryThis: "change QUOTES = 8 to 3: fewer prices asked, but it may miss a cheaper plan.", far: 1, quotes: 8, colours: true,
  },
  bold: {
    title: "Bold", summary: "Changes numbers by up to 3 at a time, so it gets there in fewer moves, each dearer.",
    tryThis: "change FAR = 3 to 1: single steps, the same price per step, but more turns to get there.", far: 3, quotes: 6, colours: true,
  },
  naive: {
    title: "Naive (for learning)",
    summary: "Chases your rule on every board, whatever it costs and whatever the others want. It is here to learn from: compare it with Simple.",
    tryThis: "summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.", far: 1, quotes: 8, colours: true,
  },
};
const HOW_POINTS = [
  "What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only",
  "time) and takes the change that raises your points most. Your points on a board are your rarity there times the",
  "other players' rarity there added up, so a change that suits your rule but spoils the board for the others can",
  "lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.",
];
const HOW_NAIVE = [
  "What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every",
  "board it is offered, whatever it costs and whatever the other players think of the board. It is here to learn from.",
];
const HOW_EXAMPLE = [
  "What it does: reads the board once (a small read), tries changes in its own head, and takes the one that raises your",
  "points most (your rarity times the other players'), working on your secondary preference once the main part is set.",
];

// ---------------------------------------------------------------- the score

function scoreTs(e: BoardFamilyEntry, tieBreaker: string | null): string[] {
  const out = [
    "// How good is the board B for your rule? [main part, secondary]: bigger is better.",
    "// B.n: its side; B.v: its numbers row by row; B.c: their colours (\"red\", ...); B.s: suits, on cards.",
    `function score(B, p${tieBreaker === null ? ", tie" : ""}) {`,
    ...e.main.ts.map(l => `  ${l}`),
  ];
  if (tieBreaker !== null) out.push(`  return [main, ${e.tieBreakers[tieBreaker]!.ts}];   // main: ${e.mainSays}; secondary: ${e.tieBreakers[tieBreaker]!.says}`);
  else {
    out.push(`  // main: ${e.mainSays}`);
    for (const [id, t] of Object.entries(e.tieBreakers)) out.push(`  if (tie === ${JSON.stringify(id)}) return [main, ${t.ts}];   // ${t.says}`);
    out.push("  return [main];");
  }
  out.push("}");
  return out;
}

function scorePy(e: BoardFamilyEntry, tieBreaker: string | null): string[] {
  const out = [
    `def score(B, p${tieBreaker === null ? ", tie" : ""}):`,
    "    # How good is the board B for your rule? [main part, secondary]: bigger is better.",
    "    # B.n: its side; B.v: its numbers row by row; B.c: their colours (\"red\", ...); B.s: suits, on cards.",
    ...e.main.py.map(l => `    ${l}`),
  ];
  if (tieBreaker !== null) out.push(`    return [main, ${e.tieBreakers[tieBreaker]!.py}]   # main: ${e.mainSays}; secondary: ${e.tieBreakers[tieBreaker]!.says}`);
  else {
    out.push(`    # main: ${e.mainSays}`);
    for (const [id, t] of Object.entries(e.tieBreakers)) out.push(`    if tie == ${JSON.stringify(id)}:   # ${t.says}`, `        return [main, ${t.py}]`);
    out.push("    return [main]");
  }
  return out;
}

// ---------------------------------------------------------------- the agent

function agentTs(kind: AgentKind, e: BoardFamilyEntry, tieBreaker: string | null, far: number, quotes: number, trade: boolean): string[] {
  const args = tieBreaker !== null ? "p" : "p, tie";
  const add = e.moves.includes("add"), colours = e.moves.includes("colours");
  return [
    `const FAR = ${far};      // how far one change of a number may go`,
    `const QUOTES = ${quotes};  // at most this many plans are priced (each price is a host call)`,
    ...(kind === "naive" ? [] : [
      "const LEAVE = [];      // boards you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them",
      "const PROTECT = [];    // boards where you promised not to lower the others, e.g. [7]: only moves that keep them as well off",
    ]),
    "",
    "function agent(offer) {",
    ...(kind === "naive" ? [] : [
      "  if (LEAVE.includes(offer.object)) return null;   // a deal: leave this board alone",
      "  if (saving(offer)) return null;   // under 10 s of your income in hand: save up for a move",
      "  contested(offer, 3);   // a tug-of-war burns energy on both sides: tell your owner, who can make a deal",
    ]),
    "  const v = look(offer, \"cells\");   // the board",
    `  const { params: p${tieBreaker !== null ? "" : ", tieBreaker: tie"} } = goal(offer);   // your rule (free)`,
    "  const NAME = Object.keys(v).filter(k => /^r\\d+c\\d+$/.test(k));   // the cells' names, r0c0 ..., row by row",
    "  const B = { n: Math.round(Math.sqrt(NAME.length)), v: NAME.map(k => Q.toNumber(v[k])), c: NAME.map(k => v[k + \".colour\"]),",
    "    s: (NAME[0] + \".suit\") in v ? NAME.map(k => v[k + \".suit\"]) : null };",
    "  const tries = [];   // [plan, board after]: changes tried in the agent's own head",
    ...(add ? [
      "  for (let k = -FAR; k <= FAR; k++) for (let i = 0; k && i < NAME.length; i++) {   // add k to one cell",
      "    tries.push([move(\"cells.add\", { cell: NAME[i], k }), { ...B, v: B.v.map((x, j) => (j === i ? x + k : x)) }]);",
      "  }",
    ] : []),
    ...(colours ? [
      "  for (let i = 0; i < NAME.length; i++) for (let j = i + 1; j < NAME.length; j++) {   // swap two cells' colours",
      "    if (B.c[i] === B.c[j]) continue;",
      "    const c = B.c.slice(); c[i] = B.c[j]; c[j] = B.c[i];",
      "    tries.push([move(\"cells.swap\", { a: NAME[i], b: NAME[j], what: \"colours\" }), { ...B, c }]);",
      "  }",
    ] : []),
    ...(trade ? [
      "  const ON = [...new Set(B.c)];   // the colours on the board: trade two of them everywhere",
      "  for (const x of ON) for (const y of ON) if (x < y) tries.push([move(\"colours.trade\", { a: x, b: y }), { ...B, c: B.c.map(z => (z === x ? y : z === y ? x : z)) }]);",
    ] : []),
    ...(kind === "naive" ? [
      `  let top = score(B, ${args}), plans = [];`,
      "  for (const [plan, B2] of tries) {",
      `    const s = score(B2, ${args});`,
      "    if (better(s, top)) { top = s; plans = [plan]; }               // a new best",
      "    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides",
      "  }",
      "  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip",
    ] : [
      `  let options = tries.map(([plan, B2]) => [plan, score(B2, ${args})]);   // each change and the score it reaches`,
      "  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));   // a promise kept",
      "  // The change that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.",
      `  return climb(offer, options, score(B, ${args}), QUOTES);`,
    ]),
    "}",
  ];
}

function agentPy(kind: AgentKind, e: BoardFamilyEntry, tieBreaker: string | null, far: number, quotes: number, trade: boolean): string[] {
  const args = tieBreaker !== null ? "p" : "p, tie";
  const add = e.moves.includes("add"), colours = e.moves.includes("colours");
  return [
    `FAR = ${far}      # how far one change of a number may go`,
    `QUOTES = ${quotes}  # at most this many plans are priced (each price is a host call)`,
    ...(kind === "naive" ? [] : [
      "LEAVE = []      # boards you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them",
      "PROTECT = []    # boards where you promised not to lower the others, e.g. [7]: only moves that keep them as well off",
    ]),
    "",
    "",
    "class Board:",
    "    def __init__(self, n, v, c, s):",
    "        self.n, self.v, self.c, self.s = n, v, c, s",
    "",
    "",
    "def agent(offer):",
    ...(kind === "naive" ? [] : [
      "    if offer.object in LEAVE:   # a deal: leave this board alone",
      "        return None",
      "    if saving(offer):   # under 10 s of your income in hand: save up for a move",
      "        return None",
      "    contested(offer, 3)   # a tug-of-war burns energy on both sides: tell your owner, who can make a deal",
    ]),
    "    v = look(offer, \"cells\")   # the board",
    "    rule = goal(offer)         # your rule (free)",
    tieBreaker !== null ? "    p = rule.params" : "    p, tie = rule.params, rule.tie_breaker",
    "    NAME = [k for k in v.keys() if k[0] == \"r\" and \".\" not in k]   # the cells' names, r0c0 ..., row by row",
    "    n = round(len(NAME) ** 0.5)",
    "    B = Board(n, [int(v[k]) for k in NAME], [v[k + \".colour\"] for k in NAME], [v[k + \".suit\"] for k in NAME] if NAME[0] + \".suit\" in v.keys() else None)",
    "    tries = []   # (plan, board after): changes tried in the agent's own head",
    ...(add ? [
      "    for k in range(-FAR, FAR + 1):   # add k to one cell",
      "        for i in range(len(NAME)):",
      "            if k:",
      "                tries.append((move(\"cells.add\", cell=NAME[i], k=k), Board(n, [x + k if j == i else x for j, x in enumerate(B.v)], B.c, B.s)))",
    ] : []),
    ...(colours ? [
      "    for i in range(len(NAME)):   # swap two cells' colours",
      "        for j in range(i + 1, len(NAME)):",
      "            if B.c[i] != B.c[j]:",
      "                c = list(B.c)",
      "                c[i], c[j] = B.c[j], B.c[i]",
      "                tries.append((move(\"cells.swap\", a=NAME[i], b=NAME[j], what=\"colours\"), Board(n, B.v, c, B.s)))",
    ] : []),
    ...(trade ? [
      "    on = sorted(set(B.c))   # the colours on the board: trade two of them everywhere",
      "    for x in on:",
      "        for y in on:",
      "            if x < y:",
      "                tries.append((move(\"colours.trade\", a=x, b=y), Board(n, B.v, [y if z == x else x if z == y else z for z in B.c], B.s)))",
    ] : []),
    ...(kind === "naive" ? [
      `    top, plans = score(B, ${args}), []`,
      "    for plan, B2 in tries:",
      `        s = score(B2, ${args})`,
      "        if better(s, top):",
      "            top, plans = s, [plan]         # a new best",
      "        elif plans and not better(top, s):",
      "            plans.append(plan)             # as good as the best: the price decides",
      "    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip",
    ] : [
      `    options = [(plan, score(B2, ${args})) for plan, B2 in tries]   # each change and the score it reaches`,
      "    if offer.object in PROTECT:   # a promise kept",
      "        options = [(plan, s) for plan, s in options if fair(offer, plan)]",
      "    # The change that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or None.",
      `    return climb(offer, options, score(B, ${args}), QUOTES)`,
    ]),
  ];
}

// ---------------------------------------------------------------- assembly

function render(kind: AgentKind, familyId: string, tieBreaker: string | null, language: ShippedLanguage): ShippedAgent {
  const e = entryOf(familyId), f = familyOf(familyId);
  const tb = tieBreaker === null ? null : f.tieBreakers.find(t => t.id === tieBreaker);
  if (tieBreaker !== null && (!tb || !e.tieBreakers[tieBreaker])) throw new Error(`${familyId} has no tie-breaker ${tieBreaker} to write an example for`);
  const meta = kind === "example"
    ? { title: `Example: ${tb!.title}`, summary: `Gets the main part right, then works on the secondary preference (${tb!.title}).`, tryThis: e.tieBreakers[tieBreaker!]!.tryThis, far: 1, quotes: 8, colours: true }
    : KINDS[kind];
  const rule = tb ? `Main part: ${f.main.title}. Secondary preference: ${tb.title}.`
    : f.tieBreakers.length ? `Main part: ${f.main.title}. Secondary preference: whichever you were dealt.` : `Your rule: ${f.main.title}.`;
  const how = kind === "naive" ? HOW_NAIVE : kind === "example" ? HOW_EXAMPLE : HOW_POINTS;
  const header = [`${f.title} · ${meta.title}`, rule, ...how, `Try this: ${meta.tryThis}`];
  const ts = language === "typescript", c = ts ? "//" : "#";
  const trade = kind === "thorough" || kind === "example";
  const lines = [
    ...header.map(l => `${c} ${l}`),
    ...(ts ? [""] : ["", ""]),
    ...(ts ? scoreTs(e, tieBreaker) : scorePy(e, tieBreaker)),
    ...(ts ? [""] : ["", ""]),
    ...(ts ? agentTs(kind, e, tieBreaker, meta.far, meta.quotes, trade) : agentPy(kind, e, tieBreaker, meta.far, meta.quotes, trade)),
  ];
  return { family: familyId, kind, tieBreaker, language, title: meta.title, summary: meta.summary, source: lines.join("\n") + "\n" };
}

/** The dealt tie-breakers a starter is written for: each of the family's, or null when it has none. */
const tieBreakersOf = (e: BoardFamilyEntry): (string | null)[] => (Object.keys(e.tieBreakers).length ? Object.keys(e.tieBreakers) : [null]);

export function boardExampleFor(family: string, tieBreaker: string, language: ShippedLanguage): ShippedAgent | null {
  return isBoardFamily(family) && entryOf(family).tieBreakers[tieBreaker] ? render("example", family, tieBreaker, language) : null;
}

/** The starters for a board family, written for the dealt tie-breaker (none when the family has none), then Naive. */
export function boardStartersFor(family: string, language: ShippedLanguage, tieBreaker?: string | null): ShippedAgent[] {
  if (!isBoardFamily(family)) return [];
  const e = entryOf(family);
  const tb = tieBreaker && e.tieBreakers[tieBreaker] ? tieBreaker : tieBreakersOf(e)[0]!;
  return (["simple", "thorough", "bold", "naive"] as const).map(k => render(k, family, tb, language));
}

export function boardShippedAgents(): ShippedAgent[] {
  return BOARD_CATALOGUE.filter(e => isBoardFamily(e.family)).flatMap(e => (["typescript", "python"] as const).flatMap(language =>
    tieBreakersOf(e).flatMap(tb => [
      ...(tb ? [render("example", e.family, tb, language)] : []),
      ...boardStartersFor(e.family, language, tb),
    ])));
}

export function boardScoreSource(family: string, tieBreaker: string | null, language: ShippedLanguage): string {
  const e = entryOf(family);
  return (language === "typescript" ? scoreTs(e, tieBreaker) : scorePy(e, tieBreaker)).join("\n") + "\n";
}

/** Board families with no shipped agents yet (each needs a BOARD_CATALOGUE entry). */
export function boardUndescribed(): string[] {
  return BOARD_FAMILIES.filter(f => !BOARD_CATALOGUE.some(e => e.family === f.id)).map(f => f.id);
}
