/**
 * Agent descriptions of four of the old game's number families on the coloured boards (lib/v2-grid-boards
 * src/families/v1-numbers-a.ts): Mirrormancer, Magic Eighteen, Opposite Nines and Two Pair. Same shape as
 * BOARD_CATALOGUE (board-starters.ts); these rules read numbers only, so their agents only add to cells.
 */
import type { BoardFamilyEntry } from "./board-starters.ts";

export const BOARD_CATALOGUE_A: readonly BoardFamilyEntry[] = [
  {
    family: "original-mirrormancer", moves: ["add"], mainSays: "rows or columns whose numbers mirror",
    main: {
      ts: [
        "let main = 0, pairs = 0;",
        "for (let k = 0; k < B.n; k++) {",
        "  const run = [...Array(B.n).keys()].map(j => (p.axis === \"rows\" ? k * B.n + j : j * B.n + k));",
        "  let m = 0;",
        "  for (let j = 0; j < B.n >> 1; j++) if (B.v[run[j]] === B.v[run[B.n - 1 - j]]) m++;",
        "  pairs += m;",
        "  if (m === B.n >> 1) main++;",
        "}",
      ],
      py: [
        "main, pairs = 0, 0",
        "for k in range(B.n):",
        "    run = [k * B.n + j if p[\"axis\"] == \"rows\" else j * B.n + k for j in range(B.n)]",
        "    m = sum(1 for j in range(B.n // 2) if B.v[run[j]] == B.v[run[B.n - 1 - j]])",
        "    pairs += m",
        "    if m == B.n // 2:",
        "        main += 1",
      ],
    },
    tieBreakers: { "matching-pairs": { ts: "pairs", py: "pairs", says: "matching number pairs", tryThis: "change QUOTES = 8 to 3: fewer prices asked, but it may miss a cheaper plan." } },
  },
  {
    family: "original-magic-eighteen", moves: ["add"], mainSays: "rows or columns that add up to the magic number",
    main: {
      ts: [
        "let main = 0, gap = 0;",
        "for (let k = 0; k < B.n; k++) {",
        "  let total = 0;",
        "  for (let j = 0; j < B.n; j++) total += B.v[p.axis === \"rows\" ? k * B.n + j : j * B.n + k];",
        "  if (total === p.target) main++;",
        "  gap += Math.abs(total - p.target);",
        "}",
      ],
      py: [
        "main, gap = 0, 0",
        "for k in range(B.n):",
        "    total = sum(B.v[k * B.n + j if p[\"axis\"] == \"rows\" else j * B.n + k] for j in range(B.n))",
        "    if total == p[\"target\"]:",
        "        main += 1",
        "    gap += abs(total - p[\"target\"])",
      ],
    },
    tieBreakers: { "total-gap": { ts: "-gap", py: "-gap", says: "how far the totals are from the magic number (less is better)", tryThis: "change QUOTES = 8 to 3: fewer prices asked, but it may miss a cheaper plan." } },
  },
  {
    family: "original-opposite-nines", moves: ["add"], mainSays: "opposite pairs that make the biggest digit",
    main: {
      ts: [
        "let main = 0, gap = 0;",
        "for (let i = 0; i < (B.n * B.n) >> 1; i++) {",
        "  const total = B.v[i] + B.v[B.n * B.n - 1 - i];   // a cell and where a half turn takes it",
        "  if (total === p.target) main++;",
        "  gap += Math.abs(total - p.target);",
        "}",
      ],
      py: [
        "main, gap = 0, 0",
        "for i in range(B.n * B.n // 2):",
        "    total = B.v[i] + B.v[B.n * B.n - 1 - i]   # a cell and where a half turn takes it",
        "    if total == p[\"target\"]:",
        "        main += 1",
        "    gap += abs(total - p[\"target\"])",
      ],
    },
    tieBreakers: { "opposite-gap": { ts: "-gap", py: "-gap", says: "how far the opposite pairs are from the biggest digit (less is better)", tryThis: "change QUOTES = 8 to 3: fewer prices asked, but it may miss a cheaper plan." } },
  },
  {
    family: "original-two-pair", moves: ["add"], mainSays: "2×2 boxes with two different pairs",
    main: {
      ts: [
        "let main = 0, onePair = 0;",
        "for (let r = 0; r + 1 < B.n; r += 2) for (let c = 0; c + 1 < B.n; c += 2) {",
        "  const counts = new Map();",
        "  for (const i of [r * B.n + c, r * B.n + c + 1, (r + 1) * B.n + c, (r + 1) * B.n + c + 1]) counts.set(B.v[i], (counts.get(B.v[i]) ?? 0) + 1);",
        "  const sizes = [...counts.values()].sort().join(\" \");",
        "  if (sizes === \"2 2\") main++;",
        "  else if (sizes === \"1 1 2\" || sizes === \"1 3\") onePair++;",
        "}",
      ],
      py: [
        "main, one_pair = 0, 0",
        "for r in range(0, B.n - 1, 2):",
        "    for c in range(0, B.n - 1, 2):",
        "        counts = {}",
        "        for i in (r * B.n + c, r * B.n + c + 1, (r + 1) * B.n + c, (r + 1) * B.n + c + 1):",
        "            counts[B.v[i]] = counts.get(B.v[i], 0) + 1",
        "        sizes = sorted(counts.values())",
        "        if sizes == [2, 2]:",
        "            main += 1",
        "        elif sizes == [1, 1, 2] or sizes == [1, 3]:",
        "            one_pair += 1",
      ],
    },
    tieBreakers: { "one-pairs": { ts: "onePair", py: "one_pair", says: "boxes with one pair or three of a kind", tryThis: "change QUOTES = 8 to 3: fewer prices asked, but it may miss a cheaper plan." } },
  },
];
