/** Geometry & topology lens rules (lib/grid-lab/gridlab/rules/geometry.py, cards from rules/cards.py). */
import type { CardText, GridSpec } from "./_util.ts";
import {
  SCALAR, SUIT_NAMES, an, bestOf, cap, climb, cname, colourPairs, fromFn, full, gridFamily, isRim, pick, product,
  pyCard, range, recipes, recolour, symForValue, tsCard, tuple, wire,
} from "./_util.ts";
import { solvedAnalytic } from "../../analytic/hook.ts";
import { LONGEST_SNAKES } from "../../analytic/maxima.ts";

const other = (g: GridSpec, ...cs: number[]) => range(g.C).find(k => !cs.includes(k))!;

// --- Castle Keeper ---------------------------------------------------------------------------------
type CastleP = { W: number; mode: "plain" | "treasure" | "eyes"; T: number | null };
function castleText(p: CastleP, g: GridSpec): CardText {
  const W = cname(g, p.W);
  const tail = `If that's a tie, more ${W} wall on the edge is better.`;
  if (p.mode === "treasure") {
    return {
      emoji: "🏯", name: "Castle Keeper", consts: [["WALL", W], ["TREASURE", cname(g, p.T!)]],
      about: `Build ${W} walls. Every ${cname(g, p.T!)} treasure cell that the walls shut off from the edge of the grid `
        + `scores a point. ${tail}`,
    };
  }
  return {
    emoji: "🏯", name: "Castle Keeper", consts: [["WALL", W]],
    about: p.mode === "eyes"
      ? `Build ${W} walls. Every cell the walls shut off from the edge of the grid scores a point, and every separate `
        + `pocket of them scores 3 more. ${tail}`
      : `Build ${W} walls. Every cell that the walls shut off from the edge of the grid scores a point. ${tail}`,
  };
}
const castleKeeper = gridFamily<CastleP>({
  id: "castle_keeper", name: "Castle Keeper", emoji: "🏯", theme: "Walls that keep the water out",
  requires: { minSize: 4 }, shape: tuple(2), tags: ["shortlist"],
  support: g => range(g.C).flatMap(W => [
    { W, mode: "plain" as const, T: null }, { W, mode: "eyes" as const, T: null },
    ...range(g.C).filter(T => T !== W).map(T => ({ W, mode: "treasure" as const, T })),
  ]),
  sample: (rng, g) => {
    const [W, T] = pick(rng, colourPairs(g));
    const mode = pick(rng, ["plain", "plain", "treasure", "eyes"] as const);
    return { W, mode, T: mode === "treasure" ? T : null };
  },
  canonical: p => recolour(p, ["W", "T"]),
  summary: (p, g) => {
    const w = cname(g, p.W);
    const base = `Build walls of ${w}. A cell is safe when water flowing in from the edge (not through ${w}) can't reach it. `;
    if (p.mode === "treasure") return base + `Score a point for every safe ${cname(g, p.T!)} cell.`;
    if (p.mode === "eyes") return base + "Score a point for every safe cell, plus 3 for every separate safe pocket (like eyes in Go).";
    return base + "Score a point for every safe cell.";
  },
  python: (p, g) => {
    const count = p.mode === "treasure" ? `
        treasure = 0
        for cell in grid.cells:
            if inside(cell, outside) and cell.colour == TREASURE:
                treasure += 1
        return (treasure, walls_on_edge(grid))` : p.mode === "eyes" ? `
        points = 0
        for pocket in grid.regions(same_side):
            if inside(pocket[0], outside):
                points += len(pocket) + 3
        return (points, walls_on_edge(grid))` : `
        shut_in = 0
        for cell in grid.cells:
            if inside(cell, outside):
                shut_in += 1
        return (shut_in, walls_on_edge(grid))`;
    const pockets = p.mode === "eyes" ? `
    def same_side(a, b):
        return not_wall(a) == not_wall(b)
` : "";
    return pyCard(castleText(p, g), `
    def not_wall(cell):
        return cell.colour != WALL

    def inside(cell, outside):
        return not_wall(cell) and cell not in outside

    def walls_on_edge(grid):
        walls = 0
        for cell in grid.edge_cells:
            if cell.colour == WALL:
                walls += 1
        return walls
${pockets}
    def utility(grid):
        outside = grid.reachable(grid.edge_cells, through=not_wall)  # cells you can walk to from the edge${count}`);
  },
  typescript: (p, g) => {
    const count = p.mode === "treasure" ? `
      let treasure = 0;
      for (const cell of grid.cells) {
        if (inside(cell, outside) && cell.colour === TREASURE) treasure += 1;
      }
      return [treasure, wallsOnEdge(grid)];` : p.mode === "eyes" ? `
      let points = 0;
      for (const pocket of grid.regions(sameSide)) {
        if (inside(pocket[0], outside)) points += pocket.length + 3;
      }
      return [points, wallsOnEdge(grid)];` : `
      let shutIn = 0;
      for (const cell of grid.cells) {
        if (inside(cell, outside)) shutIn += 1;
      }
      return [shutIn, wallsOnEdge(grid)];`;
    const pockets = p.mode === "eyes" ? `
    function sameSide(a, b) {
      return notWall(a) === notWall(b);
    }
` : "";
    return tsCard(castleText(p, g), `
    function notWall(cell) {
      return cell.colour !== WALL;
    }

    function inside(cell, outside) {
      return notWall(cell) && !outside.includes(cell);
    }

    function wallsOnEdge(grid) {
      let walls = 0;
      for (const cell of grid.edgeCells) {
        if (cell.colour === WALL) walls += 1;
      }
      return walls;
    }
${pockets}
    function utility(grid) {
      const outside = grid.reachable(grid.edgeCells, notWall);  // cells you can walk to from the edge${count}
    }`);
  },
  exemplar: (p, g, ctx) => {
    const N = g.N, inner = p.mode === "treasure" ? p.T! : other(g, p.W), z = full(N, 0);
    const col = fromFn(N, (r, c) => (isRim(N, r, c) ? p.W : inner));
    if (p.mode !== "eyes") return wire(g, z, col);
    const col2 = fromFn(N, (r, c) => (isRim(N, r, c) || (r + c) % 2 === 1 ? p.W : inner));
    return climb("castle_keeper", p, ctx, [{ sym: z, col }, { sym: z, col: col2 }], 0);
  },
});

// --- Chessmaster ---------------------------------------------------------------------------------
type ChessP = { A: number; B: number };
const chessText = (p: ChessP, g: GridSpec): CardText => {
  const A = cname(g, p.A), B = cname(g, p.B);
  return {
    emoji: "♟️", name: "Chessmaster", consts: [["COLOUR_A", A], ["COLOUR_B", B]],
    about: `Every 2×2 square coloured like a chessboard in ${A} and ${B} scores a point. If that's a tie, count the `
      + `places where ${an(A)} cell touches ${an(B)} cell.`,
  };
};
const chessmaster = gridFamily<ChessP>({
  id: "chessmaster", name: "Chessmaster", emoji: "♟️", theme: "Little chessboards in your two colours",
  shape: tuple(2), tags: ["shortlist"],
  support: g => colourPairs(g).map(([A, B]) => ({ A, B })),
  canonical: p => recolour(p, ["A", "B"]),
  summary: (p, g) => `Every 2×2 square that looks like a little chessboard of ${cname(g, p.A)} and `
    + `${cname(g, p.B)} scores a point.`,
  python: (p, g) => pyCard(chessText(p, g), `
    def opposite(a, b):
        return (a.colour == COLOUR_A and b.colour == COLOUR_B) or (a.colour == COLOUR_B and b.colour == COLOUR_A)

    def utility(grid):
        boards = 0
        seams = 0
        for cell in grid.cells:
            for other in (cell.right, cell.down):
                if other is not None and opposite(cell, other):
                    seams += 1
            right, below = cell.right, cell.down
            if right is not None and below is not None:
                if opposite(cell, right) and opposite(cell, below) and below.right.colour == cell.colour:
                    boards += 1
        return (boards, seams)`),
  typescript: (p, g) => tsCard(chessText(p, g), `
    function opposite(a, b) {
      return (a.colour === COLOUR_A && b.colour === COLOUR_B) || (a.colour === COLOUR_B && b.colour === COLOUR_A);
    }

    function utility(grid) {
      let boards = 0;
      let seams = 0;
      for (const cell of grid.cells) {
        for (const other of [cell.right, cell.down]) {
          if (other !== null && opposite(cell, other)) seams += 1;
        }
        const right = cell.right, below = cell.down;
        if (right !== null && below !== null) {
          if (opposite(cell, right) && opposite(cell, below) && below.right.colour === cell.colour) boards += 1;
        }
      }
      return [boards, seams];
    }`),
  exemplar: (p, g) => wire(g, full(g.N, 0), fromFn(g.N, (r, c) => ((r + c) % 2 === 0 ? p.A : p.B))),
});

