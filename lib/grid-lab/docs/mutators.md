# Mutators and programs: design rationale

Code: `gridlab/mutators.py` (25 mutators, `COST_KNOBS`), `gridlab/program.py` (`Guard`, `Step`,
`Program`, `random_program`, `candidates`, `single_step_programs`, `neighbour`), `gridlab/affinity.py`
(empirical probe). Tests: `python3 -m tests.test_mutators`. Every number below is for
**Grid(5,base10,rgby)** with default knobs unless stated. In that type 23 mutators are available, so
naming one costs log2 23 = 4.5 bits.

## 1. Cost theory

An agent is summoned once and then applied to random objects for the rest of the game. That
includes objects its owner does not care about and objects it has already changed. So the price has
to cover what the agent can do *as a map T → T*. One application is not enough to price. Each step
pays five terms, all in bits:

```
step cost = scope_mult · kind_mult · ( 1.0·log2(#mutators)       which tool        (MDL)
                                     + 1.0·D(params)             which parameters  (MDL)
                                     + 1.0·E(params)             bits erased       (Landauer)
                                     + 0.35·Σ_L B_L² / B_L,tot   how much changes  (thermodynamic length)
                                     + 1.0·M(params) )           runtime choice    (Szilard / Bennett)
program cost = 2 (agent base) + guard cost + Σ step costs + ratchet surcharge
```

