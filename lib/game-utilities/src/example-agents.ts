/**
 * A working first agent for a player's own goal: a short, commented reference agent per rule family, in both agent
 * languages. The forge pre-fills it for a player with no agents, and the assistant can offer it as a starting draft.
 *
 * An agent sees one object per act and nothing else (not its rule, not its score), so an example is the family's rule
 * written as "find one small change that helps, make it, else skip". Examples only use the read helpers every Grid
 * has and ONE number mutator, chosen from what the board's prelude offers (`write` when it exists, else `add`), so a
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
  // `write` first: it reads as plain words ("make this cell 5"), is priced by how far the number moved exactly as the
  // `add` it amounts to, and its syntax tree is smaller (a cheaper summon). `add` only on a board without `write`.
  if (has("write")) {
    return { mutator: "write", set: (c, v) => `write(${c}, ${v})`, nudge: (c, k) => `write(${c}, ${c}.value ${k < 0 ? "-" : "+"} ${Math.abs(k)})` };
  }
  if (mutators && mutators.includes("add")) {
    return { mutator: "add", set: (c, v) => `add(${c}, ${v} - ${c}.value)`, nudge: (c, k) => `add(${c}, ${k})` };
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
  /** False on a board the recipe's arithmetic does not fit (it is written for digits 0 to 9): the fallback is used. */
  readonly fitsBoard?: (c: Ctx) => boolean;
  /** The bolder variant (starterAgents): the same idea, two changes a turn. */
  readonly bold?: Variant;
  /**
   * A much shorter agent for the same rule, cheap enough to summon from a new player's starting energy (the summon
   * price is the size of the code's syntax tree). It does part of the job, or does it a simpler way; when a family
   * has one that fits the board, it is the example and the recipe itself becomes the "thorough" starter.
   */
  readonly tiny?: Variant & { readonly fitsBoard?: (c: Ctx) => boolean };
}
/** A second way to play the same rule: its own words and code, the recipe's name and goal line. */
interface Variant {
  readonly does: readonly string[];
  readonly tryThis: string | ((c: Ctx) => string);
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
const RECIPES: Record<string, Recipe> = {
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
    bold: {
      does: [
        "Each time this agent is handed a grid, it collects every cell whose mirror twin holds a",
        "different number and fixes two of them in one turn. Faster, but a bigger turn costs more energy.",
      ],
      tryThis: "Try this: change the 2 in the last line to 1 for cheaper turns, or to 3 for bigger ones.",
      python: c => `
        def agent(grid):
            moves = []
            for cell in grid.cells:
                twin = ${twin(c)}  # the cell that mirrors it
                if ${before(c)} and twin.value != cell.value:
                    moves.append(${c.pen.set("twin", "cell.value")})
            return moves[:2]  # at most two changes a turn`,
      typescript: c => `
        function agent(grid) {
          const moves = [];
          for (const cell of grid.cells) {
            const twin = ${twin(c)}; // the cell that mirrors it
            if (${before(c)} && twin.value !== cell.value) moves.push(${c.pen.set("twin", "cell.value")});
          }
          return moves.slice(0, 2); // at most two changes a turn
        }`,
    },
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
    bold: {
      does: [
        "Each time this agent is handed a grid, it finds in each row the first cell and right-hand",
        "neighbour that do not add up to TARGET, and fixes two rows in one turn. A bigger turn costs more energy.",
      ],
      tryThis: "Try this: change the 2 in the last line to 1 for cheaper turns, or to 3 for bigger ones.",
      python: c => `
        def agent(grid):
            moves = []
            for row in grid.rows:
                for cell in row[:-1]:  # every cell that has a right-hand neighbour
                    if ${fits(c, "and")} and cell.value + cell.right.value != ${target(c, 10)}:
                        moves.append(${c.pen.set("cell.right", `${target(c, 10)} - cell.value`)})
                        break  # one change per row
            return moves[:2]  # at most two changes a turn`,
      typescript: c => `
        function agent(grid) {
          const moves = [];
          for (const row of grid.rows) {
            const cell = row.find((cell) => cell.right && ${fits(c, "&&")} && cell.value + cell.right.value !== ${target(c, 10)});
            if (cell && cell.right) moves.push(${c.pen.set("cell.right", `${target(c, 10)} - cell.value`)}); // one change per row
          }
          return moves.slice(0, 2); // at most two changes a turn
        }`,
    },
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
    bold: {
      does: [
        "Each time this agent is handed a grid, it finds every LINE that does not add up to TARGET,",
        "and closes the gap in two of them in one turn. Faster, but a bigger turn costs more energy.",
      ],
      tryThis: "Try this: change the 2 in the last line to 1 for cheaper turns, or to 3 for bigger ones.",
      python: c => `
        def agent(grid):
            moves = []
            for ${line(c)} in ${lines(c)}:
                gap = ${target(c, 18)}  # how far this ${line(c)} is from the magic number
                for cell in ${line(c)}:
                    gap -= cell.value
                for cell in ${line(c)}:
                    new = min(${c.hi}, max(${c.lo}, cell.value + gap))
                    if new != cell.value:
                        moves.append(${c.pen.set("cell", "new")})
                        break  # one change per ${line(c)}
            return moves[:2]  # at most two changes a turn`,
      typescript: c => `
        function agent(grid) {
          const moves = [];
          for (const ${line(c)} of ${lines(c)}) {
            let gap = ${target(c, 18)}; // how far this ${line(c)} is from the magic number
            for (const cell of ${line(c)}) gap -= cell.value;
            const cell = ${line(c)}.find((cell) => Math.min(${c.hi}, Math.max(${c.lo}, cell.value + gap)) !== cell.value);
            if (cell) moves.push(${c.pen.set("cell", `Math.min(${c.hi}, Math.max(${c.lo}, cell.value + gap))`)}); // one change per ${line(c)}
          }
          return moves.slice(0, 2); // at most two changes a turn
        }`,
    },
  },
};
const DIGITS = (c: Ctx) => c.lo === 0 && c.hi === 9;
RECIPES.magic_eighteen = RECIPES.magic_accountant!;
Object.assign(RECIPES, {
  opposite_nines: {
    name: "Nine maker", usual: 9, fitsBoard: c => target(c, 9) === c.lo + c.hi,
    does: [
      "Each time this agent is handed a grid, it finds a cell and its opposite (the cell a half turn",
      "of the board away) that do not add up to TARGET, and changes the opposite so that they do.",
    ],
    tryThis: "Try this: in the line that returns a move, swap cell and twin to change the first cell instead.",
    python: c => `
      def agent(grid):
          # Reading the cells backwards gives each cell's opposite: first with last, second with second-last.
          for cell, twin in zip(grid.cells, reversed(grid.cells)):
              if cell.value + twin.value != ${target(c, 9)}:
                  return [${c.pen.set("twin", `${target(c, 9)} - cell.value`)}]`,
    typescript: c => `
      function agent(grid) {
        for (const cell of grid.cells) {
          const twin = grid.cell(${c.size - 1} - cell.row, ${c.size - 1} - cell.col); // its opposite
          if (cell.value + twin.value !== ${target(c, 9)}) return [${c.pen.set("twin", `${target(c, 9)} - cell.value`)}];
        }
        return []; // every pair adds up: skip and save energy
      }`,
  },
  leapfrog: {
    name: "Leap maker", fitsBoard: c => c.lo === 0 && c.size >= 3,
    does: [
      "Each time this agent is handed a grid, it finds a cell and the cell two to its right that",
      "are not exactly one apart, and changes the far one to one less than the near one (1 beside a 0).",
    ],
    tryThis: c => (c.i.language === "python"
      ? "Try this: loop over reversed(grid.rows) to start from the bottom row."
      : "Try this: loop over grid.cells.reverse() to start from the bottom row."),
    python: c => `
      def agent(grid):
          for row in grid.rows:
              # row[2:] starts two cells along, so each cell is paired with the one two to its right.
              for cell, far in zip(row, row[2:]):
                  if abs(cell.value - far.value) != 1:
                      return [${c.pen.set("far", "abs(cell.value - 1)")}]`,
    typescript: c => `
      function agent(grid) {
        for (const cell of grid.cells) {
          if (cell.col >= ${c.size - 2}) continue;
          const far = grid.cell(cell.row, cell.col + 2); // two cells to the right
          if (Math.abs(cell.value - far.value) !== 1) return [${c.pen.set("far", "Math.abs(cell.value - 1)")}];
        }
        return []; // every pair is one apart: skip and save energy
      }`,
  },
  crosswise_threes: {
    name: "Three apart", usual: 3, fitsBoard: c => c.hi - c.lo >= 6,
    does: [
      "Each time this agent is handed a grid, it finds a cell and its partner across the diagonal",
      "(top-right to bottom-left) that are not exactly APART apart, and changes the partner.",
    ],
    tryThis: "Try this: in the line that returns a move, swap + and - (and < for >) to prefer smaller numbers.",
    python: c => `
      def agent(grid):
          for cell in grid.cells:
              if cell.row + cell.col < ${c.size - 1}:
                  partner = grid.cell(${c.size - 1} - cell.col, ${c.size - 1} - cell.row)  # across the diagonal
                  if abs(cell.value - partner.value) != ${apart(c)}:
                      return [${c.pen.set("partner", `cell.value + ${apart(c)} if cell.value < ${c.hi - apart(c) + 1} else cell.value - ${apart(c)}`)}]`,
    typescript: c => `
      function agent(grid) {
        for (const cell of grid.cells) {
          if (cell.row + cell.col >= ${c.size - 1}) continue;
          const partner = grid.cell(${c.size - 1} - cell.col, ${c.size - 1} - cell.row); // across the diagonal
          if (Math.abs(cell.value - partner.value) !== ${apart(c)}) return [${c.pen.set("partner", `cell.value < ${c.hi - apart(c) + 1} ? cell.value + ${apart(c)} : cell.value - ${apart(c)}`)}];
        }
        return []; // every pair is right: skip and save energy
      }`,
  },
  two_pair: {
    name: "Pair maker", fitsBoard: c => DIGITS(c) && c.size % 2 === 0,
    does: [
      "Each time this agent is handed a grid, it looks at each cell's 2 by 2 corner box. It copies the cell's",
      "number onto the cell diagonally across the box, and makes the cell beside it different.",
    ],
    tryThis: "Try this: change the + 1 to + 2 to choose a different second number for each box.",
    python: c => `
      def agent(grid):
          for cell in grid.cells:
              # ^ 1 steps to the other row or column of the same box: 0 and 1 swap, 2 and 3 swap.
              across = grid.cell(cell.row ^ 1, cell.col ^ 1)
              if across.value != cell.value:
                  return [${c.pen.set("across", "cell.value")}]
              beside = grid.cell(cell.row, cell.col ^ 1)
              if beside.value == cell.value:
                  return [${c.pen.set("beside", "(cell.value + 1) % 10")}]`,
    typescript: c => `
      function agent(grid) {
        for (const cell of grid.cells) {
          // ^ 1 steps to the other row or column of the same box: 0 and 1 swap, 2 and 3 swap.
          const across = grid.cell(cell.row ^ 1, cell.col ^ 1);
          if (across.value !== cell.value) return [${c.pen.set("across", "cell.value")}];
          const beside = grid.cell(cell.row, cell.col ^ 1);
          if (beside.value === cell.value) return [${c.pen.set("beside", "(cell.value + 1) % 10")}];
        }
        return []; // every box holds two pairs: skip and save energy
      }`,
  },
  strangers: {
    name: "Stranger maker", fitsBoard: c => DIGITS(c) && c.size % 2 === 0,
    does: [
      "Each time this agent is handed a grid, it looks at each cell's 2 by 2 corner box. Numbers 0, 1, 5 and 6",
      "have no good stranger, so it moves them up by 2; then it makes the two touching cells 5 away.",
    ],
    tryThis: "Try this: change both + 5 to + 3. Which pairs does your goal card still count?",
    python: c => `
      def agent(grid):
          for cell in grid.cells:
              if cell.value % 5 < 2:
                  return [${c.pen.set("cell", "cell.value + 2")}]
              # ^ 1 steps to the other row or column of the same box: 0 and 1 swap, 2 and 3 swap.
              for other in (grid.cell(cell.row, cell.col ^ 1), grid.cell(cell.row ^ 1, cell.col)):
                  if other.value != (cell.value + 5) % 10:
                      return [${c.pen.set("other", "(cell.value + 5) % 10")}]`,
    typescript: c => `
      function agent(grid) {
        for (const cell of grid.cells) {
          if (cell.value % 5 < 2) return [${c.pen.set("cell", "cell.value + 2")}];
          // ^ 1 steps to the other row or column of the same box: 0 and 1 swap, 2 and 3 swap.
          for (const other of [grid.cell(cell.row, cell.col ^ 1), grid.cell(cell.row ^ 1, cell.col)]) {
            if (other.value !== (cell.value + 5) % 10) return [${c.pen.set("other", "(cell.value + 5) % 10")}];
          }
        }
        return []; // every pair is a pair of strangers: skip and save energy
      }`,
  },
  spread_three: {
    name: "Spread keeper", usual: 3, fitsBoard: c => c.hi - c.lo >= 6,
    does: [
      "Each time this agent is handed a grid, it finds a 2 by 2 square whose biggest and smallest numbers",
      "are not exactly SPREAD apart. It lowers a number that is too big, or moves the square's last corner.",
    ],
    tryThis: "Try this: change square[3] to square[0] to move the first corner instead of the last.",
    python: c => `
      def agent(grid):
          for cell in grid.cells:
              if cell.right and cell.down:
                  square = [cell, cell.right, cell.down, grid.cell(cell.row + 1, cell.col + 1)]
                  low = min(c.value for c in square)
                  high = max(c.value for c in square)
                  for c in square:
                      if c.value > low + ${spread(c)}:
                          return [${c.pen.set("c", `low + ${spread(c)}`)}]
                  if high < low + ${spread(c)}:
                      return [${c.pen.set("square[3]", `low + ${spread(c)} if low < ${c.hi - spread(c) + 1} else high - ${spread(c)}`)}]`,
    typescript: c => `
      function agent(grid) {
        for (const cell of grid.cells) {
          if (!cell.right || !cell.down) continue;
          const square = [cell, cell.right, cell.down, grid.cell(cell.row + 1, cell.col + 1)];
          const low = Math.min(...square.map((c) => c.value)), high = Math.max(...square.map((c) => c.value));
          const big = square.find((c) => c.value > low + ${spread(c)});
          if (big) return [${c.pen.set("big", `low + ${spread(c)}`)}];
          if (high < low + ${spread(c)}) return [${c.pen.set("square[3]", `low < ${c.hi - spread(c) + 1} ? low + ${spread(c)} : high - ${spread(c)}`)}];
        }
        return []; // every square is right: skip and save energy
      }`,
  },
} satisfies Record<string, Recipe>);
const MORE = "Want more? Summon the thorough version later, when you have more energy.";
const TINY: Record<string, NonNullable<Recipe["tiny"]>> = {
  opposite_nines: {
    does: [
      "Each time this agent is handed a grid, it pairs the first cell with the last, the second with the",
      "second-last, and so on (each cell with its opposite), and fixes the first pair that does not add up to TARGET.",
    ],
    tryThis: `Try this: in the line that returns a move, swap cell and twin to change the first cell instead. ${MORE}`,
    python: c => `
      def agent(grid):
          cells = grid.cells
          for cell in cells:
              twin = cells.pop()  # takes the last cell off the list: the opposite of this one
              if cell.value + twin.value != ${target(c, 9)}:
                  return [${c.pen.set("twin", `${target(c, 9)} - cell.value`)}]`,
    typescript: c => `
      function agent(grid) {
        const cells = grid.cells;
        for (const cell of cells) {
          const twin = cells.pop(); // takes the last cell off the list: the opposite of this one
          if (twin && cell.value + twin.value !== ${target(c, 9)}) return [${c.pen.set("twin", `${target(c, 9)} - cell.value`)}];
        }
        return []; // every pair adds up: skip and save energy
      }`,
  },
  two_pair: {
    does: [
      "Each time this agent is handed a grid, it finds a cell in an even column whose right-hand neighbour",
      "holds a different number, and copies its number there. Each corner box ends up as two pairs side by side.",
    ],
    tryThis: `Try this: change cell.right to cell.down and cell.col to cell.row to stack the pairs instead. ${MORE}`,
    python: c => `
      def agent(grid):
          for cell in grid.cells:
              if cell.col % 2 == 0 and cell.right.value != cell.value:
                  return [${c.pen.set("cell.right", "cell.value")}]`,
    typescript: c => `
      function agent(grid) {
        for (const cell of grid.cells) {
          const other = cell.right;
          if (cell.col % 2 === 0 && other && other.value !== cell.value) return [${c.pen.set("other", "cell.value")}];
        }
        return []; // every pair matches: skip and save energy
      }`,
  },
  spread_three: {
    does: [
      "Each time this agent is handed a grid, it finds a number below BAND_LO or above BAND_HI and moves it to",
      "BAND_LO or BAND_HI. With every number between BAND_LO and BAND_HI, no square can spread more than SPREAD.",
    ],
    tryThis: `Try this: change the two numbers to another pair SPREAD apart, such as BAND_ALT. ${MORE}`,
    python: c => `
      def agent(grid):
          for cell in grid.cells:
              want = min(${band(c)[1]}, max(${band(c)[0]}, cell.value))
              if want != cell.value:
                  return [${c.pen.set("cell", "want")}]`,
    typescript: c => `
      function agent(grid) {
        for (const cell of grid.cells) {
          const want = Math.min(${band(c)[1]}, Math.max(${band(c)[0]}, cell.value));
          if (want !== cell.value) return [${c.pen.set("cell", "want")}];
        }
        return []; // every number is in the band: skip and save energy
      }`,
  },
  magic_eighteen: {
    // Two numbers that add up to half the target, twice, make the target: only for an even side and an even target.
    fitsBoard: c => c.size === 4 && target(c, 18) === 2 * (c.lo + c.hi),
    does: [
      "Each time this agent is handed a grid, it finds a cell and the next one along its LINE that do not",
      "add up to HALF, and changes the second. Two pairs that add up to HALF make a LINE of TARGET.",
    ],
    tryThis: `Try this: in the line that returns a move, swap cell and other to change the first cell instead. ${MORE}`,
    python: c => `
      def agent(grid):
          for cell in grid.cells:
              other = cell.${next(c)}  # the next cell along the ${line(c)} (None at the end)
              if other and cell.value + other.value != ${target(c, 18) / 2}:
                  return [${c.pen.set("other", `${target(c, 18) / 2} - cell.value`)}]`,
    typescript: c => `
      function agent(grid) {
        for (const cell of grid.cells) {
          const other = cell.${next(c)}; // the next cell along the ${line(c)} (null at the end)
          if (other && cell.value + other.value !== ${target(c, 18) / 2}) return [${c.pen.set("other", `${target(c, 18) / 2} - cell.value`)}];
        }
        return []; // every pair adds up: skip and save energy
      }`,
  },
  leapfrog: {
    fitsBoard: c => c.size === 4 && c.lo === 0 && c.hi % 2 === 1,
    does: [
      "Each time this agent is handed a grid, it finds a row whose first and third numbers are not exactly",
      "one apart, and changes the third. It leaves the second and fourth numbers of each row alone.",
    ],
    tryThis: `Try this: name the second and fourth cells instead of the first and third. ${MORE}`,
    python: c => `
      def agent(grid):
          for first, _, third, _ in grid.rows:
              if abs(first.value - third.value) != 1:
                  # ^ 1 gives the number one away: 0 and 1 swap, 2 and 3 swap, and so on.
                  return [${c.pen.set("third", "first.value ^ 1")}]`,
    typescript: c => `
      function agent(grid) {
        for (const [first, , third] of grid.rows) {
          // ^ 1 gives the number one away: 0 and 1 swap, 2 and 3 swap, and so on.
          if (Math.abs(first.value - third.value) !== 1) return [${c.pen.set("third", "first.value ^ 1")}];
        }
        return []; // every row is right: skip and save energy
      }`,
  },
  // Strangers and Crosswise Threes have no tiny variant: the shortest agents found that raise the score on every
  // board cost more than a new player's starting energy (a first-pair-per-row Strangers agent at 189 bits left one
  // test board no better; the cheapest Crosswise Threes agent was 225).
};
for (const [id, tiny] of Object.entries(TINY)) RECIPES[id] = { ...RECIPES[id]!, tiny };
/** Spread of Three's band: the middle numbers SPREAD apart (3 and 6 on digits). */
function band(c: Ctx): [number, number] {
  const low = Math.floor((c.lo + c.hi - spread(c)) / 2);
  return [low, low + spread(c)];
}
/** The next cell along a scored line: to the right in a row, below in a column. */
const next = (c: Ctx) => (isColumns(c) ? "down" : "right");
function apart(c: Ctx): number { return cardConst(c.i.cardSource, "APART") ?? 3; }
function spread(c: Ctx): number { return cardConst(c.i.cardSource, "SPREAD") ?? 3; }

