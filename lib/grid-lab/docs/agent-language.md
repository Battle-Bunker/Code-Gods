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

**Headline results** (§4):

- Statically, search agents are not better buys: their surprisal per bit on game states is in the same
  Landauer band as the best Programs.
- In play, owner-score search dominates. It never acts against its owner and gains 25× more owner
  payoff per bit than Programs. Language access is worth about 0.8 of a place in the final ranking for
  greedy gods (66% of wins).
- This is not a pricing leak. The charged decision bits match the information used in play to about
  1 bit. Avoiding harm is worth far more than the 1 bit it costs.
- More language means more tension, more spirals, 10–35× welfare and more inequality, but less mutator
  variety.
- A 50/50 mix of language agents and Programs is the most dynamic setting.
- §6 lists the levers if search should be reined in.

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
  score], `PRICING`, `COST_KNOBS`, and the source of the pricing modules and of everything that shapes
  the reference grids: mutators, program, sim, policy, calibrate, family, core, rules).
- `score` is the owner's *reward* channel: the draw's surprisal. With defence goals switched on
  (docs/defence-goals.md) it ignores the penalty channel. That is a known limitation.
- An agent that calls `score` is priced for its owner, because its behaviour depends on the owner's
  utility. Agents that don't are priced once and shared by all gods.

## 4. Results

### 4.1 Cost table (owner for `score`: seed1_line_painter, "lines of yellow cells score their sum")

| agent | kind | lines | description | decision | bound | erase | motion | ratchet | total | Program | ast-bytes | steps |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| paint_one_row | fixed | 1 | 20.7 | 0.0 | joint | 10.0 | 0.4 | 0.0 | 31.1 | 25.3 | 11 | 27 |
| fill_grid | fixed | 1 | 17.3 | 0.0 | joint | 50.0 | 9.8 | 0.0 | 77.2 | 71.4 | 9 | 27 |
| paint_best_line | relative | 1 | 17.3 | 3.3 | joint | 10.0 | 0.4 | 0.0 | 31.0 | 25.3 | 9 | 27 |
| reddest_row | relative | 3 | 48.5 | 2.2 | joint | 10.0 | 0.4 | 0.0 | 61.2 | – | 28 | 80 |
| guarded_row | conditional | 2 | 61.7 | 0.6 | joint | 1.6 | 0.1 | 0.0 | 64.0 | 36.9 | 24 | 17 |
| recolour_tool | fixed | 1 | 18.5 | 0.0 | joint | 12.5 | 1.1 | 0.0 | 32.1 | 26.3 | 11 | 27 |
| recolour_by_hand | loop | 3 | 49.1 | 18.5 | chain | 10.5 | 0.6 | 0.0 | 78.8 | – | 25 | 304 |
| copy_top_colour | relative | 4 | 64.4 | 4.1 | joint | 10.0 | 0.4 | 0.0 | 78.9 | – | 37 | 95 |
| join_the_crowd | relative | 3 | 66.2 | 4.2 | joint | 2.0 | 0.0 | 0.0 | 72.5 | – | 42 | 576 |
| biggest_to_corner | relative | 2 | 48.4 | 4.0 | joint | 0.0 | 0.2 | 0.0 | 52.6 | – | 30 | 78 |
| fix_mixed_rows | loop | 3 | 74.0 | 2.8 | joint | 4.4 | 0.2 | 0.0 | 81.5 | – | 31 | 91 |
| greedy_paint | search | 1 | 15.3 | 0.6 | joint | 45.3 | 8.9 | 0.0 | 70.0 | – | 13 | 13628 |
| careful_greedy | search | 3 | 47.6 | 0.4 | joint | 45.7 | 9.0 | 0.0 | 102.7 | – | 31 | 13685 |
| row_painter_search | search | 4 | 77.5 | 2.2 | joint | 10.0 | 0.4 | 50.0 | 140.1 | – | 51 | 1199 |
| greedy_swap | search | 4 | 78.4 | 4.8 | joint | 0.0 | 0.0 | 0.0 | 83.3 | – | 60 | 3458 |
| two_greedy_steps | search | 4 | 67.6 | 0.4 | joint | 45.7 | 9.0 | 0.0 | 122.7 | – | 38 | 27364 |
| full_greedy | search | 3 | 43.0 | 0.6 | joint | 51.4 | 10.7 | 83.0 | 188.7 | – | 28 | 391185 |

