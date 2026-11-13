# Mutation cost as a cost function: design brainstorm (2026-11-11)

Status (2026-11-13): the cost function of this document is shipped as a room setting, `costModel`
(docs/energy-model.md §4.5; `lib/game-types/src/structure/`). What shipped, and where it departs from the text below:

- **Shipped as values of `costModel`:** `set-v1` (the flat price, the default when the setting is absent), `distance-v1`
  (the recommendation R: a slider, 4 + 1.585·|k| on the beginner board; the default setup "Annotated basics" uses it),
  `dial-v1` (A1), `log-v1` (A2, on a slider) and `multiply-v1` (§4.3: add or multiply modulo the base, the cheaper, plus
  1 bit to say which; erasing multiplies are allowed and pay log2 gcd(m, base)). The strictly proportional X1 is a
  variant branch only.
- **Reads and summons keep their prices.** §6, §7 and every mention of two-level selection, cooldowns, agent limits and
  rate limits are NOT shipped and are not planned by this work.
- **A mutator does the same thing under every model.** `count_on` (step_rank) still wraps and pays for the distance each
  number moved (9 → 0 is nine steps on a slider, one on a dial); the new `add(where, amount)` never wraps and fails out
  of range in every room. Only multiply-v1 changes what is offered (it adds `multiply` and `divide`).
- **Cards are in:** rank is a slider (A–K), suit categorical. Multiply needs the digits 0–9. A model is offered on a
  board only where a full look stays cheaper than the model's cheapest change (the rule that sets the read price,
  energy-model.md §2.1): the biggest boards (6×6 and 7×7 with many colours or cards) keep the flat price.
- **λ is the exact Kraft root of each generator's declared argument space** (1.58491 for ten digits), which gives
  categorical layers log2(n − 1) by the same rule.
- §8's numbers are confirmed with the real implementation (docs/rule-difficulty.md §6.4).
- **What remains (stage 2, not started in shipped code).** Int and string still have only the flat price. To put them
  on the structure module: (1) Int add as the positional signed-digit norm (a place is a site, its digit a dial; the
  price of a change is its cheapest signed-digit form, a small DP generalising `signedDigits`); (2) Int multiply as the
  magnitude code λ·log2|m| with λ = 2.185, which also replaces today's per-prime code, which is not a valid prefix code
  (Σ 2^(−w) over ±m exceeds 1) and must stay as it is under `set-v1` because stored games were priced by it; (3) string
  with categorical characters and the three families substitute, insert, delete; (4) their noise and cost tables from
  the same declared arguments, `supportsCostModel`, the settings form and wording; (5) bit-for-bit regression tests for
  `set-v1`. Draft #300 holds an untested sketch of (1)–(3).

The prototype that produced the original numbers is `lib/game-utilities/scripts/mutation-cost.ts` (with
`mutation-cost-lib.ts`, unit-tested in `lib/game-utilities/test/mutation-cost.test.ts`).

The owner's request (11 Nov 2026): drop the spawn (summon) and read costs, so that energy is spent only on mutation.
Make mutation cost a smooth function of the arguments: adding k costs in proportion to |k|; no "set value" for numbers;
multiply and divide (mod 10 on the beginner digits) cost according to their arguments. Choose the distance functions
inside mutators by a principled, information-theoretic rule, and say how the rule generalises to the other object
types, their shapes, and future types.

This document merges four independent brainstorms (information theory, game design, type generalisation and a red
team), then measures the result.

## 0. The recommendation in one page

**The principle.** A move's cost is the length of its code under a declared prior over moves, measured against doing
nothing:

```
w(move) = ℓ_where + ℓ_which + λ_L · d_L(argument) + ε
```

- **ℓ_where** = log2(number of sites): the cell, the digit place, the string position.
- **ℓ_which** = log2(number of generator families the type offers): 0 on a mono digit board, where "add" is the only one.
- **d_L** = the distance of the argument from the identity, in the word metric of the layer's own generators: how many
  ±1 steps, how many generator multiplications.
- **λ_L** is the rate that makes the argument code *Kraft-tight with no constant*: Σ over every non-identity argument
  of 2^(−λ·d) = 1. It is fixed, not tuned. On a line or a long cycle it is log2 3 = 1.585 bits per step (each further
  step is one of three equally likely continuations: stop, or go one further in either direction).
- **ε** = the bits the move erases: log2 of the preimage size. It is 0 for every bijection (add, multiply by a unit).

The maximum-entropy prior over arguments with a fixed mean distance is P(θ) ∝ 2^(−λ·d(θ)). Its code length relative to
the identity is exactly λ·d. So "the cost is proportional to the distance" is not a tuning choice; it is what holding
the *mean distance* fixed means. Holding the mean of log-distance fixed instead gives a power law and a logarithmic
cost. Choosing the distance is the statement of which moves the world considers small. The distance should be
the one the rules see.

**For the beginner board (4×4, digits 0–9, mono):**
- The digits are a **slider, not a dial**. They are an ordinal 0–9: an add that leaves 0..9 fails, as an out-of-range
  Int multiply fails today. The rules measure distance on the line (|a − b|, sums, spreads), so the price must too. With
  wrap, the cheapest move on a 9 (one click to 0) is the most violent change every "sum", "spread" and "one apart"
  rule can see.
- There is **one number mutator, `add(cell, k)`**, with W = 4 + 1.585·|k| bits (4 bits for the cell). It costs more
  to jump than to nudge, as asked:

| move on one digit | +1 | +2 | +3 | +4 | +5 | +6 | +7 | +8 | +9 |
|---|---|---|---|---|---|---|---|---|---|
| W (bits) | 5.58 | 7.17 | 8.75 | 10.34 | 11.92 | 13.51 | 15.09 | 16.68 | 18.26 |
| energy, W + 0.05·W² | **7.1** | 9.7 | 12.6 | 15.7 | **19.0** | 22.6 | 26.5 | 30.6 | 34.9 |
| today (any change, mono) | 16.3 | 16.3 | 16.3 | 16.3 | 16.3 | 16.3 | 16.3 | 16.3 | 16.3 |

  A nudge costs 0.44× today's change and +4 costs about the same as today's. "Set to v" is gone; writing v costs
  `add(v − x)`. `write`, `step_rank` and the other composites stay, priced by their net effect, as today.
