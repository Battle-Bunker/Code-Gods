"""The deterministic sandbox (docs/open-agents.md §1.3, §3.5): virtual clock, seeded random, steps."""
import json
import unittest
from runner import Runner
from domain import Config, Limit
from fixture import INTS, agent, request

EPOCH_US = 1_767_225_600 * 10**6


class SandboxTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runner = Runner()

    def act(self, source, seed="1", settings=INTS, value=1):
        return self.runner.run(request("act", source, value, settings, seed))

    def ks(self, source, seed="1"):
        return [p["k"] for _, p in json.loads(self.act(source, seed)["calls"])]

    def test_virtual_clock(self):
        src = agent("[add(int(t.time() * 1e6) - %d) for t in [__import__('time')] * 3]" % EPOCH_US)
        self.assertEqual(self.ks(src), [1, 2, 3])
        self.assertEqual(self.ks(src), [1, 2, 3], "the clock restarts every act")
        both = agent("[add(__import__('time').time_ns() - %d), add(__import__('time').monotonic_ns() - %d)]"
                     % (EPOCH_US * 1000, EPOCH_US * 1000))
        self.assertEqual(self.ks(both), [1000, 2000])
        with self.assertRaises(Exception):
            self.act(agent("[add(__import__('time').sleep(0.1))]"))

    def test_seeded_random(self):
        src = agent("[add(__import__('random').getrandbits(30)) for _ in range(3)]")
        a, b, c = self.ks(src, "42"), self.ks(src, "42"), self.ks(src, "0x2a")
        self.assertEqual(a, b)
        self.assertEqual(a, c)
        import random
        rng = random.Random(42)
        self.assertEqual(a, [rng.getrandbits(30) for _ in range(3)], "random is Random(seed)")
        self.assertNotEqual(self.ks(src, "43"), a)
        # Random() and seed() with no argument draw from the same stream: deterministic too.
        fresh = agent("[add(__import__('random').Random().getrandbits(20))]")
        self.assertEqual(self.ks(fresh, "7"), self.ks(fresh, "7"))
        reseed = "import random\nrandom.seed()\ndef agent(x):\n    return [add(random.getrandbits(20))]\n"
        self.assertEqual(self.ks(reseed, "7"), self.ks(reseed, "7"))
        with self.assertRaisesRegex(Exception, "SystemRandom"):
            self.act(agent("[add(__import__('random').SystemRandom().random())]"))
        for bad in (None, "", "-1", "18446744073709551616", "0x1ffffffffffffffff", "1.5", "abc"):
            with self.subTest(seed=bad), self.assertRaises(Config):
                self.act(agent("[]"), seed=bad)
        self.act(agent("[]"), seed="18446744073709551615")

    def test_used_random(self):
        self.assertFalse(self.act(agent("[add(x)]"))["usedRandom"])
        self.assertTrue(self.act(agent("[add(__import__('random').randrange(9))]"))["usedRandom"])
        self.assertTrue(self.act(agent("[add(__import__('random').Random().randrange(9))]"))["usedRandom"])
        # Entropy read past the proxies is deterministic and still reported.
        escape = agent("[add(int.from_bytes(len.__self__.__import__('os').urandom(4)))]")
        first = self.act(escape, "5")
        self.assertTrue(first["usedRandom"])
        self.assertEqual(first["calls"], self.act(escape, "5")["calls"])
        self.assertNotEqual(first["calls"], self.act(escape, "6")["calls"])
        # Constructing a module-level generator at import time is use too.
        self.assertTrue(self.act("import random\nR = random.random()\ndef agent(x):\n    return []")["usedRandom"])

    def test_read_only_modules(self):
        for src in ("import math\nmath.memo = 1\ndef agent(x):\n    return []",
                    "import math\ndel math.pi\ndef agent(x):\n    return []",
                    agent("[add(__import__('math')._ns)]")):
            with self.subTest(src=src), self.assertRaises(Exception):
                self.act(src)
        self.assertEqual(self.ks(agent("[add(__import__('decimal').getcontext().prec)]")), [28])
        self.act("import decimal\ndecimal.getcontext().prec = 5\ndef agent(x):\n    return []")
        self.assertEqual(self.ks(agent("[add(__import__('decimal').getcontext().prec)]")), [28])
        for src in (agent("[add(len(__import__('os').environ))]"), agent("[add(eval('1'))]"),
                    agent("[add(id(x))]"), agent("[add(open)]")):
            with self.subTest(src=src), self.assertRaises(Exception):
                self.act(src)
        # The preloaded modules work behind their proxies.
        self.assertEqual(self.ks("from collections import Counter\nfrom math import *\nimport collections.abc\n"
                                 "def agent(x):\n    return [add(Counter('aab')['a'] + isqrt(9))]\n"), [5])

    def test_step_budget(self):
        loop = "def agent(x):\n    s = 0\n    for i in range(%d):\n        s += i\n    return [add(s)]\n"
        steps = self.act(loop % 1000)["steps"]
        self.assertEqual(steps, self.act(loop % 1000)["steps"], "steps are deterministic")
        self.assertGreater(steps, 2000)
        small = {**INTS, "stepBudget": 1000, "interactionComputeMs": 1000}
        with self.assertRaisesRegex(Limit, "Step limit exceeded"):
            self.act(loop % 1000, settings=small)
        self.assertEqual(self.act(loop % 100, settings=small)["calls"], '[["add",{"k":4950}]]')
        # `except BaseException` cannot swallow the limit: it keeps raising at every later step.
        swallow = ("def agent(x):\n    try:\n        while True:\n            pass\n"
                   "    except BaseException:\n        return [add(1)]\n")
        with self.assertRaisesRegex(Limit, "Step limit"):
            self.act(swallow, settings=small)
        for bad in (0, 10_000_001, 1.5):
            with self.subTest(bad=bad), self.assertRaises(Config):
                self.act(agent("[]"), settings={**INTS, "stepBudget": bad})

    def test_same_seed_same_everything(self):
        src = ("import random, time\nfrom collections import Counter\n"
               "def agent(x):\n    r = random.random()\n    return [add(int(r * 1e9)), add(int(time.perf_counter_ns())),"
               " add(len(repr(object())))]\n")
        self.assertEqual(self.act(src, "99"), self.act(src, "99"))


if __name__ == "__main__":
    unittest.main()
