# Paid looks: the beginner view (owner decisions 33, 35, 36)

Every game pays to look, but a player's agents tell them every object they act on, free (decision 36), so a beginner
with one Simple starter keeps up without looking. Taken by `pnpm --filter @workspace/player-web run e2e:paid` on the
two beginner presets, 30 s into the world, before any look or Watcher:

| File | What it shows |
| --- | --- |
| `lines-beginner-desktop.png` | Lines: each row's freshness mark (green: up to date or seen within 10 s) and "seen N s ago"; the folded "Your agents tell you about every line they touch. Want to see them sooner?" |
| `lines-beginner-phone.png` | The same on a 390 px phone |
| `grids-beginner-desktop.png` | Grids, the same |
| `grids-beginner-phone.png` | Grids on a phone |

The view's age over those 30 s (every row, every 2 s), from the run that took these:

| Preset | Median | 90% | Max | Calm (≤ 10 s) |
| --- | --- | --- | --- | --- |
| Lines beginner | 2 s | 12 s | 18 s | 89% |
| Grids beginner | 4 s | 11 s | 16 s | 88% |

Looking ("Look at all … (N energy)", a line's "Look now") and the Watcher ("Keep my lines fresh") are inside the folded
section: extras for a player who wants their view sooner, never a step of the first game.
