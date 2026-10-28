"""Kid-readable cards: one `card_source(params, gtype) -> str` per shortlisted family.

A card is a complete Python program that runs against the kid grid API (gridlab/kid.py): a header
comment (emoji, name, 1-3 plain sentences on what earns points), the dealt settings as UPPER_CASE
constants, then `def utility(grid):`. Its return values must induce exactly the same order as the
family's internal ordinal, ties included (tests/test_cards.py checks this on every GridType). The card
is the source of truth players read; when the two disagreed, the family was simplified to match the
card (docs/kid-cards.md lists every such change).

Authoring rules are in docs/kid-cards.md §3. In short: names not indices, one idea per helper, plain
loops, no numpy, short header, settings as constants, structural choices (which lines, diagonals on
or off) baked into the code so a card only shows the code that runs.
"""
from __future__ import annotations

import textwrap

from ..core import GridType
from ._util import vmax

SUIT_NAMES = ("spades", "hearts", "diamonds", "clubs")
RANK_NAMES = {1: "Ace", 11: "Jack", 12: "Queen", 13: "King"}


# --- rendering helpers ------------------------------------------------------------------------------
def _lit(v) -> str:
    if isinstance(v, str):
        return f'"{v}"'
    if isinstance(v, (list, tuple)):
        return "[" + ", ".join(_lit(x) for x in v) + "]"
    return repr(v)


def card(emoji: str, name: str, about: str, consts: list[tuple], body: str) -> str:
    """Render a card. consts: (NAME, value) or (NAME, value, comment)."""
    out = [f"# {emoji} {name}"] + ["# " + ln for ln in textwrap.wrap(" ".join(about.split()), 96)]
    for c in consts:
        line = f"{c[0]} = {_lit(c[1])}"
        out.append(line + (f"  # {c[2]}" if len(c) > 2 and c[2] else ""))
    return "\n".join(out) + "\n\n" + textwrap.dedent(body).strip("\n") + "\n"


def col(gt: GridType, i: int) -> str:
    return gt.colour_names[i]


def an(word: str) -> str:
    """'a red' / 'an orange'."""
    return ("an " if word[0] in "aeiou" else "a ") + word


def thing(gt: GridType) -> str:
    """What a cell shows: 'card' or 'number'."""
    return "card" if gt.symbols == "cards" else "number"


def value_note(gt: GridType, v: int) -> str:
    return RANK_NAMES.get(v, "") if gt.symbols == "cards" else ""


def values_note(gt: GridType, vs) -> str:
    if gt.symbols != "cards":
        return ""
    return ", ".join(RANK_NAMES.get(v, str(v)) for v in vs)


def rank_value(gt: GridType, rank: int) -> int:
    """A rank index (0..ranks-1) as the kid API's cell.value."""
    return rank + 1 if gt.symbols == "cards" else rank


# --- seeds --------------------------------------------------------------------------------------------
def line_painter(p, gt):
    diag = p["diag"]
    dirs = "across, down and along both diagonals" if diag else "across and down"
    extra = """
                if is_mine(cell.up_left) or is_mine(cell.down_right):
                    points += cell.value
                if is_mine(cell.up_right) or is_mine(cell.down_left):
                    points += cell.value""" if diag else ""
    return card("🖍️", "Line Painter", f"""Your colour scores when it lines up. Each {col(gt, p['colour'])} cell that
        touches another {col(gt, p['colour'])} cell in a straight line ({dirs}) earns its value, once for
        every direction it lines up in.""",
                [("MY_COLOUR", col(gt, p["colour"]))], f"""
        def is_mine(cell):
            return cell is not None and cell.colour == MY_COLOUR

        def utility(grid):
            points = 0
            for cell in grid.cells:
                if not is_mine(cell):
                    continue
                if is_mine(cell.left) or is_mine(cell.right):
                    points += cell.value
                if is_mine(cell.up) or is_mine(cell.down):
                    points += cell.value{extra}
            return points
        """)


def patchwork(p, gt):
    return card("🧩", "Patchwork", f"""A patch is a group of 2 or more touching cells showing the same
        {'rank' if gt.symbols == 'cards' else 'number'}. A patch scores its size × its value, but only if
        no two touching cells inside it share a colour.""", [], """
        def same_value(a, b):
            return a.value == b.value

        def colourful(patch):
            for cell in patch:
                for other in cell.neighbours:
                    if other in patch and other.colour == cell.colour:
                        return False
            return True

        def utility(grid):
            points = 0
            for patch in grid.regions(same_value):
                if len(patch) >= 2 and colourful(patch):
                    points += len(patch) * patch[0].value
            return points
        """)


