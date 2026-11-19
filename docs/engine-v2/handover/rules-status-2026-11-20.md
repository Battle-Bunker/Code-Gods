# Line rules and the energy estimator: status at the stop (20 Nov 2026, Melbourne time)

Written when the owner changed the project's direction and feature work stopped. Labels: **built** (true of the code
as merged), **seen narrowly** (measured, with the assumptions named), **guess**.

## Merged and live on dev

All merged into `develop`; the develop Deploy runs after each were green (built).

| PR | What |
|---|---|
| #1218 | Estimator fallback fix: a start that runs out of work keeps the direct turn instead of reading 0. |
| #1222 | Rule candidates for Corner, Ring, Stepping and Whole Stair (closed-form and one-number searches). |
| #1223 | The goal card's "What is each level worth?" ladder (truthful energies, replacing the rarity table). |
| #1225 | Every estimate's time bounded by the work budget (`estimatorWork`, a room setting): the rules' searches spend from a meter (`searchMeter`/`searchTick` in `lib/v2-linear/src/dynamic-families.ts`), at most half each start's share; a cut estimate is flagged `bound`. |
| #1227 | Accuracy restored after the time bound: screened scans (a closed-form model of the rule's value in one moved number, screened before a line is built). |
| #1233 | Kin's candidates fixed; Prime Palette and Shared Secret retired to `docs/engine-v2/old-rule-ideas.md`. |
| #1232 | Hensel graded: u = max over e of [e·log2 p − log2(1 + distance to the nearest top with p^e dividing top² − D·bottom²)], candidates by modular arithmetic; Hensel's `cost: 3`. |

Docs: `docs/engine-v2/estimator-accuracy.md` (method and results), `docs/engine-v2/interaction-check.md` (pairs and
triples of the dealt rules), `docs/engine-v2/energy.md` (per-rule ladders and check tables).

## Not finished

### Accuracy cells still over 3 bits

Mean of (live estimate − a much larger search) over the fixture's states, seen in the accuracy harness
(`lib/v2-linear/scripts/estimator-accuracy.ts`; 4–8 states per rule and size, 12 seeded starts, beginner physics,
work budget 5000; the "larger search" is itself only long climbs, best-first and a single-number sweep, so the true
gap is at least this). The loosened limits are the `KNOWN` table in `lib/v2-linear/test/estimator-accuracy.test.ts`
(default 2 bits at 5 and 10, 3 at 20); none has been restored to the default yet.

| Cell | Gap (bits) | Limit in the test | Next step I would have taken |
|---|---|---|---|
| Whole Stair 10 | 7.2 (6.9 on the branch) | 8.5 (7.5 on the branch) | The larger search's cheap routes keep one intercept and rename the other in big numbers (two numbers move at once: x-intercept top and bottom). A candidate that keeps the value of X and writes it as a near-Pythagorean fraction (convergent-style, like Corner's below) is the next try. Two one-number attempts gave ≤ 0.3 bits. |
| Corner 20 | 4.0 | 5 | Same shape: routes keep the gradient's value and name it in larger numbers with 2n·top·bottom near a square. "Squares near the gradient" (convergents of √(2n·|m|)) is on the branch: Corner 40 5.7 → 3.8, Corner 20 unchanged. Then: spend the meter on it before the screened scan, whose ±512 local tries rarely hit at 20 bits (each hits with probability about 2^−u*: guess from the model). |
| Hensel 5 / 10 | 3.3 / 3.6 | 4 / 4.5 | Not started after the graded form. Small lines: the larger search sums many distinct cheap targets; check with `EXPLAIN=1` first. |
| Ring 5 / 10 | 5.4 / 4.5 | 6.5 / 5.5 | Not started. |
| Bearing 10 | 4.3 | 5.5 | Not started. |
| Golden Path 5 | 3.9 | 4.5 | Not started. |
| Archimedes 5 | 3.6 | 4.5 | Not started. |

Also over the default and loosened: Whole Stair 5 (limit 4), Whole Stair 20 (4), Long Run 10 (3).

**Branch holding unmerged work:** `claude/accuracy-cells` (no PR; not for merge as it stands). It adds Whole Stair
single-move neighbours in the intercept and equation lenses (10 bits: 7.2 → 6.9; 5 bits: 2.9 → 2.6; every fixture
state's estimate then hits the work bound) and Corner's "squares-near" search (above). Seen narrowly on the fixture's
8 states per cell.

### Kin

Candidates fixed in #1233 and measured in `energy.md`; still a candidate rule, not dealt (built). No further work
planned by me.

## What a later session should know

- **The work budget, not the candidates, sets much of the gap at 20 bits** (seen narrowly, Corner 20, one state: the
  rule's searches use their whole half share every start, find 4–9 targets, and the cheap ones the larger search
  finds with an unlimited budget are cut). Order searches by expected payoff; a search that rarely hits at a size
  should not run there. Doubling `estimatorWork` to 10 000 fixed 20 bits only and doubled the time at 40 (seen
  narrowly, 17 Nov), so it was not taken.
- **The larger search's cheap routes are usually multi-number moves in the intercepts lens**: keep one intercept,
  rewrite the other (or the gradient) at nearly the same value in bigger numbers that satisfy the rule. One-number
  scans near the current number miss them; value-preserving rational approximations (convergents) reach some (seen
  narrowly, Whole Stair 10 and Corner 20, `EXPLAIN=1` output, 19 Nov).
- **Small lines (5 bits) read high because the larger search sums many distinct cheap targets** in its soft-min, while
  the live estimate finds few. Adding every qualifying first move as a route helped (#1227); the rest is guess.
- **Tooling:** `estimator-accuracy.ts recheck <files>` re-measures the live estimate on saved states in seconds; a
  full harness run for one rule and size takes about two minutes. `EXPLAIN=1` prints the starts where the larger search
  wins by over 2 bits with the target, lens and route kind: the fastest way to see what a rule's candidates miss.
  Fixture rows can be fed to `recheck` by mapping `big` to `eBig`.
- **Environment:** force-push is refused (update branches by merging `develop`); the local Convex engine could not
  download its dashboard through the proxy, so browser end-to-end tests did not run here; new worktrees lack the
  Python sandbox bundle the agents tests need (CI has it).
- **Hensel's maths:** the graded form needs square roots of D mod p^e (Hensel lifting); the TypeScript and Python
  agents lift by stepping, the engine by modular inverse. Its candidates are exact progressions of step p^e plus a
  slack d ≤ 2^(e·log2 p − u*) − 1 (built).
