"""`ast-bytes-v1` (lib/game-runtime/README.md) for Python source, for comparison with the MDL code.

Each AST node costs one byte, except Constant: strings cost their UTF-8 length, bytes their length,
signed integers their minimum two's-complement byte length (at least 1), floats 8, complex 16, None
and bool 1. Operators, contexts and the root count as nodes. (The runtime prices one `eval`
expression with root `Expression`; an agent is a module, so the root here is `Module`.)
"""
from __future__ import annotations

import ast


def _int_bytes(v: int) -> int:
    n = 1
    while not (-(1 << (8 * n - 1)) <= v < (1 << (8 * n - 1))):
        n += 1
    return n


def constant_bytes(v) -> int:
    if isinstance(v, bool) or v is None:
        return 1
    if isinstance(v, int):
        return _int_bytes(v)
    if isinstance(v, float):
        return 8
    if isinstance(v, complex):
        return 16
    if isinstance(v, str):
        return len(v.encode("utf-8"))
    if isinstance(v, bytes):
        return len(v)
    return 1


def ast_bytes(src: str) -> int:
    total = 0
    for node in ast.walk(ast.parse(src)):
        total += constant_bytes(node.value) if isinstance(node, ast.Constant) else 1
    return total


def ast_nodes(src: str) -> int:
    return sum(1 for _ in ast.walk(ast.parse(src)))