def green_ones(p, gt):
    v = p["value"]
    what = "aces" if gt.symbols == "cards" and v == 1 else f"{v}s"
    return card("🍀", "Green Ones", f"""Count the {col(gt, p['colour'])} {what}. If that's a tie, count the
        cells that are halfway there: the right colour or the right {thing(gt)}, but not both.""",
                [("MY_COLOUR", col(gt, p["colour"])), ("MY_VALUE", v, value_note(gt, v))], """
        def utility(grid):
            perfect = 0
            halfway = 0
            for cell in grid.cells:
                right_colour = cell.colour == MY_COLOUR
                right_value = cell.value == MY_VALUE
                if right_colour and right_value:
                    perfect += 1
                elif right_colour or right_value:
                    halfway += 1
            return (perfect, halfway)
        """)


# --- strategy -------------------------------------------------------------------------------------------
_READ = {"→": ("left to right", "grid.rows"), "←": ("right to left", "[list(reversed(row)) for row in grid.rows]"),
         "↓": ("top to bottom", "grid.columns"), "↑": ("bottom to top", "[list(reversed(c)) for c in grid.columns]")}


def rainbow_road(p, gt):
    how, lines = _READ[p["dir"]]
    kind = "row" if p["dir"] in "→←" else "column"
    order = " → ".join(gt.colour_names + (gt.colour_names[0],))
    return card("🌈", "Rainbow Road", f"""Read every {kind} {how}. A step scores when the next colour is
        the next one round the rainbow ({order}). A whole {kind} of rainbow steps beats any number of
        single steps.""", [], f"""
        def utility(grid):
            whole_lines = 0
            steps = 0
            for line in {lines}:
                good = 0
                for i in range(len(line) - 1):
                    if line[i + 1].colour == next_colour(line[i].colour):
                        good += 1
                steps += good
                if good == len(line) - 1:
                    whole_lines += 1
            return (whole_lines, steps)
        """)


def border_baron(p, gt):
    return card("🏰", "Border Baron", f"""Touching cells of one colour form a country. Every place where
        two countries touch is a border, and it scores when both countries have at least {p['K']} cells.
        If that's a tie, each border counts the size of its smaller country (up to {p['K']}).""",
                [("BIG", p["K"])], """
        def same_colour(a, b):
            return a.colour == b.colour

        def utility(grid):
            size = {}
            for country in grid.regions(same_colour):
                for cell in country:
                    size[cell] = len(country)
            big_borders = 0
            progress = 0
            for cell in grid.cells:
                for other in (cell.right, cell.down):
                    if other is not None and other.colour != cell.colour:
                        smaller = min(size[cell], size[other], BIG)
                        progress += smaller
                        if smaller == BIG:
                            big_borders += 1
            return (big_borders, progress)
        """)


def conqueror(p, gt):
    by_value = p["weight"] == "value"
    worth = "its value" if by_value else "1 point"
    pts = "cell.value" if by_value else "1"
    return card("⚔️", "Conqueror", f"""Your colour against your enemy's. Each {col(gt, p['A'])} cell adds
        {worth}, and each {col(gt, p['B'])} cell takes {worth} away.""",
                [("MY_COLOUR", col(gt, p["A"])), ("ENEMY_COLOUR", col(gt, p["B"]))], f"""
        def utility(grid):
            points = 0
            for cell in grid.cells:
                if cell.colour == MY_COLOUR:
                    points += {pts}
                elif cell.colour == ENEMY_COLOUR:
                    points -= {pts}
            return points
        """)


def parity_painter(p, gt):
    P, Q = col(gt, p["P"]), col(gt, p["Q"])
    if p["key"] == "suit":
        return card("🎭", "Parity Painter", f"""Red suits (♥ ♦) should be {P} and black suits (♠ ♣)
            should be {Q}. A card in its right colour is +1; a card wearing the other team's colour is −1.""",
                    [("RED_SUIT_COLOUR", P), ("BLACK_SUIT_COLOUR", Q)], """
            def utility(grid):
                points = 0
                for cell in grid.cells:
                    if cell.suit == "hearts" or cell.suit == "diamonds":
                        right, wrong = RED_SUIT_COLOUR, BLACK_SUIT_COLOUR
                    else:
                        right, wrong = BLACK_SUIT_COLOUR, RED_SUIT_COLOUR
                    if cell.colour == right:
                        points += 1
                    elif cell.colour == wrong:
                        points -= 1
                return points
            """)
    return card("🎭", "Parity Painter", f"""Even {thing(gt)}s should be {P} and odd ones {Q}. A cell in its
        right colour is +1; a cell wearing the other team's colour is −1.""",
                [("EVEN_COLOUR", P), ("ODD_COLOUR", Q)], """
        def utility(grid):
            points = 0
            for cell in grid.cells:
                if cell.value % 2 == 0:
                    right, wrong = EVEN_COLOUR, ODD_COLOUR
                else:
                    right, wrong = ODD_COLOUR, EVEN_COLOUR
                if cell.colour == right:
                    points += 1
                elif cell.colour == wrong:
                    points -= 1
            return points
        """)


