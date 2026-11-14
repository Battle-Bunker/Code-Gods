# Mixed tables: naive starters, new starters and model-backed seats

Made with `pnpm --filter @workspace/v2-agents table` on 2026-11-15 (develop after #473, with the commitments
scaffold).

**Setup**
- Three §10.5 beginner-pool rules: prime-landing/big-prime, treasure/prime-terms and whole-crossing/k-spf.
- 24 lines on line-z, 300 world seconds, the beginner economy run as the server's tick runs it:
  - 25 act opportunities a second, drawn by energy;
  - 64 power, 30 s to full charge, 600 ⚡ to start;
  - credit, and births at 0.1 a second.
- Every seat summons its starter at the first-agent share.
- Model seats then take a turn every 20 s, with the server AI seat's prompt and tools and at most 6 model calls a turn.
- Each turn's message lists the seat's deals as commitments (v2-ai `commitments.ts`). A deal stays pending until every
  one of the seat's agents skips the named lines in code, or until the seat retracts it in chat.
- Edits cost only the change. `power.allocate` takes absolute shares.
- "cheap" is the cheapest Anthropic model in v2-ai's list; "strong" is the next dearer one.

**Spend:** $1.70 in all, under the $3 cap:

| Run | Cost |
|---|--:|
| cheap, first prompt | $0.13 |
| cheap, final prompt | $0.15 |
| strong, low effort, both prompts | $0.97 |
| strong, medium effort | $0.44 |

Agent prices: the median shipped agent costs 333 ⚡ (5.2 s of full power) and the dearest 598 ⚡ (9.3 s).

| Seats (6 a row, 2 games) | Points gained (mean) | Reversal ⚡ (mean) | Edits (⚡) | Messages | Proposals | Deals accepted | Deals kept | Games with a kept deal | Commitments at the end: enacted / pending / retracted |
|---|--:|--:|---|--:|--:|--:|--:|---|---|
| Naive starters | 2,352 | 7,220 | – | 0 | 0 | – | – | – | – |
| New starters | 2,077 | 6,567 | – | 0 | 0 | – | – | – | – |
| Model seats, cheap, first prompt | 1,828 | 6,701 | 12 (186) | 45 | 19 | 13 | 10 | 2 of 2 | 26 / 0 / 0 |
| Model seats, cheap, final prompt | 1,908 | 6,584 | 14 (202) | 61 | 29 | 22 | 15 | 2 of 2 | 44 / 0 / 0 |
| Model seats, strong, low effort | 2,077 | 6,567 | 0 | 8 | 0 | 0 | 0 | 0 of 2 | – |
| Model seats, strong, medium effort | 2,077 | 6,567 | 0 | 7 | 0 | 0 | 0 | 0 of 2 | – |

In the mix tables, where each rule plays each kind once over three games, the means were: model seats 1,838,
starters 2,249 and Naive 2,283. Only one seat in a mix is model-backed, and scripted seats never chat, so no deal can
be made there.

## What it shows

- **The commitments ledger makes deals stick.** Before it, the cheapest model kept 1 of 10 accepted deals and edited
  once in 12 seat-games. With it, the cheapest model kept 15 of 22 and made 14 edits (202 ⚡ in all, about 14 ⚡ each).
  At the end every commitment was enacted in code: none was left pending and none was retracted. Follow-through was a
  scaffold problem: once the promise was in front of the seat each turn, with the exact edit and its price, the seat
  made the edit.
