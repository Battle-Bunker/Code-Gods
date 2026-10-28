// Trusted declarations for the Grid prelude (grid/prelude.js), as a TypeScript agent sees them.
// This is a template: grid/declarations.mjs fills in the colour-name and mutator-id unions and keeps
// the `//#if <capability>` blocks the GridType has (cards, digits, mixable). The worker typechecks
// a Grid agent as `const __agent: (grid: Grid) => MutatorCall[] = (<submission>);` against it.

/** A colour on this grid, as a word, in rainbow order. */
type ColourName = __COLOUR_NAMES__;
/** A colour: its name, or its index in rainbow order (0 is the first colour). */
type Colour = ColourName | number;
/** A symbol: its glyph or wire code ("7", "B", "Q♥", "QH"), or its index. */
type SymbolArg = string | number;
/** A number in counting order: digits as written; cards 1 (ace) to 13 (king), or "A", "2" ... "K". */
type RankArg = string | number;
//#if cards
type Suit = "spades" | "hearts" | "diamonds" | "clubs";
type SuitArg = Suit | "♠" | "♥" | "♦" | "♣" | "S" | "H" | "D" | "C" | number;
//#endif
/** Which layer a positional move acts on: whole cells, only colours, or only symbols. */
type Layer = "both" | "colour" | "symbol";
/** rot90 is a quarter turn anticlockwise; rot270 a quarter turn clockwise. */
type Move = "rot90" | "rot180" | "rot270" | "flipH" | "flipV" | "transpose" | "antitranspose";
type GridFold = "left->right" | "right->left" | "top->bottom" | "bottom->top"
  | "below->above diagonal" | "above->below diagonal" | "below->above other diagonal" | "above->below other diagonal";
/** Rows fold "left->right" or "right->left"; columns "top->bottom" or "bottom->top" (or 0 / 1). */
type LineFold = "left->right" | "right->left" | "top->bottom" | "bottom->top" | 0 | 1;
type Wallpaper = "stripes across" | "stripes down" | "diagonal" | "other diagonal";
type MutatorId = __MUTATOR_IDS__;

/** One square of the grid. Rows and columns count from 0 at the top-left. */
interface Cell {
  readonly row: number;
  readonly col: number;
  /** What's printed on it: "7", "B", "K♥". */
  readonly symbol: string;
  /** Points the symbol is worth: digits as is; cards A = 1 .. K = 13. */
  readonly value: number;
  readonly colour: ColourName;
  readonly left: Cell | null;
  readonly right: Cell | null;
  readonly up: Cell | null;
  readonly down: Cell | null;
  readonly upLeft: Cell | null;
  readonly upRight: Cell | null;
  readonly downLeft: Cell | null;
  readonly downRight: Cell | null;
  /** The 2 to 4 cells touching its sides. */
  readonly neighbours: Cell[];
  /** The 3 to 8 cells around it, corners included. */
  readonly surrounding: Cell[];
  readonly onEdge: boolean;
//#if cards
  readonly suit: Suit;
  /** True for J, Q and K. */
  readonly isPicture: boolean;
//#endif
}

/** The read-only grid an agent is given. Change it only by returning moves. */
interface Grid {
  readonly size: number;
  /** Every cell, row by row from the top-left. */
  readonly cells: Cell[];
  readonly rows: Cell[][];
  readonly columns: Cell[][];
  /** Top-left to bottom-right, then top-right to bottom-left. */
  readonly diagonals: Cell[][];
  readonly edgeCells: Cell[];
  readonly palette: ColourName[];
  cell(row: number, col: number): Cell;
  /** Where `cell` lands if the whole grid turns a quarter turn clockwise. */
  quarterTurn(cell: Cell): Cell;
  reachable(start: Cell | readonly Cell[], through: (cell: Cell) => boolean): Cell[];
  regions(same: (a: Cell, b: Cell) => boolean): Cell[][];
}

/** A place on the grid a move acts on. Make one with row(), column(), at(), square(), ... */
interface Region {
  readonly kind: "cell" | "line" | "line*" | "diag" | "block" | "ring" | "core" | "all";
  readonly value: number | readonly number[];
}
/** A place: a region, a cell, or [row, col]. */
type Place = Region | Cell | readonly [number, number];
/** A single cell: a cell, at(row, col), or [row, col]. */
type Position = Cell | Region | readonly [number, number];

declare const __mutatorCall: unique symbol;
/** One move. Only the constructors below make them. */
interface MutatorCall {
  readonly m: MutatorId;
  readonly p: { readonly [field: string]: unknown };
  readonly [__mutatorCall]: true;
}

// --- places --------------------------------------------------------------------------------------
/** Row i (0 is the top row). */
declare function row(i: number): Region;
/** Column i (0 is the left column). */
declare function column(i: number): Region;
/** One cell. */
declare function at(row: number, col: number): Region;
declare function at(cell: Cell | readonly [number, number]): Region;
/** diagonal(0): top-left to bottom-right; diagonal(1): top-right to bottom-left. */
declare function diagonal(i?: 0 | 1): Region;
/** A 2×2 (default) or 3×3 square whose top-left cell is (row, col). */
declare function square(row: number, col: number, size?: number): Region;
declare function square(cell: Cell, size?: number): Region;
/** ring(0) is the outside edge, ring(1) the ring inside it, and so on to the middle. */
declare function ring(depth?: number): Region;
/** Everything except the outside edge (grids at least 4 wide). */
declare function middle(): Region;
declare function everywhere(): Region;
/** Whichever row or column already has the most of what the move puts there. */
declare function busiestLine(): Region;

