# Kid cards: every shortlisted rule as a utility function a 12-year-old can read

Each shortlisted family has a `card_source(params, gtype) -> str` (`gridlab/rules/cards.py`). It renders a
complete Python program for one dealt god: a header comment (emoji, name, 1-3 plain sentences on what earns
points), the dealt settings as UPPER_CASE constants, and `def utility(grid):` written against the kid API
([kid-api.md](kid-api.md), `gridlab/kid.py`). **The card is the source of truth players read.**

`python3 -m tests.test_cards` checks every shortlisted family × every GridType where it is available × 2 param
draws (1,717 GridType pairs, 3,434 cards). Each card runs in the sandbox on 300 grids: 200 uniform, the exemplar
and 30 perturbations of it, monochrome grids, and low-entropy grids (2 colours, 2-3 symbols) that make ties
and rare events common. The card's return values must induce **exactly** the internal ordinal's order: the
same pairwise comparisons, ties included. The test also checks the source itself (header shape, no imports,
numpy, lambdas or globals, at most 60 lines of at most 110 characters), that the return kind is consistent,
and that the card is deterministic. A spot-check of 10 hand-made one-token mistakes found 9 of them caught, each on 21% to 100% of
draws. The tenth (Card Windmill checking 3 turns instead of 4) is not a mistake: 3 good turns force the 4th.

Regenerate §1 with `python3 -m gridlab.kid --gallery`. Run a card yourself with
`python3 -m gridlab.kid card.py --type 5,base10,rgby -n 3`.

## 1. Every shortlisted card, for one example draw

Shown on Grid(5,base10,rainbow6), or Grid(5,cards,rainbow6) for the card-only rules (Card Windmill, Royal
Court). Other draws change the constants and, where a setting changes the structure (which lines, diagonals
on or off, a variant mode), only the code that actually runs is shown.

### Line Painter (`seed1_line_painter`, Grid(5,base10,rainbow6))

```python
# 🖍️ Line Painter
# Your colour scores when it lines up. Each green cell that touches another green cell in a
# straight line (across, down and along both diagonals) earns its value, once for every direction
# it lines up in.
MY_COLOUR = "green"

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
            points += cell.value
        if is_mine(cell.up_left) or is_mine(cell.down_right):
            points += cell.value
        if is_mine(cell.up_right) or is_mine(cell.down_left):
            points += cell.value
    return points
```

### Patchwork (`seed2_patchwork`, Grid(5,base10,rainbow6))

```python
# 🧩 Patchwork
# A patch is a group of 2 or more touching cells showing the same number. A patch scores its size
# × its value, but only if no two touching cells inside it share a colour.

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
```

### Green Ones (`seed3_green_ones`, Grid(5,base10,rainbow6))

```python
# 🍀 Green Ones
# Count the green 1s. If that's a tie, count the cells that are halfway there: the right colour or
# the right number, but not both.
MY_COLOUR = "green"
MY_VALUE = 1

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
```

### Rainbow Road (`rainbow_road`, Grid(5,base10,rainbow6))

```python
# 🌈 Rainbow Road
# Read every column top to bottom. A step scores when the next colour is the next one round the
# rainbow (red → orange → yellow → green → blue → violet → red). A whole column of rainbow steps
# beats any number of single steps.

def utility(grid):
    whole_lines = 0
    steps = 0
    for line in grid.columns:
        good = 0
        for i in range(len(line) - 1):
            if line[i + 1].colour == next_colour(line[i].colour):
                good += 1
        steps += good
        if good == len(line) - 1:
            whole_lines += 1
    return (whole_lines, steps)
```

### Border Baron (`border_baron`, Grid(5,base10,rainbow6))

```python
# 🏰 Border Baron
# Touching cells of one colour form a country. Every place where two countries touch is a border,
# and it scores when both countries have at least 4 cells. If that's a tie, each border counts the
# size of its smaller country (up to 4).
BIG = 4

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
```

### Conqueror (`conqueror`, Grid(5,base10,rainbow6))

