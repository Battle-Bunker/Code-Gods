function agent(grid: Grid) {
  const r = (n: number) => Math.floor(Math.random() * n);
  return [write([r(4), r(4)], r(10))];
}