"Program" is the cost of the same agent as a `gridlab.program.Program`, where one exists. "bound" says
which decision estimate was charged.

- **Fixed agents** cost the Program price + 5.75 bits of framing.
- **Relative agents** (`reddest_row`, `copy_top_colour`, `join_the_crowd`, `biggest_to_corner`) pay 2–4
  decision bits: what they actually look at. Their larger cost is mostly description: 48–66 bits of
  program text against 17 for the built-in `best_line`.
- **`full_greedy` pays an 83-bit ratchet.** Re-applied, the search over all 7,822 moves keeps finding
  small improvements (surprisal is strictly increasing in the ordinal). Its closure therefore pins most
  of the grid, and it is charged for the jackpot it converges to.
- **Search agents that call the owner's utility** pay little decision when the best move is
  predictable. Seed 1 loves whole-grid yellow, so `greedy_paint` chooses "paint everything yellow" on
  almost every grid. They then pay the destruction of that big move, 54 bits, about what the named fill
  pays (60 for `fill_grid`). A whole-grid fill sold through a search is still priced as a fill.

The same four search agents priced for other owners (total, with decision bits in brackets):

| owner family | greedy_paint | careful_greedy | row_painter_search | greedy_swap |
|---|---|---|---|---|
| seed1_line_painter | 70 (0.6) | 103 (0.4) | 140 (2.2) | 83 (4.8) |
| conqueror | 70 (0.6) | 103 (0.4) | 140 (2.3) | 84 (5.3) |
| mirrormancer | 17 (0.0) | 48 (0.0) | 77 (0.0) | 78 (0.0) |
| staircase_climber | 17 (0.0) | 48 (0.0) | 77 (0.0) | 78 (0.0) |
| rainbow_road | 32 (6.0) | 64 (6.0) | 77 (0.0) | 84 (5.1) |
| lucky_token | 71 (0.4) | 103 (0.4) | 140 (2.3) | 82 (3.9) |

When no paint helps (mirrormancer and staircase_climber care about symbols), the search always ties,
takes the first move, and costs only its description plus one cell's paint. For rainbow_road the best
paint differs from grid to grid, and the agent pays 6 bits for that choice.

### 4.2 Description: ast-bytes and a fitted grammar

| corpus | n | Pearson r | bits per ast-byte | least-squares fit |
|---|---|---|---|---|
| the 17 example agents | 17 | 0.91 | 1.76 | bits ≈ 1.40 · bytes + 8.7 |
| random programs from the grammar | 1,500 | 0.96 | 1.82 | bits ≈ 1.24 · bytes + 1.6 |

The two prices rank programs almost the same way. ast-bytes × 8 overstates the MDL code about 4.5×,
because most AST nodes have only a handful of alternatives in context (or none).

Fitting the grammar's production weights on the other example agents (add-one; leave-one-out;
mutator choice and literals kept uniform so unification survives) shortens programs by 8–42%. Search
idioms shrink most, because they repeat across the templates:

| agent | uniform grammar | fitted grammar (leave-one-out) | saving |
|---|---|---|---|
| paint_one_row | 20.7 | 19.1 | 8% |
| fill_grid | 17.3 | 15.8 | 9% |
| paint_best_line | 17.3 | 15.8 | 9% |
| reddest_row | 48.5 | 38.4 | 21% |
| guarded_row | 61.7 | 51.3 | 17% |
| recolour_tool | 18.5 | 16.9 | 9% |
| recolour_by_hand | 49.1 | 42.3 | 14% |
| copy_top_colour | 64.4 | 47.0 | 27% |
| join_the_crowd | 66.2 | 65.3 | 1% |
| biggest_to_corner | 48.4 | 44.7 | 8% |
| fix_mixed_rows | 74.0 | 52.0 | 30% |
| greedy_paint | 15.3 | 10.7 | 30% |
| careful_greedy | 47.6 | 27.7 | 42% |
| row_painter_search | 77.5 | 55.4 | 29% |
| greedy_swap | 78.4 | 51.8 | 34% |
| two_greedy_steps | 67.6 | 49.1 | 27% |
| full_greedy | 43.0 | 25.9 | 40% |