```python
# ⚔️ Conqueror
# Your colour against your enemy's. Each green cell adds 1 point, and each yellow cell takes 1
# point away.
MY_COLOUR = "green"
ENEMY_COLOUR = "yellow"

def utility(grid):
    points = 0
    for cell in grid.cells:
        if cell.colour == MY_COLOUR:
            points += 1
        elif cell.colour == ENEMY_COLOUR:
            points -= 1
    return points
```

### Parity Painter (`parity_painter`, Grid(5,base10,rainbow6))

```python
# 🎭 Parity Painter
# Even numbers should be orange and odd ones yellow. A cell in its right colour is +1; a cell
# wearing the other team's colour is −1.
EVEN_COLOUR = "orange"
ODD_COLOUR = "yellow"

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
```

### Mirrormancer (`mirrormancer`, Grid(5,base10,rainbow6))

```python
# 🪞 Mirrormancer
# A column is a mirror when its colours read the same forwards and backwards. Count mirror
# columns; if that's a tie, count matching pairs (first and last, second and second-last, ...).

def utility(grid):
    mirrors = 0
    pairs = 0
    for line in grid.columns:
        half = len(line) // 2
        matches = 0
        for i in range(half):
            if line[i].colour == line[len(line) - 1 - i].colour:
                matches += 1
        pairs += matches
        if matches == half:
            mirrors += 1
    return (mirrors, pairs)
```

### Homebody (`homebody`, Grid(5,base10,rainbow6))

```python
# 🏡 Homebody
# Your colour likes to stay home in the edge (the outside ring). Each yellow cell at home is +1,
# and each one away from home is −1.
MY_COLOUR = "yellow"

def utility(grid):
    points = 0
    for cell in grid.cells:
        if cell.colour == MY_COLOUR:
            if cell.on_edge:
                points += 1
            else:
                points -= 1
    return points
```

### Lone Peak (`lone_peak`, Grid(5,base10,rainbow6))

```python
# 🏔️ Lone Peak
# The highest number on the grid is the peak. If there is just one peak and it is violet, score
# how far it stands above the next highest. If that's a tie, it helps if one of the peaks is
# violet.
MY_COLOUR = "violet"

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
```

### Castle Keeper (`castle_keeper`, Grid(5,base10,rainbow6))

```python
# 🏯 Castle Keeper
# Build yellow walls. Every cell that the walls shut off from the edge of the grid scores a point.
# If that's a tie, more yellow wall on the edge is better.
WALL = "yellow"

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

def utility(grid):
    outside = grid.reachable(grid.edge_cells, through=not_wall)  # cells you can walk to from the edge
    shut_in = 0
    for cell in grid.cells:
        if inside(cell, outside):
            shut_in += 1
    return (shut_in, walls_on_edge(grid))
```

### Chessmaster (`chessmaster`, Grid(5,base10,rainbow6))

```python
# ♟️ Chessmaster
# Every 2×2 square coloured like a chessboard in blue and red scores a point. If that's a tie,
# count the places where a blue cell touches a red cell.
COLOUR_A = "blue"
COLOUR_B = "red"

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
```

### Bridge Builder (`bridge_builder`, Grid(5,base10,rainbow6))

```python
# 🌉 Bridge Builder
# Build a bridge of touching red cells from the left edge to the right edge. Score how many
# columns your biggest red bridge reaches across.
MY_COLOUR = "red"

def same_colour(a, b):
    return a.colour == b.colour

def utility(grid):
    best = 0
    for bridge in grid.regions(same_colour):
        if bridge[0].colour != MY_COLOUR:
            continue
        columns = set()
        for cell in bridge:
            columns.add(cell.col)
        best = max(best, len(columns))
    return best
```

### Card Windmill (`card_windmill`, Grid(5,cards,rainbow6))

```python
# 🌀 Card Windmill
# Turn the grid a quarter turn clockwise: every card lands on another spot. A turn is good when
# the card there has the next suit (♠ → ♥ → ♦ → ♣ → ♠). Count the cards whose four turns are all
# good (a full windmill); if that's a tie, count good turns.

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
```

