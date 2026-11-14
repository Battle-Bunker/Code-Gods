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

19. On requiring consistent prices (each mutator may carry a handling fee shared by a move and its inverse; the
    asymmetric part comes from one energy function of the line): "I'm comfortable with this constraint. If you still
    think this makes sense after your analysis, implement it. Please consider whether the analytical approach can
    actually fully substitute for the simulation one (tested with the simulation method at lower rungs). Don't be
    attached to the simulation method just because we thought of it first and decided on it before thinking of the
    chained analytical approach." (The study: [analytic-calibration.md](analytic-calibration.md).)

20. On exact scoring (relayed by the coordinator, 14 November): "Development of exact scoring for specific rules should
    never block anything else. That's mere configuration of optional additional utility functions. We can keep
    augmenting our repertoire of available utility functions in background parallel threads indefinitely without this
    work even being part of any dependency tree." (So a family lands with whatever valuation it has, exact, hybrid or
    capped; an exact sum arrives later in its own PR and changes only artefact numbers; a family with a usable ladder
    is never held back as undealable because its exact sum is not written yet.)

21. On the agent economy (relayed by the coordinator, 14 November): "I do think modifying an existing agent should cost
    only what one changes … It should be quite tractable to pull power away from one's agents to quickly supply the
    God itself with plenty of energy for spawning and then return that power back to a new allocation among agents
    including the new one(s)."

22. On mixed calibration (relayed by the coordinator, 14 November): "I don't want to give up the affordance for grid
    rules like these [overlapping windows, rows with columns, regions and paths, histograms]. If we can calculate
    calibration stats for such rules accurately enough using simulation, then keep them. I don't mind if we need a
    mixture of analytical and empirical methods to calculate our scoring calibration stats across the diversity of
    rules for different objects we might want, as long as it is tractable via some method to reach principled
    conversion from utility to energy/bits/probability." (So a rule with a certified empirical ladder is as good as an
    exact one for a pool.)

23. On threshold ladders (relayed by the coordinator, 14 November): "I hate the idea of utility functions that have a
    finite number of discrete buckets … I want rules like primary utility is negative distance of c to the nearest
    integer (closer to exact is better) and secondary is the smallest prime factor of that integer (big primes better).
    Why did you depart from that sort of pattern that I obviously wanted and how have you actually turned utility
    values into a discrete set of finite steps?" (The thresholds were an artefact of the restricted-walk estimator,
    which could value only a finite list of level sets. They are removed: a layer is a utility into a totally ordered
    set; a state's value is −log2 π{states whose (primary, secondary) is at least as good}, at its actual score.
    This supersedes the coordinator's calls (f), on rungs, and (g), on caps.)

24. On unique objects (relayed by the coordinator, 14 November): "Agents should always be dynamic hill climbers.
    Objects must be unique so you can't thrive by finding one optimal object state and replicating it and anyway it's
    really expensive to move objects a long way in a single turn now, by design, so all strategies should be
    incremental hill climbing towards profitable combined states." (Within a game no two objects hold the same state;
    spec §2.6. It withdraws the architect's call that there is no uniqueness constraint.)

25. On shortcuts through representations (relayed by the coordinator, 14 November), asked whether a swap of 0 and 9 on
    a grid should cost at least nine unit adds on each cell: "No. Obviously not. We want there to be shortcuts to
    certain states via mutators that operate in some representations. That makes the state space more interestingly
    shaped in terms of cost function topology and more like real life exploration of problem spaces." (The far-move rule
    is about the size of an additive change in one act. Mutators that operate in another representation (swap, rotate,
    reverse, spin, mirror, stretch by a factor) are intended shortcuts, priced as choices or by digits, never by the
    unit path. It cancels the coordinator's trial of path-priced grid choice moves.)

## Coordinator's calls (provisional: the owner has not ruled on these)

- **(a) No detailed balance requirement.** *Withdrawn 14 November by owner decision 19: every price list is now an exact
  potential, gated by lib/v2-linear's potential test.* The original call: Mutator price lists are NOT required to satisfy detailed balance; value is
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

- **(h) The first summon opens with the Simple starter** (14 November, provisional; the owner is told and can reverse
  it). A beginner's first summon opens with the points-aware Simple starter, not the Example, on lines and grids. The
  Example stays in the forge as "see how a rule is climbed".
- **(i) Practice deals do not leave the human out** (14 November, provisional; the owner is told and can reverse it).
  In practice games only, the deal must not make the human the odd one out. The human's rule is compatible with at
  least one practice partner's rule, by the agents session's compatibility table (rule-compatibility.md), and two
  partners who share a preference the human's rule conflicts with are avoided. Real multi-player deals are unchanged,
  pending the owner's decision on compatible dealing. (Playtest round 4: Opposite Nines scored 509 against about 4,100
  when both partners' rules liked the same grids.)

## Coordinator's calls under the owner's delegation (14 Nov)

The owner delegated the open rule calls to the coordinator (CLAUDE.md, #589): the old design is the default and "a
strong guiding light, not gospel"; the coordinator may trial changes that make the game more dynamic and declares them.
The owner also said: "We want to be able to hill climb a combined landscape that improves several rules at once. We
just want it to be hard to find really high peaks in that landscape." Each call is marked RESTORE (the old design comes
back) or TRIAL (a declared experiment, measured and reported).

1. **RESTORE** hold rarity and defence goals as v1 designed them, adapted to v2 values (hold: the stationary walk's own
   proposal kernel as the noise, m = players − 1; defence: a value function per defence family, n = s⁺ − w·(h − E_π h)).
2. ~~TRIAL: grid moves priced as choices pay at least the fee of the equivalent unit path.~~ Cancelled by the owner's
   decision 25: representation shortcuts are wanted and stay priced as choices.
3. β stays 0.05 for now; the collapse and freeze measurements include β so the coordinator can choose with data.
4. Kept: the coefficient box and births from the stationary law.
5. Several lines per object stays provisional and undealt.
6. Line rules: rationals are the default (decision 2) and Ruler, Exact Change and Pythagorean Area are restored
   (decision 22); the current pool is not polished further until the line-patterns proposals arrive. The tie-breakers
   sessions replaced are listed for a choice in `tie-breakers-replaced.md`.
7. The landscape analysis's collapse check (its five tests) runs as a nightly script printing a table per variant; it
   is expected to fail on lines today and does not block merges.

## The architect's judgment calls (provisional, recorded so later sessions can revisit them)

Each is decided in [spec.md](spec.md); the section is given.

- *Withdrawn 14 November by owner decision 24.* The original call: "No uniqueness constraint between objects: two
  objects may hold the same line (spec §2.5)."
- Births are drawn from the stationary law itself, by a seeded birth walk (spec §2.4), so "b bits" keeps meaning "one
  newborn object in 2^b is this good".
- Hold rarity and defence goals are not carried into v2's first version (spec §8). Value is the stationary-law bits
  alone; hold rarity is on the experiment list.
- A query's unit is one representation (all its elements) or one element of it, priced by its read length; asking the
  host for one's own rule score is a read of the representations the rule depends on (spec §6.2).
- The sandbox for v2 is a copy of `lib/game-runtime` with a synchronous host channel added (spec §6.5), not a change to
  the old runtime.
