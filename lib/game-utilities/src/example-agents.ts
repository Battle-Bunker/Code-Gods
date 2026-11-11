/**
 * A working first agent for a player's own goal: a short, commented reference agent per rule family, in both agent
 * languages. The forge pre-fills it for a player with no agents, and the assistant can offer it as a starting draft.
 *
 * An agent sees one object per act and nothing else (not its rule, not its score), so an example is the family's rule
 * written as "find one small change that helps, make it, else skip". Examples only use the read helpers every Grid
 * has and ONE number mutator, chosen from what the board's prelude offers (`add` when it exists, else `write`), so a
 * renamed mutator changes the generated call, never breaks it. A family without its own example gets the fallback
 * (`specific: false`): a valid agent that nudges a random number, whose comments say it does not chase the goal yet.
 *
 * Tests: artifacts/engine/test/unit/example-agents.test.ts runs every example of the default setup's pool in the real
 * sandbox and requires the rule's score to rise.
 */
import { instanceInfo, type Instantiation } from "@workspace/game-types";
import { context, family } from "./catalog.ts";
import type { Params } from "./types.ts";

export type ExampleLanguage = "python" | "typescript";

export interface ExampleAgent {
  /** A sensible agent name (at most 40 characters), so Summon needs no typing. */
  readonly name: string;
  readonly source: string;
  /** True when the example pursues this family's rule; false for the fallback, which only shows the shape of an agent. */
  readonly specific: boolean;
}

/** What the generator needs to know; everything but the family id has a default, so it is total. */
export interface ExampleInput {
  readonly familyId: string;
  /** The dealt params by name (a goal card's `params` as key → value). */
  readonly params?: Readonly<Record<string, unknown>>;
  readonly language: ExampleLanguage;
  /** The goal card's own summary; its first sentence becomes the example's "My goal" line. */
  readonly summary?: string;
  /** The goal card's source (either language): constants such as TARGET, and rows or columns, are read from it. */
  readonly cardSource?: string;
  /** The mutator constructors the board's prelude offers, by their name in `language` (InstanceInfo.helpers). */
  readonly mutators?: readonly string[];
  /** The smallest and largest number a cell can hold (0 and 9 on a digit board). */
  readonly minValue?: number;
  readonly maxValue?: number;
  /** Cells per side (4 by default). */
  readonly size?: number;
}

/** How an example changes one number, from what the prelude offers. Null: the board has no number mutator we know. */
interface Pen {
  readonly mutator: string;
  /** Make `cell` hold `value` (an expression that differs from the cell's number). */
  set(cell: string, value: string): string;
  /** Move `cell` by a literal step (+1, −1). */
  nudge(cell: string, step: number): string;
}
function pen(mutators: readonly string[] | undefined): Pen | null {
  const has = (name: string) => !mutators || mutators.includes(name);
  if (mutators && mutators.includes("add")) {
    return { mutator: "add", set: (c, v) => `add(${c}, ${v} - ${c}.value)`, nudge: (c, k) => `add(${c}, ${k})` };
  }
  if (has("write")) {
    return { mutator: "write", set: (c, v) => `write(${c}, ${v})`, nudge: (c, k) => `write(${c}, ${c}.value ${k < 0 ? "-" : "+"} ${Math.abs(k)})` };
  }
  return null;
}

/** The number mutator the examples for a board with these constructors call ("add", "write"), or null. */
export const exampleMutator = (mutators?: readonly string[]): string | null => pen(mutators)?.mutator ?? null;

const firstSentence = (text: string | undefined): string => {
  const s = (text ?? "").trim().replace(/\s+/g, " ");
  const end = s.search(/[.!?](\s|$)/);
  return end < 0 ? s : s.slice(0, end + 1);
};
/** A whole-number constant of the goal card (`TARGET = 10`, `const TARGET = 10;`). */
function cardConst(source: string | undefined, name: string): number | undefined {
  const m = source?.match(new RegExp(`^(?:const )?${name} = (-?\\d+)`, "m"));
  return m ? Number(m[1]) : undefined;
}
function dedent(s: string): string {
  const lines = s.replace(/^\n+/, "").replace(/\s+$/, "").split("\n");
  const ind = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)![0].length));
  return lines.map(l => l.slice(ind)).join("\n");
}

