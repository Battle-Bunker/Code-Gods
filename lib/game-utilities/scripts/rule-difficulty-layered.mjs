// Layered rule prototypes (docs/layered-rules-design.md): each family is a base preference a beginner reads first plus a
// menu of interactions ("to score even higher...") written once over the base's vocabulary and reused across bases.
// Every rule here is a card body against the room's prelude, exactly like a TypeScript card, so the difficulty command
// measures it as an ad-hoc rule:
//
//   pnpm --filter @workspace/game-utilities difficulty --only-adhoc --adhoc scripts/rule-difficulty-layered.mjs --moves symbol
//
// and the tiered profile (base alone, then base + each interaction) comes from scripts/layered-profile.ts.
//
// How a family is written:
// - `vocab`: JavaScript that reads the board `v` (v[r][c] = the number in row r, column c; N = the side) and defines the
//   base's vocabulary: `units` (the scoring units, each a list of [r, c]; `units[i].ok` when the unit scores),
//   `marked` (the special cells the base creates, e.g. kings: a list of [r, c]), `helpers` (the cells that serve them,
//   e.g. subjects) and `base` (the base points: a number or a list compared lexicographically).
// - `interactions`: each is an operator from OPERATORS with its parameters. The dealt rule's ordinal is
//   [...base, tier]: the tier only breaks ties among boards equal on the base (lexicographic), unless the family names
//   another composition (see `compose`).
// The operators are plain text spliced into the card, so the card a player reads is the code that scores.

