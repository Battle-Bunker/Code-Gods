/** Geometry & topology lens rules (lib/grid-lab/gridlab/rules/geometry.py, cards from rules/cards.py). */
import type { CardText, GridSpec } from "./_util.ts";
import { colourParam, choiceParam } from "../../params.ts";
import { rankAt, rankName, rankOptions, suitOptions } from "./games.ts";
import {
  SCALAR, SUIT_NAMES, an, bestOf, cap, climb, cname, colourPairs, fromFn, full, gridFamily, isRim, pick, product, pyCard, range, recipes, sentences, symForValue, tsCard, tuple, wire, colourAt, recolourNames,
} from "./_util.ts";
import { solvedAnalytic } from "../../analytic/hook.ts";
import { LONGEST_SNAKES, longestSnake } from "../../analytic/maxima.ts";

const other = (g: GridSpec, ...cs: number[]) => range(g.C).find(k => !cs.includes(k))!;
/** Join sentences, dropping the empty ones (the value key is "" on base 10). */

// --- Castle Keeper ---------------------------------------------------------------------------------
/**
 * One idea: shut-in cells. The rule used to deal three scoring modes (shut-in cells; shut-in cells of a treasure colour;
 * shut-in cells plus 3 per pocket), which are not peers (top 36.0, 42.0 and 49.8 bits on 5×5, base 10, rgby): params
 * make peer rules of equal opportunity (docs/rules-design.md P10). The plain flood is the rule (it is the one the
 * step-through story and the gallery tell), so the mode and treasure params are gone and only the wall colour remains.
 */
type CastleP = { wall: string };
function castleText(p: CastleP, _g: GridSpec): CardText {
  const W = p.wall;
  return {
    emoji: "🏯", name: "Castle Keeper", consts: [["WALL", W]],
    about: `Try to keep the water out with walls of ${W}. Water flows in from the edge and can't cross ${W} cells. A cell is shut in when the water can't reach it. `
      + `Each shut-in cell scores 1 primary point. Each ${W} cell on the edge scores 1 secondary point.`,
  };
}
const castleKeeper = gridFamily<CastleP>({
  id: "castle_keeper", name: "Castle Keeper", emoji: "🏯", theme: "Walls that keep the water out",
  requires: { minSize: 4 }, shape: tuple(2), tags: ["shortlist"],
  params: () => ({ wall: colourParam("Wall colour") }),
  support: g => g.colourNames.map(wall => ({ wall })),
  sample: (rng, g) => ({ wall: g.colourNames[rng.int(g.C)] }),
  canonical: (p, g) => recolourNames(g, p, ["wall"]),
  summary: (p, g) => castleText(p, g).about,
  python: (p, g) => pyCard(castleText(p, g), `
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

    def utility(grid):
        outside = grid.reachable(grid.edge_cells, through=not_wall)  # cells you can walk to from the edge
        shut_in = 0
        for cell in grid.cells:
            if inside(cell, outside):
                shut_in += 1
        return (shut_in, walls_on_edge(grid))`),
  typescript: (p, g) => tsCard(castleText(p, g), `
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

    function utility(grid) {
      const outside = grid.reachable(grid.edgeCells, notWall);  // cells you can walk to from the edge
      let shutIn = 0;
      for (const cell of grid.cells) {
        if (inside(cell, outside)) shutIn += 1;
      }
      return [shutIn, wallsOnEdge(grid)];
    }`),
  exemplar: (p, g) => {
    const N = g.N, W = colourAt(g, p.wall), inner = other(g, W);
    return wire(g, full(N, 0), fromFn(N, (r, c) => (isRim(N, r, c) ? W : inner)));
  },
});

