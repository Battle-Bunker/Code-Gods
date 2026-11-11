const mk = (id, step, mode, nok) => ({ id, utility: `function utility(grid) {
  let courts = 0, gap = 0, near = 0, points = 0;
  for (const cell of grid.cells) {
    if (!cell.right || !cell.down) continue;
    if (${step} === 2 && (cell.row % 2 === 1 || cell.col % 2 === 1)) continue;
    const values = [cell.value, cell.right.value, cell.down.value, cell.down.right.value];
    const king = Math.max(...values);
    let total = 0, kings = 0;
    for (const v of values) { total += v; if (v === king) kings += 1; }
    if (kings !== 1) { gap += ${nok === "top1" ? "king + 1" : nok}; continue; }
    const away = Math.abs(king - (total - king));
    if (away === 0) { courts += 1; points += 2; }
    else if (away === 1) { near += 1; points += 1; }
    gap += away;
  }
  return ${mode === "gap" ? "[courts, -gap]" : mode === "pts" ? "points" : "[courts, near]"};
}` });
export const rules = [
  mk("corner_gap_top1", 2, "gap", "top1"),
  mk("corner_gap_10", 2, "gap", 10),
  mk("corner_gap_20", 2, "gap", 20),
  mk("corner_pts21", 2, "pts", 0),
  mk("corner_near", 2, "near", 0),
  mk("all_gap_10", 1, "gap", 10),
  mk("all_gap_20", 1, "gap", 20),
  mk("all_gap_top1", 1, "gap", "top1"),
  mk("all_pts21", 1, "pts", 0),
];