/** The interaction operators, written once over the vocabulary (units, marked, helpers) and the board v. */
export const OPERATORS = {
  // Units of the base that score and whose cells add up to x ("mirrored halves" use the unit's first half).
  unitsSum: ({ x, half = false, length = 0 }) => `
  let tier = 0;
  for (const u of units) {
    if (!u.ok || (${length} > 0 && u.length !== ${length})) continue;
    const cells = ${half ? "u.slice(0, Math.floor(u.length / 2))" : "u"};
    let s = 0;
    for (const [r, c] of cells) s += v[r][c];
    if (s === ${x}) tier += 1;
  }`,
  // Lines (rows, columns, the two long diagonals) that add up to x: a unit kind the base does not score itself.
  linesSum: ({ x }) => `
  const lines = [];
  for (let i = 0; i < N; i++) { lines.push(v[i]); lines.push(v.map(row => row[i])); }
  lines.push(v.map((row, i) => row[i])); lines.push(v.map((row, i) => row[N - 1 - i]));
  let tier = 0;
  for (const line of lines) if (line.reduce((a, b) => a + b, 0) === ${x}) tier += 1;`,
  // 2x2 windows that add up to x.
  windowsSum: ({ x }) => `
  let tier = 0;
  for (let r = 0; r + 1 < N; r++) for (let c = 0; c + 1 < N; c++)
    if (v[r][c] + v[r][c + 1] + v[r + 1][c] + v[r + 1][c + 1] === ${x}) tier += 1;`,
  // Shortest (Manhattan) paths between two marked cells whose numbers, both ends included, add up to x.
  pathsSum: ({ x }) => `
  let tier = 0;
  const walk = (r, c, r2, c2, s) => {
    s += v[r][c];
    if (r === r2 && c === c2) return s === ${x} ? 1 : 0;
    let n = 0;
    if (r !== r2) n += walk(r + Math.sign(r2 - r), c, r2, c2, s);
    if (c !== c2) n += walk(r, c + Math.sign(c2 - c), r2, c2, s);
    return n;
  };
  for (let i = 0; i < marked.length; i++) for (let j = i + 1; j < marked.length; j++)
    tier += walk(marked[i][0], marked[i][1], marked[j][0], marked[j][1], 0);`,
  // King pairs joined by at least one shortest path whose cells strictly between the two add up to x; then the number of
  // such paths (a list: pairs first, paths as the tie-break).
  pathPairs: ({ x }) => `
  let pairsHit = 0, roadsHit = 0;
  const walk = (r, c, r2, c2, s) => {
    if (r === r2 && c === c2) return s - v[r][c] === ${x} ? 1 : 0;
    let n = 0;
    if (r !== r2) { const p = r + Math.sign(r2 - r); n += walk(p, c, r2, c2, s + v[p][c]); }
    if (c !== c2) { const q = c + Math.sign(c2 - c); n += walk(r, q, r2, c2, s + v[r][q]); }
    return n;
  };
  for (let i = 0; i < marked.length; i++) for (let j = i + 1; j < marked.length; j++) {
    const [r, c] = marked[i], [r2, c2] = marked[j];
    if (Math.abs(r - r2) + Math.abs(c - c2) < 2) continue;
    const n = walk(r, c, r2, c2, 0);
    if (n > 0) { pairsHit += 1; roadsHit += n; }
  }
  const tier = [pairsHit, roadsHit];`,
  // Roads of helper cells showing the same number: the longest one.
  sameHelperRoad: () => `
  const isHelper = v.map(row => row.map(() => false));
  for (const [r, c] of helpers) isHelper[r][c] = true;
  const seen = v.map(row => row.map(() => false));
  let tier = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (!isHelper[r][c] || seen[r][c]) continue;
    let size = 0;
    const todo = [[r, c]];
    seen[r][c] = true;
    while (todo.length) {
      const [a, b] = todo.pop();
      size += 1;
      for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const p = a + da, q = b + db;
        if (p >= 0 && p < N && q >= 0 && q < N && isHelper[p][q] && !seen[p][q] && v[p][q] === v[a][b]) { seen[p][q] = true; todo.push([p, q]); }
      }
    }
    tier = Math.max(tier, size);
  }`,
  // Roads: groups of helper cells joined side by side. Each road of exactly y cells scores.
  roads: ({ y }) => `
  const isHelper = v.map(row => row.map(() => false));
  for (const [r, c] of helpers) isHelper[r][c] = true;
  const seen = v.map(row => row.map(() => false));
  let tier = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (!isHelper[r][c] || seen[r][c]) continue;
    let size = 0;
    const todo = [[r, c]];
    seen[r][c] = true;
    while (todo.length) {
      const [a, b] = todo.pop();
      size += 1;
      for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const p = a + da, q = b + db;
        if (p >= 0 && p < N && q >= 0 && q < N && isHelper[p][q] && !seen[p][q]) { seen[p][q] = true; todo.push([p, q]); }
      }
    }
    if (size === ${y}) tier += 1;
  }`,
  // Cells showing y that lie in exactly n scoring units (y = -1: any number).
  exactlyIn: ({ n, y = -1 }) => `
  const count = v.map(row => row.map(() => 0));
  for (const u of units) if (u.ok) for (const [r, c] of u) count[r][c] += 1;
  let tier = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++)
    if (count[r][c] === ${n} && (${y} < 0 || v[r][c] === ${y})) tier += 1;`,
  // Scoring units holding exactly k cells showing y.
  holding: ({ k, y }) => `
  let tier = 0;
  for (const u of units) if (u.ok && u.filter(([r, c]) => v[r][c] === ${y}).length === ${k}) tier += 1;`,
  // How many different numbers the marked cells show.
  distinctMarked: () => `
  const tier = new Set(marked.map(([r, c]) => v[r][c])).size;`,
  // Ladders: paths of exactly y cells, each step side by side and one more than the last.
  ladders: ({ y }) => `
  let tier = 0;
  const climb = (r, c, len) => {
    if (len === ${y}) return 1;
    let n = 0;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const p = r + dr, q = c + dc;
      if (p >= 0 && p < N && q >= 0 && q < N && v[p][q] === v[r][c] + 1) n += climb(p, q, len + 1);
    }
    return n;
  };
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) tier += climb(r, c, 1);`,
  // Roads of equal numbers: groups of side-by-side cells showing the same number; each group of exactly y scores.
  sameRoads: ({ y }) => `
  const seen = v.map(row => row.map(() => false));
  let tier = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (seen[r][c]) continue;
    let size = 0;
    const todo = [[r, c]];
    seen[r][c] = true;
    while (todo.length) {
      const [a, b] = todo.pop();
      size += 1;
      for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const p = a + da, q = b + db;
        if (p >= 0 && p < N && q >= 0 && q < N && !seen[p][q] && v[p][q] === v[a][b]) { seen[p][q] = true; todo.push([p, q]); }
      }
    }
    if (size === ${y}) tier += 1;
  }`,
};

