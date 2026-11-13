function own(v: number[]) {
  return [0, 4, 8, 12].map(i => v[i] + v[i + 1] + v[i + 2] + v[i + 3] - 18).reduce((s, x) => s + (x ? -Math.abs(x) : 1000), 0);
}

function agent(grid: Grid) {
  const v = grid.cells.map(c => c.value);
  let best = own(v), move: MutatorCall[] = [];
  for (let i = 0; i < 160; i++) {
    const w = [...v];
    w[i / 10 | 0] = i % 10;
    if (own(w) > best) { best = own(w); move = [write([i / 40 | 0, (i / 10 | 0) % 4], i % 10)]; }
  }
  return move;
}
