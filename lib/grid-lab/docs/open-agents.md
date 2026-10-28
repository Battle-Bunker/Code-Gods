# Open agents: plain Python behind a closed, bit-priced mutation interface

Code: `gridlab/openagents/`
- `api.py`: moves, areas, the read-only grid view, constructors, validation
- `sandbox.py`: running an agent, seeds, the clock, the step budget
- `astbits.py`: the ast-bits-v1 code
- `ast_bits_v1.json`: the published tables, built by `build_tables.py`
- `measure.py`: the black-box price
- `agent.py`: `OpenAgent`, the simulator interface
- `simlib.py`, `examples.py`, `evaluate.py`
- `test_vectors.json` and `reference_grids_5_base10_rgby.json`: fixtures for a port

Tests: `python3 -m tests.test_openagents` (about 15 s). Results: `python3 -m gridlab.openagents.evaluate`
(§9). Every number is for **Grid(5,base10,rgby)** with the default `COST_KNOBS`. The owner for `score` is
`seed1_line_painter` unless a row says otherwise.

This builds on the agent language of PR #10 (docs/agent-language.md). It keeps that work's reference
mixture, destruction terms and ratchet probe, and replaces its DSL.

## Summary

**Do we need our own DSL? No.** An agent can be ordinary Python with the runtime's standard library
(lib/game-runtime). Only the *interface to the world* has to be closed and priced:

```python
def agent(grid):
    return [paint_row(2, "red")]
```

The agent reads a read-only grid and returns a list of moves. A move is a mutator call. The engine
validates the moves and applies them; nothing else can change the grid. Everything the DSL bought us
can be had without it:

| what the DSL gave | how open agents get it |
|---|---|
| description length (MDL) | **ast-bits-v1**: a prefix-free code over *real Python ASTs* (§2). It generalises ast-bytes-v1, which is its degenerate member (exactly 8 × ast-bytes). |
| decision bits = information used | **black-box** I(grid; action), measured by running the agent on a fixed reference mixture (§3). The program is never read. |
| destruction (Landauer) | unchanged: the prior erasure and motion of the moves actually returned, plus the ratchet (§4) |
| determinism, no state | a stateless sandbox; a frozen virtual clock; engine-seeded `random`, so measurement and play are indistinguishable (§1.3, §3.5) |

**The price splits in two** (§4):
- **`summon_bits`** is the description. The god pays it once.
- **`per_application_bits`** is the decision information, plus the expected erasure and motion, plus
  the ratchet amortised over the closure. It is paid on every application. The energy branch
  (claude/gridlab-agent-energy) has not merged, so the owner pays it.

**Headline results:**
- **Prices.** A one-move agent costs exactly the mutator code of its Program step, plus a fixed
  frame of 29.8 bits for `def agent(grid): return [...]` (§6.1). Multi-line Python costs 90–250 bits
  to describe. That is 3–4× the PR #10 DSL, because Python is a general language. The decision and
  destruction terms are the same as in the DSL.
- **Second law.** The generalised second law with feedback holds empirically in every one of 172
  (agent, utility) pairs: expected surprisal after one application ≤ B(erasure + I). The tightest pair
  reaches 0.69 of the bound (§4.2).
- **Search does not dominate on paper (§6.3).** Per lifetime energy, the best of 512 random Programs
  beats the best search template for 12 of 12 owner families at the default prices, and for 8 of 12
  when summoning is 4× cheaper.
- **Search does help in play (§6.5), but much less than in the DSL.**
  - At the default summon price, gods choose open agents for 5–9% of summons. Access is worth
    +0.19 to +0.34 of a place (59% of wins), against the DSL's +0.78 (66%).
  - At a 4× cheaper summon price, open agents take 49–64% of summons, and the edge from access
    disappears (+0.12 to +0.22, 47–53% of wins).
  - Search templates earn their owners 100–180 payoff per commit, against about 1 for Programs.
  - Open-only worlds lose mutator variety (0.82 → 0.17–0.20) and dynamism (0.73 → 0.47–0.51).
- **Computing a target versus naming it is fair at the margin (§6.4).** `greedy_paint` pays 0.4–0.8
  decision bits where the target it finds is predictable. That is far below the 13–15 bits it would
  take to name the target. Its per-application price is within 10% of the named agent's. Searching
  costs 44 extra *description* bits, once. Where the best move varies (rainbow_road), it pays 6
  decision bits and gains 6× more than the named move.
- **Randomness: allow it, seeded by the engine, and charge I = H(A) − H(A|X) (§5).**
  - The jackknife-corrected estimate recovers a known I to 0.01 bits with 8 seeds per grid.
  - Charging H(A) (forbidding randomness) bills noise as information: `random_row` pays 0 bits, its
    hash-based twin 2.3.
  - The clock should be frozen and deterministic rather than forbidden.

## 1. The interface

### 1.1 An agent

```python
def agent(grid):                          # grid: a read-only view of one object (gridlab/kid.py API)
    best = max(moves("paint"), key=score) # every legal paint move, ranked by my god's utility
    return [best] if score(best) > score() else []
```

- An agent is a module that defines `agent(grid)`. It returns a list of moves, `[]` for "do nothing";
  a single move or `None` is also accepted.
- A run that raises, runs out of steps, or returns anything else does nothing.
- At most 64 moves are allowed per application. They are applied in order, and each one sees the
  result of the previous one.

### 1.2 What it can use

| name | what |
|---|---|
| `grid.cells`, `.rows`, `.columns`, `.diagonals`, `.cell(r, c)`, `.size`, `.colours`, `.count(x)` | the kid cell API; cells have `.colour`, `.symbol`, `.value`, `.row`, `.col`, `.left/.right/.up/.down`, `.neighbours`, ... |
| `grid.after(moves)` | the view after some moves. It changes nothing and costs N² steps. |
| `paint(area, colour)`, `recolour(area, old, new)`, `swap_colours`, `hue_turn`, `pattern_line`, `motif`, `majority_line`, `write`, `step_rank`, `write_ramp`, `swap_symbols`, `flatten`, `paint_by_key`, `stamp`, `tally`, `blend`, `suit_swap`, `suit_set`, `swap_cells`, `shift_line`, `reverse_line`, `swap_lines`, `turn_block`, `turn_grid`, `sort_line`, `mirror_fold` | one constructor per mutator (gridlab/mutators.py) |
| `paint_row(i, c)`, `paint_column(j, c)`, `paint_cell(r, c, k)`, `paint_all(c)` | shorthands |
| `move("paint", kind="line", region=(0, 2), colour=0)` | the raw constructor: the mutator id and its fields |
| `cell(r, c)`, `row(i)`, `column(j)`, `diagonal(k)`, `block(r, c, size)`, `ring(d)`, `core`, `everything`, `best_line` | areas. A view cell, or a full row or column list of view cells, also works as an area. |
| `red`, `yellow`, ... | colour names; the plain strings work too |
| `moves(mutator=None)` | every legal move, of one mutator or of all of them |
| `score()`, `score(move)`, `score([moves])`, `score(view)` | the owner's surprisal, in bits, of this grid, of this grid after the moves, or of any view. It costs N² steps. Moves from a `moves(...)` list are scored in one batch. |
| the builtins, minus `open eval exec compile input globals locals vars id breakpoint`; `print` does nothing | |
| `import` of the runtime's preloaded modules: `math itertools functools collections re json decimal fractions statistics hashlib ast operator random time` | |

