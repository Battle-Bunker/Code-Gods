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

26. On maxima (relayed by the coordinator, 14 November): "I don't want a cap on coefficient size: just a cost function
    that makes larger numbers harder to reach. Ideally we want to fit curves to map utility to energy so that the
    possible energy of an object can be unbounded. I don't want Maxima anywhere ideally, but if we have to accept some
    really high maximum possible scores for some rules because they must have their utility-to-energy relation calculated
    fully empirically then I will accept this for the sake of allowing more diversity of rule types."

27. On entanglement (relayed by the coordinator, 14 November): "I want rules to be highly entangled with one another
    but it's also ok for some rule pairs to be less entangled than others. That's what creates interesting political
    structure. If a rule's primary score is based on y-intercept, though, then it might be valuable that its secondary
    adds entanglement with another aspect of the line so that it has partial entanglement with the larger body of rules.
    Note that no parameter of a line is really fully isolated though, because changes to the line via different
    mutators will have different impacts on other variables than an agent directly cares about, causing collateral
    damage to gods it is not taking care to cooperate with. For example, it might be cheaper for an agent that cares
    about gradient and a particular point on the line to rotate the line about that point (this should be an available
    mutator) rather than just changing the m argument, thereby disrupting potentially fragile structure that other gods
    cared about in the y intercept."

28. On lenses and multi-line systems (relayed by the coordinator, 14 November): "Think more creatively about other
    lenses to use for defining a line that will give us a wider variety of mutators operating through different lenses
    for changing lines and let the same project inspire new interesting rule families as well. Consider operations in a
    different basis or flips around other lines (but where it's expensive to introduce a line with lots of information
    in it from scratch in order to do so). Start up some new parallel work to design rules and mutators for two and
    three line systems, which are also within reach for bright 12yos I think."

29. On tie-breakers (relayed by the coordinator, 14 November): "Secondary rules should tie to the primary in some way
    even if they invoke an extra dimension of the object. For example, a primary that seeks proximity to integers in the
    y intercept could have a secondary that seeks to maximise the largest common factor of that closest integer with the
    floor of the gradient. That's better than a secondary that just independently wants the gradient to be close to a
    large prime." (A secondary is a relation between the primary's anchor and another aspect of the object, not an
    independent wish. Applied to every dealt tie-breaker after the rule-design session's audit.)

30. On hills and adversaries (relayed by the coordinator, 14 November): "I absolutely want bigger is better mechanics so
    there are unbounded hills to climb. We just need to make sure there are adversaries to ongoing expensive climb of
    those hills and we should create diversity of goals so that it's rare for optimising just one thing, like finding a
    large prime in the x-intercept, to straightforwardly benefit multiple rules at once. Introduce more variety of the set
    of rules so that it's harder to improve multiple rules at once with a basic strategy. Also deliberately introduce
    rules that are in tension with one another. We want rules that prefer small values and lots of prime factors instead
    of large primes and more interesting interactions like wanting high gradient and y intercept so the X intercept that
    another player wants big will be small and negative etc." (It overrules the coordinator's trial of retiring the
    magnitude tie-breakers: they stay dealt, tied to the primary per decision 29. The fix for aligned hills is in the
    pool and the deal: rules in tension, diversity of goals.)

31. On the beginner game's objects (relayed by the coordinator, 15 November): "Let's shrink object quantity for the
    beginner game to 3 and 1 spawn per 4 minutes so it ends at 5. I want to concentrate human attention more on specific
    battlefields for the beginner game." (Both beginner presets: 3 starting objects, one birth per 240 s; it replaces the
    coordinator's calls 8 and 9 on the count and births. At the beginner length of 300 s that ends at 4 objects, not 5;
    the coordinator is asking the owner whether the game should be longer.)

32. On disclosure noise (relayed by the coordinator, 15 November): "Regarding noise/blur it sounds like the mistake was
    fixing the noise offset per value and across players so that it produced a cumulative and shared bias. It seems like
    the obvious solution would be to add noise independently for every query of an object such that it's never shared
    across players and never accumulates through decisions. Querying the same object multiple times with no updates to
    it in between would return slightly different results just like measurement error. … I want noise to be a
    configurable quantity in bit variance that can include zero and it should be zero for the beginner game." (It
    replaces v1's keyed per-state draw and the coordinator's call B1. The setting is `peerNoiseVariance`, bits²: 0, 4,
    16, 64 or 256; 0 on the beginner presets, 64 elsewhere. Every read an agent makes and every paid look is a fresh
    draw. A player's reactive reads in the app are their own reading of the object at that version, independent of
    every other player's: a Convex query must be deterministic, so one reading per player per object version
    (convex/v2/disclose.ts).)

33. On free information (relayed by the coordinator, 15 November): "you have kept the update that ceases to give any
    information away for free except a coarse time grain leaderboard right? There should no longer be a common score
    broadcast per object. Every player has to spend energy on querying world state with the resolution they deem
    worthwhile given the expense of information. That's a key change we made to ensure God energy remains a crucial
    resource instead of only being needed for rare agent summons." (The exact standings every `scoreIntervalSeconds`
    are the coarse leaderboard; call 15 is now the rule. A birth stays public, as in v1's paid mode: the coordinator's
    call.)

34. On the beginner game's length (relayed by the coordinator, 15 November): "The beginner game should be 10m long".
    (Beginner presets: 600 s, 3 starting objects, one birth per 240 s, so 5 objects by the end.)

