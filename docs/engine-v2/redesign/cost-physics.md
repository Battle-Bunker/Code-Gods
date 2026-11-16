# The cost of a move: a physics-first derivation (analyst note, 16 November)

Written from a clean slate; the existing cost code and docs were not read. Numbers come from a 40-line throwaway
script with the parameters stated below. Claims are labelled: **by construction**, **computed** (only for the
moves in the table), or **conjecture**.

## The common coordinate: height in bits

Every candidate measures a state by its **height** H, the bits needed to write it down. For a rational p/q in lowest
terms, H = log2(|p| + q) (an integer n has H = log2(|n| + 1)). This is, up to a constant, the *arithmetic height* that
number theorists use as the size of a rational. A move's **rise** is s = H(after) − H(before), in bits. Three facts
follow by construction: s depends on relative size (adding 1,000 at 1,000,000 is a rise of 0.001 bits, at 10 it is
6.5 bits), so no raw magnitude appears; a finer denominator is a rise, so precision costs bits; and a doubling is
always a rise of about one bit, which is what makes "constant energy buys constant doublings" possible. Each
candidate prices s in the lens the move is made in; what the move does to other lenses is free (the shortcut).

## Candidate A: rapidity (special relativity)

**Metaphor.** A rise is a boost: scaling a number by r is a Lorentz boost with rapidity η = ln r, and rapidities add
as relative growth does. Kinetic energy at rapidity η is m(cosh η − 1); gravity adds the potential g·s.

**Formula.** cost = m(cosh(s·ln 2) − 1) + g·s, floored at 0. Note cosh(ln r) − 1 = (r − 1)²/2r, a pleasing closed form.
m: inertia (energy scale); g: gravity per bit. Here m = 20, g = 8.

**Gives.** 2, 4, 5 and 7 by construction (superlinear for large steps; exponential in s). **Fails.** 3 needs a floor
(descents would pay out), 6 because a multiply is the same boost as the equivalent add (×97 costs as much as adding
960, no shortcut), 9 (a swap has no rapidity), and 5 overshoots: cosh grows so fast that one-act jumps of over 6 bits
become unaffordable, which flattens the landscape into small-step crawling. The metaphor is real mathematics but
forced as physics: nothing here moves at a speed.

## Candidate B: the surprisal of the move under thermal gravity (recommended)

**Metaphor.** Left alone, an object jiggles: each act it takes a random step in height, with a drift downward
(gravity). Making it do something improbable costs energy in proportion to how improbable it is: cost = kT × ln(1/P),
Boltzmann's law, which is Shannon's surprisal priced at Landauer's energy per bit.

**Formula.** cost = ε · log2(1/P(move)). For a change in height (adding, multiplying in its own lens), the jiggle is a
Gaussian of width one bit with drift w, so cost = ε·(s + w)²/(2 ln 2). For a discrete move (swap, mirror, round,
which pair, which digit) P = 1/N over its N choices, so cost = ε·log2 N. A multiply by f draws its factor from the
universal prior on integers (Elias code length L(f)), tilted by gravity: cost ≈ ε·(L(f) + s/2).

**Parameters.** ε: energy per bit (the temperature; here 15). Gravity λ: the drift is w = λ·(ln 2)/2, chosen so the
object's resting distribution is 2^(−λH), the universal prior; λ = 1 here. The kick width (one bit per act) is the
unit, not a free parameter.

**Gives.** All ten by construction except two partial ones. Expanding the square, the cost is drag (s²) plus a
gravity term (λ·s, exactly the potential difference by detailed balance) plus a small fee: gravity is not a rule but
the drift, and cost is never negative because a probability never exceeds 1 (no floor). Splitting a rise S into n
acts costs n·(S/n + w)², which falls toward λS: big steps are superlinear (5), and in the limit the cost is linear
in bits, constant per doubling, so magnitudes grow exponentially with steady spending and never hit a ceiling (4).
Grids and discrete moves use the same law (9). This is the Onsager–Machlup action of a diffusion in a field, and
also the large-deviation rate of a random walk: both the physicist and the information theorist recognise it (10).
**Partial.** 8 is too strong: adding 1/97 at 10 rises 6.6 bits, as costly as adding 960. **Partial.** 7 depends on
how many acts a game holds (conjecture: at ~100 acts, a doubling at 20 to 30 is playable).

## Candidate C: Landauer's description length (information first)

**Metaphor.** Writing a bit costs kT ln 2. An act costs the bits to describe it (Elias length of the amount added, or
log2 N for a choice) plus gravity λ·s.

**Formula.** cost = ε·(L(move) + λ·s), floored at 0. Here ε = 15, λ = 1.

**Gives.** 1, 2, 8, 9 and 10 cleanly. **Fails** 5, fatally: description length is logarithmic, so one act of 1,000
(16 bits) is far cheaper than ten acts of 100 (11 bits each). Every pure information-cost law is subadditive in this
way; **superlinearity must come from physics (finite-time dissipation), not from code length.** It also prices adding
1 at 1,000,000 the same as at 10, which breaks scale invariance (4).

## Worked numbers (energy; income about 2,500 per game)

| Move | B (pick) | A | C |
|---|---|---|---|
| add 1 / 10 / 97 / 1,000 at 10 | 2 / 18 / 144 / 510 | 1 / 12 / 106 / 951 | 17 / 134 / 214 / 338 |
| add 1 / 10 / 97 / 1,000 at 1,000 | 1 / 1 / 2 / 20 | 0 / 0 / 1 / 13 | 15 / 120 / 167 / 255 |
| add 1 / 10 / 97 / 1,000 at 1,000,000 | 1 / 1 / 1 / 1 | 0 / 0 / 0 / 0 | 15 / 120 / 165 / 240 |
| multiply 10 by 2 / 7 / 97 | 67 / 95 / 213 | 12 / 68 / 915 | 74 / 115 / 262 |
| add 1/97 at 10 | 522 | 1,004 | 279 |
| 10 to 1,010: one act / ten acts | 510 / 200 | 951 / 142 | 338 / 1,748 |
| 1,010 to 10: one act / ten acts | 413 / 102 | 847 / 55 | 142 / 1,552 |
| grid swap (one of 120 pairs) | 104 | undefined | 104 |

## Recommendation, and how it could be wrong

Pick **B**: one law (energy = temperature × surprisal), two parameters (ε, λ), and gravity, superlinearity, scale
invariance and discrete moves all fall out of it. Multiply is a true shortcut for big jumps (×97 costs 213, adding
960 costs 510) and a poor deal for small ones (×2 costs 67, adding 10 costs 18): a cost topology, as wanted.

How it could be wrong:
- **Too-cheap tails** (computed): near a million, any additive step under ~1,000 costs about 1. Fine-tuning large
  numbers is nearly free. If rules reward exact digits of big numbers, that is a one-step optimum; the fix would be
  to make the landing cell, not just the height, carry surprisal, at the cost of a less clean law.
- **Precision is height**: fine fractions cost as much as huge jumps. Defensible in information terms, but it may
  starve rules about gradients like 3/7.
- **Each mutator needs its own jiggle distribution** (Gaussian for add, universal prior for multiply, uniform for
  choices). That is one law with several kernels, and choosing the kernels is design, not physics. A critic may call
  it a recipe in disguise.
- **Parameters unverified**: ε = 15, λ = 1 are picked to fit one guess at acts per game; no game has been simulated.
- **Height ignores sign**: a move from 10 to −10 rises 0 bits. Crossing zero should be priced as descending to 0 and
  climbing back.
