import json
import unittest
from runner import Runner
from domain import Compile, Config, Domain, Execution
from fixture import INTS, STRINGS, agent, request


class RunnerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runner = Runner()

    def act(self, source, value=1, settings=INTS, **kwargs):
        return self.runner.run(request("act", source, value, settings), **kwargs)["calls"]

    def test_calls_and_standard_library(self):
        self.assertEqual(self.act(agent("[add(__import__('math').isqrt(x))]"), 81), '[["add",{"k":9}]]')
        self.assertEqual(self.act(agent("[add(len(x[::-1]))]"), "abc", STRINGS), '[["add",{"k":3}]]')
        module = ("import math\nSTEP = 2\n\ndef helper(n):\n    return n * STEP\n\n"
                  "class Box:\n    pass\n\ndef agent(grid):\n    return [add(helper(grid)), add(math.isqrt(16))]\n")
        self.assertEqual(json.loads(self.act(module, 5)), [["add", {"k": 10}], ["add", {"k": 4}]])
        self.assertEqual(self.act(agent("[]")), "[]")

    def test_large_safe_integer_input(self):
        self.assertEqual(self.act(agent("[add(x)]"), 2**53 - 1), f'[["add",{{"k":{2**53 - 1}}}]]')
        for bad in (2**53, True, 1.5, "é", "a" * 257):
            with self.subTest(bad=bad), self.assertRaises(Domain):
                self.act(agent("[]"), bad, STRINGS)

    def test_inspect_does_not_execute_and_prices_user_source_only(self):
        self.assertEqual(self.runner.run(request("inspect", "def agent(x):\n    return x"))["cost"], 7)
        self.assertGreater(self.runner.run(request(
            "inspect", "import sys\nsys.exit(42)\ndef agent(x):\n    return []"))["cost"], 0)
        bigger = {**INTS, "prelude": {**INTS["prelude"], "python": INTS["prelude"]["python"] + "\nZ = 1\n",
                                      "key": "other"}}
        self.assertEqual(self.runner.run(request("inspect", "def agent(x):\n    return x", settings=bigger))["cost"], 7)

    def test_grammar(self):
        for source, message in (
            ("lambda x: x", "named agent"),
            ("def agentx(x):\n    return []", "named agent"),
            ("def f():\n    def agent(x):\n        return []", "named agent"),
            ("async def agent(x):\n    return []", "async"),
            ("def agent():\n    return []", "exactly one argument"),
            ("def agent(a, b):\n    return []", "exactly one argument"),
            ("def agent(x, *, k):\n    return []", "exactly one argument"),
            ("def agent(x):\n    return []\ndef agent(x):\n    return []", "more than once"),
            ("def agent(x):\n    return [add(x)", "line 2"),
        ):
            with self.subTest(source=source), self.assertRaisesRegex(Compile, message):
                self.runner.run(request("inspect", source))
        for source in ("def agent(x, y=1):\n    return []", "def agent(*args):\n    return []"):
            self.runner.run(request("inspect", source))

    def test_runtime_errors_are_explained(self):
        with self.assertRaisesRegex(Execution, r"ZeroDivisionError: division by zero \(line 2\)"):
            self.act("def agent(x):\n    return [add(x // 0)]")
        with self.assertRaisesRegex(Execution, "module raised"):
            self.act("raise ValueError('top')\ndef agent(x):\n    return []")
        with self.assertRaisesRegex(Execution, "no longer defines agent"):
            self.act("def agent(x):\n    return []\ndel agent")

    def test_no_host_files(self):
        with self.assertRaises(Execution):
            self.act(agent("open('/etc/passwd').read()"))

    def test_no_environment(self):
        self.assertEqual(self.act(agent("[add(len(__import__('os').environ))]")), '[["add",{"k":1}]]')

    def test_stdio_cannot_forge_output(self):
        with self.assertRaises(Execution):
            self.act(agent("""(print('[["add",{"k":0}]]'), [])[1]"""))

    def test_bad_settings_and_prelude(self):
        for settings in (
            {**INTS, "prelude": None},
            {**INTS, "wireMaxLength": 1025},
            {**INTS, "objectType": ""},
            {**INTS, "interactionComputeMs": 0},
            {**INTS, "prelude": {**INTS["prelude"], "key": ""}},
            {**INTS, "prelude": {**INTS["prelude"], "python": "x" * 65537}},
        ):
            with self.subTest(settings=settings), self.assertRaises(Config):
                self.runner.run(request("inspect", agent("[]"), settings=settings))
        for python, key in (("def __decode(:\n", "broken"), ("raise SystemExit(3)\n", "raising"),
                            ("def __decode(w):\n    return w\n", "no-encoder")):
            broken = {**INTS, "prelude": {**INTS["prelude"], "python": python, "key": key}}
            with self.subTest(python=python), self.assertRaises(Config):
                self.runner.run(request("act", agent("[]"), settings=broken))

    def test_limits(self):
        with self.assertRaises(Exception):
            self.runner.run(request("act", agent("sum(iter(lambda: 1, 0))")), seconds=1)


if __name__ == "__main__":
    unittest.main()
