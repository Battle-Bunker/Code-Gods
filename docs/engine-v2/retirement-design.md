# Line retirement: the server design (ready to build on the owner's yes)

**The proposal** (the agents session's births-stream measurement; the coordinator, 15 Nov): a new line every 30 s, at
most 5 live, and the oldest live line retires when a birth would make 6, its points kept. Not built: this is the plan, so
the work is hours once the owner says yes. Nothing here changes a game until then.

## Rules as built

1. **Births.** On the beginner presets, births are already regular (decision 31: birth j at j / rate). A preset gets
   `birthSeconds` (30) in place of its births-per-second where retirement is on; other presets keep their law.
2. **The cap.** A setting `liveCap` (5; absent: no retirement, so every other preset and every stored game behave as
   today). In the commit, when a birth would make the live count exceed the cap, the oldest live line (lowest number)
   retires first, in the same commit and before the birth, so the live count never exceeds the cap.
3. **Points banked.** A player's total is a running sum of value deltas (`engine.totals`, loop.ts `applyToPlayers`).
   Retirement adds no delta: the retired line's points stay in every total as they stood, and nothing changes them
   again (no agent is offered it; drift skips it). This is the agents session's "frozen-banked" model, which its table
   measured. The owner's choice, should they want the other reading: only live lines count (a negative delta at
   retirement), one line of code.
4. **Its state.** A retired line keeps holding its state (decision 24's uniqueness), as the agents session's table
   modelled. Releasing it instead is one condition in `holderOf`; the owner may prefer it (it keeps the held set
   bounded). The uniqueness correction's object count (`valueObjects`, world.ts) becomes the cap when retirement is on
   and states are released, else stays the game's total births.
5. **Offers.** The tick picks objects as `1 + r.below(objects)`, which assumes every number is live. It becomes
   `live[r.below(live.length)]` over a small `live` list (≤ cap numbers) kept on `v2Engine`. With no retirement `live`
   is `[1..n]`, so the draws, and therefore stored games' replays, are unchanged.
6. **Record.** A `retired` event per retirement (objectId, number, world seconds, each player's points on it), before
   the birth's `objectBorn`. The replay fold marks the line retired at that seq.

## Documents and reads (R1–R9)

- `v2Objects`: `retiredAt?: number` (world seconds). `v2Engine`: `live?: number[]` (absent: every number is live).
- The objects lists sort through indexes on `v2ObjectValues` and `v2Knowledge` (play.ts `SORT_INDEX`,
  `KNOWLEDGE_SORT`). Each gets a `live?: boolean` field and its sort indexes gain it after `memberId`, so the live
  page and a banked page are each one index range. Widen first (optional field, new indexes beside the old), migrate
  stored rows to `live: true` with a `migrations.define` (idempotent), switch the reads, then drop the old indexes
  (CLAUDE.md "Schema migrations"). Dev and production hold no v2 games today, so the migration is a formality, but
  it runs as the rules require.
- A small public query `v2/playState:banked` (one index page) for the app's banked section; a row in the query-cost gate.
- Drift (`driftRules`) revalues live objects only; the snapshot's held states read live objects (plus retired holders
  while states are kept).

## Cost

Per tick, constant in the cap: the snapshot reads ≤ cap + retired-holder states, picks among ≤ cap lines, drift
revalues ≤ cap objects. A 10-minute game with a birth every 30 s writes 20 retirements: 20 small events and patches.

## Tests (written first)

- Unit: the commit's retire-before-birth order; `live` picks reproduce today's draws when nothing retires.
- Live: a game with `liveCap: 2` and fast births: never more than 2 live; the oldest retires; its points stay in the
  standings unchanged; no act is ever offered on it; drift skips it; the replay marks it.
- Gate: the new and changed queries within R8.

## Estimate

About 5 hours server (settings, commit, tick picks, indexes and migration, two reads, tests), plus the app's banked
section (the app session) and the agents session's starters ignoring retired lines (they are never offered one).
