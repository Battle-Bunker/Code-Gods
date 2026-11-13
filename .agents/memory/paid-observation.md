---
name: Paid observation
description: A game setting ("free" | "paid"; Annotated basics is free since 2026-11-13, "Basics with paid looks" is paid): a seated god sees each object as last told (birth, own agents' changes and complete reads, paid looks); one price for a look; knowledge rows and log; what is free.
---
In a paid game a seated god never reads the live world: every player-facing read of objects goes through the god's own
knowledge (`objectViews` rows with `learnedAt`, and `knowledgeLog` for the series).

**Why:** The owner, 2026-11-11: a god's own energy piled up unused once power went to agents; "create more costly uses
of God energy, such as charging the God for reads … objects update in the interface whenever either the God or their
agents receive information about it (with clear information staleness indicators) but one has to setup their own
process to periodically query the game state". And: "I hate patches that increase how complicated the rules are. I
would rather keep a principled cost function for reads". Variants the owner may prefer are on branches
(`variant/observation-*`); production stays as it was until the owner asks.

**How to apply** (the specification is `docs/energy-model.md` §11; the code `artifacts/engine/convex/lib/knowledge.ts`):
- One rule: seeing an object's state at one moment costs its full read at the read price (`fullReadCharge`), whoever
  asks. No second price, no per-tool price list.
- A god is told an object at its birth (free), by its agents' committed changes, by an agent's act that read the whole
  object, and by a `look` it pays for from its own account. A standing watch is an observer agent, never a timer.
- Free: the published scoreboard (own score moves with it), the object count, each object's age, change count and time
  of last change. Activity is public; content is paid. After the end everything is open.
- A new player-facing query that reads `objects`, `objectEvents` or `tickBatches` must give a seated god of a paid live
  game only what it was told (`paidLive`, `toldEvent`, `toldOnly`), and gets a line in `test/game-paid-observation.test.ts`.
- The tick writes per-god rows only for the gods it told (`told` in the commit); never for an object nobody was told.
- Test rooms made with `roomWith(members, settings)` are free unless the test sets `observation: "paid"`.
- Spectators still see the live world (second-account risk, §11.5): the owner has not decided to close it.
