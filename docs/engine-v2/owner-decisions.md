# Engine v2: the owner's decisions (14 November 2026)

These decisions override the brainstorm documents (`docs/brainstorm/`, pull requests #343 to #347) and anything in the
existing code. The specification that follows from them is [spec.md](spec.md).

## The owner's decisions, verbatim

1. "the object is a unique line and every representation of the equation is just a different representation. Rules
   can operate on well defined algebraic representations of the line."
2. "We want object variants with parameters like number domain, but note that we have to be able to represent
   coefficients of different algebraic forms of the same line so we probably can't go simpler than rationals."
3. "I don't care about throwing away prior work. It will still be available in git. You have a burdensome bias towards
   attachment to keeping prior work and backwards compatibility that tends to accumulate mess and technical debt. Try
   to adjust against that bias for this project. We are in rapid exploration mode which is cheaper and faster than
   ever with AI coding ... Being encumbered by backwards compatibility baggage and attachment to prior work is one of
   the biggest hazards to our rapid exploration priority."
4. Scoring calibration is empirical: "I'm happy with a config parameter for default compute investment in empirical
   scoring calibration figures. We probably want to bound compute time on new rules and strive for convergence to an
   error margin within like 2% and stop there. But if a rule proves hard to reach convergence on it probably warrants
   being put on a backlog as too hard during the process of brainstorming rule ideas. We also should strive to fit
   rules to algebraic curves where possible and then snap to those curves once we're confident that it's roughly
   correct (or analytically correct, which frontier AI might often be able to prove)."
5. On a line having few degrees of freedom: "We want collisions of values. That's the whole point of the game. We
   eliminated colour from the beginner grid game to increase concentration of interest within one dimension."
6. "computation within an agent isn't free, it's time capped and reads and writes cost something. Querying an object
   in a given representation should cost separately but an agent can spend complexity and per turn time cost on doing
   its own conversions if it wants."
7. "let's not attempt data defined rules. Happy to require deploys to add object types and variants and rules and
   such. There's plenty of runtime exploration available in configuration space defined by those atoms."
8. "I actually suspect that rewriting the engine from a fresh slate will likely make sense and then we port the old
   object types and rules onto the new engine progressively once we've built it cleanly for the linear equations use
   case."
9. Why the game teaches when AI writes the code: "it's the negotiation among players that rewards human familiarity
   with the technical domain ... the comparative advantage comes from carefully coordinating with other players to
   find agents that efficiently pursue states that meet an intersection of value among the cooperating players'
   utility functions while collectively defending those objects against damage by non cooperating players ... The
   human player does the negotiating and must be able to understand their own rule well enough to know how it can
   synergize with others' rules in order to pitch cooperation strategies and they need to be able to communicate what
   behaviour they want in their agents after that negotiation to their AI assistant."
10. Scoring direction (the owner's idea, verified in #347): value comes from the STATIONARY law of the random walk of
    priced mutations ("inverse PageRank": energy = minus log2 of stationary probability; a utility level's value =
    minus log2 of the stationary mass of states at least that good), estimated by sampling states within each utility
    level, perturbing them, and stitching level-to-level transition rates into a global mapping from utility to bits
    (full level matrix / eigenvector, not only adjacent ratios). The owner wants mutator pricing to matter to value and
    accepts that the same state change costs different amounts through different representations.

11. On confining prices (moving to larger or more complex numbers must cost more than coming back, so the walk has a
    stationary law and energy becomes a description length): "this appeals to my intuition. I don't care if adhering to
    this principle reduces our options in some places. This sounds right. It lets us have infinite state spaces with sort
    of gravitational centres that are expensive to depart from which naturally provides dimensions to define higher
    utility/energy with respect to as well."
12. On resolution (rule tops of 2–5 bits mean the rules are not creative enough, not that the object is too small):
    "Consider secondary preferences like we started designing for grids. For example primary utility is distance of c
    from the nearest integer and secondary is the size of the smallest prime factor of that integer. Or primary is
    distance of area with origin to a perfect square and secondary is the number of prime factors in the root of that
    nearest perfect square."
13. "binary decisions are worthless for extending the ladder. Require all rules to be continuous"
14. "optimise for the primary rules being maximally accessible to 12yos currently learning a standard linear equations
    curriculum at school. Secondary rules can be more advanced. Don't include tertiary rules for the beginner set."
    Clarified the same day: "I said I don't want tertiary preferences but I will want several secondary rule candidates
    within each family." (A family declares one primary and a list of alternative secondaries; a dealt rule is the
    primary plus exactly one of them.)
15. "Keep a dedicated branch for wherever you reached on develop before starting on the new engine in preparation for
    pushing this new work to develop that should throw away most of the code and any trace of the integers and strings
    objects and the old engine and anything else older than that that we don't need anymore." (The branch is
    `archive/engine-v1`, at 1018e913.)
