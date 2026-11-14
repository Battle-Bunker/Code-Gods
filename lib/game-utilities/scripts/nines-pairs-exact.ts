/**
 * 🙃 Opposite Nines' expert pairs, exactly (archive/engine-v1:docs/layered-rules-measurements/expert-pairs.md). At the base's top every
 * opposite pair adds up to 9, so the first 8 cells fix the board: all 10⁸ top boards are counted, and for each pair
 * (lines x, squares x′) the law of the tuple [lines, squares] there is exact.
 *
 *   node --experimental-strip-types scripts/nines-pairs-exact.ts
 */
const LINES = [14, 16, 17, 18], SQUARES = [14, 16];
// hist[li][si][lines * 10 + squares]
const hist = LINES.map(() => SQUARES.map(() => new Float64Array(11 * 10)));
const b = new Int32Array(16);
const lineCells: number[][] = [];
for (let r = 0; r < 4; r++) lineCells.push([0, 1, 2, 3].map(c => r * 4 + c));
for (let c = 0; c < 4; c++) lineCells.push([0, 1, 2, 3].map(r => r * 4 + c));
lineCells.push([0, 5, 10, 15], [3, 6, 9, 12]);
const squareCells: number[][] = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) squareCells.push([r * 4 + c, r * 4 + c + 1, r * 4 + c + 4, r * 4 + c + 5]);
const lineHits = new Int32Array(37), squareHits = new Int32Array(37);
for (let n = 0; n < 1e8; n++) {
  let m = n;
  for (let i = 0; i < 8; i++) { const d = m % 10; m = (m - d) / 10; b[i] = d; b[15 - i] = 9 - d; }
  lineHits.fill(0); squareHits.fill(0);
  for (let k = 0; k < 10; k++) { const l = lineCells[k]; lineHits[b[l[0]] + b[l[1]] + b[l[2]] + b[l[3]]]++; }
  for (let k = 0; k < 9; k++) { const s = squareCells[k]; squareHits[b[s[0]] + b[s[1]] + b[s[2]] + b[s[3]]]++; }
  for (let li = 0; li < LINES.length; li++) {
    const l = lineHits[LINES[li]] * 10;
    for (let si = 0; si < SQUARES.length; si++) hist[li][si][l + squareHits[SQUARES[si]]]++;
  }
}
console.log("| pair | top [lines, squares] | boards there (of 10⁸) | added bits (exact) | next level down | bits there |\n|---|---|--:|--:|---|--:|");
for (let li = 0; li < LINES.length; li++) for (let si = 0; si < SQUARES.length; si++) {
  const h = hist[li][si];
  let top = h.length - 1;
  while (h[top] === 0) top--;
  let next = top - 1;
  while (next >= 0 && h[next] === 0) next--;
  const at = (k: number) => `[${Math.floor(k / 10)}, ${k % 10}]`;
  console.log(`| lines x = ${LINES[li]} + squares x = ${SQUARES[si]} | ${at(top)} | ${h[top]} | ${(-Math.log2(h[top] / 1e8)).toFixed(2)} | ${at(next)} | ${(-Math.log2((h[top] + h[next]) / 1e8)).toFixed(2)} |`);
}
