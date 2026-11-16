# The energy cost of a move: an information-theory-first derivation

Analyst note, 16 November 2026 (Melbourne). Clean slate: the existing cost code and docs were not read.
Labels: **[construction]** true by construction; **[numbers]** from the worked table (parameters as chosen
below, nothing simulated); **[conjecture]**.

## The common ingredient: information size of a state

Every lens shows a parameter as a reduced rational p/q. Its **information size** is
H = log2(1 + |p|) + log2(q) bits, roughly the bits a universal integer code spends writing it down.
H is the same number whichever lens computed p/q, so it is representation-neutral. Its scale is set by the
integer lattice, not by a free parameter. Gravity in every candidate below is a pull toward small H.

## Candidate 1: relative entropy against a falling reference walk (recommended)

**Idea.** Left alone, an object takes a random walk in H that drifts *down* by g bits per act. Each step is
Gaussian, which is the maximum-entropy choice once the mean square stride is fixed. An agent's act costs the
**surprisal** of what it did under that passive dynamics: the bits to name the move, plus the relative
entropy (KL divergence) of forcing the walk to step ΔH instead of −g. This is Todorov's and Kappen's
"control cost = KL(controlled ‖ passive)", the Girsanov/Onsager–Machlup action. Landauer turns bits into energy.

**Formula.** E = ε · [ log2 N + (ΔH + g)² ]

- ε: energy per bit (the Landauer price kT ln 2, here 10).
- N: number of distinct moves the agent chose among in this act (mutator × lens × parameter; about 64 for a
  line, 8 kinds × 120 pairs for a grid swap).
- ΔH: change in information size of the parameter, in the lens the move used (0 for moves that keep sizes).
- g: gravity, the passive fall in bits per act (here 1). The stride is fixed at one bit, so the law has two
  parameters: ε and g.

**A physicist reads the same line** as work = free-energy change + finite-time dissipation. Expand:
(ΔH + g)² = ΔH² + 2g·ΔH + g². The ΔH² term is the dissipation of moving a distance in one unit of time, so
k acts cost about 1/k as much: big steps are dear [construction]. The 2g·ΔH term is a potential linear in
bits, so in raw numbers the force is about 1/x: gravity that attenuates [construction]. The g² term is the
cost of holding against the fall; a drop of exactly g per act is free. These are one law, not three rules.

**Properties.** By construction: 1 (two parameters, one line), 2 (only bits enter; a raw number enters only
through its log), 3 (rises cost more than equal falls, by 4g·|ΔH|), 4 (best climbing stride costs a constant
energy per bit, about 73 [numbers], so one income buys about 34 doublings with no ceiling), 5 (for steps of
more than a fraction of a bit), 6 (same law in every lens; the lens decides ΔH, so lenses are different-priced
routes, and symmetry moves such as mirror and swap keep H and cost only the choice bits), 8 (a fine fraction
is a high-H state; 1/97 and 1/100 cost alike), 9 (a grid swap has ΔH = 0: choice bits plus g²).
Partly: 10. The control-cost/KL and work-plus-dissipation readings are real, but "Gaussian in bits" is a
modelling choice. Fails or bends: falls are not free. Dropping far in one act costs (D − g)², so vandalism is
cheap only at the natural fall rate. That suits locks, but it is a choice. At large x, an additive step of
a few units is a tiny move in bits, so 1 + 1 + … in separate acts is dearer than one act: superlinearity is
in octaves, not in raw units. Scale invariance requires that.

## Candidate 2: Shannon's power-limited channel, one use per act

**Idea.** An act is one use of a Gaussian channel. The bits it must carry are the move's choice bits plus
the new information it creates, max(0, ΔH). Information already present is destroyed for free, so falls carry
no ΔH: symmetry of information gives gravity. Energy to send I bits in one use is Shannon–Hartley inverted.

**Formula.** E = ε · (2^((log2 N + max(0, ΔH)) / b) − 1), with ε the noise energy and b the bits per use
(here ε = 2, b = 1.5).

**Properties.** As the bits per use go to zero, the energy per bit tends to ε·ln2/b, the Shannon limit, which
has the same form as Landauer's bound. That is beautiful [construction]. It gives 2, 3, 4 and 5 by
construction, and destruction is cheap. **Fails 8 and 9 badly:** the exponent makes fine fractions and choice
bits ruinous (+1/97 costs about 13,000; a swap costs 192). It is very sensitive to b.

## Candidate 3 (rejected foil): Bennett's information distance

E = kT ln2 · (K(after|before) + K(before|after)), the reversible-computation cost of converting one state into
another. It is symmetric, so it fails 3. It grows like the log of step size, so it fails 5. It is useful only
as the lesson that **code length alone is sublinear in step size**. Superlinearity needs a time or channel
cost on top, as in candidates 1 and 2.

## Worked numbers (energy; income about 2,500)

| Move | C1 | C2 | Move | C1 | C2 |
|---|---|---|---|---|---|
| +1 at 10 | 73 | 32 | ×2 at 10 | 97 | 47 |
| +10 at 10 | 97 | 47 | ×7 at 10 | 196 | 109 |
| +97 at 10 | 245 | 145 | ×97 at 10 | 617 | 632 |
| +1000 at 10 | 626 | 650 | ×2 / ×7 / ×97 at 1000 | 100 / 205 / 637 | 49 / 115 / 673 |
| +1 / +10 / +97 at 1000 | 70 / 70 / 73 | 30 | +1/97 at 10 | 2,038 | 13,400 |
| +1000 at 1000 | 100 | 49 | +1/100 at 10 | 2,063 | 13,955 |
| +1 … +1000 at 10⁶ | 70 | 30 | +1/97 at 10⁶ | 2,076 | 14,260 |
| 10→1010 in one act | 626 | 650 | 1010→10 in one act | 365 | 30 |
| 10→1010 in ten acts | 958 | 471 | 1010→10 in ten acts | 697 | 300 |
| grid swap | 109 | 192 | best climb per doubling | 73 | 39 |

**Reading the table.** In C1, ten acts of +100 from 10 cost more than one act (958 against 626), because the
choice-bit floor (60) is paid ten times. The quadratic saving shows only with equal-*octave* strides: five acts of about 1.3 octaves take
10→1010 for 587 [numbers], a modest saving over 626, because the floor eats most of it. So "many small steps are cheaper" holds for steps
measured in bits, not in units. That is the honest scale-invariant reading. If the owner wants it in units,
the floor log2 N must shrink, for example by counting choice bits once per game per object rather than once
per act [conjecture].

## Recommendation, and how it could be wrong

Pick **Candidate 1**: cost = Landauer price × surprisal of the act under a falling Gaussian walk in
information size. It is one line with two parameters (ε, g). Every required property follows from it, and it
reads as KL control cost to an information theorist and as work plus dissipation to a physicist.

How it could be wrong:

- H per parameter is a proxy for the object's description length. A lens could raise the object's true
  information while lowering the lens parameter's H; it should be checked against an object-level H.
- The choice-bit floor dominates small moves and makes N's definition matter more than it looks.
- Precision is steep: about 2,000 for +1/97 in one act. Perhaps right, since fine fractions are rare states,
  but it is unmeasured against utility.
- Falls cost money; the owner may want cheaper destruction (Candidate 2's one-sided rule).
- None of these numbers has met players. ε and g are dials, and "playable" here means only one example
  income.
