/**
 * The agents' own scores for four of the old game's beginner number rules on the coloured boards
 * (lib/v2-grid-boards/src/families/v1-numbers-b.ts): Spread of Three, Strangers, Leapfrog and Crosswise Threes. They
 * read numbers only, so their agents change numbers only. Each score is the engine's exactly
 * (test/board-catalogue-b.test.ts checks them on sampled boards in both languages).
 */
import type { BoardFamilyEntry } from "./board-starters.ts";

export const BOARD_CATALOGUE_B: readonly BoardFamilyEntry[] = [
  {
    family: "original-spread-three", moves: ["add"], mainSays: "2×2 squares that spread exactly 3",
    main: {
      ts: [
        "let main = 0, gaps = 0;",
        "for (let r = 0; r + 1 < B.n; r++) for (let c = 0; c + 1 < B.n; c++) {",
        "  const sq = [B.v[r * B.n + c], B.v[r * B.n + c + 1], B.v[(r + 1) * B.n + c], B.v[(r + 1) * B.n + c + 1]];",
        "  const spread = Math.max(...sq) - Math.min(...sq);   // biggest minus smallest",
        "  if (spread === 3) main++;",
        "  gaps += Math.abs(spread - 3);",
        "}",
      ],
      py: [
        "main, gaps = 0, 0",
        "for r in range(B.n - 1):",
        "    for c in range(B.n - 1):",
        "        sq = [B.v[r * B.n + c], B.v[r * B.n + c + 1], B.v[(r + 1) * B.n + c], B.v[(r + 1) * B.n + c + 1]]",
        "        spread = max(sq) - min(sq)   # biggest minus smallest",
        "        if spread == 3:",
        "            main += 1",
        "        gaps += abs(spread - 3)",
      ],
    },
    tieBreakers: {
      "spread-gaps": {
        ts: "-gaps", py: "-gaps", says: "fewest steps between the squares' spreads and 3",
        tryThis: "change FAR = 1 to 2: a square's spread can reach 3 in one move instead of two, though each move costs more.",
      },
    },
  },
  {
    family: "original-strangers", moves: ["add"], mainSays: "touching strangers in a 2×2 box, both bigger than 1",
    main: {
      ts: [
        "const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));   // the biggest number that divides both",
        "let main = 0, ones = 0;",
        "for (let k = 0; k < B.n; k++) for (let j = 0; j + 1 < B.n; j += 2) {   // the touching pairs inside the boxes",
        "  for (const [i, o] of [[k * B.n + j, k * B.n + j + 1], [j * B.n + k, (j + 1) * B.n + k]]) {",
        "    const a = B.v[i], b = B.v[o];",
        "    if (a * b < 2 || gcd(a, b) > 1) continue;   // a 0, two 1s, or a shared divisor",
        "    if (a === 1 || b === 1) ones++;",
        "    else if (Math.abs(a - b) > 1) main++;",
        "  }",
        "}",
      ],
      py: [
        "gcd = lambda a, b: a if b == 0 else gcd(b, a % b)   # the biggest number that divides both",
        "main, ones = 0, 0",
        "for k in range(B.n):",
        "    for j in range(0, B.n - 1, 2):   # the touching pairs inside the boxes",
        "        for i, o in ((k * B.n + j, k * B.n + j + 1), (j * B.n + k, (j + 1) * B.n + k)):",
        "            a, b = B.v[i], B.v[o]",
        "            if a * b < 2 or gcd(a, b) > 1:",
        "                continue   # a 0, two 1s, or a shared divisor",
        "            if a == 1 or b == 1:",
        "                ones += 1",
        "            elif abs(a - b) > 1:",
        "                main += 1",
      ],
    },
    tieBreakers: {
      "ones-beside-bigger": {
        ts: "ones", py: "ones", says: "1s touching a bigger number in their box",
        tryThis: "change FAR = 1 to 3: a cell can drop to 1 in one move, though each move costs more.",
      },
    },
  },
  {
    family: "original-leapfrog", moves: ["add"], mainSays: "numbers one away from the number two cells along their row",
    main: {
      ts: [
        "let main = 0;",
        "for (let r = 0; r < B.n; r++) for (let k = 0; k + 2 < B.n; k++) if (Math.abs(B.v[r * B.n + k] - B.v[r * B.n + k + 2]) === 1) main++;",
      ],
      py: [
        "main = sum(1 for r in range(B.n) for k in range(B.n - 2) if abs(B.v[r * B.n + k] - B.v[r * B.n + k + 2]) == 1)",
      ],
    },
    tieBreakers: {},
  },
  {
    family: "original-crosswise-threes", moves: ["add"], mainSays: "pairs 3 apart when the board folds corner to corner",
    main: {
      ts: [
        "let main = 0, gaps = 0;",
        "for (let r = 0; r < B.n; r++) for (let c = 0; r + c < B.n - 1; c++) {",
        "  const partner = (B.n - 1 - c) * B.n + (B.n - 1 - r);   // where the fold takes it",
        "  const off = Math.abs(Math.abs(B.v[r * B.n + c] - B.v[partner]) - 3);",
        "  if (off === 0) main++;",
        "  gaps += off;",
        "}",
      ],
      py: [
        "main, gaps = 0, 0",
        "for r in range(B.n):",
        "    for c in range(B.n - 1 - r):",
        "        partner = (B.n - 1 - c) * B.n + (B.n - 1 - r)   # where the fold takes it",
        "        off = abs(abs(B.v[r * B.n + c] - B.v[partner]) - 3)",
        "        if off == 0:",
        "            main += 1",
        "        gaps += off",
      ],
    },
    tieBreakers: {
      "fold-gaps": {
        ts: "-gaps", py: "-gaps", says: "fewest steps between the folded pairs' differences and 3",
        tryThis: "change FAR = 1 to 3: a pair can reach 3 apart in one move instead of three, though each move costs more.",
      },
    },
  },
];
