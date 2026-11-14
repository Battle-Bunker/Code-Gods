# Tie-breakers sessions replaced (for the owner to choose)

On 14 November 2026, while the beginner pool was cut to rules an exact sum could value, sessions replaced some
families' tie-breakers with ones a sum could handle (mostly the prime factors of one coefficient). That was a change of
game logic made without the owner's words (`.agents/memory/metastable-ecosystem.md`). Owner decision 22 lets sampled
values stand in where no sum exists, so every replaced tie-breaker below can come back. **Restored** (coordinator's call
under the owner's delegation, 14 November): every removed tie-breaker is back, first in each family's list (so the old
default is the default again); the added spf/gpf tie-breakers stay after them until the collapse check shows which are
ramps (those go).

The old definitions are at commit `4154ef71` (`lib/v2-linear/src/beginner.ts`, `families.ts`).

| Family | Removed (old) | Added in their place | Kept |
|---|---|---|---|
| Prime Staircase | `last-prime` (the run's last prime), `near-miss` (the first non-prime term close to a prime), `step-back` (y(−1) close to a prime) | none | `first-prime` |
| Treasure | `prime-gradient` (m close to a prime), `square-start` (c close to a square) | `m-spf`, `m-gpf` (m's smallest and largest prime factor) | `prime-terms` |
| Prime Landing | `prime-gradient` (m close to a prime), `next-prime` (y(1) close to a prime) | `m-spf`, `m-gpf` | `big-prime` |
| Same on Both Rulers | `prime-start` (\|c\| close to a prime), `whole-values` (different whole numbers among y(−5) … y(5)), `whole-lamp` (the lamp's height close to whole) | `m-spf`, `m-gpf` | `steep` |
| Prime Gradient | `cPrime` (c close to a prime too) | `c-spf`, `c-gpf` | `prime` |

The three families deleted outright (Ruler, Exact Change, Pythagorean Area) are restored with their old tie-breakers
unchanged (spec §12.5).

**Fixed-point note.** The replacements each read one coordinate's factorisation, which a player can satisfy
independently of the main layer; several old tie-breakers (`near-miss`, `next-prime`, `whole-values`, `whole-lamp`)
read the line at several points and couple m and c. By the standing collapse check (fewer couplings, rules that read one
coordinate each make a fixed point easier to reach), restoring the old ones makes a fixed point harder to reach.