// --- Bridge Builder --------------------------------------------------------------------------------
type BridgeP = { C: number; D: "LR" | "TB" };
const bridgeText = (p: BridgeP, g: GridSpec): CardText => {
  const C = cname(g, p.C), lr = p.D === "LR";
  return {
    emoji: "🌉", name: "Bridge Builder", consts: [["MY_COLOUR", C]],
    about: `Build a bridge of touching ${C} cells ${lr ? "from the left edge to the right edge" : "from the top edge to the bottom edge"}. `
      + `Score how many ${lr ? "columns" : "rows"} your biggest ${C} bridge reaches across.`,
  };
};
const bridgeBuilder = gridFamily<BridgeP>({
  id: "bridge_builder", name: "Bridge Builder", emoji: "🌉", theme: "A path from one edge to the other",
  shape: SCALAR, tags: ["shortlist"],
  support: g => product<BridgeP>({ C: range(g.C), D: ["LR", "TB"] }),
  canonical: () => ({ C: 0, D: "LR" }),
  summary: (p, g) => `Build a bridge of touching ${cname(g, p.C)} cells from the `
    + `${p.D === "LR" ? "left edge to the right edge" : "top edge to the bottom edge"}. `
    + `Score = how many ${p.D === "LR" ? "columns" : "rows"} your best bridge reaches.`,
  python: (p, g) => {
    const [across, attr] = p.D === "LR" ? ["columns", "col"] : ["rows", "row"];
    return pyCard(bridgeText(p, g), `
      def same_colour(a, b):
          return a.colour == b.colour

      def utility(grid):
          best = 0
          for bridge in grid.regions(same_colour):
              if bridge[0].colour != MY_COLOUR:
                  continue
              ${across} = set()
              for cell in bridge:
                  ${across}.add(cell.${attr})
              best = max(best, len(${across}))
          return best`);
  },
  typescript: (p, g) => {
    const [across, attr] = p.D === "LR" ? ["columns", "col"] : ["rows", "row"];
    return tsCard(bridgeText(p, g), `
      function sameColour(a, b) {
        return a.colour === b.colour;
      }

      function utility(grid) {
        let best = 0;
        for (const bridge of grid.regions(sameColour)) {
          if (bridge[0].colour !== MY_COLOUR) continue;
          const ${across} = new Set();
          for (const cell of bridge) ${across}.add(cell.${attr});
          best = Math.max(best, ${across}.size);
        }
        return best;
      }`);
  },
  exemplar: (p, g) => {
    const m = Math.floor(g.N / 2), o = (p.C + 1) % g.C;
    return wire(g, full(g.N, 0), fromFn(g.N, (r, c) => ((p.D === "LR" ? r : c) === m ? p.C : o)));
  },
});

// --- Card Windmill ---------------------------------------------------------------------------------
const windmillText: CardText = {
  emoji: "🌀", name: "Card Windmill", consts: [],
  about: "Turn the grid a quarter turn clockwise: every card lands on another spot. A turn is good when the card "
    + "there has the next suit (♠ → ♥ → ♦ → ♣ → ♠). Count the cards whose four turns are all good (a full "
    + "windmill); if that's a tie, count good turns.",
};
/** Grid-lab orbits(N): the 4-cycles of a quarter turn, as [r, c] per member. */
function orbits(N: number): [number, number][][] {
  const out: [number, number][][] = [];
  for (let r = 0; r < Math.floor(N / 2); r++) {
    for (let c = 0; c < Math.floor((N + 1) / 2); c++) {
      out.push([[r, c], [c, N - 1 - r], [N - 1 - r, N - 1 - c], [N - 1 - c, r]]);
    }
  }
  return out;
}
const cardWindmill = gridFamily<Record<string, never>>({
  id: "card_windmill", name: "Card Windmill", emoji: "🌀", theme: "Suits spin round a quarter turn at a time",
  analytic: solvedAnalytic("card_windmill"),
  requires: { classes: ["Suited"] }, shape: tuple(2), tags: ["shortlist"],
  support: () => [{}],
  summary: () => "Turn the grid a quarter turn and every suit should move on one: ♠→♥→♦→♣→♠. Every set of 4 "
    + "cells that spin that way scores a point.",
  python: () => pyCard(windmillText, `
    SUITS = ["spades", "hearts", "diamonds", "clubs"]

    def next_suit(suit):
        return SUITS[(SUITS.index(suit) + 1) % 4]

    def good_turn(grid, cell):
        return grid.quarter_turn(cell).suit == next_suit(cell.suit)

    def utility(grid):
        windmill_cards = 0
        good_turns = 0
        for cell in grid.cells:
            if good_turn(grid, cell):
                good_turns += 1
            spot = cell
            all_good = True
            for turn in range(4):
                if not good_turn(grid, spot):
                    all_good = False
                spot = grid.quarter_turn(spot)
            if all_good:
                windmill_cards += 1
        return (windmill_cards, good_turns)`),
  typescript: () => tsCard(windmillText, `
    const SUITS = ["spades", "hearts", "diamonds", "clubs"];

    function nextSuit(suit) {
      return SUITS[(SUITS.indexOf(suit) + 1) % 4];
    }

    function goodTurn(grid, cell) {
      return grid.quarterTurn(cell).suit === nextSuit(cell.suit);
    }

    function utility(grid) {
      let windmillCards = 0;
      let goodTurns = 0;
      for (const cell of grid.cells) {
        if (goodTurn(grid, cell)) goodTurns += 1;
        let spot = cell;
        let allGood = true;
        for (let turn = 0; turn < 4; turn++) {
          if (!goodTurn(grid, spot)) allGood = false;
          spot = grid.quarterTurn(spot);
        }
        if (allGood) windmillCards += 1;
      }
      return [windmillCards, goodTurns];
    }`),
  exemplar: (_, g) => {
    const sym = full(g.N, 0);
    for (const o of orbits(g.N)) o.forEach(([r, c], i) => { sym[r][c] = i * 13 + 12; });
    return wire(g, sym, full(g.N, 0));
  },
});