**(a) Description length, D (MDL).** Each mutator's parameters are a list of fields read in order,
for example *region kind → region → colour*. D = Σ log2(#choices) is the length of a prefix code. So
"row 3" costs log2 10 = 3.3 bits, "cell (2,4)" costs log2 25 = 4.6, and "the whole grid" costs 0
once the region kind has been named. `Mutator.sample` draws the fields uniformly one at a time. A
parameter set therefore appears with probability exactly 2^−D. The random-program prior and the cost
are the same code, as in Solomonoff/MDL.

**(b) Erasure, E (Landauer).** E = H(X) − H(f(X)) is computed under the uniform spawn prior μ. A
bijection erases 0. Painting n cells with a constant erases n·log2 C. Merging colour a into b erases
1 bit for each cell that was a or b, which is 2n/C on average. Folding half of a grid onto the other
half erases the destination half. Sorting a line erases log2(N!/∏m!) in expectation. The non-trivial
cases are computed exactly or by fixed-seed Monte Carlo, and the results are cached.

*Why erasure is the main lever.* Let f be any map and u any utility, with ν = f_*μ. The
Donsker–Varadhan inequality, applied with g = λ·s and E_μ[2^{λs}] = 1/(1−λ), gives

  E_{x~μ}[ s_u(f(x)) ] ≤ min_λ (KL(ν‖μ) + log2 1/(1−λ)) / λ ≈ E(f) + log2 E(f) + 2,

because KL(ν‖μ) = log2|Ω| − H(ν) = E(f) when μ is uniform. A mutator applied blindly to fresh spawns
therefore cannot produce more expected surprisal than about the bits it erases, for any rule. This
answers "rare but trivially cheap". "Fill everything blue" reaches a 2^−50 state for Conqueror, and
it erases exactly 50 bits. "Set every symbol to 5" reaches 2^−80 for Number Bonds and erases 83 bits.
Under erasure pricing, every overwrite route in catalog §2b yields at most about one bit of rarity
per bit of cost. That holds for every family, so pricing by erasure is fair by construction.

*Corollary: bijections are pure redistribution.* Every bijection of a finite set preserves the
uniform measure. A world whose agents are all unguarded bijections keeps its objects distributed
exactly as spawns, and no rule's expected surprisal rises at all. Bijections earn only on objects
that other agents have already structured. Examples: rotating a Rainbow Road → grid gives Rainbow
Road ↓ a jackpot; swapping A↔B steals a Conqueror(A) monochrome grid for Conqueror(B). They are the
*coalition currency* of catalog §4.3, so they cost description and motion only.

**(c) Motion, Σ_L B_L²/B_L,tot (thermodynamic length).** B_L is the expected information changed in
layer L: cells changed × log2(alphabet). The term is quadratic in the fraction of the object that
changes. A two-cell swap costs about 0.2 bits of motion, a row slide 1.3, and a quarter turn of the
whole grid 31. This is the user's "expensive to change the object a lot", and it applies to
bijections too. The resonance is finite-time thermodynamics: driving a system a distance ℓ in time τ
dissipates about ℓ²/τ (thermodynamic length), and optimal-transport costs are likewise quadratic.

**(d) Measurement, M (Szilard engine; Bennett on Maxwell's demon).** A program that looks at the grid
before acting is a demon. It pays for the bits it records, because they must eventually be erased.
Relative targeting ("the row or column with the most red") chooses among 2N lines, so M = log2 2N.
That is exactly the description it saves by not naming the line, so relative and absolute targeting
cost the same, ±1 bit. A guard pays H_b(q) ≤ 1 bit, where q is its pass rate under the prior.

**Ratchet surcharge (closure pricing).** Every mutator is idempotent (f∘f = f) or a bijection, and
none uses randomness at apply time. The tests check this for every mutator in all 60 GridTypes. So
re-applying a one-step unguarded agent gains nothing new. Guards and multi-step programs can still
*ratchet*:

- "If cell (1,1) is not red, move it one step along the rainbow" converges to a red cell.
- "Paint (1,1) red, then slide row 1" converges to a red row after N applications.

A long-lived agent must pay for its **closure**, meaning the state it reaches when re-applied until
it stops. `Program.ratchet_bits` runs the program to closure on 24 fixed spawned grids. It charges
log2(alphabet) for each cell-layer the closure pins (the same value in ≥ 7/8 of probes) beyond what
one application pins. The paint-and-slide ratchet is charged +8 bits, which brings it to 38 bits
against 25 for painting the row directly. The demon is charged +2. Unguarded programs made only of
bijections compose to a bijection and skip the probe. Mutators were designed so that their
relative regions are idempotent: line* always means "where my target is *already* most common".
"The row with the fewest red, painted red" would be a ratchet, so it does not exist.

**Why no random targets.** "Paint a random cell red" re-applied 100 times is a whole-grid fill sold
at a single-cell price. `apply` takes an rng only to satisfy the contract and ignores it.

**Critique of the starting principle, and refinements.**

1. Pure "description + erasure" leaves global bijections almost free: a whole-grid colour swap is
   4.6 bits. That contradicts "expensive to change the object a lot", so the motion term was added.
2. Expected (Shannon) erasure is the right Landauer quantity, and it is what the KL bound uses. But
   it is computed at the prior, and later agents see structured inputs. Chaining merges across agents
   undercharges: three merges into blue on RGBY cost 1.5 bits per cell where the fill costs 2. The
   undercharge is bounded by about ×1.5. `COST_KNOBS["erasure"] = "hartley"` switches to worst-case
   log2(max preimage), which is subadditive and never undercharges, but it overcharges conditional
   maps (recolour, stamp, tally, blend).
3. Per-application costing ignores re-application, which is why the ratchet probe exists.
4. Relative targeting is worth having. Agents hit random objects, and "the row with the most red"
   helps on every object, while "row 3" helps only where row 3 happens to matter. Charging the
   measurement keeps it fair: roughly the same price as naming a line.

### Knobs (`COST_KNOBS`)

| knob | default | meaning |
|---|---|---|
| `step_base` | 1.0 | × log2(#mutators available) per step |
| `describe` | 1.0 | × D |
| `erase` | 1.0 | × E |
| `move` | 0.35 | × Σ_L B_L²/B_L,tot |
| `measure` | 1.0 | × M (line*, guard H_b) |
| `ratchet` | 1.0 | × closure surcharge |
| `agent_base` | 2.0 | flat bits per program |
| `guard_base` | 1.0 | × log2(#guard kinds) = 2.8 bits |
| `erasure` | `"shannon"` | or `"hartley"` |
| `scope` | all 1.0 | multipliers for local / line / block / region / global |
| `kind` | all 1.0 | multipliers for bijective / overwrite |

Program costs are cached per (program, GridType, knob fingerprint), so changing a knob invalidates
the cache automatically.

## 2. The mutators

Notation: n = cells in the region, bc = log2 C = 2, bs = log2 S = 3.32. "Cost" is the full step cost
(including the 4.5-bit tool base) for the example in brackets. Region kinds: cell, line (row/column),
line* (relative), diag, block (2×2/3×3), ring (depth d), core (off the edge), all.

| id | kid summary | layer | scope | bij? | erasure E | cost @5×5 base10 RGBY |
|---|---|---|---|---|---|---|
| `swap_cells` | Swap two cells (or just their colours/symbols) | any | local | ✓ | 0 | 12.6 (next door), 15.2 (anywhere, colours) |
| `shift_line` | Slide a row/column along, wrapping round | any | line | ✓ | 0 | 12.8 |
| `reverse_line` | Read a row/column backwards | any | line | ✓ | 0 | 10.3 |
| `swap_lines` | Swap two whole rows/columns | both | line | ✓ | 0 | 14.2 |
| `turn_block` | Turn/flip a 2×2 or 3×3 square | both | block | ✓ | 0 | 12.8 (2×2 quarter turn) |
| `turn_grid` | Turn/flip the whole grid | both | global | ✓ | 0 | 38.1 (quarter turn), 28.7 (transpose) |
| `sort_line` | Sort a row/column into counting order | both | line | – | E[log2 N!/∏m!] = 6.7 | 16.3 |
| `mirror_fold` | Copy one half onto the other as a mirror | any | line, global | – | n_dest · layer bits | 15.5 (palindromise a row, colours), 31.7 (grid L→R, colours), 68.7 (both layers) |
| `paint` | Paint an area one colour | colour | all scopes | – | n·bc | 16.2 (cell), 23.2 (row), 23.2 (line*), 47.1 (rim), 69.4 (whole grid) |
| `recolour` | Turn colour A into B inside an area | colour | line…global | – | 2n/C | 16.6 (row), 24.3 (grid) |
| `swap_colours` | A and B trade places inside an area | colour | line…global | ✓ | 0 | 12.6 (row), 13.5 (grid) |
| `hue_turn` | Move colours k steps along the rainbow | colour | local…global | ✓ | 0 | 13.1 (cell), 12.5 (row), 25.9 (grid) |
| `pattern_line` | Paint a line as a rainbow run or alternating pair | colour | line | – | N·bc | 22.2 |
| `motif` | Wallpaper the grid: stripes, diagonal rainbow, chessboard | colour | global | – | N²·bc | 70.0 |
| `majority_line` | A line votes: all cells take its commonest colour | colour | line | – | N·bc − H(plurality) = 8.1 | 17.1 (line*) |
| `write` | Write one symbol into an area | symbol | all scopes | – | n·bs | 18.8 (cell), 31.7 (row), 117.4 (whole grid) |
| `step_rank` | Count numbers on by k (wrap; cards keep suit) | symbol | local…global | ✓ | 0 | 14.7 (cell), 39.1 (grid) |
| `write_ramp` | Write a counting run 3,4,5,… along a line | symbol | line | – | N·log2 ranks | 29.7 |
| `swap_symbols` | Two numbers trade places inside an area | symbol | line…global | ✓ | 0 | 13.2 (grid) |
| `paint_by_key` | Colour by what cells show: parity / value mod C / red-black suits | colour (from symbol) | line, global | – | n·bc | 70.0 (grid parity) |
| `stamp` | Every colour-k cell gets symbol s | symbol (from colour) | line, block, global | – | (n/C)·bs | 33.7 (grid) |
| `tally` | Colour-X cells are mines; others show their mine count | symbol (from colour) | line, block, global | – | n(1−1/C)·bs | 83.6 (grid) — needs Numeral |
| `blend` | Cells touching both parents turn the mixed colour | colour | line, global | – | Σ q_cell·log2(C−2) | 9.5 (grid; rarely fires at random) — needs Mixable |
| `suit_swap` | Two suits trade places | suit | local…global | ✓ | 0 | 21.6 (grid, Grid(5,cards,rgby)) — needs Suited |
| `suit_set` | Every card in an area changes suit | suit | line…global | – | 2n | 23.0 (row), 86.6 (grid) — needs Suited |

Counts: 11 bijective and 14 overwrite. By layer: 8 position, 8 colour (including blend), 4 symbol,
3 couplers, 2 suit. Between 22 (cards: no `tally`; rgb: no `blend`) and 24 mutators are
available per GridType.

Sanity ratios (the tests check these):

- A whole-grid colour fill (69) costs 4.3× a single-cell paint (16). In 3×3 and 4×4 grids the ratio
  falls to about 1.8×, because those grids hold few cells.
- Painting a row (23) costs 0.29× five scattered cell paints (81).
- A symbol fill (117) costs more than a colour fill (69).
- A global quarter turn (38) costs 3× a cell swap but less than a fill.

## 3. Guards and programs

A `Program(guard, steps)` has 1–3 steps. Each step that would be a no-op is skipped, and `apply`
returns None if the guard fails or nothing changed. Guards, with their pass rate q under the prior:

| guard | example | D (bits) | q |
|---|---|---|---|
| `cell_colour` | the cell at (2,3) is (not) red | 4.6+2+1 | 1/C |
| `cell_rank` | the cell at (2,3) shows (does not show) a 7 | 4.6+3.3+1 | 1/ranks |
| `line_count` | row 2 has at least / fewer than m red cells | 3.3+2+2+1 | binomial |
| `line_mono` | row 2 is (not) all one colour | 3.3+1 | C^(1−N) |
| `count_colour` | the grid has at least / at most m red cells | ≈2+1+3.6 | binomial |
| `any_line` | some row or column has ≥ m red cells | ≈2+1.6 | ≈ 1−(1−p)^(2N) |
| `count_rank` | the grid has at least m 7s | ≈3.3+4.5 | binomial |

Guard cost = 2.8 (kind) + D + H_b(q). Typical guards cost 9–13 bits. Guards matter because an agent
lands on random objects. "If some row has ≥ 4 red: paint the row with the most red red" leaves
grids that are not already red-heavy alone. That stops it wrecking structure the owner's allies
built, and avoids collisions and churn. Typical programs cost 12–40 bits. A whole-grid jackpot
costs 70–120.

`describe(gtype)` gives a one-liner a kid can read: *"If row 3 is all one colour: sort row 4 smallest
first."* For policies there are `random_program(rng, gtype, max_steps=3, guard_prob=0.3,
mutator_ids=None)`, `candidates(rng, gtype, k)` (k distinct programs), `single_step_programs(gtype)`
(all unguarded one-step programs, about 7.8k at 5×5), `neighbour(rng, gtype, prog)` (a local-search
move) and `Program.apply_batch` (a loop, for convenience).

## 4. Intended affinity: mutator × family

Shortlist ids from catalog §2. "Primary" means the natural tool for the family's top state.
"Support" means it helps with partial progress or redirection.

| mutator | primary for | support for |
|---|---|---|
| `swap_cells` | 26 King of the Hill, 27 Lone Peak, 28 Lantern Lighter | 9 Straight, 14 Lucky Token, 25 Magic Accountant (move value between lines), 31 Royal Court |
| `shift_line` | 1 Rainbow Road (align phase) | 7 Othello, 22 Sudoku (cyclic rows stay Latin), 9 Straight |
| `reverse_line` | 9 Straight (descending→ascending), 1 RR (← to →) | 15 Mirrormancer (redirect) |
| `swap_lines` | 28 Lantern Lighter (build a permutation), 17 Stripe Painter (order stripes) | 18 Feuding, 2 Border Baron, 16 Homebody |
| `turn_block` | 30 Card Windmill, 31 Royal Court | 6 Chessmaster (2×2 quarter turn flips phase), 15 Mirror |
| `turn_grid` | redirect for any axis rule: 1 RR, 15 MM, 17 Stripe, 25 MA, 22 Sudoku, 11 Bridge | free vote for 16, 2, 5, 12, 14, 4 (D4-invariant) |
| `sort_line` | 9 Straight Shooter (runs) | 3 Rummy (runs), Ladder (appendix) |
| `mirror_fold` | 15 Mirrormancer (both layers) | Seesaw, Pinwheel (appendix), 16 Homebody |
| `paint` | 5 Conqueror, 4 Castle Keeper (rim), 16 Homebody (rim/core), 11 Bridge (line*), 13 Seed 1 (line*) | 7 Othello (rim), 28 Lantern (diag), 14 Lucky Token (cell) |
| `recolour` | 5 Conqueror (enemy→mine), 4 Castle (clear W from core) | 28 Lantern, 18 Feuding, 16 Homebody |
| `swap_colours` | 6 Chessmaster (flip a block's phase), 8 Parity Painter (P↔Q) | 5 Conqueror (theft), 18 Feuding |
| `hue_turn` | 1 Rainbow Road (fix a cell/line phase) | 24 Fair Weaver, 19 Mixer (free vote for the rainbow coalition) |
| `pattern_line` | 1 Rainbow Road (ramp), 6 Chessmaster / 7 Othello (alternate) | 24 Fair Weaver, 19 Colour Mixer, 3 Rummy (sets need 3 colours) |
| `motif` | 17 Stripe, 6 Chessmaster, 1 RR (diagonal: RR→ and RR↓ at once), 2 Border Baron | 24 Fair Weaver, 12 Seed 2 (with a constant symbol) |
| `majority_line` | 17 Stripe, 2 Border Baron, 13 Seed 1 (any colour) | 15 Mirror (mono = palindrome), 11 Bridge |
| `write` | 10 Number Bonds, 23 Full House, 21 Bingo, 29 Divisibility (zero treaty) | 27 Lone Peak (cell), 12 Seed 2 (constant patch), 25 Magic Accountant |
| `step_rank` | 22 Sudoku, 25 Magic Accountant (adjust a cell) | 9 Straight (fix one cell), 8 Parity (odd k flips parity), 26 KotH |
| `write_ramp` | 9 Straight Shooter, 22 Sudoku | 3 Rummy runs, 8 Parity Painter (ramps alternate parity) |
| `swap_symbols` | 21 Bingo (uncalled→called), 23 Full House | 10 Number Bonds, 14 Lucky Token |
| `paint_by_key` | 8 Parity Painter (all keys) | 6 Chessmaster / Islander (on an addition table), 13 Seed 1 |
| `stamp` | 14 Lucky Token (green 1s), Rook's Watch | 13 Seed 1 (high values on my colour), 26 KotH |
| `tally` | 20 Honest Minesweeper | 27 Lone Peak (floods low values) |
| `blend` | 19 Colour Mixer | 18 Feuding (buffer becomes the mix) |
| `suit_swap` | 30 Card Windmill | 3 Rummy (card GridTypes), Warm Hearts |
| `suit_set` | 30 Card Windmill (quadrant suits), Flush Royale | Court Parade |

Design intent:

- Each layer has both bijections and overwrites, at every scope, so each camp has cheap partial moves.
- Clumpers get `paint`, `majority_line` and `recolour`. Alternators get `pattern_line`, `motif` and
  `hue_turn`, which have the same erasure per cell as a fill. That way, catalog §2b's 1-step
  positional repaints cost exactly what monochrome fills cost.

## 5. Empirical probe (ordinal-only, empirical surprisal)

Run `python3 -m gridlab.affinity [--what yield] [--context structured]`. For each family available
in gridlab/rules (17 at the time of writing: seeds plus strategy), the probe:

- draws params;
- builds an **empirical** survival from 4096 spawns (surprisal capped at 12 bits; this is not the
  engine's calibrated surprisal, and it under-rates jumps);
- picks the best of 16 sampled params for each mutator by mean Δs on training grids;
- reports mean Δs on held-out grids.

Results for Grid(5,base10,rgby), fresh spawns, as yield ×100 (bits of surprisal per bit of cost):

| family | best tool | yield | runner-up |
|---|---|---|---|
| mirrormancer | mirror_fold | 22 | write 6 |
| neighbourhood_vote | paint | 22 | recolour 11 |
| seed1_line_painter | paint | 17 | recolour 16 |
| rainbow_road | pattern_line | 17 | motif 15 |
| staircase_climber | write_ramp | 17 | sort_line 6 |
| homebody | recolour | 16 | motif 10 |
| islander | motif | 15 | pattern_line 7 |
| border_baron | motif | 14 | paint_by_key 8 |
| conqueror | motif | 13 | paint / recolour 10 |
| parity_painter | stamp | 11 | paint_by_key 10 |
| rooks_watch | stamp | 11 | write 8 |
| seed3_green_ones / lucky_token | write | 10 | stamp 7–8 |
| picture_frame | paint | 8 | – |
| lone_peak | tally | 6 | – |
| far_apart | paint | 5 | – |
| seed2_patchwork | sort_line | 1 | – |

Readings:

- Yields fall in a narrow band of 0.1–0.2 bits per bit for 13 of 17 families. That is what the
  Landauer bound predicts. Overwrites cannot beat about one bit per erased bit, and the 12-bit cap
  hides the top end.
- Eleven different mutators are a family's best or runner-up tool.
- As predicted, **every bijection scores ≈ 0 on fresh spawns, and also on "structured" grids** made
  by three random overwrites. Their value needs *aligned* structure from other gods, which this probe
  does not model. The engine's games will show whether gods actually use them. In one 4-god
  greedy_private game the top shares were paint 12%, turn_block 11%, recolour 11%, swap_lines 10%
  and swap_colours 10%, so policies do buy them.

## 6. Risks I foresee

1. **Both-layer families are starved of single-step routes.** Seed 2 Patchwork scores ≈ 0 with any
   one step. It needs a constant-symbol patch plus a proper colouring. Lone Peak needs "flatten
   everything except my peak", and Rummy needs sets and runs. These need 2–3 step programs, which
   pay the agent base again plus the ratchet probe. Policies must search multi-step programs for
   them (`neighbour` exists for this). If they still lag, add a bespoke coupler, for example a
   "flatten: cap a region at its second-highest value" mutator.
2. **Global wallpaper `motif` is the best tool for 4 families.** It is priced at full erasure
   (70 bits), but it serves RR, Islander/Chessmaster, Stripe, Border Baron and Fair Weaver *at once*.
   That is the catalog's diagonal-rainbow coalition jackpot. Payoff s_i·S_−i rewards shared rarity,
   so motif may dominate games dealt from that coalition. Levers: `scope.global`, or split motif's
   styles.
3. **Theft is cheap.** A global `swap_colours` costs 13.5 bits and moves a Conqueror(A) jackpot to
   Conqueror(B). Specific-colour families (Conqueror, Castle, Homebody, Othello, Lucky Token) are
   both its victims and its users. Colour-permutation-invariant families (RR, Stripe, Fair Weaver,
   Mirror) are untouched. Swap wars could produce churn with no welfare. Lever: `kind.bijective` or
   `move`.
4. **Erasure is computed at the prior.** Conditional maps (`recolour`, `stamp`, `tally`, `blend`) erase
   far more on structured inputs. `blend` costs 9.5 bits because it rarely fires on spawns, but on a
   yellow/blue Feuding grid it rewrites every buffer cell. If Colour Mixer over-performs in games,
   switch to `erasure = "hartley"`, or price blend at its Hartley value.
5. **The ratchet probe sees pins, not relations.** A closure that builds relational structure
   without fixing values is not charged; "copy a cell to its neighbour, then slide" is one example
   (it makes lines constant but of a varying colour). The probe also uses 24 probes, which is
   coarse. Programs are capped at 3 steps, which bounds the damage.
6. **Small grids.** At 3×3 the tool base and description dominate, so a whole-grid fill is only
   about 1.8× a cell paint. Clumpers' monochrome jackpots (2^−14 at RGB 3×3) are cheap there in
   absolute terms, though still Landauer-fair.
7. **Card GridTypes.** `suit_set` and `suit_swap` serve only card families (Card Windmill, Court Parade,
   Warm Hearts) that the rules worker had not implemented when I wrote this. Until then they are
   dead weight in card GridTypes, and they inflate the tool base by 0.1 bit.
8. **Relative targeting is offered only as line\*.** Rules that care about "the highest cell" (Lone
   Peak, King of the Hill) have no relative cell selector. They must name cells, which costs 4.6
   bits and helps only where that cell happens to matter.
