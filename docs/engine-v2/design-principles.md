# Rule design principles: the acceptance test for every rule family

The owner's design principles for rules, assembled in one place on 15 November 2026 after the owner found a dealt
beginner rule (Prime Landing: "the y-intercept as close as possible to a prime ending in 7; tie-breaker: the gradient's
smallest prime factor as big as possible") that broke two of them: its main part has a top (distance 0), and its
tie-breaker has nothing to do with its main part. Both principles had been given by the owner the day before and were
recorded in `owner-decisions.md` (decisions 29 and 30). They were recorded as a log of quotations; no rule was ever
checked against them. This file is the check.

The owner's words are in `owner-decisions.md` (decision numbers in brackets). Where this file and the owner's words
differ, the owner's words win.

## The principles

1. **Unbounded upside in the main part.** Every rule's main part is a hill with no top: there is always a better
   state, and each further step is rarer and costs more to reach. No caps and no maxima; cost alone limits a climb
   [26, 30]. "As close as possible to X" where X can be hit exactly is a bounded main part and fails.
2. **Long ladders that are hard to climb.** A main part has many distinct levels within a game's reach, and the
   next level is always harder than the last. A rule that is solved in the first two minutes fails.
3. **The secondary is entangled with the main part.** A tie-breaker reads a quantity that the main part's attained
   value defines, so the choice of main-part state decides how well the tie-breaker can be optimised, and moving to a
   higher main-part level means starting the tie-breaker's climb again [29]. The owner's example: a main part seeking
   the y-intercept near an integer, with a tie-breaker maximising the largest common factor of that nearest integer
   and the floor of the gradient. A tie-breaker that independently wants another coefficient to have some property
   fails.
4. **Highly configurable families.** Every family has substantial dealt parameters and many qualifiers (endings,
   moduli, number and type of prime factors, digit properties, squares and powers, which reading of the line) [41].
   A family with one dealable instance fails.
5. **Random instances are close to perpendicular.** Two rules drawn at random, from different families or the same
   one, should be nearly independent in what they reward, so that "two others at 20 bits" is as rare as 40 [39].
   Some pairs being more entangled than others is wanted: it makes political structure [27].
6. **Adversaries and diversity.** Every unbounded climb has rules in tension with it (small values against large,
   many prime factors against large primes, high gradient and intercept against a far x-intercept) [30].
7. **Shortcuts in representations.** Mutators that act in one representation (swap, rotate about a point, reverse,
   stretch, reflections) are priced as choices, not by path; they cause collateral damage to other rules [25, 27, 28].
8. **Energy scale.** It is hard to reach 20 or 30 bits on an object and nothing reaches hundreds. One unopposed
   player passing 20 is fine; two players each at 20 on one object is hard work [38, 40, 42].
9. **Balance and dynamism above all.** Fairness across rules, and a metagame that never settles into a static
   optimum. The exact par scores do not matter [42]. An optimum found is a bug (`CLAUDE.md`).
10. **Incremental hill climbing on unique objects.** No two objects share a state; a far additive move costs at
    least its path [24].

## The check (every rule family, before it is dealt and whenever it changes)

A pull request that adds or changes a dealt rule family carries this table filled in, with evidence, and
`lib/v2-core` tests enforce the mechanical rows.

| | Question | Evidence required |
|---|---|---|
| 1 | Is the main part unbounded? | The best state found by a long search is still improvable; no state scores the main part's maximum. |
| 2 | How long is the ladder? | Number of distinct main-part levels a starter reaches in a game, and the bits of the level it stops at. |
| 3 | Is the tie-breaker defined by the main part's value? | Show two main-part levels whose best tie-breaker states differ, and that stepping up the main part loses tie-breaker bits. |
| 4 | How many dealable instances? | Count of dealt parameter sets within the equal-opportunity band; at least 4. |
| 5 | Are instances perpendicular? | Pairwise dependence within the family and against the pool (the PMI table). |
| 6 | Which families oppose it? | At least one named family in tension, from the tension matrix. |
| 8 | What does it reach? | Starter's bits unopposed and opposed; nothing in the hundreds. |
| 9 | Is it balanced and does it keep moving? | Mean gain against the pool's best and worst; share of objects moving in the last third. |

## Who is responsible

The coordinator. Worker sessions design and measure; the coordinator checks each family against this file before it
is dealt, re-reads this file at every check-in, and at each check-in audits one dealt family by reading its rule card
as a player would. A conflict between two principles, or between a principle and something else the owner cares
about, goes to the owner as a dilemma; it is never settled quietly.
