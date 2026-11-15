# Playtest round 30 (2026-11-15, develop at 3773be02): does the board keep moving?

After #850 (Same on Both Rulers as a ladder: "minus a number that reads the same backwards and starts with 2 … bigger is
better"), #851 (a ladder's main part off every rung said in words) and #849 (freeze breakdown). Deploy run 689 is green.
Fresh local deployment, app build 2ce2e1d4, **time scale 1**, three full ten-minute practice games of Lines · beginner,
three cold accounts, side by side. 0 errors and 0 timeouts; every scheduled tick succeeded. Screenshots:
`docs/screenshots/playtest/round-30/`.

## The rules dealt (family / tie-breaker)

| Game | Human | Partner 1 | Partner 2 |
|---|---|---|---|
| BLEMVS (carol, 1440) | **Same on Both Rulers (ladder)** / shared-factor | Pythagorean Area / shared-factor | Prime Landing / shared-factor |
| 8WAFQF (alice, 1440) | Ruler / far | Square Area / spf | Prime Staircase / step-back |
| ND5RJY (bob, 390) | Ruler / far | Prime Staircase / step-back | Prime Gradient / shared-factor |

## Does the board keep moving?

| Game | Objects changed in each minute 0–9 | Changing moves per third | Still minutes | Lines still > 4 min | Highest bits | Own agent, last third |
|---|---|---|---|---|---|---|
| BLEMVS (carol) | 3, 1, 1, 1, 2, 2, 2, 1, 2, 2 | 24 / 23 / 30 | 0 | 2 of 5 | 10.82 | 13 moves, 2 raised her points |
| 8WAFQF (alice) | 3, **0, 0**, 1, 1, 1, 1, 1, 2, 2 | 5 / 37 / 54 | 2 | 3 of 5 | 5.91 | 23 moves, **20 raised her points** |
| ND5RJY (bob, phone) | 3, 1, 2, 1, 2, 2, 1, 1, 2, 1 | 17 / 13 / 12 | 0 | 2 of 5 | 9.08 | 5 moves, 1 raised his points |

Ticks: 29–35 a minute every minute, with a median of 0.2–0.4 s. In minute 3 all three games had one tick of 4.5–6.4 s
at the same moment (the shared hiccup again).

Agents (v2AgentEnergy): 465–725 acts each, 0 failures, and skip rates of **91–98%** (carol 94/96/97, alice 94/91/98,
bob 97/98/98). Energy ended at 22–48 for every agent.

**Verdict: quieter than rounds 28–29.**
- The boards mostly move every minute (only alice's minutes 1–2 were still), but by far less.
- Changing moves in ten minutes were **77, 96 and 42**, against 125–183 in round 28 and 58–173 in round 29.
- Bob's board moved only 12–17 times a third, about one line move every 15 s across five lines.
- The skip rate rose again, to 91–98%.
- Alice's agent climbed late: 20 of its 23 last-third moves raised her points, and her chart steps up at 4:00 and 8:30 (02).

## Same on Both Rulers as a ladder (carol)

- **The card** (01): *"Where the line meets y = x should round to minus a number that reads the same backwards and
  starts with 2, like −2, −22 or −212. Bigger is better. Tie-breaker: That number's digits added up and the
  y-intercept's whole part should share the biggest factor possible."* It is clear, the examples help, and the main
  part is 30 words.
- **In play**, the lines sat on the first rung, "the unchanged number −2⅞ rounds to minus the palindrome 2", or near
  it (−1¹⁰⁄₁₁). None climbed to −22. Carol finished 3rd, 251.41, but within about 15 points of both partners. Her chart
  is flat from about 1:00 to 8:30, with a small rise at the end.
- **The words off a rung** (#851): "the unchanged number −2⅞ rounds to minus the palindrome 2". A child can follow that.

## Ruler (alice and bob)

*"The shortest distance from (0, 0) to the line, squared, should be as close as possible to a square number.
Tie-breaker: That distance should be as big as possible."*
- The main part is "as close as possible" to a target that can be hit exactly (any square), so it has a top. That is
  design principle 1 again.
- Alice's lines ended "off by ¹⁄₃₂₅", "off by ¹⁄₇₂" and "off by ≈ 1.00".
- Both Ruler tables were among the quietest (bob 42 changing moves).

## What remains (ranked)

| Rank | What | Evidence |
|---|---|---|
| 1 | **Fewer moves overall: 42–96 changing moves in ten minutes**, with skip rates of 91–98%. Bob's board changed a line about every 15 s | 03 |
| 2 | **Rules with a reachable top are still dealt**: Ruler ("as close as possible to a square") sat at 2 of 3 human seats this round, and both its tables were quiet | 02, 03 |
| 3 | **The Same on Both Rulers ladder is not climbed**: every line stayed on or near the first rung (2); none reached −22 | 01 |
| 4 | **Your own agent rarely helps you late** (carol 2 of 13, bob 1 of 5), except alice's Ruler agent (20 of 23) | 01, 03 |
| 5 | **A shared slow tick** (4.5–6.4 s) hit all three games at once, in minute 3 this time | — |