interface Ctx { readonly i: ExampleInput; readonly pen: Pen; readonly lo: number; readonly hi: number; readonly size: number }
interface Recipe {
  readonly name: string;
  /** What the agent does each time it acts, in plain words (one or two comment lines). */
  readonly does: readonly string[];
  /** One line a beginner could change. */
  readonly tryThis: string | ((c: Ctx) => string);
  /** The family's usual TARGET, when neither the card nor the params give one (10 if absent). */
  readonly usual?: number;
  python(c: Ctx): string;
  typescript(c: Ctx): string;
}

/**
 * Whether the rule scores columns (else rows): the dealt `axis` param when given; otherwise read from the goal card's
 * program, which loops over grid.columns or grid.rows (a client's goal card carries the source, not the params).
 */
function isColumns(c: Ctx): boolean {
  const axis = c.i.params?.axis;
  if (axis !== undefined) return axis === "cols" || axis === "TB" || axis === "columns";
  const card = c.i.cardSource ?? "";
  return card.includes("grid.columns") && !card.includes("grid.rows");
}
/** The variable an example calls one scored line, and where the lines come from. */
const line = (c: Ctx) => (isColumns(c) ? "column" : "row");
const lines = (c: Ctx) => (isColumns(c) ? "grid.columns" : "grid.rows");

/**
 * The families with an example of their own. Every other family gets FALLBACK.
 *
 * Summoning is priced by the code's description length and paid from a new player's starting energy (200 bits on the
 * default setup), so these are written to be cheap as well as readable: one loop, no helper functions, no constants,
 * and Python leaves out the final `return []` (returning nothing is a skip).
 */
