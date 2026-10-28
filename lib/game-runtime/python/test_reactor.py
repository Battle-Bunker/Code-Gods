"""Warm reactor isolation, capability and budget regression checks."""
import json
import time
import unittest
from runner import Runner
from reactor import immutable_table
from domain import Domain, Execution, Limit
from fixture import INTS, agent, request


def value(calls):
    """The k of a single add call."""
    [[name, params]] = json.loads(calls)
    assert name == "add"
    return params["k"]


class ReactorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runner = Runner()

    def act(self, source, value=1, **kwargs):
        return self.runner.run(request("act", source, value), **kwargs)["calls"]

    def k(self, body, value=1):
        return globals()["value"](self.act(agent(f"[add({body})]"), value))

    def test_identity_default_five_ms(self):
        for _ in range(30):
            self.assertEqual(self.k("x"), 1)

    def test_real_time_and_entropy(self):
        self.assertLess(abs(self.k("int(__import__('time').time())") - time.time()), 5)
        values = {self.k("__import__('random').randrange(2147483647)") for _ in range(8)}
        self.assertGreater(len(values), 1)
        values = {self.k("int.from_bytes(__import__('os').urandom(3))") for _ in range(8)}
        self.assertGreater(len(values), 1)

    def test_user_module_is_budgeted(self):
        for source in ("sum(iter(lambda: 1, 0))\ndef agent(x):\n    return []",
                       agent("[add(sum(iter(lambda: 1, 0)))]")):
            with self.assertRaisesRegex(Limit, "5 ms compute budget"):
                self.act(source)
            self.assertEqual(self.k("x"), 1)

    def test_no_guest_files_or_external_io(self):
        for body in (
            "open('/etc/passwd').read()",
            "open('/lib/python3.15/random.py').read()",
            "open('/tmp/owned', 'w').write('bad')",
            "__import__('os').write(1, b'forged')",
            "__import__('os').read(0, 1)",
            "__import__('os').listdir('/lib')",
            "__import__('socket').socket()",
            "__import__('os').system('true')",
            "__import__('time').sleep(1)",
            "__import__('sys').exit(0)",
        ):
            with self.subTest(body=body), self.assertRaises((Execution, Limit)):
                self.act(agent(body))

    def test_snapshot_resets_modules_builtins_and_prelude(self):
        source = ("import builtins\nbuiltins._poison = getattr(builtins, '_poison', 0) + 1\n"
                  "def agent(x):\n    return [add(builtins._poison)]\n")
        for _ in range(5):
            self.assertEqual(value(self.act(source)), 1)
        source = ("import math\nmath._poison = getattr(math, '_poison', 0) + 1\n"
                  "def agent(x):\n    return [add(math._poison)]\n")
        for _ in range(5):
            self.assertEqual(value(self.act(source)), 1)
        # Poisoning the prelude's module-level state does not survive the act.
        self.act("_JSON.dumps = lambda *a, **k: 'poison'\ndef agent(x):\n    return []")
        self.assertEqual(self.k("x"), 1)

    def test_cross_agent_poisoning(self):
        self.act("import builtins\nbuiltins.len = lambda x: 999\ndef agent(x):\n    return []")
        self.assertEqual(self.k("len('abc')"), 3)
        self.act("import sys\nsys.modules.clear()\ndef agent(x):\n    return []")
        self.assertEqual(self.k("__import__('math').isqrt(81)"), 9)

    def test_varied_cached_agents_have_pristine_globals(self):
        sources = [agent(f"[add(x + {i})]") for i in range(8)]
        for source in sources:
            self.runner.run(request("inspect", source))
        for _ in range(3):
            self.act("import builtins\nbuiltins._poison = 99\nadd = None\ndef agent(x):\n    return []")
            for i, source in enumerate(sources):
                self.assertEqual(value(self.act(source)), i + 1)
            self.assertEqual(self.k("getattr(__import__('builtins'), '_poison', 0)"), 0)
        self.assertGreaterEqual(len(self.runner.cache), 9)
        for blob, cost, size in self.runner.cache.values():
            self.assertIsInstance(blob, bytes)
            self.assertLess(len(blob), 1024*1024)
            self.assertGreaterEqual(size, len(blob))

    def test_cache_key_includes_prelude(self):
        source = agent("[add(x)]")
        self.assertEqual(self.act(source, 4), '[["add",{"k":4}]]')
        doubled = {**INTS, "prelude": {**INTS["prelude"], "key": "doubled",
                                       "python": INTS["prelude"]["python"] + "\ndef __decode(w):\n    return 2 * w\n"}}
        self.assertEqual(self.runner.run(request("act", source, 4, doubled))["calls"], '[["add",{"k":8}]]')
        # Same key, different text: the worker's own digest still separates the entries.
        forged = {**doubled, "prelude": {**doubled["prelude"], "key": INTS["prelude"]["key"]}}
        self.assertEqual(self.runner.run(request("act", source, 4, forged))["calls"], '[["add",{"k":8}]]')
        self.assertEqual(self.act(source, 4), '[["add",{"k":4}]]')

    def test_compiled_cache_lru_is_bounded(self):
        for i in range(132):
            self.runner.run(request("inspect", agent(f"[add(x + {i + 1000})]")))
        self.assertLessEqual(len(self.runner.cache), 128)
        self.assertLessEqual(self.runner.cache_bytes, 4*1024*1024)
        self.assertEqual(self.runner.cache_bytes, sum(item[2] for item in self.runner.cache.values()))
        self.assertEqual(self.k("x"), 1)

    def test_monkeypatched_encoder_only_produces_a_string(self):
        # The guest may replace the encoder or what it uses: the host parses the result.
        self.assertEqual(self.act("def __encode_calls(c):\n    return 'not json'\ndef agent(x):\n    return []"),
                         "not json")
        self.assertEqual(self.act("_DUMPS = lambda *a, **k: '[[\"forged\",{}]]'\ndef agent(x):\n    return []"),
                         '[["forged",{}]]')

    def test_result_hooks_are_never_invoked(self):
        for body, error in (
            ("type('str', (str,), {'__str__': lambda self: sum(iter(lambda: 1, 0))})('[]')", Domain),
            ("type('int', (), {'__int__': lambda self: sum(iter(lambda: 1, 0))})()", Domain),
            ("b'[]'", Domain),
            ("None", Domain),
            ("'[\"é\"]'", Domain),
            ("'\\udc80'", Domain),
            ("'[' * 65537", Limit),
        ):
            source = f"def __encode_calls(c):\n    return {body}\ndef agent(x):\n    return []"
            with self.subTest(body=body), self.assertRaises(error):
                self.act(source)
        self.assertEqual(len(self.act("def __encode_calls(c):\n    return '[' * 65536\ndef agent(x):\n    return []")), 65536)
        self.assertEqual(self.k("x"), 1)

    def test_oversized_call_lists(self):
        with self.assertRaises(Limit):
            self.act(agent("[add('a' * 70000)]"))
        with self.assertRaises(Execution):
            self.act(agent("[{}]"))  # the fixture encoder raises on a malformed call

    def test_growth_or_oom_does_not_poison_next_call(self):
        with self.assertRaises((Execution, Limit)):
            self.act(agent("(bytearray(70000000), [])[1]"))
        self.assertEqual(self.k("x"), 1)

    def test_table_mutation_decoder_fails_closed(self):
        for instruction in (b"\x26\x00", b"\xfc\x0f\x00", b"\xfc\x0c\x00\x00"):
            body = b"\0" + instruction + b"\x0b"
            with self.assertRaises(ValueError):
                immutable_table(b"\x01" + bytes([len(body)]) + body)

    def test_phase_is_after_preparation_and_not_inspection(self):
        phases = []
        self.runner.run(request("act", agent("[]")), on_execute=lambda: phases.append("execute"))
        self.runner.run(request("inspect", agent("[]")), on_execute=lambda: phases.append("wrong"))
        self.assertEqual(phases, ["execute"])

    def test_prelude_and_decode_are_outside_the_budget(self):
        slow = {**INTS, "prelude": {**INTS["prelude"], "key": "slow",
                                    "python": INTS["prelude"]["python"]
                                    + "\n_TABLE = sum(range(3_000_000))\n"
                                    + "def __decode(w):\n    sum(range(3_000_000))\n    return w\n"}}
        self.assertEqual(self.runner.run(request("act", agent("[add(x)]"), 3, slow))["calls"], '[["add",{"k":3}]]')

    def test_ast_price_does_not_evaluate(self):
        self.assertEqual(self.runner.run(request("inspect", agent("x")))["cost"], 7)
        result = self.runner.run(request("inspect", "__import__('sys').exit(42)\ndef agent(x):\n    return x"))
        self.assertGreater(result["cost"], 0)


if __name__ == "__main__":
    unittest.main()
