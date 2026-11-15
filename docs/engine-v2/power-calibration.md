# Power calibration (owner decisions 38 and 40)

Analysis and options only, 15 November 2026: no preset or economy constant is changed here. The measuring script is
`pnpm --filter @workspace/v2-agents power-check` (`lib/v2-agents/scripts/power-check.ts`). The only code change is an
experiment knob on the in-memory table: `summonScale` in `lib/v2-agents/src/table.ts`, which multiplies summon and edit
prices so that scaled prices can be tried.

**Outcome.** Owner decision 42 replaced the target heights below with two virtues, balance (fairness across rules and
dealt values) and dynamism (no early standstill, no dominant strategy, no settled optimum), with hundreds of bits as a
sanity bound. The coordinator chose **4 ⚡/s, 300 start (grids 450), 240 s store, summon and edit prices × power/8**
(coordinator's call 17 in `owner-decisions.md`). The numbers below predate #687 (code C3 and prime tails) and are
re-run on the new values, with and without parameter drift (call 18) and with the prime filters.

The owner's targets as first read (superseded by decision 42):

- Decision 38: it should be really hard to reach 20 or 30 bits on an object, and hundreds should be out of reach.
- Decision 40: one player with no opposition may fairly easily get past 20 bits. A state worth at least 20 bits to each
  of two seated players on the same object should take hard work, because the rules pull roughly at right angles.

## A. Why bits jumped from v1's grids to v2's lines

The account for the owner, in eight lines:

1. **v1's beginner board had a ceiling.** It was 16 digits, 0 to 9, so it can hold at most 16·log2 10 = 53.2 bits.
   The eight rules dealt there topped out at 14.8 to 26.6 bits in the calibration tables (other settings of the same
   families reach 46). Three-player greedy play ended at 9.7 to 19.5 bits per object for its own rule, 47 to 59% of the
   top.
2. **v1 did not have less energy; it had more.** Each player got 600 + 64 ⚡/s × 300 s = 19,800 ⚡ a game, 3.7 times
   v2's 5,400. A one-step move (±1 on a digit, distance-v1: W = 4 + 1.585·|k| and C = W + 0.05·W²) cost 7.1 ⚡.
3. **So in v1, income stopped mattering at the top.** Greedy play earned about 0.2 bits per ⚡ over its first 64 ⚡.
   Once a rule reached its top, more energy bought nothing.
4. **A v2 line has no top.** Its coefficients are unbounded, and its read length φ grows by about ½ bit per unit of a
   coefficient: φ(y = 2x + 31) = 28.8 and φ(y = 2x + 1009) = 517.8. The value tails follow φ (decision 30: a tail
   never grows faster than the φ of the cheapest state that reaches it), so a "bigger is better" rule pays about a bit
   per bit of φ. Prime Landing with the big-prime tie-breaker scores 21 bits at y = 2x + 31, 58 at 2x + 101, 534 at
   2x + 1009 and 5,254 at 2x + 10007. Prime Gradient with c-spf scores 802 at 2x + 1009.
5. **A step costs about what it did in v1.** `si.shift ±1` costs W = 4.3 (plus a 0.5 surcharge on the way up), a charge
   of 5.3 to 6.0 ⚡. The surcharge alone works out to about 1 ⚡ per bit of φ. The fees dominate, so walking up a hill one
   unit at a time costs about 6 to 11 ⚡ per bit. Measured straight walks from births find rises at 1.2 to 4.6 ⚡ per bit
   on the best hills. One big jump costs far more because of the β·W² term: `si.shift 100` charges 12,090 ⚡.
6. **v2 kept income in the thousands on hills with no top.** At 8 ⚡/s for 600 s plus 600 at the start, a player gets
   5,400 ⚡. That is enough to walk a hill to about 500 to 900 bits in principle. A plain unit walk measured 87 bits on
   big-prime, and the shortcut climber reached 131.8 bits in play.
7. **A single cheap act can also land high.** Births sit at φ 15 to 33. In one game, another seat's single ~90 ⚡ act
   left Prime Landing with m-gpf at 37.9 bits, because the tail pays 0.52 bits per unit of m's largest prime factor.
   That happened at every power level tried, 1 to 8 ⚡/s.
8. **Verdict.** The coordinator's hypothesis holds, with one correction. The cause is an unbounded tail (bits ∝ φ ∝
   coefficient) turning ordinary income into height. It is not higher income, since v1 had more. Typical heights did
   not jump: the median end bits per (object, rule) is about 5.5 in v2. What jumped are the peaks.