const BOARD = `
  const N = grid.size;
  const v = grid.rows.map(row => row.map(cell => cell.value));`;

/** The 2x2 windows: all overlapping ones, or the four corner boxes. */
const windows = overlap => `
  const windows = [];
  for (let r = 0; r + 1 < N; r += ${overlap ? 1 : 2}) for (let c = 0; c + 1 < N; c += ${overlap ? 1 : 2})
    windows.push([[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]]);`;

export const FAMILIES = [
  {
    id: "royal_court",
    name: "Royal Court",
    card: "A 2x2 square is a court when its biggest number (the king) is bigger than every other number in it and equals "
      + "the other three (the subjects) added up. Each court scores 2 points; a square whose king is one away from the sum scores 1.",
    vocab: ({ overlap, graded }) => `${windows(overlap)}
  const units = [], marked = [], helpers = [];
  let base = 0, courts = 0, gap = 0;
  for (const w of windows) {
    const vals = w.map(([r, c]) => v[r][c]);
    const top = Math.max(...vals);
    const kings = w.filter(([r, c]) => v[r][c] === top);
    const rest = vals.reduce((a, b) => a + b, 0) - top;
    const off = Math.abs(top - rest);
    const ok = kings.length === 1 && off === 0;
    if (${graded}) { if (kings.length === 1 && off === 0) courts += 1; gap += kings.length === 1 ? off : top + 1; }
    else if (kings.length === 1) base += Math.max(0, 2 - off);
    const u = w.slice(); u.ok = ok; units.push(u);
    if (ok) {
      if (!marked.some(([r, c]) => r === kings[0][0] && c === kings[0][1])) marked.push(kings[0]);
      for (const cell of w) if (cell !== kings[0]) helpers.push(cell);
    }
  }
  // A cell that is a king anywhere is not a subject.
  for (let i = helpers.length - 1; i >= 0; i--)
    if (marked.some(([r, c]) => r === helpers[i][0] && c === helpers[i][1])) helpers.splice(i, 1);
  if (${graded}) base = [courts, -gap];`,
    bases: { overlap: { overlap: true, graded: false }, corners: { overlap: false, graded: false }, graded: { overlap: true, graded: true } },
    interactions: {
      paths: { op: "pathsSum", values: [{ x: 16 }, { x: 20 }, { x: 24 }],
        card: ({ x }) => `To score even higher: each shortest path (moving side by side) from one king to another whose numbers, both kings included, add up to ${x} scores a point.` },
      roads: { op: "roads", values: [{ y: 3 }, { y: 5 }],
        card: ({ y }) => `To score even higher: subjects that touch side by side make a road. Each road of exactly ${y} subjects scores a point.` },
      pathPairs: { op: "pathPairs", values: [{ x: 6 }, { x: 10 }],
        card: ({ x }) => `To score even higher: walk from one king to another, always getting closer. Each pair of kings with a walk whose numbers in between add up to ${x} scores a point; more such walks break ties.` },
      sameRoad: { op: "sameHelperRoad", values: [{}],
        card: () => `To score even higher: subjects showing the same number that touch side by side make a road. Your longest road scores its length.` },
      shared: { op: "exactlyIn", values: [{ n: 2 }],
        card: () => `To score even higher: each number that sits in exactly two courts scores a point.` },
      distinct: { op: "distinctMarked", values: [{}],
        card: () => `To score even higher: each different number your kings show scores a point.` },
    },
  },
  {
    id: "hall_of_mirrors",
    name: "Hall of Mirrors",
    card: "A line is a mirror if its numbers read the same forwards and backwards. The lines are the rows, the columns and "
      + "every diagonal of two or more cells. Each mirror line scores a point; each matching pair in any line scores a smaller point.",
    vocab: diagonals => `
  const lines = [];
  for (let i = 0; i < N; i++) { lines.push(v[i].map((_, c) => [i, c])); lines.push(v.map((_, r) => [r, i])); }
  ${diagonals ? `for (let d = -(N - 2); d <= N - 2; d++) {
    const down = [], up = [];
    for (let r = 0; r < N; r++) { const c = r - d; if (c >= 0 && c < N) down.push([r, c]); const c2 = N - 1 - r + d; if (c2 >= 0 && c2 < N) up.push([r, c2]); }
    lines.push(down); lines.push(up);
  }` : ""}
  const units = [], marked = [], helpers = [];
  let mirrors = 0, pairs = 0;
  for (const line of lines) {
    let ok = true;
    for (let i = 0; i < Math.floor(line.length / 2); i++) {
      const [a, b] = line[i], [c, d] = line[line.length - 1 - i];
      if (v[a][b] === v[c][d]) pairs += 1; else ok = false;
    }
    if (ok) mirrors += 1;
    const u = line.slice(); u.ok = ok; units.push(u);
  }
  const base = [mirrors, pairs];`,
    bases: { all: true, rowsColumns: false },
    interactions: {
      halves: { op: "unitsSum", values: [{ x: 6, half: true }, { x: 14, half: true }],
        card: ({ x }) => `To score even higher: each mirror line whose first half (the [2, 3] in 2 3 3 2) adds up to ${x} scores a point.` },
      halves4: { op: "unitsSum", values: [{ x: 10, half: true, length: 4 }, { x: 13, half: true, length: 4 }],
        card: ({ x }) => `To score even higher: fold a mirror line of 4 in half. Each one whose half (the 2 3 in 2 3 3 2) adds up to ${x} scores a point.` },
      pairOf: { op: "holding", values: [{ k: 2, y: 7 }],
        card: ({ y }) => `To score even higher: each mirror line holding exactly two ${y}s scores a point.` },
      twice: { op: "exactlyIn", values: [{ n: 2, y: 7 }],
        card: ({ y }) => `To score even higher: each ${y} that sits in exactly two mirror lines scores a point.` },
    },
  },
  {
    id: "opposite_nines_plus",
    name: "Opposite Nines",
    card: "Each number has a partner: the cell you reach by turning the board half way round. Each pair of partners that adds up to 9 scores a point.",
    vocab: () => `
  const units = [], marked = [], helpers = [];
  let base = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const p = N - 1 - r, q = N - 1 - c;
    if (r * N + c >= p * N + q) continue;
    const u = [[r, c], [p, q]]; u.ok = v[r][c] + v[p][q] === 9; units.push(u);
    if (u.ok) base += 1;
  }`,
    bases: { plain: true },
    interactions: {
      lines: { op: "linesSum", values: [{ x: 18 }, { x: 15 }, { x: 24 }],
        card: ({ x }) => `To score even higher: each row, column or long diagonal that adds up to ${x} scores a point.` },
      windows: { op: "windowsSum", values: [{ x: 18 }, { x: 12 }],
        card: ({ x }) => `To score even higher: each 2x2 square that adds up to ${x} scores a point.` },
    },
  },
  {
    id: "two_pair_plus",
    name: "Two Pair",
    card: "Each corner 2x2 box should hold two different pairs, like 3 3 7 7. A box with two different pairs scores 2 points; a box with one pair scores 1.",
    vocab: () => `${windows(false)}
  const units = [], marked = [], helpers = [];
  let base = 0;
  for (const w of windows) {
    const vals = w.map(([r, c]) => v[r][c]).sort((a, b) => a - b);
    const twoPair = vals[0] === vals[1] && vals[2] === vals[3] && vals[1] !== vals[2];
    const onePair = vals[0] === vals[1] || vals[1] === vals[2] || vals[2] === vals[3];
    base += twoPair ? 2 : onePair ? 1 : 0;
    const u = w.slice(); u.ok = twoPair; units.push(u);
  }`,
    bases: { plain: true },
    interactions: {
      roads: { op: "sameRoads", values: [{ y: 4 }, { y: 6 }],
        card: ({ y }) => `To score even higher: each group of exactly ${y} equal numbers joined side by side scores a point.` },
      boxes: { op: "unitsSum", values: [{ x: 10 }, { x: 20 }],
        card: ({ x }) => `To score even higher: each two-pair box whose numbers add up to ${x} scores a point.` },
    },
  },
  {
    id: "ladders",
    name: "Ladders",
    card: "Each pair of side-by-side numbers that are one apart (like 4 and 5) scores a point.",
    vocab: () => `
  const units = [], marked = [], helpers = [];
  let base = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) for (const [p, q] of [[r, c + 1], [r + 1, c]]) {
    if (p >= N || q >= N) continue;
    const u = [[r, c], [p, q]]; u.ok = Math.abs(v[r][c] - v[p][q]) === 1; units.push(u);
    if (u.ok) base += 1;
  }`,
    bases: { plain: true },
    interactions: {
      ladders: { op: "ladders", values: [{ y: 5 }, { y: 7 }],
        card: ({ y }) => `To score even higher: each ladder of ${y} cells, every step side by side and one more than the last (like 3 4 5 6 7), scores a point.` },
      lines: { op: "linesSum", values: [{ x: 18 }, { x: 10 }],
        card: ({ x }) => `To score even higher: each row, column or long diagonal that adds up to ${x} scores a point.` },
    },
  },
  {
    id: "hilltops",
    name: "Hilltops",
    card: "A hilltop is a number bigger than every number beside it (left, right, above, below). Each hilltop scores a point.",
    vocab: () => `
  const units = [], marked = [], helpers = [];
  let base = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    let top = true;
    for (const [p, q] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]])
      if (p >= 0 && p < N && q >= 0 && q < N && v[p][q] >= v[r][c]) top = false;
    if (top) { base += 1; marked.push([r, c]); const u = [[r, c]]; u.ok = true; units.push(u); }
  }`,
    bases: { plain: true },
    interactions: {
      distinct: { op: "distinctMarked", values: [{}],
        card: () => `To score even higher: each different height among your hilltops scores a point.` },
      paths: { op: "pathsSum", values: [{ x: 15 }, { x: 25 }],
        card: ({ x }) => `To score even higher: each shortest path (side by side) from one hilltop to another whose numbers add up to ${x} scores a point.` },
    },
  },
];