// --- colour helpers ------------------------------------------------------------------------------
/** The next colour round the rainbow; the last wraps back to the first. */
declare function nextColour(colour: ColourName): ColourName;
//#if mixable
/** The colour two paints make, or null if they don't mix. */
declare function mix(a: ColourName, b: ColourName): ColourName | null;
//#endif

// --- moves ---------------------------------------------------------------------------------------
/** Swap two cells (or just their colours, or just their symbols). */
declare function swapCells(a: Position, b: Position, layer?: Layer): MutatorCall;
/** Slide a row right (or a column down) by k steps, wrapping round; negative k slides back. */
declare function shiftLine(line: Region, k?: number, layer?: Layer): MutatorCall;
/** Read a row or column backwards. */
declare function reverseLine(line: Region, layer?: Layer): MutatorCall;
/** Swap two whole rows, or two whole columns. */
declare function swapLines(a: Region, b: Region): MutatorCall;
/** Turn or flip a square. */
declare function turnBlock(square: Region, move: Move): MutatorCall;
/** Turn or flip the whole grid. */
declare function turnGrid(move: Move): MutatorCall;
/** Sort a row or column into counting order, smallest first (biggest first if backwards). */
declare function sortLine(line: Region, backwards?: boolean): MutatorCall;
/** Copy one half onto the other as a mirror image, of one line or of everywhere(). */
declare function mirrorFold(line: Region, fold: LineFold, layer?: Layer): MutatorCall;
declare function mirrorFold(everywhere: Region, fold: GridFold, layer?: Layer): MutatorCall;
/** Paint a place one colour. */
declare function paint(where: Place, colour: Colour): MutatorCall;
/** Turn every `oldColour` cell in a place into `newColour`. */
declare function recolour(where: Place, oldColour: Colour, newColour: Colour): MutatorCall;
/** Two colours trade places inside a place. */
declare function swapColours(where: Place, a: Colour, b: Colour): MutatorCall;
/** Move every colour in a place k steps along the rainbow, wrapping round. */
declare function hueTurn(where: Place, k?: number): MutatorCall;
/** A rainbow run from `start` along a line ... */
declare function patternLine(line: Region, pattern: "ramp", start: Colour, backwards?: boolean): MutatorCall;
/** ... or two colours alternating. */
declare function patternLine(line: Region, pattern: "alternate", a: Colour, b: Colour): MutatorCall;
/** Wallpaper the whole grid with rainbow stripes ... */
declare function motif(style: Wallpaper, start: Colour, backwards?: boolean): MutatorCall;
/** ... or a chessboard. */
declare function motif(style: "checker", a: Colour, b: Colour): MutatorCall;
/** A row or column votes: every cell takes its most common colour. */
declare function majorityLine(line: Region): MutatorCall;
/** Write one symbol into a place. */
declare function write(where: Place, symbol: SymbolArg): MutatorCall;
/** Count every number in a place on by k, wrapping round (cards keep their suit). */
declare function stepRank(where: Place, k?: number): MutatorCall;
/** Write a counting run along a line from `start` (cards keep their suit). */
declare function writeRamp(line: Region, start: RankArg, backwards?: boolean): MutatorCall;
/** Two numbers trade places inside a place. */
declare function swapSymbols(where: Place, a: RankArg, b: RankArg): MutatorCall;
/** In a place, every number except the highest drops to the lowest one there. */
declare function flatten(where: Place): MutatorCall;
/** Colour cells by what they show: even/odd ... */
declare function paintByKey(where: Place, key: "parity", even: Colour, odd: Colour): MutatorCall;
/** ... or colour = number + shift, round the rainbow. */
declare function paintByKey(where: Place, key: "mod", shift: number): MutatorCall;
//#if cards
/** ... or red suits one colour and black suits another. */
declare function paintByKey(where: Place, key: "redblack", heartsAndDiamonds: Colour, spadesAndClubs: Colour): MutatorCall;
//#endif
/** Every `colour` cell inside a place gets `symbol` stamped on it. */
declare function stamp(where: Place, colour: Colour, symbol: SymbolArg): MutatorCall;
//#if digits
/** `colour` cells are mines; every other cell in the place shows how many mines touch it. */
declare function tally(where: Place, colour: Colour): MutatorCall;
//#endif
//#if mixable
/** Where paints a and b meet, the cells touching both turn the mixed colour. */
declare function blend(where: Place, a: Colour, b: Colour): MutatorCall;
//#endif
//#if cards
/** Two suits trade places inside a place. */
declare function suitSwap(where: Place, a: SuitArg, b: SuitArg): MutatorCall;
/** Every card in a place changes to one suit, keeping its rank. */
declare function suitSet(where: Place, suit: SuitArg): MutatorCall;
//#endif