- Constructors check their fields against the GridType at once. A bad field raises `MoveError`.
- Two spellings that build the same (mutator, fields) pair are the same `Move`, and they cost the same
  bits (§2.7).

### 1.3 The sandbox (`sandbox.py`)

It models lib/game-runtime's contract in-process. That runtime pins CPython with the 14
computational modules preloaded, and gives no files, network, processes or threads. **This is a model,
not a security boundary**; production runs agents in the Wasm runtime.

- **Stateless.** The agent's module is executed afresh, in new globals, on every application.
  - Module objects are read-only proxies with no private attributes, so `math.memo = 1` fails.
  - The `decimal` context is reset.
  - The probes in §5.3 confirm all three.
- **Closed.** The grid view is a private copy. Its cells and the grid refuse assignment, and the
  underlying arrays are immutable. The only effect an agent can have is the list it returns.
- **Steps.** `sys.monitoring` counts every new line and every jump in the agent's own code objects.
  Each preview or score adds N². Over 500,000 steps the run does nothing.
  - The counter raises a `BaseException`, and it keeps raising once the budget is gone, so
    `except Exception` cannot swallow it.
  - A 5 s wall-clock backstop catches long builtin calls. It is reported, and it is outside the
    deterministic semantics.
  - `full_greedy` (all 7,822 moves) uses 196k steps.
- **Randomness.** `random` is a private `Random(seed)`. The seed is supplied by the engine
  (`derive_seed`, §3.5). `Random()` and `seed()` with no argument draw from the same stream.
  `SystemRandom` is unavailable.
- **Time.** `time` is a virtual clock. It starts at the same instant (2026-01-01T00:00:00Z) on every
  application and ticks 1 µs per call. `sleep` is unavailable.
- **Hashing.** `str` hashes are randomised per process unless `PYTHONHASHSEED=0`. The runtime pins
  that, and so do the test and evaluation entry points (they re-execute themselves). Prices are only
  written to the disk cache when the process is pinned.

## 2. ast-bits-v1: description length over real Python ASTs

### 2.1 The code

The description length of a source is the length of its codeword. The codeword is the module's
AST, from CPython 3.13 `ast.parse`, written in **preorder, in `_fields` order**, as a sequence of
choices. Each choice is made from a finite set of alternatives, with probabilities fixed by the choices
before it, and costs −log2 p.

Everything is published in `ast_bits_v1.json`:
- `grammar`: the categories and, for each node class, its fields and their kinds;
- `vocab`: builtins, API names, externals, API attributes, API parameters, modules and their public
  attributes, API strings;
- `counts`: the corpus statistics.

The JSON is versioned and frozen per season.

**Structure.** The node class at each node position (parent class, field) is drawn from
p(class | parent, field).

- The alternatives are the concrete classes of the field's category, in JSON order.
- A sequence field (`seq`) adds `<end>`. An optional field adds `<none>`. A sequence of optional
  elements (`Dict.keys`, `arguments.kw_defaults`) has both.
- A sequence whose length another field fixes codes no end. These are `Compare.comparators` (fixed by
  `ops`), `Dict.values` (by `keys`), `arguments.kw_defaults` (by `kwonlyargs`),
  `MatchClass.kwd_patterns` and `MatchMapping.patterns`.
- Product types (`arguments`, `arg`, `keyword`, `alias`, `comprehension`, `withitem`, `match_case`)
  are one-member categories and cost 0.
- The root is always `Module` and costs 0.
- Skipped fields: `ctx` (implied by position), `type_comment`, `Constant.kind`, `Module.type_ignores`.

**Small enumerations** (`small(name, alternatives)`):

| name | alternatives |
|---|---|
| `const_kind` | int, float, complex, str, bytes, bool, None, Ellipsis |
| `conversion` | −1, 115, 114, 97 |
| `is_async`, `simple` | 0, 1 |
| `<Class>.<field>.present` | True, False: is an optional identifier there? |
| `keyword.arg.present`, `ImportFrom.module.present`, `alias.dotted_asname.present`, `alias.star` | True, False |

**Names: scopes and alpha-equivalence.** Identifiers are never spelled.

- *Scopes* follow Python:
  - the module, `def`, `lambda`, `class` and each comprehension are scopes;
  - a walrus binds in the nearest scope that is not a comprehension;
  - a comprehension's first iterable belongs to the enclosing scope;
  - a function's defaults, decorators, annotations and return annotation belong to the enclosing
    scope; its parameters belong to the function;
  - a class body is visible only from itself.

  The binder (`astbits.bind`) records, for each scope, the names it binds and its `global` and
  `nonlocal` declarations. Resolution is LEGB: a name not bound by the user resolves to an
  **external** if it is in `vocab.externals`, otherwise to an implicit module global.
- Each scope numbers its variables **in order of first appearance**. The module starts with slot 0 =
  `agent`, the entry point.
