# Judgment calls (coordinator's log, 13–14 November 2026)

Decisions taken without waiting for the owner, so they can be questioned later. Each entry: the decision; why; the
alternative. Entries are in the order they were written; the numbers are labels, not a sequence.

1. Order of work: stabilise develop first (full suites, known failures, debt exploit, starting energy), then land the
   five drafts (#289 tick, #281 first five minutes, #277 distance cost, #287 bid phase, #286 tiered rules), then an
   integration play-test and balance pass. Why: 26+ PRs merged without the full live suite; drafts conflict with each
   other. Alternative: land features first.
2. Debt exploit fix: "an agent may owe at most what it can hold; a debt belongs to the god: destroying an agent or
   taking power from it moves its debt to the god's own account". Why: one rule, no frozen/indebted special states
   (owner dislikes patches); the no-credit rule starved careful agents in simulation. Alternative: #292 (indebted
   agents cannot be destroyed or reduced), #293 (no credit). To be confirmed by simulation before merge.
3. Starting energy on the default beginner setup raised so every shipped Python example agent is payable in planning
   (about 600). Summon price normalised between languages so the same program costs about the same in TypeScript and
   Python. Why: 7 of 8 beginners could not summon their example; TypeScript cost 1.6–2.1x. Alternative: leave prices,
   shrink examples.