### 4.3 Search ≤ log2 K, and computing vs naming the target

| agent | K candidates | log2 K | decision | E[naming bits] | description | description + decision |
|---|---|---|---|---|---|---|
| greedy_paint | 272 | 8.1 | 0.6 | 10.0 | 15.3 | 15.9 |
| careful_greedy | 272 | 8.1 | 0.4 | 8.8 | 47.6 | 48.0 |
| row_painter_search | 20 | 4.3 | 2.2 | 12.9 | 77.5 | 79.7 |
| greedy_swap | 40 | 5.3 | 4.8 | 9.6 | 78.4 | 83.2 |
| two_greedy_steps | 73984 | 16.2 | 0.4 | 8.8 | 67.6 | 68.0 |
| full_greedy | 7822 | 12.9 | 0.6 | 9.4 | 43.0 | 43.6 |

- Decision bits are far below log2 K: the winners are predictable.
- They are also below the bits it would take to write the chosen move down (`E[naming bits]`).
- For `greedy_paint`, description + decision (15.9 bits) is about the description of a one-move agent
  that names a typical winner literally (10.0 + 7.75 framing = 17.8). Searching for the target costs
  what writing it down would.

### 4.4 The structured-grid attack is caught

| threshold | H uniform only | H structured | H game states | charged (mixture) | bound |
|---|---|---|---|---|---|
| 11 | 1.2 | 1.9 | 3.3 | 2.3 | joint |
| 12 | 0.4 | 0.6 | 2.4 | 1.2 | joint |
| 13 | 0.1 | 0.1 | 1.6 | 0.6 | joint |
| 14 | 0.0 | 0.0 | 1.0 | 0.3 | joint |
| 15 | 0.0 | 0.0 | 0.5 | 0.2 | joint |

- Priced on uniform grids alone, the threshold-13 attack would cost 0.1 bits of decision. The mixture
  charges 0.6, six times more.
- Its true use on in-play states is 1.6 bits. Because uniform grids are half the mixture, the attack
  keeps a ≈ 1 bit discount against a pure game-state measurement (§6).
- For the search templates that gods actually summon, the mixture is well calibrated to play: charged
  4.22 bits against 4.02 measured on in-game objects, on average over 38 (agent, owner) pairs (§4.6).

### 4.5 Yield per bit by owner family (game states)

Mean gain in the owner's surprisal per bit of cost, ×100, on the 64 game-state grids. Each language
kind shows its best template, against the best of 512 random library Programs:

| owner family | best of 512 Programs | relative | conditional | loop | fixed (tool) | search (best template) |
|---|---|---|---|---|---|---|
| seed1_line_painter | 24.1 | 3.8 | 0.1 | 0.1 | 17.7 | 37.8 (greedy_paint) |
| conqueror | 20.6 | 2.0 | 0.0 | 0.1 | 25.7 | 33.7 (greedy_paint) |
| mirrormancer | 25.2 | 0.0 | 0.0 | 0.0 | 0.0 | 22.2 (careful_greedy_write) |
| staircase_climber | 16.0 | 0.0 | 0.0 | 0.0 | 0.0 | 6.8 (careful_greedy_count_on) |
| rainbow_road | 38.0 | 0.1 | -0.0 | -0.1 | 0.2 | 11.3 (greedy_paint) |
| lucky_token | 22.3 | 1.7 | 0.2 | -0.1 | 6.9 | 19.8 (careful_greedy_write) |
| snap | 60.4 | 0.0 | 0.0 | 0.0 | 0.0 | 53.0 (careful_greedy_write) |
| young_tableau | 19.1 | 0.0 | 0.0 | 0.0 | 0.0 | 12.0 (careful_greedy_ramp) |
| treasure_map | 21.2 | 2.2 | 0.0 | 0.1 | 11.4 | 21.7 (greedy_paint) |
| homebody | 53.1 | 3.4 | 0.2 | 0.1 | 8.9 | 53.0 (greedy_paint) |
| chessmaster | 47.7 | 0.2 | 0.0 | -0.1 | 11.8 | 14.5 (greedy_paint) |
| number_bonds | 19.6 | 1.5 | 0.5 | 0.5 | 5.0 | 23.4 (careful_greedy_write) |

