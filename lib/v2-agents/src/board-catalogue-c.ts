/**
 * Agents' scores for four of the old game's number families on the coloured boards (lib/v2-grid-boards
 * src/families/v1-numbers-c.ts): Magic Accountant, Number Bonds, Stepping Stones, Kings and Subjects. Each entry
 * computes exactly the engine's score from B (n, v, c, s) and p, in TypeScript and Python
 * (test/board-catalogue-c.test.ts checks them against the engine on newborn boards). They read numbers only.
 */
import type { BoardFamilyEntry } from "./board-starters.ts";

export const BOARD_CATALOGUE_C: readonly BoardFamilyEntry[] = [
  {
    family: "original-magic-accountant", moves: ["add"], mainSays: "rows or columns that add up to your magic number",
    main: {
      ts: [
        "let main = 0, distance = 0;",
        "for (let k = 0; k < B.n; k++) {",
        "  let total = 0;",
        "  for (let j = 0; j < B.n; j++) total += B.v[p.axis === \"rows\" ? k * B.n + j : j * B.n + k];",
        "  if (total === p.target) main++;",
        "  distance += Math.abs(total - p.target);",
        "}",
      ],
      py: [
        "main, distance = 0, 0",
        "for k in range(B.n):",
        "    total = sum(B.v[k * B.n + j if p[\"axis\"] == \"rows\" else j * B.n + k] for j in range(B.n))",
        "    if total == p[\"target\"]:",
        "        main += 1",
        "    distance += abs(total - p[\"target\"])",
      ],
    },
    tieBreakers: {
      "magic-distance": {
        ts: "-distance", py: "-distance", says: "how far the totals are from your magic number (less is better)",
        tryThis: "change FAR = 1 to 3: one move can then close a bigger gap between a total and your magic number, at a higher price.",
      },
    },
  },
  {
    family: "original-number-bonds", moves: ["add"], mainSays: "touching pairs that add up to the target",
    main: {
      ts: [
        "let main = 0;",
        "for (let i = 0; i < B.n * B.n; i++) {",
        "  if (i % B.n < B.n - 1 && B.v[i] + B.v[i + 1] === p.target) main++;",
        "  if (i + B.n < B.n * B.n && B.v[i] + B.v[i + B.n] === p.target) main++;",
        "}",
      ],
      py: [
        "main = 0",
        "for i in range(B.n * B.n):",
        "    if i % B.n < B.n - 1 and B.v[i] + B.v[i + 1] == p[\"target\"]:",
        "        main += 1",
        "    if i + B.n < B.n * B.n and B.v[i] + B.v[i + B.n] == p[\"target\"]:",
        "        main += 1",
      ],
    },
    tieBreakers: {},
  },
  {
    family: "original-stepping-stones", moves: ["add"], mainSays: "cells in your biggest group of stepping stones",
    main: {
      ts: [
        "const seen = new Set();",
        "let main = 0;",
        "for (let s = 0; s < B.n * B.n; s++) {",
        "  if (seen.has(s)) continue;",
        "  const g = [s];",
        "  seen.add(s);",
        "  for (let k = 0; k < g.length; k++) {",
        "    const i = g[k], r = Math.floor(i / B.n), c = i % B.n;",
        "    for (const o of [r > 0 ? i - B.n : -1, r < B.n - 1 ? i + B.n : -1, c > 0 ? i - 1 : -1, c < B.n - 1 ? i + 1 : -1]) {",
        "      if (o >= 0 && !seen.has(o) && Math.abs(B.v[i] - B.v[o]) === p.hop) { seen.add(o); g.push(o); }",
        "    }",
        "  }",
        "  main = Math.max(main, g.length);",
        "}",
      ],
      py: [
        "seen, main = set(), 0",
        "for s in range(B.n * B.n):",
        "    if s in seen:",
        "        continue",
        "    g = [s]",
        "    seen.add(s)",
        "    for i in g:",
        "        r, c = i // B.n, i % B.n",
        "        for o in (i - B.n if r > 0 else -1, i + B.n if r < B.n - 1 else -1, i - 1 if c > 0 else -1, i + 1 if c < B.n - 1 else -1):",
        "            if o >= 0 and o not in seen and abs(B.v[i] - B.v[o]) == p[\"hop\"]:",
        "                seen.add(o)",
        "                g.append(o)",
        "    main = max(main, len(g))",
      ],
    },
    tieBreakers: {},
  },
  {
    family: "original-kings-and-subjects", moves: ["add"], mainSays: "2×2 boxes whose king equals his subjects added up",
    main: {
      ts: [
        "const step = p.squares === \"corners\" ? 2 : 1;",
        "let main = 0, gap = 0;",
        "for (let r = 0; r + 1 < B.n; r += step) for (let c = 0; c + 1 < B.n; c += step) {",
        "  const i = r * B.n + c, box = [B.v[i], B.v[i + 1], B.v[i + B.n], B.v[i + B.n + 1]];",
        "  const king = Math.max(...box), total = box[0] + box[1] + box[2] + box[3];",
        "  if (box.filter(x => x === king).length > 1) { gap += p.noKing; continue; }   // the biggest number twice: no king",
        "  const away = Math.abs(2 * king - total);   // the king against his three subjects added up",
        "  gap += away;",
        "  if (away === 0) main++;",
        "}",
      ],
      py: [
        "step = 2 if p[\"squares\"] == \"corners\" else 1",
        "main, gap = 0, 0",
        "for r in range(0, B.n - 1, step):",
        "    for c in range(0, B.n - 1, step):",
        "        i = r * B.n + c",
        "        box = [B.v[i], B.v[i + 1], B.v[i + B.n], B.v[i + B.n + 1]]",
        "        king = max(box)",
        "        if box.count(king) > 1:   # the biggest number twice: no king",
        "            gap += p[\"noKing\"]",
        "            continue",
        "        away = abs(2 * king - sum(box))   # the king against his three subjects added up",
        "        gap += away",
        "        if away == 0:",
        "            main += 1",
      ],
    },
    tieBreakers: {
      "court-gaps": {
        ts: "-gap", py: "-gap", says: "how far the kings are from their subjects added up (less is better)",
        tryThis: "change FAR = 1 to 3: one move can then close a bigger gap between a king and his subjects, at a higher price.",
      },
    },
  },
];
