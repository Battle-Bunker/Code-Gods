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

Object annotations are being rebuilt; see docs/annotations-design.md.

The payoff's two dimensions and its strength have fixed colours (`src/dimensions.ts`): `DIMENSION_COLOURS` (yours,
others; `dimensionVar`, `--cg-yours` / `--cg-others`) and `SCORE_RAMP` (`rampVar`, `rampHex`, `relativeStrength`;
`--cg-ramp-low` / `--cg-ramp-high`), validated like the digit shades (`test/palette-metrics.test.ts`).
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
letters; the choice is remembered in `localStorage` (guarded). Tiles are filled with the colour set's bright
shades (`DIGIT_SHADES[set].dark`) under a dark glyph (`TILE_INK`, 4.5:1 or better on each). In digits, the
glyphs are coloured per colour SET with `DIGIT_SHADES` (`--cg-ink-<set>-<letter>`, rainbow6 and unknown sets
`--cg-ink-<letter>`, in both apps' `index.css`, the light shade as fallback). Each set's shades were derived
together (`scripts/derive-palettes.ts`, `src/colour-science.ts`): the smallest pairwise CIEDE2000 plus the
smallest OKLab ΔE×100 under protanopia, deuteranopia and tritanopia (the last standing in for small-field
tritanopia at digit size, where a blue and a green of one lightness collapse) is maximised, subject to 4.5:1 on
the page, card, popover and muted surfaces of the scheme, a hue that still reads as the colour's name
(`NAME_HUES`), OKLCH chroma ≥ 0.1, and a dark gold for yellow on light pages. The Letter cue appends the colour letter to each digit; changed cells are
underlined and bold. Compact grids are `role="img"` with a row-by-row text summary, and the detail view
always names every cell's colour.

## Styling

Components use the apps' Tailwind theme tokens (`bg-muted`, `border`, `text-muted-foreground`, …). Each
app's `src/index.css` has `@source "../../../lib/object-views/src";`.

## Checks

- `pnpm --filter @workspace/object-views test`: rarity and penalty wording, locked reasons, catalog
  grouping, settings snapping and badges, dispatch, renderers and the viewer's choice, grid display model,
  digit lines, contrast and cue tests, the digit shades per set (contrast on both apps' CSS surfaces, CIEDE2000 and CVD
  floors, name hues, and that both `index.css` files carry the same values), and the payoff colours and ramp.
- The Playwright smoke tests of both apps (`pnpm --filter @workspace/code-gods run e2e`, see
  `artifacts/code-gods/e2e/smoke.ts`) exercise these components in the real pages at desktop and phone width.
