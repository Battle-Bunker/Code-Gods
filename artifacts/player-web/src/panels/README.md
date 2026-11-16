# Panels

Each `*.tsx` file here is a file panel (`export default definePanel({...})` from `@sdk`). It is built with the app and
runs in the page with the app's own hooks (`src/panels/sdk.ts`, the same names as a stored panel's sandboxed SDK). In a
dev server a new file opens as a pane as soon as it is saved, and updates live as you edit it, without a reload. Close
the pane from its menu and open it again from the command palette ("Open file panel: …") or the "Open a pane" pick.
`?panels=off` (safe mode) runs none.

`examples/` is a library, not loaded as panels: copy a file up a level to run it as a file panel, or pick it under
"Start from an example" in "Your panels" to save it as a stored panel. A panel's `placement` and `size` are only hints.
Before writing one, check whether a built-in pane (`src/panes/`) already shows it.
