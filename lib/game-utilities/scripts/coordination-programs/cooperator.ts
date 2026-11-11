const near = (t: number[], a: number[], b: number) =>
  Math.max(0, a[t.filter(x => !x).length] - b * t.reduce((s, x) => s + Math.abs(x), 0));
const bits = (v: number[]) => [
  near([0, 4, 8, 12].map(i => v[i] + v[i + 1] + v[i + 2] + v[i + 3] - 18), [31, 57, 94, 122, 148], 1.5),
  near([0, 1, 2, 3, 4, 5, 6, 7].map(i => v[i] + v[15 - i] - 9), [46, 52, 68, 89, 119, 157, 195, 227, 264], 2),
  [0, 3, 12, 27, 47, 75, 108, 154, 202][v.filter((x, i) => i % 4 < 2 && Math.abs(x - v[i + 2]) === 1).length],
];

function agent(grid: Grid) {
  const v = grid.cells.map(c => c.value), [a, b, c] = bits(v);
  let best = a * b + a * c + b * c, move: MutatorCall[] = [];
  for (let i = 0; i < 160; i++) {
    const w = [...v];
    w[i / 10 | 0] = i % 10;
    const [x, y, z] = bits(w), s = x * y + x * z + y * z;
    if (x * (y + z) >= a * (b + c) && s > best) { best = s; move = [write([i / 40 | 0, (i / 10 | 0) % 4], i % 10)]; }
  }
  return move;
}