/** The goal card's TARGET constant, else the dealt `target` param, else the family's usual one. */
function target(c: Ctx, usual: number): number {
  const dealt = c.i.params?.target;
  return cardConst(c.i.cardSource, "TARGET") ?? (typeof dealt === "number" ? dealt : usual);
}
/** The cell across the mirror: the same row on the other side, or the same column for top-to-bottom mirrors. */
const twin = (c: Ctx) => (isColumns(c) ? `grid.cell(${c.size - 1} - cell.row, cell.col)` : `grid.cell(cell.row, ${c.size - 1} - cell.col)`);
/** Mirrormancer's bold variant visits each pair once: only from the cell that comes first (left, or top). */
const before = (c: Ctx) => (isColumns(c) ? "cell.row < twin.row" : "cell.col < twin.col");
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

/** Under every "Try this": a comment only (comments cost nothing, so no summon price moves). */
const EXPERIMENT = "It may do better or worse: watch your points after Replace.";
function render(i: ExampleInput, p: Pen, recipe: Recipe, variant: Variant, name: string): ExampleAgent {
  const goal = firstSentence(i.summary);
  const c = ctxOf(i, p);
  const mark = i.language === "python" ? "#" : "//";
  const tryThis = typeof variant.tryThis === "function" ? variant.tryThis(c) : variant.tryThis;
  const words = (text: string) => text.replaceAll("LINE", line(c)).replace("TARGET", String(target(c, recipe.usual ?? 10)))
    .replaceAll("BAND_LO", String(band(c)[0])).replaceAll("BAND_HI", String(band(c)[1])).replace("BAND_ALT", `${band(c)[0] - 1} and ${band(c)[1] - 1}`)
    .replace("HALF", String(target(c, recipe.usual ?? 10) / 2)).replace("HALF", String(target(c, recipe.usual ?? 10) / 2))
    .replace("LO", String(c.lo)).replace("HI", String(c.hi)).replace("APART", String(apart(c))).replaceAll("SPREAD", String(spread(c)));
  // The player's first view of the API: how to read a number and how to change one, in the board's own words.
  const api = `cell.value reads a cell's number; ${p.mutator === "add" ? "add(cell, 1) adds one to it" : "write(cell, 5) changes it to 5"}.`;
  // The first edit is an experiment: it may make the agent worse (said the same way in every room, so it promises no panel).
  const head = [...(goal ? [`My goal: ${goal}`] : []), ...variant.does.map(words), api, words(tryThis), EXPERIMENT].map(l => `${mark} ${l}`);
  return { name, source: `${head.join("\n")}\n${dedent(variant[i.language](c))}\n`, specific: recipe !== FALLBACK };
}
function recipeFor(i: ExampleInput, p: Pen): Recipe {
  const recipe = Object.hasOwn(RECIPES, i.familyId) ? RECIPES[i.familyId]! : FALLBACK;
  return recipe.fitsBoard && !recipe.fitsBoard(ctxOf(i, p)) ? FALLBACK : recipe;
}
const ctxOf = (i: ExampleInput, p: Pen): Ctx => ({ i, pen: p, lo: i.minValue ?? 0, hi: i.maxValue ?? 9, size: i.size ?? 4 });

