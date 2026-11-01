# Panels

Each `*.tsx` file here is a live panel (`export default definePanel({...})` from `@sdk`). A new file opens as a
pane in the dock as soon as it is saved, and updates live as you edit it; close the pane from its header and open
it again from a built-in panel's menu ("Your panels") or the command palette ("Open file panel: …"). `examples/` is a
library: copy a file up a level to enable it. A panel's `placement` and `size` are only hints for where a new pane
opens. Before writing one, check whether a built-in panel (`src/core/panels/`) already shows it. Full guide:
[`docs/panels.md`](../../../../docs/panels.md).
