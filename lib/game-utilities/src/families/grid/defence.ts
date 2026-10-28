/**
 * Penalty families: defence goals (lib/grid-lab/gridlab/rules/defence.py PENALTIES, docs/defence-goals.md).
 *
 * A penalty's ordinal is *badness* (higher = worse). It is never dealt on its own: the selector attaches it to a
 * reward draw as `descriptor.penalty`. Cards define `def penalty(grid):` / `function penalty(grid)` (grid-lab
 * has no penalty cards; these follow defence-goals.md §6). The exemplar is the worst grid.
 */
import type { CardText, GridSpec } from "./_util.ts";
import {
  SCALAR, cname, full, gridFamily, range, symForValue, tsCard, pyCard, tuple, valueNote, wire,
} from "./_util.ts";

const COMPARATIVE_COLOUR: Readonly<Record<string, string>> = {
  red: "redder", green: "greener", blue: "bluer", yellow: "yellower", orange: "more orange", violet: "more violet",
};
const valueName = (g: GridSpec, v: number) => (g.cards ? { 1: "ace", 11: "jack", 12: "queen", 13: "king" }[v] ?? String(v) : String(v));
const PENALTY = { role: "penalty" as const, tags: ["penalty"] };

// --- Hated colour -------------------------------------------------------------------------------
type ColourP = { colour: number };
const hateColourText = (p: ColourP, g: GridSpec): CardText => ({
  emoji: "🚫", name: "Hated colour", consts: [["HATED_COLOUR", cname(g, p.colour)]],
  about: `You can't stand ${cname(g, p.colour)}. Every ${cname(g, p.colour)} cell is one more bad point. Bigger is worse.`,
});
const hateColour = gridFamily<ColourP>({
  id: "hate_colour", name: "Hated colour", emoji: "🚫", theme: "Hates one colour", ...PENALTY, shape: SCALAR,
  comparative: (p, g) => COMPARATIVE_COLOUR[cname(g, p.colour)] ?? `more ${cname(g, p.colour)}`,
  support: g => range(g.C).map(colour => ({ colour })),
  canonical: () => ({ colour: 0 }),
  summary: (p, g) => `−1 for each ${cname(g, p.colour)} cell`,
  python: (p, g) => pyCard(hateColourText(p, g), `
    def penalty(grid):
        bad = 0
        for cell in grid.cells:
            if cell.colour == HATED_COLOUR:
                bad += 1
        return bad`),
  typescript: (p, g) => tsCard(hateColourText(p, g), `
    function penalty(grid) {
      let bad = 0;
      for (const cell of grid.cells) {
        if (cell.colour === HATED_COLOUR) bad += 1;
      }
      return bad;
    }`),
  exemplar: (p, g) => wire(g, full(g.N, 0), full(g.N, p.colour)),
});