const RECIPES: Readonly<Record<string, Recipe>> = {
  mirrormancer: {
    name: "Mirror maker",
    does: [
      "Each time this agent is handed a grid, it finds a cell whose mirror twin holds a",
      "different number and copies the cell's number onto its twin. One small change per turn.",
    ],
    tryThis: "Try this: in the line that returns a move, swap cell and twin to keep the twin's number instead.",
    python: c => `
      def agent(grid):
          for cell in grid.cells:
              twin = ${twin(c)}  # the cell that mirrors it
              if twin.value != cell.value:
                  return [${c.pen.set("twin", "cell.value")}]`,
    typescript: c => `
      function agent(grid) {
        for (const cell of grid.cells) {
          const twin = ${twin(c)}; // the cell that mirrors it
          if (twin.value !== cell.value) return [${c.pen.set("twin", "cell.value")}];
        }
        return []; // nothing to fix on this grid: skip and save energy
      }`,
  },
  // Only the cell to the right is changed, so every row settles on its own pattern. Fixing all four neighbours would
  // drive every grid to one of nine chequerboards, and the engine refuses a change that copies another object's value.
  number_bonds: {
    name: "Bond builder",
    does: [
      "Each time this agent is handed a grid, it finds a cell and its right-hand neighbour that",
      "do not add up to TARGET, and changes the neighbour so that they do. One small change per turn.",
    ],
    tryThis: "Try this: change cell.right to cell.down to pair each cell with the one below it instead.",
    python: c => `
      def agent(grid):
          for cell in grid.cells:
              other = cell.right  # the cell to its right (None at the edge)
              if other and ${fits(c, "and")} and cell.value + other.value != ${target(c, 10)}:
                  return [${c.pen.set("other", `${target(c, 10)} - cell.value`)}]`,
    typescript: c => `
      function agent(grid) {
        for (const cell of grid.cells) {
          const other = cell.right; // the cell to its right (null at the edge)
          if (other && ${fits(c, "&&")} && cell.value + other.value !== ${target(c, 10)}) return [${c.pen.set("other", `${target(c, 10)} - cell.value`)}];
        }
        return []; // every pair adds up: skip and save energy
      }`,
  },
  magic_accountant: {
    name: "Line balancer", usual: 18,
    does: [
      "Each time this agent is handed a grid, it finds a LINE that does not add up to TARGET",
      "and changes one of its numbers to close the gap (numbers stay between LO and HI).",
    ],
    tryThis: c => (c.i.language === "python"
      ? `Try this: make the second loop go over reversed(${line(c)}) to change the far end first.`
      : `Try this: make the second loop go over ${line(c)}.reverse() to change the far end first.`),
    python: c => `
      def agent(grid):
          for ${line(c)} in ${lines(c)}:
              gap = ${target(c, 18)}  # how far this ${line(c)} is from the magic number
              for cell in ${line(c)}:
                  gap -= cell.value
              for cell in ${line(c)}:
                  new = min(${c.hi}, max(${c.lo}, cell.value + gap))
                  if new != cell.value:
                      return [${c.pen.set("cell", "new")}]`,
    typescript: c => `
      function agent(grid) {
        for (const ${line(c)} of ${lines(c)}) {
          let gap = ${target(c, 18)}; // how far this ${line(c)} is from the magic number
          for (const cell of ${line(c)}) gap -= cell.value;
          for (const cell of ${line(c)}) {
            const value = Math.min(${c.hi}, Math.max(${c.lo}, cell.value + gap));
            if (value !== cell.value) return [${c.pen.set("cell", "value")}];
          }
        }
        return []; // every ${line(c)} is right: skip and save energy
      }`,
  },
};
/** The goal card's TARGET constant, else the dealt `target` param, else the family's usual one. */
function target(c: Ctx, usual: number): number {
  const dealt = c.i.params?.target;
  return cardConst(c.i.cardSource, "TARGET") ?? (typeof dealt === "number" ? dealt : usual);
}
/** The cell across the mirror: the same row on the other side, or the same column for top-to-bottom mirrors. */
const twin = (c: Ctx) => (isColumns(c) ? `grid.cell(${c.size - 1} - cell.row, cell.col)` : `grid.cell(cell.row, ${c.size - 1} - cell.col)`);
/** Number bonds: TARGET − cell.value must be a number a cell can hold. On digits with TARGET 10 that is "not 0". */
function fits(c: Ctx, and: string): string {
  const t = target(c, 10);
  if (c.lo === 0 && t === c.hi + 1) return "cell.value";
  return c.i.language === "python" ? `${c.lo} <= ${t} - cell.value <= ${c.hi}` : `${t} - cell.value >= ${c.lo} ${and} ${t} - cell.value <= ${c.hi}`;
}

const FALLBACK: Recipe = {
  name: "First agent",
  does: [
    "This starter agent does not chase your goal yet. Each time it is handed a grid, it",
    "adds one to the number in the top-left cell, until that number is HI.",
  ],
  tryThis: "Try this: pick another cell, or loop over grid.cells and change the first one that helps your goal.",
  python: c => `
    def agent(grid):
        cell = grid.cell(0, 0)
        if cell.value < ${c.hi}:
            return [${c.pen.nudge("cell", 1)}]`,
  typescript: c => `
    function agent(grid) {
      const cell = grid.cell(0, 0);
      if (cell.value < ${c.hi}) return [${c.pen.nudge("cell", 1)}];
      return []; // an empty list is a skip: nothing changes and little energy is spent
    }`,
};