const paramText = p => Object.entries(p).filter(([k]) => k !== "half" && k !== "length").map(([k, x]) => `${k}${x}`).join("");

/**
 * The card source of a layered rule: the family's base (variant `baseKey`) plus, optionally, one interaction with its
 * params. `compose` is "lex" ([...base, tier]: the tier breaks ties on the base), "unlock" ([min(base, t), tier, base]:
 * the tier outranks the rest of the base once the base reaches t) or "sum" (base + tier as one number).
 */
export function layeredSource(family, baseKey, interaction, params, compose = "lex", t = 0) {
  const vocab = family.vocab(family.bases[baseKey]);
  if (!interaction) return `function utility(grid) {${BOARD}${vocab}
  return base;
}`;
  const op = OPERATORS[family.interactions[interaction].op](params);
  const head = `const head = Array.isArray(base) ? base : [base];
  const tail = Array.isArray(tier) ? tier : [tier];`;
  const ret = compose === "lex" ? "return [...head, ...tail];"
    : compose === "unlock" ? `return [Math.min(head[0], ${t}), ...tail, ...head];`
      : "return head[0] + tail[0];";
  return `function utility(grid) {${BOARD}${vocab}${op}
  ${head}
  ${ret}
}`;
}

/** Every measured variant: per family, each base and each interaction × params (lexicographic). */
export function variants() {
  const out = [];
  for (const f of FAMILIES) for (const baseKey of Object.keys(f.bases)) {
    out.push({ id: `${f.id}.${baseKey}`, family: f.id, base: baseKey, source: layeredSource(f, baseKey) });
    for (const [iid, it] of Object.entries(f.interactions)) for (const p of it.values)
      out.push({ id: `${f.id}.${baseKey}+${iid}${paramText(p) ? `(${paramText(p)})` : ""}`, family: f.id, base: baseKey, interaction: iid, params: p,
        source: layeredSource(f, baseKey, iid, p) });
  }
  return out;
}