def mirrormancer(p, gt):
    lines, kind = ("grid.rows", "row") if p["axis"] == "LR" else ("grid.columns", "column")
    what = "colour" if p["layer"] == "colour" else "value"
    shown = "colours" if p["layer"] == "colour" else ("ranks" if gt.symbols == "cards" else "numbers")
    return card("🪞", "Mirrormancer", f"""A {kind} is a mirror when its {shown} read the same forwards and
        backwards. Count mirror {kind}s; if that's a tie, count matching pairs (first and last, second and
        second-last, ...).""", [], f"""
        def utility(grid):
            mirrors = 0
            pairs = 0
            for line in {lines}:
                half = len(line) // 2
                matches = 0
                for i in range(half):
                    if line[i].{what} == line[len(line) - 1 - i].{what}:
                        matches += 1
                pairs += matches
                if matches == half:
                    mirrors += 1
            return (mirrors, pairs)
        """)


def homebody(p, gt):
    rim = p["zone"] == "rim"
    home = "the edge (the outside ring)" if rim else "the middle (everything off the edge)"
    test = "cell.on_edge" if rim else "not cell.on_edge"
    return card("🏡", "Homebody", f"""Your colour likes to stay home in {home}. Each {col(gt, p['X'])}
        cell at home is +1, and each one away from home is −1.""", [("MY_COLOUR", col(gt, p["X"]))], f"""
        def utility(grid):
            points = 0
            for cell in grid.cells:
                if cell.colour == MY_COLOUR:
                    if {test}:
                        points += 1
                    else:
                        points -= 1
            return points
        """)


def lone_peak(p, gt):
    return card("🏔️", "Lone Peak", f"""The highest {thing(gt)} on the grid is the peak. If there is just one
        peak and it is {col(gt, p['X'])}, score how far it stands above the next highest. If that's a tie,
        it helps if one of the peaks is {col(gt, p['X'])}.""", [("MY_COLOUR", col(gt, p["X"]))], """
        def utility(grid):
            top = max(cell.value for cell in grid.cells)
            peaks = [cell for cell in grid.cells if cell.value == top]
            gap = 0
            if len(peaks) == 1 and peaks[0].colour == MY_COLOUR:
                second = max(cell.value for cell in grid.cells if cell is not peaks[0])
                gap = top - second
            mine = 0
            for cell in peaks:
                if cell.colour == MY_COLOUR:
                    mine = 1
            return (gap, mine)
        """)


# --- geometry -------------------------------------------------------------------------------------------
def castle_keeper(p, gt):
    W = col(gt, p["W"])
    mode = p["mode"]
    consts = [("WALL", W)]
    if mode == "treasure":
        consts.append(("TREASURE", col(gt, p["T"])))
        about = f"""Build {W} walls. Every {col(gt, p['T'])} treasure cell that the walls shut off from
            the edge of the grid scores a point. If that's a tie, more {W} wall on the edge is better."""
        count = """
            treasure = 0
            for cell in grid.cells:
                if inside(cell, outside) and cell.colour == TREASURE:
                    treasure += 1
            return (treasure, walls_on_edge(grid))"""
    elif mode == "eyes":
        about = f"""Build {W} walls. Every cell the walls shut off from the edge of the grid scores a
            point, and every separate pocket of them scores 3 more. If that's a tie, more {W} wall on the
            edge is better."""
        count = """
            points = 0
            for pocket in grid.regions(same_side):
                if inside(pocket[0], outside):
                    points += len(pocket) + 3
            return (points, walls_on_edge(grid))"""
    else:
        about = f"""Build {W} walls. Every cell that the walls shut off from the edge of the grid scores a
            point. If that's a tie, more {W} wall on the edge is better."""
        count = """
            shut_in = 0
            for cell in grid.cells:
                if inside(cell, outside):
                    shut_in += 1
            return (shut_in, walls_on_edge(grid))"""
    pockets = """
        def same_side(a, b):
            return not_wall(a) == not_wall(b)
        """ if mode == "eyes" else ""
    return card("🏯", "Castle Keeper", about, consts, f"""
        def not_wall(cell):
            return cell.colour != WALL

        def inside(cell, outside):
            return not_wall(cell) and cell not in outside

        def walls_on_edge(grid):
            walls = 0
            for cell in grid.edge_cells:
                if cell.colour == WALL:
                    walls += 1
            return walls
        {pockets}
        def utility(grid):
            outside = grid.reachable(grid.edge_cells, through=not_wall)  # cells you can walk to from the edge{count}
        """)


