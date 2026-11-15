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
    fully empirically then I will accept this for the sake of allowing more diversity of rule types." (Lines lose
    their 10^6 box; a value function's fitted tail is the rule past its best knot and never saturates, held between the
    law's floor and ceiling. The audit of every maximum left: docs/engine-v2/maxima.md.)

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
    the coordinator is asking the owner whether the game should be longer.) Implemented (15 Nov, after playtest round 16
    found 8 lines in one game: v1's stochastic births give a 600 s game 0 to 9 births, mean 2.5): the beginner presets
    have births on a regular schedule, birth j at j / rate (240 and 480 s), so a beginner game ends at exactly 5 objects; the
    other presets keep v1's stochastic births (convex/v2/duration.ts `regularBirths`, preset `regularBirths`).

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

36. On what agents learn (relayed by the coordinator, 15 November): "Players should still know everything their agents
    learn for free so beginners won't need to think about querying directly with their god powers to keep up with the
    state of objects." (Every act a player's agent runs on an object, committed or not, tells the player the object as
    the agent saw it, with the agent's own measurement of its value: convex/v2/loop.ts. A stale act saw an older version
    and tells nothing newer.)

37. On interaction rate and time (relayed by the coordinator, 15 November): "Default interaction rate should be 3Hz for
    the beginner game. Run your simulations faster though, like 10x. Make provision for speeding up time for AI
    simulations with a single param that dilates everything uniformly by that factor including power and interaction
    rate and spawn rate and game duration etc." (The beginner economy's opportunities are 3 a second, #676. The factor is
    v2-economy `dilate(settings, factor)`, agreed with the spec lead; simulations use 10.)

38. On power levels (relayed by the coordinator, 15 November): "About power levels, I want them scaled down a lot. It
    should be really hard to reach object energy levels of 20 or 30 let alone hundreds. I don't understand why our energy
    levels jumped up so much under the new engine and Line type compared to grids in the old engine but I want to
    understand."

39. On perpendicular rules (relayed by the coordinator, 15 November): "I also want the meaningfulness of adding others
    bits before multiplying our own to come from all rules being approximately perpendicular value vectors in the
    configuration space such that two other players with 20 bits represents an object that's as rare and hard to reach
    as 40 bits. Multiplying by our own score is still the mechanism I want. Score is measured in square bits."

40. On unopposed and joint heights (relayed by the coordinator, 15 November): "It's not so bad if players with no
    opposition could fairly easily reach higher than 20 energy per object but I want it to be hard work to find states
    that would give two players 20 energy each on the same object because their rules should naturally pull against each
    other (be roughly perpendicular) without clever coordination."

41. On parameterised rules (relayed by the coordinator, 15 November): "I also want all rules to have substantial degrees
    of freedom in configuration params. I've been lazily suggesting rules involving straightforward primes without params
    and anchoring you to such rules, but I really want large amounts of diversity and specificity within each rule family
    which will help two randomly drawn rules tend to be more perpendicular. For example, we want rules like: distance to
    nearest prime ending in k (base 10) with k say 7 or 13 rather than just distance to nearest prime. If another rule is
    interested in primes it should also filter them with a random parameter so the two rules will have to really work to
    find lines that do well on both their rules. Ideally we have many qualifiers on uses of primes so it's possible to
    find intersections of the qualifiers, just hard. And of course we want many different properties than primes involved
    for more perpendicularity, like modulus and number or type of prime factors and digit properties and squares or
    exponents of factors more generally and that's just the properties on specific numbers we construct but we want lots
    of diversity in converting line properties into numbers we apply utility to as well."