Sources:

- v1:
  - `origin/archive/engine-v1:lib/game-core/src/settings.ts` (ANNOTATED_BASICS_PATCH; Grid TYPE_DEFAULTS 64 ⚡/s, 600
    start; DEFAULT_FULL_CHARGE_SECONDS 30);
  - `lib/game-utilities/data/calibration/v1/Grid(4,base10,mono).json`;
  - `docs/energy-model.md` §4.5;
  - `docs/rule-difficulty.md` §6.4 (rateE 0.18 to 0.22 bits/⚡ under distance-v1);
  - `docs/beginner-pool.md` (3-player greedy own bits).
- v2:
  - `lib/v2-economy/src/settings.ts`;
  - `lib/v2-valuation/values/line-q` (top knots of the beginner pool: 6.2 to 18.0 bits, each with a linear tail);
  - probes of `lineType.readLength` and `EngineHost.price`.

## B. Calibration options

### Setup

- 3 Hz room-wide, 600 s, 3 starting objects plus 1 birth every 240 s, β 0.05, read price 1/κ with κ = 32. This is
  today's read price; it was not varied here.
- Three rules from three different families of `lines-beginner` (line-q; Exact Change is not dealt), drawn by seed.
  Seeds `power-g0..2` are the same deals in every option.
- Each deal is played three ways:
  - "plain": the shipped simple starters;
  - "shortcut": the shortcut climber from `scripts/climbers.ts`, which adds stretch, pivot and mirror moves;
  - "alone": one of the three rules plays with no other seat, using a climber that takes the step best for its own
    rarity, with the shortcut moves added.
- No `dilate` helper exists in v2-economy yet, so the games ran in real world time: 3 games per option and climber. The
  machine was shared, so the whole grid took 412 s of wall time.
- Read this as a small sample. "Max" is the highest over 3 games; the bracket is the mean of the per-game maxima.

### Options

- An option written `P:start:store` means power P in ⚡/s, starting energy in ⚡, and store in seconds.
- A trailing `s` means summon prices are scaled to price × P/8, the same seconds of full power as at 8 ⚡/s.
- Income is start + P × 600.