- Search does **not** dominate on yield per bit, measured statically on game states. The best search
  template beats the best of 512 random Programs for 3 owner families: seed1_line_painter, conqueror,
  number_bonds.
- It roughly ties for five: mirrormancer, lucky_token, treasure_map, homebody, snap.
- It loses for four, where the useful moves are relational and no single paint/write/ramp step finds
  them: rainbow_road, chessmaster, staircase_climber, young_tableau.
- All values sit in the same band of about 0.1–0.5 bits of rarity per bit of cost that the Landauer
  bound predicts (mutators.md §1).
- The library comparison favours Programs: it is a maximum over 512 candidates, against 8 search
  templates.
- Relative, conditional and loop templates have low yield here because they target one fixed colour,
  which is the owner's colour for only some families.

### 4.6 Simulated games

Four gods, fixed 300 s, 20 Hz, 16 seeds per cell (mean ± standard error). A full re-run reproduced every
game exactly. Policies `greedy` = four
`greedy_private`; `mixed` = random, greedy_private, saver, greedy_omniscient. Conditions:

- `off`: today's Program agents only.
- `mix`: half of each god's candidates are language agents.
- `heavy`: 90% language agents.
- `only`: language agents only.
- `asym01` / `asym23`: only gods 0–1 (or 2–3) may use language agents.

The language catalogue has 13 templates × colours (54 agents at rgby). Eight of them search with
`score`.

| policies | condition | dynamism | tension | spirals /100 commits | lead changes /100 s | welfare (bits²) | payoff Gini | mutator entropy | mean summon cost | language share of summons |
|---|---|---|---|---|---|---|---|---|---|---|
| greedy | off | 0.684 ± 0.016 | 0.30 ± 0.02 | 8.7 ± 0.3 | 4.1 ± 1.0 | 2.3k ± 0.6k | 0.18 ± 0.02 | 0.80 ± 0.01 | 19.4 ± 0.2 | 0% |
| greedy | mix | 0.731 ± 0.010 | 0.35 ± 0.02 | 8.9 ± 0.3 | 4.3 ± 0.6 | 17.3k ± 10.7k | 0.21 ± 0.02 | 0.79 ± 0.01 | 25.1 ± 0.6 | 24% |
| greedy | heavy | 0.713 ± 0.016 | 0.46 ± 0.03 | 10.9 ± 0.4 | 3.8 ± 0.8 | 52.3k ± 23.4k | 0.24 ± 0.02 | 0.61 ± 0.02 | 34.2 ± 1.1 | 72% |
| greedy | only | 0.693 ± 0.021 | 0.58 ± 0.04 | 11.2 ± 0.4 | 2.9 ± 0.5 | 80.1k ± 23.8k | 0.25 ± 0.02 | 0.31 ± 0.02 | 39.3 ± 1.9 | 100% |
| mixed | off | 0.684 ± 0.011 | 0.28 ± 0.02 | 8.0 ± 0.3 | 3.0 ± 0.7 | 5.3k ± 2.2k | 0.24 ± 0.02 | 0.84 ± 0.01 | 21.6 ± 0.4 | 0% |
| mixed | mix | 0.683 ± 0.013 | 0.29 ± 0.03 | 8.5 ± 0.3 | 2.9 ± 0.5 | 16.1k ± 5.7k | 0.27 ± 0.02 | 0.76 ± 0.01 | 26.1 ± 0.6 | 30% |
| mixed | heavy | 0.639 ± 0.018 | 0.37 ± 0.03 | 9.7 ± 0.5 | 2.4 ± 0.7 | 34.4k ± 11.5k | 0.28 ± 0.02 | 0.52 ± 0.02 | 32.6 ± 0.6 | 76% |
| mixed | only | 0.605 ± 0.021 | 0.43 ± 0.05 | 9.6 ± 0.6 | 2.4 ± 0.7 | 56.2k ± 24.6k | 0.29 ± 0.02 | 0.27 ± 0.01 | 36.0 ± 0.7 | 100% |

