# Expert pairs (two tiers): measurements (4×4 digits)

An expert draw carries two interactions: its ordinal is `[...base, gate ? tier1 : 0, gate ? tier2 : 0]`, so the second
tier breaks ties among boards equal on the base and on the first tier. A family lists its pairs in
`GridTiers.dealtPairs`; the seeded admin-only setup "Expert tiered rules" (`ruleTiers: { depth: 2 }`) deals them.

**Band.** The liveness check is run on the pair (the law's tier is the tuple) with a band of **6 to 26 bits** for the
two tiers together over the base's top (one tier: 6 to 20). `test/tiers.test.ts` passes the same band (`EXPERT_BAND`)
when it re-checks the shipped tables.

**Canonical pairs only.** `canonicalTiers` folds each value of a pair by its own interaction's symmetry (lines
x ~ 36 − x, squares x ~ 36 − x, holding: every y to 0, halves x ~ 18 − x). For a pair that is right only when one
symmetry of the board does both folds at once. So every dealt pair is its own canonical form (both totals ≤ 18;
holding y = 0 with halves x ≤ 9), and `test/tiers.test.ts` asserts it. A joint canonical form would allow more pairs
(for example lines 20 + squares 16); that is a change to `src/families/grid/tiers.ts`, not made here.

Scripts (from `lib/game-utilities`):

