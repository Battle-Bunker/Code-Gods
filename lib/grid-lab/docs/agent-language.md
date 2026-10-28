# The Grid agent language

Code: `gridlab/agentlang/` (`lang.py` types, IR and mutator slots; `grammar.py` the probabilistic grammar;
`elab.py` source ↔ IR; `interp.py` interpreter; `pricing.py` decision and destruction bits; `agent.py`
`LangAgent` for the simulator; `examples.py`; `astbytes.py`; `evaluate.py`). Tests:
`python3 -m tests.test_agentlang` (about 5 s). Results: `python3 -m gridlab.agentlang.evaluate`. All
numbers below are for **Grid(5,base10,rgby)** with default `COST_KNOBS`, unless stated otherwise.

**Summary.**

- An agent is now a short program in a kid-sized subset of Python. It can loop over cells and lines,
  branch on what it sees, search over candidate moves with `best(options, by=...)`, and ask its own
  god's utility function `score(...)`. It changes the grid only by calling mutators.
- Its price is `description + decision + destruction`, all in bits:
  - **description** is the program's length under a probabilistic grammar (MDL);
  - **decision** is H(action), the information about the grid the agent actually uses to choose what
    it does (the Szilard–Bennett price of the demon's measurements);
  - **destruction** is the expected erasure and motion of the moves it actually makes, plus the
    existing ratchet charge (Landauer).
- Three checks hold:
  - a one-line literal mutator call costs exactly the Program step's tool + D + E + motion bits, plus a
    fixed framing of 7.75 bits;
  - search costs the same as naming: decision ≤ log2 K, and ≤ the expected bits needed to name the
    chosen move;
  - the code satisfies Kraft's inequality, which is checked program by program.
- CPU is not priced. It is a hard budget of 500,000 steps per interaction.

## 1. The language (for kids)

### 1.1 Your first agents

```python
# Paint row 2 red. Always the same row.
paint(row(2), red)
```

```python
# Find the row with the most red cells, then paint it red.
def how_red(row):
    return row.count(red)

paint(best(grid.rows, by=how_red), red)
```

```python
# Try every paint move and do the one my god likes best, but only if it really helps.
move = best(moves(paint), by=score)
if score(move) > score(grid):
    move
```

An agent is run each time it lands on an object. `grid` is that object. A line that *makes a move*,
such as `paint(row(2), red)` or a variable holding a move, does the move. Moves happen one after another,
and later lines see the grid as the earlier moves left it.

### 1.2 What an agent can look at

| you write | what it is |
|---|---|
| `grid.cells`, `grid.rows`, `grid.columns`, `grid.lines` | lists of cells / rows / columns / rows-then-columns |
| `grid.size` | N (rows and columns are numbered 0 to N−1) |
| `grid.count(red)`, `grid.count(7)` | how many cells are red / show the number 7 |
| `cell(r, c)`, `row(i)`, `column(i)` | one cell, one row, one column |
| `block(r, c, 2)`, `ring(d)`, `diagonal(0)`, `core`, `everything` | a 2×2 or 3×3 square, a ring d steps in, a diagonal, everything off the edge, the whole grid |
| `c.colour`, `c.symbol`, `c.value`, `c.rank`, `c.suit`, `c.is_face` | what a cell shows (`suit`/`is_face` on card grids) |
| `c.row`, `c.column`, `c.neighbours` | where it is, and the 2–4 cells touching it |
| `area.cells`, `area.count(x)`, `area.top_colour` | the cells of any area, a count inside it, its most common colour |
| `red`, `blue`, ... and `colours` | the colours of this grid type, and the list of them |
| `score(move)`, `score(grid)` | how rare **your own god** finds the result, in bits (you can't ask other gods) |
| `moves(paint)`, `every_move` | every possible move of one mutator / of all mutators |

Numbers, `True`/`False`, `+ - * // %`, `== != < <= > >=`, `and or not`, `len sum min max abs any all
range`, lists like `[a, b]`, and list makers like `[c for c in grid.cells if c.colour == red]` all
work as in Python.

### 1.3 Choosing

- `if ...:` / `elif ...:` / `else:` for choices.
- `for x in <list>:` for loops. A loop always ends because lists are finite. There is no `while`.
- `best(things, by=f)` picks the thing with the biggest `f(thing)`; the first one wins ties. `f` can
  be a `def` you wrote above, `lambda x: ...`, or `score` for a list of moves.
- `def name(x):` makes a helper that works something out and `return`s a number or yes/no. A helper
  can use helpers written above it, but not itself (no recursion), and it can't change the grid.
- `return` in the main program stops the agent.

### 1.4 Changing the grid: the mutators

A mutator call names an area and some options. Options with a default can be left out.

| call | what it does |
|---|---|
| `paint(area, colour)` | paint an area one colour (`area` can be `best_line`: the line with the most of that colour) |
| `recolour(area, from_colour, to_colour)` | every cell of one colour turns another colour |
| `swap_colours(area, colour, colour)` | two colours trade places |
| `hue_turn(area, k=1)` | move colours k steps along the rainbow |
| `majority_line(line_or_best_line)` | a line takes its most common colour |
| `pattern_line(line, pattern="ramp", start=..., dir=...)`, `pattern_line(row(1), pattern="alternate", pair=(red, blue))` | a rainbow run or two alternating colours |
| `motif(style="checker", pair=(red, blue))` etc. | wallpaper the whole grid |
| `write(area, number)` | write one symbol everywhere in an area |
| `step_rank(area, k=1)` | count numbers on by k |
| `write_ramp(line, start, dir=1)` | write 3, 4, 5, ... along a line |
| `swap_symbols(area, a, b)`, `flatten(area)`, `stamp(area, colour, number)`, `tally(area, colour)` | number tools |
| `swap_cells(cell, cell, layer="both")`, `shift_line(line, k=1)`, `reverse_line(line)`, `swap_lines(line, line)` | move cells around |
| `turn_block(block(r, c, 2), move="rot90")`, `turn_grid(move="rot90")`, `sort_line(line, dir=1)`, `mirror_fold(area, side=0)` | turn, sort, mirror |
| `paint_by_key(...)`, `blend(area, recipe=...)`, `suit_swap(...)`, `suit_set(...)` | special tools (some grid types only) |

These are exactly the 26 mutators of `gridlab/mutators.py` (docs/mutators.md). Any area or option can be
worked out while running, for example `paint(c, red)` inside `for c in grid.cells:`. If that gives
something the mutator doesn't allow, the agent does nothing on that grid.

### 1.5 Rules

- **No endless work.** Every agent has 500,000 steps per turn. Looking at one thing is 1 step, and
  trying or scoring one move is N² steps. If an agent runs out, it does nothing that turn.
- **Mistakes do nothing.** For example `cell(9, 9)` on a 5×5 grid, or the best of an empty list. The
  grid is left unchanged.
- **Friendly errors before summoning**, for example: *"line 3: no while loops: use for ... in ...
  (loops must have an end)"*, *"paint needs colour"*, *"row numbers go from 0 to 4"*.

### 1.6 The price tag

`explain(src, gtype, owner)` prints the bits of each line and the three totals:

```
   5.3  def how_red(row):
  20.2      return row.count(red)
  23.1  paint(best(grid.rows, by=how_red), red)
        ----
  48.5  bits to write it down (description)
   2.2  bits it looks at to decide what to do (decision)
  10.4  bits it rubs out and moves on the grid (destruction)
  61.2  bits in all = the energy it costs to summon
```

## 2. Design

**Restricted Python, parsed with `ast`, not a new DSL.**

- Kids who learn to code learn Python, and Code Gods already runs Python agents (lib/game-runtime, priced
  by `ast-bytes-v1`), so an agent stays valid Python syntax and the mental model carries over.
- `ast` gives a robust parser, line numbers for error messages and an unparser for free. A DSL would
  need all three built and maintained.
- Safety comes from whitelisting node kinds, names and attributes. Everything else is rejected with a
  message.
- We **interpret** the IR instead of calling `exec`. That makes runs deterministic and lets us count
  steps. Most importantly, it lets us watch the choices the program makes, which is what decision bits
  need.
- Types are inferred (`def` parameters from where the def is used), so kids write no annotations.

**Canonical IR.** `elaborate` turns source into a typed IR in which spelling is gone:

- variable names are dropped (alpha-equivalence);
- `x += 1` becomes `x = x + 1`;
- default and keyword arguments are resolved to the mutator's parameter fields;
- a call with only literal arguments becomes a `ConstCall` carrying the mutator's params;
- `unparse` prints the IR back as kid-style source. The round trip is tested on all examples and on
  thousands of random programs.

**Semantics.** The *action* of a run is the sequence of moves it emitted, each a (mutator, params) pair,
with `best_line` targets resolved to the line actually chosen. The engine semantics are unchanged: an
agent hits a random object, and the result is committed unless it equals an existing object.

## 3. Pricing theory

    cost(P) = description(P) + decision(P) + destruction(P)          (bits; energy pays 1 per bit)

### 3.1 Description: MDL over the AST

The IR is derived by a sequence of choices from a probabilistic grammar. At each choice point the
context fixes the alternatives: the expected type, the variables and defs in scope, the GridType, and
whether we are in the main program or in a helper. For example, a `Num` position offers literal,
variable, cell attribute, count, len, sum/min/max, abs, negation, arithmetic, score, size, best and
def call. The choice costs −log2 p(alternative | context). Literals cost log2 of their range:

| literal | range | bits on 5×5 base10 rgby |
|---|---|---|
| row / column / cell index | N | 2.3 |
| count (compared with a `.count` or `len`) | N²+1 | 4.7 |
| symbol / value / rank | S, values, ranks | 3.3 |
| colour | C | 2 |
| other small numbers | 64 | 6 |

The literal domain is inherited from the expression it is compared with, so `c.row == 3` codes 3 in log2
N bits. Variables cost log2 of the number of variables of the needed type in scope; their names are
free. The default weights are uniform, so every choice among k alternatives costs log2 k.
`lang.WEIGHTS` can change that (§5.4).

**Unification with the mutator code.**

- A `ConstCall` is coded as "which mutator" (log2 #mutators, 4.58 bits for 24 mutators), then the
  mutator's own parameter fields in order (`Mutator.describe_bits`).
- That is the Program step's `base + describe` exactly. With erasure and motion it is the step cost bit
  for bit (tested on random one-step programs).
- The only difference is a fixed framing for a one-line agent: 1 (no helpers) + 2.58 (statement is a
  move) + 1.58 (literal call) + 2.58 (end) = 7.75 bits, against `agent_base` = 2 for Programs.
- When an argument is worked out at run time (a `DynCall`), each computable argument slot pays 1 bit
  for "written out or worked out", then either the field code or an expression.

**Prefix-free code and Kraft.** One walker (`grammar.walk_program`) drives both a `Coder`, which charges
the bits of a given IR, and a `Sampler`, which draws the same choices at random.

- The alternatives at every step depend only on earlier choices, so codewords are paths in a tree:
  prefix-free.
- Code lengths are exactly −log2 of the sampler's probabilities, so Σ_P 2^−L(P) = P(sampler halts) ≤ 1.
- Checks (test + evaluate):
  - for every mutator in every GridType tested, Σ over its parameter space of 2^−D is 1 to 1e−15, so the
    field code is *complete*;
  - 12,000 random programs on four GridTypes survive unparse → parse with identical IR, and each one's
    coder bits equal −log2 of its sampling probability to 1e−6.
- Some codewords are never used: computed arguments that would be written as literals, and new names
  of type "area" holding a cell or line, which read back as the narrower type. So the inequality is
  strict.
- Measured halting mass of the uniform grammar: 0.13–0.15, whether programs are capped at 10 or at 160
  nodes. Uniform weights make the grammar *supercritical*: most random derivations never finish. That
  is harmless for Kraft, but it wastes about log2(1/0.14) ≈ 2.8 bits per program (§6).

**Relationship with `ast-bytes-v1`.**

- `ast-bytes-v1` (lib/game-runtime/README.md) charges 1 byte per AST node, including `Load`/`Store`
  contexts and operator nodes, and literals by their byte length.
- That is the length of a code that spends a fixed 8 bits on every node, whatever the context could
  have been: an *unweighted, context-free* approximation of the same quantity. Both are code lengths
  of the AST.
- MDL instead spends log2(#alternatives in this context) per node: 0 bits for nodes the context
  determines (`Load`, the root, `.cells` after a region), 1–4 bits for typical choices, and log2(range)
  for numbers.
- Over 1,500 random programs MDL ≈ 1.24 × ast-bytes + 1.6 bits (r = 0.96). Over the 17 examples it
  is 1.40 × ast-bytes + 8.7 (r = 0.91), i.e. ≈ 1.8 bits per ast-byte, not 8.
- They disagree most where context matters:
  - `layer="colour"` costs 6 bytes but log2 3 bits;
  - a row index costs 1 byte but log2 N bits;
  - `score` is 1 node in ast-bytes but its choice in MDL depends on whether a move list is being
    searched.

### 3.2 Decision: the demon's measurements

An agent that looks at the grid before acting is a little Maxwell's demon. Szilard showed that a demon
recording one bit of information about a system can extract kT ln 2 of work. Bennett showed where the
bill is paid: the demon must eventually erase its record, and by Landauer that costs kT ln 2 per bit.
So the honest price of looking is the information recorded. Our agent's record is its action A: the
moves it chose. A is a deterministic function of the grid X, so

    decision = H(A) = I(X; A)      over a reference distribution of grids.

Computation that does not change the action is free. Only information that steers behaviour is
charged, which is exactly what "measurement: the price of choosing targets at run time" asks for. A
program that looks at everything but always does the same thing pays 0. `paint(best_line, red)` pays
≈ log2 10 = 3.3, exactly what mutators.md charges as `line*`'s measurement term M.

**Search costs the same as naming.**

- `best` over K candidates records one of K outcomes, so its decision bits are ≤ log2 K. A search whose
  winner is nearly always the same move costs ≈ 0, as if that move were simply named.
- If an agent named the chosen move literally on each grid, the code length would average
  E[log2 #mutators + D(move)]. By Shannon's source coding theorem that is ≥ H(A). So computing the target
  never costs more decision bits than writing the target down would; search adds only its fixed
  description.
- Table §4.3 checks both inequalities.

**Estimator.** Prices are measured at summon time on a fixed-seed reference sample (n = 288, below),
deterministically, and cached.

1. *Joint plug-in, Miller–Madow corrected*: Ĥ = −Σ p̂ log2 p̂ + (m−1)/(2n ln 2), with m the number of
   distinct actions. We report the standard error √(Var[−log2 p̂(A)]/n) and the Good–Turing coverage
   1 − f₁/n (f₁ = actions seen once).
   - The plug-in cannot exceed log2 n. With n = 288 it saturates at about 8 bits: "paint every blue
     cell red" uses ≈ 20 bits but its plug-in reads 8.3.
   - So when coverage is below 0.5 the joint estimate is not trusted.
2. *Chain bound* (the default whenever the joint is unreliable). The interpreter records every choice
   point the main program passes. Each site gets a value: the outcome, or ⊥ if not reached.
   - The site is identified by (program node, iteration counters of the enclosing loops).
   - The recorded choices determine the action, so by subadditivity H(A) ≤ H(choices) ≤ Σ_sites H(site).
   - Each site has a small alphabet (≤ #branches + 1), so its Miller–Madow estimate is well resolved.
     A site with coverage < 0.5 is charged its maximum, log2(#branches + 1).
   - For "paint every blue cell red" this gives 18.5 bits (25 sites × H_b(≈0.25), on the mixture).
3. *Path bound*: the mean over runs of Σ log2 #branches along the path, plus H_b(P(abort)). This is
   the expected length of a prefix code for the choices, hence ≥ H(choices) ≥ H(A).
4. *Static bound* from the program text: the max over paths, `if` → 1 + max of the branches, `for` → its
   length × the body, `best` → log2 of the list's largest possible length, a computed argument → log2
   of its field's choices, + 1 bit for "aborted".

   decision = min(joint if coverage ≥ 0.5, chain, path, static)

`price(...)` returns all four, which one binds, the standard error, coverage, and the per-component
entropies.

*What counts as a choice point.* Every value carries a taint flag: not yet determined by the program
text plus the choices recorded so far. In the main program:

- `if` on a tainted condition is 1 bit;
- `best` over an untainted list with tainted keys is log2 len(list), and its result becomes untainted;
- a tainted computed mutator argument is log2 #choices of its field;
- `for` over a tainted list is log2(max length + 1), and the loop variable stays tainted;
- acting on a tainted move is log2 #all moves;
- a `best_line` target is log2 2N.

Inside defs, lambdas and comprehensions nothing is recorded. Their results are tainted if they depend
on the grid, including through `if`. By induction the recorded choices determine the action. That is
what makes bounds 2 and 3 valid.

**Reference distribution: a mixture.** Every agent is priced on the same grids (common random
numbers), seeded from the GridType:

| component | n | what |
|---|---|---|
| uniform | 128 | spawns from the prior μ |
| structured | 64 | spawns after 1–3 random cheap Programs (step costs ≤ 40 bits) |
| game | 64 | objects from snapshots of 3 fixed-seed 120 s games of Program agents (random + greedy policies), disk-cached |
| self | 32 | states the agent itself visits when re-applied to the 24 ratchet probes |

Uniform grids alone would let a program behave constantly on random grids and discriminate only on
structured ones for free. The attack in `examples.ATTACK` does that: "if one colour already covers ≥ 13
cells, repaint every big number in that colour". On uniform grids it reads 0.1 bits; on game states 1.6
bits. §4.4 shows it is caught.

### 3.3 Destruction: Landauer, motion and the ratchet

    destruction = E_ref[ Σ_emitted erase(m) + 0.35 · ((Σ dcol)² log2 C + (Σ dsym)² log2 S) / N² ] + ratchet

- **Erasure.** Each emitted move pays its mutator's own expected erasure E (mutators.md §1b), at the same
  knobs. Moves on grids where the agent decides to do nothing pay nothing.
- **Motion** is computed on the *whole run's* expected changed cells, not per move. Otherwise a loop of
  25 single-cell paints would pay 25 × 0.05 bits of motion instead of a fill's 9.8. The quadratic
  motion is superadditive, and splitting would dodge it.
- **Ratchet.** The same closure probe as `Program.ratchet_bits`: re-apply the agent to 24 probe grids
  until it stops. Then charge log2(alphabet) for every cell layer pinned by the closure beyond what one
  application pins. `row_painter_search` pays 50: repeated, it paints the whole grid yellow one row at a
  time.

**How tight is H(A) + erasure?** Write the agent's map as f(x) = m_A(x)(x). Then exactly

    H(X) − H(f(X)) = [H(X | A) − H(f(X) | A)] + H(A | f(X))

The left side is the true Landauer cost of the map. It is the conditional erasure of the chosen moves,
plus the part of the decision that cannot be read back from the result. We charge H(A) + E[E_prior(m_A)].
For projection-type moves (paint, write, fold), the conditional erasure is at most the prior erasure,
so the charge is an **upper bound**. The slack is I(A; f(X)) plus the conditioning gain.

Example: `recolour_by_hand` (a loop that paints every blue cell red) implements exactly
`recolour(everything, blue, red)`. The map erases 12.5 bits. We charge 18.5 decision + 11.1 destruction
= 29.6 bits; the tool is charged 0 + 13.6. Re-implementing a conditional tool by hand costs ≈ 2.2× in
decision + destruction. That is the conservative direction, and it keeps tools worth having.
Merge-type moves (recolour) chosen only when the grid suits them can still be *under*-charged by prior
erasure (mutators.md risk 4). The decision bits cover part of that.

### 3.4 CPU, determinism, caching

- CPU is a hard per-interaction budget, `interp.STEP_LIMIT` = 500,000 steps (≈ 5 ms at 10 ns/step).
  Each IR node is 1 step; each move tried or scored is N² steps.
- `full_greedy` (all 7,822 moves) uses 391k steps on 5×5. Larger grids push it over the budget, and then
  it does nothing.
- Scoring a list of paint/recolour/swap_colours/hue_turn/write/step_rank candidates is vectorised
  (`interp.batch_results`, tested equal to `Mutator.apply`). The step charge is the same either way.
- Prices are deterministic and cached in memory and under `.cache/agentlang/`. The key is
  sha256(canonical IR, GridType, owner's family + params + survival-table key [only if the agent calls
  score], `PRICING`, `COST_KNOBS`, the source of the pricing modules, mutators.py and program.py).
- An agent that calls `score` is priced for its owner, because its behaviour depends on the owner's
  utility. Agents that don't are priced once and shared by all gods.

## 4. Results

### 4.1 Cost table (owner for `score`: seed1_line_painter, "lines of yellow cells score their sum")

COSTS_TABLE

"Program" is the cost of the same agent as a `gridlab.program.Program`, where one exists. "bound" says
which decision estimate was charged.

- **Fixed agents** cost the Program price + 5.75 bits of framing.
- **Relative agents** (`reddest_row`, `copy_top_colour`, `join_the_crowd`, `biggest_to_corner`) pay 2–4
  decision bits: what they actually look at. Their larger cost is mostly description: 48–66 bits of
  program text against 17 for the built-in `best_line`.
- **Search agents that call the owner's utility** pay little decision when the best move is
  predictable. Seed 1 loves whole-grid yellow, so `greedy_paint` chooses "paint everything yellow" on
  almost every grid. They then pay the destruction of that big move: 54 bits, the same as naming the
  fill (77 − 17 + 15).

The same four search agents priced for other owners (total, with decision bits in brackets):

BY_OWNER_TABLE

When no paint helps (mirrormancer and staircase_climber care about symbols), the search always ties,
takes the first move, and costs only its description plus one cell's paint. For rainbow_road the best
paint differs from grid to grid, and the agent pays 6 bits for that choice.

### 4.2 Description: ast-bytes and a fitted grammar

ASTBYTES_SUMMARY

Fitting the grammar's production weights on the other example agents (add-one; leave-one-out;
mutator choice and literals kept uniform so unification survives) shortens programs by 8–42%. Search
idioms shrink most, because they repeat across the templates:

WEIGHTS_TABLE

### 4.3 Search ≤ log2 K, and computing vs naming the target

SEARCH_TABLE

- Decision bits are far below log2 K: the winners are predictable.
- They are also below the bits it would take to write the chosen move down (`E[naming bits]`).
- For `greedy_paint` the total of description + decision (15.9) equals the price of naming a typical
  winner as a literal call (10.0 + 5.75 framing).

### 4.4 The structured-grid attack is caught

ATTACK_TABLE

- Priced on uniform grids alone, the threshold-13 attack would cost 0.1 bits of decision. The mixture
  charges 0.6, six times more.
- Its true use on in-play states is 1.6 bits. Because uniform grids are half the mixture, the attack
  keeps a ≈ 1 bit discount against a pure game-state measurement (§6).

### 4.5 Yield per bit by owner family (game states)

Mean gain in the owner's surprisal per bit of cost, ×100, on the 64 game-state grids. Each language
kind shows its best template, against the best of 512 random library Programs:

YIELDS_TABLE

YIELDS_TEXT

### 4.6 Simulated games

Four gods, fixed 300 s, 20 Hz, 16 seeds per cell (mean ± standard error). Policies `greedy` = four
`greedy_private`; `mixed` = random, greedy_private, saver, greedy_omniscient. Conditions:

- `off`: today's Program agents only.
- `mix`: half of each god's candidates are language agents.
- `heavy`: 90% language agents.
- `only`: language agents only.
- `asym01` / `asym23`: only gods 0–1 (or 2–3) may use language agents.

The language catalogue has 13 templates × colours (54 agents at rgby). Eight of them search with
`score`.

GAMES_TABLE

Payoff gained by each class of agent (own payoff change over its commits), per bit spent, pooled over
all language conditions:

CLASSES_TABLE

Does language access help a god win? The same seed is played with gods 0–1 and then gods 2–3 holding
language access, so each god is compared with itself:

ASYM_TABLE

GAMES_TEXT

## 5. Kid-readability

| agent | lines | ideas used |
|---|---|---|
| paint_one_row, fill_grid, paint_best_line, recolour_tool | 1 | a mutator call |
| guarded_row | 2 | `if` |
| recolour_by_hand, fix_mixed_rows | 3 | `for`, `if` |
| greedy_paint | 1 | `best`, `score` |
| careful_greedy, full_greedy | 3 | `best`, `score`, `if` |
| reddest_row, copy_top_colour | 3–4 | `def`, `best` |
| biggest_to_corner | 2 | `best`, `lambda` |
| join_the_crowd, row_painter_search, greedy_swap | 3–4 | list maker `[... for ...]`, `best`, `def`/`score` |
| two_greedy_steps | 4 | `for`, `best`, `score`, `if` |

- Every example is at most 4 lines and reads as an English sentence once `best(..., by=...)` is known
  ("the best of the rows, by how red").
- The two hardest ideas for a 12-year-old are `lambda` and list makers. The language lets kids avoid
  both: a `def` helper does what a lambda does, and `moves(paint)` / `grid.cells` already are the lists.
  Teaching material should start with `def` and add comprehensions later.
- Compared with today's Program agents, written as English by `Program.describe` ("If row 1 has at least
  3 red cells: paint row 1 red."), the code is no longer than the sentence. It also makes the cost
  visible: `explain` puts a bit price on every line, so "this line costs 20 bits" teaches MDL directly.
- Error messages are written for kids and name the line.

## 6. Recommendations

RECOMMENDATIONS

## 7. Reproducing

```
cd lib/grid-lab
python3 -m tests.test_agentlang                                   # ~5 s
python3 -m gridlab.agentlang.evaluate --only costs,astbytes,weights,kraft,search,attack
python3 -m gridlab.agentlang.evaluate --only yields
python3 -m gridlab.agentlang.evaluate --only games --games 16 --processes 4   # ~1 h cold, cached per game
```

In the simulator: `GameConfig(agent_language="mix", lang_share=0.5, lang_templates=None, lang_gods=None,
lang_pricing={})`. The default `agent_language="off"` leaves every existing result unchanged (tested).
`GameLog.a_label` records `program` or `<kind>:<template>` per agent.
