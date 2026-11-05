/**
 * Penalty families: defence goals (lib/grid-lab/gridlab/rules/defence.py PENALTIES, docs/defence-goals.md).
 *
 * A penalty's ordinal is *badness* (higher = worse). It is never dealt on its own: the selector attaches it to a
 * reward draw as `descriptor.penalty`. Cards define `def penalty(grid):` / `function penalty(grid)` (grid-lab
 * has no penalty cards; these follow defence-goals.md §6). The exemplar is the worst grid.
 */
import type { CardText, GridSpec } from "./_util.ts";
import {
  SCALAR, colourAt, full, gridFamily, range, symForValue, tsCard, pyCard, tuple, valueNote, wire,
} from "./_util.ts";
import { colourParam, intParam } from "../../params.ts";
import { binomial, exactSurvival, maxOfEqualMultinomial, type AnalyticSurvival } from "../../analytic.ts";
import { solvedAnalytic } from "../../analytic/hook.ts";

const COMPARATIVE_COLOUR: Readonly<Record<string, string>> = {
  red: "redder", green: "greener", blue: "bluer", yellow: "yellower", orange: "more orange", violet: "more violet",
};
const valueName = (g: GridSpec, v: number) => (g.cards ? { 1: "ace", 11: "jack", 12: "queen", 13: "king" }[v] ?? String(v) : String(v));
/** The hated value as the board shows it: "A (10)" or "7" on digits, "Ace (any suit)" on cards. */
const hatedValue = (g: GridSpec, v: number) => (g.cards
  ? `${(({ 1: "Ace", 11: "Jack", 12: "Queen", 13: "King" } as Record<number, string>)[v]) ?? String(v)} (any suit)`
  : g.say.values([v]));
const PENALTY = { role: "penalty" as const, tags: ["penalty"] };

// --- Hated colour -------------------------------------------------------------------------------
type ColourP = { colour: string };
const hateColourText = (p: ColourP): CardText => ({
  emoji: "🚫", name: "Hated colour", consts: [["HATED_COLOUR", p.colour]],
  about: `Try to avoid ${p.colour} cells. Each ${p.colour} cell adds 1 point of badness.`,
});
const hateColour = gridFamily<ColourP>({
  id: "hate_colour", name: "Hated colour", emoji: "🚫", theme: "Hates one colour", ...PENALTY, shape: SCALAR,
  comparative: p => COMPARATIVE_COLOUR[p.colour] ?? `more ${p.colour}`,
  params: () => ({ colour: colourParam("Hated colour") }),
  support: g => g.colourNames.map(colour => ({ colour })),
  canonical: (_, g) => ({ colour: g.colourNames[0] }),
  summary: p => hateColourText(p).about,
  python: p => pyCard(hateColourText(p), `
    def penalty(grid):
        bad = 0
        for cell in grid.cells:
            if cell.colour == HATED_COLOUR:
                bad += 1
        return bad`),
  typescript: p => tsCard(hateColourText(p), `
    function penalty(grid) {
      let bad = 0;
      for (const cell of grid.cells) {
        if (cell.colour === HATED_COLOUR) bad += 1;
      }
      return bad;
    }`),
  exemplar: (p, g) => wire(g, full(g.N, 0), full(g.N, colourAt(g, p.colour))),
  /** Cells are iid, each the hated colour with probability 1/C: the count is Binomial(N², 1/C) (tail-toolkit.md §2). */
  analytic: (_p, g) => exactSurvival("binomial-cells@1", binomial(g.N * g.N, 1 / g.C)),
});