- There is **no multiply or divide on the beginner board.** Multiplication mod 10 erases bits (×2 merges digit pairs, ×5
  sends every digit to 0 or 5). It cannot be priced by its argument without becoming a cheap long-range jump, and
  "÷2 mod 10" does not exist. §4 gives the pricing for the setups where multiply belongs: Int, and a later "clock"
  board with a prime modulus.

**The knobs.** None inside the cost function: λ follows from Kraft, ℓ from the counts, ε from the map. What is left is
the act term β (0.05 today, unchanged) and power (bits per second). The one honest optional knob is a stickiness factor
s ≥ 1 that multiplies every λ (s = 1 is the tight code).

**Reads and summons** (§6 and §7).
- **Reads go to zero, with three companion changes in the same release.** Selection becomes two-level: an opportunity
  picks a deity first, with a per-deity cap, then one of its agents. Agents that fail, error or hit the step limit get
  an exponential cooldown in place of the charge they no longer pay. The beginner room's `interactionRateHz` is lowered
  until the sandbox capacity work lands. Keep the read meter's code and the Python source rule.
- **The summon price goes to zero**, with an agent limit per deity (4 on beginner setups), a summon rate limit, and the
  summon measurement cached by source hash. The ast-bits length stays as displayed information ("code size").

**What it does to balance** (§8). On eight beginner-style digit rules, for the same energy spent:
- the simplest cost-aware agent holds twice the bits it holds today (0.33 of each rule's top after 32 energy bits,
  against 0.16);
- the rules end up much closer together: the coefficient of variation of share-of-top falls from 0.39 to 0.17;
- an agent that ignores cost loses most of that gain, so care is rewarded.

**The first step** (§11): the slider `add` on the mono digit board, behind a room setting, priced by a new cost model
and logged under a new event-log schema. Reads at zero and a beginner agent limit come with it.

## 1. What the owner asked, read carefully

- **"Abandon spawn and read cost".**
  - Spawn: the only thing charged at summon is the summon price, the ast-bits description length of the agent's code,
    paid from the deity's account (energy-model.md §6).
  - At summon the engine also runs the agent on the reference mixture (about 208 sandbox runs, `measureAgent`). That is
    not charged; it only produces estimates (§5 of the energy model).
  - Nothing else is charged at summon or at spawn.
  - Read cost is the R/κ term of every act (§2.1).
- **"Costs more to set a cell than to add a small number to it."** With add as the generator, setting is add by the
  difference, so it costs more exactly when the difference is larger than a small step.
- **"Proportional to the absolute value of the amount added."** Taken literally (W = λ·|k| with no constant), it has to
  pay for *which cell* inside λ. The Kraft-tight rate is then λ = 5.04 bits per step on a 16-cell board, so +5 costs 25
  bits (57 energy, 3.5× today's change). The alternative is to make λ small and give up the code (the red team's
  λ = 1, a = 0: +1 costs 1.05 energy). Both are worse than the affine form 4 + 1.585·|k| (§9, exploit 1, and §8). We
  recommend the affine form. **This departs from "proportional" in one respect: the 4 bits that name the cell.** The
  argument's cost is strictly proportional to |k|.
- **"No set value function for numbers."** Agreed for digits and for Int. Colours keep a "set": a categorical layer
  has no smaller step than "change to another colour".
- **"Multiplying and dividing … cost corresponding with the argument(s)."** Yes for Int (λ·log2|m|, §4.3) and for a
  prime-modulus clock board. On the mod-10 beginner board we recommend against it; the evidence is in §4.2.

## 2. The recipe for choosing a distance