/** For a board with no number mutator we know (not a Grid, or a prelude without add and write): an agent that skips. */
function skipper(i: ExampleInput, goal: string): ExampleAgent {
  const mark = i.language === "python" ? "#" : "//";
  const head = [...(goal ? [`${mark} My goal: ${goal}`] : []),
    `${mark} This starter agent does nothing yet: it skips every turn.`,
    `${mark} Try this: return one move from the helpers list below instead of an empty list.`];
  const body = i.language === "python" ? "def agent(x):\n    return []" : "function agent(x) {\n  return [];\n}";
  return { name: "First agent", source: `${head.join("\n")}\n${body}\n`, specific: false };
}

/** The families that have an example of their own (the rest get the fallback). */
export const EXAMPLE_AGENT_FAMILIES: readonly string[] = Object.freeze(Object.keys(RECIPES));

/** The example agent for a goal, from plain data (what a client has on the goal card). Total: never throws. */
export function buildExampleAgent(i: ExampleInput): ExampleAgent {
  const goal = firstSentence(i.summary);
  const p = pen(i.mutators);
  if (!p) return skipper(i, goal);
  const recipe = Object.hasOwn(RECIPES, i.familyId) ? RECIPES[i.familyId]! : FALLBACK;
  const c: Ctx = { i, pen: p, lo: i.minValue ?? 0, hi: i.maxValue ?? 9, size: i.size ?? 4 };
  const mark = i.language === "python" ? "#" : "//";
  const tryThis = typeof recipe.tryThis === "function" ? recipe.tryThis(c) : recipe.tryThis;
  const words = (text: string) => text.replace("LINE", line(c)).replace("TARGET", String(target(c, recipe.usual ?? 10)))
    .replace("LO", String(c.lo)).replace("HI", String(c.hi));
  // The player's first view of the API: how to read a number and how to change one, in the board's own words.
  const api = `cell.value reads a cell's number; ${p.mutator === "add" ? "add(cell, 1) adds one to it" : "write(cell, 5) changes it to 5"}.`;
  const head = [...(goal ? [`My goal: ${goal}`] : []), ...recipe.does.map(words), api, tryThis].map(l => `${mark} ${l}`);
  return { name: recipe.name, source: `${head.join("\n")}\n${dedent(recipe[i.language](c))}\n`, specific: recipe !== FALLBACK };
}

/** The mutator constructor names of an instantiation (or of an observation's `instance`) in one language. */
export function mutatorNames(info: { readonly helpers: readonly { readonly name: Readonly<Record<ExampleLanguage, string>>; readonly group: string }[] }, language: ExampleLanguage): string[] {
  return info.helpers.filter(h => h.group === "mutator").map(h => h.name[language]);
}
/** The smallest and largest number on a Grid's cells and its side, from its display tables (0, 9 and 4 without them). */
export function boardFacts(info: { readonly display: Readonly<Record<string, unknown>> }): { minValue: number; maxValue: number; size: number } {
  const display = info.display as { size?: unknown; symbols?: { values?: unknown } };
  const raw = display.symbols?.values;
  const values = Array.isArray(raw) ? raw.filter((v): v is number => typeof v === "number") : [];
  const size = typeof display.size === "number" && display.size > 0 ? display.size : 4;
  return values.length ? { minValue: Math.min(...values), maxValue: Math.max(...values), size } : { minValue: 0, maxValue: 9, size };
}

/**
 * The example agent for a dealt goal on a board: the rule's one-line goal in the goal card's own words, what the
 * agent does each time it acts, one line to change first, then the code. Unknown families and params are not an
 * error: they get the fallback.
 */
export function exampleAgent(familyId: string, params: Params, inst: Instantiation, language: ExampleLanguage): ExampleAgent {
  const info = instanceInfo(inst);
  let summary: string | undefined, cardSource: string | undefined;
  try {
    const f = family(familyId), ctx = context(inst);
    summary = f.summary(params, ctx);
    cardSource = f.card[language](params, ctx);
  } catch { /* an unknown family or params it does not take: the fallback, without a goal line */ }
  return buildExampleAgent({ familyId, params, language, summary, cardSource, mutators: mutatorNames(info, language), ...boardFacts(info) });
}