The asymmetric conditions are summarised below.

Owner payoff change caused by each agent's own commits, pooled over all language conditions and both
policy sets. Templates summoned at least 5 times:

| agent | summoned | mean cost | commit rate | owner payoff per commit | owner payoff per bit |
|---|---|---|---|---|---|
| program | 8692 | 20.6 | 0.8 | -2.1 | -6.5 |
| fixed:recolour_tool | 1642 | 32.1 | 0.5 | 47.4 | 81.8 |
| search:greedy_paint | 796 | 30.5 | 0.8 | 126.3 | 393.4 |
| relative:paint_best_line | 579 | 31.0 | 0.5 | -36.2 | -69.2 |
| search:careful_greedy_count_on | 257 | 58.3 | 0.8 | 112.4 | 214.6 |
| search:careful_greedy_ramp | 115 | 71.0 | 0.7 | 79.2 | 116.6 |
| search:careful_greedy_recolour | 87 | 59.5 | 0.8 | 73.7 | 161.1 |
| search:careful_greedy_write | 71 | 72.2 | 0.7 | 110.4 | 152.6 |
| search:careful_greedy | 65 | 68.5 | 0.9 | 152.9 | 344.9 |
| conditional:guarded_row | 16 | 63.7 | 0.2 | -1.8 | -1.0 |
| relative:reddest_row | 15 | 61.1 | 0.6 | 4.5 | 8.1 |
| search:row_painter_search | 8 | 88.4 | 0.6 | 201.6 | 317.7 |
| loop:fix_mixed_rows | 8 | 81.5 | 0.5 | 5.1 | 6.2 |

Does language access help a god win? The same seed is played with gods 0–1 and then gods 2–3 holding
language access, so each god is compared with itself:

| policies | god-games | rank gain from language (+ = better) | games won by a language god (50% = no edge) |
|---|---|---|---|
| greedy | 64 | +0.78 ± 0.14 | 66% |
| mixed | 64 | +0.09 ± 0.09 | 47% |

**Readings.**

- **Search dominates in play, even though it does not dominate on paper.**
  - Owner-score search agents gain their owner +74 to +200 bits² of payoff per commit, or +115 to +390
    per bit spent.
  - Library Programs gain −2.1 per commit. They act blindly on every object they hit, so they wreck
    their owner's own structure about as often as they build it.
  - With greedy gods, holding language access is worth about 0.8 of a place in the final ranking
    (+0.78 ± 0.14 of a possible 3), and 66% of wins (50% would be no edge). With the mixed policy set,
    where the language gods are sometimes `random` or `saver`, there is no clear edge: +0.09 ± 0.09
    and 47%.
- **The pricing still charges the information correctly.**
  - We re-measured H(action) of the four main search templates on the objects actually present in
    language-heavy games (`evaluate --only inplay`): 38 non-trivial (agent, owner) pairs.
  - Mean charged decision is 4.22 bits; mean in-play H is 4.02 bits. Mean absolute difference 1.20 bits;
    66% within 1 bit; 13% under-charged by more than 1 bit (worst 3.8 bits).
  - So the advantage is not a measurement leak. It is that the information is extremely valuable. "Only
    move when it helps my god" costs about 1 bit, and turns an agent that hurts its owner half the time
    into one that never does.
  - `greedy_paint` has no explicit guard, but its candidate list contains no-op paints (a cell painted
    its own colour). So its argmax never makes things worse: it is a monotone improver for free.
  - The Landauer bound of mutators.md (§1) limits rarity *created* on fresh spawns. It says nothing about
    the value of *not destroying* rarity on structured objects, and that is where the bits pay off.