// --- Royal Court -----------------------------------------------------------------------------------
type CourtP = { suit: number | null };
const courtText = (p: CourtP): CardText => ({
  emoji: "👑", name: "Royal Court",
  consts: p.suit === null ? [] : [["MY_SUIT", SUIT_NAMES[p.suit]]],
  about: `Put a ${p.suit === null ? "picture card (J, Q, K)" : `picture card (J, Q, K) of ${SUIT_NAMES[p.suit]}`} in the `
    + "very middle. Your court is it plus every such card joined to it through touching cells: score its size, "
    + "doubled if none of it is on the edge. If that's a tie, count those picture cards that are off the edge.",
});
const royalCourt = gridFamily<CourtP>({
  id: "royal_court", name: "Royal Court", emoji: "👑", theme: "A palace of picture cards around the centre",
  requires: { classes: ["Faced"], parity: "odd" }, shape: tuple(2), tags: ["shortlist"],
  support: () => [null, 0, 1, 2, 3].map(suit => ({ suit })),
  sample: rng => ({ suit: rng.int(2) === 0 ? null : rng.int(4) }),
  canonical: p => ({ suit: p.suit === null ? null : 0 }),
  summary: p => "The king lives in the centre. If the centre card is a picture card "
    + (p.suit === null ? "(J, Q, K)" : `(J, Q, K of ${"♠♥♦♣"[p.suit]})`)
    + ", score the size of the joined-up patch of picture cards around it, doubled if the patch doesn't touch the edge.",
  python: p => pyCard(courtText(p), `
    def royal(cell):
        return ${p.suit === null ? "cell.is_picture" : "cell.is_picture and cell.suit == MY_SUIT"}

    def utility(grid):
        middle = grid.cell(grid.size // 2, grid.size // 2)
        court_size = 0
        if royal(middle):
            court = grid.reachable(middle, through=royal)
            court_size = len(court)
            safe = True
            for cell in court:
                if cell.on_edge:
                    safe = False
            if safe:
                court_size *= 2
        off_edge = 0
        for cell in grid.cells:
            if royal(cell) and not cell.on_edge:
                off_edge += 1
        return (court_size, off_edge)`),
  typescript: p => tsCard(courtText(p), `
    function royal(cell) {
      return ${p.suit === null ? "cell.isPicture" : "cell.isPicture && cell.suit === MY_SUIT"};
    }

    function utility(grid) {
      const middle = grid.cell(Math.floor(grid.size / 2), Math.floor(grid.size / 2));
      let courtSize = 0;
      if (royal(middle)) {
        const court = grid.reachable(middle, royal);
        courtSize = court.length;
        let safe = true;
        for (const cell of court) {
          if (cell.onEdge) safe = false;
        }
        if (safe) courtSize *= 2;
      }
      let offEdge = 0;
      for (const cell of grid.cells) {
        if (royal(cell) && !cell.onEdge) offEdge += 1;
      }
      return [courtSize, offEdge];
    }`),
  exemplar: (p, g, ctx) => {
    const su = p.suit ?? 0, N = g.N, z = full(N, 0);
    // The doubled safe palace (2(N-2)^2) only beats an all-picture grid (N^2) at N = 7.
    return bestOf("royal_court", p, ctx, [
      { sym: fromFn(N, (r, c) => su * 13 + (isRim(N, r, c) ? 1 : 12)), col: z },
      { sym: full(N, su * 13 + 12), col: z },
    ]);
  },
});


// ================================================================================================
// Not shortlisted (new cards, checked against grid-lab by test/gridlab_parity.py)
// ================================================================================================

type ColourP = { X: number };
const SAME_COLOUR_PY = `
    def same_colour(a, b):
        return a.colour == b.colour
`;
const SAME_COLOUR_TS = `
    function sameColour(a, b) {
      return a.colour === b.colour;
    }
`;

// --- Archipelago ---------------------------------------------------------------------------------
type IslandsP = { C: number };
const archText = (p: IslandsP, g: GridSpec): CardText => ({
  emoji: "🗺️", name: "Archipelago", consts: [["MY_COLOUR", cname(g, p.C)]],
  about: `Count the separate islands of ${cname(g, p.C)}: patches of touching ${cname(g, p.C)} cells (touching corners `
    + "don't join islands). More islands is better.",
});
const archipelago = gridFamily<IslandsP>({
  id: "archipelago", name: "Archipelago", emoji: "🗺️", theme: "As many separate islands as possible", shape: SCALAR,
  support: g => range(g.C).map(C => ({ C })),
  canonical: p => recolour(p, ["C"]),
  summary: (p, g) => `Count the separate islands of ${cname(g, p.C)} (touching corners don't join islands).`,
  python: (p, g) => pyCard(archText(p, g), `${SAME_COLOUR_PY}
    def utility(grid):
        islands = 0
        for patch in grid.regions(same_colour):
            if patch[0].colour == MY_COLOUR:
                islands += 1
        return islands`),
  typescript: (p, g) => tsCard(archText(p, g), `${SAME_COLOUR_TS}
    function utility(grid) {
      let islands = 0;
      for (const patch of grid.regions(sameColour)) {
        if (patch[0].colour === MY_COLOUR) islands += 1;
      }
      return islands;
    }`),
  exemplar: (p, g) => wire(g, full(g.N, 0), fromFn(g.N, (r, c) => ((r + c) % 2 === 0 ? p.C : (p.C + 1) % g.C))),
});

// --- Looking-Glass -------------------------------------------------------------------------------
type GlassP = { axis: "V" | "H" | "D" | "A" | "half"; layer: "colour" | "symbol" };
const TWIN: Record<GlassP["axis"], [string, string, string]> = {
  V: ["Fold the grid down the middle, left onto right", "cell.row, n - cell.col", "cell.row, n - cell.col"],
  H: ["Fold the grid top onto bottom", "n - cell.row, cell.col", "n - cell.row, cell.col"],
  D: ["Fold the grid along the diagonal from the top-left", "cell.col, cell.row", "cell.col, cell.row"],
  A: ["Fold the grid along the diagonal from the top-right", "n - cell.col, n - cell.row", "n - cell.col, n - cell.row"],
  half: ["Turn the grid upside down", "n - cell.row, n - cell.col", "n - cell.row, n - cell.col"],
};
const glassText = (p: GlassP, g: GridSpec): CardText => ({
  emoji: "🔍", name: "Looking-Glass", consts: [],
  about: `${TWIN[p.axis][0]}: every cell lands on a twin. Score a point for every pair of twins with the same `
    + `${p.layer === "colour" ? "colour" : g.cards ? "rank" : "number"} (each pair once).`,
});
const lookingGlass = gridFamily<GlassP>({
  id: "looking_glass", name: "Looking-Glass", emoji: "🔍", theme: "Every cell matches its mirror twin", shape: SCALAR,
  support: () => product<GlassP>({ axis: ["V", "H", "D", "A", "half"], layer: ["colour", "symbol"] }),
  canonical: p => ({ ...p, axis: p.axis === "H" ? "V" : p.axis === "A" ? "D" : p.axis }),
  summary: p => `${TWIN[p.axis][0]}: every cell whose ${p.layer === "colour" ? "colour" : "symbol"} lands on a twin `
    + "scores a point (each pair once).",
  python: (p, g) => {
    const what = p.layer === "colour" ? "colour" : "value";
    return pyCard(glassText(p, g), `
      def twin(grid, cell):
          n = grid.size - 1
          return grid.cell(${TWIN[p.axis][1]})

      def place(grid, cell):
          return cell.row * grid.size + cell.col

      def utility(grid):
          pairs = 0
          for cell in grid.cells:
              other = twin(grid, cell)
              if place(grid, other) > place(grid, cell) and other.${what} == cell.${what}:
                  pairs += 1
          return pairs`);
  },
  typescript: (p, g) => {
    const what = p.layer === "colour" ? "colour" : "value";
    return tsCard(glassText(p, g), `
      function twin(grid, cell) {
        const n = grid.size - 1;
        return grid.cell(${TWIN[p.axis][2]});
      }

      function place(grid, cell) {
        return cell.row * grid.size + cell.col;
      }

      function utility(grid) {
        let pairs = 0;
        for (const cell of grid.cells) {
          const other = twin(grid, cell);
          if (place(grid, other) > place(grid, cell) && other.${what} === cell.${what}) pairs += 1;
        }
        return pairs;
      }`);
  },
  exemplar: (_, g) => wire(g, full(g.N, 0), full(g.N, 0)),
});

