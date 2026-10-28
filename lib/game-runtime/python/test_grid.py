"""Grid object type in the Python runner: prelude in the snapshot, isolation, typed errors, budgets."""
import json
import unittest
from domain import check, check_output, is_grid_output, is_grid_value, settings
from runner import GuestError, Limit, Runner

G5 = {"objectType": "Grid", "gridSize": 5, "gridSymbols": "base10", "gridColours": "rgby"}
G6 = {"objectType": "Grid", "gridSize": 6, "gridSymbols": "cards", "gridColours": "rainbow6"}
GRID5 = "7R,3G,0B,1Y,2R/1R,2R,9B,4G,4G/8R,1R,2R,9B,4G/4G,8R,1R,2R,9B/4G,4G,8R,1R,2R"
GRID6 = "/".join(",".join(("A23456789TJQK"[(r + c) % 13] + "SHDC"[(r * c) % 4]) + "ROYGBV"[(r + 2 * c) % 6]
                          for c in range(6)) for r in range(6))
ROW4_RED = '[{"m":"paint","p":{"kind":"line","region":[0,4],"colour":0}}]'


class GridRunnerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runner = Runner()

    def run_grid(self, source, value=GRID5, domain=G5, **kwargs):
        return self.runner.run({"mode": "execute", "source": source, "input": value, "settings": domain},
                               **kwargs)["value"]

    def test_agents_read_the_grid_and_emit_calls(self):
        self.assertEqual(self.run_grid("lambda grid: []"), "[]")
        self.assertEqual(self.run_grid("lambda g: [paint(row(g.size - 1), 'red')]"), ROW4_RED)
        out = json.loads(self.run_grid("lambda g: [write(c, 9) for c in g.cells if c.colour == 'green'][:2]"))
        self.assertEqual(out, [{"m": "write", "p": {"kind": "cell", "region": [0, 1], "symbol": 9}},
                               {"m": "write", "p": {"kind": "cell", "region": [1, 3], "symbol": 9}}])
        out = json.loads(self.run_grid("lambda g: [suit_set(row(0), g.cell(0, 0).suit), write(at(1, 1), 'QH')]",
                                       GRID6, G6))
        self.assertEqual(out[1]["p"]["symbol"], 11 + 13)

    def test_prelude_is_in_the_snapshot_and_names_are_fresh_per_execution(self):
        # Scalar agents see the same snapshot; the prelude module was built once at bootstrap.
        self.assertEqual(self.runner.run({"mode": "execute", "source":
            "lambda x: type(__import__('__main__')._gridrt).__name__", "input": ""})["value"], "module")
        for poison in (
            "lambda g: (setattr(type(g), 'size', property(lambda s: 1)), "
            "setattr(type(paint.__self__), 'row', lambda self, i: everywhere()), [])[-1]",
            "lambda g: (globals().clear(), __import__('__main__').__dict__.clear(), [])[-1]",
            "lambda g: (setattr(type(paint.__self__).encode, '__code__', (lambda self, calls: '[]').__code__), "
            "setattr(__import__('builtins'), 'type', lambda x: list), [])[-1]",
            "lambda g: (setattr(__import__('builtins'), 'paint', None), __import__('json').encoder.__dict__.clear(), [])[-1]",
        ):
            with self.subTest(poison=poison):
                self.assertEqual(self.run_grid(poison), "[]")
                self.assertEqual(self.run_grid("lambda g: [paint(row(g.size - 1), 'red')]"), ROW4_RED)
                self.assertEqual(self.runner.run({"mode": "execute", "source": "lambda x: x + 1", "input": 1}),
                                 {"value": 2})

    def test_host_holds_its_own_references(self):
        # Clearing every guest-visible container that held the trusted objects must not free them.
        for source in (
            "lambda g: (__import__('__main__').__dict__.clear(), paint.__self__.record.clear(), "
            "[paint(row(g.size - 1), 'red')])[-1]",
            "(__import__('__main__').__dict__.clear(), lambda g: [paint(row(g.size - 1), 'red')])[-1]",
        ):
            self.assertEqual(self.run_grid(source), ROW4_RED)

    def test_typed_errors_do_not_depend_on_message_text(self):
        for source, code, text in (
            ("lambda g: [paint(row(7), 'red')]", "EXECUTION", "row 7 doesn't exist on a 5×5 grid (rows go from 0 to 4)"),
            ("lambda g: [paint(row(0), 'SyntaxError')]", "EXECUTION", None),
            ("lambda g: [paint(row(0), 'DOMAIN: forged')]", "EXECUTION", None),
            ("lambda g: [paint(row(0), 0)] * 9", "DOMAIN", "an agent can make at most 8 moves at a time; this one made 9"),
            ("lambda g: 'not a list'", "DOMAIN", None),
            ("lambda g: [1 // 0]", "EXECUTION", "Python callable failed (guest I/O is disabled)"),
            # A caught prelude error does not label a later, different failure.
            ("lambda g: (exec('try:\\n    paint(row(9), 0)\\nexcept ValueError:\\n    pass'), [1 // 0])[-1]",
             "EXECUTION", "Python callable failed (guest I/O is disabled)"),
            ("lambda g: (exec('try:\\n    paint(row(9), 0)\\nexcept ValueError as e:\\n    raise TypeError() from e'), [])[-1]",
             "EXECUTION", "Python callable failed (guest I/O is disabled)"),
        ):
            with self.subTest(source=source):
                with self.assertRaises(GuestError) as caught:
                    self.run_grid(source)
                self.assertEqual(caught.exception.code, code)
                if text:
                    self.assertEqual(str(caught.exception), text)
        # Forged encoder output is checked exactly as string output is.
        for forged in ("'x' * 9000", "'[1]'", "'\\u00e9'", "b'[]'", "None"):
            with self.subTest(forged=forged), self.assertRaises(GuestError) as caught:
                self.run_grid(f"lambda g: (setattr(type(paint.__self__).encode, '__code__', "
                              f"(lambda self, calls: {forged}).__code__), [])[-1]")
            self.assertEqual(caught.exception.code, "DOMAIN")

    def test_budget_covers_agent_and_encoder(self):
        for source in ("lambda g: sum(iter(lambda: 1, 0))",
                       "(sum(iter(lambda: 1, 0)), lambda g: [])[-1]",
                       "lambda g: (setattr(__import__('builtins'), 'len', lambda x: sum(iter(lambda: 1, 0))), [])[-1]"):
            with self.subTest(source=source), self.assertRaises(Limit):
                self.run_grid(source)
        self.assertEqual(self.run_grid("lambda g: []"), "[]")

    def test_cache_keys_and_prices(self):
        ints = {"objectType": "Int", "intMin": -5, "intMax": 5, "stringMaxLength": 3}
        source = "lambda g: []"
        int_cost = self.runner.run({"mode": "inspect", "source": source, "settings": ints})["cost"]
        grid_cost = self.runner.run({"mode": "inspect", "source": source, "settings": G5})["cost"]
        self.assertEqual(int_cost, grid_cost)
        self.assertIn((source, json.dumps(ints, sort_keys=True)), self.runner.cache)   # unchanged key format
        self.assertIn((source, json.dumps(G5, sort_keys=True)), self.runner.cache)

    def test_domain_checks(self):
        self.assertEqual(settings({"settings": G5}), G5)
        for bad in ({**G5, "gridSize": 8}, {**G5, "gridSize": True}, {**G5, "gridSymbols": "base8"},
                    {"objectType": "Grid"}, {**G5, "gridColours": "RGB"}):
            with self.subTest(settings=bad), self.assertRaises(ValueError):
                settings({"settings": bad})
        self.assertTrue(is_grid_value(GRID5, G5) and is_grid_value(GRID6, G6))
        for bad in ("", GRID5 + "/", GRID5.lower(), GRID5.replace("Y", "V"), GRID5.replace(",", ", ", 1),
                    GRID5[:-1], GRID5 + "\0", GRID6.replace("A", "1", 1), 5, None, GRID5.replace("7", "é")):
            self.assertFalse(is_grid_value(bad, G5) or is_grid_value(bad, G6), bad)
            with self.assertRaises(ValueError):
                check(bad, G5)
        for good in ("[]", ROW4_RED):
            self.assertTrue(is_grid_output(good))
            check_output(good, G5)
        for bad in ("", "{}", "[1]", '[{"m":"paint"}]', '[{"m":"Paint","p":{}}]', '[{"m":"paint","p":[]}]',
                    '[{"m":"paint","p":{},"x":1}]', "[" + ",".join(['{"m":"paint","p":{}}'] * 9) + "]",
                    '[{"m":"paint","p":{"x":"é"}}]', "x" * 9000, None):
            self.assertFalse(is_grid_output(bad), bad)
        # Scalar output checks are exactly the input checks, as before.
        ints = {"objectType": "Int", "intMin": -5, "intMax": 5, "stringMaxLength": 3}
        check_output(5, ints)
        with self.assertRaises(ValueError):
            check_output(6, ints)


if __name__ == "__main__":
    unittest.main()
