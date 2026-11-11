// Example ad-hoc rules for scripts/rule-difficulty.ts --adhoc (docs/rule-difficulty.md "Measuring a rule that is not a
// family yet"). Each `utility` is a card body written against the room's prelude, exactly like a TypeScript card.
export const rules = [
  {
    id: "count_sevens",
    // Every 7 scores a point.
    utility: function utility(grid) {
      let points = 0;
      for (const cell of grid.cells) if (cell.value === 7) points += 1;
      return points;
    },
    top: 16,
  },
  {
    id: "even_total",
    // One point when the numbers add up to an even total.
    utility: `function utility(grid) {
      let total = 0;
      for (const cell of grid.cells) total += cell.value;
      return total % 2 === 0 ? 1 : 0;
    }`,
    top: 1,
  },
  {
    id: "row_climbers",
    // Each pair of side-by-side numbers that goes up by exactly one scores a point.
    utility: function utility(grid) {
      let points = 0;
      for (const row of grid.rows) for (let i = 0; i + 1 < row.length; i++) if (row[i + 1].value === row[i].value + 1) points += 1;
      return points;
    },
  },
];