def chessmaster(p, gt):
    A, B = col(gt, p["A"]), col(gt, p["B"])
    return card("♟️", "Chessmaster", f"""Every 2×2 square coloured like a chessboard in {A} and {B}
        scores a point. If that's a tie, count the places where {an(A)} cell touches {an(B)} cell.""",
                [("COLOUR_A", A), ("COLOUR_B", B)], """
        def opposite(a, b):
            return (a.colour == COLOUR_A and b.colour == COLOUR_B) or (a.colour == COLOUR_B and b.colour == COLOUR_A)

        def utility(grid):
            boards = 0
            seams = 0
            for cell in grid.cells:
                for other in (cell.right, cell.down):
                    if other is not None and opposite(cell, other):
                        seams += 1
                right, below = cell.right, cell.down
                if right is not None and below is not None:
                    if opposite(cell, right) and opposite(cell, below) and below.right.colour == cell.colour:
                        boards += 1
            return (boards, seams)
        """)


def bridge_builder(p, gt):
    C = col(gt, p["C"])
    lr = p["D"] == "LR"
    across, attr = ("columns", "col") if lr else ("rows", "row")
    goal = "from the left edge to the right edge" if lr else "from the top edge to the bottom edge"
    return card("🌉", "Bridge Builder", f"""Build a bridge of touching {C} cells {goal}. Score how many
        {across} your biggest {C} bridge reaches across.""", [("MY_COLOUR", C)], f"""
        def same_colour(a, b):
            return a.colour == b.colour

        def utility(grid):
            best = 0
            for bridge in grid.regions(same_colour):
                if bridge[0].colour != MY_COLOUR:
                    continue
                {across} = set()
                for cell in bridge:
                    {across}.add(cell.{attr})
                best = max(best, len({across}))
            return best
        """)


def card_windmill(p, gt):
    return card("🌀", "Card Windmill", """Turn the grid a quarter turn clockwise: every card lands on
        another spot. A turn is good when the card there has the next suit (♠ → ♥ → ♦ → ♣ → ♠). Count the
        cards whose four turns are all good (a full windmill); if that's a tie, count good turns.""", [], """
        SUITS = ["spades", "hearts", "diamonds", "clubs"]

        def next_suit(suit):
            return SUITS[(SUITS.index(suit) + 1) % 4]

        def good_turn(grid, cell):
            return grid.quarter_turn(cell).suit == next_suit(cell.suit)

        def utility(grid):
            windmill_cards = 0
            good_turns = 0
            for cell in grid.cells:
                if good_turn(grid, cell):
                    good_turns += 1
                spot = cell
                all_good = True
                for turn in range(4):
                    if not good_turn(grid, spot):
                        all_good = False
                    spot = grid.quarter_turn(spot)
                if all_good:
                    windmill_cards += 1
            return (windmill_cards, good_turns)
        """)


def royal_court(p, gt):
    s = p["suit"]
    who = "picture card (J, Q, K)" if s is None else f"picture card (J, Q, K) of {SUIT_NAMES[s]}"
    consts = [] if s is None else [("MY_SUIT", SUIT_NAMES[s])]
    test = "cell.is_picture" if s is None else "cell.is_picture and cell.suit == MY_SUIT"
    return card("👑", "Royal Court", f"""Put a {who} in the very middle. Your court is it plus every
        such card joined to it through touching cells: score its size, doubled if none of it is on the
        edge. If that's a tie, count those picture cards that are off the edge.""", consts, f"""
        def royal(cell):
            return {test}

        def utility(grid):
            middle = grid.cell(grid.size // 2, grid.size // 2)
            court_size = 0
            if royal(middle):
                court = grid.reachable(middle, through=royal)
                court_size = len(court)
                safe = True
                for cell in court:
                    if cell.on_edge:
                        safe = False
                if safe:
                    court_size *= 2
            off_edge = 0
            for cell in grid.cells:
                if royal(cell) and not cell.on_edge:
                    off_edge += 1
            return (court_size, off_edge)
        """)


