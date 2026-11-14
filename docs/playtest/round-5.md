# Playtest round 5 (2026-11-14, develop at 3ff3a4ff)

After #501–#513: the deploy fix (#504: widen + migrate decision 23's fields), decision 23 part 2 (#505: thresholds,
rungs, levels deleted), the gallery (#501, #502), grid wording (#506, #507), end screen and phone (#510), Simple
starter first (#512). Run once the develop deploy was green again (run 411) and #505 had merged.
Hand play in Chromium: alice 1440×900, carol 1440×900, bob 390×844. Screenshots: `docs/screenshots/playtest/round-5/`.

## Existing deployment (the round-4 blocker)

`dev` started on the **existing** local deployment (not wiped). It held round-4 rows written at 4221e335: no
`level` fields any more, but the fields #505 deletes (object levels, rule ladders). The three migrations ran and
`migrations:status` reports `stripLevels`, `stripObjectLevels` and `stripRuleLadders` all **success** (8,700+ rows
processed). The rows with the old `level` field that broke round 4 were wiped then, so that exact shape was not
re-tested here; the dev deploy being green (run 411) covers it.

**Start to finish:** grid practice **yes** (Opposite Nines ×2, Magic Eighteen; 1440 and 390); a two-human lines game
(alice + bob + one partner) **yes** up to the deal; the "Back to the room for the next game" button is on Results.

## Checklist

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | "line" wording in grid games | **gone** in everything I read: "Your rule scores a grid in 2 parts", "between grids that tie", "See it grid by grid", "Others' bits … on this grid", "Tug-of-war on grid 13", "contested grid", "a grid's points change", "agents change grids" | 01, 04 |
| 2 | Energy "576.00 (full)" in grid games that start with 900 ⚡ | it is the **store's cap**, not a stale preset: grid games start at 900 (above the cap), and after the first summon the store refills only to 576 and reads "(full)". A player sees 900 at the start and never again; worth one sentence where "(full)" is shown | 01, 04 |
| 3 | Pull power back to pay for a second summon | **not offered.** With 443.55 ⚡ against a 456.45 ⚡ program the forge says "That program costs 456.4 ⚡; you have 443.6. Energy accrues while the game runs; a shorter program costs less." No way to move power back from the first agent; pressing again a few seconds later succeeded ("Summoned for 456.45 ⚡"; the new agent took 15 %, the first kept 70 %). Workable because the store refills at 19 ⚡/s, but the flow the coordinator asked about does not exist in the UI | 01 |
| 4 | Human vs practice partners, per grid family | **Opposite Nines (1440, two agents):** alice 1st, 4,777 vs 4,062 (partner 2). **Opposite Nines (390, one agent):** bob 3rd, 2,265 vs 5,204 / 5,143 (**2.3× behind**). **Magic Eighteen:** carol 2nd, 26,347 vs 28,378 / 10,037. Round 4: Opposite Nines 509 vs 4,126 (8×). The gap is much smaller than round 4 but one Opposite Nines starter with one agent still loses clearly; early in alice's game the "Simple" starter showed "157 moves · 692.31 ⚡ spent · −0.50 points from its moves" | 03, 04 |
| 5 | Two humans negotiate a deal and honour it with LEAVE | chat works both ways ("Message sent to the room's chat." from the palette; alice sees it). Bob set `const LEAVE = [11];` (the code is now behind "Show the code (you don't need to read it to play)"): **"Simple now runs your new code for 17.58 ⚡ (only what you changed is charged)"**. Every contested line also had a practice partner in it ("your agent and the agents of Bob Okafor and Practice partner 1"), and the line-11 fight with bob had already stopped at 0:25, so the effect of LEAVE could not be isolated | 05, 06 |
| 6 | #498 re-test | grid noun ✓; edit price after Replace ✓ (17.58 ⚡); phone pane names wrap onto the screen ✓; no step text anywhere I looked ✓ (goal card shows "3.25 bits (1 in 9.5 by chance)", "5.51 bits (1 in 45 by chance)": both match 2^bits) | 02, 04, 06 |
| — | Gallery | intro now "…see a worked example and how rare each line is by chance"; a **Grids** board is offered ✓ | 07 |
| — | Phone growth face y(0) | not re-tested (no growth rule dealt on the phone) | — |

## New this round

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 1 | No pull-power-back path when the store cannot pay a second summon (see 3) | 01 | major? (app/server: depends on whether the flow is meant to exist) |
| 2 | Phone Results: the sticky row of pane names covers the headline ("You finished 3rd of 3 with 2,265.17 points" is hidden behind it) | 03 | minor (app) |
| 3 | Results shows the standings twice in the first game of a rotation (the rotation totals and the final table are identical) | 04 | minor (app) |
| 4 | "See it grid by grid" / "See it line by" is cut off in the header at 1440 and 390 | 04, 06 | minor (app) |
| 5 | Pressing Enter in "Room code" does not join; only the Join button does | — | minor (app) |
| 6 | Grid tug-of-war starts within seconds on most grids (alice's Opposite Nines: 11 back-and-forths on grid 13 by 0:17); legible, and with practice partners still not endable by talking (known) | 01 | known |