1. **Declare the layer's structure.** A layer is the set of values one site can hold. Its structure is the set of
   generators the type offers on it:
   - categorical (colours, suits): any change is one step;
   - cyclic (a dial, a hue wheel): ±1 with wrap;
   - ordinal (a slider): ±1 without wrap;
   - positional (an Int's places): ±10^p;
   - magnitude: ×m;
   - sequence (strings): insert, delete and substitute;
   - later: set (swap one member), permutation (adjacent transposition, or any transposition), graph (edge toggle).
2. **The distance is the word metric of those generators**: the fewest generator steps from a to b. Consistency
   requires it. If an elementary step takes 9 to 0, then d(9, 0) cannot exceed one step, so a wrapping mutator forces a
   cyclic metric. The structure name is shorthand for its default generators.
3. **λ is the Kraft-tight root** of Σ_{g ≠ e} 2^(−λ·|g|) = 1, taken from the worst-case start on layers that are not
   symmetric (the middle of a slider).
4. **Add ℓ_where and ℓ_which, plus ε for non-injective generators.**
5. **Price a composite call by its net effect**: the cheapest generator program with the same before → after. On
   product layers (a grid of cells) that is the sum over changed sites. The superlinear act term C = W + β·W² goes on
   top, unchanged.

**Pick the generators so that the distance matches what the rules see.** This is the one judgment in the recipe, and it
is a game-design judgment, not information theory. Hold rarity is where damage to *specific* goals is priced: a parity
goal is wrecked by any ±1, and no goal-free distance can know that.

| Layer | Values | Structure | λ* (bits per step) | ±1 | farthest |
|---|---|---|---|---|---|
| beginner digits | 10 | **ordinal** (slider) | 1.585 | 1.58 | ±9: 14.3 |
| base10 as a dial | 10 | cyclic | 1.577 | 1.58 | ±5: 7.9 |
| base12 / base16 | 12 / 16 | ordinal (recommended) or cyclic | 1.585 | 1.58 | ±11: 17.4 / ±15: 23.8 |
| card ranks | 13 | ordinal A..K (recommended) or cyclic (`step_rank` wraps today) | 1.585 | 1.58 | — |
| suits | 4 | categorical | log2 3 = 1.58 | — | 1.58 |
| rgb | 3 | categorical (= cyclic on 3) | 1.00 | 1.00 | 1.00 |
| rgby | 4 | categorical (no wheel class) | 1.58 | — | 1.58 |
| rainbow6 | 6 | categorical by default; cyclic hue is an option | 2.32 / 1.50 cyclic | 1.50 | 4.50 |
| mono | 1 | unit: no move, 0 bits | — | — | — |
| string characters | 128 | categorical | log2 127 = 6.99 | — | 6.99 |

Three general facts the brainstorms established (each is a unit test in the prototype):
- **Diameter normalisation is not a code.** Scaling λ so that the farthest move costs log2 |values| gives λ = 0.66 on
  digits, and the moves then claim 2.98 units of probability against a budget of 1. Those "bits" understate what the
  moves say.
- **The identity costs 0 by construction.** We price −log2 [P(θ)/P(no change)], and the normaliser cancels.
- **Today's Grid formula is a consistent Landauer accounting**, not a double count: forward bits plus the bits a
  reversible machine must dump. Under net-effect pricing, though, the cheapest program for a categorical change is a
  relabelling, which is a bijection. So the erasure term goes, and a colour change costs log2(C − 1), not 2·log2 C.

## 3. Candidate designs for the beginner board, with tables

Every candidate is one cell of a 4×4 mono board. Energy = W + 0.05·W². "Mean" is over a uniformly random retarget (a
random cell to a random other digit). Numbers from `pnpm --filter @workspace/game-utilities mutation-cost --tables`.

| Design | W(±1) | W(±2) | W(±3) | W(±5) | W(±9) | mean energy | is a code? |
|---|---|---|---|---|---|---|---|
| **R: slider, located (recommended)**: 4 + 1.585·\|k\| | 5.58 (7.1) | 7.17 (9.7) | 8.75 (12.6) | 11.92 (19.0) | 18.26 (34.9) | 15.2 | yes, Kraft = 1 |
| A1: dial, located: 4 + 1.577·Lee(k) | 5.58 (7.1) | 7.15 (9.7) | 8.73 (12.5) | 11.89 (18.9) | = ±1 | 12.1 | yes, Kraft = 1 |
| A2: log distance: 4 + 2.0 + 2·log2 Lee(k) | 5.5 (7.1) | 7.5 (10.4) | 8.7 (12.5) | 10.2 (15.3) | — | 11.5 | yes |
| X1: strictly proportional, Kraft-tight: 5.04·Lee(k) | 5.0 (6.3) | 10.1 (15.2) | 15.1 (26.6) | 25.2 (57.0) | — | 26.0 | yes |
| X2: diameter-normalised: 4 + 0.66·Lee(k) | 4.7 (5.8) | 5.3 (6.7) | 6.0 (7.8) | 7.3 (10.0) | — | 7.6 | **no** (Kraft ≈ 3) |
| today: set, mono: 4 + 2·log2 10 | 10.64 (16.3) | 10.64 (16.3) | 10.64 (16.3) | 10.64 (16.3) | 10.64 (16.3) | 16.3 | yes, with 2.7 bits to spare |

- **R** keeps the owner's shape (a jump costs more than a nudge, the argument is proportional), keeps "where" honest,
  and matches the rules' line metric. Its ±1–±4 are cheaper than today's change and ±5 and above are dearer.
- **A1 (the dial)** is the alternative if the owner wants "9 + 1 = 0", a combination-lock wheel. Then the rules on that
  board should be circular too ("one click apart" counts 9–0), and spread rules do not fit.
- **A2 (logarithmic)** is the alternative if "proportional" feels too punishing for far moves: +9 would cost little more
  than +5. It is principled too (it holds the mean log-distance fixed), but it rewards incremental play less.
- **X1 and X2** are recorded only to be rejected. X1 is the owner's words taken literally: it charges +5 at 3.5×
  today's change and is the slowest and least balanced in §8. X2 is not a code.

**Typical moves the beginner rules need** (expected travel on random boards, slider):

| Rule | What a fix needs | Typical move | Energy under R | Today |
|---|---|---|---|---|
| half-turn partners add up to 9 | one cell to 9 − partner | ±3.3 on average | ≈ 13 | 16.3 |
| row partners one apart | ±1 next to the partner | often ±1, about ±2.5 | 7–11 | 16.3 |
| corner box holds two different pairs | copy a value | ±3.3 | ≈ 13 | 16.3 |
| 2×2 window spread exactly 3 | pull the extremes in, then ±1 | large first, then ±1 | 7–19 | 16.3 |
| parity patterns | ±1 | ±1 | 7.1 | 16.3 |

## 4. Multiply and divide

### 4.1 Multiplication mod 10 erases information

×m on Z_10 is a group homomorphism. Every image point has gcd(m, 10) preimages, so it erases log2 gcd(m, 10) bits
whatever x is. (Pricing erasure at the largest preimage changes nothing here: every fibre has the same size.)

| m | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| image size | 1 | 10 | 5 | 10 | 5 | 2 | 5 | 10 | 5 | 10 |
| erased bits | 3.32 | 0 | 1 | 0 | 1 | 2.32 | 1 | 0 | 1 | 0 |
| unit? (inverse) | – | 1 | – | 7 | – | – | – | 3 | – | 9 |
| steps in ⟨3⟩ = {1, 3, 9, 7} | – | 0 | – | 1 | – | – | – | 1 (= 3⁻¹) | – | 2 |

Read through Z_10 = Z_2 × Z_5:
- ×2 wipes parity, ×5 wipes the mod-5 part, and ×6 keeps only x mod 5.
- The units form a cyclic group of order 4 generated by 3. ×9 is negation.
- Z_12 and Z_16 are less tidy: Z_12's units {1, 5, 7, 11} all have order 2, and Z_16's form Z_2 × Z_4. So a
  group-theoretic argument prior does not carry from base to base.

**What "divide mod 10" can mean:**
- ÷u for a unit u is ×u⁻¹ (÷3 = ×7), which adds nothing new.
- "Solve 2y ≡ x" is not a function: there is no answer for odd x and two for even x.
- Floor division ⌊x / m⌋ on 0..9 is the only new, intuitive map ("halve it"). Its fibres are uneven, so it must be
  priced at the largest fibre, log2 m. Pointwise erasure would charge 0 for ÷9 sending 9 to 1, a cheap long move.

| ⌊x / m⌋ | ÷2 | ÷3 | ÷4 | ÷5 | ÷6 | ÷7 | ÷8 | ÷9 |
|---|---|---|---|---|---|---|---|---|
| image size | 5 | 4 | 3 | 2 | 2 | 2 | 2 | 2 |
| erased, largest fibre | 1.00 | 1.58 | 2.00 | 2.32 | 2.58 | 2.81 | 3.00 | 3.17 |
| erased, mean over x | 1.00 | 1.43 | 1.80 | 2.32 | 2.35 | 2.44 | 2.60 | 2.85 |

### 4.2 Why not on the beginner board

- **It breaks "add k costs ∝ |k|".** Net-effect pricing takes the cheapest program. With ×3 available, "+6 on a 3"
  costs a ×3. The red team counted the digit pairs (x → y) that become cheaper than their add price: 13 to 58 of the 90,
  depending on how the multiplier is priced and on λ. Players and the assistant would ask why their +6 cost 1.6 bits.
- **Erasing multiplies are wrecking balls.** ×5 sends every cell to 0 or 5, ×2 sends 5 to 0, and ×0 wipes any cell for
  a constant price. Once λ ≥ 1, ×0 undercuts walking for most cells.
- **Multiplying scrambles.** The mean displacement of ×m is about n/4 for every m ≠ 1. So "cost by how far it moves
  values" is meaningless, and every rule that reads magnitudes sees ×m as a random jump.
- **Comprehension.** "The last digit of 7 × 8" is a nice puzzle for a curious 12-year-old, but an agent that multiplies
  mod 10 is hard to predict, and "÷2" would be missing for no visible reason.

**Recommendation:** no multiply or divide on First steps. Two later options:
- "Double it / halve it", ×2 and ⌊÷2⌋ on a slider, failing out of range;
- a **clock board** with a prime modulus (mod 7 or mod 11), where every non-zero multiplier is a unit, nothing erases,
  division always exists, and the rules are circular.

### 4.3 Pricing, where multiply does belong

- **Clock board, mod p.** The units form a cyclic group of order p − 1 with a generator g, so ×m costs
  ℓ_where + ℓ_which + λ*(Z_{p−1})·Lee(log_g m). For mod 7: 1.50 bits per generator step.
- **Mod 10, if the owner wants it anyway: units only.** ×3 and ×7 cost one step of λ*(Z_4) = 1.27 bits; ×9 costs two.
  With 4 bits for the cell and 1 bit to choose add or multiply, ×3 is 6.27 W (8.2 energy).
  - Erasing multiplies should be refused. If they are offered, price them at no less than the dearest add into their
    image (≥ 5λ).
  - Divide only as ×u⁻¹.
- **Int (magnitude).** ×m costs ℓ_which + λ·log2|m|, with λ = 2.185 the root of 2(ζ(λ) − 1) = 1 over ±m, m ≥ 2. The
  code is additive in the factors: w(×ab) = w(×a) + w(×b) − ℓ_which.
  - **Today's per-prime multiply code is not a prefix code.** Σ over ±m of 2^(−w(×m)) is 0.91 up to |m| = 10³ and 1.45
    up to 10⁶, and it diverges (Σ 1/p diverges). Together with the adds' 0.5, the Int code over-claims by at least 0.4.
    The fix makes ×7 cost 7.13 W instead of 5.81.
- **Exact division on Int** (fails unless it divides) is injective and costs the same as the multiply by its divisor.

## 5. How it generalises

### 5.1 One declaration per type

The type-generalisation brainstorm proposes that each object type declares its value layers, their structure and
generators, and its accessors. Everything else is derived from that one declaration: the cost table, `callWork`, the
noise sampler, `layerBits`, the read meter's per-accessor bits and the summon `describeBits`. It would live in
`lib/game-types/src/structure/`:

```ts
type Layer =
  | { kind: "unit" }                                   // mono: no move, 0 bits
  | { kind: "categorical"; n: number }                 // any change is one step: λ* = log2(n − 1)
  | { kind: "cyclic"; n: number }                      // ±1 with wrap: Lee
  | { kind: "ordinal"; n: number }                     // ±1 without wrap: |Δ|; λ* from the worst-case start
  | { kind: "table"; n: number; gens: TableGen[] }     // small finite layer with any generators: Dijkstra table,
                                                       // erasure from preimages (e.g. Z_10 with +1, ×3)
  | { kind: "positional"; base: number; places: number; modulus: bigint }  // Int: ±b^p with carry
  | { kind: "magnitude"; sign: boolean; max: bigint }  // ×m: λ*·log2|m|
  | { kind: "sequence"; alphabet: Layer; maxLength: number }  // edit distance DP
  | { kind: "subset"; universe: number; k?: number; element?: Layer }   // swaps; with element metric: matching
  | { kind: "permutation"; n: number; metric: "kendall" | "cayley" };

interface FamilyDecl<V> { id: string; layer: Layer; sites(inst): number; get(v: V, site: number): unknown }
interface StructureDecl<V> {
  families(inst): FamilyDecl<V>[];
  accessors(inst): { name: string; reads: string[]; image: number; capGroup?: string }[];
  positionMoves?(inst): PositionMoveDecl<V>[];        // empty for now (§5.3)
  expand?(call, v: V, inst): ElementaryCall[] | null;  // a composite's literal program: an upper bound
}
```

### 5.2 The shipped types under the recipe

Energy in brackets; each row says what generator families the shape has (ℓ_which = log2 of their number).

| Type and shape | Elementary move | Today W (energy) | Recipe W (energy) |
|---|---|---|---|
| Grid 4×4 mono digits (beginner) | digit +1 / +5 / +9 (slider) | 10.64 (16.3) any | 5.58 (7.1) / 11.92 (19.0) / 18.26 (34.9) |
| Grid 4×4 base10 rgb (digit + colour families) | digit +1 / +5 | 11.64 (18.4) any | 6.58 (8.7) / 12.92 (21.3) |
| Grid 4×4 base10 rgb | a colour change | 8.17 (11.5) | 6.00 (7.8) |
| Grid 4×4 rgby / rainbow6 | a colour change | 9.00 (13.1) / 10.17 (15.3) | 6.58 (8.8) / 7.32 (10.0); rainbow6 as a wheel ±1: 6.50 (8.6) |
| Grid base12 / base16 (with a colour family) | digit ±1 / ±3 / ±6 | 12.17 (19.6) / 13.00 (21.5) any | 6.58 (8.8) / 9.75 (14.5) / 14.51 (25.0) |
| Grid 7×7 cards (colour, rank, suit) | rank ±1 / a suit change | 18.02 (34.2) any card | 8.78 (12.6) / 8.78 (12.6) |
| Int 32-bit | +100 (one place, one step) | 8.49 (12.1) | 5.91 (7.7) |
| Int 32-bit | +10101 (three places) | 25.5 (58.0) | 17.72 (33.4) |
| Int 32-bit | ×7 | 5.81 (7.5) | 7.13 (9.7) |
| Int 32-bit | ×7⁴ | 17.2 (32.0) | 25.54 (58.1) |
| string, maxLength 32 | substitute / insert / delete one char | 20.63 (41.9) / 13.63 (22.9) / 13.63 (22.9) | 13.57 (22.8) / 13.63 (22.9) / 13.58 (22.8) |

- The owner's §4.4 checks all still hold:
  - ×7 is cheap whatever digits change;
  - C(×7⁴) = 58.1 > 4·C(×7) = 38.7;
  - one digit costs less than ⅓ of three digits (7.7 < 11.1);
  - a row costs more than 4 × a cell.
- **Int's add** is the positional (signed-digit) norm: the product prior over places, each place a Lee-Z_10 digit. +k
  costs Σ over the signed digits of (ℓ_place + 1.585·|digit|), so +999 = +1000 − 1 costs two steps.
  - Literal proportionality would cost +1000 at 1585 bits, which is unplayable.
  - The positional norm is not monotone in |k|: +9 = +10 − 1 is cheaper than +5. It is monotone in the generators'
    word metric, which is the principled order.
  - If the owner insists on monotone in |k|, the alternative is the power law 1.72 + 2·log2|k|.
- **Unification.** An Int's digit add and a Grid cell's add share the site code and the argument code. They differ only
  in the carry: a grid row is (Z_10)^P, an Int is Z_W.
- **Characters stay categorical.** 'a' → 'z' is not a bigger change than 'a' → 'b' in text, and an ordinal alphabet would
  price one letter at up to 100 bits.

### 5.3 Composites and symmetry moves

- **Value-wise composites** are priced exactly by the sum over sites of the per-site distance: paint, recolour,
  swap_colours, hue_turn, pattern_line, motif, majority_line, blend, write, step_rank, write_ramp, swap_symbols,
  paint_by_key, stamp, tally, suit_swap and suit_set. `step_rank(row, +2)` on a slider costs 4 × 7.17 W, and fails if
  any cell would leave the range.
- **Position composites** (swap_cells, shift_line, reverse_line, swap_lines, turn_block, turn_grid, sort_line) stay
  priced by the value changes they cause.
  - Information theory says a rotation is cheap to describe (about 4.4 bits).
  - As a cheap generator it would dominate the noise, reward global moves over incremental play, and fall into the
    NP-hard class (position plus value).
  - Keep the declaration slot, ship it empty, and make turning one on an owner decision. The middle way is *transport*
    pricing: each content moves its Manhattan distance, which is an assignment problem at N² ≤ 49.
- **The composite invariant:** lower bound ≤ callWork(call) ≤ Σ w over the call's literal expansion. A composite is
  never a discount on its own program.
- **Per changed cell, never per call.** A per-call location charge would make a row-wide add cheaper than four adds.

### 5.4 Two future types

- **A hand of k cards (a subset of a structured universe).**
  - One swap, one card out and one in, costs log2 k + log2(U − k): 7.9 bits for 5 of 52.
  - With the card metric, a swap is priced by how far the card moves: a min-cost matching (Hungarian, O(k³)).
  - Reading the whole hand costs log2 C(52, 5) = 21.3 bits.
- **A permutation (a ranking, a deck order).**
  - Kendall metric (adjacent swaps): λ* = 3.39 for n = 8, and the net effect is the inversion count.
  - Cayley (any two trade): the net effect is n − cycles.
- **Graphs:** store them labelled, so that an edge toggle is a categorical-2 site and the net effect is |E Δ E′|.
  Relabelling as a generator is graph edit distance, which is NP-hard. If it is ever wanted, charge the minimum over a
  small fixed candidate set (identity, the call's own permutation, colour-refinement alignments) and test it against a
  certified lower bound.
- **Real vectors and images** need a declared quantum ε before anything has a bit cost. Each component is then ordinal
  in ε-steps, or magnitude in log space.

### 5.5 Invariants every cost function must pass (unit tests)

1. The identity costs 0.
2. Kraft per family: Σ_{θ≠id} 2^(−w) ≤ 1 (= 1 at s = 1), single-cell board Kraft ≤ 1, and whole-act Kraft with β ≤ 1.
   The old multiply code is the regression case.
3. Generator consistency: no elementary step is priced above its own code.
4. Monotone in the declared distance (not necessarily in |k|; say which).
5. Invariant under the layer's symmetries: +k vs −k; relabelling a categorical layer; rotating a cycle (but not
   relabelling it, a negative test); permuting cells; ×m ≡ ×(m mod n). Equal maps cost equal.
6. Subadditive (triangle inequality on the effect cost); β then makes one big act dearer than the same steps split.
7. Bijections erase 0; ε(×m mod n) = log2 gcd(m, n); floor division at the largest fibre.
8. Composite bounds: lower bound ≤ callWork ≤ the literal expansion; brute-force BFS agrees on small cases.
9. Noise: the one-step distribution matches 2^(−C)/Z; a unit layer has no mass.
10. The owner's §4.4 checks.

The prototype's tests cover 1, 2, 4, 5 (translation), 7 and the claim that diameter normalisation fails 2.

## 6. Dropping the read cost

**What reads cost today.** R/κ with κ = 32, 12–23% of energy in the balance harness, and a full look at the beginner
board is 1.66 energy (53.2 bits). The meter exists to make the price honest (§3.3 of the energy model).

**What dropping it entails:**
- **Every non-committing outcome becomes free:** skips, no-change, invalid, error, collision and commit-clause refusals.
  Today an act that traps or hits the step limit pays `readBound`, the only price on burning a sandbox slot. The
  futility memo does not cover it: a commit by anyone reopens the pair, and calling `random()` once makes an act
  non-deterministic and never memoised.
- **What is scarce is then change energy, opportunities and sandbox time.**
  - An agent that looks and waits loses nothing. Selection ∝ energy makes the most patient agent the most offered, up
    to its 4 Hz cap.
  - With cheap ±1 moves, the cap rather than energy becomes the scheduler. Energy binds an agent of share s only when
    C > s·P/4, which is 8 energy for half of 64 bits/s, and a nudge costs 7.1.
- **Agent count would buy opportunities.** The cap is per agent. The red team simulated a 25 Hz room with P = 64:
  under a +1 at 7.8 energy, a deity with three or more agents got 8.2 Hz against 3.4 Hz for a deity with one. At 1.05
  energy, ten agents got 14.6 Hz against 3.1.
- **Computation:** it was never charged, so nothing new there, but it is bounded only by the step and time limits. The
  sandbox has one worker per language and livelocks at about 20 concurrent games (production-readiness-backlog §1.1).
  With free reads the opportunity stream is always full: nobody goes broke from looking.
- **The κ rule and `read-price.test.ts` retire.** They would otherwise have to rise: with distance pricing the cheapest
  change on Master falls to about 11.4 energy, so κ would need to exceed 35.6 (that is, 64).
- **The meter and the Python source rule.** The meter is no longer needed for billing. The source rule also protects
  the prelude's private helpers, the `usedRandom` flag the futility memo trusts, and any future metered quantity.

**Recommendation: drop the read price (READ_PRICE = 0), with these in the same release:**
1. **Two-level selection.** An opportunity picks a deity with probability ∝ its power, among deities with a ready agent,
   capped at the room rate ÷ deities. It then picks that deity's agent ∝ its power share, among agents whose energy
   covers their cheapest move. Energy then gates only what an agent can afford, so neither hoarding nor agent count
   buys turns.
2. **A cooldown in place of the failure charge.** After an error, invalid act or limit hit, the agent sits out an
   exponentially growing world-time cooldown (1 s, 2 s, 4 s …, reset by a commit). This keeps "energy is only spent on
   mutation" exact while bounding sandbox abuse.
3. **Lower `interactionRateHz` on the beginner room** (e.g. 25 → 10) until the sandbox fixes land.
4. **Keep the meter code** (it still reports bits read for diagnostics and the estimates) **and the Python source rule.**
   Delete the κ section, the κ rule test and the "looking is 32× cheaper" text once the change has held.

## 7. Dropping the summon price

**What it does today.**
- It rewards short programs.
- It makes summon and destroy churn cost something.
- With the deity's account and `startingEnergy`, it gives the deity's unallocated share a use: summons during planning
  are paid from `startingEnergy` (200).

**What breaks without it.**
- **Agent spam through the per-agent cap** (§6). Two-level selection fixes it.
- **Summon churn.** Each summon runs `measureAgent`, about 208 sandbox runs. At price 0, a summon / destroy / summon loop
  is about 200 sandbox runs a second from one player.
- **Futility memo resets.** The memo is per agent, so a fresh agent starts with a clean memo.
- **The deity account loses its purpose.** The default share should become 1, and `startingEnergy` either goes or
  becomes agents' starting energy.
- **Code length loses its price.** That was a hidden tax a 12-year-old could not see. Keeping it visible as "code size"
  costs nothing.

**The options:**
- (a) Zero price plus limits: a cap per deity (4 on beginner setups, 6–8 elsewhere; it is 200 today), one summon per
  10 world seconds, and the measurement cached by source hash.
- (b) A wake-up delay instead of a price: a new agent's first opportunity comes N seconds after it is summoned.
- (c) Keep a price in another currency (helper tokens earned by score). This is more machinery than it is worth.

**Recommendation: (a), with a short wake-up (b) of about 5 s if churn still shows up.** Two-level selection is what
makes the agent count irrelevant to turns; the limits are for the sandbox.

## 8. The balance re-measurement

Rule difficulty (docs/rule-difficulty.md) measures climbs in one-cell moves of unit cost. With distance pricing the
currency is **bits gained per energy bit**. A rule whose fixes are ±1 nudges gets cheaper to pursue than one whose fixes
are jumps.

**The method** (`pnpm --filter @workspace/game-utilities mutation-cost --balance`):
- Eight beginner-style digit rules (`scripts/mutation-cost-beginner-rules.mjs`): the four named in the brief plus four of
  the same kind, spanning "needs ±1" to "needs copies". They are stand-ins: the real beginner set was not on `develop`.
- Each rule is calibrated on the spot, as rule-difficulty does for ad-hoc rules.
- The rules are climbed from 16 shared random 4×4 boards by one-move-per-act agents. Each act pays W + 0.05·W² under the
  model.
- Two agents:
  - *steepest* is rule-difficulty's greedy: it takes the best ordinal, ignores cost, but pays it;
  - *per-energy* takes the improving move with the most bits gained per energy bit.

The table shows the bits held after spending 32 and 64 energy bits. Under today's set price, 32 energy is about two
changes.

| Rule (top bits) | today: set, steepest | R: slider, steepest | **R: slider, per-energy** | A1: dial, per-energy | X1: strictly proportional, per-energy |
|---|---|---|---|---|---|
| half_turn_nine (25.6) | 2.7 / 7.7 | 4.3 / 11.3 | 7.8 / 15.1 | 8.0 / 16.7 | 6.4 / 11.0 |
| row_partners_one_apart (19.2) | 2.6 / 6.9 | 3.4 / 9.4 | 6.6 / 12.7 | 7.6 / 16.0 | 6.3 / 10.9 |
| corner_box_two_pairs (21.9) | 3.4 / 8.3 | 5.4 / 7.9 | 5.7 / 7.9 | 7.2 / 8.3 | 4.0 / 6.6 |
| window_spread_3 (24.6) | 4.2 / 9.7 | 5.1 / 10.3 | 7.4 / 13.2 | 9.6 / 16.3 | 6.8 / 12.4 |
| column_mirror_equal (27.5) | 2.8 / 7.8 | 5.2 / 11.0 | 7.7 / 14.8 | 8.3 / 17.1 | 6.0 / 10.4 |
| checker_parity (16.4) | 1.7 / 3.7 | 2.1 / 5.1 | 5.3 / 13.0 | 5.3 / 13.0 | 7.2 / 15.3 |
| row_sum_18 (15.3) | 4.5 / 11.6 | 6.2 / 10.7 | 6.8 / 10.7 | 8.9 / 15.3 | 6.4 / 10.6 |
| diagonal_steps (20.1) | 3.8 / 10.4 | 5.5 / 11.2 | 7.6 / 13.5 | 9.6 / 15.7 | 6.3 / 10.9 |
| **share of top at 32: mean; max/min; CV** | 0.16; 2.91; 0.39 | 0.22; 3.15; 0.36 | **0.33; 1.71; 0.17** | 0.39; 1.94; 0.24 | 0.30; 2.42; 0.28 |
| **share of top at 64: mean; max/min; CV** | 0.40; 3.42; 0.39 | 0.46; 2.24; 0.25 | **0.61; 2.17; 0.20** | 0.72; 2.62; 0.24 | 0.54; 3.08; 0.34 |

What it shows:
- **Care is rewarded.** Under today's flat price, the cost-aware agent and the blind one are the same agent; the
  prototype's tests check it. Under R, the cost-aware agent holds 1.5× the blind one's share at 32 energy (0.33 against
  0.22). That is the owner's "careful, incremental changes" made measurable.
- **The pool gets more even.** The spread across rules falls from CV 0.39 to 0.17. The slider balances better than the
  dial (0.17 against 0.24), because its price and the rules agree about distance. The dial's wrap makes some rules'
  fixes artificially cheap.
- **±1 rules gain most, as predicted.** checker_parity goes from the slowest rule (1.7 bits at 32) to mid-pack (5.3).
  Copy rules (corner_box_two_pairs) gain least.
- **corner_box_two_pairs is capped by a plateau, not by cost.** Greedy reaches two boxes and is trapped in every model,
  which is the DIFF problem rule-difficulty already reports.
- **Strictly proportional pricing (X1) is the slowest of the distance models and the least even** (CV 0.28 at 32,
  0.34 at 64). It also hands the parity rule a large lead.
- **The game speeds up.** For the same power, agents earn about twice the bits per energy. If that is too fast, power
  is the knob (Grid default 64 → 32), not λ.

**What rule-difficulty should gain** (follow-up, not in this PR):
- a `rateE` column, bits per energy under the room's cost model, beside `rate4`;
- a cost-aware greedy as the simplest decent agent;
- the pool check "`rateE` max/min ≤ 1.6".
The mutation-cost prototype already contains the climb and the cost models to move into the library.

## 9. Exploits and what stops them

Ranked by the red team; each stays stopped under the recommendation.

1. **Strictly proportional pricing (no location charge).**
   - At λ = 1 a +1 costs 1.05 energy, so energy stops binding and the cap becomes the scheduler.
   - Wrecking a cell costs 2.5–5× less than building one; today the two cost the same.
   - The hold-rarity noise ∝ 2^(−C) stops being "one mutation": the cheapest random mutation would touch 6.3 cells on
     average, and `noise.ts`'s one-call model would be wrong.
   - **Stopped by** the location code per changed cell (ℓ_where = 4 bits). In the red team's variant with a 5-bit
     charge per cell, 99.4% of the noise mass stays on one cell and wreck-to-build is about 1 : 1.25. Splitting one
     cell's move across several acts stops paying once the charge exceeds about 0.3 bits.
2. **Agent spam through the per-agent 4 Hz cap, once summons are free.** Measured above (8.2 Hz against 3.4 Hz).
   **Stopped by** two-level selection with a per-deity cap, plus the agent limit.
3. **Sandbox denial of service.**
   - Summon churn at about 208 runs per summon.
   - Free limit-hitting acts that dodge the futility memo through `random()`.
   - **Stopped by** the summon rate limit and the measurement cache, the failure cooldown, and keeping the Python
     source rule.
4. **Multiply and divide shortcuts.**
   - Net-effect pricing makes 13–58 of the 90 digit pairs cheaper by multiply than by add.
   - ×0, ×2 and ×5 wipe cells cheaply.
   - Floor division with pointwise erasure gives 9 → 1 for no erasure.
   - **Stopped by** no multiply on the beginner board; units only where mod 10 is used; division as ×u⁻¹, or floor
     division at log2 m.
5. **Wrap-around against magnitude rules.** On a dial, 9 → 0 is one step but moves a row sum by 9. **Stopped by** the
   slider (an add that leaves 0..9 fails).

Lower priority:
- **Splitting a move across acts.** It is intended play: β·W² exists to make ten small acts cheaper than one big one.
  Within one cell the location charge removes the gain.
- **Flicker wars.** Undoing a rival's +1 costs exactly what it cost them, so two opposed agents can flip a cell 5 ↔ 6
  for ever. Payoff coupling (wrecking others lowers your own multiplier) restrains it. If play-tests show it, add an
  asymmetry: reverting a cell to the value it held within the last T seconds costs 2×. Alternatives the game-design
  brainstorm also weighed: a "settled" premium on cells that have held; a surcharge for others' bits lost (it leaks
  rules unless it uses noised peer sums); paying the cell's last changer.
