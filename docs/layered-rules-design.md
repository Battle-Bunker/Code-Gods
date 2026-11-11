# Layered rules: an easy base, and interactions that reach higher

Status: design brainstorm with measured prototypes (2026-11-11). The paradigm is now implemented: see `docs/tiered-rules.md` for the shipped code and `docs/layered-rules-measurements/` for the numbers on real families.

Code:
- `lib/game-utilities/scripts/rule-difficulty-layered.mjs`: the prototypes. It holds the operator menu, six families,
  the composition variants and stand-ins for the beginner eight.
- `lib/game-utilities/scripts/layered-profile.ts`: the tiered difficulty profile. It wraps the rule-difficulty
  framework.
- Tests: `lib/game-utilities/test/layered-rules.test.ts`.

Run:

```
pnpm --filter @workspace/game-utilities layered [--families a,b] [--budget quick] [--no-pairs] [--no-games] [--markdown FILE]
pnpm --filter @workspace/game-utilities difficulty --only-adhoc --adhoc scripts/rule-difficulty-layered.mjs --moves symbol --no-pairs
```

The owner asked for two things in one rule:
- a wide space of variants, with parameters that take many values;
- higher upper reaches of rare, valuable states, on top of an easy starting point a player can pursue at once.

The parameters should mostly live in the higher-order interactions, which a player does not need to digest to start.

This document:
- proposes a paradigm;
- measures it on eight prototype families (two per brief item);
- sets out what four independent brainstorms found and where they disagreed;
- ends with the decisions for the owner and a staged plan.

---

## 1. The recommendation in a page

**A family is a base plus a menu of interactions.**

- **The base** is a simple preference over simple units: pairs, boxes, lines, windows. It is complete on its own: the
  card's first sentences are a goal a 12-year-old can pursue in their first game.
  - It has few or no parameters.
  - It must be greedy-solvable: `DIFF` ≤ 10, `K` ≤ 3.5, and a `rate4` within the pool's 1.6× band.
  - It **exposes a vocabulary**:
    - its *units* and which of them score;
    - the *marked cells* it creates (kings, hilltops, partners);
    - the *helper cells* that serve them (subjects).
- **An interaction** is an operator written once over that vocabulary and dealt with its own parameters. Examples:
  - "satisfied units whose cells add up to x";
  - "shortest paths between marked cells whose cells add up to x";
  - "roads of exactly y helper cells";
  - "satisfied units holding exactly k ys";
  - "different values among the marked cells".
  
  Because operators read only the vocabulary, one operator serves every base that exposes it. The parameters live here
  (x from 0 to 9·L, y from 0 to 9, k, lengths).
- **A dealt rule** is the base's params plus at most **one** interaction with its params at beginner and standard
  difficulty, and two at expert difficulty.
- **The ordinal is the gated lexicographic tuple** `[...base, base ≥ t ? interaction : 0]`.
  - The interaction only breaks ties among boards equal on the base.
  - It only starts counting once the base reaches a gate t, which is set at the base's greedy-10-move level.
  - Four things follow:
    - **Below the gate** the rule *is* the base. Its calibration table, prior mean and early climb are the base's own,
      bit for bit. Measured: Opposite Nines `rate4` is 2.76 for the base and 2.77 for the gated tier, against 3.45
      for the ungated tier.
    - So the pool's balance, which rests on the early climb, does not move when interactions are added.
    - **Above the gate** the interaction stretches the top with rarer states: +4 to +22 bits in the prototypes' live tiers.
    - The calibration of the upper part is conditional on the base (§7), where today's sampling estimator is accurate.
- **The card says the base first, then "★ To score even higher:".** The tier is always present, collapsed until the
  base is well along.
  - The one sentence that explains the order: *"One primary point beats any number of secondary points."*
- **Every (base, interaction, params, shape) passes a liveness check before it can be dealt.** On the boards that
  max the base, the interaction must:
  - still vary;
  - not be maxed by most of those boards;
  - not be maxed by a uniform board.
  
  Three of the four brainstorms found the owner's "y in exactly two symmetries" dead at the top of an 18-line mirror
  base: 0 on all 1,000 such boards. The check is what catches this. `layered-profile.ts` reports a first version of it.

**What it buys, measured on 4×4 digits:**

| | base alone | + one interaction (live tiers) |
|---|---|---|
| top bits | 12–44 (beginner bases 15–28) | 24–52; +4 to +22 bits on live tiers, +38–40 on Hilltops paths |
| prior mean, early climb | | unchanged when gated (Opposite Nines `rate4` 2.76 → 2.77); +0.3–0.7 bits a move ungated |
| base-only greedy agent's share of the tier's headroom | | 0.00–0.08 (by accident) |
| tier-aware one-cell greedy agent's share | | 0.1–0.7 |
| a two-cell move escapes greedy's stall (`esc2`) | | ≈ 1 for nearly every tier |
| beam over greedy at 16 moves (`gap`) | | 0.2–0.35 |

The upper tier rewards planning without punishing the base player. A base-only player loses only the tier's bits, and in
40-turn three-player games, playing the tier changed payoff by a few percent (§8).

**The alternatives** (§3):
- **(A1) Plain lexicographic, no gate.** Simplest card. It raises the prior mean and the early climb by 0.3–0.7
  bits a move, so the pool must be re-balanced per interaction.
- **(A2) Unlock.** `[min(base, t), interaction, base]`: once the base reaches t, the interaction outranks the rest of the
  base. Use it when the interaction is dead at the base's top, so a lexicographic tier would add nothing. It is a
  real trade-off, and the hardest to teach.

**Where I disagree with the owner's examples:**
- **Kings and subjects on overlapping 2×2 windows is not a beginner base.**
  - It measures `DIFF` 21–30 at every grading tried.
  - The red team's variants all came out at `DIFF` 24 or more.
  - The nearest design that keeps the intent:
    - the base is the four **corner** boxes (`DIFF` 3, top 15 bits);
    - the paths between kings are the tier (top 33–38 bits).
- **"y in exactly two symmetries" on an 18-line base is dead at the top.** The nearest live tier is "mirror lines
  holding exactly two ys".
- **"Mirrored halves add up to x" with an even x is maxed by the uniform x/2 board.** Restrict it to the 4-cell lines
  with a two-different-numbers clause, or to odd x.

---

## 2. Vocabulary and the interaction menu

### 2.1 What a base exposes