- **The stronger model is passive under this prompt, at low and medium effort alike.** It reads the standings and the
  chat, never lists the lines, so it never names one, and proposes nothing that can be held to. Its seats play exactly
  like the Simple starter they began with. Its messages are friendly and even algebraic ("gradient 37, y-intercept −37
  crosses at 1"), but no message named a line. So the stronger model's failure is also a prompt problem, a different
  one: it treats "a turn has only a few model calls" and "skip what you already know" as reasons to do nothing. It needs
  its own prompt tuning before it can be compared on deals.
- **Keeping deals did not win points here.** Deal-keeping model seats gained 1,908 a seat, against 2,077 for the new
  starters and 2,352 for Naive. On this pool Naive leads, and the new starters' cap of a quarter of their energy per
  move costs them. Deals that keep agents off lines also give up the moves those lines would have taken. Whether
  cooperation pays depends on which lines are in a deal. The seats choose lines they and a partner score on, but the
  edit removes every move on those lines, including ones that would raise both players. A narrower edit (only the
  moves that lower the partner) is the next step.

## Chat the model seats wrote (cheap, final prompt; first 12 messages)

- **Cy** (0 s): Hi, Cy here. My rule likes lines whose x-axis crossing is near a whole number, ideally exactly one with a big smallest prime factor. Lines 2 and 9 are good for several of us; I'd like to hear which lines you want to keep, so we can avoid moving each other's lines.
- **Ada** (21 s): Ada here. My rule likes lines whose y-intercept sits near a prime. My best lines are 8 and 20 right now. Cy, if your agent doesn't move those, I'll avoid moving lines 2 and 9 that you care about. Happy to agree on that.
- **Bo** (21 s): Bo here. My rule wants y(2) near 37 and y(1)..y(8) to be different primes. Ada, Cy: I'll keep my agent off lines 8, 20 and 2 unless someone else moves them first. If you move them, tell me which values you want so we can avoid tug-of-wars.
- **Cy** (21 s): Cy here: my agent now stays off lines 2 and 9, as agreed with Ada. Ada, your agents moved line 2 once and cost me points there, so please keep to the deal. I'll keep my hands off lines 8 and 20.
- **Ada** (41 s): Hi Cy, my agent now skips lines 2 and 9, as we agreed. It stays off both lines from here on.
- **Bo** (41 s): Bo here. Cy, I've updated my agent so it now stays off lines 8, 20 and 2, as agreed. Sorry the change came late; your agents moved line 8 twice and cost me points there, so please keep your hands off those lines too.
- **Cy** (41 s): Bo: my agent now skips lines 8, 20 and 2, as agreed. Ada's agents moved line 2 against me once; Ada, could we keep line 2 untouched by both of us? Thanks.
- **Bo** (60 s): Bo here. Cy, your agents have moved line 8 since our deal, which cost me points there. My agent is still keeping off lines 8, 20 and 2. Could you keep your agents off line 8 too? Thanks.
- **Cy** (60 s): Cy here: my agent stays off lines 2, 8, 9 and 20, as agreed with Ada and Bo. Ada and Bo, your agents have moved lines 2 and 20 since our deals and cost me points there, so please keep to them too. Thanks.
- **Ada** (120 s): Ada here: my agent's code already skips lines 2 and 9, as agreed with Cy. Cy, if you can keep your agent off line 20 and 8 for now, I'll avoid moving them too. Happy to talk if you want a different split.
- **Bo** (120 s): Bo here: my agent is keeping off lines 8, 20 and 2 as agreed. Cy, your agents moved line 8 since our deal and cost me points there, so could you keep them off line 8? Thanks.
- **Cy** (120 s): Cy here: my agent is keeping off lines 2, 8, 9 and 20 as agreed, and I'm not planning any moves there. Bo, thanks for keeping to line 8 and 20. Ada, your agents' moves on line 2 cost me points, so please keep off it too.

## With settle deals (2026-11-15, after #531)

The same 3-player mixed table on the server's economy (300 s, 2 games): Prime Landing/big-prime, Treasure/prime-terms
and Whole Crossing/k-spf. The seats ran the cheapest model with the commitments ledger and a prompt that looks for a
line state good for everyone and proposes settling lines there. Spent: $0.16.

| Seats | Points gained (mean a seat) | Deals accepted / kept | Edits | Commitments at the end: enacted / pending / retracted |
|---|--:|---|--:|---|
| Naive (all three) | 2,752 | – | – | – |
| Model seats (all three) | **3,396** | 16 / 5 | 21 (225 ⚡) | 16 / 8 / 8 |
| Model seat alone among a starter and a naive seat | 1,343 | no partner to deal with | 0 | – |

- **For the first time, deal-making model seats beat naive play.** They gained 23% more a seat, and the table's total
  beats the naive table's.
- They found shared targets in chat ("a prime y-intercept with 2m + c = 37, e.g. c = 5, m = 16" for Prime Landing and
  Treasure) and agreed to hold specific lines.
- They are still far below the coordinated optimum. Scripted agents that all settle every line at y = −x + 59 reach a
  table total of 157,701 against naive's 8,695 (docs/engine-v2/rule-compatibility.md and scripts/anarchy.ts). The seats
  have not yet used TARGET/SETTLE to settle whole sets of lines.
- A lone model seat cannot make a deal and loses to naive seats.

## Re-run after #550 (contested-line rule in the starters; "settle a whole deal in one edit" in the prompt)

The mixed table, 2 games, 300 s, the cheapest model at low effort. Spent $0.137 over 428 model calls.

| Table | Seat kind | Points gained per seat (mean) | Deals accepted / kept | Commitments enacted / pending / retracted |
|---|---|--:|--:|--:|
| models | model | 3,454 | 13 / 11 | 26 / 0 / 0 |
| mix | model | 6,044 | – | – |
| mix | starter | 3,157 | – | – |
| mix | naive | 7,654 | – | – |

- **Deals are now kept.**
  - 11 of 13 accepted deals were kept, against 5 of 16 before.
  - Every commitment ended enacted in code, against 16 / 8 / 8 before.
- **The all-model table gains about 10,400.** That is 1.3× the naive table's 8,159 ± 348 over 6 games, and about the
  same as before (3,396 a seat).
- **The model seats still never settle.**
  - They found a state good for two of them in chat ("y = 17x + 3 suits us both").
  - They still agreed to leave each other's lines alone, never to settle lines at that state.
  - A settled table pays 18× (`rule-compatibility.md`), so this gap is the next prompt target.
- **A lone model seat in "mix" gains less than the naive seats beside it** (6,044 against 7,654 a seat). Rules rotate
  over the 3 games, so this is a rough comparison.

## Model seats that talk first and settle (2026-11-14)

The prompt now has three rules:
- A seat's first job is to say what its rule wants and ask what the others' rules want.
- It proposes settle deals over every line.
- On boards, it settles only once everyone has agreed.

The deal tracker reads deals over every line and deals at a board's digits. 2 games, 300 s, the cheapest model at low
effort. Table points gained per game:

| Table | Naive | Model seats | Lowest seat-game, naive → model | Settle deals accepted / kept | Spent |
|---|--:|--:|--:|--:|--:|
| Lines (Prime Landing, Treasure, Whole Crossing) | 8,159 (6 games) | **107,195 (13×)** | 1,195 → 10,105 | 15 / 11 | $0.106 |
| Grid (Magic Eighteen, Opposite Nines, Mirrormancer) | 108,496 | **327,913 (3.0×)** | 22,633 → 36,023 | 2 deals, both kept | $0.102 |

- **Lines.** The seats said their rules in the first turn. They converged on y = −x + 59 within a minute and held every
  line there. Treasure gains least at that state (about 11,000 a game against about 48,000 for each of the others),
  yet still more than 4× its naive points.
- **Grids.**
  - One game reached 509,000. The seats found rows that suit all three ("2 7 2 7").
  - The other game reached 147,000.
  - They describe boards row by row, not as 16 digits, so the tracker counted them as plain deals, not settle deals.

## More tables: spread over 3 games, and what a deal settles (2026-11-14)

The same prompt as above, the cheapest model, 3 games each, 300 s. Table points gained, game by game:

| Table | Naive | Model seats | Mean, model / naive | Lowest seat-game, naive → model | Settle deals accepted / kept | Spent |
|---|---|---|--:|--:|--:|--:|
| Lines, conflicting (Prime Landing, Square Area, Whole Crossing) | 24,465 · 28,398 · 27,763 | 137,606 · 86,924 · 129,989 | 4.4× | 3,995 → 7,017 | 30 / 22 | $0.183 |
| Lines, 4 seats (the mixed table + Prime Gradient) | 36,573 · 29,275 · 15,990 | 116,566 · 14,423 · 30,318 | 2.0× | 2,179 → −64 | 39 / 13 | $0.241 |
| Grid (Two Pair, Strangers, Leapfrog) | 23,199 · 22,158 · 26,672 | 32,113 · 43,286 · 39,845 | 1.6× | 4,962 → 9,985 | (rows, not read as settles) | $0.127 |

- **On three-seat tables, every model game beats every naive game.**
- **The 4-seat table splits.**
  - The seats proposed two states, y = −x + 59 and y = −11x + 59. Neither is the table's best state, which is
    y = x + 59.
  - They kept only 13 of 39 deals: one game reached 4× naive, one fell below it, and one seat ended below its start.
  - The fix is agreeing one state before settling; the prompt's "Talk first" step is the place to say so.

**What a deal settles.** In every line run, the deal the seats reached was one state on every line, nearly always
y = −x + 59. Lines score independently, so one state on every line is also what maximises the table total. Sharing
gains more evenly costs total points. At the states themselves, for 24 lines:

| Table | Every line at the max-total state | Fairest found | Poorest seat | Table total |
|---|---|---|--:|--:|
| Mixed 3 | y = −x + 59: total 65,823, poorest 6,126 | every line at y = −x + 41 | +45% | −29% |
| Conflicting 3 | y = −x + 59: total 60,224, poorest 3,326 | 18 lines at y = −2x + 58, 6 at y = −x + 59 | ×2.9 | −41% |
| Mixed 4 | y = x + 59: total 72,086, poorest 3,752 | three states over the lines | +28% | −65% |

The fairest mix was found by multiplicative weights over the game-scale states, rounded to 24 lines; it is
approximate. How evenly a table should share its gains is a design question for the owner, not a defect.

## Climbers under unique objects (2026-11-14): totals and dynamics

The runs above were made before objects were unique. The settle results in them were the game collapsing to a fixed
point, which the owner has ruled a bug (CLAUDE.md, "The game is a metastable ecosystem").

These runs are scripted, with no model spend: 300 s, 3 games each. No two lines may hold the same state, and a quote
onto a held state is refused, so agents take their next-best move. Four kinds of agent:
- **Naive.**
- **Selfish:** greedy on its own rule.
- **Shipped Simple:** greedy, but on a contested line only moves that keep its own points.
- **Points climber:** each act, the move that most raises its own rarity × the others' total, read through `othersAfter`.

Table points gained (mean of 3), with the share of acts in the last minute that made no move:

| Table | Naive | Selfish | Shipped Simple | Points climber |
|---|--:|--:|--:|--:|
| Compatible (Prime Landing/m-spf, Treasure/m-spf, Prime Gradient) | 35,879 · 91% | 27,879 · 90% | 30,719 · 93% | **49,828** · 90% |
| Mixed (Prime Landing, Treasure, Whole Crossing) | 7,949 · 73% | 8,087 · 71% | 8,678 · 91% | **13,786** · 86% |
| Conflicting (Prime Landing, Square Area, Whole Crossing) | 20,707 · 61% | **20,731** · 63% | 11,269 · 90% | 11,446 · 91% |
| 4 seats (Mixed + Prime Gradient) | 17,657 · 71% | 20,155 · 74% | 23,110 · 87% | **24,715** · 64% |

**Dynamics.**
- **The boards freeze.** On every table and for every kind of agent, most late acts find no move worth making: 61–93%.
  The agents reach local optima within the 300 s game and stop, so the board converges. Only births (0.1 a second)
  bring fresh objects.
- **No one strategy dominates.**
  - Climbing for points wins three tables of four, by 1.4× to 1.7× naive.
  - It loses on the conflicting table, where refusing moves that lower one's own points stalls the climb early.
  - Selfish and naive play do best there.
- **Search.** These climbers search only 12 neighbouring moves an act (shift or tilt by up to 3), so they find local
  optima, not the table's best joint state.

**A defect to report.** A board that stops moving within one game is the static end state the owner wants to avoid.
The likely mechanisms: the whole-number neighbourhoods are small, nothing perturbs a line once it sits at a local
optimum, and births are slow. Changing any of these is the owner's call.