/** The family's tiny variant when it has one that fits this board. */
function tinyOf(i: ExampleInput, p: Pen, recipe: Recipe): Variant | undefined {
  return recipe.tiny && (!recipe.tiny.fitsBoard || recipe.tiny.fitsBoard(ctxOf(i, p))) ? recipe.tiny : undefined;
}

/**
 * The example agent for a goal, from plain data (what a client has on the goal card): the first of starterAgents.
 * Total: never throws.
 */
export function buildExampleAgent(i: ExampleInput): ExampleAgent {
  const { name, source, specific } = starterAgents(i)[0]!;
  return { name, source, specific };
}

/** One ready-made agent a player can pick without writing code. */
export interface StarterAgent extends ExampleAgent {
  /** "tiny", "thorough", "bold", or "careful" when the family has one agent that is both short and complete. */
  readonly id: string;
  /** One word for the choice, and one plain sentence saying what it does differently. */
  readonly title: string;
  readonly blurb: string;
}
/**
 * The ready-made agents for a goal; the first is the example the forge pre-fills. A family with a tiny variant offers
 * it first ("Simple": short enough to pay for at once) and its full recipe second ("Thorough"); otherwise the recipe
 * alone ("Careful"). Families with a bold variant add it last. There is no "undo what hurts me" starter: an agent
 * sees one object as it is now, never what it was, so it cannot tell a change that hurt from a board that started
 * that way. Never empty.
 */
