/** Geometry & topology lens rules (lib/grid-lab/gridlab/rules/geometry.py, cards from rules/cards.py). */
import type { CardText, GridSpec } from "./_util.ts";
import {
  SCALAR, SUIT_NAMES, an, bestOf, climb, cname, colourPairs, fromFn, full, gridFamily, isRim, pick, product,
  pyCard, range, recolour, tsCard, tuple, wire,
} from "./_util.ts";

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

export const GEOMETRY = [castleKeeper, chessmaster, bridgeBuilder, cardWindmill, royalCourt];