### Royal Court (`royal_court`, Grid(5,cards,rainbow6))

```python
# 👑 Royal Court
# Put a picture card (J, Q, K) of spades in the very middle. Your court is it plus every such card
# joined to it through touching cells: score its size, doubled if none of it is on the edge. If
# that's a tie, count those picture cards that are off the edge.
MY_SUIT = "spades"

def royal(cell):
    return cell.is_picture and cell.suit == MY_SUIT

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
```

### Straight Shooter (`straight_shooter`, Grid(5,base10,rainbow6))

```python
# 🎯 Straight Shooter
# Find runs of 3 or more numbers that count down by one, reading rows left to right and columns
# top to bottom. A run scores its length × its length, doubled if it is all one colour. If that's
# a tie, count single counting steps.
STEP = -1  # count down

def number(cell):
    return cell.value

def one_colour(run):
    for cell in run:
        if cell.colour != run[0].colour:
            return False
    return True

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
            steps += len(run) - 1
            if len(run) >= 3:
                points = len(run) * len(run)
                if one_colour(run):
                    points *= 2
                score += points
    return (score, steps)
```

### Number Bonds (`number_bonds`, Grid(5,base10,rainbow6))

```python
# 🤝 Number Bonds
# Two touching cells are best friends when their numbers add up to 10. Every pair of best friends
# scores a point.
TARGET = 10

def utility(grid):
    bonds = 0
    for cell in grid.cells:
        for other in (cell.right, cell.down):
            if other is not None and cell.value + other.value == TARGET:
                bonds += 1
    return bonds
```

### Magic Accountant (`magic_accountant`, Grid(5,base10,rainbow6))

```python
# 🧮 Magic Accountant
# Every row whose numbers add up to exactly 26 scores a point. If that's a tie, it's better when
# the totals are closer to 26.
TARGET = 26

def utility(grid):
    exact = 0
    distance = 0
    for line in grid.rows:
        total = 0
        for cell in line:
            total += cell.value
        if total == TARGET:
            exact += 1
        distance += abs(total - TARGET)
    return (exact, -distance)
```

### King of the Hill (`king_of_the_hill`, Grid(5,base10,rainbow6))

```python
# ⛰️ King of the Hill
# A yellow cell is a king when its number is higher than every cell touching it. Each one scores a
# point.
MY_COLOUR = "yellow"

def utility(grid):
    kings = 0
    for cell in grid.cells:
        if cell.colour != MY_COLOUR:
            continue
        if all(cell.value > other.value for other in cell.neighbours):
            kings += 1
    return kings
```

### Divisibility Detective (`divisibility_detective`, Grid(5,base10,rainbow6))

```python
# 🔍 Divisibility Detective
# Read each row and column as one big number. Every one that divides exactly by 10 scores a point.
BASE = 10
DIVIDE_BY = 10

def utility(grid):
    found = 0
    for line in grid.rows + grid.columns:
        number = 0
        for cell in line:
            number = number * BASE + cell.value
        if number % DIVIDE_BY == 0:
            found += 1
    return found
```

### Stripe Painter (`stripe_painter`, Grid(5,base10,rainbow6))

```python
# 🦓 Stripe Painter
# A stripe is a column all in one colour. Each stripe scores a point unless the column just before
# it is a stripe of the same colour. If that's a tie, count how many cells of each column match
# its most common colour.

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
    for line in grid.columns:
        count = most_common(line)
        nearly += count
        if count == len(line):
            if line[0].colour != previous:
                stripes += 1
            previous = line[0].colour
        else:
            previous = None
    return (stripes, nearly)
```

### Feuding Families (`feuding_families`, Grid(5,base10,rainbow6))

```python
# 😤 Feuding Families
# Orange and red cells are feuding. A cell is safe when it doesn't touch the other family. Score
# the safe cells of whichever family has fewer; if that's a tie, count all safe cells.
FAMILY_1 = "orange"
FAMILY_2 = "red"

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
```

### Colour Mixer (`colour_mixer`, Grid(5,base10,rainbow6))