export function starterAgents(i: ExampleInput): StarterAgent[] {
  const p = pen(i.mutators);
  if (!p) return [{ ...skipper(i, firstSentence(i.summary)), id: "careful", title: "Careful", blurb: "A starter that does nothing yet." }];
  const recipe = recipeFor(i, p), tiny = tinyOf(i, p, recipe);
  const full = render(i, p, recipe, recipe, recipe.name);
  const out: StarterAgent[] = [];
  if (tiny) {
    out.push({ ...render(i, p, recipe, tiny, `Simple ${recipe.name.toLowerCase()}`), id: "tiny", title: "Simple",
      blurb: "A short agent that costs little to summon and does the simple part of my goal." });
    out.push({ ...full, id: "thorough", title: "Thorough", blurb: "A longer agent that chases every part of my goal. It costs more to summon." });
  } else {
    out.push({ ...full, id: "careful", title: "Careful",
      blurb: full.specific ? "One small change toward my goal each turn." : "A starter that does not chase my goal yet." });
  }
  if (recipe.bold) {
    out.push({ ...render(i, p, recipe, recipe.bold, `Bold ${recipe.name.toLowerCase()}`), id: "bold", title: "Bold",
      blurb: "Two changes toward my goal each turn: faster, but each turn costs more energy." });
  }
  return out;
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
function inputFor(familyId: string, params: Params, inst: Instantiation, language: ExampleLanguage): ExampleInput {
  const info = instanceInfo(inst);
  let summary: string | undefined, cardSource: string | undefined;
  try {
    const f = family(familyId), ctx = context(inst);
    summary = f.summary(params, ctx);
    cardSource = f.card[language](params, ctx);
  } catch { /* an unknown family or params it does not take: the fallback, without a goal line */ }
  return { familyId, params, language, summary, cardSource, mutators: mutatorNames(info, language), ...boardFacts(info) };
}
export function exampleAgent(familyId: string, params: Params, inst: Instantiation, language: ExampleLanguage): ExampleAgent {
  return buildExampleAgent(inputFor(familyId, params, inst, language));
}
/** The ready-made agents (starterAgents) for a dealt goal on a board. */
export function starterAgentsFor(familyId: string, params: Params, inst: Instantiation, language: ExampleLanguage): StarterAgent[] {
  return starterAgents(inputFor(familyId, params, inst, language));
}
