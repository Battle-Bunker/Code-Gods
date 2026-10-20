# @workspace/game-utilities

Utility functions for Code Gods: the private `T → [0, 1]` function each god is scored by.
For each object, a god scores **their utility × the sum of every other god's utility**.

[`docs/catalog.md`](docs/catalog.md) lists every family, with an example draw, its Python source and
its calibration against random spawns. Regenerate it with `pnpm --filter @workspace/game-utilities calibrate`.

## Design principles

1. **Heterogeneity first.** Each object type has a repertoire of unrelated *families* (14 for `Int`,
   14 for `string`): digits, divisibility, bits, palindromes, prose, nesting, weight, length and so on.
   Each family has random parameters. Gods compete and cooperate along whichever properties their
   functions happen to share, so the political map changes every game.
2. **Simple to state.** A utility function is a few lines with no validation boilerplate (the engine
   only ever passes legal objects). Every draw comes with a plain-language `summary` of the incentive
   it creates, so a beginner knows what they want before reading any code.
3. **Random objects are worthless.** Every family is calibrated so a uniformly spawned object scores
   close to zero (mean utility < 0.02, P(u > 0.5) < 0.2%). Utility near 1 needs rare, structured values.
   Optimizing an object purely for yourself scores badly, because the multiplier (everyone else's
   utility) stays near zero. The good objects are the ones that already matter to others: transform
   them toward your interests without destroying what makes them valuable.
4. **Full utility is always reachable.** Every draw has an exemplar inside the domain that scores
   ≥ 0.99 (tested), so no god is dealt an impossible goal.
5. **The repertoire is public; the draw is private.** Rooms publish the catalog of families
   (`publicCatalog`), never which god drew which family or with what parameters.

## Concepts

| Concept | Where | Meaning |
|---|---|---|
| `UtilityFamily` | `src/families/*.ts` | One idea ("loves a digit") plus a parameter sampler, Python and TypeScript bodies, a summary and an exemplar. |
| `UtilityDescriptor` | persisted server-side | `{ familyId, params }`: plain JSON, so restarts and replays need no code. |
| `UtilityCard` | sent to its owner only | Name, summary, and complete source in both languages. |
| `UtilitySelector` | `src/selectors.ts` | Deals descriptors to gods. The default, **Divine Lottery**, gives each god an independent uniform draw over the families whose ideal objects fit the domain. Future selectors (balanced tables, guaranteed overlaps) plug in here and appear in room settings via `utilitySelectorId`. |

The host evaluates the TypeScript body directly (`evaluator`). It is trusted code authored in this
package, with only numeric or alphanumeric parameters, and player code never reaches it. Tests
check that the Python source agrees with it on edge cases and random spawns, and that every
TypeScript source typechecks under `strict`.

## Adding a family

1. Add a `UtilityFamily` to `src/families/int.ts` or `src/families/string.ts` and list it in the export.
2. Keep the Python and TypeScript bodies line-for-line equivalent. The TypeScript body must be plain
   JavaScript (no annotations), because the host runs it as-is.
3. Run `pnpm --filter @workspace/game-utilities test`. Reachability, calibration, parity, strict typing
   and summary checks apply automatically. Then regenerate the catalog.