// --- Hated number ---------------------------------------------------------------------------------
type ValueP = { value: number };
const hateValueText = (p: ValueP, g: GridSpec): CardText => ({
  emoji: "🙅", name: "Hated number", consts: [["HATED_VALUE", p.value, valueNote(g, p.value)]],
  about: `Try to avoid ${hatedValue(g, p.value)}. Each cell showing it adds 1 point of badness.`,
});
const hateValue = gridFamily<ValueP>({
  id: "hate_value", name: "Hated number", emoji: "🙅", theme: "Hates one number", ...PENALTY, shape: SCALAR,
  analytic: solvedAnalytic("hate_value"),
  comparative: (p, g) => `fuller of ${valueName(g, p.value)}s`,
  params: g => ({ value: intParam(g.cards ? "Hated value (any suit)" : "Hated number", g.vmin, g.vmax) }),
  support: g => [...new Set(g.value)].sort((a, b) => a - b).map(value => ({ value })),
  // every value has the same share of the symbol set (digits 1/S, cards 4/52), so all values are one orbit
  canonical: (_, g) => ({ value: g.vmin }),
  summary: (p, g) => hateValueText(p, g).about,
  python: (p, g) => pyCard(hateValueText(p, g), `
    def penalty(grid):
        bad = 0
        for cell in grid.cells:
            if cell.value == HATED_VALUE:
                bad += 1
        return bad`),
  typescript: (p, g) => tsCard(hateValueText(p, g), `
    function penalty(grid) {
      let bad = 0;
      for (const cell of grid.cells) {
        if (cell.value === HATED_VALUE) bad += 1;
      }
      return bad;
    }`),
  exemplar: (p, g) => wire(g, full(g.N, symForValue(g, p.value)), full(g.N, 0)),
});

// --- Hated patch (Kingdom as a penalty) -------------------------------------------------------------
type BlobP = { colour: string };
const hateBlobText = (p: BlobP): CardText => ({
  emoji: "🫧", name: "Hated patch", consts: [["HATED_COLOUR", p.colour]],
  about: `Try to avoid a big joined-up ${p.colour} patch. Each cell in the biggest ${p.colour} patch adds 1 point of badness.`,
});
const hateBlob = gridFamily<BlobP>({
  id: "hate_blob", name: "Hated patch", emoji: "🫧", theme: "Hates a big patch of one colour", ...PENALTY, shape: SCALAR,
  comparative: p => `with a bigger ${p.colour} patch`,
  params: () => ({ colour: colourParam("Hated colour") }),
  support: g => g.colourNames.map(colour => ({ colour })),
  canonical: (_, g) => ({ colour: g.colourNames[0] }),
  summary: p => hateBlobText(p).about,
  python: p => pyCard(hateBlobText(p), `
    def same_colour(a, b):
        return a.colour == b.colour

    def penalty(grid):
        biggest = 0
        for patch in grid.regions(same_colour):
            if patch[0].colour == HATED_COLOUR:
                biggest = max(biggest, len(patch))
        return biggest`),
  typescript: p => tsCard(hateBlobText(p), `
    function sameColour(a, b) {
      return a.colour === b.colour;
    }

    function penalty(grid) {
      let biggest = 0;
      for (const patch of grid.regions(sameColour)) {
        if (patch[0].colour === HATED_COLOUR) biggest = Math.max(biggest, patch.length);
      }
      return biggest;
    }`),
  exemplar: (p, g) => wire(g, full(g.N, 0), full(g.N, colourAt(g, p.colour))),
});

