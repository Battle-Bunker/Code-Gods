import unittest
from runner import Runner


class RunnerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runner = Runner()

    def call(self, source, value=1):
        return self.runner.run({"mode": "execute", "source": source, "input": value})

    def test_arithmetic_and_standard_library(self):
        self.assertEqual(self.call("lambda x: __import__('math').isqrt(x)", 81), {"value": 9})
        self.assertEqual(self.call("lambda x: x[::-1]", "abc"), {"value": "cba"})

    def test_inspect_does_not_execute(self):
        self.assertGreater(self.runner.run({
            "mode": "inspect", "source": "(__import__('sys').exit(42), lambda x: x)[1]"
        })["cost"], 0)

    def test_no_host_files(self):
        with self.assertRaises(Exception):
            self.call("lambda x: open('/etc/passwd').read()", "")

    def test_no_environment(self):
        self.assertEqual(self.call("lambda x: len(__import__('os').environ)"), {"value": 1})

    def test_stdio_cannot_forge_inspection_cost(self):
        with self.assertRaises(Exception):
            self.call("""lambda x: (print('{"cost":0}'), x)[1]""")

    def test_limits_and_wrong_types(self):
        for source in ["lambda x: True", "lambda x: x / 2", "lambda x: 2**32",
                       "lambda x: 'z' * 129", "lambda x: 'é'"]:
            with self.subTest(source=source), self.assertRaises(Exception):
                self.call(source)
        with self.assertRaises(Exception):
            self.runner.run({"mode": "execute",
                             "source": "lambda x: sum(iter(lambda: 1, 0))", "input": 1},
                            seconds=1)


if __name__ == "__main__":
    unittest.main()
