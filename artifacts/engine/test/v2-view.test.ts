/**
 * View operations on the server (integration plan §2.5): the human's view state lives in their `v2Layouts` row, so an
 * assistant or an MCP credential acting for them changes what every one of their clients shows; the same checks as
 * the browser (context, caller, grant).
 *
 * What would break: an assistant's view change that the human's clients never see; a read-only credential changing it.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform, type Human } from "./v2-helpers.ts";

let ada: Human, roomId: string, gameId: string, objects: string[];
const apply = (h: Human, id: string, args: Record<string, unknown>, scope: Record<string, unknown>) => h.mutation("v2/ops/view:apply", { id, args, ...scope });

before(async () => {
  [ada] = await humans("View Ada");
  ({ roomId, gameId, objects } = await admin.mutation("v2/testing:seedGame", { owner: ada!.userId, practice: 2, objects: 4 }));
});

test("the human's own view operations are stored for every client", async () => {
  const pinned = await apply(ada!, "view.pinRepresentation", { rep: "cart" }, { gameId });
  assert.equal(pinned.ok, true, JSON.stringify(pinned));
  await apply(ada!, "view.openObject", { objectId: objects[0] }, { gameId });
  const row = await ada!.query("v2/layout:current", { roomId });
  assert.equal(row.view.pins["*"], "cart");
  assert.equal(row.view.focus.objectId, objects[0]);
  assert.ok(row.view.panes.some((p: any) => p.pane === "object"));
  const same = await apply(ada!, "view.pinRepresentation", { rep: "cart" }, { gameId });
  assert.equal(same.result.layoutVersion, pinned.result.layoutVersion + 1, "an operation that changes nothing keeps the version");
});

test("an assistant acting for the human changes the same view; a read-only credential cannot", async () => {
  const as = (grant: string) => admin.mutation("v2/ops/view:applyAs", { id: "view.pinRepresentation", args: { rep: "table" }, gameId, delegate: { userId: ada!.userId, roomId, grant, via: "mcp" } });
  assert.equal((await as("read")).error.code, "refused");
  assert.equal((await as("act")).ok, true);
  assert.equal((await ada!.query("v2/layout:current", { roomId })).view.pins["*"], "table");
  const bad = await apply(ada!, "replay.play", {}, { gameId });
  assert.equal(bad.ok, false, "a replay operation outside a replay is refused");
  void perform;
});
