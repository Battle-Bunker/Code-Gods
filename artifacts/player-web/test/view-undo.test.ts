import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_VIEW, type ViewState } from "@workspace/v2-affordances";
import { shownView, undoFailed } from "../src/core/stored-view.ts";

const v = (version: number, extra: Partial<ViewState> = {}): ViewState => ({ ...EMPTY_VIEW, version, ...extra });

test("a failed change with nothing on top of it goes, and the stored view shows", () => {
  const applied = v(4, { glossary: "seek" as never });
  assert.equal(undoFailed(applied, applied), null);
});

test("a newer change made on top of a failed one stays until the server stores it, then the server's view wins", () => {
  const failed = v(4, { glossary: "seek" as never }), newer = v(5, { glossary: "watch" as never });
  const kept = undoFailed(newer, failed)!;
  assert.equal(kept.glossary, "watch", "the newer change is still on screen");
  assert.equal(shownView(kept, v(3)), kept, "before the newer change commits");
  const stored = v(4, { glossary: "watch-stored" as never });   // the server stored only the newer change
  assert.equal(shownView(kept, stored), stored, "once it commits, the stored view (without the failed change) shows");
});
