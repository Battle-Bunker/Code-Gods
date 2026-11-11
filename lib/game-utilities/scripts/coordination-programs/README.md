# Coordination policies as real agent programs

The smallest honest agent programs found for six policies on the default setup (Annotated basics: Grid 4×4, base10,
mono), for a god whose own rule is **Magic Eighteen** (rows) and whose two rivals hold **Opposite Nines** and
**Leapfrog**. One file per policy and language. Every price below is the engine's own examination (the `validate`
command, `artifacts/engine/convex/engine/pricing.ts` `examineAgent`), measured on the local dev engine on 2026-11-11:

```
cd artifacts/engine
node --experimental-transform-types --disable-warning=ExperimentalWarning scripts/coordination-games.ts \
  --table price --files ../../lib/game-utilities/scripts/coordination-programs/greedy.py,...
```

## What each program does

Every program except `random` reads the 16 values once (16 × log2 10 = 53.2 bits read, 1.66 energy bits per act at
1/32), tries all 160 one-cell writes (the 144 real ones and the 16 that rewrite a cell's own digit, which never win),
and returns the best write, or `[]` (a skip) when none strictly beats the board as it is. All are deterministic except
`random`.

| policy | objective | rivals' rules needed | bits needed |
|---|---|---|---|
| `random` | a uniformly random digit into a uniformly random cell; reads nothing | no | no |
| `greedy` | own ordinal `(exact rows, −distance)`, compared lexicographically | no | no |
| `considerate` | own ordinal, among writes that lower neither rival's ordinal | yes | no |
| `payoff` | own bits × (sum of the rivals' bits) | yes | proxy |
| `cooperator` | Σ over the three gods of own × others (= 2·(ab + ac + bc)), among writes that do not lower own × others | yes | proxy |
| `deny` | own bits − mean of the rivals' bits | yes | proxy |

The rules are rewritten compactly over a list of 16 values; they compute the cards' ordinals exactly (checked against
the three cards on 300 random boards).

### Proxy bits

An agent has no calibration table (the three shipped tables have 70, 120 and 9 levels). The programs use a small
hard-coded lookup, in tenths of a bit:

- Magic Eighteen: `[31, 57, 94, 122, 148][exact] − 1.5 × distance`, floored at 0;
- Opposite Nines: `[46, 52, 68, 89, 119, 157, 195, 227, 264][nines] − 2 × distance`, floored at 0;
- Leapfrog: `[0, 3, 12, 27, 47, 75, 108, 154, 202][leaps]` (its table, exactly).

Against the shipped tables (`surprisal`): mean absolute error 0.2–0.9 bits for Magic Eighteen, 0.5–0.7 for Opposite
Nines, 0.02 for Leapfrog, on random boards and on boards after 3, 8 and 20 cooperative steps. On 300 boards the
`payoff` proxy picked the write the real tables rank best 218 times, and captured 94% of the best write's real gain
on average. The lookup is the dear part: its literals cost about 380 of the 516 literal bits.

The `*-formula.py` variants replace the lookups by formulas fitted to them by eye (tenths of a bit, `n` the leading
component): Magic Eighteen `31 + 29n`, Opposite Nines `46 + 27n²/8`, Leapfrog `3n²`, each minus 1.5 × distance for the
first two. They are about 200 bits cheaper and coarser (Opposite Nines is up to 2.7 bits off the lookup at 5 or 6
nines); their accuracy against the shipped tables was not measured.

## Prices

Deity capacity on the default setup: 64 bits/s × `fullChargeSeconds` 30 = **1920 bits**; `startingEnergy` is 200. A
deity that has allocated no power earns 64 bits per world second, so it can pay a price `p ≤ 1920` after
`(p − 200) / 64` world seconds from the start (world time does not run in planning), and can never pay more than 1920.

| policy | language | summon price | structure | names | literals | expected act cost (read + change) | affordable (≤ 1920) | world seconds to save from 200 |
|---|---|---|---|---|---|---|---|---|
| random | Python | **142.6** | 85.6 | 34.4 | 21.8 | 14.9–15.0 (0 + 15.0) | yes, in planning | 0 |
| random | TypeScript | 304.2 | 225.5 | 60.5 | 17.0 | 14.5 (0 + 14.5) | yes | 1.6 |
| greedy | Python | **737.9** | 420.0 | 178.7 | 137.6 | 17.97 (1.66 + 16.31) | yes | 8.4 |
| greedy | TypeScript | 1319.7 | 974.6 | 220.6 | 123.0 | 17.97 | yes | 17.5 |
| considerate | Python | **1179.2** | 670.1 | 322.5 | 183.8 | 17.97 | yes | 15.3 |
| considerate | TypeScript | 2019.3 | 1456.7 | 373.4 | 187.0 | 17.97 | **no** | never |
| payoff | Python | **1599.4** | 753.7 | 326.6 | 515.9 | 17.81 | yes | 21.9 |
| payoff | TypeScript | 2646.8 | 1777.5 | 401.7 | 464.5 | 17.81 | **no** | never |
| cooperator | Python | **1796.9** | 872.0 | 405.9 | 515.9 | 17.81 | yes | 25.0 |
| cooperator | TypeScript | 2916.7 | 1955.2 | 494.3 | 464.5 | 17.81 | **no** | never |
| deny | Python | **1611.7** | 761.4 | 326.6 | 520.5 | 17.89 | yes | 22.1 |
| deny | TypeScript | 2660.7 | 1788.5 | 401.7 | 467.5 | 17.89 | **no** | never |
| payoff, formula proxy | Python | 1397.8 | 767.8 | 362.4 | 264.3 | 17.89 | yes | 18.7 |
| cooperator, formula proxy | Python | 1595.2 | 886.1 | 441.7 | 264.3 | 17.89 | yes | 21.8 |
| deny, formula proxy | Python | 1410.1 | 775.5 | 362.4 | 268.9 | 17.89 | yes | 18.9 |

(The parts also include 1–3 bits of move flags, not shown; the expected act cost is the examination's mean over 202
reference objects, where an act that skips pays only its 1.66 bits of reading.)

Python is cheaper for every policy, by a factor of 1.6 to 2.1: Python is priced by `ast-bits-v1` (corpus-weighted
grammar), TypeScript by `ts-ast-bits-v1-uniform` (uniform over node kinds, so its structure bits are about 2.3× Python's
for the same program).

For comparison, the generic greedy the engine games use (`artifacts/engine/scripts/coordination-games.ts`
`greedySource`: the card's Python source verbatim plus a board rebuilt from the prelude's `Cell` and `Grid`) costs
1093.5 (Leapfrog) to 1423.9 (Two Pair) bits in Python; the same idea in TypeScript costs 2406–3018 bits, over the
capacity.

## Limits

Every program was examined on the real runtime: 202 reference acts each plus two passes over a 16-object sample
world, with 0% invalid or failing acts for the deterministic ones (a step-limit or time-limit hit would be a failing
act), under the default `stepBudget` 500,000 and `interactionComputeMs` 1000. The examination does not report the
step count itself.

## What an agent can and cannot do

- **No edit or replace.** The game commands are `validate`, `summon`, `pause`, `destroy`, `allocatePower` (plus `chat`
  and `ready`): `lib/player-client/src/protocol.ts:38`. A god changes a program by destroying the agent and summoning
  another. Destroying is free but "Energy already spent is not refunded", the agent row (with its stored energy) is
  deleted and only its power share returns to the deity (`artifacts/engine/convex/game/commands.ts:251-264`). The new
  agent pays its full summon price and starts with zero energy (`newAgentAccount`, `lib/game-core/src/energy.ts:107`).
- **One object only.** An act receives the agent's source, the one object's value, the room's settings and a seed
  (`artifacts/engine/convex/engine/tick.ts:209`, `engine/runtime.ts:127-135`). The clock is virtual (every act starts
  at 2026-01-01T00:00:00Z), `random` is seeded per (game, agent, act index), and there is no file system or network
  (`lib/game-runtime/README.md:357-412`). So an agent cannot see the time, scores, other objects, other agents, or
  its own energy or history; anything about the rivals (their rules, a bits lookup) must be in its source, where it is
  paid for at the summon.
