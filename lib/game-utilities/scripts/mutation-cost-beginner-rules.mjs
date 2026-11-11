// Stand-ins for the beginner digit rules (docs/mutation-cost-design.md §8), as ad-hoc rule-difficulty cards. The four
// the coordinator named are first; the other four are simple digit rules of the same kind, chosen to span "needs ±1
// nudges" to "needs jumps". They read numbers only, so they measure the same on Grid(4,base10,rgb) with number moves
// as on the mono board. Usable with `pnpm --filter @workspace/game-utilities difficulty --adhoc <this file>` too.
export const rules = [
  {
    id: "half_turn_nine",
    // Each cell and its half-turn partner (the cell you reach by spinning the grid round) add up to 9.
    utility: function utility(grid) {
      const n = grid.rows.length;
      let points = 0;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const i = r * n + c, j = (n - 1 - r) * n + (n - 1 - c);
        if (i < j && grid.rows[r][c].value + grid.rows[n - 1 - r][n - 1 - c].value === 9) points += 1;
      }
      return points;
    },
    top: 8,
  },
  {
    id: "row_partners_one_apart",
    // In each row, each cell and its mirror partner (first and last, second and third) are one apart.
    utility: function utility(grid) {
      let points = 0;
      for (const row of grid.rows) for (let c = 0; c < row.length / 2; c++) {
        if (Math.abs(row[c].value - row[row.length - 1 - c].value) === 1) points += 1;
      }
      return points;
    },
    top: 8,
  },
  {
    id: "corner_box_two_pairs",
    // Each 2×2 corner box holds two different pairs (like 3, 3, 7, 7).
    utility: function utility(grid) {
      const n = grid.rows.length;
      let points = 0;
      for (const [r0, c0] of [[0, 0], [0, n - 2], [n - 2, 0], [n - 2, n - 2]]) {
        const v = [grid.rows[r0][c0], grid.rows[r0][c0 + 1], grid.rows[r0 + 1][c0], grid.rows[r0 + 1][c0 + 1]].map(x => x.value).sort((a, b) => a - b);
        if (v[0] === v[1] && v[2] === v[3] && v[1] !== v[2]) points += 1;
      }
      return points;
    },
    top: 4,
  },
  {
    id: "window_spread_3",
    // Each 2×2 window (nine of them, overlapping) has its biggest number exactly 3 more than its smallest.
    utility: function utility(grid) {
      const n = grid.rows.length;
      let points = 0;
      for (let r = 0; r + 1 < n; r++) for (let c = 0; c + 1 < n; c++) {
        const v = [grid.rows[r][c], grid.rows[r][c + 1], grid.rows[r + 1][c], grid.rows[r + 1][c + 1]].map(x => x.value);
        if (Math.max(...v) - Math.min(...v) === 3) points += 1;
      }
      return points;
    },
    top: 9,
  },
  {
    id: "column_mirror_equal",
    // In each column, each cell matches its mirror partner (top and bottom, second and third).
    utility: function utility(grid) {
      const n = grid.rows.length;
      let points = 0;
      for (let c = 0; c < n; c++) for (let r = 0; r < n / 2; r++) if (grid.rows[r][c].value === grid.rows[n - 1 - r][c].value) points += 1;
      return points;
    },
    top: 8,
  },
  {
    id: "checker_parity",
    // Odd numbers on the dark squares of a chessboard, even numbers on the light ones.
    utility: function utility(grid) {
      let points = 0;
      grid.rows.forEach((row, r) => row.forEach((cell, c) => { if (cell.value % 2 === (r + c) % 2) points += 1; }));
      return points;
    },
    top: 16,
  },
  {
    id: "row_sum_18",
    // Each row adds up to 18 (closest rows break ties).
    utility: function utility(grid) {
      let rows = 0, off = 0;
      for (const row of grid.rows) { const s = row.reduce((t, x) => t + x.value, 0); if (s === 18) rows += 1; off += Math.abs(s - 18); }
      return [rows, -off];
    },
    top: [4, 0],
  },
  {
    id: "diagonal_steps",
    // Along both diagonals, each number is one more than the one before it.
    utility: function utility(grid) {
      const n = grid.rows.length;
      let points = 0;
      for (let i = 0; i + 1 < n; i++) {
        if (grid.rows[i + 1][i + 1].value === grid.rows[i][i].value + 1) points += 1;
        if (grid.rows[i + 1][n - 2 - i].value === grid.rows[i][n - 1 - i].value + 1) points += 1;
      }
      return points;
    },
    top: 6,
  },
];
