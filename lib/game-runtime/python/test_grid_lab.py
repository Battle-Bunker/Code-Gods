"""Host-side validity of the Grid prelude against Grid Lab (host python3 + numpy; no sandbox).

For a broad sweep of friendly arguments, every call the prelude constructors emit must be a member
of Grid Lab's `Mutator.space(gtype)` (compared as sorted-key JSON), the sweep must reach every
member of every space, and the JS prelude must emit byte-identical JSON (or fail too) on the same
argument descriptors. Bad arguments must fail with the prelude's own kid-readable error.
"""
import builtins
import itertools
import json
import pathlib
import random
import subprocess
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent
RUNTIME = HERE.parent
sys.path.insert(0, str(RUNTIME / "grid"))
sys.path.insert(0, str(RUNTIME.parent / "grid-lab"))
import prelude as P  # noqa: E402

try:
    from gridlab.core import GridType  # noqa: E402
    from gridlab.mutators import available  # noqa: E402
except ImportError as error:  # pragma: no cover - only without numpy
    GridType = None
    SKIP = f"Grid Lab unavailable: {error}"
else:
    SKIP = None

TYPES = [(5, "base10", "rgby"), (3, "base10", "rgb"), (4, "base12", "rgb"), (6, "cards", "rainbow6"),
         (7, "base16", "rainbow6"), (3, "cards", "rgby")]


def h(name, *args):
    return {"$": name, "a": list(args)}


def cell(r, c):
    return {"$cell": [r, c]}


def sample_grid(env, seed):
    rng = random.Random(seed)
    letters = [P._LETTERS[n] for n in env.palette]
    return "/".join(",".join(env.codes[rng.randrange(env.S)] + letters[rng.randrange(env.C)]
                             for _ in range(env.N)) for _ in range(env.N))