// --- Hated number ---------------------------------------------------------------------------------
type ValueP = { value: number };
const hateValueText = (p: ValueP, g: GridSpec): CardText => ({
  emoji: "🙅", name: "Hated number", consts: [["HATED_VALUE", p.value, valueNote(g, p.value)]],
  about: `You want ${valueName(g, p.value)}s kept off the board. Every cell worth ${p.value} is one more bad point. `
    + "Bigger is worse.",
});
const hateValue = gridFamily<ValueP>({
  id: "hate_value", name: "Hated number", emoji: "🙅", theme: "Hates one number", ...PENALTY, shape: SCALAR,
  comparative: (p, g) => `fuller of ${valueName(g, p.value)}s`,
  support: g => [...new Set(g.value)].sort((a, b) => a - b).map(value => ({ value })),
  // every value has the same share of the symbol set (digits 1/S, cards 4/52), so all values are one orbit
  canonical: (_, g) => ({ value: g.vmin }),
  summary: (p, g) => `−1 for each ${valueName(g, p.value)}`,
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
type BlobP = { C: number };
const hateBlobText = (p: BlobP, g: GridSpec): CardText => ({
  emoji: "🫧", name: "Hated patch", consts: [["HATED_COLOUR", cname(g, p.C)]],
  about: `You hate big ${cname(g, p.C)} patches. Your bad points are the size of the biggest joined-up `
    + `${cname(g, p.C)} patch. Bigger is worse.`,
});
const hateBlob = gridFamily<BlobP>({
  id: "hate_blob", name: "Hated patch", emoji: "🫧", theme: "Hates a big patch of one colour", ...PENALTY, shape: SCALAR,
  comparative: (p, g) => `with a bigger ${cname(g, p.C)} patch`,
  support: g => range(g.C).map(C => ({ C })),
  canonical: () => ({ C: 0 }),
  summary: (p, g) => `−1 for each cell in the biggest joined-up ${cname(g, p.C)} patch`,
  python: (p, g) => pyCard(hateBlobText(p, g), `
    def same_colour(a, b):
        return a.colour == b.colour

    def penalty(grid):
        biggest = 0
        for patch in grid.regions(same_colour):
            if patch[0].colour == HATED_COLOUR:
                biggest = max(biggest, len(patch))
        return biggest`),
  typescript: (p, g) => tsCard(hateBlobText(p, g), `
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
  exemplar: (p, g) => wire(g, full(g.N, 0), full(g.N, p.C)),
});

// --- Takeover ---------------------------------------------------------------------------------------
const takeoverText: CardText = {
  emoji: "🏴", name: "Takeover", consts: [],
  about: "No colour may take over. Your bad points are how many cells the commonest colour has. Bigger is worse.",
};
const hateTakeover = gridFamily<Record<string, never>>({
  id: "hate_takeover", name: "Takeover", emoji: "🏴", theme: "Hates one colour taking over", ...PENALTY, shape: SCALAR,
  comparative: () => "more taken over by one colour",
  support: () => [{}],
  summary: () => "−1 for each cell of whichever colour is commonest",
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
});

// --- Big blobs ----------------------------------------------------------------------------------------
const bigBlobText: CardText = {
  emoji: "🫠", name: "Big blobs", consts: [],
  about: "You hate blobs. Your bad points are the size of the biggest joined-up patch of one colour (any colour). "
    + "Bigger is worse.",
};
const hateBigBlob = gridFamily<Record<string, never>>({
  id: "hate_big_blob", name: "Big blobs", emoji: "🫠", theme: "Hates big blobs of any colour", ...PENALTY, shape: SCALAR,
  comparative: () => "blobbier",
  support: () => [{}],
  summary: () => "−1 for each cell in the biggest joined-up patch of one colour (any colour)",
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
  about: "Keep the corners varied. Your bad points are how many corners share the commonest corner colour; if "
    + `that's a tie, how many share the commonest ${g.cards ? "rank" : "number"}. Bigger is worse.`,
});
const hateSameCorners = gridFamily<Record<string, never>>({
  id: "hate_same_corners", name: "Matching corners", emoji: "📐", theme: "Hates matching corners", ...PENALTY,
  comparative: () => "more alike in the corners",
  shape: tuple(2),
  support: () => [{}],
  summary: () => "−1 for each corner that shares the commonest corner colour (then the commonest number)",
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
  about: "Protect the rainbow row. Your bad points are the colours missing from your row (one per repeat); if that's "
    + "a tie, the pairs of side-by-side cells there with the same colour. Bigger is worse.",
});
const hateRepeatRow = gridFamily<RowP>({
  id: "hate_repeat_row", name: "Repeats in the row", emoji: "🔁", theme: "Hates repeats in one row", ...PENALTY,
  comparative: () => "more repetitive in that row",
  shape: tuple(2),
  support: g => range(g.N).map(row => ({ row })),
  canonical: () => ({ row: 0 }), // permuting rows preserves the prior; the rule reads one row
  summary: p => `−1 for each repeated colour in row ${p.row + 1} `
    + "(then for each pair of side-by-side cells there with the same colour)",
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
  about: `No ${g.cards ? "rank" : "number"} may take over. Your bad points are how many cells show the commonest `
    + `${g.cards ? "rank" : "number"}. Bigger is worse.`,
});
const hateSymbolTakeover = gridFamily<Record<string, never>>({
  id: "hate_symbol_takeover", name: "Number crowd", emoji: "👥", theme: "Hates one number taking over", ...PENALTY,
  comparative: () => "more crowded with one number",
  shape: SCALAR,
  support: () => [{}],
  summary: () => "−1 for each copy of whichever number is commonest",
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
