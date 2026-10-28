"""Example agents (for the docs, the cost table and the tests) and the templates simulated gods summon.

Colours are written {A}, {B}, {C}: `example(name, gtype)` fills them with the GridType's first, last and
second colour names (red, blue, yellow on rgby), so every example runs on every GridType.
"""
from __future__ import annotations

from ..core import GridType

# name -> (kind, source). Kinds: fixed | relative | conditional | loop | search.
EXAMPLES: dict[str, tuple[str, str]] = {
    "paint_one_row": ("fixed", """\
# Paint row 2 {A}. Always the same row.
paint(row(2), {A})
"""),
    "fill_grid": ("fixed", """\
# Paint the whole grid {A}.
paint(everything, {A})
"""),
    "paint_best_line": ("relative", """\
# The mutator picks the line with the most {A} itself.
paint(best_line, {A})
"""),
    "reddest_row": ("relative", """\
# Find the row with the most {A} cells, then paint it {A}.
def how_{A}(row):
    return row.count({A})

paint(best(grid.rows, by=how_{A}), {A})
"""),
    "guarded_row": ("conditional", """\
# Only finish a row that is already mostly {A}.
if row(0).count({A}) >= 3:
    paint(row(0), {A})
"""),
    "recolour_tool": ("fixed", """\
# Turn every {B} cell {A}, using the recolour tool.
recolour(everything, {B}, {A})
"""),
    "recolour_by_hand": ("loop", """\
# The same thing by hand: look at every cell.
for cell in grid.cells:
    if cell.colour == {B}:
        paint(cell, {A})
"""),
    "copy_top_colour": ("relative", """\
# Pick the row that is most one colour and make it all that colour.
def sameness(row):
    return row.count(row.top_colour)

row = best(grid.rows, by=sameness)
paint(row, row.top_colour)
"""),
    "join_the_crowd": ("relative", """\
# Paint the cell that has the most {A} neighbours.
def friends(cell):
    return len([n for n in cell.neighbours if n.colour == {A}])

paint(best(grid.cells, by=friends), {A})
"""),
    "biggest_to_corner": ("relative", """\
# Swap the biggest number into the top-left corner.
biggest = best(grid.cells, by=lambda c: c.value)
swap_cells(cell(0, 0), biggest)
"""),
    "fix_mixed_rows": ("loop", """\
# Every row that is nearly one colour gets finished.
for row in grid.rows:
    if row.count(row.top_colour) >= 4:
        paint(row, row.top_colour)
"""),
    "greedy_paint": ("search", """\
# Try every paint move and do the one my god likes best.
best(moves(paint), by=score)
"""),
    "careful_greedy": ("search", """\
# Same, but only if it really makes things better.
move = best(moves(paint), by=score)
if score(move) > score(grid):
    move
"""),
    "row_painter_search": ("search", """\
# Try painting each row in each colour; keep the best if it helps.
options = [paint(row, k) for row in grid.rows for k in colours]
move = best(options, by=score)
if score(move) > score(grid):
    move
"""),
    "greedy_swap": ("search", """\
# Try swapping the colours of each pair of next-door cells.
options = [swap_cells(a, b, layer="colour") for a in grid.cells for b in a.neighbours]
move = best(options, by=score)
if score(move) > score(grid):
    move
"""),
    "two_greedy_steps": ("search", """\
# Take the best paint move, twice.
for step in range(2):
    move = best(moves(paint), by=score)
    if score(move) > score(grid):
        move
"""),
    "full_greedy": ("search", """\
# Look at every move of every mutator; do the best one if it helps.
move = best(every_move, by=score)
if score(move) > score(grid):
    move
"""),
}

# The attack the structured reference grids are there to catch: constant on random grids, but on a
# grid that is already mostly one colour it chooses among many targets.
ATTACK = """\
k = best(colours, by=lambda k: grid.count(k))
if grid.count(k) >= 13:
    for cell in grid.cells:
        if cell.colour != k and cell.value > 4:
            paint(cell, k)
"""

# Templates simulated gods may summon (agent_language="mix"/"only"): kind, source, colour slots used.
TEMPLATES: dict[str, tuple[str, str]] = {
    "paint_best_line": EXAMPLES["paint_best_line"],
    "reddest_row": EXAMPLES["reddest_row"],
    "guarded_row": EXAMPLES["guarded_row"],
    "recolour_tool": EXAMPLES["recolour_tool"],
    "copy_top_colour": EXAMPLES["copy_top_colour"],
    "join_the_crowd": EXAMPLES["join_the_crowd"],
    "fix_mixed_rows": EXAMPLES["fix_mixed_rows"],
    "greedy_paint": EXAMPLES["greedy_paint"],
    "careful_greedy": EXAMPLES["careful_greedy"],
    "row_painter_search": EXAMPLES["row_painter_search"],
    "careful_greedy_recolour": ("search", """\
move = best(moves(recolour), by=score)
if score(move) > score(grid):
    move
"""),
    "careful_greedy_swap": EXAMPLES["greedy_swap"],
    "careful_greedy_write": ("search", """\
move = best(moves(write), by=score)
if score(move) > score(grid):
    move
"""),
    "careful_greedy_count_on": ("search", """\
move = best(moves(step_rank), by=score)
if score(move) > score(grid):
    move
"""),
    "careful_greedy_ramp": ("search", """\
move = best(moves(write_ramp), by=score)
if score(move) > score(grid):
    move
"""),
}


def colour_fill(src: str, gt: GridType, A: int = 0, B: int = -1, C: int = 1) -> str:
    cn = gt.colour_names
    return src.replace("{A}", cn[A]).replace("{B}", cn[B]).replace("{C}", cn[C % len(cn)])


def example(name: str, gt: GridType) -> str:
    return colour_fill(EXAMPLES[name][1], gt)


def template_instances(gt: GridType, names=None) -> list[tuple[str, str, str]]:
    """(name, kind, source) for every colour instantiation of the chosen templates (no repeats)."""
    out, seen = [], set()
    C = gt.C
    for nm in (names or TEMPLATES):
        kind, src = TEMPLATES[nm]
        uses_a, uses_b = "{A}" in src, "{B}" in src
        combos = [(a, b) for a in range(C) for b in range(C) if a != b] if uses_b else \
            [(a, (a + 1) % C) for a in range(C)] if uses_a else [(0, 1)]
        for a, b in combos:
            s = colour_fill(src, gt, a, b)
            if s not in seen:
                seen.add(s)
                out.append((nm, kind, s))
    return out