// --- Pinwheel ------------------------------------------------------------------------------------
type PinP = { attr: "colour" | "symbol" };
const pinKey = (p: PinP, g: GridSpec) => (p.attr === "colour" ? "colour" : g.cards ? "suit" : "symbol");
const pinText = (p: PinP, g: GridSpec): CardText => ({
  emoji: "🎡", name: "Pinwheel", consts: [],
  about: "Turn the grid a quarter turn: cells swap places in sets of 4 (the middle cell stays put). Every set of 4 that "
    + `all share the same ${pinKey(p, g)} scores a point. If that's a tie, count the most common ${pinKey(p, g)} in each set.`,
});
const pinwheel = gridFamily<PinP>({
  id: "pinwheel", name: "Pinwheel", emoji: "🎡", theme: "Looks the same after a quarter turn", shape: tuple(2),
  support: () => [{ attr: "colour" }, { attr: "symbol" }],
  summary: (p, g) => "Turn the grid a quarter turn. Every set of 4 cells that swap places and all share the same "
    + `${pinKey(p, g)} scores a point.`,
  python: (p, g) => pyCard(pinText(p, g), `
    def place(grid, cell):
        return cell.row * grid.size + cell.col

    def spin(grid, cell):
        orbit = [cell]
        for turn in range(3):
            orbit.append(grid.quarter_turn(orbit[-1]))
        return orbit

    def utility(grid):
        full = 0
        most = 0
        for cell in grid.cells:
            orbit = spin(grid, cell)
            if orbit[1] is cell or place(grid, cell) > min(place(grid, other) for other in orbit):
                continue  # the middle cell, or a set already counted from its first cell
            keys = [other.${pinKey(p, g)} for other in orbit]
            same = max(keys.count(key) for key in keys)
            most += same
            if same == 4:
                full += 1
        return (full, most)`),
  typescript: (p, g) => tsCard(pinText(p, g), `
    function place(grid, cell) {
      return cell.row * grid.size + cell.col;
    }

    function spin(grid, cell) {
      const orbit = [cell];
      for (let turn = 0; turn < 3; turn++) orbit.push(grid.quarterTurn(orbit[orbit.length - 1]));
      return orbit;
    }

    function utility(grid) {
      let full = 0;
      let most = 0;
      for (const cell of grid.cells) {
        const orbit = spin(grid, cell);
        const first = Math.min(...orbit.map(other => place(grid, other)));
        if (orbit[1] === cell || place(grid, cell) > first) continue;  // the middle, or already counted
        const keys = orbit.map(other => other.${pinKey(p, g)});
        const same = Math.max(...keys.map(key => keys.filter(k => k === key).length));
        most += same;
        if (same === 4) full += 1;
      }
      return [full, most];
    }`),
  exemplar: (_, g) => wire(g, full(g.N, 0), full(g.N, 0)),
});

// --- Bullseye ------------------------------------------------------------------------------------
const bullText: CardText = {
  emoji: "🎯", name: "Bullseye", consts: [],
  about: "Starting from the outside, count the square rings that are all one colour and a different colour from the "
    + "ring outside them. Stop at the first ring that fails. If that's a tie, count the commonest colour in each ring.",
};
const bullseye = gridFamily<Record<string, never>>({
  id: "bullseye", name: "Bullseye", emoji: "🎯", theme: "Rings like an archery target", shape: tuple(2),
  support: () => [{}],
  summary: () => "Starting from the outside, count the square rings that are all one colour and a different "
    + "colour from the ring outside them. Stop at the first ring that fails.",
  python: () => pyCard(bullText, `
    def ring_of(grid, cell):
        n = grid.size - 1
        return min(cell.row, cell.col, n - cell.row, n - cell.col)

    def utility(grid):
        score = 0
        nearly = 0
        alive = True
        previous = None
        for k in range((grid.size + 1) // 2):
            colours = [cell.colour for cell in grid.cells if ring_of(grid, cell) == k]
            nearly += max(colours.count(colour) for colour in colours)
            one_colour = colours.count(colours[0]) == len(colours)
            alive = alive and one_colour and colours[0] != previous
            if alive:
                score += 1
            previous = colours[0]
        return (score, nearly)`),
  typescript: () => tsCard(bullText, `
    function ringOf(grid, cell) {
      const n = grid.size - 1;
      return Math.min(cell.row, cell.col, n - cell.row, n - cell.col);
    }

    function count(list, x) {
      return list.filter(y => y === x).length;
    }

    function utility(grid) {
      let score = 0;
      let nearly = 0;
      let alive = true;
      let previous = null;
      for (let k = 0; k < Math.floor((grid.size + 1) / 2); k++) {
        const colours = grid.cells.filter(cell => ringOf(grid, cell) === k).map(cell => cell.colour);
        nearly += Math.max(...colours.map(colour => count(colours, colour)));
        const oneColour = count(colours, colours[0]) === colours.length;
        alive = alive && oneColour && colours[0] !== previous;
        if (alive) score += 1;
        previous = colours[0];
      }
      return [score, nearly];
    }`),
  exemplar: (_, g) => wire(g, full(g.N, 0),
    fromFn(g.N, (r, c) => Math.min(r, c, g.N - 1 - r, g.N - 1 - c) % g.C)),
});

// --- Snake Charmer ---------------------------------------------------------------------------------
const snakeText = (p: IslandsP, g: GridSpec): CardText => ({
  emoji: "🐍", name: "Snake Charmer", consts: [["MY_COLOUR", cname(g, p.C)]],
  about: `Build the longest snake of ${cname(g, p.C)}: a patch of touching cells one cell wide, with no branches and no `
    + "loops. Score its length.",
});
const snakeCharmer = gridFamily<IslandsP>({
  id: "snake_charmer", name: "Snake Charmer", emoji: "🐍", theme: "The longest wiggly snake", shape: SCALAR,
  support: g => range(g.C).map(C => ({ C })),
  canonical: p => recolour(p, ["C"]),
  summary: (p, g) => `Build the longest snake of ${cname(g, p.C)}: a patch one cell wide with no branches and no loops. `
    + "Score its length.",
  python: (p, g) => pyCard(snakeText(p, g), `${SAME_COLOUR_PY}
    def utility(grid):
        best = 0
        for patch in grid.regions(same_colour):
            if patch[0].colour != MY_COLOUR:
                continue
            links = 0
            branches = False
            for cell in patch:
                touching = 0
                for other in cell.neighbours:
                    if other.colour == MY_COLOUR:
                        touching += 1
                links += touching
                if touching > 2:
                    branches = True
            if not branches and links == 2 * (len(patch) - 1):  # no loops: a snake has one link fewer than cells
                best = max(best, len(patch))
        return best`),
  typescript: (p, g) => tsCard(snakeText(p, g), `${SAME_COLOUR_TS}
    function utility(grid) {
      let best = 0;
      for (const patch of grid.regions(sameColour)) {
        if (patch[0].colour !== MY_COLOUR) continue;
        let links = 0;
        let branches = false;
        for (const cell of patch) {
          const touching = cell.neighbours.filter(other => other.colour === MY_COLOUR).length;
          links += touching;
          if (touching > 2) branches = true;
        }
        // no loops: a snake has one link fewer than cells
        if (!branches && links === 2 * (patch.length - 1)) best = Math.max(best, patch.length);
      }
      return best;
    }`),
  // The longest induced path of the N×N grid, found by exact search (src/analytic/maxima.ts): a proven maximum.
  exemplar: (p, g) => {
    const N = g.N, o = (p.C + 1) % g.C, snake = new Set(LONGEST_SNAKES[N]);
    return wire(g, full(N, 0), fromFn(N, (r, c) => (snake.has(r * N + c) ? p.C : o)));
  },
});

