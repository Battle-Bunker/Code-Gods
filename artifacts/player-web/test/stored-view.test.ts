/** The human's stored view state as `v2/layout:current` answers it (src/core/stored-view.ts). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_VIEW } from "@workspace/v2-affordances";
import { storedViewOf } from "../src/core/stored-view.ts";

test("the stored view is the row's `view`, so a pane an assistant opens shows on every client", () => {
  // Catches: reading `layout.view` (always absent), which kept the empty view, so a view operation stored by the
  // assistant or another client never reached the screen.
  const view = { ...EMPTY_VIEW, version: 3, panes: [{ pane: "rules", place: "main" as const }] };
  assert.deepEqual(storedViewOf({ layout: null, view, revision: 2 }), view);
  assert.deepEqual(storedViewOf({ layout: null, view: null, revision: 1 }), EMPTY_VIEW);
  assert.deepEqual(storedViewOf(null), EMPTY_VIEW);
  assert.deepEqual(storedViewOf(undefined), EMPTY_VIEW);
});

test("loading and loaded-but-empty are told apart (the pane history skips only the view drawn while loading)", async () => {
  const { isLoadingView } = await import("../src/core/stored-view.ts");
  assert.ok(isLoadingView(storedViewOf(undefined)));
  assert.ok(!isLoadingView(storedViewOf(null)) && !isLoadingView(storedViewOf({ layout: null, view: null, revision: 1 })));
});