- **Hoarding by looking and skipping.** It is bounded by the cap today, and gone with two-level selection.
- **The noise changes character, not size.** Under distance pricing ±1 dominates the noise (69% of one-cell steps in
  the red team's 5-bit variant, against 22% today), so parity and "exactly" rules become more brittle and threshold rules more robust. That is right (they *are*
  more fragile under incremental play), but it is a `NOISE_VERSION` bump and every hold table recomputes.

## 10. Decisions for the owner (with our recommendation)

1. **Slider or dial on the beginner digits?** Recommend **slider** (9 + 1 fails). A dial is for a later "clock" board
   whose rules are circular.
2. **Accept the 4-bit "which cell" charge, so a +k costs 4 + 1.585·k bits?** Recommend **yes**. Strict proportionality
   (no charge) is either not a code or 3.5× dearer at +5, and the red team's worst exploits follow from it.
3. **Multiply and divide on the beginner board?** Recommend **no**. Units-only mod 10, or a prime clock board, later.
   Int gets the magnitude code (×m: λ·log2|m|).
4. **Drop read cost, with two-level selection and a failure cooldown in the same release?** Recommend **yes**.
5. **Drop the summon price, with a 4-agent limit on beginner setups, a summon rate limit and a measurement cache?**
   Recommend **yes**.