// --- Takeover ---------------------------------------------------------------------------------------
const takeoverText: CardText = {
  emoji: "🏴", name: "Takeover", consts: [],
  about: "Try to avoid one colour taking over. Each cell of whichever colour is commonest adds 1 point of badness.",
};
const hateTakeover = gridFamily<Record<string, never>>({
  id: "hate_takeover", name: "Takeover", emoji: "🏴", theme: "Hates one colour taking over", ...PENALTY, shape: SCALAR,
  comparative: () => "more taken over by one colour",
  params: () => ({}),
  support: () => [{}],
  summary: () => takeoverText.about,
  python: () => pyCard(takeoverText, `
    def penalty(grid):
        most = 0
        for colour in grid.palette:
            n = 0
            for cell in grid.cells:
                if cell.colour == colour:
                    n += 1
            most = max(most, n)
        return most`),
  typescript: () => tsCard(takeoverText, `
    function penalty(grid) {
      let most = 0;
      for (const colour of grid.palette) {
        let n = 0;
        for (const cell of grid.cells) {
          if (cell.colour === colour) n += 1;
        }
        most = Math.max(most, n);
      }
      return most;
    }`),
  exemplar: (_, g) => wire(g, full(g.N, 0), full(g.N, 0)),
  /** The largest colour count of N² iid uniform cells: max of multinomial(N²; 1/C, …, 1/C) (tail-toolkit.md §5). */
  analytic: (_p, g): AnalyticSurvival => ({ id: "multinomial-max@1", kind: "exact", levels: maxOfEqualMultinomial(g.N * g.N, g.C) }),
});

// --- Big blobs ----------------------------------------------------------------------------------------
const bigBlobText: CardText = {
  emoji: "🫠", name: "Big blobs", consts: [],
  about: "Try to avoid big blobs. Each cell in the biggest joined-up patch of one colour (any colour) adds 1 point of badness.",
};
const hateBigBlob = gridFamily<Record<string, never>>({
  id: "hate_big_blob", name: "Big blobs", emoji: "🫠", theme: "Hates big blobs of any colour", ...PENALTY, shape: SCALAR,
  comparative: () => "blobbier",
  params: () => ({}),
  support: () => [{}],
  summary: () => bigBlobText.about,
  python: () => pyCard(bigBlobText, `
    def same_colour(a, b):
        return a.colour == b.colour

    def penalty(grid):
        biggest = 0
        for patch in grid.regions(same_colour):
            biggest = max(biggest, len(patch))
        return biggest`),
  typescript: () => tsCard(bigBlobText, `
    function sameColour(a, b) {
      return a.colour === b.colour;
    }

    function penalty(grid) {
      let biggest = 0;
      for (const patch of grid.regions(sameColour)) biggest = Math.max(biggest, patch.length);
      return biggest;
    }`),
  exemplar: (_, g) => wire(g, full(g.N, 0), full(g.N, 0)),
});

// --- Matching corners ---------------------------------------------------------------------------------
const cornersText = (g: GridSpec): CardText => ({
  emoji: "📐", name: "Matching corners", consts: [],
  about: "Try to avoid matching corners. Each corner that shares the commonest corner colour adds 1 primary point of badness. "
    + `Each corner that shares the commonest ${g.cards ? "rank" : "number"} adds 1 secondary point of badness.`,
});
const hateSameCorners = gridFamily<Record<string, never>>({
  id: "hate_same_corners", name: "Matching corners", emoji: "📐", theme: "Hates matching corners", ...PENALTY,
  analytic: solvedAnalytic("hate_same_corners"),
  comparative: () => "more alike in the corners",
  shape: tuple(2),
  params: () => ({}),
  support: () => [{}],
  summary: (_, g) => cornersText(g).about,
  python: (_, g) => pyCard(cornersText(g), `
    def most_alike(things):
        best = 0
        for x in things:
            best = max(best, things.count(x))
        return best

    def penalty(grid):
        n = grid.size - 1
        corners = [grid.cell(0, 0), grid.cell(0, n), grid.cell(n, 0), grid.cell(n, n)]
        colours = [cell.colour for cell in corners]
        values = [cell.value for cell in corners]
        return (most_alike(colours), most_alike(values))`),
  typescript: (_, g) => tsCard(cornersText(g), `
    function mostAlike(things) {
      let best = 0;
      for (const x of things) best = Math.max(best, things.filter(y => y === x).length);
      return best;
    }

    function penalty(grid) {
      const n = grid.size - 1;
      const corners = [grid.cell(0, 0), grid.cell(0, n), grid.cell(n, 0), grid.cell(n, n)];
      const colours = corners.map(cell => cell.colour);
      const values = corners.map(cell => cell.value);
      return [mostAlike(colours), mostAlike(values)];
    }`),
  exemplar: (_, g) => wire(g, full(g.N, 0), full(g.N, 0)),
});