// The difficulty command's ad-hoc format: one rule per variant.
export const rules = variants().map(x => ({ id: x.id, utility: x.source }));

/** Extra compositions to compare with the lexicographic default (docs/layered-rules-design.md §2.3). */
export const COMPOSITIONS = [
  { family: "hall_of_mirrors", base: "all", interaction: "twice", params: { n: 2, y: 7 }, compose: "unlock", t: 8 },
  { family: "royal_court", base: "overlap", interaction: "paths", params: { x: 20 }, compose: "sum" },
  { family: "royal_court", base: "overlap", interaction: "paths", params: { x: 20 }, compose: "unlock", t: 6 },
];
export function compositionVariants() {
  return COMPOSITIONS.map(c => {
    const f = FAMILIES.find(x => x.id === c.family);
    return { id: `${c.family}.${c.base}+${c.interaction}(${paramText(c.params)})@${c.compose}${c.t ? c.t : ""}`, family: c.family, base: c.base,
      interaction: c.interaction, params: c.params, compose: c.compose, source: layeredSource(f, c.base, c.interaction, c.params, c.compose, c.t) };
  });
}

/**
 * Stand-ins for the beginner eight (the session on claude/beginner-rules implements the real ones): the same idea as
 * each card, written here so synergy can be measured before they land. Mirrormancer is the shipped family.
 */
