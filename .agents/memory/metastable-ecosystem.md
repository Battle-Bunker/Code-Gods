---
name: Metastable ecosystem
description: The game must stay a dynamic, metastable ecosystem that resists metagame collapse; an optimal solution being found is a bug. The old engine and product memory are the spec of the game's logic; only the owner changes game logic (2026-11-14).
---
The game is a metastable ecosystem, not a static exam. It must remain dynamic, interesting and resilient to metagame
collapse. This is a critical design criterion, above any score a simulation reports.

**Why:** The owner, 2026-11-14: "We're trying to design a metastable ecosystem here that remains dynamic and
interesting and we're explicitly trying to move away from a task that's like a static exam." The game exists because AI
is exceptionally good at static exams and is crowding out human cognition in that kind of skill. The owner expects the
product of the players' utility functions to be "an enormous complex mathematical landscape that is hard work, even for
a frontier AI with a substantial amount of compute, to find optimal solutions in", and: "If you discover that optimal
*solutions* are ever being found you should report this as a bug and try yourself to find appropriate ways to avoid the
failure mode." Also: "Agents should always be dynamic hill climbers. Objects must be unique so you can't thrive by
finding one optimal object state and replicating it and anyway it's really expensive to move objects a long way in a
single turn now, by design, so all strategies should be incremental hill climbing towards profitable combined states."

**What went wrong on 14 November 2026 (so it is not repeated).** During the engine v2 rebuild:

- A session recorded "no uniqueness constraint between objects" as a provisional architect's call, although the product
  memory said "Every object in a world is unique … The user explicitly requires uniqueness". Nobody put it to the owner.
- Score noise on the others' sums, paid looks and hold rarity were deleted under "delete early".
- One far move in a single act was priced about 3.3 times cheaper than the path of small steps.
- With duplicates allowed, cheap jumps and exact sums, simulations found one state that suited every rule, and "agree a
  state, set every object to it and hold" scored 3 to 18 times naive play. The coordinator read that as success and had
  hold controls, "propose this state" buttons and settle prompts built. It was the game collapsing to a fixed point.

The cause: an AI model's training pulls it toward single-point optimisation, and "a number went up in simulation" was
taken as evidence the design was better. The owner's instruction not to be attached to prior code was misread as licence
to change the game's logic.

**How to apply:**

- **The old game is the spec.** The owner: "the old code acts as a precious spec of what I want and a demonstration of
  what I'm trying to accomplish, even though the specific implementation of that logic is not precious and can and
  should be replaced if warranted to create a cleaner architecture." Implementation is disposable; game logic is not.
  The default for every game rule (scoring, uniqueness, independence, information hiding and noise, costs, births, what
  agents can do) is the old rule. The rules are in `.agents/memory/code-gods-product.md` and on the branch
  `archive/engine-v1`; `docs/engine-v2/v1-audit.md` lists every departure made during the rebuild.
- **A strong guiding light, not gospel.** The owner, later on 14 November: "I don't have enough bandwidth to give you
  detailed decisions about lots of the things you've asked. I need you to get a hang of the principles for designing
  this game so you can make good calls yourself. Generally speaking the right approach is to keep the rules we already
  designed prior to this engine upgrade, but don't treat the old design as gospel, just as a strong guiding light for
  what I'm trying to achieve here. If you can see an obvious way that an older design choice could be changed to cohere
  better with the new engine design and make the game more dynamic, you can try out such policy changes and loudly
  declare to me that you are doing so and what the motivations are and then the empirical effects, once you know them."
  So: never drop or weaken a rule silently, as a "judgment call", or for convenience. The coordinator may trial a
  change that makes the game more dynamic; it is declared to the owner at once with its motivation, recorded as a
  trial in `docs/engine-v2/owner-decisions.md`, measured, and the effects reported. Worker sessions propose such
  changes to the coordinator; they do not make them.
- **Hill climbing together is wanted; easy high peaks are the bug.** The owner: "We want to be able to hill climb a
  combined landscape that improves several rules at once. We just want it to be hard to find really high peaks in that
  landscape." Do not report "a climb found a board that suits several rules" as a defect.
- **An optimum found is a bug.** If a search, a script, a model seat or a player finds a state or strategy that is
  optimal or near-optimal for the table and can simply be held or copied, report it to the owner as a defect, with the
  mechanism that made it findable. Never build features, prompts, starters or advice that help players reach or hold a
  fixed point (agreed destination states, "settle and hold", copying one state across objects).
- **Read simulation results for dynamics, not only totals.** Alongside any table score, report whether objects keep
  moving, whether states converge, whether one strategy dominates, and how much search it took to find the best joint
  state. A higher total from a calmer board is a warning.
- **Strategies are incremental hill climbs.** Agents climb by small priced moves toward combined states that are good
  for several players; cooperation is about how each agent climbs, never about a destination. A far move in one act
  costs at least the cheapest path of smaller acts.
- **Objects are unique** within a game (decision 24): no two objects hold the same state.
- **Before changing a mechanic, ask whether it makes a fixed point easier to reach.** Fewer degrees of freedom, a more
  concentrated law, exact disclosure of others' values, cheaper jumps, rules that read one coordinate each, and
  duplicates all do. `docs/engine-v2/landscape-analysis.md` holds the measurements and the standing collapse check.