16. "It's essential that we keep the architecture that ensures that every single operation is available to an AI
    assistant whether embedded or via the remote AI assistant delegation protocol as well as via the searchable command
    pallete. There should be a single dynamic directory of affordances available by context that generates each of
    those interface surfaces DRYly."
17. On number codes: "Use mixed costing now. I like that." (Additive moves are priced by steps, in proportion to the
    size of the amount added, as the owner first asked: "Adding to a number should have cost proportional to the
    absolute value of the amount added"; multiplicative moves by digits, about the code length of the factor; so large
    composites are cheap, large primes are dear, and a number's energy is roughly its shortest arithmetic description.)

18. On the bid phase: "I want that still in the rebuilt app." (Integration plan §5.9 ports bidding onto v2 rule
    families in M3: a bid names a family; the dealer draws the winner's parameters and tie-breaker.)

## Coordinator's calls (provisional: the owner has not ruled on these)

- **(a) No detailed balance requirement.** Mutator price lists are NOT required to satisfy detailed balance; value is
  whatever the stationary law of the actual priced walk gives, and the cycle test from #347 is reported per price list
  as a diagnostic, because requiring consistency makes prices drop out of value, which is the opposite of what the
  owner asked for.
- **(b) Confining prices.** Promoted to the owner's decision 11 (14 November): confinement is a principle of every v2
  price list, bounded variants included.
- **(c) Lines per object.** "Lines per object" is an object-variant parameter, default 1. #347 found one line holds few
  bits (rule tops 2–5), so the spec must say how rule-score ladders, rational domains and multi-line variants give
  enough resolution.
- **(d) One implementation, on the host.** Representation queries are priced host calls made by the agent, so rule and
  representation logic lives once, in TypeScript on the host, and agent languages need no mirrored copy.
- **(e) A clean break.** No compatibility with stored games, old calibration tables, old settings or the old event log;
  v2 lives beside the old engine in new packages and new Convex tables until it replaces it, and nothing in v2 may
  import from the old rule/object/annotation/calibration libraries (copy and clean what is good).

- **(f) No gating** (14 November, after decision 14's clarification): a score is a plain lexicographic tuple; the
  secondary orders lines at every primary level. Value follows the order (the coordinator, 14 November: "the joint
  ladder is the set of (main level, tie-breaker level) pairs in lexicographic order, so improving the tie-breaker at any
  main level raises bits"): spec §4.4's joint ladder, the tie-breaker coarsened below the main top (never to one level)
  and in full at it. See spec §4.2 for the one place the order matters (saturation of a "bigger is better" primary).
- **(g) Capped ladders, not a backlog** (14 November, provisional, awaiting the owner): "a rule whose calibration misses
  only its rarest rungs is NOT backlogged. Its dealable ladder is capped at the last rung that converged to the 2%
  margin (or, where the converged rungs fit an algebraic curve well, the tail may be snapped to that curve and marked
  'fitted'); rungs above the cap score as the cap. A rule is 'too hard' only if fewer than 6 rungs converge." Built as
  the artefact's `cap`, `convergedCap`, `tail` and `dealable` (spec §7.5): the fitted tail is built for tie-breaker
  rungs at the main top. The coordinator added the same day: a pairing whose dealt top is under 4 bits is not dealable.

## The architect's judgment calls (provisional, recorded so later sessions can revisit them)

Each is decided in [spec.md](spec.md); the section is given.

- No uniqueness constraint between objects: two objects may hold the same line (spec §2.5). Each object is an
  independent universe; decision 5 is read as "rules compete on the same few degrees of freedom", which one line per
  object already gives.
- Births are drawn from the stationary law itself, by a seeded birth walk (spec §2.4), so "b bits" keeps meaning "one
  newborn object in 2^b is this good".
- Hold rarity and defence goals are not carried into v2's first version (spec §8). Value is the stationary-law bits
  alone; hold rarity is on the experiment list.
- A query's unit is one representation (all its elements) or one element of it, priced by its read length; asking the
  host for one's own rule score is a read of the representations the rule depends on (spec §6.2).
- The sandbox for v2 is a copy of `lib/game-runtime` with a synchronous host channel added (spec §6.5), not a change to
  the old runtime.