def sweep(env):
    """Argument descriptors for every constructor, covering every form each argument accepts."""
    N, C = env.N, env.C
    lines = [h("row", i) for i in range(N)] + [h("column", i) for i in range(N)]
    regions = {
        "cell": [h("at", r, c) for r in range(N) for c in range(N)] + [cell(0, N - 1), [N - 1, 0],
                                                                         h("at", cell(1, 1))],
        "line": lines,
        "line*": [h("busiest_line")],
        "diag": [h("diagonal", 0), h("diagonal", 1), h("diagonal")],
        "block": [h("square", r, c, k) for k in (2, 3) if k < N for r in range(N - k + 1)
                  for c in range(N - k + 1)] + [h("square", cell(0, 0)), h("square", 0, 0)],
        "ring": [h("ring", d) for d in range((N + 1) // 2)] + [h("ring")],
        "core": [h("middle")] if N >= 4 else [],
        "all": [h("everywhere")],
    }
    every = [x for v in regions.values() for x in v]
    colours = list(env.palette) + list(range(C))
    symbols = list(range(env.S)) + list(env.glyphs) + list(env.codes)
    ranks = list(range(1, 14)) + list(P._RANK_GLYPHS) + ["T", "QH", "K♣"] if env.cards else \
        list(range(env.S)) + list(env.glyphs)
    suits = list(P._SUIT_NAMES) + list(P._SUIT_GLYPHS) + list(P._SUIT_CODES) + [0, 1, 2, 3]
    layers = ["both", "colour", "symbol"]
    cells = [cell(r, c) for r in range(N) for c in range(N)]
    calls = []
    add = lambda name, *args: calls.append([name, list(args)])
    for a, b in itertools.product(cells, repeat=2):
        for layer in layers:
            add("swap_cells", a, [b["$cell"][0], b["$cell"][1]], layer)
    add("swap_cells", h("at", 0, 0), cell(0, 1))
    for ln in lines:
        for k in range(-N, 2 * N + 1):
            for layer in layers:
                add("shift_line", ln, k, layer)
        add("shift_line", ln)
        for layer in layers:
            add("reverse_line", ln, layer)
        add("reverse_line", ln)
        for back in (False, True):
            add("sort_line", ln, back)
        add("sort_line", ln)
        for fold in ("left->right", "right->left", "top->bottom", "bottom->top", 0, 1, 2):
            for layer in layers:
                add("mirror_fold", ln, fold, layer)
        for start in colours:
            add("pattern_line", ln, "ramp", start)
            for back in (False, True):
                add("pattern_line", ln, "ramp", start, back)
        for a, b in itertools.product(colours, repeat=2):
            add("pattern_line", ln, "alternate", a, b)
        for start in ranks:
            for back in (False, True):
                add("write_ramp", ln, start, back)
    for a, b in itertools.product(lines, repeat=2):
        add("swap_lines", a, b)
    for reg in regions["block"]:
        for move in P._MOVES:
            add("turn_block", reg, move)
    for move in P._MOVES + ("spin",):
        add("turn_grid", move)
    for fold in P._FOLDS:
        for layer in layers:
            add("mirror_fold", h("everywhere"), fold, layer)
    for style in P._STYLES:
        for a in colours:
            add("motif", style, a)
            for back in (False, True):
                add("motif", style, a, back)
            for b in colours:
                add("motif", style, a, b)
    for reg in every:
        for c in colours:
            add("paint", reg, c)
            add("tally", reg, c)
            for s in symbols:
                if not isinstance(s, str) or reg == every[0]:
                    add("stamp", reg, c, s)
        for a, b in itertools.product(colours, repeat=2):
            add("recolour", reg, a, b)
            add("swap_colours", reg, a, b)
            add("blend", reg, a, b)
            add("paint_by_key", reg, "parity", a, b)
            add("paint_by_key", reg, "redblack", a, b)
        for k in range(-C, 2 * C + 1):
            add("hue_turn", reg, k)
            add("paint_by_key", reg, "mod", k)
        add("hue_turn", reg)
        add("majority_line", reg)
        for s in symbols:
            add("write", reg, s)
        for k in range(-env.ranks, 2 * env.ranks + 1):
            add("step_rank", reg, k)
        add("step_rank", reg)
        for a, b in itertools.product(ranks, repeat=2):
            add("swap_symbols", reg, a, b)
        add("flatten", reg)
        for a, b in itertools.product(suits, repeat=2):
            add("suit_swap", reg, a, b)
        for s in suits:
            add("suit_set", reg, s)
    return [c for c in calls if c[0] in env.mutators]


BAD = [
    ["paint", [h("everywhere"), "pink"]], ["paint", [h("everywhere"), 99]], ["paint", [h("everywhere"), True]],
    ["paint", ["row 0", "red"]], ["paint", [[0, 99], 0]], ["paint", [[[0, 0], [0, 1]], 0]],
    ["recolour", [[0, 0], 0, 1]], ["swap_colours", [h("busiest_line"), 0, 1]],
    ["shift_line", [h("everywhere"), 1]], ["shift_line", [h("row", 0), 0]], ["shift_line", [h("row", 0), 1.5]],
    ["reverse_line", [h("row", 0), "colours"]], ["swap_lines", [h("row", 0), h("column", 1)]],
    ["swap_lines", [h("row", 1), h("row", 1)]], ["swap_cells", [[0, 0], [0, 0]]],
    ["turn_block", [h("everywhere"), "rot90"]], ["turn_grid", ["rot45"]], ["sort_line", [h("row", 0), 1]],
    ["mirror_fold", [h("row", 0), "top->bottom"]], ["mirror_fold", [h("everywhere"), 0]],
    ["mirror_fold", [h("diagonal", 0), "left->right"]], ["pattern_line", [h("row", 0), "zigzag", 0]],
    ["pattern_line", [h("row", 0), "alternate", 0]], ["pattern_line", [h("row", 0), "ramp", 0, 1]],
    ["motif", ["spots", 0]], ["motif", ["checker", 0]], ["motif", ["checker", 1, 1]],
    ["majority_line", [h("everywhere")]], ["write", [h("everywhere"), "Z"]], ["write", [h("everywhere"), -1]],
    ["step_rank", [h("everywhere"), 0]], ["write_ramp", [h("row", 0), "Z"]], ["swap_symbols", [h("everywhere"), 1, 1]],
    ["flatten", [[1, 1]]], ["paint_by_key", [h("everywhere"), "colour", 0, 1]],
    ["paint_by_key", [h("everywhere"), "mod", 1, 2]], ["paint_by_key", [h("everywhere"), "parity", 0]],
    ["stamp", [h("diagonal", 0), 0, 0]], ["tally", [h("ring", 0), 0]], ["blend", [h("everywhere"), 0, 0]],
    ["suit_swap", [h("everywhere"), "spades", "spades"]], ["suit_set", [h("everywhere"), "stars"]],
    ["next_colour", ["pink"]], ["paint", [h("row", 99), 0]], ["paint", [h("column", -1), 0]],
    ["paint", [h("at", 0, 9), 0]], ["paint", [h("diagonal", 2), 0]], ["paint", [h("square", 0, 0, 4), 0]],
    ["paint", [h("square", 9, 0), 0]], ["paint", [h("ring", 9), 0]],
]


def resolve(env, grid, arg):
    if isinstance(arg, dict):
        if "$cell" in arg:
            return grid.cell(*arg["$cell"])
        return getattr(env, arg["$"])(*(resolve(env, grid, a) for a in arg["a"]))
    if isinstance(arg, list):
        return [resolve(env, grid, a) for a in arg]
    return arg


def run_python(env, grid, calls):
    out = []
    for name, args in calls:
        try:
            out.append(env.encode([getattr(env, name)(*(resolve(env, grid, a) for a in args))])[1:-1])
        except P._GridError:
            out.append("ERR")
    return out


def run_js(gtype, text, calls):
    request = json.dumps({"type": list(gtype), "grid": text, "calls": calls})
    done = subprocess.run(["node", str(RUNTIME / "test" / "support" / "run-prelude.mjs")], input=request,
                          capture_output=True, text=True, check=True)
    return json.loads(done.stdout)


def canonical(params):
    return json.dumps(params, sort_keys=True, separators=(",", ":"))


def as_json(value):
    if isinstance(value, tuple):
        return [as_json(v) for v in value]
    if isinstance(value, dict):
        return {k: as_json(v) for k, v in value.items()}
    if hasattr(value, "item"):
        return value.item()
    return value


@unittest.skipIf(SKIP, SKIP)
class GridLabValidity(unittest.TestCase):
    def test_availability_matches_grid_lab(self):
        for size, symbols, colours in [(n, s, c) for n in (3, 4, 5, 6, 7) for s in
                                       ("base10", "base12", "base16", "cards") for c in ("rgb", "rgby", "rainbow6")]:
            env = P._Env(size, symbols, colours)
            gt = GridType(size, symbols, colours)
            self.assertEqual(list(env.mutators), [m.id for m in available(gt)], gt.key)
            self.assertEqual(env.N, gt.N)
            self.assertEqual((env.S, env.C, env.ranks), (gt.S, gt.C, gt.ranks))
            self.assertEqual(env.palette, gt.colour_names)
            self.assertEqual(bool(env.mixes), "Mixable" in gt.caps)
            self.assertEqual(env.glyphs, tuple(gt.glyph(s) for s in range(gt.S)))

    def test_sweep_is_valid_complete_and_matches_js(self):
        for gtype in TYPES:
            with self.subTest(gtype=gtype):
                env, gt = P._Env(*gtype), GridType(*gtype)
                text = sample_grid(env, 7)
                grid = env.grid(text)
                calls = sweep(env)
                py = run_python(env, grid, calls)
                js = run_js(gtype, text, calls)
                self.assertEqual(len(py), len(js))
                mismatches = [(c, a, b) for c, a, b in zip(calls, py, js) if a != b]
                self.assertEqual(mismatches[:5], [], "Python and JS preludes disagree")
                emitted = {}
                for call, text_ in zip(calls, py):
                    if text_ == "ERR":
                        continue
                    wire = json.loads(text_)
                    self.assertEqual(sorted(wire), ["m", "p"])
                    emitted.setdefault(wire["m"], set()).add(canonical(wire["p"]))
                for mutator in available(gt):
                    space = {canonical(as_json(p)) for p in mutator.space(gt)}
                    got = emitted.get(mutator.id, set())
                    self.assertEqual(got - space, set(), f"{mutator.id}: params outside Grid Lab's space")
                    self.assertEqual(space - got, set(), f"{mutator.id}: sweep misses part of the space")

    def test_bad_arguments_fail_with_kid_errors_in_both_languages(self):
        for gtype in TYPES:
            env = P._Env(*gtype)
            text = sample_grid(env, 3)
            calls = [c for c in BAD if c[0] in env.mutators or c[0] == "next_colour"]
            py = run_python(env, env.grid(text), calls)
            self.assertEqual(py, ["ERR"] * len(calls), list(zip(calls, py)))
            self.assertEqual(run_js(gtype, text, calls), py)

    def test_name_hygiene(self):
        for gtype in TYPES:
            names = set(P._Env(*gtype).names())
            self.assertEqual(names & set(dir(builtins)), set())
            self.assertFalse([n for n in names if n.startswith("_")])
        public = [n for n in vars(P) if not n.startswith("_")]
        self.assertEqual(public, [], "module-level prelude names must be private")

    def test_read_only_grid_matches_kid_api(self):
        from gridlab.core import Grid as LabGrid
        from gridlab.kid import Grid as KidGrid
        import numpy as np
        for gtype in TYPES:
            env, gt = P._Env(*gtype), GridType(*gtype)
            rng = random.Random(5)
            for _ in range(5):
                text = sample_grid(env, rng.randrange(10 ** 6))
                rows = [r.split(",") for r in text.split("/")]
                letters = {P._LETTERS[n]: i for i, n in enumerate(env.palette)}
                sym = np.array([[env.codes.index(c[:-1]) for c in r] for r in rows])
                col = np.array([[letters[c[-1]] for c in r] for r in rows])
                kid, ours = KidGrid.from_lab(LabGrid(sym, col), gt), env.grid(text)
                view = lambda c: None if c is None else (c.row, c.col, c.symbol, c.value, c.colour)
                for a, b in zip(kid.cells, ours.cells):
                    self.assertEqual(view(a), view(b))
                    for attr in ("left", "right", "up", "down", "up_left", "up_right", "down_left", "down_right"):
                        self.assertEqual(view(getattr(a, attr)), view(getattr(b, attr)))
                    self.assertEqual([view(x) for x in a.neighbours], [view(x) for x in b.neighbours])
                    self.assertEqual([view(x) for x in a.surrounding], [view(x) for x in b.surrounding])
                    self.assertEqual(a.on_edge, b.on_edge)
                    if env.cards:
                        self.assertEqual((a.suit, a.is_picture), (b.suit, b.is_picture))
                    self.assertEqual(view(kid.quarter_turn(a)), view(ours.quarter_turn(b)))
                for attr in ("rows", "columns", "diagonals"):
                    self.assertEqual([[view(c) for c in line] for line in getattr(kid, attr)],
                                     [[view(c) for c in line] for line in getattr(ours, attr)])
                self.assertEqual([view(c) for c in kid.edge_cells], [view(c) for c in ours.edge_cells])
                self.assertEqual(kid.palette, ours.palette)
                same = lambda a, b: a.colour == b.colour
                self.assertEqual([[view(c) for c in g] for g in kid.regions(same)],
                                 [[view(c) for c in g] for g in ours.regions(same)])
                through = lambda c: c.colour != env.palette[0]
                self.assertEqual([view(c) for c in kid.reachable(kid.edge_cells, through)],
                                 [view(c) for c in ours.reachable(ours.edge_cells, through)])


if __name__ == "__main__":
    unittest.main()