```python
# 🎨 Colour Mixer
# Yellow + blue = green. A green cell scores when it sits between its two paints: yellow on one
# side and blue on the opposite side. If that's a tie, count green cells touching either paint.
PAINT_1 = "yellow"
PAINT_2 = "blue"

MIXED = mix(PAINT_1, PAINT_2)

def touches(cell, colour):
    for other in cell.neighbours:
        if other.colour == colour:
            return True
    return False

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
```

### Fair Weaver (`fair_weaver`, Grid(5,base10,rainbow6))

```python
# 🧶 Fair Weaver
# A row or column is fair when every colour (red, orange, yellow, green, blue, violet) appears
# almost equally often: the most common and least common differ by at most 1. Count the fair
# lines; if that's a tie, smaller differences are better.

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
```

### Lantern Lighter (`lantern_lighter`, Grid(5,base10,rainbow6))

```python
# 🏮 Lantern Lighter
# A green cell is a lantern when it is the only green cell in its row and the only one in its
# column. Each lantern scores a point.
MY_COLOUR = "green"

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
```

### Rummy Melder (`rummy_melder`, Grid(5,base10,rainbow6))

```python
# 🃏 Rummy Melder
# Look along each row at 3 cells in a row. They are a meld if they are a set (same number, 3
# different colours) or a run (counting up by one, all the same colour). Every cell in a meld
# scores its value. If that's a tie, count touching pairs that could start a meld.

def suit(cell):
    return cell.colour

def is_set(a, b, c):
    return a.value == b.value == c.value and suit(a) != suit(b) and suit(b) != suit(c) and suit(a) != suit(c)

def is_run(a, b, c):
    return b.value == a.value + 1 and c.value == b.value + 1 and suit(a) == suit(b) == suit(c)

def half_meld(a, b):
    return (a.value == b.value and suit(a) != suit(b)) or (b.value == a.value + 1 and suit(a) == suit(b))

def utility(grid):
    score = 0
    pairs = 0
    for line in grid.rows:
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
```

### Othello Sandwich (`othello_sandwich`, Grid(5,base10,rainbow6))

```python
# 🥪 Sandwich Maker
# A cell is sandwiched when the cells on both sides of it (left and right, or above and below) are
# red and it isn't. Each sandwich is a point.
MY_COLOUR = "red"

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
            sandwiches += 1
    return sandwiches
```

### Honest Minesweeper (`honest_minesweeper`, Grid(5,base10,rainbow6))

```python
# 💣 Honest Minesweeper
# Green cells are mines. Any other cell is honest when its number equals how many mines surround
# it (corners count). Each honest cell scores its value.
MINE = "green"

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
```

### Bingo Caller (`bingo_caller`, Grid(5,base10,rainbow6))

```python
# 🎱 Bingo Caller
# Dab every cell showing a called number. The middle cell is a free space. Each dab is a point,
# and every complete row, column or long diagonal is BINGO: 5 more points.
CALLED = [0, 1, 6, 9]

def dabbed(grid, cell):
    return cell.value in CALLED or cell is grid.cell(grid.size // 2, grid.size // 2)

def utility(grid):
    points = 0
    for cell in grid.cells:
        if dabbed(grid, cell):
            points += 1
    for line in grid.rows + grid.columns + grid.diagonals:
        if all(dabbed(grid, cell) for cell in line):
            points += grid.size
    return points
```

### Sudoku Scholar (`sudoku_scholar`, Grid(5,base10,rainbow6))

```python
# 🔢 Sudoku Scholar
# Every row where no number appears twice scores a point. If that's a tie, more different numbers
# in each line is better.

def different(line):
    seen = []
    for cell in line:
        if cell.value not in seen:
            seen.append(cell.value)
    return len(seen)

def utility(grid):
    perfect = 0
    variety = 0
    for line in grid.rows:
        d = different(line)
        variety += d
        if d == len(line):
            perfect += 1
    return (perfect, variety)
```

### Full House (`full_house`, Grid(5,base10,rainbow6))