42. On bit levels, balance and dynamism (relayed by the coordinator, 15 November; it corrects the coordinator's reading
    of decisions 38 and 40 as a target height): "The exact scores that end up being par aren't important. Game balance
    and dynamism is. The only reason I anchored to energy levels of 20-30 being really high is because they were for
    grids and maybe that was just a mistake. But 20 bits is 1 in a million and that feels consequentially surprising. I
    don't want our energy levels to be able to reach hundreds when that's more surprising than one atom in the entire
    universe being selected. I guess that's the intuitive frame I'm using but I do recognise that combinatorial dynamics
    can produce extremely high surprise compared to physical reality so we can break that intuition if it's really
    appropriate. Use your own judgement here. Remember that the most important virtues to design for are game balance
    (fairness across rules) and dynamism (metagame doesn't settle into static optima)". So there is no target height
    and no fixed par: options, families and dealt parameter values are judged by (1) balance (comparable points for
    comparable play across rules and across a rule's dealt values) and (2) dynamism (play keeps moving, no dominant
    one-line strategy, no settled optimum), with played objects not reaching hundreds of bits as a sanity bound.

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
17. The beginner economy, following decision 42 (replaces call 13's numbers): power 4 ⚡/s, fullChargeSeconds 240,
    summon and edit prices bits × power/64 (#695: a starter is about 9 s of full power, the owner's "seconds of full God
    power"), startingEnergy derived as three median starters at the scaled price (3 × median starter bits × power/64, rounded to 10: 90 on lines, 130 on grids), the read-price weight derived
    from power. Motive, on the owner's two
    virtues (`power-calibration.md`): the long climb past about 40 bits stops at any power below 8 (at 8 a climber
    reached 131.8 bits), and 4 keeps about three committed moves per seat-minute where 2 leaves the board looking dead.
    To be re-run on the #687 values with and without parameter drift (call 18) and with the prime filters; if 4 lets a
    climb past about 50 bits or seats' points diverge by rule, the coordinator drops to 2.
18. **TRIAL** (declared 15 Nov, departing from v1, where a seat's dealt rule never changed): parameter drift, a game
    setting `driftSeconds` (0 = off, the default for now). Every interval each seat's dealt qualifier value is redrawn
    within its family's declared grid (never the family, lens or tie-breaker), seeded and reproducible; the card
    updates, values come from the precomputed per-value records, and replays show each redraw. Only values within a
    band of par are dealt (no normalisation of scores). Motive: rule design (#690, §A12) found tables of perpendicular,
    parameterised rules settle with fixed parameters (flat from 50–100 s, 4–13% of objects moving late) and keep moving
    when each seat's value is redrawn every 50 s (54–100% moving late); to be repeated under the scarce-power economy.
    Drifting values for the beginner line families (the coordinator, 15 Nov), equal opportunity by construction:
    mirrors. The law is even in a and c (C3), so a parameter and its mirror under a reflection that keeps the law are
    exact peers (v1's 0.5-bit audit passes within sampling noise). Prime Landing deals "a prime ending in 7" and
    "minus a prime ending in 7" (y → −y); Treasure deals T = ±11 and ±13 (y → −y; at ±37 a seat could not cross between a target and its mirror in 120 s
    and parked midway; an exact main is 7.6–8.0 bits across the four; its tie-breakers reading minus
    primes and squares on the mirror); Same on Both Rulers deals T = 6 and −6 (the reflection through the origin,
    which leaves every tie-breaker as it was); Prime Gradient deals its ending 1 and minus (y → −y, the y-intercept
    near minus a prime too), Prime Staircase its ending 3 and a run of minus primes (y → −y). Whole Crossing deals a residue (owner decision
    41): the crossing close to a whole number leaving r when divided by 5, r = 1 … 4; r and 5 − r are mirrors (x → −x),
    r = 1 and 2 measured peers (an exact main 3.85 and 4.23 bits; it was 1.35 for any whole number). Each mirror's symmetry is a unit test. Ending grids (1, 3, 7, 9) fail
    the audit at any floor: the code makes a prime cost about ½ bit per unit, so the first qualifying primes differ by
    up to 4 bits.
    - **Amended** (the coordinator, 15 Nov, from playtest rounds 19 to 22: a redraw reset a ladder's climb; Prime
      Landing redrew to its mirror and then made 102 moves for +1.06 points): a ladder family (design-principles.md rows
      1 to 3 pass) is never redrawn: `RuleFamily.keepsParams`, read by driftParams (lib/v2-core), so the server
      (convex/v2/drift.ts) and the in-memory table follow it. Ladder families now: Prime Staircase, Prime Landing,
      Whole Crossing, Smooth Intercept. Only the old bounded families keep redraws until they are redesigned; when the
      last is, the beginner presets' redraw setting goes to off. Tested: lib/v2-core principles.test.ts, artifacts/engine
      test/unit/v2-drift.test.ts.

17. **TRIAL** (declared 15 Nov, following decisions 39–42): the grid anchors' solved mains leave the dealt values.
    Opposite Nines' "every cell and its opposite add up to 9" (37 bits) and Magic Eighteen's "every row adds up to 18"
    (26 bits) are reached exactly by a 100-move climber (±1 and swaps) from every π start, a fixed point; kept as
    values they also keep the old cluster (their PMI ≈ +7 bits). Opposite Nines keeps its card shape in the new family
    Pair Sums over its 22.6–23.6-bit band of relations; Magic Eighteen folds into the residue family Magic Totals. The old
    values stay in code, undealt, until the beginner grid pool is switched (grid-params.md §8).
18. **TRIAL** (declared 15 Nov, with parameter drift): on grids a drifting parameter moves only within its
    neighbourhood (the same modulus with the remainder drifting, or the family's equivalent), so that a moderate share
    of a board's bits survives a redraw. Drawn from a whole family, only 5–15 % survives for the new families (a reset,
    though 30 moves recover it); the target is a shift, not a reset (grid-params.md §8).

19. **Correction** of the grid seating rule (15 Nov; fairness between seats comes first): the seating rule of
    owner-decisions call (c) (no two families of one PMI cluster) made every three-seat beginner grid table one
    big-digit rule, one small-digit rule and Crosswise Threes, and the two digit clusters are strongly anti-aligned
    (PMI −2 to −4.6). With starters (600 s, the beginner economy, 3 objects), the big-digit seat scored 0.21–0.63 of its
    partners' points (Opposite Nines 0.21–0.43, Strangers 0.34–0.44, Magic Eighteen 0.36–0.63). Now: a big-digit rule
    is never seated against a small-digit one (nor one family twice, nor Magic Eighteen with Magic Accountant, nor the
    blocked pairs); among the remaining deals the dealer takes one with the fewest aligned pairs, so a three-seat
    beginner table is one digit cluster plus Crosswise Threes; all eight beginner families stay dealt (option (b); a
    pause of the big-digit families, briefly merged as #725, is undone). Measured on 8 tables as the dealer deals them
    (two 600 s starter games each, each seat's mean): the strongest seat over the weakest is 1.27–2.11, median about
    1.76 (it was 2.5–4 for the big-digit seat), the same as with the pause (1.10–1.98). Game to game the spread is wide,
    so the 1.5× target is not met on 6 of 8 tables; the parameterised pool remains the fix.

20. **TRIAL** (declared 15 Nov, under call 18's drift, after playtest round 16): drift is staggered and kept off the
    buzzer. Seat k of n is redrawn at world seconds k × driftSeconds / n + m × driftSeconds (a table of three at 120 s:
    one seat's rule changes every 40 s, each seat's every 120 s), instead of every seat at the same instant, which made
    the leaderboard a sawtooth (alice's game: about 85 to about 10 at 2:00). In a fixed-length game no redraw falls in
    the last 90 world seconds: the redraw at 10:00 of a 600 s game collapsed the final scores (winner 69.86 after being
    near 100). (convex/v2/drift.ts `driftEventsDue`, `nextDriftAt`.)
21. **TRIAL** (declared 15 Nov, departing from the two-line design of 14 Nov): High Start reads the GENTLER line's
    y-intercept (and its tie-breaker "high and rising" the gentler gradient), not the steeper line's. Motive: on the
    steeper line it shared Steep Ratio's hill (repeating "stretch the steeper line × 3" raised both by about 1.7 bits a
    step, unopposed; two-line-systems.md §8.1). On the gentler line, a stretch that raises High Start lowers the ratio
    of gradients. Effects measured in two-line-systems.md §8.2.
22. **TRIAL** (declared 15 Nov, following decision 41 and call 18): the two-line families carry dealt numbers where
    the card has one, redrawn every 120 s on `lines-pairs`. A remainder (the whole number aimed at leaves r when
    divided by q) on Whole Answer's x, Far Crossing, High Start and Steep Ratio; the number you divide by (k) on No
    Fractions; the gap ratio (k) on Double Gap. Right Angle and Forty-Five keep none. Only the numbers of equal reach
    and equal value are dealt (two-line-systems.md §8.3). `lines-pairs` stays non-default.
    **Applied 15 Nov (the owner's principles, design-principles.md rows 1, 3 and 4, not a trial):** every two-line main
    part is now a ladder with no top (a residue ladder mod q^j, a power ladder over k^j, or a valuation ladder whose
    rungs are q, q³, q⁶, … times a number leaving r), every tie-breaker reads the number the main part attained, and
    every family deals at least 4 numbers. A seating rule (lib/v2-pair seating.ts) keeps two rules that one move climbs
    together from one table, and drift never redraws into such a pair. Measured in two-line-systems.md §9.

19. **TRIAL** (declared 15 Nov): for a ladder main part (design-principles.md: a main with no top whose rungs are numbers
    the code prices), the equal-opportunity audit (v2-params-equal) compares bits minus the rung's code cost within 0.5
    bits, not the best and median knots: a climb pays Δφ to reach a rung, so equal bits per unit of cost is equal
    opportunity per unit of energy. Play is the judge: pool-dynamics per dealt value, best to worst mean gain within
    1.5 inside a family. First applied to Prime Landing's ladder (endings 1, 3, 7, 9: every rung's bits are its code
    cost plus 1.0). Prime Landing has since left it (call 23: its rungs are windows, compared by best and median knot);
    Smooth Intercept and Prime Staircase use it.

23. **TRIAL** (proposed by the spec lead, declared by the coordinator to the owner, 15 Nov; #781): Prime Landing reads
    where the line lands on the x-axis, X = −c/m, not the y-intercept. Its main part is the prime ending in k that X
    rounds to (u = p, bigger is better; off the ladder −(|X − p| − ½)); its tie-breaker is gcd(p − 1, ⌊c⌋) ("take the
    number just before that prime …"); climb-on is dropped (playtest round 19: 0 in 21 of 24 samples). Dealt: endings
    1 and 9, each with its mirror (landing on −p; the reflection x → −x keeps the law). Endings 3 and 7 leave the deal:
    at equal size their rungs are 1.4 and 0.5 bits cheaper.
    - **Motivation.** Row 2 in play (design-principles.md): on the y-intercept the next rung was a shift of c by 10 or
      more, which wrecked the bits of every other seated rule reading c, so starters declined it (48% of seats still
      climbing in the last third, 0–3 rungs crossed in 80 games). An exact landing on the x-axis costs about p/2 bits
      under C3 (2 rungs crossed in 80 games); a window (within ½) costs about log p, and the next rung is a small tilt
      that keeps c.
    - **Effects** (80 games, drift off, 20 per instance): 62.5% of seats still climbing late (was 48%), 12.5% plateaued
      in the first 120 s (was 21%), 55 rungs crossed; best to worst mean gain 1.37. Values reach about 18 bits at
      X ≈ 5,000, about a bit per doubling. The mirrors seemed to gain more at 20 games each (298 and 248 against 250
      and 218); at 40 games each there is no gap: 254 ± 23 (ending 1), 261 ± 24 (its mirror), 274 ± 25 (ending 9),
      267 ± 30 (its mirror), best to worst 1.08.
    - **Seating rule** (the coordinator's call, tested: lib/v2-linear seating.ts): Whole Crossing reads the same X, so
      Prime Landing (ending k, side s) is never seated, nor redrawn by drift, beside Whole Crossing with r ≡ s·k
      (mod 5), where every rung of the one is exact for the other. With r ≢ s·k they pull the landing apart.

24. **TRIAL** (the spec lead's redesign under the coordinator's delegation, 15 Nov; declared to the coordinator): Whole
    Crossing is a ladder of 5s on the crossing. Its main part is the level j when the crossing is 5^j × t with t leaving
    r when divided by 5 (u = j, bigger is better); any other crossing scores −(its distance to the nearest such number),
    so the old rule (close to a whole number leaving r) is the ground floor. A stretch or zoom by 5 climbs a level
    (decision 25). Its tie-breaker is gcd(|t| + 1, the gradient's whole part ignoring sign); a stretch to the next level
    divides the gradient by 5, so the climb starts again. The tie-breakers k-spf, k-gpf and m-spf (and the undealt gcd-c
    and gcd-num-m) leave it.
    - **Motivation.** k-spf and k-gpf rewarded a crossing number with big prime factors, exactly Prime Landing's rungs
      (PMI 2.4–3.6 against every Prime Landing instance), and the old main was a distance with an exact top (row 1);
      the pool's 71-bit seat was a Whole Crossing seat.
    - **Effects** (values: about 2.5 bits a level to level 5, r = 1 and 2 within 0.4 bits a level, then +0.5 a level;
      40 games, drift off): its seats peak at 9 bits; 52% still climbing late, 15% plateaued early, mean gain 216–303
      across r. Seated with Prime Landing and Treasure (40 games): balance 1.2–1.3, peak seat 16.4 bits. Static PMI
      against Prime Landing is still 1.3–3.1, from near misses (both pay for the crossing close to one whole number);
      the seating rule (call 23) stays.
    - **Amended** (the spec lead, 15 Nov, on the coordinator's report: under the lens preset a zoom chain by 5 reached
      26.6 bits with a fixed factor and 29.5 greedy, at the 30-bit cap of call 25): the level is triangular in the 5s,
      as Prime Landing's digits and Smooth Intercept's primes are. Level L needs L(L + 1)/2 fives (1, 3, 6, 10), and
      between levels each 5 counts 1/(L + 1) of a level: u = L + (j − L(L + 1)/2)/(L + 1). Each 5 now adds less than
      the one before, so a zoom or stretch chain bends.

23. **TRIAL** (declared 15 Nov, on the lens worker's pool-dynamics check, docs/engine-v2/scripts/stretch-lens-pool-dynamics.md,
    following decisions 25, 27 and 28; the owner asked by name for "rotating the line about a point"): `rot.turn` and
    `basis.zoom` join the beginner line set. `line-q` offers eleven mutators: the turn and the zoom at the price they
    were measured at (which = log2 20), the nine at log2 10 (Kraft sum 1). `coef.swap`, `basis.lean` and `fold` stay in
    `lines-lenses`. `coef.swap`'s fee is floored at φ of the dearer number it swaps (in play two swaps in three had
    gained more than their fee); it joins nothing until a re-measure shows fewer than one swap in ten above its fee.
    **Amended the same day** (the coordinator): `basis.zoom` is taken out of `line-q` again, the turn stays. Thirty zooms
    by 7 climbed Prime Landing 227 bits on `lines-lenses` (the spec lead's "no straight hill" check): an easy high peak
    a player finds by pressing one button. The zoom returns only when that check passes on develop for every dealt
    family against zoom, stretch and turn. `line-q` offers ten (the turn at log2 20, the nine at log2 (9/0.95));
    the swap's floor (re-measured: 3% of swaps above their fee) stands.

25. **Correction** (the spec lead, 15 Nov, after playtest rounds 21 and 22 and the pool's 59-bit seats): no straight
    hills. Smooth Intercept scored the y-intercept's size, so a stretch by a dealt prime added the same value at every size
    (0.9 bits a doubling); seats stretched 36–57 times on one object to 49–59 bits, and round 21 parked a line at 3⁸.
    - **Smooth Intercept** scores how many of the dealt primes the y-intercept is made of, in triangular levels (level ℓ
      needs ℓ(ℓ + 1)/2 of them), the smaller of two numbers with as many counting a little more (the owner's "small
      values and lots of prime factors"). Dealt sets {3, 7}, {3, 11}, {3, 13}, {3, 17}: {2, 7} left (a 2 is cheaper per
      level: 12 bits at level 4 against 17), and with it round 20's climb by doubling. Effects (40 games, drift off):
      seats peak at 19.6 bits (p95 15.5; was 59 and 49), mean gain by set 269–380.
    - **Prime Landing** keeps "bigger is better" in levels of digits (level ℓ needs ℓ(ℓ + 1)/2 digits): by size, 30 zooms
      by 7 reached a landing worth 227 bits. A monotone relabelling: the same bits within the sampled ladder.
    - **The check** (lib/v2-core `straightHill`, run by artifacts/engine test v2-no-straight-hill on every dealt line rule
      against every stretch, zoom and turn its preset offers, and their inverses, 30 times from typical lines): the bits
      gained per fee must fall along the chain (unless under 0.02 a fee bit) and the chain may gain at most 30 bits. A
      family that fails is not dealt: Square Area's `omega` (prime factors of the square's root; a stretch adds one at
      every size) is undealt until the grids session redesigns it.
    - **Views**: a ladder family's main part on a rung is said in the family's words ("on 75: 3 of the dealt primes
      multiplied, level 2"), not as its level number.

26. **TRIAL** (the spec lead's redesign under the coordinator's delegation, 15 Nov; declared to the coordinator):
    Prime Gradient is a ladder on the gradient, as Prime Landing is on the x-axis crossing. Its main part is the prime p
    ending in k the gradient rounds to (minus one on the mirror), in levels of digits (u = digitLevel(p), each level
    dearer than the last); off the ladder −(distance − ½). Its tie-breaker is gcd(p + 1, the y-intercept's whole part
    ignoring sign), which a new rung restarts. The tie-breakers "prime" (the size of that prime: now the main part),
    cPrime (the y-intercept near such a prime: an independent wish, decision 29), c-spf and c-gpf (the y-intercept's
    prime factors: hills a shift climbs at every size, the pool's 40-bit seats) leave it. Dealt: endings 1 and 9 with
    their mirrors; never redrawn (a ladder family). A tilt moves the gradient and Prime Landing's crossing together, so
    the two contest one move. Values reach 18.0 and 17.8 bits at the sampled top; the params-equal audit compares levels.

27. **TRIAL** (the spec lead's redesign under the coordinator's delegation, 15 Nov; declared to the coordinator):
    Divisibility Ladder is a ladder with no top. Its main part is the run of n dividing y(n) = m·n + c from n = 1 (for a
    whole gradient, a run of k needs lcm(1, …, k) to divide c), no longer stopped at 12, in triangular levels (u =
    triangularLevel(run), as Whole Crossing's 5s). Its tie-breaker is gcd(y(n), n) where the run stops at n (0 when
    y(n) is not whole), tied to the run (decision 29): how near the next rung is, never more than n. A first try,
    gcd(⌊|c| / lcm(1, …, run)⌋ + 1, the gradient's whole part), failed the gate: a stretch multiplies both, and a greedy
    chain of 8 stretches reached 75 bits.
    The tie-breakers m-spf, m-gpf, m-prime (the gradient's own prime factors or nearness to a prime: independent wishes,
    and the hills a stretch climbs at every size) and steep (undealt: a greedy mixed-stretch chain reached 77.6 bits)
    leave it. The card: "y(1), y(2), y(3), … should be multiples of 1, 2, 3, … for as long as possible, not through
    (0, 0). Longer is better, though each extra counts less."
    - **Motivation.** The old run had a top (12: rows 1 to 3 of design-principles.md), its tie-breakers were the
      gradient's own wishes (decision 29), and the no-straight-hill gate's greedy chain failed it (77.6 bits on steep,
      21.3 on another).
    - **Effects** (values: line-q best 17.9 bits, line-z 17.9 at the sampled top): see the PR for the gate.

28. **TRIAL** (the coordinator's, declared 15 Nov, on the spec lead's rung-start measurement): a ladder's value tail
    continues at its measured rate; no flat tail. A ladder family's main part (RuleFamily.keepsParams) takes the
    "ladder" tail measure: past the sampled knots its value rises linearly at the slope measured over all its rungs
    (4.3–12.6 bits per level across the pool), never held under the per-unit ceiling, which suits a coordinate, not a
    level. The stored tails were re-fitted from the same knots (lib/v2-valuation scripts/retail.ts).
    - **Argument.** Bits are rarity under the law, so relabelling a main part into levels changes nothing a player
      earns (design-principles.md principle 1). The only bend in any ladder was where the sampled values ended and
      the tail was cut to 0.5 bits per unit: Smooth Intercept's measured 5.4 bits per level became 0.1 bits per
      stretch, which froze a line at 22.87 bits in playtest round 26. A flat tail is a top in disguise.
    - **Amended** (the coordinator, 15 Nov, on Prime Staircase ending 9: a measured-rate tail of 12.6 bits a prime let
      a random shift find a 41-bit state): one rule for every ladder, the standing one (CLAUDE.md): a value tail never
      grows faster than the φ of the cheapest state that reaches it. Each ladder family declares cheap witnesses for
      its n-th rung (RuleFamily.witness: p₁ⁿ for Smooth Intercept, 5ⁿ·t, the smallest n-digit prime, lcm(1, …, n),
      and for Prime Staircase arithmetic runs found by search, e.g. y = 210x + 199, ten primes ending in 9 for about
      25 bits); the tail is the measured rate, capped at each rung by the least φ of a witness at that rung or above
      (v2-valuation ladderCaps; a test checks every dealt ladder). Prime Staircase ending 9 now tops at 22–25 bits.

29. **TRIAL** (the coordinator's, declared 15 Nov): a shortcut's price grows with the size of the line it rewrites.
    A multiplying or representation shortcut (mach.stretch, basis.zoom, rot.turn) is still priced as a choice by its
    factor's digits (decision 25), but never below that fee × 2^((Φ − 20)/3.5), where Φ is the code length of the
    larger of the line before and after (symmetric, so the prices stay an exact potential, decision 19). Below Φ = 20
    bits (line-q's law draws: median 14.7, 90th percentile 20.9) nothing changes; past it the fee doubles every 3.5
    bits. Additive moves keep their prices.
    - **Argument.** For a multiplicative ladder under a law whose code length grows with log size, the bits a step
      gains and the fee of the shortcut that makes it both scale with log(factor), so bits per energy was constant
      (Smooth Intercept about 0.13 bits per ⚡ from a rung start: 9 straight steps to about 18 bits for 100⚡). With the
      fee rising with Φ, each further step costs more, and an unopposed seat that spends a whole game's income (about
      2,500⚡) on one ladder ends near 30 bits (the coordinator's target 25–35; a fee linear in Φ would let it reach
      50–65). The doubling form was chosen over a power of Φ because it is one sentence: "past 20 bits, a shortcut's
      fee doubles every 3.5 bits of the line".
    - **The gate** (the coordinator's ruling, 15 Nov): the no-straight-hill gate is one energy question: from law
      draws and rung starts, can a greedy climber with one seat's whole-game income (2,500⚡ on lines) spent on one
      object take a dealt rule past 35 bits? Enforced (artifacts/engine v2-no-straight-hill.test.ts). Measured: Smooth
      Intercept 17–27 bits (31 with the lens moves), Whole Crossing 9–13 (31–33 with zoom), Divisibility Ladder
      15.6 (20.5), Prime Landing and Prime Gradient at most 20, Prime Staircase at most 25, every other family under
      21. Open: Square Area's spf and lpf (58.5 bits; 141–316 with the lens moves), reported to its owner.

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
