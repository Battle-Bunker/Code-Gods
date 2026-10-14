"""Executable supported-module inventory, run against the actual WASI guest."""
from runner import Runner
import json

WORKLOADS = {
    "math": ("lambda x: __import__('math').isqrt(x)", 81, 9),
    "itertools": ("lambda x: sum(__import__('itertools').islice(__import__('itertools').count(), x))", 5, 10),
    "functools": ("lambda x: __import__('functools').reduce(lambda a,b:a+b, range(x))", 5, 10),
    "collections": ("lambda x: __import__('collections').Counter(x)['a']", "banana", 3),
    "re": ("lambda x: __import__('re').sub('[0-9]', '', x)", "a1b2", "ab"),
    "json": ("lambda x: __import__('json').loads(x)['a']", '{"a":"b"}', "b"),
    "decimal": ("lambda x: int(__import__('decimal').Decimal(x).sqrt())", 81, 9),
    "fractions": ("lambda x: int(__import__('fractions').Fraction(x, 3))", 9, 3),
    "statistics": ("lambda x: int(__import__('statistics').mean([x, x+2]))", 2, 3),
    "hashlib": ("lambda x: __import__('hashlib').sha256(x.encode()).hexdigest()", "", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"),
}

if __name__ == "__main__":
    runner = Runner()
    for module, (source, value, expected) in WORKLOADS.items():
        # Preserve T-to-T for the collections example.
        if module == "collections":
            source = "lambda x: str(__import__('collections').Counter(x)['a'])"
            expected = "3"
        try:
            result = runner.run({"mode": "execute", "source": source, "input": value})
            assert result == {"value": expected}, result
            print(json.dumps({"module": module, "supported": True}))
        except Exception as error:
            print(json.dumps({"module": module, "supported": False, "error": str(error)[-300:]}))