# --- arithmetic -----------------------------------------------------------------------------------------
def straight_shooter(p, gt):
    up = p["step"] == 1
    consts = [("STEP", p["step"], "count up" if up else "count down")]
    number = "cell.value"
    if p["ace_high"]:
        number = "14 if cell.value == 1 else cell.value"
    flush = p["flush"]
    if flush:
        score = """
                    if len(run) >= 3:
                        points = len(run) * len(run)
                        if one_colour(run):
                            points *= 2
                        score += points"""
        helper = """
        def one_colour(run):
            for cell in run:
                if cell.colour != run[0].colour:
                    return False
            return True
        """
    else:
        score = """
                    if len(run) >= 3:
                        score += len(run) * len(run)"""
        helper = ""
    aces = " Aces count as 14." if p["ace_high"] else ""
    return card("🎯", "Straight Shooter", f"""Find runs of 3 or more {thing(gt)}s that count
        {'up' if up else 'down'} by one, reading rows left to right and columns top to bottom. A run
        scores its length × its length{', doubled if it is all one colour' if flush else ''}.{aces} If
        that's a tie, count single counting steps.""", consts, f"""
        def number(cell):
            return {number}
        {helper}
        def runs(line):
            out = [[line[0]]]
            for cell in line[1:]:
                if number(cell) == number(out[-1][-1]) + STEP:
                    out[-1].append(cell)
                else:
                    out.append([cell])
            return out

        def utility(grid):
            score = 0
            steps = 0
            for line in grid.rows + grid.columns:
                for run in runs(line):
                    steps += len(run) - 1{score}
            return (score, steps)
        """)


def number_bonds(p, gt):
    T = vmax(gt) + 1
    mode = p["mode"]
    cond = {"any": "", "same": " and cell.colour == other.colour", "different": " and cell.colour != other.colour"}[mode]
    extra = {"any": "", "same": " and are the same colour", "different": " and are different colours"}[mode]
    return card("🤝", "Number Bonds", f"""Two touching cells are best friends when their {thing(gt)}s add
        up to {T}{extra}. Every pair of best friends scores a point.""", [("TARGET", T)], f"""
        def utility(grid):
            bonds = 0
            for cell in grid.cells:
                for other in (cell.right, cell.down):
                    if other is not None and cell.value + other.value == TARGET{cond}:
                        bonds += 1
            return bonds
        """)


_AXIS = {"rows": ("grid.rows", "row"), "cols": ("grid.columns", "column"),
         "both": ("grid.rows + grid.columns", "row and column")}


def magic_accountant(p, gt):
    lines, kind = _AXIS[p["axis"]]
    return card("🧮", "Magic Accountant", f"""Every {kind} whose {thing(gt)}s add up to exactly {p['T']}
        scores a point. If that's a tie, it's better when the totals are closer to {p['T']}.""",
                [("TARGET", p["T"])], f"""
        def utility(grid):
            exact = 0
            distance = 0
            for line in {lines}:
                total = 0
                for cell in line:
                    total += cell.value
                if total == TARGET:
                    exact += 1
                distance += abs(total - TARGET)
            return (exact, -distance)
        """)


def king_of_the_hill(p, gt):
    valley = p["valley"]
    X = col(gt, p["X"])
    word, cmp = ("lower", "<") if valley else ("higher", ">")
    return card("⛰️" if not valley else "🕳️", "King of the Hill" if not valley else "King of the Valley",
                f"""{an(X).capitalize()} cell is {'in a valley' if valley else 'a king'} when its {thing(gt)} is {word}
        than every cell touching it. Each one scores a point.""", [("MY_COLOUR", X)], f"""
        def utility(grid):
            kings = 0
            for cell in grid.cells:
                if cell.colour != MY_COLOUR:
                    continue
                if all(cell.value {cmp} other.value for other in cell.neighbours):
                    kings += 1
            return kings
        """)


def divisibility_detective(p, gt):
    b, m = gt.base, p["m"]
    lines, kind = _AXIS[p["scope"]]
    base_note = "" if b == 10 else f" (base {b}: the digits go 0-9 then A, B, ...)"
    return card("🔍", "Divisibility Detective", f"""Read each {kind} as one big number{base_note}. Every
        one that divides exactly by {m} scores a point.""",
                [("BASE", b), ("DIVIDE_BY", m)], f"""
        def utility(grid):
            found = 0
            for line in {lines}:
                number = 0
                for cell in line:
                    number = number * BASE + cell.value
                if number % DIVIDE_BY == 0:
                    found += 1
            return found
        """)