- `node --experimental-strip-types scripts/tier-sweep.ts <family> '[[tier1, tier2], …]' --band 6,26` (hybrid law through the card);
- `node --experimental-strip-types scripts/nines-pairs-exact.ts` (Opposite Nines: all 10⁸ top boards);
- `node --experimental-strip-types scripts/tier-top-search.ts <family> '[tier1, tier2]' <board>` (a plateau walk from the law's best board, looking for a level the splitting missed).

## 🙃 Opposite Nines: lines x, then squares x′ (gate 6, base top 26.6 bits)

| pair | tier top | added bits (hybrid) | added bits (exact) | top bits | levels | best board | build s | problems | |
|---|---|--:|--:|--:|--:|---|--:|---|---|
| lines 18 + squares 16 | [10, 2] | 18.6 | 18.58 (256 boards) | 45.2 | 1217 | 3573/7317/2862/6246 | 85 | none | **dealt** |
| lines 16 + squares 16 | [4, 4] | 15.9 | 15.77 (1,792) | 42.5 | 1060 | 3458/4561/8345/1456 | 207 | none | **dealt** |
| lines 14 + squares 16 | [4, 2] | 15.6 | 15.77 (1,792) | 42.2 | 1021 | 8455/6475/4253/4451 | 112 | none | **dealt** |
| lines 16 + squares 14 | [4, 3] | 17.7 | 17.53 (528) | 44.3 | 1021 | 8026/0664/5339/3791 | 144 | none | **dealt** |
| lines 17 + squares 16 | [4, 1] | 12.8 | 12.93 (12,840) | 39.4 | 945 | 4465/5743/6524/4355 | 75 | none | not dealt: one square at most |
| lines 14 + squares 14 | [4, 4] | 17.0 | 16.99 (768) | 43.6 | 1058 | 1850/8545/4541/9418 | 90 | none | alive, not dealt (four pairs is the limit asked for) |
| lines 17 + squares 14 | [4, 0] | not run | 10.93 | | | | | | the second tier is dead at the top |
| lines 18 + squares 14 | [10, 2] | not run | 19.41 (144) | | | | | | not dealt |

The exact column counts every board whose opposite pairs all add up to 9 (the first 8 cells fix the board). The hybrid
law is within 0.2 bits of it on all six pairs it was run on, and found the true top each time.

## 🪞 Mirrormancer: holding y, then halves x (gate 3, base top 26.6 bits)

Exact at the base's top: four different mirrors holding exactly two ys are four of the 18 mirrors `y a a y` and
`a y y a` (a ≠ y). A half that adds up to x with two different numbers, among those, needs a = x − y: two mirrors. So the
top is [4, 2], held by 4! · C(16, 2) = 2,880 of the 10⁸ top boards: **15.08 bits**, for every y and every x with
0 ≤ x − y ≤ 9, x ≠ 2y.

| pair | tier top | added bits (hybrid) | added bits (exact) | top bits | levels | best board | build s | problems | |
|---|---|--:|--:|--:|--:|---|--:|---|---|
| holding 0 + halves 9 | [4, 2] | 15.0 | 15.08 | 41.6 | 58 | 9009/0990/0110/6006 | 62 | none | **dealt** |
| holding 0 + halves 8 | [4, 2] | 15.2 | 15.08 | 41.7 | 58 | 6006/0880/8008/2002 | 66 | none | **dealt** |
| holding 0 + halves 7 | [4, 2] | 15.1 | 15.08 | 41.6 | 58 | 0770/0990/7007/0440 | 79 | none | **dealt** |

Only y = 0 is dealt (see "Canonical pairs only"): with a joint canonical form any y with x − y in range would do.

## 🫅 Kings and Subjects: pairs x, then sameRoads y (gate 4, base top 14.8 bits)

| pair | tier top | added bits (hybrid) | top bits | levels | best board | build s | problems | |
|---|---|--:|--:|--:|---|--:|---|---|
| pairs 2 + sameRoads 4 | [6, 1] | 17.2 | 32.0 | 196 | 2624/4006/1111/4220 | 78 | none | **dealt** |
| pairs 3 + sameRoads 4 | [6, 1] | 18.0 | 32.8 | 196 | 3635/3080/0111/2124 | 93 | none | **dealt** |
| pairs 1 + sameRoads 4 | [6, 1] | 18.7 | 33.5 | 195 | 1814/7005/8001/9121 | 30 | none | not dealt (no second search run) |
| pairs 5 + sameRoads 4 | [6, 1] | 19.6 | 34.4 | 197 | 9583/1305/1118/7943 | 44 | none | not dealt (no second search run) |
| pairs 4 + sameRoads 4 | [6, 2] | 29.5 | 44.3 | 198 | 3337/2831/1431/3811 | 41 | above the cap of 26 | refused |
| pairs 3 + sameRoads 2 | [6, 5] | 25.7 | 40.5 | 216 | 2252/5112/3006/4115 | 144 | none | not dealt: 0.3 bits under the cap, and see below |
| pairs 4 + sameRoads 2 | [6, 6] | 39.1 | 53.9 | 221 | 2811/2402/8402/2242 | 116 | above the cap of 26 | refused |

There is no exact count here, and the tops are uneven (x = 4 allows two roads of four where x = 2 and 3 show one;
with roads of two, x = 4 reaches six where x = 3 shows five), so a missed deeper level was the worry. Checked with
`scripts/tier-top-search.ts` (4 walks of 150,000 steps, one to three cells a step, never going down):

| pair | start | result |
|---|---|---|
| pairs 3 + sameRoads 4 | 3635/3080/0111/2124, [4, 0, 6, 1] | no improvement |
| pairs 2 + sameRoads 4 | 2624/4006/1111/4220, [4, 0, 6, 1] | no improvement |
| pairs 4 + sameRoads 4 | 3635/3080/0111/2124 (scores [4, 0, 2, 1] here) | climbs to [4, 0, 6, 2] at 1114/3103/4821/2225 |

So the walk does find the second road where it exists (x = 4), and does not for x = 2 and 3. That is evidence, not
proof: if a [6, 2] board exists for x = 2 or 3, the shipped table would stop one level short of it.

## What is dealt

| family | pairs | tables |
|---|---|--:|
| opposite_nines | lines 18 + squares 16; lines 16 + squares 16; lines 14 + squares 16; lines 16 + squares 14 | 4 |
| mirrormancer | holding 0 + halves 7, 8, 9 (each axis; rows and columns share a table) | 3 |
| kings_and_subjects | pairs 2 + sameRoads 4; pairs 3 + sameRoads 4 | 2 |

Not measured: `DIFF`, `SYN`, agents, and whether a 26-bit second tier is reachable in a real game. The hybrid law's
error at 15 to 19 bits of tier was within 0.2 bits wherever an exact count exists (Opposite Nines, Mirrormancer).