| Vocabulary | Type | Examples |
|---|---|---|
| `units` | lists of cells, each with `ok` (scores) | pairs (Opposite Nines, Crosswise Threes), corner boxes (Two Pair, Strangers), windows (Spread of Three, kings), lines (Mirrormancer, Magic Eighteen), adjacencies (Ladders) |
| `marked` | cells the base singles out | kings (the unique biggest number of a court), hilltops, partners, a window's min and max |
| `helpers` | cells that serve marked cells | subjects (a court's other three cells, if not a king anywhere) |
| relations | defined once, for every base | shares a cell, side by side, shortest Manhattan paths, containment, equal numbers |
| features | defined once, for every unit | sum, max, min, number of different values, count of a digit |

A base's evaluator fills these in as it scores. The prototypes do this in a `vocab` snippet: the card's own code, so
the card a player reads is the code that scores.

### 2.2 The operator menu

Each operator is written once (`OPERATORS` in the prototypes file) and reused by every base that exposes its inputs:

| Operator | Params | Reads | Breaks a uniform maximum? | Bases it fits |
|---|---|---|---|---|
| `unitsSum` | x; `half` (a line's first half); `length` | units | only with odd x, or a "two different numbers" clause | mirror lines, boxes, windows, Magic Eighteen lines |
| `linesSum` / `windowsSum` | x | a unit kind the base does not score | yes, except x = 4d or 2d | any base, in particular pair bases (Opposite Nines, Crosswise Threes) |
| `pathsSum` / `pathPairs` | x | marked cells | yes (marked cells need a unique king or peak) | kings, hilltops, a window's max cells |
| `roads` | y | helper cells | n/a (helpers need courts) | subjects, partnered cells |
| `sameRoads` / `sameHelperRoad` | y | equal numbers (and helpers) | no (all-same is one road): needs a y or a base that forbids uniform boards | Two Pair, kings |
| `exactlyIn` | n, y | units | yes for overlapping units; trivial on disjoint ones | overlapping bases only (mirror rows and columns, Magic Eighteen) |
| `holding` | k, y | units | yes (k < length) | mirror lines, boxes, lines |
| `distinctMarked` | – | marked cells | yes, by construction | kings, hilltops |
| `ladders` | y | the board (+1 steps) | yes | Ladders, Leapfrog |

Two operators that the brainstorms proposed are not prototyped here:
- **Crossings:** satisfied units of kind A crossing satisfied units of kind B. This is the general "in two symmetries".
- **Chains:** adjacent satisfied units with equal features.

### 2.3 Rules for a good interaction

These four rules came from all four brainstorms and the measurements:

1. **Max-compatible (alive at the top).** Under a lexicographic order, the interaction must still vary on the
   boards that max the base, and be rare there (aim for ≥ 8 bits within the base-max set).
   - It counts for nothing if it is 0 there ("exactly two symmetries" on 18 lines).
   - It adds no reach if every top board maxes it.
2. **Breaks the base's degenerate maximum, never keeps it.** Prefer these:
   - "exactly k" counts;
   - sums with a parity or two-numbers clause;
   - "different values".
   
   Avoid "count of digit y" and "roads of equal numbers" unless the base already forbids uniform boards.
3. **Graded.** The count rises one unit at a time.
   - "Each road of exactly y" is graded.
   - "The longest road reaches y" is a cliff.
   - Counts that move in steps of 2 because the base forces orbits (half-turn pairs, mirror twins) are graded but
     chunky. Counting orbits ("pairs of mirrored columns") fixes it at the cost of a longer card.
4. **Defined over the base's own vocabulary where possible.**
   - "Among your courts / mirror lines / pairs …" keeps the card's second tier a refinement of the first.
   - A different unit kind (Opposite Nines' "lines add up to x") is fine when it *agrees* with the base. Partner rows
     sum to s and 36 − s, so x = 18 is free on the long diagonals. That turns the tier into an opening for Magic
     Eighteen (§8).

### 2.4 Counting the parameter space (4×4 digits)

Here "dealt variants" means distinct after removing unsatisfiable, trivial and degenerate values. "Tables" means after
the symmetry classes of §7.4.

| Family | Base params | Interaction params | Dealt variants | Tables |
|---|---|---|---|---|
| Royal Court (corners) | – | paths x ∈ 8..30; pathPairs x ∈ 2..18; roads y ∈ 2..6; distinct | 23 + 17 + 5 + 1 = 46 | 46 (not complement-symmetric) |
| Hall of Mirrors | lines ∈ {rows, columns, rows+columns, all} | halves of 4-cell lines x ∈ 1..17, odd (or with a two-numbers clause); holding k ∈ {1, 2, 3}, y ∈ 0..9 | 4 × (9 + 30) = 156 | 4 × (5 + 15) ≈ 80 (x ~ 18 − x, y ~ 9 − y; rows ~ columns) |
| Opposite Nines | – | lines x ∈ 10..26; windows x ∈ 6..30 | 17 + 25 = 42 | 9 + 13 = 22 (x ~ 36 − x) |
| Two Pair | – | equal roads y ∈ 3..8; boxes x ∈ 4..32 | 6 + 29 = 35 | 6 + 15 = 21 |
| Ladders | – | ladders y ∈ 3..7; lines x | 5 + 25 = 30 | 30 |
| Hilltops | – | distinct; paths x | 1 + 30 = 31 | 31 |

- A family dealt one interaction from its menu has 30–160 variants. Stacked two-deep, they multiply to 10³–10⁴.
- The tables are the binding constraint (§7). That is why the recommendation is one interaction per dealt rule below
  expert difficulty, and conditional calibration.

---

## 3. How the tiers combine

All five compositions were measured on the prototypes. "Prior mean" is the mean bits on random boards.

| Composition | Ordinal | Card sentence | Base-only player | Early climb | Calibration |
|---|---|---|---|---|---|
| **Gated lexicographic (recommended)** | `[...base, base ≥ t ? tier : 0]` | "Once you have t courts, …" | keeps every base bit | identical to the base (Opposite Nines `rate4` 2.76 → 2.77, prior mean 0.82 → 0.82) | below t: the base's own table; above t: conditional (§7) |
| Lexicographic | `[...base, tier]` | "One primary point beats any number of secondary points." | keeps every base bit | rises: the tier breaks ties from the first move (Opposite Nines 2.76 → 3.07–3.45; Royal Court 3.60 → 3.7–4.2) | one joint table per variant; the sampled top is off by up to ±15 bits on a rigid base (§7) |
| Unlock | `[min(base, t), tier, base]` | "Once you have t …, secondary points come first." | loses bits once past t | slightly lower | as lexicographic |
| Sum | `base + tier` | "Each walk is worth as much as a court." | loses 9–17 bits (brainstorm A) | changes | small table, but the tier eats the base |
| Product | `base · (1 + tier)` | hard to say | loses 5–17 bits | changes | |

**Measured: unlock and sum let the tier override the base.**
- Royal Court with x = 20, composed by sum: the best board found had 28 points made mostly of paths.
- Unlocked at 6: the best board found has 6 courts and 13 paths (`[6, 13, 14]`), not 9 courts.
- The red team's sum version of the mirror tier left a plain-mirrormancer co-player with 26.9 of its 44.2 bits.

So the sum and the product are reserved for rules advertised as expert trade-offs, and never deal a base-only beginner
into a game.

**Why gated, not plain lexicographic.** Brainstorm C measured that a plain lexicographic tier changes the *body* of the
table, not just its top:
- prior-mean bits rise from 0.87 to 1.19 for kings, and from 0.19 to 0.87 for mirror rows;
- that moves `rate4`, the column that tracks win share (Spearman 0.78), and would fail the equal-opportunity rule
  (P10: a mean gap of at most 0.5 bits) against the family's own base.

The gate puts the table back to the base's below t, by construction. The cost is one clause on the card ("once you have
t …"), and an interaction that is invisible to the score until then.

**The player experience brainstorm (B) argued against a gate.** Its points:
- a gate below the top is a cliff (against P9);
- the tier adds no bits below it.

Both are true *of the tier*. But a gate at the base's g10 level comes after the base is well along, which is exactly
when brainstorm B's own card proposal opens the collapsed tier. Below that level, a tier point is worth nothing to a
learner anyway. The recommendation keeps the gate and sets t from the measured greedy-10-move base level, so the gate
opens when the card does.

---

## 4. The card: progressive disclosure

The pattern extends P4 (primary, secondary, tertiary points) and needs no new grammar:

```
Try to <goal>.                          <- the whole base rule; a child can stop reading here
<one idea per sentence>
Each <unit> scores 1 primary point.
──────── ★ To score even higher (once you have <t> <units>) ────────
<the interaction, one idea per sentence>
Each <interaction unit> scores 1 secondary point.
One primary point beats any number of secondary points.
```

The card text for each prototype is in `FAMILIES[*].card` and `interactions[*].card` in the prototypes file, and in §5.

**The worked example and annotations** (docs/annotations-design.md):
- **Units:** each scoring unit carries a points tuple: a court `[1, 0]`, a walk `[0, 1]`. The existing check that the
  units add up to the card's score works per tier, unchanged.
- **Hover modes:** the toggle above the board becomes `[👑 Courts | 🚶 Walks]`. It starts on the base, and offers the
  tier once the tier is open. A walk is a `line` part with its two king cells marked; a road is a `region` part.
- **Near misses for each tier:**
  - "this square: 9 = 2 + 3 + 3, one too many";
  - "this walk adds up to 18, 2 short of 20".
- **Headline:**
  - tier open: "This board: 5 primary points and 2 secondary points (5, 2)";
  - tier collapsed: "5 primary points. Bonus: 2 secondary points; tap ★ to see why."

**Learning the second tier.** The full text is always on the card (P8: the card, summary and assistant briefing are
rendered from one text), collapsed under a ★ line that names the idea and its params. It opens by itself on the first
of these:
- the base reaches the gate t;
- two turns pass with no primary gain;
- the board already holds a tier point.

**The assistant** always gets both tiers and this policy:
- suggest a tier move only when no single move gains a primary point;
- never suggest losing a primary point except as a named two-step plan.

Brainstorm B measured why the two-step plan matters. On boards with every Opposite Nines pair adding to 9, no
one-cell change ever raised its ladder tier without losing a pair (0 of 3.2 million moves). Changing a cell and its
partner together did, 2% of the time.

**What an expert gets.** The rule gallery shows:
- the whole menu of interactions with their parameter ranges;
- a rarity ladder from calibration, for example "(6, 0): 1 board in 20,000 · (9, 4): 1 in 10¹¹";
- the best tuple seen.

**Shape truth.** Every count on a card ("18 lines", "four corner boxes", "spin half a turn") is rendered from the shape
through the phrasebook (P5), and refused by the checker where it is false (§9).

---

## 5. Measured prototypes

**Settings:** Grid(4,base10,rgb), number moves only, the framework's default budget.
- Each rule is calibrated on the spot at the small budget, and its top is raised by three annealing runs. A top is
  therefore *the best any search found*: a lower bound, and itself a sampled estimate. Brainstorm C found such tops
  can be off by ±15 bits for a tier on a rigid base (§7), so read the `top` column to ±5 bits.
- The full table is in §5.7. This section gives each family in a few lines.

**Columns:**
- `base agent`, `tier agent`: the bits a one-cell greedy agent ends with (48 moves), on the full rule, when it climbs
  the base only or the whole rule.
- `accidental`, `tier share`: the share of the tier's headroom each of them holds. The headroom runs from the same
  base with tier 0 up to the full top.

### 5.1 Royal Court: kings and subjects (the owner's example)

> A 2×2 square is a court when its biggest number (the king) is bigger than every other number in it, and equals the
> other three (the subjects) added up, like 9 with 2, 3 and 4. Each court scores 2 points; a square whose king is one
> away from the sum scores 1.

**Ambiguities, and what the prototype chose:**
- **Which squares.** The prototype measures three bases:
  - the 9 overlapping windows;
  - the 4 corner boxes;
  - "graded": the 9 overlapping windows scored as `[courts, −total gap]`.
- **Ties for king.** A tied biggest number means no king and no court. That alone kills the all-zero board (0 = 0 + 0 + 0) and every 0/k checkerboard. Both are
  degenerate maxima the red team found for a literal reading: 32 million boards max a tie-allowing base, including
  `0505/5050/…`.
- **"Close".** A court scores 2, one off scores 1. The graded base uses the total gap as a tie-break.
- **Which paths.** The paths counted are every shortest (monotone) path between two distinct king cells.
  - `paths(x)` sums the cells along the path, both kings included.
  - `pathPairs(x)` counts the king pairs with at least one path whose cells *strictly between* the kings add up to x,
    with the number of such paths as the tie-break.
  - Brainstorm A's reason for `pathPairs`: corner-to-corner kings have up to 20 paths and would dominate a plain count,
    and including the kings re-measures the base.
- **Roads of subjects.** The plain "longest road" plateaus: base-only boards already have roads of 10–12. Two versions
  are measured instead:
  - roads of *exactly* y;
  - the longest road of subjects showing *the same number*.

**Interaction cards:**
- **paths(x):** "To score even higher: each shortest path (moving side by side) from one king to another whose numbers,
  both kings included, add up to x scores a point."
- **pathPairs(x):** "walk from one king to another, always getting closer. Each pair of kings with a walk whose numbers
  in between add up to x scores a point; more such walks break ties."
- **roads(y):** "subjects that touch side by side make a road. Each road of exactly y subjects scores a point."
- **distinct:** "each different number your kings show scores a point."

**Measured:**

| Base | top | DIFF | K | rate4 |
|---|---|---|---|---|
| 9 overlapping windows | 29.8 | 30.3 | 3.7 | 3.60 |
| graded | 28.6 | 21.4 | 3.2 | |
| 4 corner boxes | 15.4 | **3.4** | 3.0 | 3.19 |

The overlapping base fails the beginner thresholds at every grading tried, here and in the red team's runs
(`DIFF` 24.6–59.5). Courts overlap and compete for the same cells.

**The corner base is the beginner base.** Its interactions on top:

| Interaction | top bits | DIFF |
|---|---|---|
| paths x = 16 / 20 / 24 | 33–38 | 33–38 |
| pathPairs x = 6 / 10 | 31–33 | |
| same-number road | 37.5 | |
| distinct kings | 17.1 | 4.6 |
| roads y = 3 | 20 | |
| roads y = 5 | 15 (no gain) | |
| shared | 14 (no gain) | |

**Corner base with paths:** an easy base (15 bits), and a deep second tier that adds 18–22 bits and needs a plan:
- a base-only agent holds 3% of the tier's headroom by accident;
- a one-cell tier-aware agent holds 14% (gated, x = 20);
- the beam does better.

`shared` is degenerate on the corner base: disjoint boxes cannot share a cell.

**Degenerate boards:** none at the base, and none at any tier: the uniform-maximum column is empty for every Royal
Court variant.

**Parameters:** 46 variants (§2.4).

### 5.2 Hall of Mirrors: mirrormancer grown (the owner's example)

> A line is a mirror if its numbers read the same forwards and backwards. The lines are the rows, the columns and every
> diagonal of two or more cells (18 lines on 4×4). Each mirror line scores a point; each matching pair in any line
> scores a smaller point.

**Measured bases:**

| Base | top | DIFF | K | rate4 |
|---|---|---|---|---|
| all 18 lines | 43.7 | 14.8 | 1.5 | 3.02 |
| rows and columns | 39.0 | 28.6 | 1.7 | 3.57 |

- Both bases are **maxed by every uniform board**.
- The base needs the matched-pairs secondary, as today's family has. The red team measured a plain count of mirror
  lines at `DIFF` 45.6 (18 lines) and 76.2 (rows and columns).
- With all 18 lines, the base-max set is exactly 1,000 boards: corners p, edges q, centre t.

**The interactions:**
- **halves(x), the owner's "the [2, 3] in [2, 3, 3, 2] adds up to x".**
  - Over all lines, this keeps or sharpens the uniform maximum for every even x: the uniform x/2 board wins.
  - With x = 6, the red team found the all-3s board scores 16 of 18.
  - Measured with x = 6: top 49.5, but the uniform 3 and 6 boards reach 99% of it.
  - **The nearest fix (`halves4`):** count only 4-cell lines, and deal odd x, or add a "two different numbers" clause.
    Measured with x = 13: top 49.8, `DIFF` 20.1. A uniform board cannot reach it.
- **twice(y), the owner's "y in exactly two symmetries".**
  - It is **dead at the top** of the 18-line base. Every cell lies in 3 or 4 mirror lines when all 18 mirror, so the
    tier is 0 on all 1,000 top boards (measured by brainstorms A, B and D, and pinned in the tests).
  - It only lives on the rows-and-columns base, where every cell is in exactly two lines. There, the uniform 7 board
    scores 16, so it keeps the degenerate maximum.
  - The unlock composition (`@unlock8`) revives it at the cost of the base: its best board was `5777/7377/7737/7775`,
    with 10 mirror lines.
- **pairOf(y), the nearest live tier: "each mirror line holding exactly two ys".**
  - At the 18-line top (corners p, edges q, centre t), with q = y and p, t ≠ y, every row, column and short diagonal
    holds exactly two ys: 16 lines, on `0550/5005/5005/0550`-type boards (pinned in the tests). Brainstorm B: 16
    lines on only 81 of the 1,000 top boards for y = 7.
  - It scores 4 on the uniform 7 board (only the 2-cell diagonals), so it **breaks the uniform maximum** in the ordinal.
  - **What the framework saw instead shows the calibration problem of §7.**
    - The default run's annealing found only 6 such lines (`7337/3663/…`), not 16. The quick run's climbs did find 16
      (§6.1).
    - The sampled table gives the tier just +2.1 bits, so the uniform 7 board still reads as within 99% of the top
      (`unif` 7 in §5.7).
    - A tier on a rigid base is invisible to today's sampled calibration and to one-cell searches. Conditional
      calibration (§7.3) and the exact liveness check (§12, step 2) are what make it count.

**How it relates to the existing mirrormancer:** Hall of Mirrors is a sibling family.
- Mirrormancer keeps its id, params (`axis`), card and tables.
- Hall of Mirrors could later *become* mirrormancer's tiered params (`{ axis, tiers: [...] }`), keeping the old key for
  the tierless params (§10).

### 5.3 Opposite Nines grown

> Each number has a partner: the cell you reach by turning the board half way round. Each pair of partners that adds up
> to 9 scores a point.

**The base:** top 28.1, `DIFF` 0, `K` 1.0, `rate4` 2.76. No uniform maximum. It is the cleanest base measured.

**The interactions:**
- **lines(x):** "each row, column or long diagonal that adds up to x scores a point".
  - With x = 18, partner rows sum to s and 36 − s, and both long diagonals add up to 18 for free at the base's top.
    The tier is then a magic square, and it agrees with Magic Eighteen.
  - Measured tops: 38.8 (x = 18), 35.8 (x = 15), 37.1 (x = 24).
  - Gated at 6: top 38.2, early climb unchanged, `DIFF` 24.8 (the tier needs a plan).
- **windows(x):** "each 2×2 square that adds up to x scores a point".
  - At the base's top, the centre window always sums to 18, and a window and its half-turn image sum to 36. So x = 18
    moves in steps of 2, and any other x reaches at most 4 windows (brainstorm A, exact).
  - Measured tops: 36.1 (x = 18), 34.0 (x = 12).

**Parameters:** 42 variants, 22 tables (x ~ 36 − x).

### 5.4 Two Pair grown

> Each corner 2×2 box should hold two different pairs, like 3 3 7 7. A box with two different pairs scores 2 points; a
> box with one pair scores 1.

**The base:** top 21.4, `DIFF` 0, `K` 3.0, `rate4` 2.46.

**The interactions:**
- **roads(y): "each group of exactly y equal numbers joined side by side".**
  - With y = 4: top 29.5, `DIFF` 16.2. The pairs have to line up across box borders.
  - With y = 6: dead (top unchanged, 20.3).
  - y must stay at 4 or below the largest road the base allows. That is a per-shape check.
- **boxes(x): "each two-pair box whose numbers add up to x".**
  - Tops: 25.4 (x = 10), 24.6 (x = 20).
  - It adds only 3–4 bits. The tier lives inside one unit, so a one-cell agent solves it (`DIFF` 3–10). It adds reach
    but not depth, as brainstorm C predicted.
- **Links (brainstorm B, not measured):** "neighbouring boxes linked when they share exactly one pair". This turns four
  separate boxes into a ring and is the more interesting second tier.

### 5.5 Ladders (own family 1)

> Each pair of side-by-side numbers that are one apart (like 4 and 5) scores a point.

**The base:** top 39.1, `DIFF` 28.7. It fails the beginner thresholds: the best boards (a gradient, or a 2-colouring
like 5656/6767) are far from where greedy settles.

**The interactions:**
- **ladders(y):** "each ladder of y cells, every step side by side and one more than the last".
  - On the gradient board `0123/1234/2345/3456`, ladders of 7 are the C(6, 3) = 20 corner-to-corner paths (pinned in the
    tests).
  - With y = 5: top 47.5, `DIFF` 10.4.
  - Gated at 16: the tier-aware agent holds 39% of the tier's headroom, against 2% for the base-only agent. This is the
    best "graded tier" result in the set.
  - The best board found is the gradient `6543/7654/8765/9876`.
- **lines(x):** tops 47–48.

**Verdict:** a mid-difficulty family. Its base needs a softer unit to be a beginner one (e.g. "one or two apart scores
1, one apart scores 2").

### 5.6 Hilltops (own family 2)

> A hilltop is a number bigger than every number beside it. Each hilltop scores a point.

**The base:** top only 12.0, `DIFF` 27.2, `rate4` 1.87.
- Its maximum is the 8-peak checkerboard, a two-digit degenerate board.
- It shows what the paradigm cannot rescue: a base must be easy *and* reach a respectable top on its own.

**The interactions:**
- **distinct:** top 23.0, `DIFF` 36.8.
- **paths(x):** "shortest paths between hilltops whose numbers add up to x". Tops 50–52, `DIFF` 46–49. A tier deep
  enough to need real search, and the clearest case of the owner's "rare, highly valued states".

**Verdict:** an expert-tier family, not a beginner one.

### 5.7 The full profile

Default budget; regenerate with `pnpm --filter @workspace/game-utilities layered --markdown FILE`. `unif` lists the digits whose uniform board reaches 99% of the top (a degenerate maximum); the ordinal after the best board is what the best search found.

| variant | card | top | +top | rate4 | g10 | g20 | trap | gap | K | **DIFF** | plat | unif | base agent | accidental | tier agent | tier share | best board (ordinal) |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|
| royal_court.overlap | 2872 | 29.8 |  | 3.60 | 20.4 | 20.4 | 0.32 | 0.29 | 3.7 | **30.3** | 0.00 | – | – | – | – | – | 2202/7313/0404/2222 18 |
| royal_court.overlap+paths(x16) | 4311 | 39.8 | 10.0 | 3.90 | 22.8 | 22.8 | 0.43 | 0.27 | 3.5 | **35.0** | 0.00 | – | 21.6 | 0.03 | 22.8 | 0.07 | 8215/5104/2213/3740 [18,10] |
| royal_court.overlap+paths(x20) | 4311 | 35.2 | 5.4 | 3.81 | 22.6 | 22.8 | 0.35 | 0.28 | 3.4 | **31.8** | 0.00 | – | 21.0 | 0.06 | 22.8 | 0.15 | 9414/3212/6101/9234 [18,10] |
| royal_court.overlap+paths(x24) | 4311 | 42.7 | 12.9 | 3.73 | 22.4 | 22.4 | 0.47 | 0.36 | 3.6 | **41.7** | 0.00 | – | 20.4 | 0.03 | 22.4 | 0.10 | 8226/2404/8222/2484 [18,8] |
| royal_court.overlap+roads(y3) | 4760 | 36.4 | 6.6 | 4.21 | 23.5 | 23.5 | 0.35 | 0.29 | 3.5 | **32.3** | 0.00 | – | 22.2 | 0.03 | 23.5 | 0.09 | 1165/6410/1121/5747 [18,1] |
| royal_court.overlap+roads(y5) | 4760 | 30.8 | 1.1 | 3.81 | 21.8 | 21.8 | 0.29 | 0.25 | 3.2 | **27.2** | 0.00 | – | 20.7 | 0.00 | 21.8 | 0.08 | 7475/1211/1031/3251 [18,1] |
| royal_court.overlap+pathPairs(x6) | 4811 | 41.9 | 12.1 | 3.99 | 23.6 | 23.7 | 0.43 | 0.30 | 3.6 | **36.6** | 0.00 | – | 21.8 | 0.01 | 23.7 | 0.02 | 9247/7021/4310/7045 [18,9,12] |
| royal_court.overlap+pathPairs(x10) | 4813 | 36.1 | 6.3 | 4.15 | 23.5 | 23.5 | 0.35 | 0.29 | 3.4 | **32.0** | 0.00 | – | 22.2 | 0.02 | 23.5 | 0.01 | 7451/3017/7451/3017 [18,6,10] |
| royal_court.overlap+sameRoad | 4893 | 33.2 | 3.4 | 3.84 | 21.9 | 21.9 | 0.34 | 0.25 | 3.4 | **29.7** | 0.00 | – | 21.2 | 0.04 | 21.9 | 0.07 | 3737/4040/7315/3117 [18,3] |
| royal_court.overlap+shared(n2) | 3796 | 29.4 | -0.3 | 3.88 | 22.5 | 22.5 | 0.24 | 0.19 | 3.6 | **21.5** | 0.00 | – | 21.9 | 0.14 | 22.5 | 0.23 | 6425/1112/0203/9758 [18,8] |
| royal_court.overlap+distinct | 3266 | 40.6 | 10.8 | 4.04 | 24.0 | 24.0 | 0.41 | 0.27 | 3.4 | **34.0** | 0.00 | – | 22.3 | 0.04 | 24.0 | 0.06 | 4039/3124/1106/8671 [18,7] |
| royal_court.corners | 2872 | 15.4 |  | 3.19 | 14.9 | 14.9 | 0.03 | 0.03 | 3.0 | **3.4** | 0.00 | – | – | – | – | – | 3825/0521/2136/9621 8 |
| royal_court.corners+paths(x16) | 4311 | 33.3 | 17.9 | 3.78 | 18.5 | 18.5 | 0.44 | 0.22 | 3.2 | **33.0** | 0.00 | – | 15.4 | 0.05 | 18.5 | 0.19 | 3110/1123/2412/0614 [8,11] |
| royal_court.corners+paths(x20) | 4311 | 33.0 | 17.6 | 3.52 | 16.8 | 16.8 | 0.49 | 0.27 | 3.2 | **38.1** | 0.00 | – | 15.0 | 0.03 | 16.8 | 0.13 | 9529/3134/1021/3214 [8,9] |
| royal_court.corners+paths(x24) | 4311 | 37.6 | 22.2 | 3.58 | 18.1 | 18.1 | 0.52 | 0.24 | 3.0 | **38.0** | 0.00 | – | 14.9 | 0.03 | 18.1 | 0.15 | 5425/0112/4348/8140 [8,9] |
| royal_court.corners+roads(y3) | 4760 | 20.3 | 4.9 | 3.55 | 16.9 | 16.9 | 0.17 | 0.12 | 3.0 | **14.3** | 0.00 | – | 15.8 | 0.17 | 16.9 | 0.36 | 8031/9162/3610/0321 [8,1] |
| royal_court.corners+roads(y5) | 4760 | 15.0 | -0.5 | 3.11 | 14.5 | 14.5 | 0.03 | 0.03 | 3.0 | **3.5** | 0.00 | – | 14.5 | 0.92 | 14.5 | 0.92 | 5010/2356/3325/0681 [8,0] |
| royal_court.corners+pathPairs(x6) | 4811 | 32.8 | 17.3 | 4.02 | 19.2 | 19.2 | 0.41 | 0.24 | 3.1 | **32.5** | 0.00 | – | 15.8 | 0.01 | 19.2 | 0.05 | 6184/1422/5018/7216 [8,5,6] |
| royal_court.corners+pathPairs(x10) | 4813 | 31.0 | 15.6 | 3.68 | 19.1 | 19.1 | 0.38 | 0.24 | 3.2 | **31.2** | 0.00 | – | 15.9 | 0.01 | 19.1 | 0.09 | 7469/3021/0520/6164 [8,4,8] |
| royal_court.corners+sameRoad | 4893 | 37.5 | 22.1 | 3.31 | 15.8 | 15.8 | 0.58 | 0.21 | 3.0 | **39.3** | 0.00 | – | 14.6 | 0.04 | 15.8 | 0.09 | 2413/0211/6081/7107 [8,4] |
| royal_court.corners+shared(n2) | 3796 | 14.2 | -1.2 | 2.92 | 13.7 | 13.7 | 0.04 | 0.04 | 3.0 | **3.5** | 0.00 | – | 13.7 | 0.92 | 13.7 | 0.92 | 5348/0831/2105/5238 [8,0] |
| royal_court.corners+distinct | 3266 | 17.1 | 1.7 | 3.45 | 16.3 | 16.3 | 0.05 | 0.05 | 3.1 | **4.6** | 0.00 | – | 15.2 | 0.26 | 16.3 | 0.81 | 2697/3102/2112/4752 [8,4] |
| royal_court.graded | 2872 | 28.6 |  | 3.62 | 22.3 | 22.3 | 0.22 | 0.21 | 3.2 | **21.4** | 0.00 | – | – | – | – | – | 0921/8163/0709/9254 [9,0] |
| royal_court.graded+paths(x16) | 4311 | 42.5 | 13.9 | 3.78 | 25.1 | 25.1 | 0.41 | 0.33 | 2.8 | **37.0** | 0.00 | – | 23.4 | 0.02 | 25.1 | 0.08 | 6525/0121/2103/4763 [9,0,7] |
| royal_court.graded+paths(x20) | 4311 | 39.2 | 10.6 | 3.68 | 23.8 | 24.1 | 0.38 | 0.29 | 3.0 | **33.6** | 0.00 | – | 23.7 | 0.03 | 24.1 | 0.11 | 8047/1730/3314/7116 [9,0,6] |
| royal_court.graded+paths(x24) | 4311 | 35.8 | 7.3 | 3.74 | 22.7 | 22.7 | 0.37 | 0.32 | 2.9 | **34.5** | 0.00 | – | 23.7 | 0.06 | 22.7 | 0.08 | 0415/9504/1326/9504 [9,0,8] |
| royal_court.graded+roads(y3) | 4760 | 37.5 | 8.9 | 3.73 | 22.9 | 22.9 | 0.39 | 0.25 | 2.8 | **32.1** | 0.00 | – | 23.0 | 0.02 | 22.9 | 0.06 | 4119/1208/1462/2119 [9,0,1] |
| royal_court.graded+roads(y5) | 4760 | 36.0 | 7.5 | 3.66 | 23.0 | 23.0 | 0.36 | 0.29 | 2.9 | **32.4** | 0.00 | – | 22.4 | 0.00 | 23.0 | 0.03 | 0362/1213/3011/5213 [9,0,1] |
| royal_court.graded+pathPairs(x6) | 4811 | 41.4 | 12.9 | 3.86 | 24.9 | 24.9 | 0.40 | 0.30 | 3.5 | **34.9** | 0.00 | – | 23.7 | 0.00 | 24.9 | 0.01 | 2460/2028/2424/7117 [9,0,7,10] |
| royal_court.graded+pathPairs(x10) | 4813 | 35.9 | 7.3 | 3.59 | 22.9 | 22.9 | 0.36 | 0.31 | 3.0 | **33.5** | 0.00 | – | 22.7 | 0.01 | 22.9 | 0.01 | 9220/5268/1220/9624 [9,0,7,14] |
| royal_court.graded+sameRoad | 4893 | 31.1 | 2.6 | 3.69 | 23.8 | 23.8 | 0.24 | 0.19 | 3.2 | **21.4** | 0.00 | – | 22.5 | 0.03 | 23.8 | 0.12 | 1641/4112/1203/1421 [9,0,2] |
| royal_court.graded+shared(n2) | 3796 | 28.8 | 0.3 | 3.68 | 23.8 | 23.8 | 0.18 | 0.18 | 3.1 | **17.6** | 0.00 | – | 23.2 | 0.23 | 23.8 | 0.23 | 4241/2027/3114/0421 [9,0,8] |
| royal_court.graded+distinct | 3266 | 38.8 | 10.2 | 3.83 | 22.5 | 22.5 | 0.42 | 0.28 | 3.0 | **34.9** | 0.00 | – | 23.1 | 0.01 | 22.5 | 0.03 | 6117/3242/1020/2135 [9,0,6] |
| hall_of_mirrors.all | 2207 | 43.7 |  | 3.02 | 34.2 | 37.2 | 0.15 | 0.15 | 1.5 | **14.8** | 0.00 | 0123456789 | – | – | – | – | 8008/0000/0000/8008 [18,28] |
| hall_of_mirrors.all+halves(x6) | 3014 | 49.5 | 5.8 | 3.21 | 38.0 | 45.8 | 0.07 | 0.05 | 1.5 | **6.2** | 0.00 | 36 | 40.1 | 0.42 | 45.8 | 0.58 | 1441/4224/4224/1441 [18,28,4] |
| hall_of_mirrors.all+halves(x14) | 3016 | 45.5 | 1.8 | 3.12 | 34.5 | 38.6 | 0.15 | 0.15 | 1.8 | **15.1** | 0.00 | 0123456789 | 38.6 | 0.08 | 38.6 | 0.08 | 9559/5335/5335/9559 [18,28,4] |
| hall_of_mirrors.all+halves4(x10) | 3024 | 47.6 | 3.9 | 3.19 | 34.8 | 38.7 | 0.19 | 0.16 | 1.9 | **17.2** | 0.00 | 5 | 38.7 | 0.12 | 38.7 | 0.12 | 5555/5555/5555/5555 [18,28,10] |
| hall_of_mirrors.all+halves4(x13) | 3024 | 49.8 | 6.1 | 3.07 | 35.1 | 38.7 | 0.22 | 0.18 | 1.6 | **20.1** | 0.00 | – | 36.8 | 0.00 | 38.7 | 0.28 | 2552/5885/5885/2552 [18,28,4] |
| hall_of_mirrors.all+pairOf(k2y7) | 2750 | 45.8 | 2.1 | 3.32 | 37.0 | 45.1 | 0.02 | 0.01 | 1.6 | **1.2** | 0.00 | 7 | 37.8 | 0.17 | 45.1 | 0.67 | 7337/3663/3663/7337 [18,28,6] |
| hall_of_mirrors.all+twice(n2y7) | 3123 | 47.4 | 3.7 | 3.03 | 37.1 | 42.8 | 0.10 | 0.10 | 1.7 | **9.7** | 0.00 | 0123456789 | 40.1 | 0.75 | 42.8 | 0.83 | 7227/2662/2662/7227 [18,28,0] |
| hall_of_mirrors.rowsColumns | 1426 | 39.0 |  | 3.57 | 27.9 | 27.9 | 0.29 | 0.29 | 1.7 | **28.6** | 0.00 | 0123456789 | – | – | – | – | 8668/0550/0550/8668 [8,16] |
| hall_of_mirrors.rowsColumns+halves(x6) | 2228 | 43.2 | 4.2 | 3.59 | 29.0 | 29.0 | 0.33 | 0.32 | 1.7 | **32.6** | 0.00 | 3 | 28.8 | 0.10 | 29.0 | 0.13 | 5115/1111/1111/5115 [8,16,4] |
| hall_of_mirrors.rowsColumns+halves(x14) | 2230 | 44.3 | 5.2 | 3.47 | 28.0 | 28.0 | 0.37 | 0.33 | 1.9 | **34.7** | 0.00 | 7 | 27.9 | 0.01 | 28.0 | 0.02 | 7777/7777/7777/7777 [8,16,8] |
| hall_of_mirrors.rowsColumns+halves4(x10) | 2238 | 44.5 | 5.5 | 3.44 | 28.6 | 28.6 | 0.36 | 0.36 | 1.7 | **35.8** | 0.00 | 0123456789 | 28.4 | 0.02 | 28.6 | 0.03 | 3223/7887/7887/3223 [8,16,4] |
| hall_of_mirrors.rowsColumns+halves4(x13) | 2238 | 45.7 | 6.7 | 3.59 | 28.9 | 28.9 | 0.37 | 0.28 | 1.7 | **32.6** | 0.00 | – | 28.2 | 0.00 | 28.9 | 0.03 | 7667/8338/8338/7667 [8,16,2] |
| hall_of_mirrors.rowsColumns+pairOf(k2y7) | 1964 | 43.2 | 4.2 | 3.64 | 28.3 | 28.3 | 0.34 | 0.31 | 1.6 | **32.6** | 0.00 | – | 28.3 | 0.02 | 28.3 | 0.02 | 6996/2772/2772/6996 [8,16,4] |
| hall_of_mirrors.rowsColumns+twice(n2y7) | 2335 | 42.8 | 3.8 | 3.74 | 31.2 | 31.2 | 0.27 | 0.27 | 1.8 | **27.2** | 0.00 | 0123456789 | 30.3 | 0.00 | 31.2 | 0.00 | 7777/7777/7777/7777 [8,16,16] |
| opposite_nines_plus.plain | 1059 | 28.1 |  | 2.76 | 28.1 | 28.1 | 0.00 | 0.00 | 1.0 | **0.0** | 0.00 | – | – | – | – | – | 7069/1345/4568/0392 8 |
| opposite_nines_plus.plain+lines(x18) | 2065 | 38.8 | 10.7 | 3.45 | 32.5 | 32.5 | 0.16 | 0.13 | 2.3 | **14.7** | 0.00 | – | 28.7 | 0.08 | 32.5 | 0.43 | 4851/1142/7588/8415 [8,6] |
| opposite_nines_plus.plain+lines(x15) | 2065 | 35.8 | 7.7 | 3.27 | 30.6 | 30.6 | 0.14 | 0.14 | 2.3 | **14.4** | 0.00 | – | 27.0 | 0.02 | 30.6 | 0.43 | 5622/6351/8463/7734 [8,2] |
| opposite_nines_plus.plain+lines(x24) | 2065 | 37.1 | 9.0 | 3.07 | 29.3 | 29.3 | 0.21 | 0.16 | 2.0 | **18.5** | 0.00 | – | 27.4 | 0.05 | 29.3 | 0.24 | 6099/6684/5133/0093 [8,2] |
| opposite_nines_plus.plain+windows(x18) | 1826 | 36.1 | 8.0 | 3.39 | 30.1 | 30.1 | 0.17 | 0.17 | 2.0 | **16.5** | 0.00 | – | 27.4 | 0.04 | 30.1 | 0.34 | 7606/9375/4260/3932 [8,5] |
| opposite_nines_plus.plain+windows(x12) | 1824 | 34.0 | 5.9 | 3.17 | 32.0 | 32.0 | 0.06 | 0.06 | 1.6 | **6.0** | 0.00 | – | 26.9 | 0.06 | 32.0 | 0.73 | 9235/8527/2741/4670 [8,2] |
| two_pair_plus.plain | 1619 | 21.4 |  | 2.46 | 21.4 | 21.4 | 0.00 | 0.00 | 3.0 | **0.0** | 0.00 | – | – | – | – | – | 5031/0531/6668/7786 8 |
| two_pair_plus.plain+roads(y4) | 3264 | 29.5 | 8.0 | 2.83 | 23.4 | 23.4 | 0.20 | 0.12 | 3.2 | **16.2** | 0.00 | – | 22.7 | 0.05 | 23.4 | 0.15 | 5157/1557/8577/5811 [8,2] |
| two_pair_plus.plain+roads(y6) | 3264 | 20.3 | -1.1 | 2.40 | 20.3 | 20.3 | 0.00 | 0.00 | 3.0 | **0.0** | 0.00 | – | 20.3 | 1.00 | 20.3 | 1.00 | 8300/8344/6677/7766 [8,0] |
| two_pair_plus.plain+boxes(x10) | 2286 | 25.4 | 4.0 | 2.77 | 22.5 | 22.5 | 0.11 | 0.08 | 3.0 | **9.7** | 0.00 | – | 22.0 | 0.20 | 22.5 | 0.32 | 2441/2414/0450/0405 [8,2] |
| two_pair_plus.plain+boxes(x20) | 2288 | 24.6 | 3.2 | 2.80 | 23.7 | 23.7 | 0.04 | 0.02 | 3.0 | **2.9** | 0.00 | – | 23.5 | 0.32 | 23.7 | 0.48 | 5310/5301/6433/4677 [8,2] |
| ladders.plain | 1068 | 39.1 |  | 2.78 | 26.5 | 27.2 | 0.30 | 0.27 | 2.0 | **28.7** | 0.00 | – | – | – | – | – | 5656/6767/5676/4565 24 |
| ladders.plain+ladders(y5) | 2273 | 47.5 | 8.5 | 3.07 | 32.8 | 42.8 | 0.10 | 0.11 | 1.7 | **10.4** | 0.00 | – | 27.3 | 0.02 | 42.8 | 0.63 | 3456/4567/5678/6789 [24,48] |
| ladders.plain+ladders(y7) | 2275 | 39.0 | -0.1 | 2.81 | 27.3 | 28.8 | 0.26 | 0.22 | 2.1 | **23.9** | 0.00 | – | 27.4 | 0.13 | 28.8 | 0.17 | 1012/2123/3212/2321 [24,0] |
| ladders.plain+lines(x18) | 2074 | 48.2 | 9.1 | 3.22 | 30.4 | 33.2 | 0.31 | 0.20 | 2.1 | **25.6** | 0.00 | – | 27.6 | 0.05 | 33.2 | 0.20 | 4545/5454/4545/5454 [24,8] |
| ladders.plain+lines(x10) | 2072 | 47.2 | 8.2 | 2.92 | 27.8 | 29.8 | 0.37 | 0.22 | 1.9 | **29.7** | 0.00 | – | 27.5 | 0.01 | 29.8 | 0.06 | 1234/2323/3232/2323 [24,8] |
| hilltops.plain | 1263 | 12.0 |  | 1.87 | 8.2 | 8.2 | 0.31 | 0.23 | 2.8 | **27.2** | 0.00 | – | – | – | – | – | 4082/1847/6060/5848 8 |
| hilltops.plain+distinct | 1648 | 23.0 | 11.0 | 2.42 | 11.9 | 11.9 | 0.48 | 0.26 | 4.7 | **36.8** | 0.00 | – | 8.8 | 0.06 | 11.9 | 0.30 | 0218/7051/1923/6040 [8,8] |
| hilltops.plain+paths(x15) | 2673 | 52.0 | 40.1 | 2.71 | 18.3 | 19.4 | 0.63 | 0.35 | 3.8 | **48.9** | 0.00 | – | 8.6 | 0.01 | 19.4 | 0.25 | 1315/5131/1513/5151 [8,33] |
| hilltops.plain+paths(x25) | 2673 | 49.7 | 37.8 | 2.60 | 17.7 | 19.2 | 0.61 | 0.30 | 4.4 | **45.6** | 0.00 | – | 8.7 | 0.02 | 19.2 | 0.27 | 1636/9163/2916/7291 [8,30] |
| hall_of_mirrors.all+twice(n2y7)@unlock8 | 3202 | 43.7 | 0.0 | 3.21 | 21.6 | 21.9 | 0.50 | 0.18 | 2.2 | **34.1** | 0.00 | – | 19.2 | – | 21.9 | – | 5777/7377/7737/7775 [8,10,10,20] |
| royal_court.overlap+paths(x20)@sum | 4324 | 40.6 | 10.8 | 3.40 | 20.2 | 20.2 | 0.50 | 0.30 | 3.3 | **40.1** | 0.00 | – | 16.5 | – | 20.2 | – | 2137/1022/4315/0628 28 |
| royal_court.overlap+paths(x20)@unlock6 | 4388 | 50.8 | 21.1 | 3.19 | 20.5 | 20.9 | 0.59 | 0.25 | 3.7 | **42.0** | 0.00 | – | 9.4 | – | 20.9 | – | 7232/5016/8321/4836 [6,13,14] |

<details><summary>Upper tail of each calibration (the last levels: ordinal → bits)</summary>

Upper tail of each calibration (the last levels: ordinal → bits) and calibration seconds at the small budget:

- royal_court.overlap: 14→15.6, 15→18.4, 16→21.1, 17→24.7, 18→29.8 (19 levels, 0.9 s)
- royal_court.overlap+paths(x16): [18,8]→32.8, [18,9]→33.3, [18,10]→35.8, [18,11]→37.5, [18,12]→39.8 (99 levels, 2.4 s)
- royal_court.overlap+paths(x20): [18,6]→31.3, [18,7]→32.5, [18,8]→33.0, [18,9]→34.9, [18,10]→35.2 (94 levels, 2.0 s)
- royal_court.overlap+paths(x24): [18,4]→30.5, [18,5]→31.9, [18,6]→33.2, [18,7]→35.0, [18,8]→42.7 (81 levels, 1.8 s)
- royal_court.overlap+roads(y3): [17,0]→26.1, [17,1]→29.1, [17,2]→29.6, [18,0]→29.8, [18,1]→36.4 (54 levels, 1.7 s)
- royal_court.overlap+roads(y5): [16,2]→25.0, [17,0]→25.1, [17,1]→27.8, [18,0]→29.6, [18,1]→30.8 (39 levels, 1.7 s)
- royal_court.overlap+pathPairs(x6): [18,10,12]→38.0, [18,10,14]→38.3, [18,11,12]→39.7, [18,12,12]→41.6, [18,12,14]→41.9 (184 levels, 2.6 s)
- royal_court.overlap+pathPairs(x10): [18,5,8]→34.1, [18,5,12]→34.5, [18,5,15]→35.6, [18,5,16]→36.0, [18,6,18]→36.1 (156 levels, 2.4 s)
- royal_court.overlap+sameRoad: [17,3]→27.0, [17,4]→28.7, [17,5]→29.0, [18,2]→29.0, [18,3]→33.2 (65 levels, 1.6 s)
- royal_court.overlap+shared(n2): [16,7]→23.4, [16,8]→23.9, [17,6]→24.5, [17,8]→27.1, [18,8]→29.4 (75 levels, 1.4 s)
- royal_court.overlap+distinct: [18,3]→30.2, [18,4]→30.6, [18,5]→31.4, [18,6]→33.9, [18,7]→40.6 (72 levels, 1.8 s)
- royal_court.corners: 4→4.3, 5→6.4, 6→9.0, 7→12.1, 8→15.4 (9 levels, 0.4 s)
- royal_court.corners+paths(x16): [8,9]→26.1, [8,10]→27.6, [8,11]→28.8, [8,12]→30.7, [8,13]→33.3 (34 levels, 1.1 s)
- royal_court.corners+paths(x20): [8,8]→26.7, [8,9]→28.0, [8,10]→29.3, [8,11]→32.3, [8,12]→33.0 (35 levels, 0.9 s)
- royal_court.corners+paths(x24): [8,8]→25.4, [8,9]→27.3, [8,10]→29.0, [8,11]→31.5, [8,12]→37.6 (34 levels, 0.8 s)
- royal_court.corners+roads(y3): [7,0]→11.8, [7,1]→13.6, [7,3]→15.5, [8,0]→15.7, [8,1]→20.3 (21 levels, 0.7 s)
- royal_court.corners+roads(y5): [4,0]→4.2, [5,0]→6.4, [6,0]→8.7, [7,0]→12.0, [8,0]→15.0 (9 levels, 0.6 s)
- royal_court.corners+pathPairs(x6): [8,5,9]→27.8, [8,5,10]→28.1, [8,6,6]→28.8, [8,6,7]→31.0, [8,6,8]→32.8 (55 levels, 1.1 s)
- royal_court.corners+pathPairs(x10): [8,4,6]→26.2, [8,4,7]→28.0, [8,4,8]→30.7, [8,5,5]→30.8, [8,5,6]→31.0 (50 levels, 0.9 s)
- royal_court.corners+sameRoad: [8,3]→16.6, [8,4]→20.2, [8,5]→22.2, [8,6]→29.9, [8,7]→37.5 (34 levels, 1.1 s)
- royal_court.corners+shared(n2): [4,0]→4.3, [5,0]→6.3, [6,0]→8.2, [7,0]→11.2, [8,0]→14.2 (9 levels, 0.5 s)
- royal_court.corners+distinct: [7,2]→11.9, [7,3]→12.8, [8,2]→15.5, [8,3]→15.8, [8,4]→17.1 (20 levels, 0.5 s)
- royal_court.graded: [8,-4]→23.0, [8,-3]→23.1, [8,-2]→23.4, [8,-1]→24.3, [9,0]→28.6 (162 levels, 1.1 s)
- royal_court.graded+paths(x16): [9,0,5]→34.4, [9,0,6]→36.0, [9,0,7]→36.4, [9,0,8]→38.3, [9,0,11]→42.5 (297 levels, 1.9 s)
- royal_court.graded+paths(x20): [9,0,6]→33.5, [9,0,7]→34.2, [9,0,8]→37.1, [9,0,9]→38.1, [9,0,10]→39.2 (278 levels, 2.0 s)
- royal_court.graded+paths(x24): [9,0,3]→31.2, [9,0,4]→32.2, [9,0,5]→33.7, [9,0,6]→35.0, [9,0,9]→35.8 (279 levels, 1.9 s)
- royal_court.graded+roads(y3): [8,-1,1]→27.7, [8,-1,2]→28.4, [9,0,0]→28.5, [9,0,1]→31.8, [9,0,2]→37.5 (223 levels, 2.1 s)
- royal_court.graded+roads(y5): [8,-1,1]→28.4, [8,-1,2]→29.4, [9,0,0]→29.9, [9,0,1]→35.0, [9,0,2]→36.0 (213 levels, 1.8 s)
- royal_court.graded+pathPairs(x6): [9,0,10,12]→39.1, [9,0,10,14]→39.2, [9,0,10,17]→40.7, [9,0,11,14]→40.8, [9,0,11,16]→41.4 (361 levels, 2.5 s)
- royal_court.graded+pathPairs(x10): [9,0,5,14]→35.2, [9,0,6,9]→35.3, [9,0,6,10]→35.5, [9,0,6,13]→35.8, [9,0,7,9]→35.9 (307 levels, 2.0 s)
- royal_court.graded+sameRoad: [8,-1,5]→28.2, [8,-1,7]→28.5, [9,0,1]→28.6, [9,0,2]→29.1, [9,0,3]→31.1 (250 levels, 1.8 s)
- royal_court.graded+shared(n2): [8,-2,6]→23.5, [8,-2,8]→24.0, [8,-1,6]→24.4, [8,-1,8]→27.3, [9,0,8]→28.8 (261 levels, 1.7 s)
- royal_court.graded+distinct: [8,-1,7]→29.1, [9,0,4]→29.2, [9,0,5]→29.8, [9,0,6]→32.8, [9,0,7]→38.8 (266 levels, 1.6 s)
- hall_of_mirrors.all: [13,22]→33.1, [13,23]→34.3, [14,24]→36.9, [15,25]→38.1, [18,28]→43.7 (95 levels, 1.2 s)
- hall_of_mirrors.all+halves(x6): [14,24,1]→38.0, [15,25,0]→38.0, [15,25,1]→42.0, [18,28,0]→44.5, [18,28,2]→49.5 (176 levels, 1.7 s)
- hall_of_mirrors.all+halves(x14): [15,25,0]→36.4, [15,25,1]→39.0, [15,25,2]→39.3, [15,25,4]→39.8, [18,28,4]→45.5 (170 levels, 1.5 s)
- hall_of_mirrors.all+halves4(x10): [15,25,4]→40.1, [15,25,5]→40.2, [18,28,2]→45.0, [18,28,4]→46.2, [18,28,6]→47.6 (174 levels, 1.5 s)
- hall_of_mirrors.all+halves4(x13): [15,25,2]→42.6, [15,25,4]→43.1, [18,28,0]→43.1, [18,28,2]→47.7, [18,28,4]→49.8 (155 levels, 1.5 s)
- hall_of_mirrors.all+pairOf(k2y7): [15,25,0]→37.1, [15,25,3]→39.4, [15,25,5]→41.0, [18,28,0]→43.6, [18,28,6]→45.8 (184 levels, 1.9 s)
- hall_of_mirrors.all+twice(n2y7): [14,24,2]→37.5, [15,25,0]→37.6, [15,25,2]→41.2, [15,25,3]→42.9, [18,28,0]→47.4 (204 levels, 1.6 s)
- hall_of_mirrors.rowsColumns: [5,12]→27.0, [5,13]→28.7, [6,12]→30.4, [6,14]→31.4, [8,16]→39.0 (36 levels, 0.8 s)
- hall_of_mirrors.rowsColumns+halves(x6): [6,14,4]→36.5, [6,14,5]→39.6, [8,16,0]→39.6, [8,16,2]→42.1, [8,16,4]→43.2 (92 levels, 1.1 s)
- hall_of_mirrors.rowsColumns+halves(x14): [6,14,4]→39.4, [6,14,5]→39.6, [8,16,0]→39.6, [8,16,2]→41.5, [8,16,4]→44.3 (90 levels, 1.0 s)
- hall_of_mirrors.rowsColumns+halves4(x10): [6,14,1]→32.4, [6,14,2]→32.5, [6,14,3]→34.4, [6,14,4]→39.7, [8,16,4]→44.5 (83 levels, 1.0 s)
- hall_of_mirrors.rowsColumns+halves4(x13): [6,14,2]→34.2, [6,14,3]→37.3, [8,16,0]→38.5, [8,16,2]→39.7, [8,16,4]→45.7 (78 levels, 1.0 s)
- hall_of_mirrors.rowsColumns+pairOf(k2y7): [6,14,4]→34.9, [6,14,5]→36.8, [6,14,6]→36.9, [8,16,4]→40.4, [8,16,8]→43.2 (103 levels, 1.0 s)
- hall_of_mirrors.rowsColumns+twice(n2y7): [6,14,3]→34.5, [6,14,4]→34.5, [6,14,6]→36.2, [6,14,8]→38.0, [8,16,8]→42.8 (90 levels, 1.1 s)
- opposite_nines_plus.plain: 4→8.4, 5→11.7, 6→16.1, 7→20.5, 8→28.1 (9 levels, 0.3 s)
- opposite_nines_plus.plain+lines(x18): [7,7]→27.8, [8,2]→27.9, [8,4]→29.9, [8,6]→33.7, [8,8]→38.8 (48 levels, 0.6 s)
- opposite_nines_plus.plain+lines(x15): [7,5]→26.8, [8,0]→26.8, [8,1]→27.3, [8,2]→30.9, [8,3]→35.8 (42 levels, 0.6 s)
- opposite_nines_plus.plain+lines(x24): [8,0]→26.9, [8,1]→29.0, [8,2]→31.0, [8,3]→36.7, [8,4]→37.1 (39 levels, 0.7 s)
- opposite_nines_plus.plain+windows(x18): [7,6]→26.8, [8,1]→27.1, [8,3]→28.2, [8,5]→30.7, [8,7]→36.1 (46 levels, 0.6 s)
- opposite_nines_plus.plain+windows(x12): [7,2]→25.2, [7,3]→26.1, [8,0]→26.4, [8,1]→28.4, [8,2]→34.0 (36 levels, 0.5 s)
- two_pair_plus.plain: 4→3.3, 5→6.1, 6→10.0, 7→16.1, 8→21.4 (9 levels, 0.5 s)
- two_pair_plus.plain+roads(y4): [7,3]→22.3, [8,0]→22.4, [8,1]→23.4, [8,2]→26.2, [8,3]→29.5 (25 levels, 1.0 s)
- two_pair_plus.plain+roads(y6): [5,1]→9.3, [6,0]→9.4, [7,0]→13.7, [7,1]→19.8, [8,0]→20.3 (15 levels, 0.7 s)
- two_pair_plus.plain+boxes(x10): [7,2]→18.9, [7,3]→20.9, [8,0]→21.2, [8,1]→23.1, [8,2]→25.4 (20 levels, 0.6 s)
- two_pair_plus.plain+boxes(x20): [7,2]→19.5, [7,3]→22.8, [8,0]→22.9, [8,1]→23.9, [8,2]→24.6 (21 levels, 0.7 s)
- ladders.plain: 20→28.9, 21→31.2, 22→33.8, 23→36.9, 24→39.1 (24 levels, 0.6 s)
- ladders.plain+ladders(y5): [24,14]→43.7, [24,20]→44.2, [24,24]→44.6, [24,34]→46.1, [24,48]→47.5 (252 levels, 2.4 s)
- ladders.plain+ladders(y7): [21,0]→31.0, [21,4]→33.9, [22,0]→33.9, [23,0]→36.8, [24,0]→39.0 (59 levels, 1.7 s)
- ladders.plain+lines(x18): [24,4]→43.5, [24,5]→44.1, [24,6]→45.4, [24,7]→46.6, [24,8]→48.2 (110 levels, 1.4 s)
- ladders.plain+lines(x10): [24,4]→42.0, [24,5]→43.3, [24,6]→44.5, [24,7]→46.2, [24,8]→47.2 (109 levels, 1.5 s)
- hilltops.plain: 4→1.1, 5→2.5, 6→4.6, 7→7.9, 8→12.0 (9 levels, 0.4 s)
- hilltops.plain+distinct: [8,4]→11.6, [8,5]→12.4, [8,6]→14.2, [8,7]→17.6, [8,8]→23.0 (32 levels, 0.7 s)
- hilltops.plain+paths(x15): [8,40]→45.6, [8,42]→46.6, [8,44]→46.7, [8,46]→47.9, [8,48]→52.0 (80 levels, 2.1 s)
- hilltops.plain+paths(x25): [8,40]→42.3, [8,42]→44.2, [8,44]→44.8, [8,46]→46.2, [8,48]→49.7 (86 levels, 1.9 s)
- hall_of_mirrors.all+twice(n2y7)@unlock8: [8,8,9,19]→34.6, [8,8,10,20]→35.8, [8,10,9,18]→35.9, [8,10,9,19]→38.4, [8,10,10,20]→43.7 (172 levels, 1.6 s)
- royal_court.overlap+paths(x20)@sum: 26→29.6, 27→31.4, 28→32.6, 29→32.9, 31→40.6 (31 levels, 1.4 s)
- royal_court.overlap+paths(x20)@unlock6: [6,16,11]→44.6, [6,16,12]→46.5, [6,17,10]→47.4, [6,17,11]→49.8, [6,17,12]→50.8 (132 levels, 2.3 s)

</details>

### 5.8 Composition variants

Each composition beside its base (`--compositions-only`). Gated rows: the early climb (`rate4`) and the prior mean equal the base's; ungated lexicographic rows in §5.7 rise by 0.3–0.7 bits a move.

| variant | card | top | +top | rate4 | g10 | g20 | trap | gap | K | **DIFF** | plat | unif | base agent | accidental | tier agent | tier share | prior mean | best board (ordinal) |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|
| royal_court.overlap | 2872 | 29.8 |  | 3.60 | 20.4 | 20.4 | 0.32 | 0.29 | 3.7 | **30.3** | 0.00 | – | – | – | – | – | 1.20 | 2202/7313/0404/2222 18 |
| royal_court.corners | 2872 | 15.4 |  | 3.19 | 14.9 | 14.9 | 0.03 | 0.03 | 3.0 | **3.4** | 0.00 | – | – | – | – | – | 1.02 | 3825/0521/2136/9621 8 |
| hall_of_mirrors.all | 2207 | 43.7 |  | 3.02 | 34.2 | 37.2 | 0.15 | 0.15 | 1.5 | **14.8** | 0.00 | 0123456789 | – | – | – | – | 1.45 | 8008/0000/0000/8008 [18,28] |
| hall_of_mirrors.rowsColumns | 1426 | 39.0 |  | 3.57 | 27.9 | 27.9 | 0.29 | 0.29 | 1.7 | **28.6** | 0.00 | 0123456789 | – | – | – | – | 1.11 | 8668/0550/0550/8668 [8,16] |
| opposite_nines_plus.plain | 1059 | 28.1 |  | 2.76 | 28.1 | 28.1 | 0.00 | 0.00 | 1.0 | **0.0** | 0.00 | – | – | – | – | – | 0.82 | 7069/1345/4568/0392 8 |
| ladders.plain | 1068 | 39.1 |  | 2.78 | 26.5 | 27.2 | 0.30 | 0.27 | 2.0 | **28.7** | 0.00 | – | – | – | – | – | 1.10 | 5656/6767/5676/4565 24 |
| opposite_nines_plus.plain+lines(x18)@gate6 | 2198 | 38.2 | 10.1 | 2.77 | 28.1 | 28.1 | 0.27 | 0.23 | 1.0 | **24.8** | 0.00 | – | 27.4 | 0.06 | 28.1 | 0.11 | 0.82 | 4608/3177/2286/1935 [8,8] |
| royal_court.corners+paths(x20)@gate3 | 4446 | 34.8 | 19.4 | 3.58 | 17.2 | 17.2 | 0.51 | 0.30 | 3.1 | **40.1** | 0.00 | – | 15.2 | 0.03 | 17.2 | 0.14 | 1.02 | 2506/7042/3134/4018 [8,9] |
| ladders.plain+ladders(y5)@gate16 | 2410 | 49.7 | 10.6 | 2.75 | 29.1 | 36.1 | 0.27 | 0.20 | 2.0 | **23.5** | 0.00 | – | 26.5 | 0.02 | 36.1 | 0.39 | 1.09 | 6543/7654/8765/9876 [24,48] |
| hall_of_mirrors.rowsColumns+pairOf(k2y7)@gate6 | 2099 | 39.5 | 0.5 | 3.48 | 29.0 | 29.0 | 0.27 | 0.27 | 1.7 | **26.5** | 0.00 | 0123456789 | 29.0 | 0.12 | 29.0 | 0.13 | 1.10 | 0330/4774/4774/0330 [8,16,4] |
| hall_of_mirrors.all+twice(n2y7)@unlock8 | 3202 | 43.7 | 0.0 | 3.21 | 21.6 | 21.9 | 0.50 | 0.18 | 2.2 | **34.1** | 0.00 | – | 19.2 | – | 21.9 | – | 1.46 | 5777/7377/7737/7775 [8,10,10,20] |
| royal_court.overlap+paths(x20)@sum | 4324 | 40.6 | 10.8 | 3.40 | 20.2 | 20.2 | 0.50 | 0.30 | 3.3 | **40.1** | 0.00 | – | 16.5 | – | 20.2 | – | 1.21 | 2137/1022/4315/0628 28 |
| royal_court.overlap+paths(x20)@unlock6 | 4388 | 50.8 | 21.1 | 3.19 | 20.5 | 20.9 | 0.59 | 0.25 | 3.7 | **42.0** | 0.00 | – | 9.4 | – | 20.9 | – | 1.19 | 7232/5016/8321/4836 [6,13,14] |

---

## 6. The tiered difficulty profile

`layered-profile.ts` reports these for each family, its base alone, and the base with each interaction:

| Measure | Meaning | What to aim for |
|---|---|---|
| base `DIFF`, `K`, `rate4` | is the base a beginner rule | `DIFF` ≤ 10, `K` ≤ 3.5, `rate4` in the pool's 1.6× band |
| tier `rate4` vs base `rate4` | does the interaction move the early climb | equal (gated); within 10% otherwise |
| prior mean vs the base's | does the interaction change the table's body | equal (gated) |
| `+top` | the reach the interaction adds | ≥ 6 bits; ≤ 20 bits (balance, §8) |
| `accidental` | the share of the tier's headroom a base-only greedy agent holds | low (≤ 0.15): the tier rewards intent |
| `tier share` | the share a tier-aware one-cell agent holds | 0.2–0.6: graded, not blind; above 0.9 means the tier is trivial |
| `gap` and `esc2` (in the JSON) | what a beam and a two-cell move add | tier two: a two-cell move escapes (esc2 ≈ 1); tier three: needs search |
| tier at best base (n) | the tier's range on the best-base boards the climbs found, and `U` if a uniform board reaches the tier's maximum there | min < max, no `U` (the liveness check) |
| three-player games | win share and payoff when the layered player plays the base only or the whole rule | the tier adds a few percent, not a different game |

**The intended difficulty per tier:**

| Tier | DIFF | K | Other |
|---|---|---|---|
| Base | ≈ 0 | ≤ 3.5 | — |
| Tier two | — | — | tier share 0.2–0.6; esc2 ≈ 1, so a "change a cell and its partner" agent climbs it |
| Tier three (expert only) | — | — | may need a beam: Hilltops paths, Royal Court paths on overlapping courts |

The composite `DIFF` of a tiered rule mixes the two. It is 15–40 for every tiered prototype, because greedy reaches the
base's top but little of the tier's. Read the base's `DIFF` and the tier share instead.

### 6.1 Liveness, measured

The tier's range on the best-base boards the climbs found (`--budget quick`). `U` means a uniform board reaches the
tier's maximum there; n is the number of best-base boards found.

How to read it:
- A range of 0–0 marks a tier **dead at the top**.
- `U` marks a tier that **keeps the degenerate maximum**.
- n = 1 or 2 means the climbs rarely reach the base's top (the overlapping Royal Court, Ladders), and the column says
  little. The exact check of §12 step 2 replaces it there.

The flags agree with the brainstorms' exact counts:
- "twice" on 18 lines: 0–0, U.
- Every even-x halves tier: U.
- rows and columns + "twice": U (all 7s scores 16).
- "holding two 7s" on 18 lines: 0–16 with no U, alive. The quick run's climbs found 16, while the default run's annealing
  found only 6: whether a search sees a rigid tier's top is luck.
- Two Pair roads of 6 and Ladders of 7: dead.

| variant | tier at best base (n) |
|---|---|
| royal_court.overlap+paths(x16) | 6–6 (1) |
| royal_court.overlap+paths(x20) | 0–10 (4) |
| royal_court.overlap+paths(x24) | 0–0 (1) |
| royal_court.overlap+roads(y3) | 0–0 (2) |
| royal_court.overlap+roads(y5) | 0–1 (3) |
| royal_court.overlap+pathPairs(x6) | 9–11 (2) |
| royal_court.overlap+pathPairs(x10) | 10–10 (1) |
| royal_court.overlap+sameRoad | 1–1 (2) |
| royal_court.overlap+shared(n2) | 8–8 (1) |
| royal_court.overlap+distinct | 3–6 (4) |
| royal_court.corners+paths(x16) | 0–4 (12) |
| royal_court.corners+paths(x20) | 0–4 (12) |
| royal_court.corners+paths(x24) | 0–6 (12) |
| royal_court.corners+roads(y3) | 0–1 (12) |
| royal_court.corners+roads(y5) | 0–0 (12) |
| royal_court.corners+pathPairs(x6) | 7–7 (1) |
| royal_court.corners+pathPairs(x10) | 6–6 (1) |
| royal_court.corners+sameRoad | 1–3 (12) |
| royal_court.corners+shared(n2) | 0–0 (12) |
| royal_court.corners+distinct | 2–4 (12) |
| royal_court.graded+paths(x16) | 2–6 (3) |
| royal_court.graded+paths(x20) | 1–7 (2) |
| royal_court.graded+paths(x24) | 0–3 (2) |
| royal_court.graded+roads(y3) | 0–1 (2) |
| royal_court.graded+roads(y5) | 0–0 (2) |
| royal_court.graded+pathPairs(x6) | 9–9 (1) |
| royal_court.graded+pathPairs(x10) | 0–0 (1) |
| royal_court.graded+sameRoad | 2–2 (2) |
| royal_court.graded+shared(n2) | 8–8 (2) |
| royal_court.graded+distinct | 4–4 (1) |
| hall_of_mirrors.all+halves(x6) | 0–14 (19) |
| hall_of_mirrors.all+halves(x14) | 0–10 U (18) |
| hall_of_mirrors.all+halves4(x10) | 0–10 U (18) |
| hall_of_mirrors.all+halves4(x13) | 0–8 (18) |
| hall_of_mirrors.all+pairOf(k2y7) | 0–16 (20) |
| hall_of_mirrors.all+twice(n2y7) | 0–0 U (18) |
| hall_of_mirrors.rowsColumns+halves(x6) | 0–8 U (12) |
| hall_of_mirrors.rowsColumns+halves(x14) | 0–8 U (12) |
| hall_of_mirrors.rowsColumns+halves4(x10) | 0–8 U (12) |
| hall_of_mirrors.rowsColumns+halves4(x13) | 0–2 (12) |
| hall_of_mirrors.rowsColumns+pairOf(k2y7) | 0–4 (12) |
| hall_of_mirrors.rowsColumns+twice(n2y7) | 0–16 U (12) |
| opposite_nines_plus.plain+lines(x18) | 2–8 (12) |
| opposite_nines_plus.plain+lines(x15) | 0–3 (12) |
| opposite_nines_plus.plain+lines(x24) | 0–2 (12) |
| opposite_nines_plus.plain+windows(x18) | 1–5 (12) |
| opposite_nines_plus.plain+windows(x12) | 0–3 (12) |
| two_pair_plus.plain+roads(y4) | 0–2 (12) |
| two_pair_plus.plain+roads(y6) | 0–1 (12) |
| two_pair_plus.plain+boxes(x10) | 0–2 (12) |
| two_pair_plus.plain+boxes(x20) | 0–4 (12) |
| ladders.plain+ladders(y5) | 0–48 (5) |
| ladders.plain+ladders(y7) | 0–0 (2) |
| ladders.plain+lines(x18) | 2–8 (2) |
| ladders.plain+lines(x10) | 0–0 (2) |
| hilltops.plain+distinct | 4–7 (6) |
| hilltops.plain+paths(x15) | 2–22 (6) |
| hilltops.plain+paths(x25) | 3–22 (6) |
| opposite_nines_plus.plain+lines(x18)@gate6 | 2–6 (12) |
| royal_court.corners+paths(x20)@gate3 | 0–4 (12) |
| ladders.plain+ladders(y5)@gate16 | 0–48 (4) |
| hall_of_mirrors.rowsColumns+pairOf(k2y7)@gate6 | 0–0 U (12) |

---

## 7. Calibration

### 7.1 Today (brainstorm C, measured)

**The shipped catalogue:**
- 52 instance files, **5,592 tables**, 140 families, about 837k levels, **20 MB**.
- A 4×4 file holds 108–117 tables.
- Most families reduce to one table per shape by symmetry.
- Wide params are already narrowed by hand to pass P10. magic_accountant deals only targets near the middle and folds x
  with its complement: 4 tables.

**One 4×4 calibration:**

| Budget | Seconds |
|---|---|
| small (2^13 samples, 200 particles) | 0.3–2.6 |
| shipped | 1.6–4.5 |

A tuple table is 21–46 levels, 0.4–1 KB.

**First use of a missing table:**
- about 3 s of CPU;
- in the cloud, 35 s of wall time for a 6-god deal on Grid 4 (`FIRST_USE_SECONDS`), 95 s on Grid 7;
- cached in `calibrationComputed`, pruned after 90 days unused.

**Accuracy:**
- When the estimator's moves can climb the rule: within ±0.4 bits to 21 bits, ±1 bit at 30–40 bits, ±1.7 bits at 53 bits.
- **On a lexicographic tier above a rigid base, against exact laws: 12–15 bits low at 53 bits.**
- Two seeds of kings + lines (x = 4) gave tops of 41 and 73 bits.
- The tail toolkit (`docs/analytic-calibration/tail-toolkit.md` §8.2) already names this failure.
- The measurements here show the same, less dramatically. The ungated "twice" tier is dead at the top, yet its sampled
  top came out 3.7 bits above its own base's (47.4 against 43.7).

### 7.2 The options, with numbers

| Option | Tables per shape for one family (menu: line-sum x in 0..36, digit y, length y in 2..16) | Accuracy at the top | Verdict |
|---|---|---|---|
| (a) One joint table per variant | 63 for one tier; 1,075 for two stacked. Eight such families over 48 shapes: about 24k tables (4.3× today), about 85 MB, about 50 CPU-hours | biased: −15 to +14 bits at 35–55 bits; seed spread up to 32 bits | no |
| (b) Base once, then the tier conditional on the base: G(b, i) = G_B(b+1) + P(B = b) · G_{I \| B = b}(i) | the same count, built on demand | **within 1.6 bits at 53 bits** (3 seeds: 52.6 / 51.6 / 54.3 against 53.15 exact) when the tier is sampled from exact draws of boards given B = b; about 2 s per base level | **yes** |
| (c1) Factorised across tiers (assume the base and the tier independent) | none | off by up to 26.6 bits (base and tier are correlated) | no |
| (c2) Factorised across units (convolve each unit's joint law of base and tier) | none: about 1 ms, any x | exact | yes, where units are disjoint and the tier lives in one unit |
| (d) On-demand with caching | — | inherits whatever it builds | the delivery mechanism, for (b) |
| (e) Symmetry classes (`canonical`) | 63 → 35 (−45%) at best | exact | yes, always |
| (f) Sampling the tail with a better kernel (pair moves) | — | fixes the base levels but overshoots the deep tail (64–67 against 53) | no |

### 7.3 Recommendation: exact base, gated tier, conditional calibration

1. **Which bases may carry a tier:** only bases with an exact law and an exact conditional sampler.
   - In practice that means disjoint units: pairs, corner boxes, independent rows, fold partners.
   - Opposite Nines, Two Pair, Strangers, Leapfrog and Crosswise Threes qualify generically.
   - Mirrormancer and Magic Eighteen have analytics already.
   - Spread of Three (overlapping windows) does not, and neither does the overlapping Royal Court. Their tiers stay
     unshippable until someone writes a row-chain conditional sampler.
   - Royal Court on corner boxes qualifies.
2. **How a table is built:**
   - Levels below the gate are copied from the base's exact law: zero error.
   - Each level at or above the gate is conditional: exact by convolution when the tier lives in one unit, otherwise
     the splitting estimator started from exact draws of boards given B = b.
3. **Error:**
   - zero below the gate;
   - for a global tier, the estimator's own error on the tier's share alone: ±0.4 bits up to 20 bits, ±1 bit at 30–40.
   
   That is above the analytic limit (`ANALYTIC_MAX_ERROR_BITS` = 0.25), so it needs its own label, for example
   `hybrid:<base analytic id>`, and its own estimator version.
4. **Cost:**
   - about 2 s for each base level from the gate to the top: 6–12 s of CPU per 4×4 table;
   - built on demand and split into one piece per base level, so a first game keeps today's 35 s wall time.
5. **What ships:** the base tables, plus the tier tables for the beginner default shape only (4×4 digits, no colour).
   Everything else is built on first use.

### 7.4 Parameter classes

- A tier on an equality base (mirror, Two Pair) is invariant under relabelling digits: "digit y" collapses from 10
  tables to 1.
- A complement-symmetric base (Mirrormancer, Opposite Nines, Magic Eighteen, Spread of Three) folds x with 9·L − x and
  y with 9 − y.
- Royal Court (max = sum of the rest) is not complement-symmetric.
- Lengths never collapse.
- Best case: −45% tables.
- `family.canonical` already supports all of this.

### 7.5 Guard tests and pinned games

**Equal opportunity** (`equal-opportunity.test.ts`):
- Group tiered variants by their tier signature (which interaction, and the gate), and compare peers within a group.
- Add a ladder check:
  - every tiered table below its gate is bit-identical to its base table;
  - its top is at least the base's top plus 6 bits.
- For wide params, deal only the values whose tier top is within 15% of the median, computed per shape from the hybrid
  law as a filter on `canonicalSupport`, rather than hand-listed.

**Cross-family** (`cross-family-opportunity.test.ts`):
- Gated tiers leave prior means unchanged, so the test passes as it is, provided no tier pushes a family above the
  shape's current maximum (conqueror at about 85 bits on Grid(4,base10,rgb)).
- Compute limits for tiered variants per tier depth.

**Keys and running games** (`engine/pinned.ts`): a deploy must not re-key a running game's tables.
- **Tiers are new params.** `tiers?: [{ id, ...params, gate }]` is an optional field, absent for today's params,
  so `canonicalJson` and the param key stay byte-identical.
- **The card program** for tierless params is emitted byte for byte as today; tier code is appended only when tiers
  are present.
- **One API change: `FamilyDef.shape` becomes `shape(params, spec)`.** The tuple shape is hashed into the key; tierless
  params return the old shape.
- **`analyticFor`** keeps the old id for tierless params.
- **Acceptance:** `calibration.test.ts` already fails on any stale shipped key. The PR that adds tiers must regenerate
  zero base tables.
- **Stored params need no migration:** a missing `tiers` means the base. In CLAUDE.md's terms this is a widen step with
  nothing to narrow later.
- **A guard brainstorm C recommends for `pinned.ts`:**
  - Today a started game pins tables "by god, never by key", but scores with the current evaluator.
  - So a deploy that changed an old variant's program would silently score new ordinals against old tables.
  - Compare the pinned `table.key` with the current key on each tick and report evaluator drift, or pin the card
    program too.
  - Tiers as new params cannot cause this; a careless refactor could.

**Declared needs and the checker.** Today's `needs(params, ctx)` covers simple reachability:
- x within [N·vmin, N·vmax];
- y below the number of symbols;
- a length no longer than the longest path.

Interactions add a joint question: *is the tier alive when the base is at its top?* Examples:
- mirror rows with "rows add up to x" for odd x: a mirrored row is always even;
- kings with "lines add up to 26": the joint top is [9, 0];
- Two Pair with roads of 6.

The checker needs a `tierTop(params, ctx)`, from a closed form or read off the hybrid law. Deal a tier only if:
- tierTop > 0;
- no uniform board reaches it;
- its top bits fall in the equal-opportunity band.

The exhaustive reachability test in `rules.test.ts` extends to "the exemplar reaches [baseTop, tierTop]".

---

## 8. Synergy and balance

### 8.1 Synergy with the beginner eight

The synergy table pairs, with each of the beginner eight:
- each family's first base;
- each interaction at its first param.

**Method.** The beginner eight are stand-ins written in the prototypes file (`BEGINNER`). The session on
`claude/beginner-rules` implements the real ones, and the measurements should be re-run against them when they land.
Mirrormancer is the shipped family. `SYN` = 100 × (1 − considerate joint value); the ceiling is in brackets.

**What interactions do to synergy:**
- **Tiers make families somewhat harder to combine.** Mean `SYN` against the eight, base → with a tier:

| Family | Base | With a tier |
|---|---|---|
| Opposite Nines | 35.6 | 39–42 |
| Two Pair | 33.9 | 38–40 |
| Hall of Mirrors | 39.7 | 40–43 |
| Royal Court (overlapping) | 52.4 | 53–62 |
| Ladders | 43.4 | 47–50 |
| Hilltops | 32.8 | 53–69 |

- **Why.** Most of the rise is the top moving away. `SYN` is a share of each rule's top, and a considerate pair of
  one-cell agents reaches little of a tier. So the rise is "more to plan for", not "more conflict": the ceiling stays at
  0.9–1.0 for most pairs with a disjoint-unit base.
- **Tiers that only add constraints lower the ceiling.**
  - Royal Court + distinct kings × Two Pair: 0.52 → 0.41.
  - Hilltops + paths × Mirrormancer: 0.47 → 0.29.
- **Tiers that agree with a partner's rule create an opening.**
  - **Opposite Nines + lines (x = 18) × Crosswise Threes:** `SYN` 43 → 31. Magic Eighteen's ceiling stays at 1.00.
    At x = 18 the tier *is* a magic square on a half-turn-complement board, which both rules want.
  - **Hall of Mirrors + "holding two 7s" × Strangers:** `SYN` 11 → 22, the other way. The two 7s ask for equal
    neighbours, which Strangers forbids.
- **Design rule:** offer at least one interaction per family that a common partner's base already pays for. The
  candidates measured here:
  - "lines add up to 18": agrees with Magic Eighteen;
  - "windows add up to 18": agrees with Opposite Nines' centre;
  - a mirror tier on a symmetric base: agrees with Opposite Nines and Crosswise Threes.
  
  These are the cooperation openings: a tier point for one player that the other already wants.

**Same family, different params.** Two players dealt the same interaction with different targets combine *easily*:
`SYN` 3–37, ceilings 0.85–1.00, conflict ≤ 0.17. The base is shared, so only the tier competes, and it competes
only at the top. The exception is Hilltops paths (x = 15 and x = 25), at `SYN` 72 with a ceiling of 0.57: a deep,
rigid tier with two targets on the same few peaks.

Synergy SYN (ceiling) with the beginner eight: mirrormancer, magic_eighteen, opposite_nines, two_pair, spread_of_three, strangers, leapfrog, crosswise_threes

| variant | mirrormanc | magic_eigh | opposite_n | two_pair | spread_of_ | strangers | leapfrog | crosswise_ | mean SYN |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| royal_court.overlap | 55 (0.64) | 52 (0.53) | 66 (1.00) | 67 (0.52) | 66 (1.00) | 37 (1.00) | 32 (1.00) | 44 (0.84) | 52.4 |
| royal_court.overlap+paths(x16) | 68 (0.60) | 64 (0.60) | 61 (0.65) | 72 (0.50) | 72 (0.87) | 47 (1.00) | 48 (0.89) | 47 (0.78) | 59.8 |
| royal_court.overlap+roads(y3) | 62 (0.58) | 60 (0.61) | 66 (0.69) | 66 (0.49) | 69 (0.90) | 34 (1.00) | 34 (0.90) | 39 (0.79) | 53.8 |
| royal_court.overlap+pathPairs(x6) | 66 (0.55) | 66 (0.55) | 68 (0.72) | 77 (0.48) | 70 (0.83) | 44 (0.94) | 51 (0.87) | 59 (0.77) | 62.4 |
| royal_court.overlap+sameRoad | 62 (0.76) | 51 (0.57) | 62 (0.81) | 65 (0.54) | 71 (1.00) | 42 (1.00) | 46 (1.00) | 53 (0.81) | 56.5 |
| royal_court.overlap+shared(n2) | 62 (0.70) | 52 (0.69) | 61 (0.86) | 66 (0.54) | 62 (1.00) | 45 (1.00) | 30 (1.00) | 46 (0.82) | 53.0 |
| royal_court.overlap+distinct | 68 (0.66) | 65 (0.59) | 62 (0.66) | 77 (0.41) | 71 (0.86) | 44 (0.87) | 35 (0.88) | 54 (0.77) | 59.5 |
| hall_of_mirrors.all | 31 (1.00) | 54 (0.81) | 62 (0.65) | 42 (1.00) | 27 (0.93) | 11 (1.00) | 37 (1.00) | 54 (0.62) | 39.7 |
| hall_of_mirrors.all+halves(x6) | 32 (1.00) | 53 (0.66) | 58 (0.63) | 47 (1.00) | 28 (0.92) | 9 (1.00) | 39 (1.00) | 56 (0.60) | 40.2 |
| hall_of_mirrors.all+halves4(x10) | 32 (0.99) | 55 (0.72) | 63 (0.64) | 44 (1.00) | 29 (0.90) | 13 (1.00) | 39 (0.97) | 54 (0.61) | 41.2 |
| hall_of_mirrors.all+pairOf(k2y7) | 40 (1.00) | 55 (0.79) | 57 (0.65) | 45 (1.00) | 32 (0.90) | 22 (1.00) | 34 (0.98) | 57 (0.63) | 42.8 |
| hall_of_mirrors.all+twice(n2y7) | 32 (1.00) | 55 (0.73) | 67 (0.63) | 41 (1.00) | 30 (0.89) | 12 (1.00) | 42 (1.00) | 55 (0.61) | 41.8 |
| opposite_nines_plus.plain | 34 (1.00) | 27 (1.00) | 0 (1.00) | 38 (1.00) | 43 (1.00) | 60 (0.67) | 39 (1.00) | 43 (1.00) | 35.6 |
| opposite_nines_plus.plain+lines(x18) | 49 (1.00) | 43 (1.00) | 9 (1.00) | 47 (0.93) | 53 (0.93) | 62 (0.67) | 45 (1.00) | 31 (0.75) | 42.3 |
| opposite_nines_plus.plain+windows(x18) | 41 (0.88) | 45 (1.00) | 12 (0.92) | 40 (1.00) | 43 (1.00) | 55 (0.67) | 40 (1.00) | 39 (1.00) | 39.4 |
| two_pair_plus.plain | 19 (1.00) | 54 (0.90) | 45 (1.00) | 0 (1.00) | 40 (1.00) | 55 (0.67) | 31 (1.00) | 27 (1.00) | 33.9 |
| two_pair_plus.plain+roads(y4) | 13 (1.00) | 56 (0.65) | 43 (0.94) | 11 (0.89) | 49 (1.00) | 64 (0.63) | 38 (0.89) | 47 (1.00) | 40.2 |
| two_pair_plus.plain+boxes(x10) | 24 (0.91) | 56 (0.73) | 48 (1.00) | 7 (0.95) | 40 (1.00) | 59 (0.67) | 37 (1.00) | 31 (1.00) | 37.6 |
| ladders.plain | 47 (0.78) | 53 (0.93) | 26 (0.86) | 29 (0.86) | 52 (0.82) | 76 (0.29) | 31 (0.86) | 32 (0.78) | 43.4 |
| ladders.plain+ladders(y5) | 56 (0.77) | 58 (0.76) | 31 (0.79) | 43 (0.81) | 52 (0.76) | 77 (0.29) | 41 (0.79) | 45 (0.72) | 50.5 |
| ladders.plain+lines(x18) | 51 (0.76) | 51 (0.90) | 30 (0.80) | 28 (0.80) | 58 (0.70) | 81 (0.30) | 40 (0.80) | 39 (0.73) | 47.4 |
| hilltops.plain | 57 (0.47) | 49 (1.00) | 55 (0.62) | 20 (1.00) | 22 (1.00) | 26 (1.00) | 13 (1.00) | 21 (1.00) | 32.8 |
| hilltops.plain+distinct | 70 (0.37) | 56 (0.76) | 68 (0.58) | 56 (0.71) | 54 (0.74) | 35 (0.79) | 42 (1.00) | 43 (0.79) | 53.1 |
| hilltops.plain+paths(x15) | 77 (0.29) | 73 (0.50) | 80 (0.38) | 68 (0.72) | 64 (0.80) | 46 (0.79) | 71 (0.76) | 69 (0.57) | 68.6 |

Same family, different params (two players dealt the same interaction with different targets):

- royal_court.overlap+paths(x16) × royal_court.overlap+paths(x20): SYN 31, ceiling 0.85, conflict 0.02
- royal_court.overlap+roads(y3) × royal_court.overlap+roads(y5): SYN 25, ceiling 0.98, conflict 0.00
- royal_court.overlap+pathPairs(x6) × royal_court.overlap+pathPairs(x10): SYN 37, ceiling 0.86, conflict 0.02
- hall_of_mirrors.all+halves(x6) × hall_of_mirrors.all+halves(x14): SYN 3, ceiling 1.00, conflict 0.00
- hall_of_mirrors.all+halves4(x10) × hall_of_mirrors.all+halves4(x13): SYN 7, ceiling 0.93, conflict 0.00
- opposite_nines_plus.plain+lines(x18) × opposite_nines_plus.plain+lines(x15): SYN 21, ceiling 0.87, conflict 0.17
- opposite_nines_plus.plain+windows(x18) × opposite_nines_plus.plain+windows(x12): SYN 22, ceiling 0.88, conflict 0.05
- two_pair_plus.plain+roads(y4) × two_pair_plus.plain+roads(y6): SYN 11, ceiling 0.94, conflict 0.02
- two_pair_plus.plain+boxes(x10) × two_pair_plus.plain+boxes(x20): SYN 9, ceiling 0.92, conflict 0.00
- ladders.plain+ladders(y5) × ladders.plain+ladders(y7): SYN 10, ceiling 1.00, conflict 0.00
- ladders.plain+lines(x18) × ladders.plain+lines(x10): SYN 29, ceiling 0.92, conflict 0.03
- hilltops.plain+paths(x15) × hilltops.plain+paths(x25): SYN 72, ceiling 0.57, conflict 0.22

### 8.2 Three-player games

Seat 0 is dealt the layered rule; seats 1 and 2 are two of the beginner eight. The model is family-balance's: 10
objects, 40 rounds, 16 one-cell candidate moves a turn. Seat 0 plays each game twice on the same seeds:
- believing its bits are the base's (a 5-line base agent);
- with the whole rule.

**What happens:**
- **Payoff:** playing the tier changes payoff by −5% to +7% (ratio 0.95–1.07).
- **Win share:** it moves within the noise of 40 games, with the larger gains on the deep tiers (Royal Court paths
  x = 20: 0.07 → 0.25; Hilltops paths: 0.05 → 0.07–0.10).
- **Why so little.** Objects end a 40-turn game at 5–10 bits per rule, far below the base tops of 15–44. So in today's
  game length *the base decides the game*, which is what the paradigm wants:
  - a base-only player is not punished;
  - the tier pays where play is long or concentrated (the owner's "upper reaches"), not in the early climb.
- **Gating would make the two plays identical** until an object's base reaches the gate.

Three-player games (seat 0 dealt the variant, two beginner-eight opponents; same seeds): win share and own mean bits per object when seat 0 plays the base only vs the whole rule; payoff ratio whole/base.

| variant | games | win (base play) | win (tier play) | bits (base play) | bits (tier play) | payoff ratio |
|---|--:|--:|--:|--:|--:|--:|
| royal_court.overlap+paths(x16) | 40 | 0.38 | 0.35 | 6.7 | 6.7 | 0.97 |
| royal_court.overlap+paths(x20) | 40 | 0.07 | 0.25 | 6.0 | 6.3 | 0.99 |
| royal_court.overlap+paths(x24) | 40 | 0.07 | 0.03 | 5.4 | 5.8 | 1.04 |
| royal_court.overlap+roads(y3) | 40 | 0.20 | 0.28 | 5.9 | 6.0 | 0.97 |
| royal_court.overlap+roads(y5) | 40 | 0.28 | 0.25 | 6.7 | 6.4 | 0.96 |
| royal_court.overlap+pathPairs(x6) | 40 | 0.25 | 0.28 | 6.3 | 6.5 | 1.01 |
| royal_court.overlap+pathPairs(x10) | 40 | 0.23 | 0.25 | 6.4 | 6.6 | 1.01 |
| royal_court.overlap+sameRoad | 40 | 0.30 | 0.38 | 6.5 | 6.9 | 1.01 |
| royal_court.overlap+shared(n2) | 40 | 0.28 | 0.30 | 6.4 | 6.7 | 1.01 |
| royal_court.overlap+distinct | 40 | 0.20 | 0.30 | 5.9 | 6.2 | 1.03 |
| royal_court.corners+paths(x16) | 40 | 0.15 | 0.23 | 6.4 | 6.7 | 1.02 |
| royal_court.corners+paths(x20) | 40 | 0.25 | 0.35 | 6.4 | 6.6 | 1.03 |
| royal_court.corners+paths(x24) | 40 | 0.13 | 0.10 | 6.1 | 6.4 | 1.04 |
| royal_court.corners+roads(y3) | 40 | 0.28 | 0.33 | 6.6 | 6.9 | 1.03 |
| royal_court.corners+roads(y5) | 40 | 0.13 | 0.15 | 5.9 | 5.9 | 1.01 |
| royal_court.corners+pathPairs(x6) | 40 | 0.25 | 0.30 | 6.9 | 7.0 | 0.98 |
| royal_court.corners+pathPairs(x10) | 40 | 0.30 | 0.35 | 6.9 | 7.6 | 1.06 |
| royal_court.corners+sameRoad | 40 | 0.33 | 0.28 | 6.6 | 6.3 | 1.02 |
| royal_court.corners+shared(n2) | 40 | 0.20 | 0.15 | 5.8 | 5.6 | 1.04 |
| royal_court.corners+distinct | 40 | 0.28 | 0.15 | 6.3 | 6.4 | 0.99 |
| royal_court.graded+paths(x16) | 40 | 0.33 | 0.45 | 6.9 | 7.3 | 1.05 |
| royal_court.graded+paths(x20) | 40 | 0.28 | 0.25 | 7.0 | 6.9 | 1.02 |
| royal_court.graded+paths(x24) | 40 | 0.35 | 0.35 | 6.6 | 6.6 | 1.00 |
| royal_court.graded+roads(y3) | 40 | 0.35 | 0.35 | 7.4 | 7.4 | 1.04 |
| royal_court.graded+roads(y5) | 40 | 0.35 | 0.28 | 7.4 | 7.2 | 0.96 |
| royal_court.graded+pathPairs(x6) | 40 | 0.30 | 0.42 | 6.8 | 7.2 | 1.03 |
| royal_court.graded+pathPairs(x10) | 40 | 0.23 | 0.23 | 7.0 | 7.0 | 1.01 |
| royal_court.graded+sameRoad | 40 | 0.28 | 0.30 | 6.8 | 7.0 | 1.01 |
| royal_court.graded+shared(n2) | 40 | 0.23 | 0.25 | 6.6 | 6.8 | 1.04 |
| royal_court.graded+distinct | 40 | 0.17 | 0.20 | 6.2 | 6.5 | 1.01 |
| hall_of_mirrors.all+halves(x6) | 40 | 0.25 | 0.35 | 8.4 | 8.6 | 1.02 |
| hall_of_mirrors.all+halves(x14) | 40 | 0.28 | 0.40 | 8.5 | 8.5 | 0.98 |
| hall_of_mirrors.all+halves4(x10) | 40 | 0.33 | 0.23 | 8.4 | 8.3 | 0.97 |
| hall_of_mirrors.all+halves4(x13) | 40 | 0.25 | 0.23 | 8.4 | 8.3 | 0.97 |
| hall_of_mirrors.all+pairOf(k2y7) | 40 | 0.33 | 0.38 | 8.6 | 8.7 | 0.99 |
| hall_of_mirrors.all+twice(n2y7) | 40 | 0.25 | 0.28 | 8.1 | 8.1 | 1.02 |
| hall_of_mirrors.rowsColumns+halves(x6) | 40 | 0.45 | 0.42 | 10.1 | 9.9 | 0.96 |
| hall_of_mirrors.rowsColumns+halves(x14) | 40 | 0.30 | 0.28 | 8.6 | 8.6 | 1.02 |
| hall_of_mirrors.rowsColumns+halves4(x10) | 40 | 0.42 | 0.35 | 8.6 | 8.7 | 1.01 |
| hall_of_mirrors.rowsColumns+halves4(x13) | 40 | 0.40 | 0.42 | 8.5 | 8.7 | 1.00 |
| hall_of_mirrors.rowsColumns+pairOf(k2y7) | 40 | 0.33 | 0.42 | 9.0 | 9.2 | 0.99 |
| hall_of_mirrors.rowsColumns+twice(n2y7) | 40 | 0.42 | 0.40 | 9.4 | 9.4 | 0.97 |
| opposite_nines_plus.plain+lines(x18) | 40 | 0.70 | 0.65 | 10.4 | 10.5 | 1.03 |
| opposite_nines_plus.plain+lines(x15) | 40 | 0.57 | 0.60 | 10.0 | 9.9 | 0.95 |
| opposite_nines_plus.plain+lines(x24) | 40 | 0.35 | 0.35 | 9.1 | 9.0 | 1.01 |
| opposite_nines_plus.plain+windows(x18) | 40 | 0.72 | 0.60 | 10.5 | 10.5 | 1.02 |
| opposite_nines_plus.plain+windows(x12) | 40 | 0.42 | 0.55 | 9.9 | 10.2 | 1.03 |
| two_pair_plus.plain+roads(y4) | 40 | 0.28 | 0.33 | 8.6 | 8.3 | 0.97 |
| two_pair_plus.plain+roads(y6) | 40 | 0.33 | 0.25 | 8.9 | 8.9 | 1.00 |
| two_pair_plus.plain+boxes(x10) | 40 | 0.42 | 0.42 | 9.1 | 9.4 | 1.03 |
| two_pair_plus.plain+boxes(x20) | 40 | 0.55 | 0.55 | 9.7 | 9.9 | 1.01 |
| ladders.plain+ladders(y5) | 40 | 0.30 | 0.23 | 6.6 | 6.6 | 1.02 |
| ladders.plain+ladders(y7) | 40 | 0.20 | 0.07 | 6.3 | 6.2 | 0.99 |
| ladders.plain+lines(x18) | 40 | 0.33 | 0.25 | 7.5 | 7.9 | 1.04 |
| ladders.plain+lines(x10) | 40 | 0.13 | 0.25 | 6.9 | 6.9 | 0.98 |
| hilltops.plain+distinct | 40 | 0.03 | 0.00 | 5.0 | 5.0 | 1.02 |
| hilltops.plain+paths(x15) | 40 | 0.05 | 0.07 | 5.3 | 5.6 | 1.07 |
| hilltops.plain+paths(x25) | 40 | 0.05 | 0.10 | 5.3 | 5.7 | 1.06 |


### 8.3 Balance

**Base climb.** `rate4` of the bases alone:

| Base | rate4 |
|---|---|
| Opposite Nines | 2.76 |
| Two Pair | 2.46 |
| Royal Court (corners) | 3.19 |
| Hall of Mirrors (all lines) | 3.02 |
| Ladders | 2.78 |
| Hilltops | 1.87 |

All but Hilltops sit within 1.30×. Gated tiers leave these numbers unchanged, so the pool's climb balance is set by
the bases alone, as today.

**Reach per tier.** Base tops run 15–44 bits; with one interaction, 24–52 bits.
- Uncapped, a family with a 50-bit reach sits beside one with 20.
- Payoff multiplies a player's own bits by the sum of the others'. A rule whose top board gives the others 0 bits
  invites kingmaking (red team finding 8).

**Proposal:**
- **Comparable base climb:** `rate4` within the pool's 1.6× band (existing).
- **Comparable reach per tier:** the added top of an interaction within 15% of the median of its group (the
  equal-opportunity test, grouped by tier signature, §7.5).
- **A cap:** an interaction adds 6–20 bits over its base. Below 6 it is not worth a card line (Two Pair boxes, +3–4);
  above 20 the family dwarfs the pool (Hilltops paths, +38–40).
- **Pool top max/min ≤ 2.5**, per tier depth.
- **Deliberately unequal reach is allowed only at expert difficulty, and stated on the card** ("an expert rule:
  higher reach, needs a plan").

**What the guard tests should assert:**
- **Equal opportunity:**
  - tables below the gate identical to the base's;
  - the added top within the group's band;
  - the added top between 6 and 20 bits.
- **Cross-family:** prior means unchanged by gated tiers; no tier above the shape's current maximum.
- **Pool:** at most one uniform *or two-digit* maximum per pool, at every tier depth (the red team's extension of
  `uniformTop`).


---

## 9. Generalisation

**Other sizes.** The operators are size-free. Their parameters are not: a path has 1 to 2n − 1 cells, and a line sum
ranges over [n·vmin, n·vmax]. Store tier params as fractions of a shape quantity, or validate them per shape with
`tierTop`. The red team measured both families across sizes:

| Shape | Mirror base top / DIFF | Kings base top / DIFF |
|---|---|---|
| 3×3 | 21.6 / 0 | 13.6 / 6.2 |
| 4×4 | 44.4 / 45.6 | 28.7 / 24.6 |
| 5×5 | 60.2 / 27.1 | 42.3 / 23.5 |
| 6×6 | 70.4 / 25.3 | 68.0 / 20.9 |

- On 3×3 the mirror tiers add nothing: every diagonal is already short.
- On 6×6 the calibration saturates.
- The base's size constrains which tiers are alive. The liveness check runs per shape.

**Other symbol sets.**
- **Cards** (values 1–13): no zero, so the kings' all-zero problem cannot arise. But sums range wider (x up to
  13·L), and "one apart" needs ranks.
- **Base 12 and 16:** the same operators, with wider x.
- Every x is rendered with the shape's own phrasebook.

**Colour layers.** A colour layer is a second vocabulary: units of one colour, or regions. Colour interactions are a
natural second tier for a number base: "courts whose subjects all share the king's colour", "mirror lines whose colours
mirror too". Each adds 1–2 bits a unit, and is alive at the top (the number top says nothing about colours). Brainstorm
C notes that a colour tier on a disjoint-unit number base still has an exact conditional law, because colours are
independent of numbers under the uniform prior.

**Int and String objects (outline).**
- **Int** (a number):
  - base = a digit property (the number of 7s, the digit sum is x);
  - vocabulary = digits, runs and positions;
  - interactions = "runs of equal digits of length y", "digit pairs adding up to x".
- **String** (a word):
  - base = letters (vowels, a letter count);
  - vocabulary = letters, runs and palindromic substrings;
  - interactions = "palindromes of length y", "letter values (a = 1) adding up to x".
- The same rules apply to both: max-compatible, breaks degenerate maxima, graded, gated.

---

## 10. Red team (brainstorm D) and the other brainstorms

The red team attacked the owner's examples read literally. Each finding below has the fix it led to.

1. **The literal kings base is topped by all-zero and every 0/k checkerboard.**
   - A window {0, k, 0, k} has king k = 0 + 0 + k.
   - 32,123,820 boards max the literal base (28.2 bits), including `0770/7007/7007/0770`.
   - The paths tier does not break it: `0505/5050/0505/5050` is the top for x = 10.
   - **Fix (adopted):** a unique king. With it, every degenerate board scores 0 and the top rises.
2. **"Exactly two symmetries" contradicts the 18-line base.** The best tier score falls as the base rises: 0 at 16–18
   lines, 3 at 15, 6 at 14, 10 at 10.
   - Composed as a sum, the tier overrides the base. Its best board `8555/5755/5595/5555` has a base of 11 of 18.
   - **Fix:** the `holding` tier (§5.2), or the rows-and-columns base.
3. **A plain count of mirror lines is a plateau** (`DIFF` 45.6 for 18 lines, 76.2 for rows and columns). A one-cell
   change cannot finish a 4-cell line. **Fix:** matched pairs as the base's secondary (adopted).
4. **The halves tier keeps the uniform maximum for every even x.**
   - **Fix:** 4-cell lines, odd x or a two-numbers clause.
   - With the two-numbers clause, x = 0 and x = 18 become dead, and the tops are 2–10 boards worth 49.8–52.2 bits.
5. **The sampled calibration cannot see deep tiers.** `0770/7007/7007/0770`, which scores 8 of 8 on the halves tier
   (x = 7, rows and columns), was calibrated at 39.1 bits: the same as a uniform board with tier 0. Its exact value is
   50.2. **Fix:** conditional calibration (§7).
6. **A sum lets the tier eat the base. Plain lexicographic silently drops incompatible tiers.** **Fix:** gated
   lexicographic order plus the liveness check.
7. **One two-digit board tops several rules at once.** `0770/7007/7007/0770` reaches the calibrated top of four
   candidate rules (two mirror bases, the literal kings base, a halves tier).
   - **Fix:** extend the pool's uniform-maximum check to two-digit boards: checkerboards, `abba/baab` quadrants,
     one-digit-plus-0.
8. **Tier tops dwarf simple rules.** A halves-tier top reaches 53 bits, the most a 4×4 digit board can hold, against
   16–27 for the beginner rules. Its top board gives 0 bits to Spread of Three, Strangers and Leapfrog.
   - **Fix:** cap a tier's extra reach at about 12–20 bits above the base, and add a pool check of top max/min ≤ 2.5
     (§8).
9. **Parameters and shapes.**
   - Roads of 13 or more subjects are unsatisfiable on 4×4.
   - "Diagonals of length 2 and 3" means nothing on 3×3.
   - On 6×6 a uniform board reaches 99% of the mirror tiers' top.
   - **Fix:** per-shape `tierTop` and liveness in the checker.

**Where the brainstorms disagreed, and the call:**
- **Gate or no gate** (C for, B against). Gate at the base's greedy-10-move level, and open the card's ★ tier at the
  same moment (§3).
- **Kings windows** (A: overlapping; D and the measurements: not a beginner base). Corner boxes for the beginner base;
  overlapping windows as an expert base.
- **"Roads of subjects"** (owner: longest road of y). Plateau-prone. Use roads of *exactly* y, or the longest
  *same-number* road (A).
- **Composition** (A, C, D all reject the sum). Agreed.

**Extra families the brainstorms proposed** (not prototyped here, worth a look):
- **Pascal's Builder (B):** a cell scores when it is the last digit of the cell above plus the cell to its left.
  - The full base is reached by 10⁷ boards, each fixed by its edges.
  - Tier: "each 7". The most 7s at a full base is 10, on 2 boards (exact).
  - A one-sentence base with a ripple that teaches planning.
- **Straights (B):** each 2×2 square holding four consecutive numbers. Its row-and-column tier may be dead at the top.
- **Spread of Three + "satisfied windows add up to x" (A):** the cleanest "easy base, deep tier" result.
  - A base climber always reaches 9 of 9, but only 0–3 windows with sum x.
  - A lexicographic climber reaches 7–9 for x = 6..30, because all windows sharing one sum forces a global tiling.
  - Its base has no exact conditional sampler yet (overlapping windows).

---

## 11. Decisions for the owner

1. **Composition: gated lexicographic, plain lexicographic, or unlock?** *Recommend gated lexicographic*, with the gate
   at the base's greedy-10-move level, opening with the card's ★ tier. It keeps every pool-balance measurement of the base
   unchanged and calibrates accurately. Plain lexicographic is simpler to say but shifts the early climb by 0.3–0.7 bits
   a move.
2. **How many interactions per dealt rule?** *Recommend one at beginner and standard difficulty, two at expert.* Tables
   and card length both multiply with depth.
3. **Kings and subjects as the owner described it (overlapping squares).** *Recommend:* corner boxes for the beginner
   base, with paths between kings as the tier. Overlapping windows measure `DIFF` 21–30 at every grading tried, so they
   belong to an expert variant.
4. **The mirror tiers.** *Recommend:*
   - "each mirror line holding exactly two ys" instead of "y in exactly two symmetries" (dead at the top of the 18-line
     base);
   - "halves" only on 4-cell lines, with odd x or a two-numbers clause;
   - Hall of Mirrors as a new sibling now, and mirrormancer's tiered params later.
5. **Which bases may carry tiers.** *Recommend:* only bases with an exact conditional law (disjoint units: Opposite
   Nines, Two Pair, Strangers, Leapfrog, Crosswise Threes, Mirrormancer, Magic Eighteen, corner-box kings) until a row-chain
   sampler exists. Spread of Three and overlapping kings wait.
6. **Balance across tier depth.** *Recommend* a per-pool cap: a tier adds at most 20 bits over its base, and pool top
   max/min ≤ 2.5. The alternative is deliberately unequal tops, stated on the card ("an expert rule: higher reach").
7. **Card disclosure.** *Recommend:* the tier is always present, collapsed, and auto-opens at the gate. Do not hide it
   (P8).

---

## 12. Staged plan

1. **The framework (this PR).**
   - `layered-profile.ts` reports the tiered profile: base and tier `DIFF`, `K`, `rate4`, prior mean, `+top`, the
     accidental and tier shares, liveness, synergy and games.
   - Prototypes and tests are included.
2. **The liveness and degenerate-board check as a library function.** Exact where the base-max set is enumerable
   (mirror lines: 1,000 boards; Opposite Nines: 10⁸ by product; corner kings: by product), sampled otherwise.
   - Add two-digit boards to `uniformTop`.
   - Add `tierTop(params, ctx)` to `FamilyDef` as an optional field.
3. **The hybrid calibration (`hybrid:` label):**
   - the exact base law plus the conditional tier estimate per base level above the gate;
   - built on demand, one piece per base level;
   - verified against exact convolutions on disjoint-unit tiers (C's `exact.ts` pattern), and against the brute-force
     base-max enumeration for mirror tiers.
4. **The API change:**
   - `FamilyDef.shape(params, spec)`;
   - an optional `tiers` param;
   - the card generator appends the tier block (P4's "★ To score even higher");
   - annotations carry points tuples per tier;
   - **a test that every shipped key is unchanged.**
5. **The first shippable layered family: Opposite Nines + "lines add up to x"**, gated at 6, x ∈ {14..22}, folded with
   36 − x. Five tables on the beginner shape. Why this one:
   - the base is the cleanest measured (`DIFF` 0, `K` 1);
   - it has an exact law (8 independent pairs);
   - the tier is alive at the top and agrees with Magic Eighteen at x = 18;
   - it is a new param on a family the beginner-rules session is landing anyway. That session's variant stays exactly
     as it is, keyed as today.
6. **Then:**
   - Royal Court (corner boxes + paths x);
   - Mirrormancer's tiers (`holding`, `halves4`);
   - Two Pair + links.
   
   Then the guard tests' tiered groups (§7.5) and the pool cap (§8).
