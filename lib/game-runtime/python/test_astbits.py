"""ast-bits-v1 against grid-lab's published test vectors (test/ast-bits-v1-vectors.json, programs).

The vectors use grid-lab's API vocabulary (paint_row, move(...), ...), so this test supplies a grid-lab
vocabulary config and a small grid-lab-like Python prelude whose constructors build the same wire calls.
structure, names and literals must match to 1e-5 bits. grid-lab's `moves` part is flags + literal moves
(flag + log2 #available + D); the guest reports the flags of ordinary calls (`moveFlags`) and detects the
literal moves, whose bits the host adds.
"""
import json
import math
import pathlib
import unittest
from runner import Runner
from fixture import INTS, request

ROOT = pathlib.Path(__file__).resolve().parents[1]
VECTORS = json.loads((ROOT / "test" / "ast-bits-v1-vectors.json").read_text())
TABLES = json.loads((pathlib.Path(__file__).resolve().parent / "ast_bits_v1.json").read_text())
COLOURS = ["red", "orange", "yellow", "green", "blue", "violet"]
NON_MUTATORS = {"cell", "row", "column", "diagonal", "block", "ring", "moves", "core", "everything",
                "best_line", "score", "D4_MOVES", *COLOURS}
GRIDLAB_VOCAB = {
    "api": TABLES["vocab"]["api"], "attrs": TABLES["vocab"]["api_attrs"], "params": TABLES["vocab"]["api_params"],
    "strings": TABLES["vocab"]["strings"],
    "mutators": [n for n in TABLES["vocab"]["api"] if n not in NON_MUTATORS],
    "areas": ["cell", "row", "column", "diagonal", "block", "ring", "core", "everything", "best_line"],
}
GRIDLAB_PRELUDE = '''
import json as _J
_COLOURS = %r
def __decode(w):
    return w
def __encode_calls(calls):
    return _J.dumps([[c["__m"], {k: v for k, v in c.items() if k != "__m"}] for c in calls], separators=(",", ":"))
def _c(x):
    if isinstance(x, str):
        return _COLOURS.index(x)
    if isinstance(x, int) and not isinstance(x, bool) and 0 <= x < len(_COLOURS):
        return x
    raise ValueError(x)
def _area(a):
    if not (isinstance(a, tuple) and len(a) == 2 and isinstance(a[0], str)):
        raise ValueError(a)
    return {"kind": a[0], "region": a[1]}
def row(i):
    return ("line", (0, i))
def column(j):
    return ("line", (1, j))
def cell(r, c):
    return ("cell", (r, c))
everything = ("all", ())
core = ("core", ())
best_line = ("line*", ())
def move(mutator, **fields):
    return {"__m": mutator, **fields}
def paint(area, colour):
    return {"__m": "paint", **_area(area), "colour": _c(colour)}
def paint_row(i, colour):
    return paint(row(i), colour)
def write(area, symbol):
    return {"__m": "write", **_area(area), "symbol": symbol}
''' % (COLOURS,)
for _c in COLOURS:
    GRIDLAB_PRELUDE += f"{_c} = {_c!r}\n"
GRIDLAB = {**INTS, "prelude": {**INTS["prelude"], "key": "gridlab-vocab", "python": GRIDLAB_PRELUDE,
                               "pricing": {"python": GRIDLAB_VOCAB}}}
LITERAL = {"one_paint", "same_move_raw", "same_move_area", "renamed"}
PAINT_ROW_2_RED = ["paint", {"colour": 0, "kind": "line", "region": [0, 2]}]
FLAG_TRUE = -math.log2(1 / 8)


class AstBitsVectorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runner = Runner()

    def inspect(self, source, scheme):
        return self.runner.run({**request("inspect", source, settings=GRIDLAB), "pricingScheme": scheme})

    def test_programs(self):
        self.assertEqual(len(VECTORS["programs"]), 17)
        for scheme in ("corpus", "uniform"):
            for name, vector in VECTORS["programs"].items():
                with self.subTest(scheme=scheme, program=name):
                    got = self.inspect(vector["source"], scheme)
                    want = vector[scheme]
                    for part in ("structure", "names", "literals"):
                        self.assertAlmostEqual(got["parts"][part], want[part], delta=1e-5, msg=part)
                    self.assertEqual(got["astBytes"], vector["ast_bytes"])
                    if name in LITERAL:
                        self.assertEqual(got["literalMoves"], [PAINT_ROW_2_RED])
                        self.assertAlmostEqual(got["parts"]["moveFlags"], 0.0, delta=1e-12)
                        # grid-lab's moves = flag + log2(#available) + D: the host's part.
                        self.assertGreater(want["moves"], FLAG_TRUE)
                    else:
                        self.assertEqual(got["literalMoves"], [])
                        self.assertAlmostEqual(got["parts"]["moveFlags"], want["moves"], delta=1e-5)
                        self.assertAlmostEqual(got["cost"], want["total"], delta=1e-5)

    def test_one_price_for_every_spelling(self):
        costs = {self.inspect(VECTORS["programs"][n]["source"], "corpus")["cost"] for n in LITERAL}
        self.assertEqual(len({round(c, 9) for c in costs}), 1)

    def test_literal_move_fallback_is_the_generic_code(self):
        # A user function called `paint` is not a mutator, so the call is coded generically.
        got = self.inspect("def paint(a, c):\n    return []\ndef agent(grid):\n    return [paint_row(2, 'red')]\n", "corpus")
        self.assertEqual(len(got["literalMoves"]), 1)
        shadowed = self.inspect("def paint_row(a, c):\n    return []\ndef agent(grid):\n    return [paint_row(2, 'red')]\n", "corpus")
        self.assertEqual(shadowed["literalMoves"], [])
        self.assertGreater(shadowed["parts"]["moveFlags"], 0)
        # Invalid literal arguments: the constructor raises, so it is not a literal move.
        self.assertEqual(self.inspect("def agent(grid):\n    return [paint_row(2, 'mauve')]\n", "corpus")["literalMoves"], [])
        one = self.inspect(VECTORS["programs"]["one_paint"]["source"], "corpus")
        fallback = one["literalMoveFallbackBits"][0]
        self.assertGreater(fallback, -math.log2(7 / 8))

    def test_renaming_never_changes_the_price(self):
        a = self.inspect("def agent(grid):\n    best = max(grid.cells)\n    return [best]\n", "corpus")
        b = self.inspect("def agent(g):\n    zz = max(g.cells)\n    return [zz]\n", "corpus")
        self.assertAlmostEqual(a["cost"], b["cost"], delta=1e-12)

    def test_codes(self):
        import astbits_guest as ab
        for n, bits in VECTORS["codes"]["gamma"].items():
            self.assertEqual(ab.gamma_bits(int(n)), bits)
        for s, bits in VECTORS["codes"]["string"].items():
            self.assertAlmostEqual(ab.string_bits(s), bits, delta=1e-9)


if __name__ == "__main__":
    unittest.main()