- **Dynamics.**
  - **Tension rises** steadily with the language share: 0.30 → 0.58 for greedy gods, 0.28 → 0.41 for
    the mixed set. Search agents pursue their owner's goal on every object, so commits that help one god
    and hurt another become the norm.
  - **Cooperative spirals rise**: 8.7 → 11.2 and 8.0 → 9.6 per 100 commits.
  - **Welfare** rises 10–35× (2.3k → 80k bits²). Search agents build very rare objects, and the payoff
    s_i · S_−i rewards shared rarity.
  - **Inequality grows** (Gini 0.18 → 0.25 and 0.24 → 0.29).
  - **Lead changes** do not improve beyond `mix`.
  - **Mutator diversity collapses** (0.80 → 0.31), because the templates search over only six mutators.
    That is the main reason the composite **dynamism** score rises at `mix` with greedy gods
    (0.68 → 0.73) but falls in the language-only worlds (0.68 → 0.61 for the mixed set). Of the other
    components, tension and spirals go up, liveness holds, and lead changes dip slightly.
- **Mix is the sweet spot.**
  - At `lang_share` = 0.5, gods choose language agents for 24–30% of summons. Dynamism is at its highest
    (greedy) or unchanged (mixed); tension and spirals are up; mutator diversity is intact.
  - Language-only worlds are more conflict-heavy, richer and more unequal, and much less varied.

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

1. **Adopt `description + decision + destruction` as the price of language agents.**
   - Keep the estimator as built: Miller–Madow joint estimate, trusted only at coverage ≥ 0.5, capped by
     the chain, path and static bounds.
   - Keep the 288-grid mixture reference. Its game component is what makes it match in-play decision
     bits to about 1 bit.
   - Pricing takes 0.01–0.7 s per agent (about 60 s for `full_greedy`, mostly its ratchet probe) and is cached, so measuring at summon
     time is practical.
2. **Fit the grammar weights and make the grammar subcritical** before the description code is frozen.
   - Uniform weights waste ≈ 2.8 bits per program on derivations that never halt (halting mass 0.14).
     They also overcharge idiomatic code: a weights table fitted leave-one-out saves 8–42%.
   - Keep mutator choice and literal codes uniform, so a one-move agent still costs exactly a Program
     step.
   - Version the weights with the season: prices must not drift mid-game.
3. **Decide whether owner-score search should dominate.** Charging the bits it uses is MDL-correct, and
   the price matches in-play information. Yet search agents earn 25× more owner payoff per bit than
   Programs, and give greedy gods an edge of about 0.8 places. If that is too strong, in order of preference:
   - (a) **Charge the oracle's description.** A program that calls `score` is only fully described
     together with the utility it calls. Add the owner draw's code length, log2 #families + its
     parameter bits (≈ 10–20 bits), once at summon. This is cheap, principled and small.
   - (b) **Let `score` rank candidates, not judge the grid.** Allow `best(..., by=score)` but not
     `score(grid)`, and drop no-op candidates from `moves(...)`. That removes free monotonicity, so an
     agent must pay decision bits to learn when to stay still.
   - (c) **Price use, not just summons.** Use the existing `metabolic_cost` knob for agents that call
     `score`, i.e. a per-application oracle fee. This is outside the MDL frame and is a pure game-design
     lever.
   - (d) **Coarsen `score`** to whole bits.
4. **Keep the conservative destruction term.**
   - H(A) plus prior erasure overcharges "measure, then overwrite" programs by up to I(A; f(X)): 2.2× for
     `recolour_by_hand` against `recolour`. That keeps the dedicated tools valuable.
   - Merge-type tools chosen only when the grid suits them can still be undercharged by prior erasure
     (mutators.md risk 4). If language agents exploit this, switch those tools to Hartley erasure.
5. **Widen the search templates.** They cover six mutators. In language worlds mutator entropy collapses
   from 0.8 to 0.3, and that alone pulls the dynamism score down. Templates over `shift_line`,
   `turn_block`, `mirror_fold`, `pattern_line` and `motif` would restore variety. Batch fast paths make
   them affordable under the 5 ms budget.
6. **For the attack:** weight the game component of the reference more (e.g. ½ uniform, ½ game), or add
   the live world's objects at summon time for agents that call `score`. That second option is
   deterministic given the world, but not cacheable across games.
7. **For kids:** teach `def` before `lambda`, show `explain(...)`'s per-line price tags in the editor,
   and offer the search idioms (`best(moves(paint), by=score)`) as ready-made cards. Their description
   cost then teaches MDL directly: a card is cheap, and writing your own is more expensive.

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