// --- Repeats in a row ---------------------------------------------------------------------------------
type RowP = { row: number };
const repeatText = (p: RowP): CardText => ({
  emoji: "🔁", name: "Repeats in the row", consts: [["MY_ROW", p.row, "rows count from 0 at the top"]],
  about: `Try to avoid repeats in row ${p.row + 1}. Each repeated colour in that row adds 1 primary point of badness. `
    + "Each pair of side-by-side cells in it with the same colour adds 1 secondary point of badness.",
});
const hateRepeatRow = gridFamily<RowP>({
  id: "hate_repeat_row", name: "Repeats in the row", emoji: "🔁", theme: "Hates repeats in one row", ...PENALTY,
  analytic: solvedAnalytic("hate_repeat_row"),
  comparative: () => "more repetitive in that row",
  shape: tuple(2),
  params: g => ({ row: intParam("Row (0 is the top row)", 0, g.N - 1) }),
  support: g => range(g.N).map(row => ({ row })),
  canonical: () => ({ row: 0 }), // permuting rows preserves the prior; the rule reads one row
  summary: p => repeatText(p).about,
  python: p => pyCard(repeatText(p), `
    def penalty(grid):
        row = grid.rows[MY_ROW]
        colours = []
        for cell in row:
            if cell.colour not in colours:
                colours.append(cell.colour)
        repeats = 0
        for i in range(len(row) - 1):
            if row[i].colour == row[i + 1].colour:
                repeats += 1
        return (len(row) - len(colours), repeats)`),
  typescript: p => tsCard(repeatText(p), `
    function penalty(grid) {
      const row = grid.rows[MY_ROW];
      const colours = [];
      for (const cell of row) {
        if (!colours.includes(cell.colour)) colours.push(cell.colour);
      }
      let repeats = 0;
      for (let i = 0; i < row.length - 1; i++) {
        if (row[i].colour === row[i + 1].colour) repeats += 1;
      }
      return [row.length - colours.length, repeats];
    }`),
  exemplar: (_, g) => wire(g, full(g.N, 0), full(g.N, 0)),
});

// --- Number crowd -------------------------------------------------------------------------------------
const crowdText = (g: GridSpec): CardText => ({
  emoji: "👥", name: "Number crowd", consts: [],
  about: `Try to avoid one ${g.cards ? "rank" : "number"} taking over. Each copy of whichever ${g.cards ? "rank (any suit)" : "number"} is commonest adds 1 point of badness.`,
});
const hateSymbolTakeover = gridFamily<Record<string, never>>({
  id: "hate_symbol_takeover", name: "Number crowd", emoji: "👥", theme: "Hates one number taking over", ...PENALTY,
  analytic: solvedAnalytic("hate_symbol_takeover"),
  comparative: () => "more crowded with one number",
  shape: SCALAR,
  params: () => ({}),
  support: () => [{}],
  summary: (_, g) => crowdText(g).about,
  python: (_, g) => pyCard(crowdText(g), `
    def penalty(grid):
        most = 0
        for cell in grid.cells:
            n = 0
            for other in grid.cells:
                if other.value == cell.value:
                    n += 1
            most = max(most, n)
        return most`),
  typescript: (_, g) => tsCard(crowdText(g), `
    function penalty(grid) {
      let most = 0;
      for (const cell of grid.cells) {
        let n = 0;
        for (const other of grid.cells) {
          if (other.value === cell.value) n += 1;
        }
        most = Math.max(most, n);
      }
      return most;
    }`),
  exemplar: (_, g) => wire(g, full(g.N, 0), full(g.N, 0)),
});

export const PENALTIES = [hateColour, hateValue, hateBlob, hateTakeover, hateBigBlob, hateSameCorners, hateRepeatRow,
  hateSymbolTakeover];
