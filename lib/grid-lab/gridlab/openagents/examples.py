"""Example open agents: plain Python, from a hard-coded single paint to a full greedy search.

Colours are written {A} and {B}; `example(name, gt)` fills them with the GridType's first and last
colour names (red and blue on rgby), so every example runs on every GridType.
"""
from __future__ import annotations

from ..core import GridType

# name -> (kind, source). Kinds: fixed | relative | conditional | loop | random | search.
EXAMPLES: dict[str, tuple[str, str]] = {
    "paint_one_row": ("fixed", """\
def agent(grid):
    return [paint_row(2, "{A}")]
"""),
    "fill_grid": ("fixed", """\
def agent(grid):
    return [paint_all("{A}")]
"""),
    "paint_best_line": ("relative", """\
def agent(grid):
    return [paint(best_line, "{A}")]
"""),
    "reddest_row": ("relative", """\
def agent(grid):
    def how_{A}(i):
        return sum(cell.colour == "{A}" for cell in grid.rows[i])
    return [paint_row(max(range(grid.size), key=how_{A}), "{A}")]
"""),
    "guarded_row": ("conditional", """\
def agent(grid):
    if sum(cell.colour == "{A}" for cell in grid.rows[0]) >= 3:
        return [paint_row(0, "{A}")]
    return []
"""),
    "recolour_tool": ("fixed", """\
def agent(grid):
    return [recolour(everything, "{B}", "{A}")]
"""),
    "recolour_by_hand": ("loop", """\
def agent(grid):
    return [paint(cell, "{A}") for cell in grid.cells if cell.colour == "{B}"]
"""),
    "copy_top_colour": ("relative", """\
from collections import Counter

def agent(grid):
    top, count = Counter(cell.colour for cell in grid.cells).most_common(1)[0]
    return [paint_row(0, top)]
"""),
    "biggest_to_corner": ("relative", """\
def agent(grid):
    big = max(grid.cells, key=lambda cell: cell.value)
    if (big.row, big.col) == (0, 0):
        return []
    return [swap_cells(grid.cell(0, 0), big)]
"""),
    "random_row": ("random", """\
import random

def agent(grid):
    return [paint_row(random.randrange(grid.size), "{A}")]
"""),
    "hashed_row": ("relative", """\
import hashlib

def agent(grid):
    h = hashlib.sha256(repr(grid).encode()).digest()
    return [paint_row(h[0] % grid.size, "{A}")]
"""),
    "greedy_paint": ("search", """\
def agent(grid):
    return [max(moves("paint"), key=score)]
"""),
    "careful_greedy": ("search", """\
def agent(grid):
    best = max(moves("paint"), key=score)
    return [best] if score(best) > score() else []
"""),
    "random_improver": ("random", """\
import random

def agent(grid):
    now = score()
    better = [m for m in moves("paint") if score(m) > now]
    return [random.choice(better)] if better else []
"""),
    "greedy_swap": ("search", """\
def agent(grid):
    options = [swap_cells(a, b, layer="colour") for a in grid.cells for b in (a.right, a.down) if b]
    best = max(options, key=score)
    return [best] if score(best) > score() else []
"""),
    "full_greedy": ("search", """\
def agent(grid):
    best = max(moves(), key=score)
    return [best] if score(best) > score() else []
"""),
}

# The attack the structured and game components of the reference mixture are there to catch: constant on
# random grids, but on a grid that is already mostly one colour it chooses among many targets.
ATTACK = """\
def agent(grid):
    k = max(grid.colours, key=grid.count)
    if grid.count(k) >= {T}:
        return [paint(cell, k) for cell in grid.cells if cell.colour != k and cell.value > 4]
    return []
"""

# Evasion probes: each tries to behave differently in measurement and play, or to keep state.
PROBES: dict[str, str] = {
    "clock_reader": """\
import time

def agent(grid):
    if int(time.time() * 1e6) % 2:
        return [paint_row(0, "{A}")]
    return []
""",
    "stateful": """\
calls = []

def agent(grid):
    calls.append(1)
    return [paint_row(len(calls) % grid.size, "{A}")]
""",
    "seed_peeker": """\
import random

def agent(grid):
    state = random.getstate()[1][:4]
    if sum(state) % 7 == 0:
        return [paint_all("{A}")]
    return []
""",
    "module_stash": """\
import math

def agent(grid):
    try:
        math.memo = getattr(math, "memo", 0) + 1
    except AttributeError:
        pass
    return [paint_row(getattr(math, "memo", 0) % grid.size, "{A}")]
""",
}

# Templates simulated gods may summon (GameConfig.open_agents = "mix" | "only").
TEMPLATES = ("paint_one_row", "paint_best_line", "reddest_row", "guarded_row", "recolour_tool", "copy_top_colour",
             "random_row", "greedy_paint", "careful_greedy", "random_improver", "greedy_swap")


def colour_fill(src: str, gt: GridType, A: int = 0, B: int = -1) -> str:
    cn = gt.colour_names
    return src.replace("{A}", cn[A]).replace("{B}", cn[B])


def example(name: str, gt: GridType) -> str:
    return colour_fill(EXAMPLES[name][1], gt)


def attack(gt: GridType, threshold: int = 13) -> str:
    return ATTACK.replace("{T}", str(threshold))


def template_instances(gt: GridType, names=None) -> list[tuple[str, str, str]]:
    """(name, kind, source) for every colour instantiation of the chosen templates (no repeats)."""
    out, seen = [], set()
    C = gt.C
    for nm in (names or TEMPLATES):
        kind, src = EXAMPLES[nm]
        combos = [(a, b) for a in range(C) for b in range(C) if a != b] if "{B}" in src else \
            [(a, (a + 1) % C) for a in range(C)] if "{A}" in src else [(0, 1)]
        for a, b in combos:
            s = colour_fill(src, gt, a, b)
            if s not in seen:
                seen.add(s)
                out.append((nm, kind, s))
    return out