```python
# 🏠 Full House
# In each column, every pair of cells showing the same number scores a point (three of a kind
# makes 3 pairs, four makes 6).

def utility(grid):
    pairs = 0
    for line in grid.columns:
        for i in range(len(line)):
            for j in range(i + 1, len(line)):
                if line[i].value == line[j].value:
                    pairs += 1
    return pairs
```


## 2. What the player sees

A mock of the "my god" panel for a Sandwich Maker god on Grid(5,base10,rgby), looking at one grid in the
world. The numbers are real: the card's score is 6, and the calibrated survival table for this draw gives
μ{u ≥ 6} = 0.0069 (7.18 bits).

```text
┌────────────────────────────────────────────────────────────┐
│ 🥪 Sandwich Maker                       your secret card ▸ │
│                                                            │
│      🟨2  🟥3  🟦3  🟦7  🟩0                                │
│      🟩4  🟨5  🟦4 [🟩5] 🟦7        [ ] = sandwiched cell    │
│      🟨7  🟥3  🟦7  🟦7  🟦8                                │
│      🟥4  🟩1 [🟩7] 🟨6 [🟩6]                               │
│      🟦7 [🟩9] 🟦9 [🟨4] 🟦0                                │
│                                                            │
│   utility(grid)  →  6                                      │
│                                                            │
│   🌟 Rare!  Only 1 random grid in 145 does this well.       │
│   ✨ 7.2                                                    │
└────────────────────────────────────────────────────────────┘
```

(The green 5 is sandwiched twice: blue on its left and right, and blue above and below.) For a tie-break card
the panel shows the tuple as it is, then says how to read it: `utility(grid) → (2, 11)` "2 whole rainbow rows;
11 rainbow steps".

### Rarity wording

