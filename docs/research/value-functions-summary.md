# Pantheon of Friction: research synthesis

The three brainstorming reports are hypotheses, not a finished generator.
Prefer technically meaningful shared structure to arbitrary independent
conditions. Preserve the requested scoring and constant-program pricing.

## Scoring implications

Let a and b be two gods' values and C the sum of all other gods' values.
Their object payoffs are a(b+C) and b(a+C), respectively. Their payoff
difference is C(a-b). With only two gods, C=0, so their per-object and total
scores are identical. Recommend at least three participants for adversarial
politics without imposing a new minimum-player rule.

Changes in raw value are not enough to establish political conflict: compute
both payoff changes, including changes in C, for every claimed witness.
With exactly two players, disclosing the others' sum also discloses the
other player's value. More players do not eliminate inference through probes,
public totals or collusion.

## Leading candidates

1. **Prime multiplicity and diversity:** for n=abs(x)>=2, use total
   prime-factor multiplicity Ω and distinct-factor count ω. Preferences
   1−2^(-Ω) and (1−2^(-ω))ω/Ω align when adding fresh factors, but can
   conflict when repeating factors. Values at 0 and ±1 require an explicit
   convention. A large square-free constant is a strong baseline exploit.
2. **Bit occupancy and alternation:** compare one-bit density against
   adjacent-bit transition density without leading zeros. Appending the same
   bit can create alignment or opposition depending on the existing suffix.
   Constant 5 (binary 101) is an important compromise baseline.
3. **String lag preferences with anti-collapse pressure:** let
   q=4 count(A)count(B)/length² (zero for empty), and c_k be equality
   frequency at lag k (zero when length<=k). Values q*c_2 and q*c_3
   create different periodic ideals without rewarding all-one-character strings.
   Other ASCII characters dilute q. Uniform random ASCII spawning makes
   cleanup a large opportunity; assess whether this dominates later politics.
4. **Overlapping motifs:** AB and BC share B and can cooperate via ABC,
   while repetitive motifs compete for positions. The proposed normalization
   in the string report admits a universal optimum at ABC; reject that exact
   pair as the default rather than overlook the degeneracy.
5. **Edit-distance to overlapping languages or prototypes:** naturally
   shared repair regions and contested structural regions. Prototype distances
   are tractable at the cap; general grammar edit-distance needs a bounded
   algorithm. Exponential target enumeration is not a viable production method.
6. **Non-antipodal modular preferences:** nearby peaks on a residue cycle
   offer shared slopes and opposing slopes. Cheap periodic constants and
   ignored magnitude are weaknesses to measure.

## Concrete integer witness

For the prime pair above and an illustrative third value fixed at 1:

| Transition | A's payoff | B's payoff | Interpretation |
| --- | --- | --- | --- |
| 2 → 6 | 0.75 → 1.3125 | 0.75 → 1.3125 | Both gain |
| 2 → 4 | 0.75 → 0.9375 | 0.75 → 0.4375 | A gains, B loses |

The constant third value is an explanatory fixture, not the proposed default
deity. A shipping generator needs all-player witnesses with nontrivial values.

## Concrete string witness

With values q*c_2 and q*c_3 and an illustrative third value fixed at 1:

| String | A value | B value | A payoff | B payoff |
| --- | --- | --- | --- | --- |
| ABCDEF | 0 | 0 | 0 | 0 |
| AABBAB | 1/4 | 2/3 | 5/12 | 5/6 |
| ABABAB | 1 | 0 | 1 | 0 |

Thus the same pair benefits from repairing the first string, then disagrees
about transforming the second to the third.

## Generator acceptance criteria

Evaluate candidate sets on the actual spawn distribution, useful reachable
objects, and simple program-induced transitions. Require nontrivial same-pair
cooperative and conflicting payoff regions with numerical margins, multiple
coalitions for three-plus gods, bounded evaluation cost and distinct functions.
Record rejections rather than silently emit a weak fallback set.

Test cheap constant outputs, repeated-agent dilution, identity, compositions
and last-writer dynamics. Regional value landscapes do not imply regional
control when programs may overwrite every object with a constant. Do not ban
constants or claim human-understanding effects without the user's approval and
empirical playtesting.