35. On paying for information (relayed by the coordinator, 15 November): "Paying for information should be intrinsic
    rather than an optional feature flag, but the weighting of cost for reading information could in principle be set
    to zero. It should have a modest value for beginner game so that querying 5 objects every second would be easily
    affordable but doing so 100 times a second would be prohibitive." (The `observation` free/paid flag goes; every game
    pays to look, at the spec's read price times a weight that may be 0.)

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
8. **RESTORE** v1 Annotated basics' beginner numbers on both beginner presets: 10 starting objects (not 24), 60 s
   planning, and the half-life end (halfLifeSeconds 300; the server session restores the hidden end).
9. **TRIAL** (declared to the owner, who wants fewer objects in the beginner game): births at 0.05/s instead of v1's
   0.1/s, about 25 objects at five minutes instead of 40. The uniqueness correction's N follows (10 + 0.05 × 150 ≈ 18).
10. The nine rational-native families set aside by the integer filter (Whole Intercept, Pell, Euclid's Long Way,
    Farey, Egyptian, Long Division, Prime Slope, Steady Gradient; Ruler and Exact Change already back) return as sampled
    families on line-q, undealt first; those that pass the collapse tests are dealt. Whole Crossing and Divisibility
    Ladder (picked because a band sum existed) stay only if they pass too. Order: after the tie-breaker restoration and
    after defence goals.
11. Hold rarity is not restored: `hold-measurement.md` shows hold is already mostly a function of bits under the walk's
    kernel (and weak), energy adds nothing beyond bits, and real opponents differ from kernel noise; the product payoff
    already prices other players' moves.
12. **TRIAL** (proposed by the lens-mutators session, agreed with the spec lead, 15 Nov; for the coordinator to declare to
    the owner): the five lens mutators of `lenses-and-mutators.md` §5 on a separate variant `line-q-lenses` (preset
    `lines-lenses`, not the default), with a **weighted "which" code** instead of the uniform log2 N: the nine share 3/4
    of the mass (log2 12 = 3.58 bits each, against log2 9 = 3.17 on line-q) and the five share 1/4 (log2 20 = 4.32 bits
    each). Motivation: a uniform log2 14 would tax every existing call by 0.64 bit whether or not anyone uses the new
    moves. Prices only: a move and its inverse are the same mutator at the same bits, so the law, and every value, is
    unchanged. Measured: how often agents use the five, and the balance and collapse runs (`lenses-and-mutators.md` §7).
12. **TRIAL** (declared, following decision 30): adversary-aware fair-aligned dealing. v1's fair-aligned dealer stays
    the base (seeded, bidding respected, the practice rule kept); the dealer minimises a table's unopposed shared
    directions (cheap moves or prime ladders along which two seated rules rise and no seated rule falls or pays an
    opportunity cost of at least twice the climbers' gain), admitting at most one weak one (joint gain under 0.1 bits per
    ⚡, a tenth of the stretch case's 1.06) and never a strong one. Step 1, measurement only: each game logs its unopposed
    directions (`unopposedDirections` in v2-agents) and the collapse check reports them; the filter is turned on when the
    pool has enough adversaries.
13. **RESTORE** "Grids · more rules" (`grids-more-rules`), a second grid setup on grid-4-d10 beside the unchanged
    beginner one: v1's coupled reward families Kings & Subjects, Stepping Stones, Mountain Climb, Uphill (v1's
    young_tableau), Staircase (staircase_climber), Magic Accountant and Fillomino, as continuous counts or distances
    (decision 23: no thresholds) with tied tie-breakers (call 14), valued by plain draws from π (lib/v2-grid
    more-families.ts; grids.md §6.3, §6.4).
14. Following decision 29 (a tie-breaker is a relation between what the main part singles out and another aspect of
    the object, never an independent wish): grid tie-breakers are tied. The seven more-rules families get three tied
    tie-breakers each. The beginner eight keep their mains, Two Pair's "pairs far apart" and Strangers' "1s beside
    bigger numbers", and get tied replacements for the 22 independent ones (primes, zeros, corners, odd, "X big"),
    which leave the dealt pool but stay in the code, undealt, until the coordinator reports the effect (grids.md §6).
13. The beginner economy at 3 Hz (decision 37): power 8 ⚡/s (was 64), fullChargeSeconds 240 (was 30, so the store still
    holds 1,920 ⚡), startingEnergy 600, β 0.05. Motive: keep energy binding per act as it was at 25 Hz (about 8 ⚡ an
    act, about 1.5 unit moves), since the owner wants god energy to stay crucial; at power 64 a seat would have about
    64 ⚡ an act and energy would stop binding.

15. **TRIAL, now the rule** (declared 15 Nov, departing from v1; confirmed by the owner's decision 33, "a coarse time
    grain leaderboard"; its `peerNoiseBits` 8 on the beginner presets withdrawn by decision 32): the published standings
    are EXACT. Standings, their history and
    the leaderboard chart are the exact totals, published together every `scoreIntervalSeconds` (batched, as v1's
    scoreboard), with `peerNoiseBits` 8 on the beginner presets; every per-object figure stays blurred with v1's floor
    at 0. v1's totals came from the disclosed sums (`disclosedTotalsOf`). Motive: a child's leaderboard must agree with
    the final result (round 10: live totals read 1.5–2.5× the final count; at σ 8 a total from disclosed sums cannot
    track it, floored or not), and a batched exact total leaks only an aggregate over all objects.
16. **TRIAL** (declared 15 Nov, departing from v1): a half-life game lasts at least a tenth of its half-life. A draw
    below h/10 is drawn again, which (the exponential being memoryless) is the floor plus one exponential draw
    (convex/v2/duration.ts). v1 had no floor: 7% of its half-life games ended within h/10, 0.7% within h/100. Motive:
    "a game that ends before anyone can act is no game."

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