// --- Tetromino Tamer -------------------------------------------------------------------------------
type PieceP = { C: number; P: "I" | "O" | "T" | "L" | "S" };
const PIECES: Record<PieceP["P"], [number, number][]> = {
  I: [[0, 0], [0, 1], [0, 2], [0, 3]], O: [[0, 0], [0, 1], [1, 0], [1, 1]], T: [[0, 0], [0, 1], [0, 2], [1, 1]],
  L: [[0, 0], [1, 0], [2, 0], [2, 1]], S: [[0, 1], [0, 2], [1, 0], [1, 1]],
};
/** The piece's 8 turns and flips, normalised to the top-left, as sorted [r, c] lists (grid-lab piece_forms). */
function pieceForms(P: PieceP["P"]): [number, number][][] {
  const syms: ((r: number, c: number) => [number, number])[] = [
    (r, c) => [r, c], (r, c) => [c, -r], (r, c) => [-r, -c], (r, c) => [-c, r],
    (r, c) => [r, -c], (r, c) => [-r, c], (r, c) => [c, r], (r, c) => [-c, -r]];
  const seen = new Map<string, [number, number][]>();
  for (const f of syms) {
    const cells = PIECES[P].map(([r, c]) => f(r, c));
    const r0 = Math.min(...cells.map(x => x[0])), c0 = Math.min(...cells.map(x => x[1]));
    const norm = cells.map(([r, c]) => [r - r0, c - c0] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    seen.set(JSON.stringify(norm), norm);
  }
  return [...seen.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, v]) => v);
}
const packings = new Map<string, boolean[][]>();
/** Tetromino Tamer's best board (packTetrominoes), cached per size and piece. */
function bestPacking(N: number, P: PieceP["P"]): boolean[][] {
  const key = `${N}:${P}`;
  let occ = packings.get(key);
  if (!occ) packings.set(key, occ = packTetrominoes(N, P).occ);
  return occ;
}
/**
 * Tetromino Tamer's best board: the cells to paint MY_COLOUR so that no two islands touch and there are as many
 * islands shaped like P as possible, then as many 4-cell islands of any shape. Exact (a greedy first fit is not: on
 * 4×4 it puts a Z in the corner and leaves no room for a second S). A memoised search over cells in reading order,
 * where each island is placed at its first cell; the state is the cursor and which of the next `window` cells are
 * taken or touched. 4N is enough, since an island placed before the cursor reaches no further: about 11k states on
 * 7×7. Exported so a test can check it against the full state (window N²).
 */
