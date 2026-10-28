// Trusted Grid prelude: what a Grid agent sees in the TypeScript (QuickJS) sandbox.
//
// An agent for a Grid room is one expression of type (grid: Grid) => MutatorCall[], e.g.
//   (grid) => [paint(row(0), "red")]
// It can change the grid ONLY through those calls; the host validates, prices and applies them.
//
// This script evaluates to a factory. The worker evaluates it in each fresh QuickJS context AFTER
// the Date/Math.random capability wrappers and BEFORE any submitted code, then calls
// factory(size, symbols, colours): that installs the public names on globalThis and returns the
// trusted hooks { grid(text), encode(calls), errorOf(error) }. Intrinsics the hooks rely on are
// captured here, before guest code can replace them. No I/O, no clock, no randomness.
// Mirror of grid/prelude.py (snake_case there, camelCase here): keep them in step.
(function () {
  "use strict";
  const __apply = Reflect.apply, __isArray = Array.isArray, __isInteger = Number.isInteger;
  const __freeze = Object.freeze, __define = Object.defineProperty, __create = Object.create;
  const __WeakMap = WeakMap, __wmGet = WeakMap.prototype.get, __wmSet = WeakMap.prototype.set;
  const __wmHas = WeakMap.prototype.has, __String = String, __Error = Error;
  const __global = globalThis;

  const __SIZES = [3, 4, 5, 6, 7];
  const __DIGITS = "0123456789ABCDEF";
  const __DIGIT_SETS = { base10: 10, base12: 12, base16: 16 };
  const __RANK_CODES = "A23456789TJQK";
  const __RANK_GLYPHS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const __SUIT_CODES = "SHDC";
  const __SUIT_GLYPHS = ["♠", "♥", "♦", "♣"];
  const __SUIT_NAMES = ["spades", "hearts", "diamonds", "clubs"];
  const __PALETTES = {
    rgb: ["red", "green", "blue"],
    rgby: ["red", "yellow", "green", "blue"],
    rainbow6: ["red", "orange", "yellow", "green", "blue", "violet"],
  };
  const __LETTERS = { red: "R", orange: "O", yellow: "Y", green: "G", blue: "B", violet: "V" };
  // Paint mixing, in Grid Lab's MIXES order: [parent, parent, child].
  const __MIXES = {
    rgb: [],
    rgby: [["yellow", "blue", "green"]],
    rainbow6: [["red", "yellow", "orange"], ["yellow", "blue", "green"], ["red", "blue", "violet"]],
  };
  const __MOVES = ["rot90", "rot180", "rot270", "flipH", "flipV", "transpose", "antitranspose"];
  const __FOLDS = ["left->right", "right->left", "top->bottom", "bottom->top",
    "below->above diagonal", "above->below diagonal",
    "below->above other diagonal", "above->below other diagonal"];
  const __LAYERS = ["both", "colour", "symbol"];
  const __STYLES = { "stripes across": ["stripes", 0], "stripes down": ["stripes", 1],
    "diagonal": ["diagonal", 0], "other diagonal": ["diagonal", 1], "checker": ["checker", null] };
  const __STYLE_NAMES = ["stripes across", "stripes down", "diagonal", "other diagonal", "checker"];
  const __KEYS = ["parity", "mod", "redblack"];
  const __MAX_CALLS = 8, __MAX_OUTPUT = 8192;
  const __KIND_TEXT = { "cell": "one cell (at)", "line": "a row or column", "line*": "busiestLine()",
    "diag": "a diagonal", "block": "a square", "ring": "a ring", "core": "middle()", "all": "everywhere()" };
  const __MUTATORS = ["swapCells", "shiftLine", "reverseLine", "swapLines", "turnBlock", "turnGrid",
    "sortLine", "mirrorFold",
    "paint", "recolour", "swapColours", "hueTurn", "patternLine", "motif", "majorityLine",
    "write", "stepRank", "writeRamp", "swapSymbols", "flatten",
    "paintByKey", "stamp", "tally", "blend", "suitSwap", "suitSet"];
  const __IDS = { swapCells: "swap_cells", shiftLine: "shift_line", reverseLine: "reverse_line",
    swapLines: "swap_lines", turnBlock: "turn_block", turnGrid: "turn_grid", sortLine: "sort_line",
    mirrorFold: "mirror_fold", paint: "paint", recolour: "recolour", swapColours: "swap_colours",
    hueTurn: "hue_turn", patternLine: "pattern_line", motif: "motif", majorityLine: "majority_line",
    write: "write", stepRank: "step_rank", writeRamp: "write_ramp", swapSymbols: "swap_symbols",
    flatten: "flatten", paintByKey: "paint_by_key", stamp: "stamp", tally: "tally", blend: "blend",
    suitSwap: "suit_swap", suitSet: "suit_set" };

  const __has = (list, x) => { for (let i = 0; i < list.length; i++) if (list[i] === x) return true; return false; };
  const __indexOf = (list, x) => { for (let i = 0; i < list.length; i++) if (list[i] === x) return i; return -1; };
  const __join = (list, sep) => { let s = ""; for (let i = 0; i < list.length; i++) s += (i ? sep : "") + list[i]; return s; };
  const __mod = (x, m) => ((x % m) + m) % m;
  const __isInt = x => typeof x === "number" && __isInteger(x);

  // Private registries: only objects made here count as cells, regions or moves.
  const __cells = new __WeakMap(), __regions = new __WeakMap(), __calls = new __WeakMap();
  const __errors = new __WeakMap();
  const __wm = (fn, map, ...args) => __apply(fn, map, args);

  // --- read-only grid ----------------------------------------------------------------------------
  const __READ_ONLY = 'grids are read-only: change them by returning moves like [paint(row(0), "red")]';
  const __CellProto = __create(Object.prototype, {
    neighbours: { get() { return [this.left, this.right, this.up, this.down].filter(c => c !== null); } },
    surrounding: { get() {
      return [this.upLeft, this.up, this.upRight, this.left, this.right, this.downLeft, this.down, this.downRight]
        .filter(c => c !== null);
    } },
    onEdge: { get() { const n = __wm(__wmGet, __cells, this)[2] - 1;
      return this.row === 0 || this.row === n || this.col === 0 || this.col === n; } },
    toString: { value() { return `Cell(row=${this.row}, col=${this.col}, ${this.symbol} ${this.colour})`; } },
  });
  __freeze(__CellProto);

  function __gridError(message, code) {
    const error = new __Error(message);
    __wm(__wmSet, __errors, error, code + "|" + message);
    throw error;
  }
  const __fail = message => __gridError(message, "EXECUTION");

  function __show(x) {
    if (typeof x === "string") return '"' + (x.length <= 24 ? x : x.slice(0, 24) + "...") + '"';
    if (typeof x === "number" || typeof x === "boolean" || x === null || x === undefined) return __String(x);
    if ((typeof x === "object" || typeof x === "function") && x !== null) {
      const cell = __wm(__wmGet, __cells, x);
      if (cell) return `the cell at row ${cell[0]}, column ${cell[1]}`;
      const region = __wm(__wmGet, __regions, x);
      if (region) return region[2];
      const call = __wm(__wmGet, __calls, x);
      if (call) return `a ${call[0]} move`;
      if (__isArray(x)) return "a list";
      return typeof x === "object" ? "an object" : "a function";
    }
    return "a " + typeof x;
  }

  function __json(v) {
    if (typeof v === "number") return __String(v);
    if (typeof v === "string") return '"' + v + '"'; // only fixed ASCII identifiers from the tables above
    let s = "[";
    for (let i = 0; i < v.length; i++) s += (i ? "," : "") + __json(v[i]);
    return s + "]";
  }
  const __tuple = (...xs) => __freeze(xs);

  function __regionText(kind, value) {
    if (kind === "cell") return `at(${value[0]}, ${value[1]})`;
    if (kind === "line") return `${value[0] === 0 ? "row" : "column"}(${value[1]})`;
    if (kind === "diag") return `diagonal(${value})`;
    if (kind === "block") return `square(${value[0]}, ${value[1]}, ${value[2]})`;
    if (kind === "ring") return `ring(${value})`;
    return { "line*": "busiestLine()", "core": "middle()", "all": "everywhere()" }[kind];
  }

  return function __gridPrelude(size, symbols, colours) {
    if (!__has(__SIZES, size) || !__has(["base10", "base12", "base16", "cards"], symbols)
        || !__has(["rgb", "rgby", "rainbow6"], colours)) throw new __Error("Unsupported GridType");
    const N = size, cards = symbols === "cards";
    const S = cards ? 52 : __DIGIT_SETS[symbols], ranks = cards ? 13 : S;
    const palette = __PALETTES[colours], C = palette.length;
    const mixes = __MIXES[colours].map(m => __tuple(...m.map(name => __indexOf(palette, name))));
    const glyphs = [], codes = [], symbolIndex = new Map();
    for (let s = 0; s < S; s++) {
      glyphs.push(cards ? __RANK_GLYPHS[s % 13] + __SUIT_GLYPHS[Math.floor(s / 13)] : __DIGITS[s]);
      codes.push(cards ? __RANK_CODES[s % 13] + __SUIT_CODES[Math.floor(s / 13)] : __DIGITS[s]);
      symbolIndex.set(codes[s], s); symbolIndex.set(glyphs[s], s);
    }
    const symbolOf = x => (typeof x === "string" && symbolIndex.has(x) ? symbolIndex.get(x) : undefined);
    const mutators = __MUTATORS.filter(m => !(m === "tally" && cards) && !(m === "blend" && !mixes.length)
      && !((m === "suitSwap" || m === "suitSet") && !cards));

    // --- plumbing --------------------------------------------------------------------------------
    function call(m, p) {
      let text = '{"m":"' + m + '","p":{';
      const fields = {};
      for (let i = 0; i < p.length; i++) {
        text += (i ? "," : "") + '"' + p[i][0] + '":' + __json(p[i][1]);
        fields[p[i][0]] = p[i][1];
      }
      text += "}}";
      const obj = __freeze({ m, p: __freeze(fields) });
      __wm(__wmSet, __calls, obj, [m, text]);
      return obj;
    }
    function region(kind, value) {
      const obj = __freeze({ kind, value });
      __wm(__wmSet, __regions, obj, [kind, value, __regionText(kind, value)]);
      return obj;
    }
    const regionOf = x => ((typeof x === "object" && x !== null) ? __wm(__wmGet, __regions, x) : undefined);
    const cellOf = x => ((typeof x === "object" && x !== null) ? __wm(__wmGet, __cells, x) : undefined);

    function grid(text) {
      const lines = text.split("/"), cells = [];
      const letters = {};
      for (const name of palette) letters[__LETTERS[name]] = name;
      for (let r = 0; r < N; r++) {
        const items = lines[r].split(","), row = [];
        for (let c = 0; c < N; c++) {
          const item = items[c], s = symbolIndex.get(item.slice(0, -1)), colour = letters[item.slice(-1)];
          const cell = __create(__CellProto);
          cell.row = r; cell.col = c; cell.symbol = glyphs[s];
          cell.value = cards ? s % 13 + 1 : s; cell.colour = colour;
          if (cards) { cell.suit = __SUIT_NAMES[Math.floor(s / 13)]; cell.isPicture = s % 13 >= 10; }
          __wm(__wmSet, __cells, cell, [r, c, N]);
          row.push(cell);
        }
        cells.push(row);
      }
      const at = (r, c) => (r >= 0 && r < N && c >= 0 && c < N ? cells[r][c] : null);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const x = cells[r][c];
        x.left = at(r, c - 1); x.right = at(r, c + 1); x.up = at(r - 1, c); x.down = at(r + 1, c);
        x.upLeft = at(r - 1, c - 1); x.upRight = at(r - 1, c + 1);
        x.downLeft = at(r + 1, c - 1); x.downRight = at(r + 1, c + 1);
        __freeze(x);
      }
      const all = () => { const out = []; for (const row of cells) for (const c of row) out.push(c); return out; };
      const g = __create(GridProto);
      __define(g, "size", { value: N, enumerable: true });
      __define(g, "__rows", { value: cells });
      __define(g, "__all", { value: all });
      return __freeze(g);
    }
    const GridProto = __freeze(__create(Object.prototype, {
      cells: { get() { return this.__all(); } },
      rows: { get() { return this.__rows.map(row => row.slice()); } },
      columns: { get() { return this.__rows.map((_, c) => this.__rows.map(row => row[c])); } },
      diagonals: { get() {
        const n = this.size, rows = this.__rows, a = [], b = [];
        for (let i = 0; i < n; i++) { a.push(rows[i][i]); b.push(rows[i][n - 1 - i]); }
        return [a, b];
      } },
      edgeCells: { get() { return this.__all().filter(c => c.onEdge); } },
      palette: { get() { return palette.slice(); } },
      cell: { value(r, c) {
        if (!__isInt(r) || r < 0 || r >= N) __fail(`row ${__show(r)} doesn't exist on a ${N}×${N} grid (rows go from 0 to ${N - 1})`);
        if (!__isInt(c) || c < 0 || c >= N) __fail(`column ${__show(c)} doesn't exist on a ${N}×${N} grid (columns go from 0 to ${N - 1})`);
        return this.__rows[r][c];
      } },
      quarterTurn: { value(cell) { return this.__rows[cell.col][this.size - 1 - cell.row]; } },
      reachable: { value(start, through) {
        const starts = __isArray(start) ? start.slice() : [start];
        const seen = new Set(), todo = starts.filter(c => through(c));
        todo.forEach(c => seen.add(c));
        while (todo.length) for (const n of todo.pop().neighbours) if (!seen.has(n) && through(n)) { seen.add(n); todo.push(n); }
        return this.__all().filter(c => seen.has(c));
      } },
      regions: { value(same) {
        const group = new Map(), out = [];
        for (const c of this.__all()) {
          if (group.has(c)) continue;
          const k = out.length, members = [c], todo = [c];
          group.set(c, k);
          while (todo.length) {
            const x = todo.pop();
            for (const n of x.neighbours) if (!group.has(n) && same(x, n)) { group.set(n, k); members.push(n); todo.push(n); }
          }
          out.push(members.sort((a, b) => a.row - b.row || a.col - b.col));
        }
        return out;
      } },
      toString: { value() {
        return this.__rows.map(row => row.map(c => (c.symbol + c.colour[0].toUpperCase()).padStart(4)).join(" ")).join("\n");
      } },
    }));

    function encode(calls) {
      const domain = message => __gridError(message, "DOMAIN");
      if (!__isArray(calls)) {
        const single = (typeof calls === "object" && calls !== null) ? __wm(__wmGet, __calls, calls) : undefined;
        if (single) domain(`the agent must return a list of moves: put the move in square brackets, like [${single[0]}(...)]`);
        domain(`the agent must return a list of moves, like [paint(row(0), "red")], not ${__show(calls)}`);
      }
      const n = calls.length;
      if (!__isInt(n) || n > __MAX_CALLS) domain(`an agent can make at most ${__MAX_CALLS} moves at a time; this one made ${n}`);
      let text = "[";
      for (let i = 0; i < n; i++) {
        const c = calls[i];
        const entry = (typeof c === "object" && c !== null) ? __wm(__wmGet, __calls, c) : undefined;
        if (!entry) domain(`item ${i} of the agent's list isn't a move (it is ${__show(c)})`);
        text += (i ? "," : "") + entry[1];
      }
      text += "]";
      if (text.length > __MAX_OUTPUT) domain("the agent's moves are too long to send");
      return text;
    }
    function errorOf(error) {
      if ((typeof error !== "object" && typeof error !== "function") || error === null) return undefined;
      return __wm(__wmGet, __errors, error);
    }

    // --- argument readers ------------------------------------------------------------------------
    function pos(x, name) {
      const cell = cellOf(x);
      if (cell) return __tuple(cell[0], cell[1]);
      const reg = regionOf(x);
      if (reg && reg[0] === "cell") return reg[1];
      if (__isArray(x) && x.length === 2 && __isInt(x[0]) && __isInt(x[1])) return at(x[0], x[1]).value;
      __fail(`${name} needs cells, like grid.cell(0, 1), at(0, 1) or [0, 1], not ${__show(x)}`);
    }
    function where(x, name, kinds) {
      let reg = regionOf(x);
      if (!reg) {
        if (cellOf(x) || (__isArray(x) && x.length === 2 && __isInt(x[0]) && __isInt(x[1]))) reg = ["cell", pos(x, name)];
        else __fail(`${name} needs a place on the grid, like row(0), at(2, 3), square(0, 0) or everywhere(), not ${__show(x)}`);
      }
      if (!__has(kinds, reg[0])) {
        const allowed = kinds.filter(k => !(k === "core" && N < 4)).map(k => __KIND_TEXT[k]);
        __fail(`${name} can't use ${__KIND_TEXT[reg[0]]}; it works on ${__join(allowed, ", ")}`);
      }
      return reg;
    }
    function line(x, name) {
      const reg = regionOf(x);
      if (reg && reg[0] === "line") return reg[1];
      __fail(`${name} needs a row or a column, like row(0) or column(2), not ${__show(x)}`);
    }
    function colour(x) {
      if (typeof x === "string" && __has(palette, x)) return __indexOf(palette, x);
      if (__isInt(x) && x >= 0 && x < C) return x;
      __fail(`${__show(x)} isn't a colour on this grid; use one of ${__join(palette, ", ")} (or 0 to ${C - 1})`);
    }
    function symbol(x) {
      const s = symbolOf(x);
      if (s !== undefined) return s;
      if (__isInt(x) && x >= 0 && x < S) return x;
      if (cards) __fail(`${__show(x)} isn't a card; use a card like "7♥" or "QS", or 0 to 51`);
      __fail(`${__show(x)} isn't a symbol on this grid; use ${glyphs[0]} to ${glyphs[S - 1]} (or 0 to ${S - 1})`);
    }
    function rank(x) {
      if (cards) {
        if (__isInt(x) && x >= 1 && x <= 13) return x - 1;
        if (typeof x === "string") {
          if (__has(__RANK_GLYPHS, x)) return __indexOf(__RANK_GLYPHS, x);
          if (x.length === 1 && __RANK_CODES.includes(x)) return __RANK_CODES.indexOf(x);
          const s = symbolOf(x);
          if (s !== undefined) return s % 13;
        }
        __fail(`${__show(x)} isn't a card number; use 1 (ace) to 13 (king), or "A", "2" ... "10", "J", "Q", "K"`);
      }
      if (__isInt(x) && x >= 0 && x < S) return x;
      const s = symbolOf(x);
      if (s !== undefined) return s;
      __fail(`${__show(x)} isn't a number on this grid; use 0 to ${S - 1}`);
    }
    function suitOf(x) {
      if (typeof x === "string") for (let i = 0; i < 4; i++) {
        if (x === __SUIT_NAMES[i] || x === __SUIT_GLYPHS[i] || x === __SUIT_CODES[i]) return i;
      }
      if (__isInt(x) && x >= 0 && x < 4) return x;
      __fail(`${__show(x)} isn't a suit; use "spades", "hearts", "diamonds" or "clubs"`);
    }
    function layerOf(x) {
      if (typeof x === "string" && __has(__LAYERS, x)) return x;
      __fail(`layer should be "both", "colour" or "symbol", not ${__show(x)}`);
    }
    function flag(x, name) {
      if (typeof x !== "boolean") __fail(`${name} should be true or false, not ${__show(x)}`);
      return x;
    }
    function steps(x, modulus, what) {
      if (!__isInt(x)) __fail(`${what} should be a whole number of steps, not ${__show(x)}`);
      const k = __mod(x, modulus);
      if (k === 0) __fail(`${what} by ${x} steps changes nothing; use 1 to ${modulus - 1} steps`);
      return k;
    }
    function pair(a, b, read, name, ordered) {
      const x = read(a), y = read(b);
      if (x === y) __fail(`${name} needs two different values, not ${__show(a)} twice`);
      return ordered || x < y ? __tuple(x, y) : __tuple(y, x);
    }
    function area(name, kinds, w) {
      const reg = where(w, name, kinds);
      return [["kind", reg[0]], ["region", reg[1]]];
    }
    function moveOf(m) {
      if (typeof m !== "string" || !__has(__MOVES, m)) __fail(`${__show(m)} isn't a move; use one of ${__join(__MOVES, ", ")}`);
      return m;
    }
    const lt = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

    // --- regions -----------------------------------------------------------------------------------
    function row(i) {
      if (!__isInt(i) || i < 0 || i >= N) __fail(`row ${__show(i)} doesn't exist on a ${N}×${N} grid (rows go from 0 to ${N - 1})`);
      return region("line", __tuple(0, i));
    }
    function column(i) {
      if (!__isInt(i) || i < 0 || i >= N) __fail(`column ${__show(i)} doesn't exist on a ${N}×${N} grid (columns go from 0 to ${N - 1})`);
      return region("line", __tuple(1, i));
    }
    function at(r, c) {
      const cell = cellOf(r);
      if (c === undefined && cell) return region("cell", __tuple(cell[0], cell[1]));
      if (c === undefined && __isArray(r) && r.length === 2) { c = r[1]; r = r[0]; }
      if (!__isInt(r) || r < 0 || r >= N) __fail(`row ${__show(r)} doesn't exist on a ${N}×${N} grid (rows go from 0 to ${N - 1})`);
      if (!__isInt(c) || c < 0 || c >= N) __fail(`column ${__show(c)} doesn't exist on a ${N}×${N} grid (columns go from 0 to ${N - 1})`);
      return region("cell", __tuple(r, c));
    }
    function diagonal(i = 0) {
      if (i !== 0 && i !== 1) __fail(`diagonal ${__show(i)} doesn't exist: diagonal(0) runs from the top-left corner to the bottom-right, diagonal(1) from the top-right to the bottom-left`);
      return region("diag", i);
    }
    function square(r, c, k = 2) {
      const cell = cellOf(r);
      if (cell) { k = c === undefined ? 2 : c; r = cell[0]; c = cell[1]; }
      const sizes = [2, 3].filter(x => x < N);
      if (!__isInt(k) || !__has(sizes, k)) __fail(`a square can be ${__join(sizes, " or ")} cells wide on a ${N}×${N} grid, not ${__show(k)}`);
      const top = N - k;
      if (!__isInt(r) || !__isInt(c) || r < 0 || r > top || c < 0 || c > top) {
        __fail(`a ${k}×${k} square at row ${__show(r)}, column ${__show(c)} doesn't fit on a ${N}×${N} grid (its top-left cell can be at rows and columns 0 to ${top})`);
      }
      return region("block", __tuple(r, c, k));
    }
    function ring(depth = 0) {
      const deepest = Math.floor((N + 1) / 2) - 1;
      if (!__isInt(depth) || depth < 0 || depth > deepest) __fail(`ring ${__show(depth)} doesn't exist on a ${N}×${N} grid (rings go from 0, the outside edge, to ${deepest} in the middle)`);
      return region("ring", depth);
    }
    function middle() {
      if (N < 4) __fail(`middle() needs a grid at least 4 cells wide; on a ${N}×${N} grid use at(1, 1)`);
      return region("core", __tuple());
    }
    const everywhere = () => region("all", __tuple());
    const busiestLine = () => region("line*", __tuple());

    // --- capability helpers ------------------------------------------------------------------------
    function nextColour(c) {
      if (typeof c !== "string" || !__has(palette, c)) __fail(`${__show(c)} isn't a colour on this grid; use one of ${__join(palette, ", ")}`);
      return palette[(__indexOf(palette, c) + 1) % C];
    }
    function mix(a, b) {
      for (const name of [a, b]) {
        if (typeof name !== "string" || !__has(palette, name)) __fail(`${__show(name)} isn't a colour on this grid; use one of ${__join(palette, ", ")}`);
      }
      const x = __indexOf(palette, a), y = __indexOf(palette, b);
      for (const [p, q, child] of mixes) if ((x === p && y === q) || (x === q && y === p)) return palette[child];
      return null;
    }

    // --- mutators ------------------------------------------------------------------------------------
    const api = {
      swapCells(a, b, layer = "both") {
        layer = layerOf(layer);
        let x = pos(a, "swapCells"), y = pos(b, "swapCells");
        if (x[0] === y[0] && x[1] === y[1]) __fail("swapCells needs two different cells");
        if (!lt(x, y)) [x, y] = [y, x];
        const near = Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) === 1 ? "next door" : "anywhere";
        return call("swap_cells", [["layer", layer], ["near", near], ["pair", __tuple(x, y)]]);
      },
      shiftLine(l, k = 1, layer = "both") {
        layer = layerOf(layer);
        const ln = line(l, "shiftLine");
        return call("shift_line", [["layer", layer], ["line", ln], ["k", steps(k, N, "sliding")]]);
      },
      reverseLine(l, layer = "both") {
        layer = layerOf(layer);
        return call("reverse_line", [["layer", layer], ["line", line(l, "reverseLine")]]);
      },
      swapLines(a, b) {
        const x = line(a, "swapLines"), y = line(b, "swapLines");
        if (x[0] !== y[0]) __fail("swapLines needs two rows or two columns, not one of each");
        if (x[1] === y[1]) __fail("swapLines needs two different lines");
        return call("swap_lines", [["axis", x[0]], ["pair", __tuple(Math.min(x[1], y[1]), Math.max(x[1], y[1]))]]);
      },
      turnBlock(sq, move) {
        const reg = where(sq, "turnBlock", ["block"]);
        return call("turn_block", [["kind", "block"], ["region", reg[1]], ["move", moveOf(move)]]);
      },
      turnGrid(move) { return call("turn_grid", [["move", moveOf(move)]]); },
      sortLine(l, backwards = false) {
        const ln = line(l, "sortLine");
        return call("sort_line", [["line", ln], ["dir", flag(backwards, "backwards") ? -1 : 1]]);
      },
      mirrorFold(w, fold, layer = "both") {
        layer = layerOf(layer);
        const reg = where(w, "mirrorFold", ["line", "all"]);
        if (reg[0] === "all") {
          if (typeof fold !== "string" || !__has(__FOLDS, fold)) __fail(`${__show(fold)} isn't a fold for the whole grid; use one of ${__join(__FOLDS, ", ")}`);
          return call("mirror_fold", [["layer", layer], ["kind", "all"], ["side", fold]]);
        }
        const names = reg[1][0] === 0 ? ["left->right", "right->left"] : ["top->bottom", "bottom->top"];
        let side;
        if (typeof fold === "string" && __has(names, fold)) side = __indexOf(names, fold);
        else if (fold === 0 || fold === 1) side = fold;
        else __fail(`to mirror ${reg[2]} use "${names[0]}" or "${names[1]}", not ${__show(fold)}`);
        return call("mirror_fold", [["layer", layer], ["kind", "line"], ["line", reg[1]], ["side", side]]);
      },
      paint(w, c) {
        const p = area("paint", ["cell", "line", "line*", "diag", "block", "ring", "core", "all"], w);
        p.push(["colour", colour(c)]);
        return call("paint", p);
      },
      recolour(w, oldColour, newColour) {
        const p = area("recolour", ["line", "line*", "block", "ring", "core", "all"], w);
        p.push(["pair", pair(oldColour, newColour, colour, "recolour", true)]);
        return call("recolour", p);
      },
      swapColours(w, a, b) {
        const p = area("swapColours", ["line", "block", "ring", "all"], w);
        p.push(["pair", pair(a, b, colour, "swapColours", false)]);
        return call("swap_colours", p);
      },
      hueTurn(w, k = 1) {
        const p = area("hueTurn", ["cell", "line", "block", "ring", "all"], w);
        p.push(["k", steps(k, C, "turning the colours")]);
        return call("hue_turn", p);
      },
      patternLine(l, pattern, c, other) {
        const ln = line(l, "patternLine");
        if (pattern === "ramp") {
          if (other !== undefined && other !== null && typeof other !== "boolean") {
            __fail('a "ramp" pattern takes one colour (where the rainbow starts), then optionally true to run it backwards');
          }
          return call("pattern_line", [["line", ln], ["pattern", "ramp"], ["start", colour(c)], ["dir", other === true ? -1 : 1]]);
        }
        if (pattern === "alternate") {
          if (other === undefined || other === null) __fail('an "alternate" pattern needs two colours, like patternLine(row(0), "alternate", "red", "blue")');
          return call("pattern_line", [["line", ln], ["pattern", "alternate"], ["pair", pair(c, other, colour, "alternate", true)]]);
        }
        __fail(`pattern should be "ramp" or "alternate", not ${__show(pattern)}`);
      },
      motif(style, c, other) {
        if (typeof style !== "string" || !__has(__STYLE_NAMES, style)) __fail(`${__show(style)} isn't a wallpaper; use one of ${__join(__STYLE_NAMES, ", ")}`);
        const [kind, axis] = __STYLES[style];
        if (kind === "checker") {
          if (other === undefined || other === null) __fail('a "checker" wallpaper needs two colours, like motif("checker", "red", "blue")');
          return call("motif", [["style", "checker"], ["pair", pair(c, other, colour, "checker", true)]]);
        }
        if (other !== undefined && other !== null && typeof other !== "boolean") {
          __fail(`"${style}" takes one colour (where the rainbow starts), then optionally true to run it backwards`);
        }
        return call("motif", [["style", kind], ["axis", axis], ["start", colour(c)], ["dir", other === true ? -1 : 1]]);
      },
      majorityLine(l) { return call("majority_line", area("majorityLine", ["line", "line*"], l)); },
      write(w, s) {
        const p = area("write", ["cell", "line", "line*", "diag", "block", "ring", "core", "all"], w);
        p.push(["symbol", symbol(s)]);
        return call("write", p);
      },
      stepRank(w, k = 1) {
        const p = area("stepRank", ["cell", "line", "block", "ring", "all"], w);
        p.push(["k", steps(k, ranks, "counting on")]);
        return call("step_rank", p);
      },
      writeRamp(l, start, backwards = false) {
        const ln = line(l, "writeRamp");
        start = rank(start);
        return call("write_ramp", [["line", ln], ["start", start], ["dir", flag(backwards, "backwards") ? -1 : 1]]);
      },
      swapSymbols(w, a, b) {
        const p = area("swapSymbols", ["line", "block", "ring", "all"], w);
        p.push(["pair", pair(a, b, rank, "swapSymbols", false)]);
        return call("swap_symbols", p);
      },
      flatten(w) { return call("flatten", area("flatten", ["line", "block", "ring", "all"], w)); },
      paintByKey(w, key, first, second) {
        const p = area("paintByKey", ["line", "all"], w);
        const keys = cards ? __KEYS : __KEYS.slice(0, 2);
        if (typeof key !== "string" || !__has(keys, key)) __fail(`${__show(key)} isn't a key on this grid; use ${__join(keys.map(k => '"' + k + '"'), " or ")}`);
        p.push(["key", key]);
        if (key === "mod") {
          if (second !== undefined && second !== null) __fail('the "mod" key takes one number: how far round the rainbow to shift');
          if (!__isInt(first)) __fail(`the "mod" shift should be a whole number, not ${__show(first)}`);
          p.push(["shift", __mod(first, C)]);
        } else {
          if (second === undefined || second === null) __fail(`the "${key}" key needs two colours`);
          p.push(["pair", pair(first, second, colour, key, true)]);
        }
        return call("paint_by_key", p);
      },
      stamp(w, c, s) {
        const p = area("stamp", ["line", "block", "all"], w);
        p.push(["colour", colour(c)]);
        p.push(["symbol", symbol(s)]);
        return call("stamp", p);
      },
      tally(w, c) {
        const p = area("tally", ["line", "block", "all"], w);
        p.push(["colour", colour(c)]);
        return call("tally", p);
      },
      blend(w, a, b) {
        const p = area("blend", ["line", "all"], w);
        const x = colour(a), y = colour(b);
        for (const recipe of mixes) {
          if ((x === recipe[0] && y === recipe[1]) || (x === recipe[1] && y === recipe[0])) {
            p.push(["recipe", recipe]);
            return call("blend", p);
          }
        }
        const recipes = __join(mixes.map(r => `${palette[r[0]]} + ${palette[r[1]]} = ${palette[r[2]]}`), "; ");
        __fail(`${palette[x]} and ${palette[y]} don't mix on this grid (${recipes})`);
      },
      suitSwap(w, a, b) {
        const p = area("suitSwap", ["cell", "line", "block", "all"], w);
        p.push(["pair", pair(a, b, suitOf, "suitSwap", false)]);
        return call("suit_swap", p);
      },
      suitSet(w, s) {
        const p = area("suitSet", ["line", "block", "ring", "all"], w);
        p.push(["suit", suitOf(s)]);
        return call("suit_set", p);
      },
    };

    const names = { row, column, at, diagonal, square, ring, middle, everywhere, busiestLine, nextColour };
    for (const m of mutators) names[m] = api[m];
    if (mixes.length) names.mix = mix;
    for (const name of Object.keys(names)) {
      __define(__global, name, { value: names[name], writable: true, enumerable: false, configurable: true });
    }
    return __freeze({ grid, encode, errorOf, names: __freeze(Object.keys(names)), mutators: __freeze(mutators.map(m => __IDS[m])) });
  };
})()
