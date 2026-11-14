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
