"""Build ast_bits_v1.json: the published grammar, vocabularies and corpus counts of ast-bits-v1.

    python3 -m gridlab.openagents.build_tables            # writes gridlab/openagents/ast_bits_v1.json

Corpus: every .py file of the running CPython standard library (excluding test suites, idlelib and
lib2to3 fixtures), parsed with `ast` and walked by the same walker that prices agents, in "count"
mode. The counts are frozen in the JSON; the price never re-reads the corpus. The table is versioned
with the code (VERSION) and must not change within a season.
"""
from __future__ import annotations

import ast
import importlib
import json
import sys
import sysconfig
from pathlib import Path

from .astbits import (TABLE_PATH, VERSION, Tables, Walker, allowed_builtins, api_attrs, api_params,
                      derive_grammar, externals)
from .sandbox import PRELOADED

TOP_ATTRS = 512
TOP_KWARGS = 256
SKIP_DIRS = ("test", "tests", "idlelib", "lib2to3", "site-packages", "dist-packages", "__pycache__", "turtledemo")


def modules() -> list:
    return sorted(set(PRELOADED) | {"collections.abc"})


def module_attrs() -> dict:
    out = {}
    for m in modules():
        mod = importlib.import_module(m)
        names = getattr(mod, "__all__", None) or [n for n in dir(mod) if not n.startswith("_")]
        out[m] = sorted(n for n in names if not n.startswith("_"))
    return out


def method_vocab() -> list:
    """Public attributes of the builtin types and of the public classes of the preloaded modules."""
    import builtins
    import inspect
    out = set()
    for t in (list, dict, str, set, frozenset, tuple, int, float, complex, bytes, bytearray, range, slice):
        out |= {n for n in dir(t) if not n.startswith("_")}
    for m in modules():
        mod = importlib.import_module(m)
        for n in dir(mod):
            x = getattr(mod, n, None)
            if not n.startswith("_") and inspect.isclass(x):
                out |= {a for a in dir(x) if not a.startswith("_")}
    del builtins
    return sorted(out)


def corpus_files() -> list:
    root = Path(sysconfig.get_paths()["stdlib"])
    out = []
    for f in sorted(root.rglob("*.py")):
        rel = f.relative_to(root).parts
        if any(p in SKIP_DIRS for p in rel[:-1]) or rel[-1].startswith("test_"):
            continue
        out.append(f)
    return out


def empty_data() -> dict:
    return {"version": VERSION, "grammar": derive_grammar(),
            "vocab": {"builtins": allowed_builtins(), "api": list(__import__("gridlab.openagents.api", fromlist=["x"]).API_NAMES),
                      "externals": externals(), "api_attrs": api_attrs(), "api_params": api_params(),
                      "modules": modules(), "module_attrs": module_attrs()},
            "counts": {"nodes": {}, "small": {}, "builtins": {}, "attrs": {}, "kwargs": {}, "imports": {},
                       "module_attrs": {}}}


def count(files) -> tuple[dict, dict]:
    data = empty_data()
    T = Tables(data, "corpus")
    agg: dict = {}
    stats = {"files": 0, "failed": 0, "nodes": 0}
    for f in files:
        try:
            tree = ast.parse(f.read_text(encoding="utf-8"))
        except (SyntaxError, UnicodeDecodeError, ValueError):
            stats["failed"] += 1
            continue
        w = Walker(T, None, "count")
        try:
            w.program(tree)
        except Exception as e:  # noqa: BLE001 - report and skip
            print(f"skip {f}: {type(e).__name__}: {e}", file=sys.stderr)
            stats["failed"] += 1
            continue
        stats["files"] += 1
        stats["nodes"] += w.nodes
        for k, d in w.counts.items():
            a = agg.setdefault(k, {})
            for lab, n in d.items():
                a[lab] = a.get(lab, 0) + n
    return agg, stats


def build() -> dict:
    files = corpus_files()
    agg, stats = count(files)
    data = empty_data()
    c = data["counts"]
    voc = data["vocab"]
    blt = set(voc["builtins"])
    for k, d in agg.items():
        if k.startswith("small:"):
            c["small"][k[6:]] = {str(lab): n for lab, n in sorted(d.items(), key=lambda kv: str(kv[0]))}
        elif k == "ext":
            c["builtins"] = {n: d[n] for n in sorted(d) if n in blt}
        elif k == "attr":
            top = sorted(((n, v) for n, v in d.items() if n.isidentifier()), key=lambda kv: (-kv[1], kv[0]))
            keep = {n for n, _ in top[:TOP_ATTRS]} | set(method_vocab())
            c["attrs"] = {n: d.get(n, 0) + 1 for n in sorted(keep)}
            c["attrs_tail"] = max(1, sum(v for n, v in top if n not in keep))   # escape mass: everything cut
        elif k == "kwarg":
            top = sorted(((n, v) for n, v in d.items() if n is not None), key=lambda kv: (-kv[1], kv[0]))
            c["kwargs"] = dict(top[:TOP_KWARGS])
            c["kwargs_tail"] = max(1, sum(v for _, v in top[TOP_KWARGS:]))
        elif k == "modpath":
            c["imports"] = {m: d.get(m, 0) for m in voc["modules"]}
        elif k.startswith("mattr:"):
            m = k[6:]
            if m in voc["module_attrs"]:
                ok = set(voc["module_attrs"][m])
                c["module_attrs"][m] = {n: v for n, v in sorted(d.items()) if n in ok}
        elif "." in k and not k.startswith("present"):
            c["nodes"][k] = {str(lab): n for lab, n in sorted(d.items(), key=lambda kv: str(kv[0]))}
    data["corpus"] = {"python": sys.version.split()[0], "files": stats["files"], "failed": stats["failed"],
                      "nodes": stats["nodes"], "source": "CPython standard library (Lib/), tests excluded"}
    return data


def main():
    data = build()
    with open(TABLE_PATH, "w") as fh:
        json.dump(data, fh, indent=0, sort_keys=True, ensure_ascii=False)
        fh.write("\n")
    print(f"wrote {TABLE_PATH} ({TABLE_PATH.stat().st_size // 1024} KiB): {data['corpus']}")


if __name__ == "__main__":
    main()
