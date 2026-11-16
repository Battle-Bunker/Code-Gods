# The dynamic energy measure

Owner decision 49 (16 November): "energy of an object is the expected energy cost of reaching a state at least this good
from a random object of the same 'size'". This replaces the value tables (decision 23), levels and the lift. Labels:
**built** (in the code, tested), **seen narrowly** (measured under the stated assumptions), **guess**.

## How it is computed (built)

A rule family with `dynamic` (lib/v2-core contracts.ts) has a utility `u` (any real function of the state, bigger
better), the readings it `reads`, and its own `searches` (heuristics that propose target states). The object type's
`estimate` computes, for a state s:

    energy(s) = mean over K starts x of min(direct(x → s), floor(x), heuristics(x))

- **Starts** (lines, lib/v2-linear energy.ts): a random line whose read numbers (gradient m, y-intercept c) each have s's
  magnitude (log2 uniform in [log2|v|, log2|v| + ½)), the other reading from the law. Fresh randomness each time.
- **direct**: the cheapest one or two solved moves onto s itself (the ceiling).
- **floor**, shared by every rule: each single move with a solved amount onto one of s's readings (either sign), its
  crossing and area, the shortcuts (mirrors, stretch by 2, 3, ½, ⅓, −1), and a shortcut followed by a solved move. A
  route counts when it reaches u ≥ u(s).
- **heuristics**: the family's targets, reached by solved moves onto the readings that differ, from the start and from
  where each shortcut lands. Adding a heuristic only lowers the estimate on the same starts (tested).
- **Price**: the game's own act charge for each move as its own act (`changeCharge`), so energy is in the units players
  pay. The scoring trial used its friction floor instead; that was a comparison only.
- K = 12 on the server (`LINE_K`).

## Where it runs (built)

- A commit (loop.ts `valuesAt`) estimates every seat's energy for the changed line: the leaderboard's numbers. Points
  are still own energy × the others' energy summed. That product still rewards states good for several rules at once,
  and nothing here breaks it.
- A look (`object.look`) estimates the looker's own energy afresh, so the same line reads differently each time.
- Rules in this measure have no table, so `rule.values` and `rule.worth` say so. Agents are given no table either, so
  they climb their own utility. Pricing what a plan does to the others' energy (`othersAfter`) is next.
- Seen narrowly: a 60-world-second Lines · beginner game with three practice partners ran to its end on the local
  backend (test/v2-game.test.ts), with no function-limit warnings. One estimate takes 1–35 ms in Node (K = 12, the eight
  families on a few sample lines). One outlier, a far-off state under a trial family, took 0.9 s, so a utility must
  bound its own search: every dealt family treats numbers past 10^10 as out of reach.

## The dealt line families (lib/v2-linear dynamic-families.ts)

| Family | Reads | Utility (bigger better) | Pulls | Space |
|---|---|---|---|---|
| Power Hug | c | √(log2 P) − \|c − P\|³, P the nearest power of k (the owner's example) | up, precise | k 2–40 |
| Prime Hug | m | √(log2 p) − \|m − p\|³, p the nearest prime ending in the suffix | up, precise | 444 suffixes |
| Smooth Hug | c | √Ω(n) − \|c − n\|³, n the nearest number made of the dealt primes | up | 35 sets |
| Multiples | c | (log2\|n\| − √\|c − n\|) × (k's in n − other factors): the owner's example | up | k 2–12 |
| Fine Bottom | c | log2 (k-part of c's bottom) − 2 log2 (rest of the bottom) | fractions | k 2–9 |
| Next-door Bottom | m | log2 gcd(\|top\| + t, bottom) − log2 (the rest of the bottom) | fractions | t 1–9 |
| Unit Fraction | c | log2 n − 4 \|n·c − 1\|, n the whole number ending in the suffix nearest 1/\|c\| | down | 99 suffixes |
| Prime Sliver | m | log2 p − 4 \|p·m − 1\|, p the prime ending in the suffix nearest 1/\|m\| | down | 444 suffixes |

The old families stay in the code; they are not dealt on Lines · beginner. The other line presets still use tables until
those are deleted.

## The design-principles check, adapted (docs/engine-v2/design-principles.md)

Labels as above. Several rows assumed tables or tie-breakers, and the adaptation says how.

| Row | Status |
|---|---|
| 1 Unbounded main part | Built: every utility rises without bound (powers, primes, factor counts, bottoms, 1/n). |
| 2 Climbed all game | Not measured. Guess: the up-pulling hugs climb by power or prime steps, each far bigger than the last, so they are slowed by price, not by a top. |
| 3, 3a Tie-breaker tied to the main part | Adapted: no tie-breakers. Precision is a term of the utility (cubed or ×4 distance to the anchor the main part chose), so a step to a new anchor restarts the precision climb. |
| 4 Dealable instances | Built: large spaces (RuleFamily.space); two peers listed per family. |
| 5 Perpendicular | Not measured: the PMI table is computed from value tables (exempt in v2-rule-check). |
| 6 Opponents | By construction: on c, three families pull up and Unit Fraction pulls down (Fine Bottom wants fractions); on m, Prime Hug pulls up, Prime Sliver down, Next-door Bottom wants fractions. |
| 7 Kinds | Powers, large primes, smooth numbers, k-multiples, denominators of a base, divisibility of top + t by bottom, unit fractions, prime reciprocals: no kind shared by more than two. |
| 10 Small bump | Not measured. Guess: the cubed terms make every off-anchor bump expensive in utility, but energy, not utility, is paid, so the loss is the energy of a slightly worse state. |
| 12 Writable from the card | Each card states the formula in words. Not tested with a reader. |
| 13 Lives on the rationals | Fine Bottom, Next-door Bottom, Unit Fraction and Prime Sliver need fractions by construction. |

How this could be wrong: K = 12 is noisy. A rule whose good states are cheap from most same-size starts scores near 0
however good it is. The floor and heuristics are only what is coded, so a cheaper route nobody coded overvalues a state.
