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
   Bits are rarity under the law, so relabelling a main part into levels (triangular or any other) changes nothing a
   player earns. A climb bends only if each next unit is itself rarer under the law or costs more to reach (15 Nov:
   Smooth Intercept's triangular levels left +1.5 bits per stretch by 3, straight for 9 steps).
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
   **An adversary must oppose on the size or the direction of a shared reading, not only on the number's class**
   (15 Nov). Readings round, so a class conflict between two readings dissolves. A smooth y-intercept and a crossing
   that rounds to a big prime coexist through the gradient: m = −c/X need not be whole, so neither number constrains the
   other's factors. Size does not dissolve. Almost every dealt line rule rewards a big number (crossing, area,
   distance², intercept), and on line-q's PMI matrix the prime-ending rules are aligned with the families named as
   their adversaries: Prime Landing +2.1 with Whole Crossing and +1.2 with Smooth Intercept. The pool's real adversary
   of large primes is Prime Gradient, by size: a steep line shrinks the crossing, the area and the distance (mean PMI
   −2.33). So a new adversary should reward a small reading, or the opposite direction of a shared one. A class adversary
   is at best a weak one, even on the same reading: Whole Crossing reads Prime Landing's own crossing, and the two still
   measure +2.1, because both pay for size. Check every adversary on the PMI matrix; never assume one.
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
| 2 | Is the ladder climbed all game, in play? | Without parameter redraws, in a 600 s game against two other seated rules, most seats (about two in three) are still stepping up their main part in the last third, and few (under one in ten) sit on a level they reached in the first two minutes. These figures guide judgement; they are not a gate to tune against. Report levels climbed and bits per level too, but do not tune the level size to hit a count: splitting a level into finer grades changes nothing a player feels. A ladder that exists but is not climbed fails (the first redesigned Prime Landing: rungs ten units apart on one coefficient, 0 to 3 steps up in 80 games, because each step wrecked the other seats' bits). Rungs should be one small move apart, or joined by a representation shortcut. |
| 3 | Is the tie-breaker defined by the main part's value? | Show two main-part levels whose best tie-breaker states differ, and that stepping up the main part loses tie-breaker bits. |
| 4 | How many dealable instances? | Count of dealt parameter sets within the equal-opportunity band; at least 4. |
| 5 | Are instances perpendicular? | Pairwise dependence within the family and against the pool (the PMI table). |
| 6 | Which families oppose it? | At least one named family in tension, from the tension matrix. |
| 7 | Does it add a goal the pool lacks? | Name the kind of number the main part rewards (large primes, squares, smooth numbers, many small factors, digit patterns, sizes) and the form of the tie-breaker, and count the dealt families that already share each. No more than three dealt families share one kind, and a new family never copies another's tie-breaker form. On 15 November five of eleven dealt line rules read "some reading rounds to a prime ending in k; tie-breaker: that prime minus 1 shares a factor with the y-intercept": each passed rows 1 to 6 alone, and together they failed principle 6. |
| 8 | What does it reach? | Starter's bits unopposed and opposed; nothing in the hundreds. |
| 9 | Is it balanced and does it keep moving? | Mean gain against the pool's best and worst; share of objects moving in the last third. |

## Who is responsible

The coordinator. Worker sessions design and measure; the coordinator checks each family against this file before it
is dealt, re-reads this file at every check-in, and at each check-in audits one dealt family by reading its rule card
as a player would. A conflict between two principles, or between a principle and something else the owner cares
about, goes to the owner as a dilemma; it is never settled quietly.