6. **Colours keep a "set"** (a categorical change, log2(C − 1), no erasure term)? Recommend **yes**, and rainbow6 stays
   categorical unless kids are meant to think in "rainbow steps".
7. **Position moves (rotate, swap) stay priced by the value changes they cause?** Recommend **yes**, for now.
8. **If the game feels too fast, lower power rather than raising λ?** Recommend **yes**: λ comes from the code, power
   is the scale.

## 11. Migration plan

The rules of CLAUDE.md apply throughout:
- live games keep ticking across every deploy;
- stored settings widen before they narrow;
- a new cost model is a new `EVENT_LOG_SCHEMA` (replay plays recorded costs back, never recomputing old games);
- hold tables are keyed by `NOISE_VERSION`.

**Stage 1: feel it on dev** (the smallest step that changes play).
- A room setting `costModel?: "set-v1" | "distance-v1"`.
  - Optional; absent reads as "set-v1", so it is a widening and needs no migration.
  - Validated in game-core settings and SETTINGS_DOCS, with "distance-v1" allowed only on Grid with the mono palette.
- Under "distance-v1":
  - Grid's `callWork` prices a changed digit 4 + 1.585·|Δ| (slider);
  - `step_rank` and the new `add(cell, k)` fail out of range;
  - `write` stays as a composite priced by its net effect.