- A **load** chooses among:
  - user alternatives: every numbered slot of every visible scope, plus one "a new one" per visible
    scope (for forward references), uniformly, with total probability 1 − P_EXT;
  - or an external with probability P_EXT = ½, drawn from p_ext(n) = ½·p_builtin(n) + ½·p_api(n).
    p_builtin is corpus-weighted (count + 1) over the 131 allowed builtins; p_api is uniform over
    the 49 API names.

  So a user variable costs 1 + log2(#alternatives), `len` costs 5.3 bits, `range` 8.1, `paint` or
  `score` 7.6.
- A **store** (an assignment target, `def` name, parameter, import binding, `except ... as`, a match
  capture) chooses uniformly among the current scope's slots, "a new one", and the names this scope
  declared `global` or `nonlocal`.
- A `global` / `nonlocal` declaration is a sequence. Each step chooses uniformly among `<end>`, the
  target scope's slots, and "a new one" for each target scope.
- Renaming never changes the price (tested).

**Attributes, keywords, modules.**

| what | distribution |
|---|---|
| `x.attr` where `x` is still bound only by `import M` | M's public names, count + 1, plus an escape of weight 1 |
| any other `x.attr` | ½ uniform over the 38 API attributes + ½ the corpus table: the top 512 names plus every method of the builtin types and of the preloaded modules' classes, count + 1. The escape weighs the corpus mass left out. |
| keyword names | the same mixture, over the 33 API parameter names and the top 256 corpus keywords |
| `import` module paths | the 15 preloaded modules, count + 1, plus an escape of weight 1 |

The escape spells the identifier with the string code.

**Literals** (universal codes):

| literal | code |
|---|---|
| int v ≥ 0 | Elias gamma γ(v + 1), 2⌊log2(v+1)⌋ + 1 bits (negative numbers are `UnaryOp(USub)`) |
| str | with P_STRVOC = ½ a uniform pick from the 88 API strings (colour names, mutator ids, field values, suits, digit glyphs); otherwise spelled: γ(len + 1) + log2 98 per character. The 98 symbols are the 95 printable ASCII characters, `\n`, `\t`, and an escape followed by γ(code point + 1). |
| bytes | γ(len + 1) + 8 per byte |
| float | γ(len(repr) + 1) + log2 18 per character of `repr` |
| complex | the imaginary part's float code |
| bool | 1 bit |
| None, `...` | 0 bits after the kind |

**Literal moves.** Every `Call` first codes a flag, p(literal) = Q_MOVE = ⅛.

- The call is a literal move when:
  - its callee is a name that resolves to an API mutator constructor, and
  - every argument is literal, and
  - the constructor builds a valid move.

  Literal arguments are constants, tuples or lists of them, ±number, external colour names, `core`,
  `everything`, `best_line`, and area constructors applied to literal arguments.
- A literal move is coded as log2(#mutators available on the GridType) + D(fields): exactly the
  Program step's `base + describe` (`Mutator.describe_bits`).
- Its canonical spelling is `move("paint", kind="line", region=(0, 2), colour=0)`.
- Every other call codes its fields normally.

### 2.2 Uniform versus corpus weights

Both schemes are prefix codes and both satisfy Kraft, so the choice is about *which programs are
cheap*:

- **Uniform** (every alternative equally likely) is the maximum-entropy, assumption-free choice. It
  charges `Starred`, `Await` or `MatchAs` exactly as much as `Name`, so idiomatic code pays for
  constructs it never uses. It costs 38–45% more on every example (§6.1).
- **Corpus** weights come from the CPython 3.13 standard library (537 files, 697,698 nodes,
  add-one smoothed). This is the *published, game-independent* estimate of how Python is written.
  - It is large, so the estimates are stable.
  - It is fixed before any agent exists, and no designer or player chose it, so it cannot be tuned
    to favour a strategy.
  - It is the natural prior for "what does it cost to say this in Python".
  - A season-specific corpus of agents would fit kid code better (PR #10 §4.2 saw 8–42%), but it
    would make prices depend on what other players wrote. It could also be gamed by flooding the
    corpus.

**Recommendation: corpus weights, frozen per season.** The ½ external split and ½ string-vocabulary
split are published constants rather than corpus estimates. The stdlib uses no game API, and an agent
uses it heavily; ½ is the minimax-regret prior between "always" and "never".

### 2.3 Kraft's inequality

1. **Prefix-free by construction.** The alternatives at each choice depend only on earlier choices:
   the grammar position, the scope state, the vocabularies. So codewords are root-to-leaf paths in a
   tree.
2. **Each choice point sums to 1.** This is checked for every node context in both schemes, and for
   every name, attribute, keyword and module distribution: max |Σp − 1| = 1.1e-16. Elias gamma is
   complete (Σ_{n<2^16} 2^−γ(n) = 0.99998), and so is the string code.
3. **Sampling.** The same walker in *sample* mode draws programs from the code's own distribution.
   - Of 4,000 corpus-weighted draws, 264 are valid Python that round-trips through
     `unparse → parse`. Every one has code length equal to −log2 of its sampling probability, to
     1e-13 bits. The same holds for 165 of 4,000 uniform draws, to 4e-15.
   - Hence Σ_P 2^−L(P) = P(the sampler halts at a canonical program) ≤ 1.
   - The rest overflow the 150-node cap, are not valid Python, or are *non-canonical* paths that the
     coder never uses. Non-canonical paths include:
     - a generic call that the coder would code as a literal move;
     - a function slot that is never assigned, which Python treats as a global;
     - `import a.b` without `as`.

     These paths are wasted codewords, so the inequality is strict.
4. **Totality.** All 537 standard-library files encode without error.

### 2.4 How ast-bits-v1 generalises ast-bytes-v1

ast-bytes-v1 (lib/game-runtime, lib/game-core) charges 1 byte per AST node and literal bytes for
constants. It is the walker run with scheme `"ast-bytes"`:
- 8 bits for every node class, `ctx` included;
- 8 × `constant_bytes` for each constant;
- 0 for identifiers, `<end>` and `<none>`.

That gives **exactly 8 × ast-bytes**, which is tested on every example and probe.

ast-bytes is therefore the member of this family with flat weights, free identifiers and no
terminators. That is also why it is **not a code**:
- infinitely many programs cost the same, because any identifier and any list length are free;
- Σ 2^−L diverges.

ast-bits-v1 fixes exactly those three things:
- context-dependent weights;
- identifiers priced as log2 of the names in scope;
- terminators, plus universal codes for literals.

It keeps ast-bytes' structural view. Empirically corpus ast-bits ≈ 3.76 × ast-bytes − 5.4 bits
(r = 0.982, §6.1), so the two rank programs alike.

## 3. Decision information, measured black-box

### 3.1 What is measured

The agent's **action** is the tuple of moves it returns, with `best_line` resolved to the line it hits
on that grid. The price charges **I(X; A)**, the information about the grid that steers the action.
This is the Szilard–Bennett price of a demon's measurements (agent-language.md §3.2). The agent is
only ever *run*, never read.

### 3.2 The reference mixture

Agents are priced on fixed grids, so every agent sees the same ones (common random numbers). The
mixture is that of PR #10:

| component | n | what |
|---|---|---|
| uniform | 128 | spawns from the prior |
| structured | 64 | spawns after 1–3 cheap random Programs |
| game | 64 | objects from 3 fixed-seed games of Program agents |
| self | up to 32 | states on the agent's own re-application trajectories |

The first three are exported, with the 24 ratchet probes, as `reference_grids_5_base10_rgby.json`.
Each grid is written `sym-hex:col-hex`, row-major `uint8`.

### 3.3 Deterministic agents: I = H(A)

An agent that never touched `random` has I = H(A). The decision is the **minimum** of four estimates,
in bits, over the n actions:

| estimate | definition |
|---|---|
| joint | Miller–Madow H(A) = plug-in + (m − 1)/(2n ln 2), with m distinct actions. Used only if Good–Turing coverage 1 − f₁/n ≥ ½ (f₁ = actions seen once); otherwise ∞. |
| positional | H(len) + Σ over positions p of [H(mutator at p) + Σ over field names f of H(f at p)]. Absent values are ⊥. A function of these components determines A, so this is an upper bound by subadditivity. Each component uses Miller–Madow, or log2 of its alphabet if its coverage is below ½. Alphabets: #moves + 2 for the length, #mutators + 1, and #values of the field over all legal moves + 1. |
| set | Σ over the moves m seen of H_b(P(m ∈ A)), with the same fallback. Valid only if every action lists its moves in **strictly increasing enumeration order**: the index in `all_moves`, mutators in `MUTATORS` order, each field space in field order. A is then a function of its set. |
| naming | E[γ(len + 1) + Σ (log2 #mutators + D(move))]: the expected length of the action written literally. This is an upper bound on H by source coding. |

- The joint estimate saturates at log2 n (8.2 bits).
- The positional and set bounds are the black-box replacement for PR #10's interpreter-recorded
  chain bound. `recolour_by_hand` (25 single-cell paints) is charged 18.5 bits by the set bound, the
  same as PR #10's chain bound.

### 3.4 Randomized agents: I = H(A) − H(A|X)

If any run draws from `random`, the agent is re-run with R = 8 engine seeds per grid. Then:

- **I_jk = Ĥ_jk(A) − mean over grids x of Ĥ_jk(A | x)**, where Ĥ_jk is the jackknife bias-corrected
  entropy:
  - Ĥ_jk = n·H − (n−1)/n · Σ_i H(sample without i);
  - in closed form, with S = Σ c log2 c: removing one copy of outcome k makes
    S_k = S − c_k log2 c_k + (c_k − 1) log2(c_k − 1), and H_k = log2(n − 1) − S_k/(n − 1).
- Ĥ(A) is computed on all n·R runs; Ĥ(A|x) on the R runs of each grid.
- The decision is min(max(0, I_jk) if the joint coverage is ≥ ½ else ∞, the four H(A) bounds of §3.3).
- The plug-in, Miller–Madow and shuffle-corrected estimates are reported as diagnostics. The shuffle
  correction subtracts the mean I of the table with grid labels shuffled, by SplitMix64 + Fisher–Yates
  so a port can reproduce it.

§5 justifies the jackknife.

### 3.5 Evasion: making measurement and play indistinguishable

An agent could try to behave differently when it is being measured. Every channel it could use is
either closed or identical in the two settings:

- **The grids** come from the same distributions as play: the prior, code-reachable states, and
  world-like states.
- **Randomness.**
  - Seeds are derive_seed(salt, parts) = the first 8 bytes, big-endian, of
    HMAC-SHA256(salt, "\x1f".join(str(part))).
  - Measurement uses ("measure", gtype key, grid index, replicate). Ratchet probes use ("ratchet",
    gtype key, probe, step). Play uses ("play", salt, draw).
  - Without the salt both streams are uniform 64-bit numbers. Even `random.getstate()` reveals
    nothing (the `seed_peeker` probe: §5.3).
  - **In production the salt must be a season secret, committed by hash and revealed afterwards for
    audit.** Otherwise an agent could recompute the published measurement seeds and recognise them.
    The same is true of the reference grids: publish their generator and seeds only after the season.
- **Time** is a frozen virtual clock, identical everywhere.
- **No state** survives between applications, so an agent cannot count applications.
- **What remains.** CPU (bounded by the budget) and `repr` addresses: process-dependent in this model,
  restored per call by the runtime's memory snapshot.

### 3.6 The structured-grid attack

The attack: "if one colour covers ≥ T cells, repaint every cell above 4 in it". It is constant on
random grids and chooses among many targets on structured ones. The test is reused from PR #10, and
the numbers match it exactly (§6.6).

## 4. The price split and the thermodynamics

### 4.1 Two prices

```
summon_bits          = description (ast-bits-v1)                                    paid once, by the god
per_application_bits = I(X; A) + E[erasure] + E[motion] + ratchet / mean closure length  per application
```

- **Erasure** is each returned move's prior erasure (mutators.md §1b), with the knobs.
- **Motion** is 0.35 × ((Σ dcol)² log2 C + (Σ dsym)² log2 S) / N² over the whole run, so splitting a
  move into pieces cannot dodge it.
- Both are averaged over the mixture. A run that does nothing pays nothing.
- **Ratchet** is the closure surcharge of `Program.ratchet_bits`, amortised over the mean number of
  applications the closure takes:
  - re-apply the agent to 24 probes until it stops;
  - charge log2(alphabet) for each cell-layer that is the same in ≥ 7/8 of the closures beyond what
    one application pins.

  Charging per application already pays for compounding erasure as it happens. So the ratchet is
  mostly redundant here, and only a few agents pay one: `full_greedy` 41.5 per application,
  `random_improver` 6.1. `PRICING["ratchet"]` can be `"off"`, `"amortised"` or `"full"`.

A literal one-move agent's per-application price is exactly its Program step's E + motion (tested).
Its summon price is the step's tool + D, plus the 3-bit flag and the 29.8-bit frame.

### 4.2 The generalised second law with feedback (Sagawa–Ueda 2010)

For feedback control, Sagawa and Ueda showed W_ext ≤ −ΔF + kT·I: a controller can extract work
beyond the free-energy drop by at most the mutual information it gains. Our analogue is as follows.

Let f(x) = m_A(x)(x) be one application with prior input X ~ μ (uniform), and let ν = law of f(X).
Then:

- KL(ν‖μ) = H(X) − H(f(X)).
- H(X) − H(f(X)) ≤ E[conditional erasure of the chosen moves] + I(X; A), since
  H(X) − H(f(X)) = [H(X|A) − H(f(X)|A)] + H(A|f(X)), and H(A|f(X)) ≤ H(A) for a deterministic agent.
  A randomized agent's coin flips can be absorbed into A.
- Donsker–Varadhan, with E_μ[2^{λs}] ≤ 1/(1−λ) for every utility's surprisal s, then bounds the
  surprisal one application can create, for **any** utility:

      E_{x~μ}[ s(f(x)) ] ≤ B(K) := min_{λ∈(0,1)} (K + log2 1/(1−λ)) / λ,   K = erasure + I

- In words: **the surprisal one application creates is at most its erasure plus the information it
  gained** (≈ K + log2 K + 2).
- B(0) = log2 e = E_μ[s]: a bijection or a do-nothing agent cannot raise expected surprisal at all.
- We charge the *prior* erasure. For projections (paint, write, fold) this bounds the conditional
  erasure. Merge-type moves chosen only on grids that suit them can break that (mutators.md risk 4),
  so the bound is tested rather than assumed.

**Test** (§6.2): every example agent, the attack and `random_blue_cell`, against the 12 owner families.
Agents that call `score` were tested with 4 owners each. K was measured on the uniform component, and
E[s] on 512 fresh spawns. Result:
- 172 (agent, family) pairs;
- 0 exceed B(K) by more than 2 standard errors;
- the closest pair, `greedy_paint` with its own owner `seed1_line_painter`, reaches E[s] = 31.3 against
  B = 56.7 (0.55). The largest ratio overall is 0.69.

Search agents come closest to the bound: they spend their erasure exactly where their owner's utility
rewards it. Agents that call no owner stay near log2 e for every family, as the Landauer argument
predicts.

### 4.3 Levin's Kt, and why we do not use it

Levin's Kt(x) = min over programs p producing x of |p| + log2 t(p). It prices *computation time*
logarithmically. It is the right measure for "how hard is it to find x". The `Kt` column of §6.1
reports description + log2(mean steps). We do not charge it, for three reasons:

1. **Our agents are maps, applied repeatedly.** What they cost the world is thermodynamic: what they
   erase and what they learn about the grid. Kt prices the cost of *generating* a string once, and
   says nothing about erasure.
2. **Computation that does not change the action is free in physics** (Bennett: reversible
   computation), and it should be free here. `full_greedy` examines 7,822 moves. Kt would add 17.6
   bits for that; its information about the grid is 0.6 bits. Charging log t would make computing a
   target systematically dearer than naming it, and break the fairness of §6.4.
3. **Time is not deterministic or portable.** Wall time varies by machine. Step counts are an
   artefact of the interpreter (CPython lines, QuickJS bytecodes). So CPU is a hard per-interaction
   budget (the runtime's 5 ms; here 500,000 steps), not a price.

## 5. Randomness: seeded and charged, or forbidden?

### 5.1 The two options

**Option A: allow seeded randomness and charge I = H(A) − H(A|X).**
- This is the Sagawa–Ueda accounting: coin flips are not information about the system and cost no
  measurement. (They still pay erasure and motion for what they do.)
- Kids write `random.choice(...)` naturally.
- Mixed strategies are game-theoretically meaningful: they make an agent unpredictable to opponents.

**Option B: forbid `random` and `time`.**
- Any "randomness" must then be a pseudo-random function of the grid, and that is charged as
  information.

### 5.2 Measurements

| agent | randomized | H(A) | H(A|X) plug-in | I plug-in | I Miller–Madow | I shuffle-corrected | **charged (jackknife I)** | per application, seeded | per application, forbidden |
|---|---|---|---|---|---|---|---|---|---|
| random_row | yes | 2.3 | 1.9 | 0.4 | 0.1 | −0.0 | **0.0** | 10.4 | does nothing |
| hashed_row (sha256 of the grid) | no | 2.3 | 0.0 | 2.3 | 2.3 | 2.3 | **2.3** | 12.7 | 12.7 |
| random_blue_cell | yes | 4.7 | 1.8 | 2.9 | 2.6 | 0.9 | **2.4** | 4.3 | does nothing |
| random_improver (random improving paint) | yes | 6.0 | 2.8 | 3.1 | 2.5 | 0.1 | **1.9** | 19.4 | does nothing |

`random_blue_cell` paints a uniformly random blue cell. Its I is known exactly on the reference grids:
2.33 bits. The estimators against R, the seeds per grid:

| R | plug-in | Miller–Madow | shuffle-corrected | **jackknife** | exact | random_row (exact 0): plug-in / jackknife |
|---|---|---|---|---|---|---|
| 2 | 3.9 | 3.7 | 0.2 | 3.2 | 2.3 | 1.6 / 0.8 |
| 4 | 3.3 | 2.9 | 0.5 | 2.5 | 2.3 | 0.9 / 0.1 |
| 8 | 2.8 | 2.6 | 0.9 | **2.3** | 2.3 | 0.4 / −0.1 |
| 16 | 2.6 | 2.4 | 1.4 | 2.3 | 2.3 | 0.2 / −0.0 |
| 32 | 2.5 | 2.3 | 1.8 | 2.3 | 2.3 | 0.1 / −0.0 |

- The plug-in and Miller–Madow over-charge, conservatively, but by 0.5 bits at R = 8.
- The shuffle correction (Panzeri et al.) assumes the null, where each grid's action has the full
  marginal alphabet. That over-corrects badly in the informative case: 0.9 against 2.3.
- The jackknife is within 0.01 bits from R = 8 on in both cases, so it is charged.

### 5.3 Evasion probes

| probe | distinct actions, measure / play | repeatable | acting rate, measure / play | charged |
|---|---|---|---|---|
| clock_reader: acts iff the µs clock is odd | 1 / 1 | yes | 1.00 / 1.00 | 0.0 |
| stateful: counts its calls in a module global | 1 / 1 | yes | 1.00 / 1.00 | 0.0 |
| module_stash: counts in `math.memo` | 1 / 1 | yes | 1.00 / 1.00 | 0.0 |
| seed_peeker: acts on `random.getstate()` | 2 / 2 | yes | 0.08 / 0.14 (64 grids each; binomial noise) | 0.0 |

None of them can tell measurement from play, and none can keep a counter.

### 5.4 Recommendation

**Option A, seeded randomness charged by the jackknife I, with the frozen clock.**

Forbidding randomness does not remove randomness; it moves it into a hash of the grid. Then:
- it charges noise as information, against the second law (`hashed_row` pays 2.3 bits for nothing);
- it makes a natural kid idiom an error;
- it is no harder to evade.

Option A's costs:
- 8× the runs at summon, only for agents that use `random`;
- an estimator whose small residual bias is known (§5.2);
- a requirement that the seed salt is secret during the season (§3.5).

Time should be the frozen virtual clock, not forbidden: it gives no information and no entropy. If
the production runtime cannot freeze its clock, forbid `time`.

## 6. Results

### 6.1 Cost table (~15 plain-Python agents)

Sources are in `examples.py`, with {A} = red and {B} = blue. "Program" is the same agent as a
gridlab Program where one exists. "PR #10 language" is the DSL agent's one-shot total (description +
decision + destruction). "Kt" is description + log2(steps).

| agent | kind | lines | **summon** (description) | decision | bound | erase | motion | ratchet / app | **per application** | Program | PR #10 language | ast-bytes | steps | Kt |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| paint_one_row | fixed | 2 | 45.7 | 0.0 | joint | 10.0 | 0.4 | 0.0 | 10.4 | 25.3 | 31.1 | 14 | 2 | 46.7 |
| fill_grid | fixed | 2 | 42.4 | 0.0 | joint | 50.0 | 9.8 | 0.0 | 59.8 | 71.4 | 77.2 | 13 | 2 | 43.4 |
| paint_best_line | relative | 2 | 42.4 | 3.2 | joint | 10.0 | 0.4 | 0.0 | 13.6 | 25.3 | 31.0 | 15 | 2 | 43.4 |
| reddest_row | relative | 4 | 208.5 | 2.2 | joint | 10.0 | 0.4 | 0.0 | 12.6 | – | 61.2 | 54 | 33 | 213.5 |
| guarded_row | conditional | 4 | 156.3 | 0.6 | joint | 1.6 | 0.1 | 0.0 | 2.3 | – | 64.0 | 44 | 8 | 159.3 |
| recolour_tool | fixed | 2 | 43.5 | 0.0 | joint | 12.5 | 1.1 | 0.0 | 13.6 | 26.3 | 32.1 | 19 | 2 | 44.5 |
| recolour_by_hand | loop | 2 | 97.2 | 18.5 | set | 10.5 | 0.6 | 0.0 | 29.6 | – | 78.8 | 31 | 27 | 101.9 |
| copy_top_colour | relative | 4 | 172.5 | 2.0 | joint | 10.0 | 0.4 | 0.0 | 12.4 | – | 78.9 | 44 | 29 | 177.3 |
| biggest_to_corner | relative | 5 | 219.7 | 4.0 | joint | 0.0 | 0.2 | 0.0 | 4.2 | – | 52.6 | 57 | 4 | 221.7 |
| random_row | random | 3 | 93.1 | 0.0 | mutual | 10.0 | 0.4 | 0.0 | 10.4 | – | – | 24 | 3 | 94.7 |
| hashed_row | relative | 4 | 175.7 | 2.3 | joint | 10.0 | 0.4 | 0.0 | 12.7 | – | – | 45 | 4 | 177.7 |
| greedy_paint | search | 2 | 86.2 | 0.6 | joint | 45.3 | 8.9 | 0.0 | 54.7 | – | 70.0 | 21 | 6,802 | 98.9 |
| careful_greedy | search | 3 | 148.9 | 0.4 | joint | 45.7 | 9.0 | 0.0 | 55.1 | – | 102.7 | 39 | 6,853 | 161.7 |
| random_improver | random | 5 | 176.7 | 1.9 | mutual | 10.7 | 0.7 | 6.1 | 19.4 | – | – | 53 | 7,102 | 189.5 |
| greedy_swap | search | 4 | 250.5 | 4.8 | joint | 0.0 | 0.0 | 0.0 | 4.9 | – | 83.3 | 73 | 1,129 | 260.6 |
| full_greedy | search | 3 | 137.3 | 0.6 | joint | 51.4 | 10.7 | 41.5 | 104.2 | – | 188.7 | 34 | 195,603 | 154.9 |

Description by part, in bits:

| agent | structure | names | literals | moves | total | uniform weights | ast-bytes | bits per ast-byte |
|---|---|---|---|---|---|---|---|---|
| paint_one_row | 28.8 | 1.0 | 0.0 | 15.9 | 45.7 | 78.0 | 14 | 3.26 |
| reddest_row | 109.6 | 81.3 | 16.9 | 0.8 | 208.5 | 345.2 | 54 | 3.86 |
| recolour_by_hand | 48.1 | 32.0 | 16.9 | 0.2 | 97.2 | 177.6 | 31 | 3.14 |
| greedy_paint | 46.2 | 31.2 | 8.4 | 0.4 | 86.2 | 140.6 | 21 | 4.11 |
| careful_greedy | 85.7 | 54.1 | 8.4 | 0.8 | 148.9 | 244.5 | 39 | 3.82 |
| greedy_swap | 130.7 | 110.5 | 8.4 | 0.8 | 250.5 | 403.5 | 73 | 3.43 |

Over all 16 examples, corpus bits ≈ 3.76 · ast-bytes − 5.4 (r = 0.982). Corpus weights save 37–45%
against uniform.

**Readings.**

- **The one-move frame.** A literal move costs exactly the Program step's tool + D, plus a 3-bit flag:
  15.9 bits for `paint_row(2, "red")` (tested for every mutator on three GridTypes).
- The rest of a one-move agent is a fixed **29.8-bit frame**: `def agent(grid): return [·]`. Of that:
  - 2.1 for a top-level `def`;
  - 1 for naming it `agent`;
  - 2.4 for one parameter;
  - 3.0 + 7.4 + 5.1 for `return`, a list and a call;
  - and the ends of the lists.

  A Program pays a 2-bit `agent_base` instead. A one-move agent therefore costs the Program's
  description + 30.8 bits at summon (45.7 against 14.9), and exactly the Program's erasure and motion
  per application.
- **Multi-line Python costs 3–4 bits per AST node**, which is 2–4× the PR #10 DSL. The extra is the
  price of generality:
  - names are chosen from all of Python's builtins (`sum` alone is 10.7 bits);
  - every `def`, `lambda`, generator and comparison is a full node.

  This is the honest MDL price of saying it in Python. It is why summoning written code is
  expensive, and why §6.5 also tests a 4× cheaper summon price.
- **Decision and destruction are as in the DSL.** `paint_best_line` measures log2 10 = 3.3 by running
  it; that is what mutators.md charges as the M term. `recolour_by_hand` gets 18.5 from the set bound;
  PR #10's interpreter chain gave 18.5.
- **full_greedy** pays 41.5 bits of amortised ratchet per application. Re-applied, it keeps finding
  small improvements and pins most of the grid.

### 6.2 The second law with feedback (§4.2)

| agent | erasure | I | K | B(K) | family closest to the bound | E[s] after | Δ E[s] |
|---|---|---|---|---|---|---|---|
| paint_one_row | 10.0 | 0.0 | 10.0 | 14.8 | conqueror | 1.3 | −0.1 |
| fill_grid | 50.0 | 0.0 | 50.0 | 56.7 | number_bonds | 6.0 | 5.1 |
| recolour_by_hand | 12.5 | 20.3 | 32.8 | 39.0 | number_bonds | 1.5 | 0.6 |
| greedy_paint [seed1_line_painter] | 50.0 | 0.0 | 50.0 | 56.7 | seed1_line_painter | 31.3 | 29.9 |
| greedy_paint [rainbow_road] | 10.2 | 5.8 | 16.0 | 21.4 | rainbow_road | 4.7 | 3.4 |
| greedy_paint [number_bonds] | 22.4 | 5.1 | 27.4 | 33.4 | number_bonds | 6.0 | 5.1 |
| random_improver [seed1_line_painter] | 10.3 | 1.9 | 12.2 | 17.2 | seed1_line_painter | 5.7 | 4.2 |
| greedy_swap [rainbow_road] | 0.0 | 5.0 | 5.0 | 9.1 | rainbow_road | 3.4 | 2.1 |
| biggest_to_corner | 0.0 | 4.1 | 4.1 | 8.1 | seed1_line_painter | 1.4 | −0.0 |
| attack (T = 13) | 0.1 | 0.1 | 0.2 | 2.2 | seed1_line_painter | 1.5 | 0.1 |

All 172 pairs (29 agent rows × their families) satisfy the bound, the largest ratio being 0.69.
`python3 -m gridlab.openagents.evaluate --only secondlaw` prints the full table.

`greedy_swap` creates surprisal while erasing nothing: it permutes colours. It is bounded only through
the 5 bits of information it uses (B(5) = 9.1). This is the feedback term doing its job: a demon's
measurement is what lets a bijection sort.

### 6.3 Does search dominate?

The lifetime yield on 64 game states is

    150 × (mean Δ owner surprisal per application) / (summon × s + 150 × per-application × 0.01)

where 150 is the number of applications in a typical game. For Programs it is 150 × Δ / cost. Each
cell is the best template of its kind:

| owner family | best of 512 Programs | fixed | relative | random | **search** (s = 1) | search (s = ¼) |
|---|---|---|---|---|---|---|
| seed1_line_painter | 36.2 | 13.3 | 2.8 | 2.7 | 23.6 | **38.3** |
| conqueror | 30.9 | 19.4 | 1.5 | 1.9 | 21.1 | **34.2** |
| mirrormancer | 37.8 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| staircase_climber | 24.1 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| rainbow_road | 57.0 | 0.2 | −0.2 | 0.6 | 4.9 | 11.7 |
| lucky_token | 33.5 | 5.2 | 1.3 | 1.4 | 3.7 | 6.1 |
| snap | 90.6 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| young_tableau | 28.6 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| treasure_map | 31.9 | 8.6 | 1.7 | 1.9 | 13.5 | 22.0 |
| homebody | 79.7 | 6.7 | 2.5 | 1.9 | 28.6 | 54.1 |
| chessmaster | 71.6 | 8.9 | 0.2 | 0.6 | 5.9 | 15.0 |
| number_bonds | 29.4 | 3.8 | 1.1 | 1.4 | 6.4 | 12.7 |

- **Search does not dominate on paper.** At default prices the best random Program beats every
  template for every family. With summoning 4× cheaper, `greedy_paint` wins for 2 of 12 families
  (seed1_line_painter, conqueror) and comes within 70% for homebody.
- The paint-only search templates are useless when the owner cares about symbols or positions
  (4 families give 0.0). They are weak where the useful moves are relational (rainbow_road,
  chessmaster), which matches PR #10 §4.5.
- The open-agent search pays **54 bits per application** for its whole-grid fill against a Program's
  one-off ~70. Under the split price, a big move is paid for every time it is made.

### 6.4 Fairness: computing a target versus naming it

The named agent is `return [move(...)]` with `greedy_paint`'s most frequent choice:

| owner | the search's most frequent choice | share | summon: search / named | decision | E[bits to name it] | per application: search / named | gain per application: search / named |
|---|---|---|---|---|---|---|---|
| seed1_line_painter | paint everything colour 1 | 90% | 86.2 / 42.4 | 0.6 | 13.0 | 54.7 / 59.8 | 26.5 / 26.5 |
| conqueror | paint everything colour 1 | 90% | 86.2 / 42.4 | 0.6 | 13.0 | 54.7 / 59.8 | 23.6 / 23.6 |
| rainbow_road | paint row 1 colour … | 7% | 86.2 / 45.7 | 6.0 | 15.9 | 16.3 / 10.4 | 3.6 / 0.6 |
| lucky_token | paint everything colour 2 | 91% | 86.2 / 42.4 | 0.4 | 13.0 | 55.3 / 59.8 | 4.2 / 4.2 |
| treasure_map | paint everything colour 1 | 89% | 86.2 / 42.4 | 0.5 | 13.1 | 53.9 / 59.8 | 15.0 / 15.0 |
| homebody | paint the outer ring colour 1 | 89% | 86.2 / 43.9 | 0.8 | 14.5 | 33.9 / 36.0 | 26.1 / 26.1 |

- **Per application the two are priced alike.** The search pays its decision bits but erases a little
  less, because on 10% of grids it does something cheaper. Its decision ≤ E[naming bits] in every row,
  as source coding requires (PR #10 §3.2).
- **The difference is paid once, at summon.** Searching costs 44 description bits more than naming the
  answer. That is the price of *not knowing* the answer when writing the agent: a god who knows its
  best move should name it; a god who does not, pays to search.
- **Search earns its decision bits where the answer varies.** For rainbow_road, 6.0 bits of decision
  buy a gain of 3.6 per application against 0.6 for the most common named move.

### 6.5 Simulated games

Setup:
- four gods, fixed 300 s, 20 Hz;
- 16 seeds per condition (mean ± standard error);
- the templates of `examples.TEMPLATES`: 11 templates × colours, 4 of them calling `score`;
- the summon price is description × s; each application costs the owner per-application × 0.01.

Conditions:
- `off`: Programs only;
- `mix`: half of each god's candidates are open agents;
- `only`: open agents only;
- `asym01` / `asym23`: only gods 0–1 (or 2–3) get open agents.

Policies: `greedy` (four greedy_private) and `mixed` (random, greedy_private, saver,
greedy_omniscient).

**Summon price s = 1** (the honest description length):

| policies | condition | dynamism | tension | spirals /100 commits | lead changes /100 s | welfare | payoff Gini | mutator entropy | mean summon cost | open share of summons | energy spent on applications |
|---|---|---|---|---|---|---|---|---|---|---|---|
| greedy | off | 0.727 ± 0.018 | 0.36 ± 0.02 | 9.8 ± 0.1 | 5.4 ± 0.9 | 2.3k ± 0.5k | 0.18 ± 0.02 | 0.82 ± 0.01 | 19.8 | 0% | 0 |
| greedy | mix | 0.701 ± 0.017 | 0.35 ± 0.02 | 9.4 ± 0.2 | 3.8 ± 0.9 | 4.8k ± 1.6k | 0.21 ± 0.02 | 0.84 ± 0.01 | 23.2 | 5% | 61 |
| greedy | only | 0.493 ± 0.057 | 0.35 ± 0.08 | 4.9 ± 0.9 | 2.6 ± 0.9 | 6.4k ± 2.9k | 0.24 ± 0.02 | 0.17 ± 0.01 | 50.9 | 100% | 642 |
| mixed | off | 0.692 ± 0.018 | 0.33 ± 0.02 | 8.8 ± 0.2 | 3.2 ± 0.8 | 5.1k ± 1.6k | 0.25 ± 0.02 | 0.83 ± 0.01 | 21.8 | 0% | 0 |
| mixed | mix | 0.697 ± 0.015 | 0.32 ± 0.02 | 8.6 ± 0.3 | 3.3 ± 0.7 | 4.7k ± 1.0k | 0.23 ± 0.02 | 0.82 ± 0.01 | 24.5 | 9% | 92 |
| mixed | only | 0.474 ± 0.040 | 0.20 ± 0.06 | 5.9 ± 1.0 | 2.1 ± 0.8 | 6.6k ± 3.6k | 0.26 ± 0.02 | 0.19 ± 0.01 | 50.3 | 100% | 745 |

**Summon price s = ¼** (`open_summon_scale=0.25`):

| policies | condition | dynamism | tension | spirals /100 commits | lead changes /100 s | welfare | payoff Gini | mutator entropy | mean summon cost | open share of summons | energy spent on applications |
|---|---|---|---|---|---|---|---|---|---|---|---|
| greedy | mix | 0.682 ± 0.017 | 0.36 ± 0.03 | 9.5 ± 0.3 | 3.9 ± 0.9 | 9.7k ± 4.0k | 0.25 ± 0.02 | 0.71 ± 0.03 | 19.5 | 49% | 442 |
| greedy | only | 0.479 ± 0.056 | 0.29 ± 0.07 | 5.9 ± 1.1 | 2.2 ± 0.9 | 5.9k ± 2.3k | 0.21 ± 0.02 | 0.18 ± 0.02 | 15.0 | 100% | 623 |
| mixed | mix | 0.652 ± 0.020 | 0.34 ± 0.04 | 9.1 ± 0.3 | 2.3 ± 0.7 | 12.7k ± 4.0k | 0.28 ± 0.02 | 0.64 ± 0.03 | 18.6 | 64% | 530 |
| mixed | only | 0.509 ± 0.039 | 0.28 ± 0.06 | 6.2 ± 0.8 | 1.1 ± 0.4 | 6.7k ± 2.7k | 0.24 ± 0.02 | 0.20 ± 0.01 | 16.0 | 100% | 744 |

The `off` rows are the same games at both prices.

Owner payoff caused by each agent's own commits, at s = ¼, pooled over conditions:

| agent | summoned | mean summon cost | commit rate | owner payoff per commit | owner payoff per agent |
|---|---|---|---|---|---|
| program | 6911 | 22.3 | 0.8 | 1.2 | 78 |
| fixed:recolour_tool | 1648 | 10.9 | 0.5 | 14.7 | 766 |
| relative:paint_best_line | 686 | 10.6 | 0.5 | −13.8 | −658 |
| fixed:paint_one_row | 499 | 11.4 | 0.7 | −10.9 | −798 |
| search:greedy_paint | 307 | 21.6 | 0.9 | 106.7 | 11,484 |
| search:careful_greedy | 94 | 37.2 | 0.8 | 134.6 | 13,589 |
| random:random_row | 83 | 23.3 | 0.8 | −7.7 | −885 |
| search:greedy_swap | 30 | 62.6 | 0.5 | 10.2 | 833 |

At s = 1, 49 `greedy_paint` agents earned their owners 54,496 each, against 86 for a Program.

Does access to open agents help a god win? The same seed is played with gods 0–1 and then gods 2–3
holding access, so each god is compared with itself:

| summon price | policies | god-games | rank gain from open agents (+ = better) | games won by an open-agent god (50% = no edge) |
|---|---|---|---|---|
| s = 1 | greedy | 64 | +0.34 ± 0.17 | 59% |
| s = 1 | mixed | 64 | +0.19 ± 0.12 | 59% |
| s = ¼ | greedy | 64 | +0.22 ± 0.14 | 53% |
| s = ¼ | mixed | 64 | +0.12 ± 0.13 | 47% |

**Readings.**

- **At the honest price (s = 1), written agents are a luxury.**
  - Gods choose them for 5–9% of summons in `mix`, and dynamism is unchanged.
  - The search template is decisive when bought: `greedy_paint`'s 179.6 payoff per commit against
    1.3 for Programs.
  - So access helps a little: +0.2 to +0.3 of a place, and 59% of wins. This is far less than the DSL's
    +0.78 and 66% in PR #10. Per-application pricing and the larger description of open Python both
    rein search in.
- **At s = ¼, open agents take about half of all summons** (49% for greedy gods, 64% for mixed).
  - Welfare roughly doubles or triples (2.3k → 9.7k for greedy gods).
  - Inequality rises.
  - The edge from access shrinks to noise (+0.12 to +0.22, 47–53% of wins). When everyone can buy
    search, nobody gains by it.
- **Language-only worlds lose variety.**
  - Mutator entropy collapses from 0.82 to 0.17–0.20, because the templates mostly paint.
  - Spirals fall from 9.8 to 5–6, and dynamism from 0.73 to 0.47–0.51.
  - As in PR #10, the cure is more templates over the bijective and positional mutators, not prices.
- **Fixed one-move agents hurt their own owners in play** (−11 to −17 per commit). They act blindly on
  every object, the PR #10 finding for Programs. The search agents never do: they evaluate the
  owner's utility first.
- **Per-application energy is a real cost.** Open-only worlds spend 620–750 energy on applications per
  game, out of the ≈ 1,840 the four gods receive (100 each at the start + 1 per second). Owners who
  cannot pay see their agents idle.

## 7. Integration (`sim.py`)

```python
GameConfig(open_agents="mix",            # "off" (default) | "mix" | "only"
           open_share=0.5, open_templates=None, open_gods=None,
           open_pricing={},              # overrides of openagents.measure.PRICING
           open_summon_scale=1.0,        # energy per description bit, at summon
           open_app_scale=0.01)          # energy per per-application bit, paid by the owner on every application
```

- The default `"off"` leaves every result unchanged. A tested game is bit-for-bit identical.
- On each application, the owner pays `per_application_bits × open_app_scale × cost_scale`. If the
  owner cannot pay, the application is skipped (`counters["open_skips"]`).
- Greedy policies value a candidate against its *lifetime* cost: summon +
  apps × discount × per-application.
- `agent_language` (PR #10) and `open_agents` are alternatives.
- **The energy economy.** claude/gridlab-agent-energy (per-agent energy and cooldown) has not merged
  into main. Once it does, `per_application_bits` is exactly the per-act price that economy needs: an
  agent's act would draw on its own battery instead of the owner's pool.

`open_app_scale` = 0.01 is calibrated so that an agent's expected lifetime per-application charges
(≈ 150 applications) are of the order of its old one-shot destruction term. Scaling both prices
together is a game-design lever, not a physical one.

## 8. Port readiness (for PR #11, claude/clean-implementation)

A TypeScript port must reproduce the following, in this order.

1. **ast-bits-v1** (§2.1) from `ast_bits_v1.json`.
   - The production runtime already parses Python inside the sandbox (inspection, ast-bytes-v1), so
     the code can be computed there.
   - The tables pin the CPython 3.13 grammar.
   - The walker is `astbits.Walker` in "code" mode.
   - Test vectors: `test_vectors.json → programs`, below. Each has its source and the expected bits by
     part under both schemes, to 1e-6. Tolerance: 1e-5 bits.
2. **Universal codes and PRNG**: `test_vectors.json → codes, rng, seeds`. These cover γ, the string
   code, the float code, the first SplitMix64 outputs for seed 12345, a Fisher–Yates permutation, and
   `derive_seed` values.
3. **The estimator** (§3.3–3.4).
   - `test_vectors.json → estimators` gives synthetic action tables with their joint, positional, set,
     naming, plug-in, Miller–Madow, shuffle and jackknife values. There is a jackknife check on
     `aabbbcd` = 2.38961 bits.
   - Move keys are `[mutator id, [[field, value], ...]]` in field order.
4. **The reference grids**: `reference_grids_5_base10_rgby.json`. It has 128 uniform, 64 structured
   and 64 game grids, plus the 24 ratchet probes. With them, the full price of every agent in §6.1 can
   be checked end to end. Expect the same bits up to the sandbox's semantics: Python agents run
   identically in the Wasm runtime with the frozen clock and engine seeds.

| program | ast-bits (corpus) | ast-bits (uniform) | ast-bytes |
|---|---|---|---|
| empty_agent | 24.711740 | 57.276054 | 7 |
| one_paint | 45.672121 | 77.990299 | 14 |
| same_move_raw | 45.672121 | 77.990299 | 27 |
| same_move_area | 45.672121 | 77.990299 | 16 |
| renamed | 45.672121 | 77.990299 | 14 |
| computed_row | 69.359389 | 130.076654 | 19 |
| loop | 97.193259 | 177.592400 | 31 |
| import_random | 93.149078 | 155.620749 | 24 |
| from_import | 161.907096 | 247.658196 | 38 |
| helper_after | 48.926995 | 127.355904 | 16 |
| global_counter | 65.252558 | 116.599734 | 17 |
| lambda_max | 124.582443 | 210.733796 | 33 |
| literals | 190.073762 | 263.730367 | 37 |
| fstring | 82.268310 | 161.985671 | 22 |
| walrus_comp | 156.637986 | 248.256461 | 39 |
| class_def | 74.190098 | 182.341729 | 20 |
| greedy | 148.934351 | 244.473804 | 39 |

- `one_paint`, `same_move_raw`, `same_move_area` and `renamed` are four spellings of one move: one
  price.
- `helper_after` exercises a forward reference; `global_counter` `global`; `walrus_comp` the walrus
  in a comprehension; `class_def` class scoping; `literals` every constant kind.

**Gotchas for a port.**
- Preorder follows `_fields` order exactly. FunctionDef's name comes first, and is bound in the
  enclosing scope, before the parameters.
- The literal-move test resolves the callee's name through the scopes. A user function called `paint`
  is not a mutator.
- `best_line` is resolved to the line it hits before actions are compared.
- Entropies are in bits. Miller–Madow uses the natural log in its denominator.

## 9. Recommendations

1. **Adopt open agents in place of a DSL.**
   - Plain Python, the runtime's preloaded standard library, and a closed interface that only
     constructs moves.
   - Price them with `summon_bits` = ast-bits-v1 (corpus weights, frozen per season), and
     `per_application_bits` = jackknife I + prior erasure + motion + amortised ratchet.
2. **Allow seeded randomness and freeze the clock** (§5.4). Keep the seed salt and the reference-grid
   seeds secret during a season (commit, then reveal).
3. **Calibrate the two energy scales together.** At s = 1, written agents are a luxury (5–9% of
   summons). At s = ¼ they take about half, with no lasting edge for any god (§6.5).
   - Description length is honest about Python's generality. A Python agent costs 3–4 bits per AST
     node.
   - To make writing code attractive to kids, lower s rather than bending the code.
   - Alternatively, offer the common idioms as cards (pre-written agents with a fixed, known price).
4. **Use per-application pricing to rein in search, if needed.** Raising `open_app_scale` charges
   search exactly where it acts. Big moves like whole-grid fills cost more every time, while
   information stays cheap. This is the lever PR #10's §6(c) asked for, now principled.
5. **Port order:** ast-bits-v1 with the vectors → the estimator with the vectors → the reference
   fixtures → the sandbox clock and seeds.

## 10. Reproducing

```
cd lib/grid-lab
python3 -m tests.test_openagents                                              # ~15 s
python3 -m gridlab.openagents.build_tables                                    # rebuild ast_bits_v1.json (7 s)
python3 -m gridlab.openagents.evaluate --only costs,weights,kraft,randomness,evasion,attack,fairness,secondlaw,search,vectors
python3 -m gridlab.openagents.evaluate --only search --summon-scale 0.25
python3 -m gridlab.openagents.evaluate --only games --games 16 --summon-scale 1.0      # ~5 min on 4 cores
python3 -m gridlab.openagents.evaluate --only games --games 16 --summon-scale 0.25
```
