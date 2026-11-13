# ✌️ Two Pair's tiers: measurements (4×4 digits)

Code: `lib/game-utilities/src/families/grid/layered/pair-tiers.ts` (the base in `beginner/two_pair.ts` is unchanged).
Scripts, all run from `lib/game-utilities`:

- `node --experimental-strip-types scripts/tier-sweep.ts two_pair --gate` (the gate);
- `node --experimental-strip-types scripts/tier-sweep.ts two_pair '<json>'` (liveness through the card's own code);
- `node --experimental-strip-types scripts/two-pair-exact.ts` (the link tiers' tops, exactly).

## The base

| | |
|---|---|
| Units | the 4 corner boxes, disjoint, each scoring [two different pairs, one pair or three of a kind] |
| Top | [4, 0] at 20.84 bits (exact: 270 of 10⁴ fillings of a box hold two different pairs) |
| `DIFF`, `K`, `rate4` | 0, 3.0, 2.46 (design §5.4; the sampled top there reads 21.4) |
| Greedy, 4 moves (400 starts) | mean 2.79 boxes; histogram 0..4: 0/0/121/240/39 |
| Greedy, 10 moves | 4 boxes on 400 of 400 starts |
| Greedy, 20 moves | 4 boxes on 400 of 400 starts |

**Gate: 4** (every box), the base's greedy ten-move level. The card says "First get 4 boxes with two different pairs".

## The interactions

A box's *pairs* are the numbers it shows exactly twice. Two boxes that share a border are *linked* when exactly one
number is a pair in both (3 3 8 8 beside 3 3 5 5). The four corner boxes make a ring of four possible links. A board of
two numbers has no link (its boxes share both pairs), so every link tier breaks the base's degenerate top.

| id | Card sentence | Param |
|---|---|---|
| `links` | Each link scores a point. | – |
| `linkSums` | Each link whose two boxes add up to x together scores a point. | x |
| `linksVia` | Each link whose shared number is y scores a point. | y |
| `equalRoads` | Equal numbers that touch side by side make a road. Each road of exactly y cells scores a point. | y |

### Exact tops of the link tiers

At the base's top a link depends only on which two numbers each box holds, so the tier's law there is a count over 45⁴
choices (the 6 arrangements of each box cancel). `scripts/two-pair-exact.ts`:

| tier | tierTop | choices at the top (of 45⁴) | added bits (exact) | verdict |
|---|--:|--:|--:|---|
| links | 4 | 77,760 | 5.72 | under the band by 0.3 bits: Lab only |
| linksVia (any y) | 4 | 4,104 | 9.96 | **dealt**, y = 0..9, one table |
| linkSums, any odd x | 0 | 0 | dead | never dealt (a link's eight numbers are 4a + 2b + 2c) |
| linkSums x ≤ 4, x ≥ 68 | 0 | 0 | dead | |
| linkSums x = 6 (66) | 4 | 2 | 20.97 | above the cap |
| linkSums x = 8 (64) | 4 | 8 | 18.97 | held back: too close to the cap for a sampled law |
| linkSums x = 10 (62) | 4 | 16 | 17.97 | held back |
| linkSums x = 12 (60) | 4 | 10 | 18.65 | held back |
| linkSums x = 14 (58) | 4 | 30 | 17.06 | **dealt** |
| linkSums x = 16 (56) | 4 | 36 | 16.80 | **dealt** |
| linkSums x = 18 (54) | 4 | 46 | 16.44 | **dealt** |
| linkSums x = 20 (52) | 4 | 42 | 16.58 | **dealt** |
| linkSums x = 22 (50) | 4 | 72 | 15.80 | **dealt** |
| linkSums x = 24 (48) | 4 | 60 | 16.06 | **dealt** |
| linkSums x = 26 (46) | 4 | 82 | 15.61 | **dealt** |
| linkSums x = 28 (44) | 4 | 64 | 15.97 | **dealt** |
| linkSums x = 30 (42) | 4 | 88 | 15.51 | **dealt** |
| linkSums x = 32 (40) | 4 | 76 | 15.72 | **dealt** |
| linkSums x = 34 (38) | 4 | 96 | 15.38 | **dealt** |
| linkSums x = 36 | 4 | 64 | 15.97 | **dealt** (agrees with Opposite Nines: see below) |

`linkSums` is the wide-ranged tier: 23 dealt values (every even x from 14 to 58), 12 tables (x ~ 72 − x: replacing
every digit d by 9 − d keeps pairs and links), all within 1.7 bits of each other.

### Through the card (hybrid law, `scripts/tier-sweep.ts`)

Columns: tier's top at the base's top, bits added over the base's top, bits of the rule's top, the best board found,
the liveness check's problems. "build s" was measured on a machine shared with other jobs.

| value | tierTop | addedBits | top bits | best board | build s | problems |
|---|--:|--:|--:|---|--:|---|
| links | 4 | 5.7 | 26.6 | 1121/6612/6662/9962 | 21 | adds only 5.7 bits |
| linksVia y = 0 | 4 | 9.9 | 30.8 | 2201/0010/0070/8870 | 61 | none |
| linksVia y = 7 | 4 | 10.0 | 30.8 | 7774/5547/6707/7607 | 103 | none |
| linkSums x = 6 | 4 | 21.9 | 42.8 | 1022/0100/2001/0210 | 51 | adds 21.9 bits, above the cap of 20 |
| linkSums x = 8 | 4 | 18.4 | 39.3 | 1112/0012/1111/2200 | 53 | none (held back) |
| linkSums x = 10 | 4 | 18.3 | 39.1 | 4401/0010/0013/1113 | 71 | none (held back) |
| linkSums x = 12 | 4 | 19.0 | 39.8 | 5001/0501/0000/1155 | 80 | none (held back) |
| linkSums x = 14 | 4 | 17.5 | 38.3 | 1055/0111/6000/6011 | 29 | none |
| linkSums x = 16 | 4 | 17.4 | 38.2 | 0044/2222/0602/0620 | 74 | none |
| linkSums x = 18 | 4 | 16.8 | 37.7 | 1222/1244/5121/1512 | 97 | none |
| linkSums x = 20 | 4 | 16.6 | 37.5 | 3077/3000/0000/7733 | 63 | none |
| linkSums x = 21 | 0 | 0.0 | 20.8 | – | 12 | the tier does not vary on the boards that max the base |
| linkSums x = 22 | 4 | 16.1 | 36.9 | 4115/4115/5541/1141 | 90 | none |
| linkSums x = 24 | 4 | 16.3 | 37.1 | 2222/5533/2325/2352 | 98 | none |
| linkSums x = 26 | 4 | 16.0 | 36.8 | 0061/6661/1655/1611 | 43 | none |
| linkSums x = 28 | 4 | 16.1 | 37.0 | 7713/3331/1377/1333 | 82 | none |
| linkSums x = 30 | 4 | 15.5 | 36.4 | 1855/1811/1181/5581 | 82 | none |
| linkSums x = 32 | 4 | 16.0 | 36.9 | 3463/3436/4433/5544 | 56 | none |
| linkSums x = 34 | 4 | 15.3 | 36.1 | 1817/8171/7172/1772 | 89 | none |
| linkSums x = 36 | 4 | 15.4 | 36.3 | 8862/2262/2282/6628 | 93 | none |
| linkSums x = 40 | 4 | 15.5 | 36.3 | 8833/1188/3363/8836 | 43 | none |
| linkSums x = 66 | 4 | 20.8 | 41.7 | 9879/9897/7989/9798 | 50 | adds 20.8 bits, above the cap of 20 |
| equalRoads y = 1 | 16 | 7.6 | 28.4 | 9012/0921/1048/0184 | 47 | a two-digit board reaches the top (the checkerboard) |
| equalRoads y = 2 | 8 | 3.4 | 24.3 | 7782/9982/2277/9900 | 58 | adds only 3.4 bits |
| equalRoads y = 3 | 4 | 14.5 | 35.3 | 7772/9927/8987/9887 | 97 | none: **dealt** |
| equalRoads y = 4 | 4 | 15.7 | 36.5 | 5557/9957/9007/9007 | 71 | a two-digit board reaches the top (stripes `0000/1111/0000/1111`) |
| equalRoads y = 5 | 2 | 16.5 | 37.3 | 6122/6111/6661/9916 | 50 | none: **dealt** |
| equalRoads y = 6 | 2 | 19.1 | 40.0 | 5099/5000/5550/8850 | 58 | none (held back: within a bit of the cap) |
| equalRoads y = 7 | 1 | 9.8 | 30.7 | 2446/4246/4445/3354 | 39 | none, but one road at most: a cliff, not a count (§2.3 rule 3) |
| equalRoads y = 8 | 1 | 11.0 | 31.8 | 7714/4414/4444/8877 | 32 | none, but one road at most |

The hybrid law reads the link tiers within 0.9 bits of the exact counts (largest gap: x = 6, 21.9 against 20.97).

Against the design (§5.4): "same-number roads of exactly 4" is alive by the splitting (15.7 bits) but stripes of two
numbers top it, so it is refused; y = 6 is alive here (19.1 bits), not dead (the prototype's road was restricted
differently). y = 3 and y = 5 are the dealt road values.

## What is dealt

| interaction | values | tables | added bits |
|---|---|--:|---|
| linkSums | x = 14, 16, …, 58 | 12 | 15.4 to 17.1 (exact) |
| linksVia | y = 0..9 | 1 | 9.96 (exact) |
| equalRoads | y = 3, 5 | 2 | 14.5, 16.5 (hybrid) |
| Lab: links | – | 1 | 5.72 (exact) |

Compare (plain and unlock compositions, Lab): linkSums x = 36.

## Agreement with partners (§8.1)

- **linkSums x = 36 × Opposite Nines.** On a board where every opposite pair adds up to 9, the bottom-right box is the
  top-left box with every digit d turned into 9 − d, and likewise the other two. A link of total x at the top then has a
  mirror link of total 72 − x at the bottom, so x = 36 is the one total all four links can share: the Opposite Nines
  player's board and the ring agree there. Not measured as `SYN`.
- **linksVia y × Mirrormancer "holding two ys".** Both ask for pairs of the same y. Not measured.

## The shipped tables against the exact law (2026-11-13)

The exact count above is now the reference law `tiered-profile --check` uses, so every shipped link table is compared
with it level by level (`twoPairTopCounts`/`twoPairExactTop` in `scripts/tiered-profile.ts`; the script
`two-pair-exact.ts` prints the same count):

```sh
node --experimental-strip-types scripts/tiered-profile.ts --families two_pair --no-profile --check
```

| table | added bits, shipped | added bits, exact | max error over all levels |
|---|--:|--:|--:|
| `linkSums` x = 14 | 17.46 | 17.06 | **0.63** |
| x = 16 | 17.37 | 16.80 | 0.57 |
| x = 36 | 15.42 | 15.97 | 0.55 |
| x = 18 | 16.85 | 16.44 | 0.46 |
| x = 26 | 15.98 | 15.61 | 0.43 |
| x = 32 | 16.01 | 15.72 | 0.29 |
| x = 22 | 16.06 | 15.80 | 0.26 |
| x = 24 | 16.27 | 16.06 | 0.21 |
| x = 28 | 16.13 | 15.97 | 0.17 |
| x = 20 | 16.62 | 16.58 | 0.16 |
| x = 34 | 15.28 | 15.38 | 0.10 |
| x = 30 | 15.54 | 15.51 | 0.09 |
| `linksVia` y = 0 (every y) | 9.93 | 9.96 | 0.05 |
| `links` (Lab) | 5.72 | 5.72 | 0.03 |

Thirteen of the fifteen dealt tables, and the Lab one, are **within 0.63 bits of the exact law at every level** — well
inside the 1-bit bound the tables declare. No level was missed. `equalRoads` is the exception: it reads arrangements
inside the boxes and roads across them, which the 45⁴ count cannot see, so its two tables are still unchecked.

## Not done

- No `SYN` runs, no agent runs (base-only against tier-aware greedy) for these tiers.
- `equalRoads` y = 3 and y = 5 have no reference law.
- Only 4×4 digits. On 6×6 the code runs (9 boxes, 12 possible links) but nothing is dealt and nothing was measured.