| option | climber | income ⚡/player | starter price vs planning store; 2nd summon | peak bits max (mean) | joint: 2nd-highest seat on one object, max (mean) | objects with 2 seats ≥20 / ≥30 (end; ever) | median end bits (object, rule) | acts / moves per seat-min | bits per ⚡ spent | alone: peak max (mean) | alone acts / moves per min |
|---|---|--:|---|--:|--:|--:|--:|--:|--:|--:|--:|
| **8:600:240 (now)** | plain | 5400 | 425–543 in 600; 215 s | 37.9 (22.4) | 7.7 (7.5) | 0% / 0%; 0 games | 5.5 | 58.1 / 5.7 | 0.042 | 12.1 (9.4) | 161 / 0.8 |
| 8:600:240 | shortcut | 5400 | (as above) | **131.8** (54.1) | 9.3 (8.3) | 0% / 0%; 0 games | 5.9 | 52.2 / 4.9 | 0.046 | | |
| 2:600:300 | plain | 1800 | 425–543 in 600; **never** | 37.9 (20.3) | 7.7 (7.2) | 0% / 0% | 5.5 | 17.9 / 1.0 | 0.041 | 12.1 (10.1) | 31 / 1.0 |
| 2:600:300 | shortcut | 1800 | | 37.9 (22.3) | 9.3 (8.0) | 0% / 0% | 5.5 | 13.1 / 1.1 | 0.043 | | |
| 1:600:600 | plain | 1200 | 425–543 in 600; **never** | 37.9 (19.8) | 8.2 (7.7) | 0% / 0% | 5.1 | 7.3 / 0.7 | 0.046 | 12.1 (10.0) | 3.6 / 0.7 |
| 1:600:600 | shortcut | 1200 | | 37.9 (21.9) | 8.2 (8.0) | 0% / 0% | 5.6 | 3.8 / 1.1 | 0.075 | | |
| 4:300:240s | plain | 2700 | 213–271 in 300; 215 s | 37.9 (22.4) | 7.7 (7.5) | 0% / 0% | 5.5 | 48.7 / 3.2 | 0.036 | 12.1 (9.4) | 124 / 0.9 |
| 4:300:240s | shortcut | 2700 | | 37.9 (20.8) | 9.3 (8.0) | 0% / 0% | 5.9 | 36.3 / 2.0 | 0.028 | | |
| **2:150:240s** | plain | 1350 | 106–136 in 150; 215 s | 37.9 (19.8) | 8.2 (7.7) | 0% / 0% | 5.5 | 31.5 / 1.3 | 0.020 | 12.1 (10.1) | 43 / 1.1 |
| 2:150:240s | shortcut | 1350 | | 37.9 (21.9) | 9.3 (8.3) | 0% / 0% | 6.5 | 15.1 / 1.6 | 0.046 | | |
| 1:75:240s | plain | 675 | 53–68 in 75; 215 s | 37.9 (21.2) | 8.2 (7.7) | 0% / 0% | 5.5 | 13.8 / 0.8 | 0.044 | 12.5 (11.0) | 4.7 / 1.1 |
| 1:75:240s | shortcut | 675 | | 37.9 (19.8) | 9.3 (8.3) | 0% / 0% | 5.6 | 5.3 / 1.2 | 0.065 | | |

### What a budget buys on one hill

This is the straight walk from `power-check` with `--hills yes`, the default. From 3 births it takes unit
shifts or tilts in one direction, priced exactly, with no reads and no search. It is a lower bound on a
determined unopposed climber.

| rule | birth bits median / p90 / max | 300 ⚡ | 675 ⚡ | 1,560 ⚡ | 2,940 ⚡ | 5,400 ⚡ |
|---|--:|--:|--:|--:|--:|--:|
| prime-landing/big-prime | 1.0 / 3.9 / 8.7 | 21.1 | 35.8 | 51.6 | 64.2 | 87.2 |
| whole-crossing/m-spf | 1.2 / 1.8 / 16.4 | 10.8 | 16.4 | 23.0 | 31.9 | 40.3 |
| prime-gradient/prime | 1.0 / 3.2 / 8.6 | 11.1 | 15.2 | 19.9 | 26.3 | 32.3 |
| whole-crossing/k-gpf | 1.2 / 2.9 / 10.4 | 7.6 | 12.9 | 18.5 | 23.0 | 30.9 |
| the other 37 rules in the pool | births ≤ 12.6 | ≤ 12.2 | ≤ 14.2 | ≤ 14.2 | ≤ 14.2 | ≤ 14.2 |

No newborn line holds 20 bits for any rule in a sample of 300. All 41 rows print with the script.

### Findings

- **The joint target (decision 40) already holds at every power level tried, including today's.** No object ever had
  two seats at 20 or more bits. The highest second-best seat on any object was 9.3 bits. The beginner pool's rules
  already pull apart, and power does not change that.
