/**
 * "Back to the previous view" (v1's pane history, archive dock/history.ts): every change to a pane's own view (the
 * objects' sort and filter, the object pane's object and representations), by an assistant or another screen, keeps
 * the view before it, so the pane can go back to it. Going back is not itself a change to go back from.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { back, canBack, emptyHistory, observe, opsFor, restored, restoring } from "../src/dock/history.ts";

const view = (o: Partial<{ sort: string; filter: Record<string, unknown>; focus: { objectId: string; reps: string[] } | null }> = {}) =>
  ({ objects: { sort: o.sort ?? "points", filter: o.filter ?? {} }, focus: o.focus ?? null }) as never;

test("a change to a pane's view keeps the one before; back returns it and the ops that restore it", () => {
  let h = observe(emptyHistory, view(), view({ sort: "rarity", filter: { mine: true } }));
  assert.ok(canBack(h, "objects") && !canBack(h, "object") && !canBack(h, "feed"));
  const b = back(h, "objects")!;
  assert.deepEqual(opsFor("objects", b.params), [
    { id: "view.sortObjects", args: { sort: "points" } },
    { id: "view.filterObjects", args: { show: "all" } },
  ]);
  h = restoring(b.history, "objects", b.params);
  // The restore arrives as a change: it is not kept as something to go back from.
  h = observe(h, view({ sort: "rarity", filter: { mine: true } }), view());
  assert.ok(!canBack(h, "objects"));
});

test("the object pane: back to the earlier object and its representations", () => {
  const h = observe(emptyHistory, view({ focus: { objectId: "o1", reps: ["si", "cart"] } }), view({ focus: { objectId: "o2", reps: [] } }));
  const b = back(h, "object")!;
  assert.deepEqual(opsFor("object", b.params), [{ id: "view.compareRepresentations", args: { objectId: "o1", reps: ["si", "cart"] } }]);
  const one = back(observe(emptyHistory, view({ focus: { objectId: "o1", reps: [] } }), view({ focus: { objectId: "o2", reps: [] } })), "object")!;
  assert.deepEqual(opsFor("object", one.params), [{ id: "view.openObject", args: { objectId: "o1" } }]);
  assert.ok(!canBack(observe(emptyHistory, view(), view({ focus: { objectId: "o2", reps: [] } })), "object"), "nothing before: nothing to go back to");
});

test("at most ten views back, newest last; an unchanged view keeps nothing", () => {
  let h = emptyHistory, v = view();
  for (let i = 0; i < 12; i++) { const next = view({ filter: { minBits: i + 1 } }); h = observe(h, v, next); v = next; }
  let n = 0;
  for (let b = back(h, "objects"); b; b = back(b.history, "objects")) n++;
  assert.equal(n, 10);
  assert.ok(!canBack(observe(emptyHistory, view(), view()), "objects"));
});

test("a restore made of two operations keeps nothing on the way; a failed one is forgotten", () => {
  const changed = view({ sort: "rarity", filter: { mine: true } });
  const b = back(observe(emptyHistory, view(), changed), "objects")!;
  let h = restoring(b.history, "objects", b.params);
  h = observe(h, changed, view({ filter: { mine: true } }));   // the sort has arrived, not yet the filter
  h = observe(h, view({ filter: { mine: true } }), view());
  assert.ok(!canBack(h, "objects"));
  h = observe(h, view(), view({ sort: "recent" }));
  assert.ok(canBack(h, "objects"), "after the restore, changes are kept again");
  const failed = restored(restoring(emptyHistory, "objects", b.params), "objects");
  assert.ok(canBack(observe(failed, view(), view({ sort: "recent" })), "objects"));
});