# --- colour ---------------------------------------------------------------------------------------------
def stripe_painter(p, gt):
    lines, kind = ("grid.rows", "row") if p["axis"] == "rows" else ("grid.columns", "column")
    return card("🦓", "Stripe Painter", f"""A stripe is a {kind} all in one colour. Each stripe scores a
        point unless the {kind} just before it is a stripe of the same colour. If that's a tie, count how
        many cells of each {kind} match its most common colour.""", [], f"""
        def most_common(line):
            best = 0
            for cell in line:
                same = 0
                for other in line:
                    if other.colour == cell.colour:
                        same += 1
                best = max(best, same)
            return best

        def utility(grid):
            stripes = 0
            nearly = 0
            previous = None
            for line in {lines}:
                count = most_common(line)
                nearly += count
                if count == len(line):
                    if line[0].colour != previous:
                        stripes += 1
                    previous = line[0].colour
                else:
                    previous = None
            return (stripes, nearly)
        """)


def feuding_families(p, gt):
    X, Y = col(gt, p["X"]), col(gt, p["Y"])
    return card("😤", "Feuding Families", f"""{X.capitalize()} and {Y} cells are feuding. A cell is
        safe when it doesn't touch the other family. Score the safe cells of whichever family has fewer;
        if that's a tie, count all safe cells.""", [("FAMILY_1", X), ("FAMILY_2", Y)], """
        def safe(cell, enemy):
            for other in cell.neighbours:
                if other.colour == enemy:
                    return False
            return True

        def utility(grid):
            safe_1 = 0
            safe_2 = 0
            for cell in grid.cells:
                if cell.colour == FAMILY_1 and safe(cell, FAMILY_2):
                    safe_1 += 1
                if cell.colour == FAMILY_2 and safe(cell, FAMILY_1):
                    safe_2 += 1
            return (min(safe_1, safe_2), safe_1 + safe_2)
        """)


def colour_mixer(p, gt):
    P1, P2, M = col(gt, p["P1"]), col(gt, p["P2"]), col(gt, p["M"])
    consts = [("PAINT_1", P1), ("PAINT_2", P2)]
    if p["strict"]:
        about = f"""{P1.capitalize()} + {P2} = {M}. A {M} cell scores when it sits between its two
            paints: {P1} on one side and {P2} on the opposite side. If that's a tie, count {M} cells
            touching either paint."""
        check = """
        def between(cell, a, b):
            if a is None or b is None:
                return False
            return (a.colour == PAINT_1 and b.colour == PAINT_2) or (a.colour == PAINT_2 and b.colour == PAINT_1)

        def utility(grid):
            mixes = 0
            near = 0
            for cell in grid.cells:
                if cell.colour != MIXED:
                    continue
                if touches(cell, PAINT_1) or touches(cell, PAINT_2):
                    near += 1
                if between(cell, cell.left, cell.right) or between(cell, cell.up, cell.down):
                    mixes += 1
            return (mixes, near)
        """
    else:
        about = f"""{P1.capitalize()} + {P2} = {M}. A {M} cell scores when it touches both of its
            paints. If that's a tie, count {M} cells touching either paint."""
        check = """
        def utility(grid):
            mixes = 0
            near = 0
            for cell in grid.cells:
                if cell.colour != MIXED:
                    continue
                if touches(cell, PAINT_1) or touches(cell, PAINT_2):
                    near += 1
                if touches(cell, PAINT_1) and touches(cell, PAINT_2):
                    mixes += 1
            return (mixes, near)
        """
    return card("🎨", "Colour Mixer", about, consts, """
        MIXED = mix(PAINT_1, PAINT_2)

        def touches(cell, colour):
            for other in cell.neighbours:
                if other.colour == colour:
                    return True
            return False
        """ + check)


def fair_weaver(p, gt):
    return card("🧶", "Fair Weaver", f"""A row or column is fair when every colour ({', '.join(gt.colour_names)})
        appears almost equally often: the most common and least common differ by at most 1. Count the fair
        lines; if that's a tie, smaller differences are better.""", [], """
        def unfairness(line, palette):
            counts = []
            for colour in palette:
                n = 0
                for cell in line:
                    if cell.colour == colour:
                        n += 1
                counts.append(n)
            return max(counts) - min(counts)

        def utility(grid):
            fair = 0
            spread = 0
            for line in grid.rows + grid.columns:
                d = unfairness(line, grid.palette)
                if d <= 1:
                    fair += 1
                spread += d
            return (fair, -spread)
        """)