export const BEGINNER = [
  { id: "magic_eighteen", utility: `function utility(grid) {
  const N = grid.size, v = grid.rows.map(row => row.map(cell => cell.value));
  const lines = [];
  for (let i = 0; i < N; i++) { lines.push(v[i]); lines.push(v.map(row => row[i])); }
  lines.push(v.map((row, i) => row[i])); lines.push(v.map((row, i) => row[N - 1 - i]));
  let hits = 0, miss = 0;
  for (const line of lines) { const s = line.reduce((a, b) => a + b, 0); if (s === 18) hits += 1; miss += Math.abs(s - 18); }
  return [hits, -miss];
}` },
  { id: "opposite_nines", utility: `function utility(grid) {
  const N = grid.size, v = grid.rows.map(row => row.map(cell => cell.value));
  let points = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (r * N + c < (N - 1 - r) * N + (N - 1 - c) && v[r][c] + v[N - 1 - r][N - 1 - c] === 9) points += 1;
  return points;
}` },
  { id: "two_pair", utility: layeredSource(FAMILIES.find(f => f.id === "two_pair_plus"), "plain") },
  { id: "spread_of_three", utility: `function utility(grid) {
  const N = grid.size, v = grid.rows.map(row => row.map(cell => cell.value));
  let points = 0;
  for (let r = 0; r + 1 < N; r++) for (let c = 0; c + 1 < N; c++) {
    const w = [v[r][c], v[r][c + 1], v[r + 1][c], v[r + 1][c + 1]];
    if (Math.max(...w) - Math.min(...w) === 3) points += 1;
  }
  return points;
}` },
  { id: "strangers", utility: `function utility(grid) {
  const N = grid.size, v = grid.rows.map(row => row.map(cell => cell.value));
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  let points = 0;
  for (let r = 0; r + 1 < N; r += 2) for (let c = 0; c + 1 < N; c += 2) {
    const box = [[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]];
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const a = v[box[i][0]][box[i][1]], b = v[box[j][0]][box[j][1]];
      if (gcd(a, b) === 1 && Math.abs(a - b) !== 1) points += 1;
    }
  }
  return points;
}` },
  { id: "leapfrog", utility: `function utility(grid) {
  const N = grid.size, v = grid.rows.map(row => row.map(cell => cell.value));
  let points = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c + 2 < N; c++) if (Math.abs(v[r][c] - v[r][c + 2]) === 1) points += 1;
  return points;
}` },
  { id: "crosswise_threes", utility: `function utility(grid) {
  const N = grid.size, v = grid.rows.map(row => row.map(cell => cell.value));
  let points = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const p = N - 1 - c, q = N - 1 - r;
    if (r * N + c < p * N + q && Math.abs(v[r][c] - v[p][q]) === 3) points += 1;
  }
  return points;
}` },
];
