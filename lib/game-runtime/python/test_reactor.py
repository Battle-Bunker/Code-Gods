"""Warm reactor isolation, capability and budget regression checks."""
import time
import unittest
import wasmtime
from runner import Runner
from reactor import immutable_table


class ReactorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runner = Runner()

    def run_code(self, source, value=1, **kwargs):
        return self.runner.run({"mode": "execute", "source": source, "input": value}, **kwargs)["value"]

    def test_identity_default_five_ms(self):
        for _ in range(30):
            self.assertEqual(self.run_code("lambda x: x"), 1)

    def test_real_time_and_entropy(self):
        now = self.run_code("lambda x: int(__import__('time').time())")
        self.assertLess(abs(now - time.time()), 5)
        values = {self.run_code("lambda x: __import__('random').randrange(2147483647)") for _ in range(8)}
        self.assertGreater(len(values), 1)
        values = {self.run_code("lambda x: int.from_bytes(__import__('os').urandom(3))") for _ in range(8)}
        self.assertGreater(len(values), 1)

    def test_user_initialization_is_budgeted(self):
        for source in ("(sum(iter(lambda: 1, 0)), lambda x: x)[1]",
                       "lambda x: sum(iter(lambda: 1, 0))"):
            with self.assertRaises(wasmtime.Trap):
                self.run_code(source)
            self.assertEqual(self.run_code("lambda x: x"), 1)

    def test_no_guest_files_or_external_io(self):
        for source in (
            "lambda x: open('/etc/passwd').read()",
            "lambda x: open('/lib/python3.15/random.py').read()",
            "lambda x: open('/tmp/owned', 'w').write('bad')",
            "lambda x: __import__('os').write(1, b'forged')",
            "lambda x: __import__('os').read(0, 1)",
            "lambda x: __import__('os').listdir('/lib')",
            "lambda x: __import__('socket').socket()",
            "lambda x: __import__('os').system('true')",
            "lambda x: __import__('time').sleep(1)",
        ):
            with self.subTest(source=source), self.assertRaises(Exception):
                self.run_code(source)

    def test_same_source_snapshot_resets_modules_and_builtins(self):
        source = ("lambda x: (setattr(__import__('builtins'), '_poison', "
                  "getattr(__import__('builtins'), '_poison', 0)+1), "
                  "__import__('builtins')._poison)[1]")
        for _ in range(5):
            self.assertEqual(self.run_code(source), 1)
        source = ("lambda x: (setattr(__import__('math'), '_poison', "
                  "getattr(__import__('math'), '_poison', 0)+1), "
                  "__import__('math')._poison)[1]")
        for _ in range(5):
            self.assertEqual(self.run_code(source), 1)

    def test_cross_agent_poisoning(self):
        self.run_code("lambda x: (setattr(__import__('builtins'), 'len', lambda x: 999), x)[1]")
        self.assertEqual(self.run_code("lambda x: len('abc')"), 3)
        self.run_code("lambda x: (__import__('sys').modules.clear(), x)[1]")
        self.assertEqual(self.run_code("lambda x: __import__('math').isqrt(81)"), 9)

    def test_varied_cached_agents_have_pristine_globals(self):
        sources = [f"lambda x: x + {i}" for i in range(8)]
        for source in sources:
            self.runner.run({"mode": "inspect", "source": source, "input": 1})
        for _ in range(3):
            self.run_code("lambda x: (setattr(__import__('builtins'), '_poison', 99), x)[1]")
            for i, source in enumerate(sources):
                self.assertEqual(self.run_code(source), i+1)
            self.assertEqual(self.run_code(
                "lambda x: getattr(__import__('builtins'), '_poison', 0)"), 0)
        self.assertGreaterEqual(len(self.runner.cache), 8)
        for blob, cost, size in self.runner.cache.values():
            self.assertIsInstance(blob, bytes)
            self.assertLess(len(blob), 1024*1024)
            self.assertGreaterEqual(cost, 0)

    def test_compiled_cache_lru_is_bounded(self):
        for i in range(132):
            self.runner.run({"mode": "inspect", "source": f"lambda x: x + {i + 1000}"})
        self.assertLessEqual(len(self.runner.cache), 128)
        self.assertLessEqual(self.runner.cache_bytes, 4*1024*1024)
        self.assertEqual(self.runner.cache_bytes, sum(item[2] for item in self.runner.cache.values()))
        self.assertEqual(self.run_code("lambda x: x"), 1)

    def test_return_hooks_are_never_invoked(self):
        for source in (
            "lambda x: type('int', (), {'__int__': lambda self: sum(iter(lambda: 1, 0))})()",
            "lambda x: type('str', (str,), {'__str__': lambda self: sum(iter(lambda: 1, 0))})('bad')",
            "lambda x: True",
        ):
            with self.assertRaises(ValueError):
                self.run_code(source)
        self.assertEqual(self.run_code("lambda x: x"), 1)

    def test_growth_or_oom_does_not_poison_next_call(self):
        try:
            self.run_code("lambda x: (bytearray(70000000), x)[1]")
        except (ValueError, wasmtime.Trap):
            pass
        self.assertEqual(self.run_code("lambda x: x"), 1)

    def test_table_mutation_decoder_fails_closed(self):
        for instruction in (b"\x26\x00", b"\xfc\x0f\x00", b"\xfc\x0c\x00\x00"):
            body = b"\0" + instruction + b"\x0b"
            with self.assertRaises(ValueError):
                immutable_table(b"\x01" + bytes([len(body)]) + body)

    def test_phase_is_after_preparation_and_not_inspection(self):
        phases = []
        self.run_code("lambda x: x", on_execute=lambda: phases.append("execute"))
        self.runner.run({"mode": "inspect", "source": "lambda x: x"},
                        on_execute=lambda: phases.append("wrong"))
        self.assertEqual(phases, ["execute"])

    def test_ast_price_is_unchanged_and_does_not_evaluate(self):
        self.assertEqual(self.runner.run({"mode": "inspect", "source": "lambda x: x"})["cost"], 6)
        result = self.runner.run({"mode": "inspect",
                                  "source": "(__import__('sys').exit(42), lambda x: x)[1]"})
        self.assertGreater(result["cost"], 0)


if __name__ == "__main__":
    unittest.main()
