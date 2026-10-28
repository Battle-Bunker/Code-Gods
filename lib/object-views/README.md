# @workspace/object-views

One React component per object type, shared by the server display (`artifacts/code-gods`) and
the player console (`artifacts/player-web`). Every place an object value is shown renders
`<ObjectView value={…} objectType={…} />`, which dispatches to the type's registered component:

| `objectType` | component      | shows                                                        |
|--------------|----------------|--------------------------------------------------------------|
| `Int`        | `IntObject`    | the number, as before                                        |
| `string`     | `StringObject` | the JSON-quoted string, as before                            |
| `Grid`       | `GridObject`   | a compact grid of coloured cells; hover or click for details |

When `objectType` is unknown (the player observation does not carry it), numbers render as Int,
strings that parse as a grid of at least 2×2 (`parseGridForDisplay` from `@workspace/game-core`)
as Grid, and other strings as string. A known type always wins, so string games never turn into
grids. A Grid value that does not parse falls back to the string view.

## Adding an object type

Write one component taking `ObjectViewProps` and register it; nothing else changes:

```tsx
import { objectViews, type ObjectViewProps } from "@workspace/object-views";

function TreeObject({ value }: ObjectViewProps) { /* … */ }
objectViews.register({ type: "Tree", component: TreeObject, infer: (v) => isTree(v) });
```

`type` matches the room setting `objectType`. `infer` is optional; entries registered later are
tried first.

## Grid accessibility

Hue is never the only cue. Each colour has a distinct pattern (`COLOUR_PATTERNS`) drawn in its
`ink` colour, and its letter (R O Y G B V) is shown in the detail view. Viewers can switch the
compact cells between patterns and letters in the detail view; the choice is remembered in
`localStorage` (guarded, as storage can be unavailable). Cell text uses each colour's `ink`, and
`test/grid-display.test.ts` checks every css/ink pair meets WCAG AA (4.5:1). Compact grids are
`role="img"` with a row-by-row text summary.

## Styling

Components use the apps' Tailwind theme tokens (`bg-popover`, `border`, `text-muted-foreground`, …).
Each app's `src/index.css` adds `@source "../../../lib/object-views/src";` so Tailwind generates
the classes used here.

## Checks

- `pnpm --filter @workspace/object-views test`: display model, dispatch, contrast and cue tests.
- `pnpm --filter @workspace/object-views smoke`: builds the fixture page in
  `artifacts/mockup-sandbox` (`/preview/ObjectViews`), serves it, and drives it with Playwright at
  desktop and phone width. Set `SHOTS_DIR` to choose where screenshots go.
