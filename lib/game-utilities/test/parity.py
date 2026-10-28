"""Python cards vs the TypeScript host evaluator: identical ordinals on identical objects.

    python3 lib/game-utilities/test/parity.py

Builds test/fixtures/cards.json with the node fixture script (every family × a covering set of instantiations ×
3 draws, on spawned, structured and exemplar objects), then runs every Python card with its instantiation's
generated Python prelude and requires exactly the ordinals the host computed (ints and tuples of ints, no bools).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.dirname(HERE)


def build(mode: str, out: str) -> None:
    subprocess.run(["node", "--experimental-strip-types", "--no-warnings", os.path.join(HERE, "fixtures.ts"), mode, out],
                   cwd=PKG, check=True)


def as_ordinal(v, where):
    if isinstance(v, tuple):
        assert all(type(x) is int for x in v), f"{where}: tuple of non-ints {v!r}"
        return list(v)
    assert type(v) is int, f"{where}: returned {type(v).__name__} {v!r}"
    return v


def main() -> int:
    t0 = time.perf_counter()
    path = os.path.join(HERE, "fixtures", "cards.json")
    build("cards", path)
    data = json.load(open(path))
    compiled = {}
    failures, checked, values = [], 0, 0
    families = set()
    for case in data["cases"]:
        where = f"{case['family']} {case['key']} {json.dumps(case['params'])}"
        try:
            prelude = compiled.get(case["key"])
            if prelude is None:
                prelude = compiled[case["key"]] = compile(data["preludes"][case["key"]], f"<prelude {case['key']}>", "exec")
            scope = {"__name__": "card"}
            exec(prelude, scope)
            exec(compile(case["source"], "<card>", "exec"), scope)
            fn, decode = scope[case["entry"]], scope["__decode"]
            for wire, want in zip(case["wires"], case["ordinals"]):
                got = as_ordinal(fn(decode(wire)), where)
                if got != want:
                    raise AssertionError(f"{where}: python {got!r} != host {want!r} on {wire!r}\n{case['source']}")
                values += 1
            checked += 1
            families.add(case["family"])
        except Exception as ex:  # noqa: BLE001
            failures.append(f"{where}: {type(ex).__name__}: {ex}")
    for f in failures[:10]:
        print("FAIL", f)
    print(f"{checked}/{len(data['cases'])} cards ({len(families)} families, {values} values) match the host evaluator "
          f"in {time.perf_counter() - t0:.1f}s")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
