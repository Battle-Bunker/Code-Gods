"""Executable supported-module inventory, run against the actual WASI guest."""
from runner import Runner
from fixture import INTS, STRINGS, request
import json

# (body of agent(x), input, expected k of the single add call)
WORKLOADS = {
    "math": ("__import__('math').isqrt(x)", 81, 9),
    "itertools": ("sum(__import__('itertools').islice(__import__('itertools').count(), x))", 5, 10),
    "functools": ("__import__('functools').reduce(lambda a,b:a+b, range(x))", 5, 10),
    "collections": ("__import__('collections').Counter(x)['a']", "banana", 3),
    "re": ("__import__('re').sub('[0-9]', '', x)", "a1b2", "ab"),
    "json": ("__import__('json').loads(x)['a']", '{"a":"b"}', "b"),
    "decimal": ("int(__import__('decimal').Decimal(x).sqrt())", 81, 9),
    "fractions": ("int(__import__('fractions').Fraction(x, 3))", 9, 3),
    "statistics": ("int(__import__('statistics').mean([x, x+2]))", 2, 3),
    "hashlib": ("__import__('hashlib').sha256(x.encode()).hexdigest()", "", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"),
}

if __name__ == "__main__":
    runner = Runner()
    for module, (body, value, expected) in WORKLOADS.items():
        source = f"def agent(x):\n    return [add({body})]\n"
        settings = INTS if type(value) is int else STRINGS
        try:
            result = runner.run(request("act", source, value, settings))
            assert json.loads(result["calls"]) == [["add", {"k": expected}]], result
            print(json.dumps({"module": module, "supported": True}))
        except Exception as error:
            print(json.dumps({"module": module, "supported": False, "error": str(error)[-300:]}))