The same grids, three ways (this draw's real table; the last row is a jackpot for a rule with a deep ceiling):

| score | tail μ{u ≥ score} | "better than … of 1,000 random grids" | "1 in N" | bits ✨ |
|---|---|---|---|---|
| 2 | 0.40 | 596 | 1 in 2.5 | 1.3 |
| 4 | 0.072 | 928 | 1 in 14 | 3.8 |
| 6 | 0.0069 | 993 | 1 in 145 | 7.2 |
| 8 | 0.00043 | 1,000 (saturated) | 1 in 2,300 | 11.2 |
| 12 | 8.5 × 10⁻⁷ | 1,000 (saturated) | 1 in 1.2 million | 20.2 |
| jackpot | 2⁻⁴⁰ | 1,000 (saturated) | 1 in 1.1 trillion | 40 |

**Pick: "1 in N" as the headline, ✨ bits as the score unit.**
- "Better than 993 of 1,000" reads well for middling grids but saturates at 999. Everything the game cares
  most about (8+ sandwiches here, every jackpot) shows as the same "1,000 of 1,000".
- "1 in N" never saturates and is already kid idiom ("one in a million"). It is honest about ties: N counts
  random grids that are *at least* this good. Show 2 significant figures above 1,000, with words for big
  numbers ("1 in 1.2 million"). When N < 2, say "an everyday grid" instead of "1 in 1.4".
- Bits are what the payoff multiplies (π = s_i · S_−i), so they are the right *score* unit, but "7.2 bits"
  means nothing to a 12-year-old. Show them as ✨ with one sentence: "each ✨ means twice as rare". Then
  "1 in 145" and "✨ 7.2" are the same fact (2^7.2 ≈ 145).

## 3. Readability rules for card authors (AIs writing future cards)

1. **One function, always `def utility(grid):`.** Say "utility function", never "value function". No other
   parameters: settings are constants, and the grid type is implied by the grid.
2. **Header: `# <emoji> <Name>`, then 1-3 plain sentences** saying what earns points, in the order the code
   checks it. A tie-break sentence starts "If that's a tie, …". No jargon: ordinal, lexicographic, orbit,
   component, parity, modulo, plurality and normalise are all banned.
3. **Dealt settings are UPPER_CASE constants at the top, named for their role** (`MY_COLOUR`, `ENEMY_COLOUR`,
   `WALL`, `TARGET`, `CALLED`). Values are words and printed numbers, never indices. Add a comment where a
   number hides a name (`MY_VALUE = 1  # Ace`).
4. **Bake structural choices into the code.** If a setting picks rows vs columns, diagonals on or off, or a
   scoring mode, render only the branch that runs. The header says which.
5. **Names, not indices.** Walk `grid.cells`, `grid.rows`, `grid.columns`. Use `cell.left`, `cell.up` and
   `cell.neighbours`, not `r + 1` arithmetic. Use `line[len(line) - 1 - i]`, not `line[-1 - i]`.
6. **Plain Python only.** `for`, `if`, `+=`, small named helpers, `len`/`max`/`min`/`all`/`any`/`abs`, sets
   and dicts used plainly, and at most a one-`for`, one-`if` list comprehension. No `lambda`, nested
   comprehensions, `global`, recursion, imports, numpy, slicing tricks or chained ternaries.
7. **One idea per helper, named for the idea** (`is_mine`, `safe`, `colourful`, `runs`). Helpers take what they
   need as arguments. Keep cards to about 40 lines and 3 helpers.
8. **Guard the edge explicitly:** `cell is not None and …` (the `is_mine` pattern).
9. **Use the grid's helpers for fiddly jobs:** `grid.reachable` (flood fill), `grid.regions` (groups),
   `grid.quarter_turn` (rotation). Never hand-write a BFS on a card.
10. **Return an int, or a tuple of ints of fixed length, bigger = better.** A tuple is a league table:
    primary score first, then tie-breaks. Prefer `-distance` to "maximum minus distance". No normalising,
    squaring for effect, or bonuses that never change which grid wins.
11. **Capability helpers only where the rule requires the capability** (`cell.suit` / `cell.is_picture` for
    Suited / Faced, `next_colour` for Spectral, `mix` for Mixable). The dealer never deals a card on a grid
    without them.
12. **A kid should be able to check the score by pointing at the grid.** If they can't, simplify the rule.
13. **The card must order grids exactly like the internal ordinal** (`tests/test_cards.py`). When the clean
    card and the ordinal disagree, change the family to match the card and record it in §4 and docs/rules.md.

## 4. Rule changes made for the cards

Only one family changed its order. Everything else either matched as written or was restated equivalently.

| Family | Change | Why |
|---|---|---|
| `card_windmill` | Tie-breaker counts all **4** quarter-turn steps of each windmill (wrapping round), not 3. The primary score is unchanged: 3 good steps already force the 4th. | "For every card, is the card it turns onto the next suit?" is one loop over `grid.cells` with no fundamental-domain bookkeeping. The old 3-step count depended on which corner an orbit "starts" at, which no kid could see. |

Order-preserving clean-ups made while removing `lex`, so the internal ordinals read like the cards (same order,
so no calibration effect beyond the cache rebuild):

| Family | Before | After |
|---|---|---|
| `magic_accountant`, `seesaw` | tie-breaker `D − Σ|…|` (D = a bound) | `−Σ|…|` |
| `fair_weaver` | tie-breaker `2N² − Σ(max − min)` | `−Σ(max − min)` |
| `sudoku_scholar` (N ≤ 4) | int 0/1 | `(0 or 1, 0)`, so the tuple length is constant; the card returns 0/1 |

Equivalent restatements on the cards (no change to the family, verified by the test):

| Card | Internal definition | Card says |
|---|---|---|
| Line Painter | Σ value over cells in maximal same-colour runs of length ≥ 2, once per direction | a cell scores once per direction in which it touches a same-colour cell |
| Border Baron | adjacent cells in different same-colour components | touching cells of different colours |
| Castle Keeper | non-wall components with no rim cell | non-wall cells you can't walk to from the edge |
| Card Windmill | #full orbits | #cards in full windmills (4 per windmill) |
| Sandwich Maker (`othello_sandwich`) | `X ? X` triples along each direction | the middle cell's view: both sides are mine and I'm not |
| Sudoku Scholar (N ≤ 4) | `(all distinct, 0)` | 1 or 0 |