export function packTetrominoes(N: number, P: PieceP["P"], window = 4 * N): { occ: boolean[][]; value: [number, number] } {
  const shapes = (["I", "O", "T", "L", "S"] as const).flatMap(q => pieceForms(q).map(f => ({
    mine: q === P, cells: f.map(([r, c]) => [r - f[0][0], c - f[0][1]] as [number, number]),
  })));
  const NN = N * N, W = NN + 1, blocked = new Uint8Array(NN), memo = new Map<string, [value: number, choice: number]>();
  /** The cells of shape s placed at cell i, or null if it leaves the grid or meets a taken or touched cell. */
  const place = (i: number, s: number) => {
    const r = Math.floor(i / N), c = i % N, cells = shapes[s].cells.map(([a, b]) => [r + a, c + b]);
    return cells.every(([x, y]) => x >= 0 && x < N && y >= 0 && y < N && !blocked[x * N + y]) ? cells : null;
  };
  /** Marks the cells and their neighbours taken; returns the ones it changed, for undo. */
  const take = (cells: number[][]) => {
    const changed: number[] = [];
    for (const [x, y] of cells) for (const [a, b] of [[x, y], [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (a >= 0 && a < N && b >= 0 && b < N && !blocked[a * N + b]) { blocked[a * N + b] = 1; changed.push(a * N + b); }
    }
    return changed;
  };
  const next = (i: number) => { while (i < NN && blocked[i]) i++; return i; };
  const keyOf = (i: number) => `${i}:${blocked.subarray(i + 1, Math.min(NN, i + window + 1)).join("")}`;
  /** Best value (islands like P × W + 4-cell islands) from cursor i on, which must be a free cell or NN. */
  const best = (i: number): number => {
    if (i >= NN) return 0;
    const key = keyOf(i), hit = memo.get(key);
    if (hit) return hit[0];
    blocked[i] = 1;
    let value = best(next(i + 1)), choice = -1;
    blocked[i] = 0;
    for (let s = 0; s < shapes.length; s++) {
      const cells = place(i, s);
      if (!cells) continue;
      const changed = take(cells), v = best(next(i + 1)) + (shapes[s].mine ? W : 0) + 1;
      for (const k of changed) blocked[k] = 0;
      if (v > value) { value = v; choice = s; }
    }
    memo.set(key, [value, choice]);
    return value;
  };
  const value = best(0);
  const occ = range(N).map(() => Array<boolean>(N).fill(false));
  for (let i = next(0); i < NN; i = next(i + 1)) {
    const choice = memo.get(keyOf(i))![1];
    if (choice < 0) { blocked[i] = 1; continue; }
    const cells = place(i, choice)!;
    take(cells);
    for (const [x, y] of cells) occ[x][y] = true;
  }
  return { occ, value: [Math.floor(value / W), value % W] };
}
const tetText = (p: PieceP, g: GridSpec): CardText => ({
  emoji: "🧱", name: "Tetromino Tamer", consts: [["MY_COLOUR", cname(g, p.C)], ["MY_PIECE", p.P]],
  about: `Every island of exactly 4 ${cname(g, p.C)} cells shaped like a Tetris ${p.P} piece (turned or flipped is fine) `
    + "scores a point. If that's a tie, count islands of exactly 4 cells of any shape.",
});
const tetrominoTamer = gridFamily<PieceP>({
  id: "tetromino_tamer", name: "Tetromino Tamer", emoji: "🧱", theme: "Islands shaped like your Tetris piece",
  shape: tuple(2),
  support: g => product<PieceP>({ C: range(g.C), P: ["O", "T", "L", "S", ...(g.N >= 4 ? ["I" as const] : [])] }),
  sample: (rng, g) => ({ C: rng.int(g.C), P: pick(rng, ["O", "T", "L", "S", ...(g.N >= 4 ? ["I" as const] : [])]) }),
  canonical: p => recolour(p, ["C"]),
  summary: (p, g) => `Every island of ${cname(g, p.C)} that is exactly the shape of a Tetris ${p.P} piece `
    + "(turned or flipped is fine) scores a point.",
  python: (p, g) => pyCard(tetText(p, g), `${SAME_COLOUR_PY}
    def inside(cell, piece):
        return cell is not None and cell in piece

    def shape(piece):
        rows = set(cell.row for cell in piece)
        cols = set(cell.col for cell in piece)
        if len(rows) == 1 or len(cols) == 1:
            return "I"
        if len(rows) == 2 and len(cols) == 2:
            return "O"
        straight = False
        for cell in piece:
            if len([other for other in cell.neighbours if other in piece]) == 3:
                return "T"
            across = inside(cell.left, piece) and inside(cell.right, piece)
            if across or (inside(cell.up, piece) and inside(cell.down, piece)):
                straight = True  # three in a straight line
        return "L" if straight else "S"

    def utility(grid):
        pieces = 0
        fours = 0
        for patch in grid.regions(same_colour):
            if patch[0].colour == MY_COLOUR and len(patch) == 4:
                fours += 1
                if shape(patch) == MY_PIECE:
                    pieces += 1
        return (pieces, fours)`),
  typescript: (p, g) => tsCard(tetText(p, g), `${SAME_COLOUR_TS}
    function inside(cell, piece) {
      return cell !== null && piece.includes(cell);
    }

    function shape(piece) {
      const rows = new Set(piece.map(cell => cell.row)).size;
      const cols = new Set(piece.map(cell => cell.col)).size;
      if (rows === 1 || cols === 1) return "I";
      if (rows === 2 && cols === 2) return "O";
      let straight = false;
      for (const cell of piece) {
        if (cell.neighbours.filter(other => piece.includes(other)).length === 3) return "T";
        const across = inside(cell.left, piece) && inside(cell.right, piece);
        if (across || (inside(cell.up, piece) && inside(cell.down, piece))) straight = true;  // three in a line
      }
      return straight ? "L" : "S";
    }

    function utility(grid) {
      let pieces = 0;
      let fours = 0;
      for (const patch of grid.regions(sameColour)) {
        if (patch[0].colour === MY_COLOUR && patch.length === 4) {
          fours += 1;
          if (shape(patch) === MY_PIECE) pieces += 1;
        }
      }
      return [pieces, fours];
    }`),
  exemplar: (p, g) => wire(g, full(g.N, 0), bestPacking(g.N, p.P).map(row => row.map(o => (o ? p.C : (p.C + 1) % g.C)))),
});

// --- Rainbow Bands -----------------------------------------------------------------------------------
type BandP = { K: "TL" | "TR" | "BL" | "BR" };
const bandDist = (p: BandP, N: number, r: number, c: number) =>
  (p.K[0] === "T" ? r : N - 1 - r) + (p.K[1] === "L" ? c : N - 1 - c);
const BAND_PY: Record<BandP["K"], string> = {
  TL: "cell.row + cell.col", TR: "cell.row + (n - cell.col)", BL: "(n - cell.row) + cell.col", BR: "(n - cell.row) + (n - cell.col)",
};
const bandText = (p: BandP, g: GridSpec): CardText => ({
  emoji: "🌈", name: "Rainbow Bands", consts: [],
  about: `Paint slanted stripes starting from the ${p.K[0] === "T" ? "top" : "bottom"}-${p.K[1] === "L" ? "left" : "right"} `
    + `corner in rainbow order (${g.colourNames.join(", ")}, then again). A stripe painted all right scores one point `
    + "per cell. If that's a tie, count cells in their right colour.",
});
const rainbowBands = gridFamily<BandP>({
  id: "rainbow_bands", name: "Rainbow Bands", emoji: "🌈", theme: "Slanted rainbow stripes from your corner",
  requires: { classes: ["Spectral"] }, shape: tuple(2),
  support: () => (["TL", "TR", "BL", "BR"] as const).map(K => ({ K })),
  canonical: () => ({ K: "TL" }),
  summary: (p, g) => `Paint slanted stripes starting from the ${p.K[0] === "T" ? "top" : "bottom"}-`
    + `${p.K[1] === "L" ? "left" : "right"} corner in rainbow order (${g.colourNames.join(", ")}, then again). Every cell on `
    + "a stripe that is fully right scores.",
  python: (p, g) => pyCard(bandText(p, g), `
    def stripe(grid, cell):
        n = grid.size - 1
        return ${BAND_PY[p.K]}

    def utility(grid):
        score = 0
        right = 0
        for k in range(2 * grid.size - 1):
            cells = [cell for cell in grid.cells if stripe(grid, cell) == k]
            good = [cell for cell in cells if cell.colour == grid.palette[k % len(grid.palette)]]
            right += len(good)
            if len(good) == len(cells):
                score += len(cells)
        return (score, right)`),
  typescript: (p, g) => tsCard(bandText(p, g), `
    function stripe(grid, cell) {
      const n = grid.size - 1;
      return ${BAND_PY[p.K]};
    }

    function utility(grid) {
      let score = 0;
      let right = 0;
      for (let k = 0; k < 2 * grid.size - 1; k++) {
        const cells = grid.cells.filter(cell => stripe(grid, cell) === k);
        const good = cells.filter(cell => cell.colour === grid.palette[k % grid.palette.length]);
        right += good.length;
        if (good.length === cells.length) score += cells.length;
      }
      return [score, right];
    }`),
  exemplar: (p, g) => wire(g, full(g.N, 0), fromFn(g.N, (r, c) => bandDist(p, g.N, r, c) % g.C)),
});

// --- Constellation -----------------------------------------------------------------------------------
type RankP = { S: number };
const rankValue = (g: GridSpec, rank: number) => (g.cards ? rank + 1 : rank);
const starText = (p: RankP, g: GridSpec): CardText => ({
  emoji: "✨", name: "Constellation", consts: [["MY_VALUE", rankValue(g, p.S), g.cards ? ({ 1: "Ace", 11: "Jack", 12: "Queen", 13: "King" } as Record<number, string>)[rankValue(g, p.S)] ?? "" : ""]],
  about: `Join up the cells worth ${rankValue(g, p.S)}${g.cards ? " (any suit)" : ""}: touching sides or corners counts. `
    + "Score the size of your biggest cluster of stars.",
});
const constellation = gridFamily<RankP>({
  id: "constellation", name: "Constellation", emoji: "✨", theme: "The biggest star cluster of your symbol", shape: SCALAR,
  support: g => range(g.ranks).map(S => ({ S })),
  canonical: () => ({ S: 0 }),
  summary: (p, g) => `Join up cells worth ${rankValue(g, p.S)}${g.cards ? " (any suit)" : ""}: touching sides or corners `
    + "counts. Score the size of your biggest cluster.",
  python: (p, g) => pyCard(starText(p, g), `
    def utility(grid):
        best = 0
        seen = []
        for start in grid.cells:
            if start.value != MY_VALUE or start in seen:
                continue
            cluster = [start]
            seen.append(start)
            for cell in cluster:  # the cluster grows while we walk it
                for other in cell.surrounding:
                    if other.value == MY_VALUE and other not in seen:
                        seen.append(other)
                        cluster.append(other)
            best = max(best, len(cluster))
        return best`),
  typescript: (p, g) => tsCard(starText(p, g), `
    function utility(grid) {
      let best = 0;
      const seen = [];
      for (const start of grid.cells) {
        if (start.value !== MY_VALUE || seen.includes(start)) continue;
        const cluster = [start];
        seen.push(start);
        for (const cell of cluster) {  // the cluster grows while we walk it
          for (const other of cell.surrounding) {
            if (other.value === MY_VALUE && !seen.includes(other)) {
              seen.push(other);
              cluster.push(other);
            }
          }
        }
        best = Math.max(best, cluster.length);
      }
      return best;
    }`),
  exemplar: (p, g) => wire(g, full(g.N, p.S), full(g.N, 0)),
});

// --- Rainbow Roads -------------------------------------------------------------------------------------
const roadsText = (g: GridSpec): CardText => ({
  emoji: "🛣️", name: "Rainbow Roads", consts: [],
  about: `A road walks from cell to touching cell through the colours in order: ${g.colourNames.join(" → ")}. `
    + "Count every different complete road.",
});
const rainbowRoads = gridFamily<Record<string, never>>({
  id: "rainbow_roads", name: "Rainbow Roads", emoji: "🛣️", theme: "Rainbow paths from first colour to last",
  requires: { classes: ["Spectral"], minColours: 4 }, shape: SCALAR,
  support: () => [{}],
  summary: (_, g) => `A road walks from cell to touching cell through the colours in order: ${g.colourNames.join(" → ")}. `
    + "Count every different complete road.",
  python: (_, g) => pyCard(roadsText(g), `
    def utility(grid):
        roads = {}  # roads[cell]: how many roads so far end on this cell
        for cell in grid.cells:
            roads[cell] = 1 if cell.colour == grid.palette[0] else 0
        for colour in grid.palette[1:]:
            longer = {}
            for cell in grid.cells:
                longer[cell] = 0
                if cell.colour == colour:
                    for other in cell.neighbours:
                        longer[cell] += roads[other]
            roads = longer
        return sum(roads.values())`),
  typescript: (_, g) => tsCard(roadsText(g), `
    function utility(grid) {
      let roads = new Map();  // roads.get(cell): how many roads so far end on this cell
      for (const cell of grid.cells) roads.set(cell, cell.colour === grid.palette[0] ? 1 : 0);
      for (const colour of grid.palette.slice(1)) {
        const longer = new Map();
        for (const cell of grid.cells) {
          let n = 0;
          if (cell.colour === colour) {
            for (const other of cell.neighbours) n += roads.get(other);
          }
          longer.set(cell, n);
        }
        roads = longer;
      }
      let total = 0;
      for (const n of roads.values()) total += n;
      return total;
    }`),
  exemplar: (p, g, ctx) => {
    const N = g.N, z = full(N, 0);
    return climb("rainbow_roads", p, ctx, [
      { sym: z, col: fromFn(N, (r, c) => (r + c) % g.C) },
      { sym: z, col: fromFn(N, (r, c) => Math.min(r, c, N - 1 - r, N - 1 - c) % g.C) },
    ], 2);
  },
});

// --- Paint Mixer -----------------------------------------------------------------------------------------
const mixerText = (g: GridSpec): CardText => ({
  emoji: "🖌️", name: "Paint Mixer", consts: [],
  about: `A mixed colour (${recipes(g).map(([a, b, m]) => `${cname(g, a)} + ${cname(g, b)} = ${cname(g, m)}`).join(", ")}) `
    + "scores a point when its two paints sit on opposite sides of it (left and right), and another when they sit above "
    + "and below. If that's a tie, count mixed cells touching one of their paints.",
});
const paintMixer = gridFamily<Record<string, never>>({
  id: "paint_mixer", name: "Paint Mixer", emoji: "🖌️", theme: "Mixed colours sandwiched between their parents",
  requires: { classes: ["Mixable"] }, shape: tuple(2),
  support: () => [{}],
  summary: (_, g) => "A mixed colour (" + recipes(g).map(([a, b, m]) => `${cname(g, a)}+${cname(g, b)}=${cname(g, m)}`).join(", ")
    + ") scores a point when its two parents sit on opposite sides of it (left and right), and another when they sit "
    + "above and below.",
  python: (_, g) => pyCard(mixerText(g), `
    def paints(grid, colour):
        out = []
        for a in grid.palette:
            for b in grid.palette:
                if mix(a, b) == colour:
                    out.append(a)
        return out

    def between(a, b, colour):
        return a is not None and b is not None and mix(a.colour, b.colour) == colour

    def utility(grid):
        mixes = 0
        near = 0
        for cell in grid.cells:
            mine = paints(grid, cell.colour)
            if len(mine) == 0:
                continue
            if between(cell.left, cell.right, cell.colour):
                mixes += 1
            if between(cell.up, cell.down, cell.colour):
                mixes += 1
            if any(other.colour in mine for other in cell.neighbours):
                near += 1
        return (mixes, near)`),
  typescript: (_, g) => tsCard(mixerText(g), `
    function paints(grid, colour) {
      const out = [];
      for (const a of grid.palette) {
        for (const b of grid.palette) {
          if (mix(a, b) === colour) out.push(a);
        }
      }
      return out;
    }

    function between(a, b, colour) {
      return a !== null && b !== null && mix(a.colour, b.colour) === colour;
    }

    function utility(grid) {
      let mixes = 0;
      let near = 0;
      for (const cell of grid.cells) {
        const mine = paints(grid, cell.colour);
        if (mine.length === 0) continue;
        if (between(cell.left, cell.right, cell.colour)) mixes += 1;
        if (between(cell.up, cell.down, cell.colour)) mixes += 1;
        if (cell.neighbours.some(other => mine.includes(other.colour))) near += 1;
      }
      return [mixes, near];
    }`),
  exemplar: (_, g) => {
    // grid-lab pm_exemplar: the first mixed colour (by index) between its parents on a diagonal lattice
    const [P1, P2, M] = recipes(g).slice().sort((a, b) => a[2] - b[2])[0];
    const [lo, hi] = P1 < P2 ? [P1, P2] : [P2, P1];
    return wire(g, full(g.N, 0), fromFn(g.N, (r, c) => ((r + c) % 2 === 1 ? M : Math.floor((c - r) / 2) % 2 === 0 ? lo : hi)));
  },
});

// --- Colour Carousel -----------------------------------------------------------------------------------
type TurnP = { dir: "cw" | "ccw" };
/** The border, clockwise from the top-left (grid-lab border_ring). */
const ringCells = (N: number): [number, number][] => [
  ...range(N - 1).map(c => [0, c] as [number, number]), ...range(N - 1).map(r => [r, N - 1] as [number, number]),
  ...range(N - 1).map(i => [N - 1, N - 1 - i] as [number, number]), ...range(N - 1).map(i => [N - 1 - i, 0] as [number, number]),
];
const carouselText = (p: TurnP): CardText => ({
  emoji: "🎠", name: "Colour Carousel", consts: [],
  about: `Walk round the edge ${p.dir === "cw" ? "clockwise" : "anticlockwise"}. Each step should stay the same colour or `
    + "move on to the next colour of the wheel. Best of all is a full lap round the wheel; then count the steps that "
    + "move on, then the steps that are fine.",
});
const carousel = gridFamily<TurnP>({
  id: "colour_carousel", name: "Colour Carousel", emoji: "🎠", theme: "The border goes round the colour wheel",
  requires: { classes: ["Wheel"], minSize: 4 }, shape: tuple(3),
  support: () => [{ dir: "cw" }, { dir: "ccw" }],
  canonical: () => ({ dir: "cw" }),
  summary: p => `Walk round the edge ${p.dir === "cw" ? "clockwise" : "anticlockwise"}. Each step should stay the same `
    + "colour or move to the next colour on the wheel. Best of all is going all the way round the wheel; then count the "
    + "steps that move on a colour.",
  python: p => pyCard(carouselText(p), `
    def border(grid):
        n = grid.size - 1
        ring = [grid.cell(0, c) for c in range(n)] + [grid.cell(r, n) for r in range(n)]
        ring += [grid.cell(n, c) for c in range(n, 0, -1)] + [grid.cell(r, 0) for r in range(n, 0, -1)]
        return ring${p.dir === "ccw" ? "[::-1]" : ""}

    def utility(grid):
        ring = border(grid)
        moves = 0
        fine = 0
        for i in range(len(ring)):
            a, b = ring[i], ring[(i + 1) % len(ring)]
            if b.colour == next_colour(a.colour):
                moves += 1
                fine += 1
            elif b.colour == a.colour:
                fine += 1
        lap = 1 if fine == len(ring) and moves >= len(grid.palette) else 0
        return (lap, moves, fine)`),
  typescript: p => tsCard(carouselText(p), `
    function border(grid) {
      const n = grid.size - 1, ring = [];
      for (let c = 0; c < n; c++) ring.push(grid.cell(0, c));
      for (let r = 0; r < n; r++) ring.push(grid.cell(r, n));
      for (let c = n; c > 0; c--) ring.push(grid.cell(n, c));
      for (let r = n; r > 0; r--) ring.push(grid.cell(r, 0));
      return ring${p.dir === "ccw" ? ".reverse()" : ""};
    }

    function utility(grid) {
      const ring = border(grid);
      let moves = 0;
      let fine = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        if (b.colour === nextColour(a.colour)) {
          moves += 1;
          fine += 1;
        } else if (b.colour === a.colour) {
          fine += 1;
        }
      }
      const lap = fine === ring.length && moves >= grid.palette.length ? 1 : 0;
      return [lap, moves, fine];
    }`),
  exemplar: (p, g) => {
    const N = g.N, C = g.C, ring = ringCells(N), order = p.dir === "ccw" ? ring.slice().reverse() : ring;
    const A = C * Math.floor(order.length / C), col = full(N, 0);
    order.forEach(([r, c], i) => { col[r][c] = Math.min(i, A) % C; });
    return wire(g, full(N, 0), col);
  },
});

// --- Falling Sand (gravity) -------------------------------------------------------------------------------
const sandText = (p: ColourP, g: GridSpec): CardText => ({
  emoji: "⏳", name: "Falling Sand", consts: [["MY_COLOUR", cname(g, p.X)]],
  about: `${cap(cname(g, p.X))} is sand that sinks. Score every ${cname(g, p.X)} cell that has only ${cname(g, p.X)} below it, `
    + "all the way to the bottom.",
});
const gravity = gridFamily<ColourP>({
  id: "gravity", name: "Falling Sand", emoji: "⏳", theme: "Your colour sinks to the bottom", shape: SCALAR,
  analytic: solvedAnalytic("gravity"),
  support: g => range(g.C).map(X => ({ X })),
  canonical: p => recolour(p, ["X"]),
  summary: (p, g) => `${cap(cname(g, p.X))} is sand that sinks. Score every ${cname(g, p.X)} cell that has only `
    + `${cname(g, p.X)} below it, all the way to the bottom.`,
  python: (p, g) => pyCard(sandText(p, g), `
    def utility(grid):
        sand = 0
        for column in grid.columns:
            for cell in reversed(column):  # from the bottom up
                if cell.colour != MY_COLOUR:
                    break
                sand += 1
        return sand`),
  typescript: (p, g) => tsCard(sandText(p, g), `
    function utility(grid) {
      let sand = 0;
      for (const column of grid.columns) {
        for (const cell of [...column].reverse()) {  // from the bottom up
          if (cell.colour !== MY_COLOUR) break;
          sand += 1;
        }
      }
      return sand;
    }`),
  exemplar: (p, g) => wire(g, full(g.N, 0), full(g.N, p.X)),
});

// --- Swiss Cheese ----------------------------------------------------------------------------------------
const cheeseText = (p: ColourP, g: GridSpec): CardText => ({
  emoji: "🧀", name: "Swiss Cheese", consts: [["MY_COLOUR", cname(g, p.X)]],
  about: `Your cheese is ${cname(g, p.X)}. A hole is a patch of other colours completely surrounded by ${cname(g, p.X)} `
    + `(not touching the edge). Count the holes; if that's a tie, more ${cname(g, p.X)} on the edge is better.`,
});
const swissCheese = gridFamily<ColourP>({
  id: "swiss_cheese", name: "Swiss Cheese", emoji: "🧀", theme: "As many holes as possible",
  requires: { minSize: 4 }, shape: tuple(2),
  support: g => range(g.C).map(X => ({ X })),
  canonical: p => recolour(p, ["X"]),
  summary: (p, g) => `Your cheese is ${cname(g, p.X)}. A hole is a patch of other colours completely surrounded by `
    + `${cname(g, p.X)} (not touching the edge). Count the holes.`,
  python: (p, g) => pyCard(cheeseText(p, g), `
    def cheese(cell):
        return cell.colour == MY_COLOUR

    def same_side(a, b):
        return cheese(a) == cheese(b)

    def utility(grid):
        holes = 0
        for patch in grid.regions(same_side):
            if not cheese(patch[0]) and not any(cell.on_edge for cell in patch):
                holes += 1
        rind = 0
        for cell in grid.edge_cells:
            if cheese(cell):
                rind += 1
        return (holes, rind)`),
  typescript: (p, g) => tsCard(cheeseText(p, g), `
    function cheese(cell) {
      return cell.colour === MY_COLOUR;
    }

    function sameSide(a, b) {
      return cheese(a) === cheese(b);
    }

    function utility(grid) {
      let holes = 0;
      for (const patch of grid.regions(sameSide)) {
        if (!cheese(patch[0]) && !patch.some(cell => cell.onEdge)) holes += 1;
      }
      let rind = 0;
      for (const cell of grid.edgeCells) {
        if (cheese(cell)) rind += 1;
      }
      return [holes, rind];
    }`),
  exemplar: (p, g, ctx) => {
    const N = g.N, col = fromFn(N, (r, c) => (isRim(N, r, c) || (r + c) % 2 === 1 ? p.X : (p.X + 1) % g.C));
    return climb("swiss_cheese", p, ctx, [{ sym: full(N, 0), col }], 0);
  },
});

// --- Mountain Climb --------------------------------------------------------------------------------------
const climbText = (g: GridSpec): CardText => ({
  emoji: "🧗", name: "Mountain Climb", consts: [],
  about: `Start at the top-left cell and step to a touching cell whose ${g.cards ? "card" : "number"} is exactly one bigger, `
    + "again and again. Best is reaching the bottom-right corner; then the longer the climb, the better.",
});
const mountainClimb = gridFamily<Record<string, never>>({
  id: "mountain_climb", name: "Mountain Climb", emoji: "🧗", theme: "Climb one step at a time to the far corner",
  requires: { classes: ["Valued"] }, shape: tuple(2),
  support: () => [{}],
  summary: () => "Start at the top-left cell and step to a touching cell that is exactly one bigger, again and again. "
    + "Best is reaching the bottom-right corner; then the longer the climb, the better.",
  python: (_, g) => pyCard(climbText(g), `
    def utility(grid):
        goal = grid.cell(grid.size - 1, grid.size - 1)
        level = [grid.cell(0, 0)]  # every cell the climb can be on after this many steps
        steps = 0
        reached = 0
        while len(level) > 0:
            steps += 1
            if goal in level:
                reached = 1
            higher = []
            for cell in level:
                for other in cell.neighbours:
                    if other.value == cell.value + 1 and other not in higher:
                        higher.append(other)
            level = higher
        return (reached, steps)`),
  typescript: (_, g) => tsCard(climbText(g), `
    function utility(grid) {
      const goal = grid.cell(grid.size - 1, grid.size - 1);
      let level = [grid.cell(0, 0)];  // every cell the climb can be on after this many steps
      let steps = 0;
      let reached = 0;
      while (level.length > 0) {
        steps += 1;
        if (level.includes(goal)) reached = 1;
        const higher = [];
        for (const cell of level) {
          for (const other of cell.neighbours) {
            if (other.value === cell.value + 1 && !higher.includes(other)) higher.push(other);
          }
        }
        level = higher;
      }
      return [reached, steps];
    }`),
  exemplar: (p, g, ctx) => {
    const N = g.N, R = g.vmax - g.vmin;
    const sym = fromFn(N, (r, c) => symForValue(g, g.vmin + Math.min(r + c, R)));
    const choices = range(R + 1).map(k => symForValue(g, g.vmin + k));
    return climb("mountain_climb", p, ctx, [{ sym, col: full(N, 0) }], 0, choices);
  },
});

// --- Treasure Map ---------------------------------------------------------------------------------------
const mapText = (p: ColourP, g: GridSpec): CardText => ({
  emoji: "🗝️", name: "Treasure Map", consts: [["MY_COLOUR", cname(g, p.X)]],
  about: `Every ${cname(g, p.X)} cell scores its value times how close it is to the middle (corners count nothing).`,
});
const treasureMap = gridFamily<ColourP>({
  id: "treasure_map", name: "Treasure Map", emoji: "🗝️", theme: "Big numbers of your colour near the middle",
  analytic: solvedAnalytic("treasure_map"),
  requires: { classes: ["Valued"] }, shape: SCALAR,
  support: g => range(g.C).map(X => ({ X })),
  canonical: p => recolour(p, ["X"]),
  summary: (p, g) => `Every ${cname(g, p.X)} cell scores its number times how close it is to the middle `
    + "(corners count nothing).",
  python: (p, g) => pyCard(mapText(p, g), `
    def closeness(grid, cell):
        n = grid.size - 1
        return 2 * n - abs(2 * cell.row - n) - abs(2 * cell.col - n)

    def utility(grid):
        treasure = 0
        for cell in grid.cells:
            if cell.colour == MY_COLOUR:
                treasure += cell.value * closeness(grid, cell)
        return treasure`),
  typescript: (p, g) => tsCard(mapText(p, g), `
    function closeness(grid, cell) {
      const n = grid.size - 1;
      return 2 * n - Math.abs(2 * cell.row - n) - Math.abs(2 * cell.col - n);
    }

    function utility(grid) {
      let treasure = 0;
      for (const cell of grid.cells) {
        if (cell.colour === MY_COLOUR) treasure += cell.value * closeness(grid, cell);
      }
      return treasure;
    }`),
  exemplar: (p, g) => wire(g, full(g.N, symForValue(g, g.vmax)), full(g.N, p.X)),
});

export const GEOMETRY = [castleKeeper, chessmaster, archipelago, bridgeBuilder, lookingGlass, pinwheel, cardWindmill,
  royalCourt, bullseye, snakeCharmer, tetrominoTamer, rainbowBands, constellation, rainbowRoads, paintMixer, carousel,
  gravity, swissCheese, mountainClimb, treasureMap];