def lantern_lighter(p, gt):
    X = col(gt, p["X"])
    return card("🏮", "Lantern Lighter", f"""{an(X).capitalize()} cell is a lantern when it is the only {X} cell in its
        row and the only one in its column. Each lantern scores a point.""", [("MY_COLOUR", X)], """
        def count_mine(line):
            n = 0
            for cell in line:
                if cell.colour == MY_COLOUR:
                    n += 1
            return n

        def utility(grid):
            lanterns = 0
            for cell in grid.cells:
                if cell.colour != MY_COLOUR:
                    continue
                if count_mine(grid.rows[cell.row]) == 1 and count_mine(grid.columns[cell.col]) == 1:
                    lanterns += 1
            return lanterns
        """)


# --- games ----------------------------------------------------------------------------------------------
def rummy_melder(p, gt):
    lines, kind = ("grid.rows", "row") if p["dir"] == "rows" else ("grid.columns", "column")
    cards = gt.symbols == "cards"
    suit = "cell.suit" if cards else "cell.colour"
    suit_word = "suit" if cards else "colour"
    return card("🃏", "Rummy Melder", f"""Look along each {kind} at 3 cells in a row. They are a meld if
        they are a set (same {thing(gt)}, 3 different {suit_word}s) or a run (counting up by one, all the
        same {suit_word}). Every cell in a meld scores its value. If that's a tie, count touching pairs that
        could start a meld.""", [], f"""
        def suit(cell):
            return {suit}

        def is_set(a, b, c):
            return a.value == b.value == c.value and suit(a) != suit(b) and suit(b) != suit(c) and suit(a) != suit(c)

        def is_run(a, b, c):
            return b.value == a.value + 1 and c.value == b.value + 1 and suit(a) == suit(b) == suit(c)

        def half_meld(a, b):
            return (a.value == b.value and suit(a) != suit(b)) or (b.value == a.value + 1 and suit(a) == suit(b))

        def utility(grid):
            score = 0
            pairs = 0
            for line in {lines}:
                in_meld = set()
                for i in range(len(line) - 2):
                    a, b, c = line[i], line[i + 1], line[i + 2]
                    if is_set(a, b, c) or is_run(a, b, c):
                        in_meld.update([a, b, c])
                for cell in in_meld:
                    score += cell.value
                for i in range(len(line) - 1):
                    if half_meld(line[i], line[i + 1]):
                        pairs += 1
            return (score, pairs)
        """)


def othello_sandwich(p, gt):
    X = col(gt, p["X"])
    diag = p["diag"]
    sides = "left and right, or above and below, or the two corners on either diagonal" if diag else \
        "left and right, or above and below"
    extra = """
                if is_mine(cell.up_left) and is_mine(cell.down_right):
                    sandwiches += 1
                if is_mine(cell.up_right) and is_mine(cell.down_left):
                    sandwiches += 1""" if diag else ""
    return card("🥪", "Sandwich Maker", f"""A cell is sandwiched when the cells on both sides of it
        ({sides}) are {X} and it isn't. Each sandwich is a point.""", [("MY_COLOUR", X)], f"""
        def is_mine(cell):
            return cell is not None and cell.colour == MY_COLOUR

        def utility(grid):
            sandwiches = 0
            for cell in grid.cells:
                if is_mine(cell):
                    continue
                if is_mine(cell.left) and is_mine(cell.right):
                    sandwiches += 1
                if is_mine(cell.up) and is_mine(cell.down):
                    sandwiches += 1{extra}
            return sandwiches
        """)


def honest_minesweeper(p, gt):
    X = col(gt, p["X"])
    return card("💣", "Honest Minesweeper", f"""{X.capitalize()} cells are mines. Any other cell is
        honest when its {thing(gt)} equals how many mines surround it (corners count). Each honest cell
        scores its value.""", [("MINE", X)], """
        def utility(grid):
            points = 0
            for cell in grid.cells:
                if cell.colour == MINE:
                    continue
                mines = 0
                for other in cell.surrounding:
                    if other.colour == MINE:
                        mines += 1
                if cell.value == mines:
                    points += cell.value
            return points
        """)


