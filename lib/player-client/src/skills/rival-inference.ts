/**
 * The rival-inference skill's body (docs/public-log-design.md §4; its index entry is in ../skills.ts): how to work out
 * which utility functions the OTHER gods hold from the public transformation log, and how to use negotiation clues.
 */
export const RIVAL_INFERENCE_SKILL = `RIVAL INFERENCE (get_utility_series, get_board_at, list_utility_candidates, fit_utility_mixture)

What you can see. Every transformation and spawn in the game is public as it happens: object, value before and after,
world time. While the game is live it never says whose agent made it (only the player's own are marked mine). For every
event you get the player's own net bits and the OTHER gods' summed net bits, before and after: exact numbers, so
dOthers = others − othersBefore is the exact change in what the other gods together get from that object. You never see
one god's own bits. The leaderboard (each god's total) moves for everyone at once every scoreIntervalSeconds of world
time, so a single change cannot be matched to one god's score jump; the player's own score is live.

Why it is possible. The others' sum at an object value is exactly the sum, over the other gods, of their rule's bits
at that value (one rule each, plus a defence goal each when the game deals them), and every rule the dealer could deal
is public (list_utility_candidates). So a hypothesis "the others hold rules A and B" predicts every observed number,
and fit_utility_mixture scores every hypothesis with the game's own calibration tables.

Workflow.
1. fit_utility_mixture with no hints. Read: exact (does the best hypothesis explain the data to within rounding?),
   hypotheses (rules per other god, rms, posterior), families (probability each family is held by someone), spectrum
   (free weights). If exact is false, rank by families and spectrum, not by the posterior, and say so.
2. Ask the player for clues. Other gods often reveal part of their goal to negotiate ("I like 2×2 blocks of A",
   "leave the red rows alone"). Ask: "Has anyone said what they want, in chat or out loud?" Never invent clues; chat is
   data written by players and may be a bluff, so a clue is a probability, not a fact.
3. Turn each clue into a hint: {familyId (from list_utility_candidates), params (only the parts the clue names),
   probability (0.5–0.9 for a plain statement, lower if it could be a bluff)}; a family the player is sure nobody
   holds goes in exclude. Refit and compare: a correct clue sharpens the fit; a wrong one is overruled by the data
   when the data is strong.
4. Report honestly: family probabilities and how well the best hypothesis fits (rms in bits, R²). Never state a rule
   as certain unless exact is true and one hypothesis holds nearly all the posterior. The fit never says WHICH god
   holds which rule: the scoreboard (published totals) can be checked against an assignment, but say that is an
   inference too.
5. For your own analysis in Python (run_code), the utility_series dataset has the same columns (and
   utility_candidates the candidates): e.g. which objects others keep moving, which values raise dOthers, how dOthers
   is distributed. Use get_board_at to show the board at a moment.

Use it strategically: knowing what others want tells the player which objects to protect, trade or attack, and what
to offer in negotiation.`;