// --- Chessmaster ---------------------------------------------------------------------------------
type ChessP = { colour_a: string; colour_b: string };
const chessText = (p: ChessP): CardText => {
  const A = p.colour_a, B = p.colour_b;
  return {
    emoji: "♟️", name: "Chessmaster", consts: [["COLOUR_A", A], ["COLOUR_B", B]],
    about: `Try to make little chessboards of ${A} and ${B}. Each 2×2 block whose colours alternate ${A} and ${B} like a chessboard scores 1 primary point. `
      + `Each place where ${an(A)} cell touches ${an(B)} cell scores 1 secondary point.`,
  };
};
const chessmaster = gridFamily<ChessP>({
  id: "chessmaster", name: "Chessmaster", emoji: "♟️", theme: "Little chessboards in your two colours",
  shape: tuple(2), tags: ["shortlist"],
  params: () => ({ colour_a: colourParam("First colour"), colour_b: colourParam("Second colour (not the first)") }),
  support: g => colourPairs(g).map(([A, B]) => ({ colour_a: g.colourNames[A], colour_b: g.colourNames[B] })),
  canonical: (p, g) => recolourNames(g, p, ["colour_a", "colour_b"]),
  summary: p => chessText(p).about,
  python: p => pyCard(chessText(p), `
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
  typescript: p => tsCard(chessText(p), `
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
  exemplar: (p, g) => wire(g, full(g.N, 0), fromFn(g.N, (r, c) => colourAt(g, (r + c) % 2 === 0 ? p.colour_a : p.colour_b))),
});

// --- Bridge Builder --------------------------------------------------------------------------------
type BridgeP = { colour: string; direction: "LR" | "TB" };
const bridgeText = (p: BridgeP, g: GridSpec): CardText => {
  const C = p.colour, lr = p.direction === "LR";
  return {
    emoji: "🌉", name: "Bridge Builder", consts: [["MY_COLOUR", C]],
    about: `Try to build a bridge of touching ${C} cells ${lr ? "from the left edge to the right edge" : "from the top edge to the bottom edge"}. `
      + `Each ${lr ? "column" : "row"} that your widest ${C} bridge reaches scores 1 point.`,
  };
};
const bridgeBuilder = gridFamily<BridgeP>({
  id: "bridge_builder", name: "Bridge Builder", emoji: "🌉", theme: "A path from one edge to the other",
  shape: SCALAR, tags: ["shortlist"],
  params: () => ({
    colour: colourParam("Bridge colour"),
    direction: choiceParam("Bridge runs", [["LR", "from the left edge to the right edge"], ["TB", "from the top edge to the bottom edge"]]),
  }),
  support: g => product<BridgeP>({ colour: g.colourNames, direction: ["LR", "TB"] }),
  canonical: (_, g) => ({ colour: g.colourNames[0], direction: "LR" }),
  summary: (p, g) => bridgeText(p, g).about,
  python: (p, g) => {
    const [across, attr] = p.direction === "LR" ? ["columns", "col"] : ["rows", "row"];
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
    const [across, attr] = p.direction === "LR" ? ["columns", "col"] : ["rows", "row"];
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
    const m = Math.floor(g.N / 2), C = colourAt(g, p.colour), o = (C + 1) % g.C;
    return wire(g, full(g.N, 0), fromFn(g.N, (r, c) => ((p.direction === "LR" ? r : c) === m ? C : o)));
  },
});

/** How a quarter turn moves cells: in sets of 4, and on an odd-sized grid the middle cell stays put (it is in no set). */
const quarterTurnSets = (g: GridSpec) => `cells swap places in sets of 4${g.N % 2 ? ", and the middle cell stays put" : ""}.`;

// --- Card Windmill ---------------------------------------------------------------------------------
const windmillText = (g: GridSpec): CardText => ({
  emoji: "🌀", name: "Card Windmill", consts: [],
  about: `Try to make suits spin round a quarter turn. Turn the grid a quarter turn clockwise, so every card ${g.N % 2 ? "except the middle one " : ""}lands on another spot. `
    + (g.N % 2 ? "The middle card never scores. " : "")
    + `A turn is good when the card there is the next suit. ${cap(g.say.distinctSuits(4))} go round in order: ♠ → ♥ → ♦ → ♣ → ♠. `
    + "A card whose four turns are all good scores 1 primary point. Each good turn scores 1 secondary point.",
});
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
  requires: { classes: ["Suited"], minSuits: 4 }, shape: tuple(2), tags: ["shortlist"],
  params: () => ({}),
  support: () => [{}],
  summary: (_, g) => windmillText(g).about,
  python: (_, g) => pyCard(windmillText(g), `
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
  typescript: (_, g) => tsCard(windmillText(g), `
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
/**
 * Your suit. "Any suit" used to be a fifth option, but a court of any picture card is far easier to build than one of a
 * single suit (top 60.7 vs 70.9 bits on 7×7, a random board's mean 1.33 vs 1.09): params make peer rules of equal
 * opportunity (docs/rules-design.md P10). The four named suits are peers (a permutation of suits), so they stay.
 */
type CourtP = { suit: string };
const courtText = (p: CourtP, g: GridSpec): CardText => {
  const royal = `a picture card (J, Q or K) of ${g.say.suit(SUIT_NAMES.indexOf(p.suit as never))}`;
  return {
    emoji: "👑", name: "Royal Court",
    consts: [["MY_SUIT", p.suit]],
    about: `Try to build a court of picture cards around the middle. The middle cell must be ${royal}. Your court is it plus every such card joined to it by touching cells. `
      + "Each card in your court scores 1 primary point, doubled if none of the court is on the edge. "
      + "Each such card off the edge, anywhere on the board, scores 1 secondary point.",
  };
};
const royalCourt = gridFamily<CourtP>({
  id: "royal_court", name: "Royal Court", emoji: "👑", theme: "A palace of picture cards around the centre",
  requires: { classes: ["Faced"], parity: "odd" }, shape: tuple(2), tags: ["shortlist"],
  params: () => ({ suit: choiceParam("Suit of the court", suitOptions()) }),
  support: () => SUIT_NAMES.map(suit => ({ suit })),
  sample: rng => ({ suit: SUIT_NAMES[rng.int(4)] }),
  canonical: () => ({ suit: SUIT_NAMES[0] }),
  summary: (p, g) => courtText(p, g).about,
  python: (p, g) => pyCard(courtText(p, g), `
    def royal(cell):
        return cell.is_picture and cell.suit == MY_SUIT

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
  typescript: (p, g) => tsCard(courtText(p, g), `
    function royal(cell) {
      return cell.isPicture && cell.suit === MY_SUIT;
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
    const su = SUIT_NAMES.indexOf(p.suit as never), N = g.N, z = full(N, 0);
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

type ColourP = { colour: string };
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
type IslandsP = ColourP;
const archText = (p: IslandsP, g: GridSpec): CardText => ({
  emoji: "🗺️", name: "Archipelago", consts: [["MY_COLOUR", p.colour]],
  about: `Try to make many separate ${p.colour} islands. An island is a patch of touching ${p.colour} cells. Cells that only touch at a corner are not joined. `
    + "Each island scores 1 point.",
});
const archipelago = gridFamily<IslandsP>({
  id: "archipelago", name: "Archipelago", emoji: "🗺️", theme: "As many separate islands as possible", shape: SCALAR,
  params: () => ({ colour: colourParam("Island colour") }),
  support: g => g.colourNames.map(colour => ({ colour })),
  canonical: (p, g) => recolourNames(g, p, ["colour"]),
  summary: (p, g) => archText(p, g).about,
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
  exemplar: (p, g) => {
    const C = colourAt(g, p.colour);
    return wire(g, full(g.N, 0), fromFn(g.N, (r, c) => ((r + c) % 2 === 0 ? C : (C + 1) % g.C)));
  },
});

// --- Looking-Glass -------------------------------------------------------------------------------
/**
 * Fold the grid left onto right or top onto bottom (peers: a transpose swaps them), and the numbers must match. The rule
 * used to deal five folds (the diagonals and the half-turn pair up fewer or more cells: top 9.6 vs 13.0 bits on 4×4) and
 * a colour or number layer (colours: 9.6..13.1 bits, numbers: 21.0..26.5), which are not peers: params make peer rules of
 * equal opportunity (docs/rules-design.md P10). Only the two straight folds stay, and the layer is the number.
 */
type GlassP = { axis: "V" | "H" };
const TWIN: Record<GlassP["axis"], [string, string]> = {
  V: ["Fold the grid down the middle, left onto right", "cell.row, n - cell.col"],
  H: ["Fold the grid top onto bottom", "n - cell.row, cell.col"],
};
const glassText = (p: GlassP, g: GridSpec): CardText => ({
  emoji: "🔍", name: "Looking-Glass", consts: [],
  about: `Try to make every cell match its mirror twin. ${TWIN[p.axis][0]}: every cell lands on a twin. Each pair of twins with the same `
    + `${g.cards ? "rank" : "number"} scores 1 point. A cell that lands on itself scores nothing.`,
});
const lookingGlass = gridFamily<GlassP>({
  id: "looking_glass", name: "Looking-Glass", emoji: "🔍", theme: "Every cell matches its mirror twin", shape: SCALAR,
  params: () => ({ axis: choiceParam("Fold the grid", [["V", "left onto right"], ["H", "top onto bottom"]]) }),
  support: () => [{ axis: "V" }, { axis: "H" }],
  canonical: () => ({ axis: "V" }),
  summary: (p, g) => glassText(p, g).about,
  python: (p, g) => pyCard(glassText(p, g), `
      def twin(grid, cell):
          n = grid.size - 1
          return grid.cell(${TWIN[p.axis][1]})

      def place(grid, cell):
          return cell.row * grid.size + cell.col

      def utility(grid):
          pairs = 0
          for cell in grid.cells:
              other = twin(grid, cell)
              if place(grid, other) > place(grid, cell) and other.value == cell.value:
                  pairs += 1
          return pairs`),
  typescript: (p, g) => tsCard(glassText(p, g), `
      function twin(grid, cell) {
        const n = grid.size - 1;
        return grid.cell(${TWIN[p.axis][1]});
      }

      function place(grid, cell) {
        return cell.row * grid.size + cell.col;
      }

      function utility(grid) {
        let pairs = 0;
        for (const cell of grid.cells) {
          const other = twin(grid, cell);
          if (place(grid, other) > place(grid, cell) && other.value === cell.value) pairs += 1;
        }
        return pairs;
      }`),
  exemplar: (_, g) => wire(g, full(g.N, 0), full(g.N, 0)),
});

// --- Pinwheel ------------------------------------------------------------------------------------
/**
 * The numbers (the suit on cards) decide. The rule used to deal a colour or a number layer, which are not peers (top
 * 19.0 vs 40.0 bits on 4×4, base 10, rgb): params make peer rules of equal opportunity (docs/rules-design.md P10), so
 * the layer is fixed to the number and the family has no params.
 */
type PinP = Record<string, never>;
const pinKey = (g: GridSpec) => (g.cards ? "suit" : "symbol");
const pinWord = (g: GridSpec) => (g.cards ? "suit" : "number");
const pinText = (_p: PinP, g: GridSpec): CardText => ({
  emoji: "🎡", name: "Pinwheel", consts: [],
  about: `Try to make a quarter turn leave the grid looking the same. Turn the grid a quarter turn: ${quarterTurnSets(g)} `
    + `A set of 4 that all share the same ${pinWord(g)} scores 1 primary point. `
    + `In each set, every cell of the commonest ${pinWord(g)} scores 1 secondary point.`,
});
const pinwheel = gridFamily<PinP>({
  id: "pinwheel", name: "Pinwheel", emoji: "🎡", theme: "Looks the same after a quarter turn", shape: tuple(2),
  params: () => ({}),
  support: () => [{}],
  summary: (p, g) => pinText(p, g).about,
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
            keys = [other.${pinKey(g)} for other in orbit]
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
        const keys = orbit.map(other => other.${pinKey(g)});
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
  about: "Try to make rings like an archery target. The grid is made of square rings. Start at the outside ring and move inwards. "
    + "A ring scores 1 primary point if it is all one colour and a different colour from the ring outside it. "
    + "Stop at the first ring that fails. In each ring, every cell of its commonest colour scores 1 secondary point.",
};
const bullseye = gridFamily<Record<string, never>>({
  id: "bullseye", name: "Bullseye", emoji: "🎯", theme: "Rings like an archery target", shape: tuple(2),
  params: () => ({}),
  support: () => [{}],
  summary: () => bullText.about,
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
  emoji: "🐍", name: "Snake Charmer", consts: [["MY_COLOUR", p.colour]],
  about: `Try to build the longest snake of ${p.colour}. A snake is a patch of touching cells one cell wide, with no branches `
    + "and no loops. Each cell of your longest snake scores 1 point.",
});
const snakeCharmer = gridFamily<IslandsP>({
  id: "snake_charmer", name: "Snake Charmer", emoji: "🐍", theme: "The longest wiggly snake", shape: SCALAR,
  params: () => ({ colour: colourParam("Snake colour") }),
  support: g => g.colourNames.map(colour => ({ colour })),
  canonical: (p, g) => recolourNames(g, p, ["colour"]),
  summary: (p, g) => snakeText(p, g).about,
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
    const N = g.N, C = colourAt(g, p.colour), o = (C + 1) % g.C, snake = new Set(LONGEST_SNAKES[N] ?? longestSnake(N)); // tabulated for every GRID_SIZES
    return wire(g, full(N, 0), fromFn(N, (r, c) => (snake.has(r * N + c) ? C : o)));
  },
});

// --- Tetromino Tamer -------------------------------------------------------------------------------
type PieceP = { colour: string; piece: "I" | "O" | "T" | "L" | "S" };
const PIECES: Record<PieceP["piece"], [number, number][]> = {
  I: [[0, 0], [0, 1], [0, 2], [0, 3]], O: [[0, 0], [0, 1], [1, 0], [1, 1]], T: [[0, 0], [0, 1], [0, 2], [1, 1]],
  L: [[0, 0], [1, 0], [2, 0], [2, 1]], S: [[0, 1], [0, 2], [1, 0], [1, 1]],
};
/** The piece's 8 turns and flips, normalised to the top-left, as sorted [r, c] lists (grid-lab piece_forms). */
function pieceForms(P: PieceP["piece"]): [number, number][][] {
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
function bestPacking(N: number, P: PieceP["piece"]): boolean[][] {
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
export function packTetrominoes(N: number, P: PieceP["piece"], window = 4 * N): { occ: boolean[][]; value: [number, number] } {
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
const PIECE_LOOK: Record<PieceP["piece"], string> = {
  I: "a straight line of 4", O: "a 2×2 square", T: "a T shape", L: "an L shape", S: "a zig-zag",
};
/**
 * One piece: the O (a 2×2 square). The rule used to deal a Tetris piece (I, O, T, L or S) as a param, but the pieces are
 * not peers: they fit a board differently, and the sampled tops of the five (11.5 to 18.0 bits on 4×4, base 10, rgb; no two
 * agree within 15% on every shape) differ by more than any band allows. Params make peer rules of equal opportunity
 * (docs/rules-design.md P10), so the piece is fixed (O has the highest top bits on most shapes) and only the island
 * colour is dealt. The packing search below still takes a piece.
 */
const PIECE = "O" satisfies PieceP["piece"];
type TetP = { colour: string };
const tetText = (p: TetP, _g: GridSpec): CardText => ({
  emoji: "🧱", name: "Tetromino Tamer", consts: [["MY_COLOUR", p.colour], ["MY_PIECE", PIECE]],
  about: `Try to make ${p.colour} islands shaped like a Tetris ${PIECE} piece. An island is a patch of touching ${p.colour} cells. Each island of exactly 4 cells shaped like one `
    + `(${PIECE_LOOK[PIECE]}) scores 1 primary point. Each island of exactly 4 cells, of any shape, scores 1 secondary point.`,
});
const TET_PY = `${SAME_COLOUR_PY}
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
        return (pieces, fours)`;
const TET_TS = `${SAME_COLOUR_TS}
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
    }`;
const tetrominoTamer = gridFamily<TetP>({
  id: "tetromino_tamer", name: "Tetromino Tamer", emoji: "🧱", theme: "Islands shaped like a Tetris square",
  shape: tuple(2),
  params: () => ({ colour: colourParam("Island colour") }),
  support: g => g.colourNames.map(colour => ({ colour })),
  sample: (rng, g) => ({ colour: g.colourNames[rng.int(g.C)] }),
  canonical: (p, g) => recolourNames(g, p, ["colour"]),
  summary: (p, g) => tetText(p, g).about,
  python: (p, g) => pyCard(tetText(p, g), TET_PY),
  typescript: (p, g) => tsCard(tetText(p, g), TET_TS),
  exemplar: (p, g) => {
    const C = colourAt(g, p.colour);
    return wire(g, full(g.N, 0), bestPacking(g.N, PIECE).map(row => row.map(o => (o ? C : (C + 1) % g.C))));
  },
});

// --- Rainbow Bands -----------------------------------------------------------------------------------
type BandP = { corner: "TL" | "TR" | "BL" | "BR" };
const bandDist = (p: BandP, N: number, r: number, c: number) =>
  (p.corner[0] === "T" ? r : N - 1 - r) + (p.corner[1] === "L" ? c : N - 1 - c);
const BAND_PY: Record<BandP["corner"], string> = {
  TL: "cell.row + cell.col", TR: "cell.row + (n - cell.col)", BL: "(n - cell.row) + cell.col", BR: "(n - cell.row) + (n - cell.col)",
};
const bandText = (p: BandP, g: GridSpec): CardText => ({
  emoji: "🌈", name: "Rainbow Bands", consts: [],
  about: `Try to paint slanted stripes starting from the ${p.corner[0] === "T" ? "top" : "bottom"}-${p.corner[1] === "L" ? "left" : "right"} `
    + `corner in rainbow order (${g.colourNames.join(", ")}, then again). Each cell of a stripe that is all in its right colour scores 1 primary point. `
    + "Each cell in its right colour, in any stripe, scores 1 secondary point.",
});
const rainbowBands = gridFamily<BandP>({
  id: "rainbow_bands", name: "Rainbow Bands", emoji: "🌈", theme: "Slanted rainbow stripes from your corner",
  requires: { classes: ["Spectral"] }, shape: tuple(2),
  params: () => ({ corner: choiceParam("Start from the", [["TL", "top-left corner"], ["TR", "top-right corner"], ["BL", "bottom-left corner"], ["BR", "bottom-right corner"]]) }),
  support: () => (["TL", "TR", "BL", "BR"] as const).map(corner => ({ corner })),
  canonical: () => ({ corner: "TL" }),
  summary: (p, g) => bandText(p, g).about,
  python: (p, g) => pyCard(bandText(p, g), `
    def stripe(grid, cell):
        n = grid.size - 1
        return ${BAND_PY[p.corner]}

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
      return ${BAND_PY[p.corner]};
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
type RankP = { star: string };
const rankValue = (g: GridSpec, rank: number) => (g.cards ? rank + 1 : rank);
const starText = (p: RankP, g: GridSpec): CardText => ({
  emoji: "✨", name: "Constellation", consts: [["MY_VALUE", rankValue(g, rankAt(g, p.star)), g.cards ? ({ 1: "Ace", 11: "Jack", 12: "Queen", 13: "King" } as Record<number, string>)[rankValue(g, rankAt(g, p.star))] ?? "" : ""]],
  about: `Try to make one big cluster of stars, the cells showing ${g.say.rank(rankAt(g, p.star))}. Stars that touch, even at a corner, form a cluster. `
    + "Each star in your biggest cluster scores 1 point.",
});
const constellation = gridFamily<RankP>({
  id: "constellation", name: "Constellation", emoji: "✨", theme: "The biggest star cluster of your symbol", shape: SCALAR,
  params: g => ({ star: choiceParam("Your stars", rankOptions(g)) }),
  support: g => range(g.ranks).map(r => ({ star: rankName(g, r) })),
  canonical: (_, g) => ({ star: rankName(g, 0) }),
  summary: (p, g) => starText(p, g).about,
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
  exemplar: (p, g) => wire(g, full(g.N, rankAt(g, p.star)), full(g.N, 0)),
});

// --- Rainbow Roads -------------------------------------------------------------------------------------
const roadsText = (g: GridSpec): CardText => ({
  emoji: "🛣️", name: "Rainbow Roads", consts: [],
  about: `Try to make many rainbow roads. A road walks from cell to touching cell through the colours in order: ${g.colourNames.join(" → ")}. `
    + "Each different complete road scores 1 point.",
});
const rainbowRoads = gridFamily<Record<string, never>>({
  id: "rainbow_roads", name: "Rainbow Roads", emoji: "🛣️", theme: "Rainbow paths from first colour to last",
  requires: { classes: ["Spectral"], minColours: 4 }, shape: SCALAR,
  params: () => ({}),
  support: () => [{}],
  summary: (_, g) => roadsText(g).about,
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
  about: `Try to sandwich each mixed colour between its two paints. Paints mix like this: ${recipes(g).map(([a, b, m]) => `${cname(g, a)} + ${cname(g, b)} = ${cname(g, m)}`).join(", ")}. `
    + "A mixed cell scores 1 primary point when its two paints sit left and right of it, and 1 more when they sit above and below. "
    + "Each mixed cell touching one of its paints scores 1 secondary point.",
});
const paintMixer = gridFamily<Record<string, never>>({
  id: "paint_mixer", name: "Paint Mixer", emoji: "🖌️", theme: "Mixed colours sandwiched between their parents",
  requires: { classes: ["Mixable"] }, shape: tuple(2),
  params: () => ({}),
  support: () => [{}],
  summary: (_, g) => mixerText(g).about,
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
type TurnP = { direction: "cw" | "ccw" };
/** The border, clockwise from the top-left (grid-lab border_ring). */
const ringCells = (N: number): [number, number][] => [
  ...range(N - 1).map(c => [0, c] as [number, number]), ...range(N - 1).map(r => [r, N - 1] as [number, number]),
  ...range(N - 1).map(i => [N - 1, N - 1 - i] as [number, number]), ...range(N - 1).map(i => [N - 1 - i, 0] as [number, number]),
];
const carouselText = (p: TurnP, g: GridSpec): CardText => ({
  emoji: "🎠", name: "Colour Carousel", consts: [],
  about: `Try to make the border go round the colour wheel. Walk round the edge ${p.direction === "cw" ? "clockwise" : "anticlockwise"}. The colour wheel goes ${g.colourNames.join(" → ")} → back to ${g.colourNames[0]}. `
    + "A step is fine if it keeps the colour or moves to the next colour on the wheel. "
    + "A lap, with every step fine and the walk going right round the wheel at least once, scores 1 primary point. "
    + "Each step that moves on scores 1 secondary point. Each fine step scores 1 tertiary point.",
});
const carousel = gridFamily<TurnP>({
  id: "colour_carousel", name: "Colour Carousel", emoji: "🎠", theme: "The border goes round the colour wheel",
  requires: { classes: ["Wheel"], minSize: 4 }, shape: tuple(3),
  params: () => ({ direction: choiceParam("Walk round the edge", [["cw", "clockwise"], ["ccw", "anticlockwise"]]) }),
  support: () => [{ direction: "cw" }, { direction: "ccw" }],
  canonical: () => ({ direction: "cw" }),
  summary: (p, g) => carouselText(p, g).about,
  python: (p, g) => pyCard(carouselText(p, g), `
    def border(grid):
        n = grid.size - 1
        ring = [grid.cell(0, c) for c in range(n)] + [grid.cell(r, n) for r in range(n)]
        ring += [grid.cell(n, c) for c in range(n, 0, -1)] + [grid.cell(r, 0) for r in range(n, 0, -1)]
        return ring${p.direction === "ccw" ? "[::-1]" : ""}

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
  typescript: (p, g) => tsCard(carouselText(p, g), `
    function border(grid) {
      const n = grid.size - 1, ring = [];
      for (let c = 0; c < n; c++) ring.push(grid.cell(0, c));
      for (let r = 0; r < n; r++) ring.push(grid.cell(r, n));
      for (let c = n; c > 0; c--) ring.push(grid.cell(n, c));
      for (let r = n; r > 0; r--) ring.push(grid.cell(r, 0));
      return ring${p.direction === "ccw" ? ".reverse()" : ""};
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
    const N = g.N, C = g.C, ring = ringCells(N), order = p.direction === "ccw" ? ring.slice().reverse() : ring;
    const A = C * Math.floor(order.length / C), col = full(N, 0);
    order.forEach(([r, c], i) => { col[r][c] = Math.min(i, A) % C; });
    return wire(g, full(N, 0), col);
  },
});

// --- Falling Sand (gravity) -------------------------------------------------------------------------------
const sandText = (p: ColourP, g: GridSpec): CardText => ({
  emoji: "⏳", name: "Falling Sand", consts: [["MY_COLOUR", p.colour]],
  about: `Try to sink your ${p.colour} sand to the bottom. Each ${p.colour} cell that has only ${p.colour} cells below it, `
    + "all the way to the bottom, scores 1 point.",
});
const gravity = gridFamily<ColourP>({
  id: "gravity", name: "Falling Sand", emoji: "⏳", theme: "Your colour sinks to the bottom", shape: SCALAR,
  analytic: solvedAnalytic("gravity"),
  params: () => ({ colour: colourParam("Sand colour") }),
  support: g => g.colourNames.map(colour => ({ colour })),
  canonical: (p, g) => recolourNames(g, p, ["colour"]),
  summary: (p, g) => sandText(p, g).about,
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
  exemplar: (p, g) => wire(g, full(g.N, 0), full(g.N, colourAt(g, p.colour))),
});

// --- Swiss Cheese ----------------------------------------------------------------------------------------
const cheeseText = (p: ColourP, g: GridSpec): CardText => ({
  emoji: "🧀", name: "Swiss Cheese", consts: [["MY_COLOUR", p.colour]],
  about: `Try to make holes in your ${p.colour} cheese. A hole is a patch of touching cells of other colours, with ${p.colour} all round it, `
    + `not touching the edge. Each hole scores 1 primary point. Each ${p.colour} cell on the edge scores 1 secondary point.`,
});
const swissCheese = gridFamily<ColourP>({
  id: "swiss_cheese", name: "Swiss Cheese", emoji: "🧀", theme: "As many holes as possible",
  requires: { minSize: 4 }, shape: tuple(2),
  params: () => ({ colour: colourParam("Cheese colour") }),
  support: g => g.colourNames.map(colour => ({ colour })),
  canonical: (p, g) => recolourNames(g, p, ["colour"]),
  summary: (p, g) => cheeseText(p, g).about,
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
    const N = g.N, X = colourAt(g, p.colour), col = fromFn(N, (r, c) => (isRim(N, r, c) || (r + c) % 2 === 1 ? X : (X + 1) % g.C));
    return climb("swiss_cheese", p, ctx, [{ sym: full(N, 0), col }], 0);
  },
});

// --- Mountain Climb --------------------------------------------------------------------------------------
const climbText = (g: GridSpec): CardText => ({
  emoji: "🧗", name: "Mountain Climb", consts: [],
  about: sentences(`Try to climb from the top-left cell to the bottom-right corner. Step to a touching cell whose ${g.cards ? "value" : "number"} is exactly 1 bigger, again and again.`,
    g.say.valueKey(),
    "A climb that reaches the bottom-right corner scores 1 primary point. Each cell of your longest climb scores 1 secondary point."),
});
const mountainClimb = gridFamily<Record<string, never>>({
  id: "mountain_climb", name: "Mountain Climb", emoji: "🧗", theme: "Climb one step at a time to the far corner",
  requires: { classes: ["Valued"] }, shape: tuple(2),
  params: () => ({}),
  support: () => [{}],
  summary: (_, g) => climbText(g).about,
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
  emoji: "🗝️", name: "Treasure Map", consts: [["MY_COLOUR", p.colour]],
  about: sentences(`Try to put big ${g.cards ? "values" : "numbers"} of ${p.colour} near the middle. Each ${p.colour} cell scores its ${g.cards ? "value" : "number"} times its closeness, in points.`, g.say.valueKey(),
    "Closeness is 0 in a corner and grows towards the middle."),
});
const treasureMap = gridFamily<ColourP>({
  id: "treasure_map", name: "Treasure Map", emoji: "🗝️", theme: "Big numbers of your colour near the middle",
  analytic: solvedAnalytic("treasure_map"),
  requires: { classes: ["Valued"] }, shape: SCALAR,
  params: () => ({ colour: colourParam("Treasure colour") }),
  support: g => g.colourNames.map(colour => ({ colour })),
  canonical: (p, g) => recolourNames(g, p, ["colour"]),
  summary: (p, g) => mapText(p, g).about,
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
  exemplar: (p, g) => wire(g, full(g.N, symForValue(g, g.vmax)), full(g.N, colourAt(g, p.colour))),
});

// ================================================================================================
// Splits (docs/rules-design.md P10): ideas that used to be params of a family above, whose variants were not peers of
// equal opportunity. Each is its own family with only peer params (or none); no stored god holds these ids.
// ================================================================================================

// --- Mirror Quilt (Looking-Glass on colours) -----------------------------------------------------
/** Looking-Glass's colour layer: fold left onto right or top onto bottom (a transpose swaps them), and the colours must match. */
const mirrorText = (p: GlassP, _g: GridSpec): CardText => ({
  emoji: "🪞", name: "Mirror Quilt", consts: [],
  about: `Try to make every cell match its mirror twin in colour. ${TWIN[p.axis][0]}: every cell lands on a twin. Each pair of twins with the same colour scores 1 point. `
    + "A cell that lands on itself scores nothing.",
});
const mirrorQuilt = gridFamily<GlassP>({
  id: "mirror_quilt", name: "Mirror Quilt", emoji: "🪞", theme: "Every cell matches its mirror twin in colour", shape: SCALAR,
  params: () => ({ axis: choiceParam("Fold the grid", [["V", "left onto right"], ["H", "top onto bottom"]]) }),
  support: () => [{ axis: "V" }, { axis: "H" }],
  canonical: () => ({ axis: "V" }),
  summary: (p, g) => mirrorText(p, g).about,
  python: (p, g) => pyCard(mirrorText(p, g), `
      def twin(grid, cell):
          n = grid.size - 1
          return grid.cell(${TWIN[p.axis][1]})

      def place(grid, cell):
          return cell.row * grid.size + cell.col

      def utility(grid):
          pairs = 0
          for cell in grid.cells:
              other = twin(grid, cell)
              if place(grid, other) > place(grid, cell) and other.colour == cell.colour:
                  pairs += 1
          return pairs`),
  typescript: (p, g) => tsCard(mirrorText(p, g), `
      function twin(grid, cell) {
        const n = grid.size - 1;
        return grid.cell(${TWIN[p.axis][1]});
      }

      function place(grid, cell) {
        return cell.row * grid.size + cell.col;
      }

      function utility(grid) {
        let pairs = 0;
        for (const cell of grid.cells) {
          const other = twin(grid, cell);
          if (place(grid, other) > place(grid, cell) && other.colour === cell.colour) pairs += 1;
        }
        return pairs;
      }`),
  exemplar: (_, g) => wire(g, full(g.N, 0), full(g.N, 0)),
});

// --- Colour Pinwheel (Pinwheel on colours) ---------------------------------------------------------
const colourPinText = (_p: PinP, g: GridSpec): CardText => ({
  emoji: "🌀", name: "Colour Pinwheel", consts: [],
  about: `Try to make a quarter turn leave the colours the same. Turn the grid a quarter turn: ${quarterTurnSets(g)} `
    + "A set of 4 that all share the same colour scores 1 primary point. "
    + "In each set, every cell of the commonest colour scores 1 secondary point.",
});
const colourPinwheel = gridFamily<PinP>({
  id: "colour_pinwheel", name: "Colour Pinwheel", emoji: "🌀", theme: "The same colour all the way round a quarter turn", shape: tuple(2),
  params: () => ({}),
  support: () => [{}],
  summary: (p, g) => colourPinText(p, g).about,
  python: (p, g) => pyCard(colourPinText(p, g), `
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
            keys = [other.colour for other in orbit]
            same = max(keys.count(key) for key in keys)
            most += same
            if same == 4:
                full += 1
        return (full, most)`),
  typescript: (p, g) => tsCard(colourPinText(p, g), `
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
        const keys = orbit.map(other => other.colour);
        const same = Math.max(...keys.map(key => keys.filter(k => k === key).length));
        most += same;
        if (same === 4) full += 1;
      }
      return [full, most];
    }`),
  exemplar: (_, g) => wire(g, full(g.N, 0), full(g.N, 0)),
});

// --- The four piece tamers (Tetromino Tamer's I, T, L and S pieces) -----------------------------------
/** One Tetris piece, any turn or flip; the island colour is the only param (every colour is a peer). */
function pieceTamer(piece: "I" | "T" | "L" | "S", id: string, name: string, theme: string, minSize?: number) {
  const text = (p: TetP, _g: GridSpec): CardText => ({
    emoji: "🧱", name, consts: [["MY_COLOUR", p.colour], ["MY_PIECE", piece]],
    about: `Try to make ${p.colour} islands shaped like a Tetris ${piece} piece. An island is a patch of touching ${p.colour} cells. Each island of exactly 4 cells shaped like one `
      + `(${PIECE_LOOK[piece]}, turned or flipped is fine) scores 1 primary point. Each island of exactly 4 cells, of any shape, scores 1 secondary point.`,
  });
  return gridFamily<TetP>({
    id, name, emoji: "🧱", theme, shape: tuple(2), ...(minSize ? { requires: { minSize } } : {}),
    params: () => ({ colour: colourParam("Island colour") }),
    support: g => g.colourNames.map(colour => ({ colour })),
    sample: (rng, g) => ({ colour: g.colourNames[rng.int(g.C)] }),
    canonical: (p, g) => recolourNames(g, p, ["colour"]),
    summary: (p, g) => text(p, g).about,
    python: (p, g) => pyCard(text(p, g), TET_PY),
    typescript: (p, g) => tsCard(text(p, g), TET_TS),
    exemplar: (p, g) => {
      const C = colourAt(g, p.colour);
      return wire(g, full(g.N, 0), bestPacking(g.N, piece).map(row => row.map(o => (o ? C : (C + 1) % g.C))));
    },
  });
}
const iPieceTamer = pieceTamer("I", "i_piece_tamer", "I-Piece Tamer", "Islands shaped like a Tetris straight line", 4);
const tPieceTamer = pieceTamer("T", "t_piece_tamer", "T-Piece Tamer", "Islands shaped like a Tetris T");
const lPieceTamer = pieceTamer("L", "l_piece_tamer", "L-Piece Tamer", "Islands shaped like a Tetris L");
const sPieceTamer = pieceTamer("S", "s_piece_tamer", "S-Piece Tamer", "Islands shaped like a Tetris zig-zag");

// --- Treasure Castle and Castle Pockets (Castle Keeper's treasure and eyes modes) ---------------------
const castleFlood = (W: string) =>
  `Try to keep the water out with walls of ${W}. Water flows in from the edge and can't cross ${W} cells. A cell is shut in when the water can't reach it.`;
const CASTLE_BASE_PY = `
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
`;
const CASTLE_BASE_TS = `
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
`;

/** Castle Keeper where only shut-in cells of one treasure colour score. Wall and treasure are two different colours (every pair is a peer). */
type TreasureP = { wall: string; treasure: string };
const treasureText = (p: TreasureP, _g: GridSpec): CardText => ({
  emoji: "💎", name: "Treasure Castle", consts: [["WALL", p.wall], ["TREASURE", p.treasure]],
  about: `${castleFlood(p.wall)} Each shut-in ${p.treasure} cell scores 1 primary point. Each ${p.wall} cell on the edge scores 1 secondary point.`,
});
const treasureCastle = gridFamily<TreasureP>({
  id: "treasure_castle", name: "Treasure Castle", emoji: "💎", theme: "Walls that keep your treasure dry",
  requires: { minSize: 4 }, shape: tuple(2),
  params: () => ({ wall: colourParam("Wall colour"), treasure: colourParam("Treasure colour (not the wall)") }),
  support: g => colourPairs(g).map(([W, T]) => ({ wall: g.colourNames[W], treasure: g.colourNames[T] })),
  sample: (rng, g) => { const [W, T] = pick(rng, colourPairs(g)); return { wall: g.colourNames[W], treasure: g.colourNames[T] }; },
  canonical: (p, g) => recolourNames(g, p, ["wall", "treasure"]),
  summary: (p, g) => treasureText(p, g).about,
  python: (p, g) => pyCard(treasureText(p, g), `${CASTLE_BASE_PY}
    def utility(grid):
        outside = grid.reachable(grid.edge_cells, through=not_wall)  # cells you can walk to from the edge
        treasure = 0
        for cell in grid.cells:
            if inside(cell, outside) and cell.colour == TREASURE:
                treasure += 1
        return (treasure, walls_on_edge(grid))`),
  typescript: (p, g) => tsCard(treasureText(p, g), `${CASTLE_BASE_TS}
    function utility(grid) {
      const outside = grid.reachable(grid.edgeCells, notWall);  // cells you can walk to from the edge
      let treasure = 0;
      for (const cell of grid.cells) {
        if (inside(cell, outside) && cell.colour === TREASURE) treasure += 1;
      }
      return [treasure, wallsOnEdge(grid)];
    }`),
  exemplar: (p, g) => {
    const N = g.N, W = colourAt(g, p.wall), T = colourAt(g, p.treasure);
    return wire(g, full(N, 0), fromFn(N, (r, c) => (isRim(N, r, c) ? W : T)));
  },
});

/** Castle Keeper where each separate pocket of shut-in cells is worth 3 more (like eyes in Go). */
const pocketsText = (p: CastleP, _g: GridSpec): CardText => ({
  emoji: "👀", name: "Castle Pockets", consts: [["WALL", p.wall]],
  about: `${castleFlood(p.wall)} Each shut-in cell scores 1 primary point. Each separate pocket of shut-in cells scores 3 more primary points. `
    + `Each ${p.wall} cell on the edge scores 1 secondary point.`,
});
const castlePockets = gridFamily<CastleP>({
  id: "castle_pockets", name: "Castle Pockets", emoji: "👀", theme: "Walls that shut in separate pockets, like eyes in Go",
  requires: { minSize: 4 }, shape: tuple(2),
  params: () => ({ wall: colourParam("Wall colour") }),
  support: g => g.colourNames.map(wall => ({ wall })),
  sample: (rng, g) => ({ wall: g.colourNames[rng.int(g.C)] }),
  canonical: (p, g) => recolourNames(g, p, ["wall"]),
  summary: (p, g) => pocketsText(p, g).about,
  python: (p, g) => pyCard(pocketsText(p, g), `${CASTLE_BASE_PY}
    def same_side(a, b):
        return not_wall(a) == not_wall(b)

    def utility(grid):
        outside = grid.reachable(grid.edge_cells, through=not_wall)  # cells you can walk to from the edge
        points = 0
        for pocket in grid.regions(same_side):
            if inside(pocket[0], outside):
                points += len(pocket) + 3
        return (points, walls_on_edge(grid))`),
  typescript: (p, g) => tsCard(pocketsText(p, g), `${CASTLE_BASE_TS}
    function sameSide(a, b) {
      return notWall(a) === notWall(b);
    }

    function utility(grid) {
      const outside = grid.reachable(grid.edgeCells, notWall);  // cells you can walk to from the edge
      let points = 0;
      for (const pocket of grid.regions(sameSide)) {
        if (inside(pocket[0], outside)) points += pocket.length + 3;
      }
      return [points, wallsOnEdge(grid)];
    }`),
  exemplar: (p, g, ctx) => {
    const N = g.N, W = colourAt(g, p.wall), inner = other(g, W), z = full(N, 0);
    const col = fromFn(N, (r, c) => (isRim(N, r, c) ? W : inner));
    const col2 = fromFn(N, (r, c) => (isRim(N, r, c) || (r + c) % 2 === 1 ? W : inner));
    return climb("castle_pockets", p, ctx, [{ sym: z, col }, { sym: z, col: col2 }], 0);
  },
});

// --- Any-Suit Court (Royal Court of any suit) -------------------------------------------------------
type AnyCourtP = Record<string, never>;
const anyCourtText = (_p: AnyCourtP, _g: GridSpec): CardText => ({
  emoji: "🏰", name: "Any-Suit Court", consts: [],
  about: "Try to build a court of picture cards around the middle. The middle cell must be a picture card (J, Q or K) of any suit. Your court is it plus every picture card joined to it by touching cells. "
    + "Each card in your court scores 1 primary point, doubled if none of the court is on the edge. "
    + "Each picture card off the edge scores 1 secondary point.",
});
const anySuitCourt = gridFamily<AnyCourtP>({
  id: "any_suit_court", name: "Any-Suit Court", emoji: "🏰", theme: "A palace of any picture cards around the centre",
  requires: { classes: ["Faced"], parity: "odd" }, shape: tuple(2),
  params: () => ({}),
  support: () => [{}],
  summary: (p, g) => anyCourtText(p, g).about,
  python: (p, g) => pyCard(anyCourtText(p, g), `
    def royal(cell):
        return cell.is_picture

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
  typescript: (p, g) => tsCard(anyCourtText(p, g), `
    function royal(cell) {
      return cell.isPicture;
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
    const N = g.N, z = full(N, 0);
    // The doubled safe palace (2(N-2)^2) only beats an all-picture grid (N^2) at N = 7.
    return bestOf("any_suit_court", p, ctx, [
      { sym: fromFn(N, (r, c) => (isRim(N, r, c) ? 1 : 12)), col: z },
      { sym: full(N, 12), col: z },
    ]);
  },
});

export const GEOMETRY = [castleKeeper, chessmaster, archipelago, bridgeBuilder, lookingGlass, pinwheel, cardWindmill,
  royalCourt, bullseye, snakeCharmer, tetrominoTamer, rainbowBands, constellation, rainbowRoads, paintMixer, carousel,
  gravity, swissCheese, mountainClimb, treasureMap,
  mirrorQuilt, colourPinwheel, iPieceTamer, tPieceTamer, lPieceTamer, sPieceTamer, treasureCastle, castlePockets, anySuitCourt];