def bingo_caller(p, gt):
    called = [rank_value(gt, r) for r in p["called"]]
    free = gt.N % 2 == 1
    any_suit = " (any suit)" if gt.symbols == "cards" else ""
    free_space = " The middle cell is a free space." if free else ""
    test = "cell.value in CALLED or cell is grid.cell(grid.size // 2, grid.size // 2)" if free else "cell.value in CALLED"
    return card("🎱", "Bingo Caller", f"""Dab every cell showing a called {thing(gt)}{any_suit}.{free_space}
        Each dab is a point, and every complete row, column or long diagonal is BINGO: {gt.N} more points.""",
                [("CALLED", called, values_note(gt, called))], f"""
        def dabbed(grid, cell):
            return {test}

        def utility(grid):
            points = 0
            for cell in grid.cells:
                if dabbed(grid, cell):
                    points += 1
            for line in grid.rows + grid.columns + grid.diagonals:
                if all(dabbed(grid, cell) for cell in line):
                    points += grid.size
            return points
        """)


def sudoku_scholar(p, gt):
    word = "rank" if gt.symbols == "cards" else "number"
    if gt.N <= 4:
        return card("🔢", "Sudoku Scholar", f"""All or nothing: you score only if no {word} appears twice
            in any row, column or long diagonal.""", [], """
            def all_different(line):
                seen = []
                for cell in line:
                    if cell.value in seen:
                        return False
                    seen.append(cell.value)
                return True

            def utility(grid):
                for line in grid.rows + grid.columns + grid.diagonals:
                    if not all_different(line):
                        return 0
                return 1
            """)
    lines, kind = _AXIS[p["dir"]]
    return card("🔢", "Sudoku Scholar", f"""Every {kind} where no {word} appears twice scores a point. If
        that's a tie, more different {word}s in each line is better.""", [], f"""
        def different(line):
            seen = []
            for cell in line:
                if cell.value not in seen:
                    seen.append(cell.value)
            return len(seen)

        def utility(grid):
            perfect = 0
            variety = 0
            for line in {lines}:
                d = different(line)
                variety += d
                if d == len(line):
                    perfect += 1
            return (perfect, variety)
        """)


def full_house(p, gt):
    lines, kind = ("grid.rows", "row") if p["dir"] == "rows" else ("grid.columns", "column")
    word = "rank" if gt.symbols == "cards" else "number"
    return card("🏠", "Full House", f"""In each {kind}, every pair of cells showing the same {word} scores
        a point (three of a kind makes 3 pairs, four makes 6).""", [], f"""
        def utility(grid):
            pairs = 0
            for line in {lines}:
                for i in range(len(line)):
                    for j in range(i + 1, len(line)):
                        if line[i].value == line[j].value:
                            pairs += 1
            return pairs
        """)


CARDS = {
    "seed1_line_painter": line_painter, "seed2_patchwork": patchwork, "seed3_green_ones": green_ones,
    "rainbow_road": rainbow_road, "border_baron": border_baron, "conqueror": conqueror,
    "parity_painter": parity_painter, "mirrormancer": mirrormancer, "homebody": homebody, "lone_peak": lone_peak,
    "castle_keeper": castle_keeper, "chessmaster": chessmaster, "bridge_builder": bridge_builder,
    "card_windmill": card_windmill, "royal_court": royal_court, "straight_shooter": straight_shooter,
    "number_bonds": number_bonds, "magic_accountant": magic_accountant, "king_of_the_hill": king_of_the_hill,
    "divisibility_detective": divisibility_detective, "stripe_painter": stripe_painter,
    "feuding_families": feuding_families, "colour_mixer": colour_mixer, "fair_weaver": fair_weaver,
    "lantern_lighter": lantern_lighter, "rummy_melder": rummy_melder, "othello_sandwich": othello_sandwich,
    "honest_minesweeper": honest_minesweeper, "bingo_caller": bingo_caller, "sudoku_scholar": sudoku_scholar,
    "full_house": full_house,
}


def gallery(seed: int = 0) -> str:
    """Markdown: every shortlisted card for one example draw, on Grid(5,base10,rainbow6) or, for the
    card-only rules, Grid(5,cards,rainbow6). Regenerate docs/kid-cards.md §1 with
    `python3 -m gridlab.kid --gallery`."""
    import zlib
    import numpy as np
    from . import shortlist
    digits, cards = GridType(5, "base10", "rainbow6"), GridType(5, "cards", "rainbow6")
    out = []
    for f in shortlist():
        gt = digits if f.available(digits) else cards
        p = f.sample(np.random.default_rng(zlib.crc32(f"{f.id}|{seed}".encode())), gt)
        out.append(f"### {f.name} (`{f.id}`, {gt.key})\n\n```python\n{f.card_source(p, gt)}```\n")
    return "\n".join(out)
