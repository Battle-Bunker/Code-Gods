# @workspace/object-views

The one place an object type's UI lives, plus the shared kid-facing components. Used by the server
display (`artifacts/code-gods`) and the player console (`artifacts/player-web`). Framework-light: React
and one Radix popover; the logic is in framework-free modules with Node unit tests.

## Objects

Every place an object value is shown renders `<ObjectView value={…} {...objectContext(instance)} />`,
which dispatches on the object type to one of its registered renderers: the `renderer` prop when given, else
the viewer's choice for that type, else the type's default.

| `objectType` | renderers (default first) | shows |
|--------------|---------------------------|-------|
| `Int`        | `text` (`IntObject`)      | the number |
| `string`     | `text` (`StringObject`)   | the JSON-quoted string |
| `Grid`       | `digits`, `tiles` (`GridObject`) | `digits`: one monospace line per row, each glyph (a digit, or card rank and suit) in its colour's text shade, no tiles; `tiles`: a compact board of coloured cells with a pattern or letter cue. Both open the same detail view on hover or click (larger tile board, cell names, canonical string, Display and colour-cue toggles) |

The viewer's choice per type is remembered in `localStorage` under `code-gods.object-views.renderer.<type>`
(guarded; a choice still holds for the page when storage is blocked). `objectRenderers(type)`,
`getObjectRenderer(type)`, `setObjectRenderer(type, id)`, `subscribeObjectRenderer` and the
`useObjectRenderer(type)` hook read and change it; both apps' palettes switch grids with `ui.objects.renderer`.
The chosen renderer's id reaches the component as `renderer`, so one component can serve several renderers
(the Grid's detail view stays open when the viewer switches from inside it).

`objectContext(instance)` turns the API's `InstanceInfo` into the context (`objectType`, Grid args).
`TransformationView` shows before → after; on grids the changed cells are outlined. When the type is
unknown, numbers render as Int, strings that parse as a grid of at least 2×2 as Grid, others as string.

To add an object type, write one component taking `ObjectViewProps` and register it:

```tsx
objectViews.register({ type: "Tree", component: TreeObject, infer: (v) => isTree(v) });
```

or give it several renderers, one of them the default:

```tsx
objectViews.register({ type: "Tree", defaultRenderer: "outline", infer: isTree, renderers: [
  { id: "outline", label: "Outline", blurb: "Indented text.", Component: TreeOutline },
  { id: "drawing", label: "Drawing", blurb: "Boxes and lines.", Component: TreeDrawing },
] });
```

## Kid-facing components

| component | what |
|---|---|
| `Rarity`, `rarityText(bits, noun)` | "1 in 145" headline (never saturates; words for big numbers, "an everyday grid" below 1 in 2), "rarer than 993 of 1,000 grids", ✨ bits (lib/grid-lab/docs/kid-cards.md §2) |
| `PenaltyWarning`, `penaltyLine(h, comparative, noun)` | "⚠️ redder than 90% of grids" (inverts the soft hinge of the penalty bits), or "⚠️ fine" at or below the median (lib/grid-lab/docs/defence-goals.md §6) |
| `ScoreBreakdown` | a god's own view of one object: ✨, ⚠️, own net bits, everyone else **together** (peer net bits and peer care), payoff. Aggregates only, never individual peers |
| `HowScoringWorks` | the explainer: rarity bits, net bits, payoff = your bits × max(0, others' bits); "if the others don't care, nobody scores" (anchor `#how-scoring-works`) |
| `UtilityCardView` | emoji and name, plain summary, "uses: ♠ Suits · …" chips (`familyUses`), the source, then the defence-goal card |
| `HelpersDrawer` | the Room helpers from `InstanceInfo.helpers` (`HelperDoc[]`): read helpers and mutator constructors, grouped by badge; clicking a name inserts it |
| `ObjectTypePicker` | settings pickers driven by `Manifest.objectTypes`: type cards, component cards with maximal capability badges and rule-shelf deltas (+n −m), int presets; choices snap to an instantiation the server offers |
| `RuleShelf` | "possible gods": the catalog grouped by badge ("Works everywhere" first, defence goals last), filter chips, a "show locked (n)" toggle with "locked: needs ♠ Suits. Pick Playing cards" and (owner) Unlock; excluded families read "not dealt in this game" |

Settings deltas and the draft rule shelf are computed client-side with `@workspace/game-types` and
`@workspace/game-utilities` (`catalogFor`, `ruleDelta`, `snapToOffered`); nothing calls the network per click.

## Grid accessibility

In tiles, each colour has a distinct pattern (`COLOUR_PATTERNS`) drawn in its `ink` colour, and its
letter (R O Y G B V) is shown in the detail view. Viewers can switch compact cells between patterns and
letters; the choice is remembered in `localStorage` (guarded). Every css/ink pair meets WCAG AA. In
digits, the glyphs are coloured with `TEXT_SHADES` (`--cg-ink-<letter>` in both apps' `index.css`, the light
shade as fallback): each reads at 4.5:1 or better on the page, card, popover and muted surfaces of its
scheme, and the six of a scheme are at least CIE76 ΔE 25 and 25° of hue apart, with a dark gold for
yellow on light pages. The Letter cue appends the colour letter to each digit; changed cells are
underlined and bold. Compact grids are `role="img"` with a row-by-row text summary, and the detail view
always names every cell's colour.

## Styling

Components use the apps' Tailwind theme tokens (`bg-muted`, `border`, `text-muted-foreground`, …). Each
app's `src/index.css` has `@source "../../../lib/object-views/src";`.

## Checks

- `pnpm --filter @workspace/object-views test`: rarity and penalty wording, locked reasons, catalog
  grouping, settings snapping and badges, dispatch, renderers and the viewer's choice, grid display model,
  digit lines, contrast and cue tests, and the text shades (contrast on both apps' CSS surfaces, ΔE, hue, and
  that both `index.css` files carry the same values).
- The Playwright smoke tests of both apps (`pnpm --filter @workspace/code-gods run e2e`, see
  `artifacts/code-gods/e2e/smoke.ts`) exercise these components in the real pages at desktop and phone width.
