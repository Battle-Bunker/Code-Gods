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
  A game rule (scoring, uniqueness, independence, information hiding and noise, costs, births, what agents can do)
  changes only by the owner's own words, recorded verbatim in `docs/engine-v2/owner-decisions.md`. A session never
  drops, weakens or replaces one as a "judgment call" or "provisional call"; if a rule seems to block the work, stop and
  ask. The rules are in `.agents/memory/code-gods-product.md` and on the branch `archive/engine-v1`;
  `docs/engine-v2/v1-audit.md` lists every departure made during the rebuild.
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