4. Bid phase: merge with bidding OFF on the default beginner setup; offer it as its own ordinary setup. Why: a first
   game should reach a first move in under two minutes; no beginner evidence yet; a lone 1% bid is a cheap edge.
   Alternative: on by default with one-click pass (the owner's request did not say where it should be on).
5. Paid observation on the default beginner setup: decide by persona walks (paid vs boards-visible vs free); keep
   "paid" only if beginners are not hurt; otherwise default to "boards" and keep paid as a setup. Why: latest
   instruction puts beginners first. Alternative: keep paid unconditionally (it was the owner's idea).
6. Tiered rules: land the machinery and families, offered as the separate "Tiered rules" setup; default beginner pool
   unchanged. Why: base-only play is not punished, but the default should stay the simplest thing.
7. Distance-priced mutation (slider add) becomes the default beginner setup's cost model once browser-checked; other
   cost models stay Lab setups. Why: evens the beginner rules (spread 2.64 -> 1.73) and rewards cost-aware play.
8. Production stays frozen; fable for every agent; leads use subagents sparingly.
9. (energy lead, approved) Settings manifest over its read budget: fixed by storing each board shape once (66 KB ->
   about 37 KB), not by raising the budget. MCP "At most 4 panels" and setup search-order failures fixed in the tests:
   both behaviours are deliberate (full default dock; relevance-ranked search).
10. (energy lead, approved) Debt rule completed as "what an account owes goes wherever its power goes" (both
    directions, including god -> agent), because without the second half a god could park debt on its own account.
11. (energy lead, approved) 600 starting energy on every Grid setup, not only the beginner one; 60 s to full for the
    low-power (8 bits/s) worlds.
12. (energy lead, approved) Language-fair summon price by one weight per language on the structure bits (TypeScript x
    0.44), pinned by paired programs; a corpus-weighted TypeScript code is the fuller fix, not done.
13. Host-failed acts stay uncharged and unlimited: charging would bill players for engine faults.
14. A possible paid-observation leak (a board asked at or after the last committed world time is served) is treated
    as real until disproved and fixed before anything else in that area. Outcome (PR #301): not a disclosure; the
    board always answered from the god's own knowledge, only the refusal depended on tick timing. Fix: in a paid live
    game any explicit world time is refused (one rule, no clock comparison). Merged without the full test:game; every
    suite that reads the query was run.
15. (distance-cost lead, PR #277 merged) Distance pricing is the default on Annotated basics only; every other setup
    keeps the flat price. Kept the 4-bit which-cell charge (4 + 1.585 per step) over strict proportionality (#299
    stays a branch: measured slowest and least even). Dial, gentle and multiply are setting values with Lab setups.
    A pricing is refused on boards where a full look would not be cheaper than the cheapest change (some 6x6, 7x7).
    magic_eighteen left untuned (was fastest, now second). Int/string pricing deferred (#300 unverified sketch).
    Merged on the 11 Nov review plus own checks, no second independent review.
16. (paid-observation lead, PR #304 merged) Code-run datasets get no price of their own: they read through the same
    functions as the dock, so the one read price covers them (a second price list is the kind of patch the owner
    refused). The observer agent's cost and refresh rate are stated in the forge, at the decision point.
17. (bid-phase lead, PR #287 merged) Bidding is off everywhere except the new ordinary setup "Basics with bidding"
    (45 s, one click to pass). Shipped default: first price, sealed, private; second price, open bids, handicaps
    shown and auction shown are Lab setups. Bids are whole percents 1-100: a 0% bid is not allowed (a free exclusive
    claim would make "bid 0 on everything" dominant). No minimum bid (at 5% nobody bids at three players). The edge
    of a lone 1% bid is left in: it is the cost of passing. The handicap comes off totals, not per-object bits. The
    bid phase lives on the room before the game exists. AI seats do not bid.
18. (energy lead; outcome of 2, 3, 10-12) Merged #303 health, #305 debt, #307 starting energy 600, #308 TypeScript
    price x 0.44. Simulation: the debt bound leaves careful play unchanged (same acts and win shares as unbounded);
    no-credit gives lookers zero changes at 100 Hz. Known limit accepted: an agent whose change costs more than its
    capacity must save first and is mostly refused in a busy room ("impact follows power"). The debt rule is in the
    rules text and UI but not in the agents' primer (size cap). Variants #292/#293 are superseded by #305.
19. (first-five-minutes lead, approved) Score noise off on the beginner setup (`peerNoiseBits: 0`): a live total
    that drops at the end reads as a bug, and eight known rules have little secrecy to protect. Example agents use
    `write` rather than `add` (same distance price, plainer text, cheaper summon).
20. Merge order for the last three drafts: #281 first, then #289, then #286; the latter two hold until #281 lands,
    because each move of develop cost #281 a 30-minute re-merge. (The holds arrived late: #289 and #286 merged
    first; not reverted.)
21. (first-five-minutes lead) #281 merged without the whole test:game on the final tree (develop moved five times in
    two hours); one vocabulary ("points", "⚡", "rule score") applied across the bid, handicap and debt copy.
23. (layered-rules lead, PR #286 merged) "Tiered rules" is its own public setup = Annotated basics plus ★ tiers
    (Opposite Nines, Mirrormancer, new Kings and Subjects). The design doc's "offer an agreeing tier" idea was
    measured and refuted (every tier raises conflict with every partner because the measure is normalised by each
    rule's own top); the rule was dropped. No "Expert tiered rules" setup (no family deals two tiers yet). Kings'
    same-number roads of 2 and 3 are not dealt (calibration about 5 bits off). Opposite Nines' dealt values narrowed
    so peers stay within 15% on top bits. Next for that lead: Two Pair tiers, on a branch, tiered setup only.
24. Debt wording for beginners: "Overdrawn by N ⚡; it waits for income" in place of "Owes"; the look-all price must
    equal the charge. Validate latency (25-40 s after an edit) sent to the tick lead with a 5 s target.
25. OBSERVATION DEFAULT (outcome of 5): the beginner setup becomes "free" (everything always visible). Paid looks,
    the owner's idea, stay fully supported as their own ordinary setup "Basics with paid looks" for a second game.
    Evidence (persona walks, n=1 per mode plus one three-human paid game; small, but differences in kind): speed to
    first scoring move the same in all modes (55-69 s); in paid the player bought a look only because the screen said
    income was being wasted, the boards went stale again in seconds, and with an own agent nothing was ever stale, so
    the mechanic gave a beginner nothing; "boards" was worst (two contradictory sentences, and the player replaced
    their own agent with the observer template to clear a red notice); in free the attention went to the score.
    Alternative: keep paid as default (owner's idea) or my earlier fallback "boards". Paid-mode defects sent to the
    paid-observation lead.
26. (paid-observation lead, PR #312 merged; accepted) A god's look stays a plain snapshot. Two ways to make a paid
    look last were NOT built because both disclose more for free: (a) marking an object stale only when a change
    touched the player's own rule, (b) a look that keeps an object fresh for a set time (a paid watch). The screen
    now says a look is a snapshot and the observer agent is the standing watch; red "STALE" became neutral "AS SEEN".
    Look-at-all charges exactly the quoted set (oldest first). The owner may want (a) or (b).
27. Practice opponents: both non-coder personas won 1st of 3 by waiting. Integration session asked to choose practice
    AI seats from existing agents so the shipped example alone finishes mid-table and an improved agent wins.
28. Replacing an agent's program becomes one engine command: "replacing a program costs what summoning it would;
    everything else (name, share, stored energy, debt) stays". Why: the client-side summon-then-destroy dropped most
    of a beginner's stored energy (960 -> 83) on every edit. Alternative: reorder the two commands client-side, or
    stop dropping energy on a momentary capacity dip (asked the energy lead to report on that, not build it).
29. (first-five-minutes lead, accepted) The examples' suggested "Try this" edits stay although some make the agent
    worse: trying a change and seeing its effect is the game; the fix is showing the effect and one-press undo.
30. ENERGY MOVES WITH POWER (major). Today a re-allocation drops stored energy above the giver's new capacity (a
    god's own store goes 1,920 -> 960 -> 480 as it summons with default shares). Decided: energy moves with power
    exactly as debt does: "what an account holds or owes beyond what its power supports goes where the power goes";
    nothing is lost by a re-allocation; a god's total held never exceeds power x T. Consequence to ask the owner
    about: an agent's energy becomes convertible into the god's own (pull the power back), so it can fund summons,
    softening the "keep power unallocated to pay for summons" choice. Rejected: keep the excess without moving it
    (lets a god bank one full store per agent: advantage from agent count). Variant kept: today's "drop the excess".
31. (energy lead, PR #318 merged, accepted) Replace charges the full summon price, no discount for a small edit;
    the agent's account is untouched at the replacement; only the owner sees a replacement while the game is live.
32. First agent's default power share on the beginner setup: 75% (today 50%), to take effect only after
    energy-moves-with-power is merged. Why not 100%: every "Check and replace" and second agent is paid from the
    god's own store (170-430 each); at 100% the god's income is 0 and a beginner is stuck after one or two replaces.
33. A failed query must take down only its own pane, never the page; recovery comes from the live subscription, not
    client retry; an unreadable saved layout falls back to the default layout.
34. Deal decides the game (Opposite Nines 87% greedy win share, Magic Eighteen 0%, 40 games): integration session
    told to fix by one principled normalisation (score relative to the rule's reachable top, or equalise tops via
    dealt values), not per-rule patches; to report before merging anything that changes scoring on existing setups.
35. (owner, 13 Nov ~21:10Z) Quota: the coordinator stays on the current model; executors move to Opus. All running
    leads told to stop, push, write docs/handover-<area>.md and report; successors are fresh Opus sessions (fewer
    of them, run in sequence where they share files). Finished leads (energy, tiered rules, paid looks, bid,
    distance) simply stop. Coordinator replies kept short and check-ins sparse.
36. (tiered-rules lead) Two Pair's ★ tiers stay dealt although a one-cell climber reaches 0.00-0.06 of them (they
    need two cells moved together): left for the owner. Kings' roads of 2 and 3 no longer dealt. Crosswise Threes
    added as a fifth tiered family (lines only).
37. BALANCE (major). Measured: among equally skilled players the deal decides a single game, and no per-rule
    constant, par scaling or choice of deal fixes it (as shipped 2-86% greedy win share by rule; par scaling 4-63%;
    0 of 56 fixed three-rule deals within 20-45% across styles; a symmetric same-family deal is impossible with the
    beginner rules). Cause: the winner is set by the rule pair's conflict x the table's style, not by bits held.
    Decided: no scoring change; the dealer rotates rules when the same players play again with the same settings
    (each holds each rule once; fair over P games; off with a bid phase), with a running total shown. Alternatives
    for the owner: change scoring so a single game is fair (untried: score relative to the same deal's reference
    outcome; conflict-matched deals), or rely on the bid phase. Spoiling still beats careful play (95-100% against
    cooperators): untouched.
38. JWKS inlined for sign-in (#328) with the URL fetch kept as fallback: forge check 3.6-4.0 s -> 1.05-1.3 s
    locally. Cloud sign-in not verified by anyone; owner asked to sign in on dev.
39. AI seats are admin-only, so a beginner with one friend cannot start a game: left for the owner (provider cost).
40. Practice opponents are now a built-in "Practice partner" (no model, no cost) that summons its own rule's example
    agent (#335). Decided: every signed-in player may seat Practice partners (replaces 39 for the free partner);
    model-backed AI seats stay admin-only. No saturation found in a 5-minute game (39 -> 56% of top per object;
    leader at 240 s wins 78%), so no parameter changed.
22. Integration session launched (session_0119hWTVA5rHw9okceZZTptC) at 14:40Z on combined develop: full suites
    first, then known gaps, whole beginner games, balance under the final economy, load check. It may tune existing
    parameters or swap one beginner rule if the pool is uneven by more than about 1.5x; it may not change the
    observation default (that waits on the persona walks).
