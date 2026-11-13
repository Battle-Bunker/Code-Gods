const near = (t: number[]) => t.reduce((s, x) => s + (x ? -Math.abs(x) : 1000), 0);
const rules = (v: number[]) => [
  near([0, 4, 8, 12].map(i => v[i] + v[i + 1] + v[i + 2] + v[i + 3] - 18)),
  near([0, 1, 2, 3, 4, 5, 6, 7].map(i => v[i] + v[15 - i] - 9)),
  v.filter((x, i) => i % 4 < 2 && Math.abs(x - v[i + 2]) === 1).length,
];

function agent(grid: Grid) {
  const v = grid.cells.map(c => c.value), [a, b, c] = rules(v);
  let best = a, move: MutatorCall[] = [];
  for (let i = 0; i < 160; i++) {
    const w = [...v];
    w[i / 10 | 0] = i % 10;
    const [x, y, z] = rules(w);
    if (y >= b && z >= c && x > best) { best = x; move = [write([i / 40 | 0, (i / 10 | 0) % 4], i % 10)]; }
  }
  return move;
}