- **Power controls the long climb, not the cheap peaks.**
  - Only today's 8 ⚡/s let a climber walk past ~40 bits (131.8 bits; mean game maximum 54).
  - At 4 ⚡/s and below, no game passed 37.9.
  - The 37.9 itself is reached at every power level: one cheap act lands on a large prime factor (finding 7 in §A). That
    is a value-tail and birth problem, and power cannot fix it. It belongs to the coming regeneration of values (the C3
    law and tails without maxima). Re-run this check after it.
- **The unopposed climb is limited by search, not energy, at these budgets.** The "alone" climber gets 10 to 12.5 bits
  at any power. Its greedy steps stall in prime gaps.
  - The straight walk shows what a determined climber buys: about 36 bits on the best hill with 675 ⚡, 52 with 1,560 ⚡,
    and 87 with 5,400 ⚡.
  - So "unopposed past 20 fairly easily" (decision 40) holds for a deliberate climber at 1,350 ⚡ or more, on the hills
    the pool offers. "Hundreds unreachable" needs income well under ~5,000 ⚡ per player: hundreds take about 900+ unit
    steps, each charged 5 to 6 ⚡.
- **Typical heights do not move with power.** The median end bits per (object, rule) is 5.1 to 6.5 in every option.
- **Watchability.** Acts are offered at 3 Hz whatever the power, but an agent with no energy is skipped.
  - Moves that change an object, per seat per minute: 5.7 at 8 ⚡/s, 3.2 at 4, 1.3 to 1.6 at 2, and 0.7 to 1.2 at 1.
  - At 1 ⚡/s a table of three changes an object only about every 20 s, which is dull to watch.
- **Summons must scale with power.**
  - Unscaled prices (425 to 543 ⚡ for the simple starters) need a store of at least ~543/P seconds.
  - At 2 ⚡/s and 1 ⚡/s with unscaled prices, the own store can never hold a second starter. The first summon leaves
    the player at half power, a store of 0.5·P·T, which is below 543. The player gets one agent a game and no edits.
  - With prices × P/8, every option keeps the second summon about 215 s away, as today. That meets the owner's earlier
    requirement that a summon cost "seconds of full God power". Today a starter is 53 to 68 s of full power.

### Recommendation

1. Move to **2 ⚡/s, 150 ⚡ starting energy, 240 s store, with summon and edit prices scaled by power/8**: option
   2:150:240s.
   - Income falls from 5,400 to 1,350 ⚡ a player, a quarter.
   - The long climb past ~40 bits stops: the best straight walk reaches ~50 bits with the whole income on one hill.
   - Today's joint behaviour is kept: no two seats at 20.
   - Starters stay payable in planning, and a second summon is still ~215 s away.
   - Agents still act 15 to 30 times a minute, with 1.3 to 1.6 committed moves.
2. If games feel dead at 2 ⚡/s, use **4:300:240s** (2,700 ⚡) instead. It keeps more motion (3.2 moves per seat-minute),
   and in these runs it still capped peaks at 37.9.
3. Do not use 1 ⚡/s. Motion falls under one move per seat per minute.
4. Make the summon-price scaling a rule of the economy rather than a table knob. `SUMMON_ENERGY_PER_BIT`
   (lib/v2-agents summon.ts, 1/6 today) becomes (1/6)·(P/8) per bit. Equivalently, the price is stated in seconds of the
   player's full power. Editing this constant was out of scope here.
5. Fix the cheap ~38-bit peaks in the values, not in power. A tail that pays linearly in a prime factor lets one act
   from a birth (φ 15 to 33) land 30 bits high. Re-run `power-check` after the values are regenerated, before settling
   the power level.

## Re-running

```
pnpm --filter @workspace/v2-agents power-check -- \
  --options 8:600:240,2:600:300,1:600:600,4:300:240s,2:150:240s,1:75:240s --games 3 --jobs 4
# hills and births only (seconds): --games 0
# more seeds: --games 6; one climber: --climber plain; no unopposed runs: --alone no; JSON: --json
```

When v2-economy gains `dilate(settings, factor)`, pass the dilated economy through `economyOf` in the script. That will
allow more seeds in the same time.