- The noise gets a "distance-v1" branch, and `NOISE_VERSION` includes the cost model.
- The event log bumps its schema for batches priced under "distance-v1". Replay needs no change.
- In the same stage, behind the same setting or globally:
  - READ_PRICE = 0, with two-level selection, the failure cooldown and a lower `interactionRateHz` on that seed;
  - the summon price at 0 with `maxAgentsPerGod` = 4.
- A dev seed "First steps (distance)" lets the owner play it next to the current one.
- Deletes nothing.

**Stage 2: the declarative recipe** (`lib/game-types/src/structure/`).
- Land it beside the existing code, with a test that it reproduces today's `callWork` when configured with today's
  codes.
- Then flip Grid, Int and string to the derived functions with λ*. Each flip is a new cost-model id, never a
  recomputation of an old game.
- Fix the Int multiply code (it is not a prefix code).
- Deletes `gridElementaryCosts`, `digitAddCost`, `multiplyCost`, `stringElementaryCosts` and the three hand-written
  noise samplers. `MAX_MULTIPLIER` goes too.

**Stage 3: make it the default.**
- The seeds switch to the new model, and rule-difficulty gains `rateE`.
- The beginner pool is re-balanced in bits per energy.
- The UI text changes:
  - the spend line reads "Spent 310 bits on 25 changes; waited 40 times";
  - the summon card loses the price;
  - the rules, primer and skills say "looking is free; a one-step nudge is the cheapest change".
- Deletes the κ section of energy-model.md, `read-price.test.ts`, the summon-price path in `pricing.ts`, and (once no
  live game uses them) the deity account's summon role and `startingEnergy`.

**Stage 4: narrow.**
- Once dev and production report every live game on the new model, a later PR removes "set-v1" from the setting's union.
- The event log keeps old schemas as history.
- Removing `breakdown.read` from stored agents follows the widen → migrate → narrow steps of energy-model.md §9.

## Appendix: running the prototype

```
pnpm --filter @workspace/game-utilities mutation-cost --tables     # every table in §2–§4 (instant)
pnpm --filter @workspace/game-utilities mutation-cost --balance    # §8 (about 15 s; --starts N, --policy, --beta, --rules FILE)
pnpm --filter @workspace/game-utilities test                       # includes test/mutation-cost.test.ts
```

The scratch brainstorms (information theory, game design, generalisation, red team) were merged into this document;
where they disagreed (wrap, mainly), §8's measurement decided.
