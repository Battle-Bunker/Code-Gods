"""The test fixture prelude (test/fixture-prelude.json), shared with the Node tests."""
import json
import pathlib

FIXTURE = json.loads((pathlib.Path(__file__).resolve().parents[1] / "test" / "fixture-prelude.json").read_text())
INTS = {**FIXTURE, "interactionComputeMs": 5}
STRINGS = {**INTS, "objectType": "string", "wireMaxLength": 256}


def request(mode, source, value=1, settings=INTS):
    return {"mode": mode, "source": source, "input": value, "settings": settings}


def agent(body):
    """A one-expression agent: def agent(x): return <body>."""
    return f"def agent(x):\n    return {body}\n"
