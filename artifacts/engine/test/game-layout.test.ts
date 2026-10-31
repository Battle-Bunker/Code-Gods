/**
 * The dock layout (convex/layout.ts; docs/ui-redesign.md §2.3–2.4) against the live local backend. What would break:
 * a layout leaking to another human or room, the arrangement not following a human into a new room (or the panel
 * parameters following, which name one game's objects), a stale write overwriting a newer one, an assistant tool
 * adding panes past the limits or closing the assistant, invalid panel parameters stored, the rate limit.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LAYOUT, type DockLayout } from "@workspace/player-client/layout";
import { admin, api, gods, internal, roomWith } from "./game-helpers.ts";

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try { await promise; } catch (error) { return (error as { data?: { code?: string } }).data?.code ?? `untyped: ${(error as Error).message}`; }
  return "no error";
}
async function errorMessage(promise: Promise<unknown>): Promise<string> {
  try { await promise; } catch (error) { return (error as { data?: { message?: string } }).data?.message ?? (error as Error).message; }
  return "no error";
}
const panelPane = (layout: DockLayout, id: string) => { const p = layout.panes[id]; assert.equal(p.kind, "panel"); return p as Extract<typeof p, { kind: "panel" }>; };

test("a layout is per human per room; the arrangement follows the human to a new room with parameters reset", async () => {
  const [ada, bob] = await gods("Ada Layout", "Bob Layout");
  const { roomId } = await roomWith([ada, bob]);
  const fresh = await ada.c.query(api.layout.current, { roomId });
  assert.equal(fresh.source, "default");
  assert.deepEqual(fresh.layout, DEFAULT_LAYOUT("lobby"));
  const side: DockLayout = { version: 1, root: { type: "split", direction: "row", sizes: [62, 38], children: [{ type: "tabs", panes: ["p1"], active: "p1" }, { type: "tabs", panes: ["p2"], active: "p2" }] },
    panes: { p1: { id: "p1", kind: "panel", panelId: "objects", params: { limit: 5 }, setBy: "assistant" }, p2: { id: "p2", kind: "assistant" } } };
  const written = await ada.c.mutation(api.layout.set, { roomId, layout: side });
  assert.deepEqual(written.warnings, []);
  assert.deepEqual(panelPane(written.layout, "p1").params, { sortBy: "payoff", filter: "all", limit: 5, highlight: [], layout: "list", annotate: "mine" }, "defaults are filled in");
  const mine = await ada.c.query(api.layout.current, { roomId });
  assert.equal(mine.source, "room");
  assert.equal(mine.setBy?.kind, "browser");
  assert.equal(mine.updatedAt, written.updatedAt);
  assert.equal((await bob.c.query(api.layout.current, { roomId })).source, "default", "another human has their own layout");
  const [outsider] = await gods("Cyd Outsider");
  assert.equal(await errorCode(outsider.c.query(api.layout.current, { roomId })), "FORBIDDEN", "a non-member has no layout in the room");
  assert.equal(await errorCode(outsider.c.mutation(api.layout.set, { roomId, layout: side })), "FORBIDDEN");
  // A second room: the shape is carried, the parameters are not.
  const other = await roomWith([ada, bob]);
  const carried = await ada.c.query(api.layout.current, { roomId: other.roomId });
  assert.equal(carried.source, "carried");
  assert.equal(carried.layout.root.type === "split" && carried.layout.root.direction, "row");
  assert.deepEqual(panelPane(carried.layout, "p1"), { id: "p1", kind: "panel", panelId: "objects", params: { sortBy: "payoff", filter: "all", limit: 12, highlight: [], layout: "list", annotate: "mine" }, setBy: "assistant" }, "parameters reset; the panel and who chose it stay");
  // Compare-and-set: a stale write is refused; a broken layout is repaired, never stored broken.
  assert.equal(await errorCode(ada.c.mutation(api.layout.set, { roomId, layout: side, ifUpdatedAt: written.updatedAt - 1 })), "CONFLICT");
  const repaired = await ada.c.mutation(api.layout.set, { roomId, layout: { version: 1, root: { type: "tabs", panes: ["x"], active: "x" }, panes: { x: { id: "x", kind: "panel", panelId: "nope" } } }, ifUpdatedAt: written.updatedAt });
  assert.ok(repaired.warnings.some((w: string) => /unknown panel/.test(w)) && repaired.warnings.some((w: string) => /no assistant pane/.test(w)), repaired.warnings.join("\n"));
  assert.equal(panelPane(repaired.layout, "x").panelId, "objects", "an unknown panel becomes the default panel");
  assert.equal(await errorCode(ada.c.mutation(api.layout.set, { roomId, layout: { version: 1, root: { type: "tabs", panes: ["p1"], active: "p1" }, panes: { p1: { id: "p1", kind: "panel", panelId: "overview", params: { focus: "x".repeat(40_000) } } } } })), "BAD_REQUEST");
});

test("the layout tools open, reparameterise, move and close panes as the human, within the limits", async () => {
  const [ada] = await gods("Ada Tools");
  const { roomId } = await roomWith([ada]);
  const act = await admin.mutation(internal.testing.seedCredential, { subject: ada.subject, roomId, permission: "act" });
  const principal = { credentialId: act };
  // Without a place, the default (never chosen) built-in panel is switched to the asked one: no pane is added to illustrate.
  const first = await admin.mutation(internal.layout.openPanelAs, { principal, panelId: "feed", params: {} });
  assert.deepEqual([first.paneId, first.reused, Object.keys(first.layout.panes).sort()], ["p1", false, ["p1", "p2"]]);
  assert.equal(panelPane(first.layout, "p1").panelId, "feed");
  // Another panel without a place: the assistant's own pane is switched again (still no new pane) …
  const second = await admin.mutation(internal.layout.openPanelAs, { principal, panelId: "race" });
  assert.deepEqual([second.paneId, Object.keys(second.layout.panes).sort()], ["p1", ["p1", "p2"]]);
  // … but a pane the player chose is never overridden: a new pane opens instead.
  await ada.c.mutation(api.layout.set, { roomId, layout: { ...second.layout, panes: { ...second.layout.panes, p1: { ...second.layout.panes.p1, setBy: "human" } } } });
  const opened = await admin.mutation(internal.layout.openPanelAs, { principal, panelId: "objects", params: { limit: 5, filter: "chips" } });
  assert.equal(opened.reused, false);
  assert.equal(opened.summary, "Top 5 by payoff · only ones others care about");
  assert.deepEqual(Object.keys(opened.layout.panes).sort(), ["p1", "p2", "p3"]);
  assert.equal(panelPane(opened.layout, opened.paneId).setBy, "assistant");
  assert.equal(panelPane(opened.layout, "p1").panelId, "race", "the player's pane is untouched");
  const again = await admin.mutation(internal.layout.openPanelAs, { principal, panelId: "objects", params: { limit: 7 } });
  assert.equal(again.reused, true, "one pane per panel unless placed");
  assert.equal(again.paneId, opened.paneId);
  assert.equal(panelPane(again.layout, again.paneId).params.limit, 7);
  const invalid = await errorMessage(admin.mutation(internal.layout.openPanelAs, { principal, panelId: "objects", params: { limit: 9999 } }));
  assert.match(invalid, /limit/);
  assert.match(invalid, /Schema: \{"type":"object"/, "the refusal carries the panel's JSON Schema so the model can correct itself");
  assert.equal(await errorCode(admin.mutation(internal.layout.openPanelAs, { principal, panelId: "stored" })), "BAD_REQUEST");
  const set = await admin.mutation(internal.layout.setPanelParamsAs, { principal, paneId: opened.paneId, params: { sortBy: "mine" } });
  assert.deepEqual(panelPane(set.layout, opened.paneId).params, { sortBy: "mine", filter: "all", limit: 12, highlight: [], layout: "list", annotate: "mine" });
  assert.equal(await errorCode(admin.mutation(internal.layout.setPanelParamsAs, { principal, paneId: "p2", params: {} })), "BAD_REQUEST", "the assistant pane has no parameters");
  const moved = await admin.mutation(internal.layout.movePaneAs, { principal, paneId: "p2", place: { relativeTo: "p1", direction: "right" } });
  assert.equal(moved.layout.root.type === "split" && moved.layout.root.direction, "row");
  assert.equal(await errorCode(admin.mutation(internal.layout.closePaneAs, { principal, paneId: "p2" })), "CONFLICT", "the assistant stays");
  const closed = await admin.mutation(internal.layout.closePaneAs, { principal, paneId: opened.paneId });
  assert.deepEqual(Object.keys(closed.layout.panes).sort(), ["p1", "p2"]);
  assert.equal(await errorCode(admin.mutation(internal.layout.closePaneAs, { principal, paneId: "p1" })), "CONFLICT", "the last panel stays");
  assert.equal(await errorCode(admin.mutation(internal.layout.openPanelAs, { principal, slug: "nope" })), "NOT_FOUND");
  await ada.c.action(api.panels.save, { slug: "mine", source: `export default () => null;\n` });
  const panel = await admin.mutation(internal.layout.openPanelAs, { principal, slug: "mine" });
  assert.equal(panel.layout.panes[panel.paneId].kind, "stored-panel");
  const reopened = await admin.mutation(internal.layout.openPanelAs, { principal, slug: "mine" });
  assert.deepEqual([reopened.paneId, reopened.reused], [panel.paneId, true], "an open stored panel is activated, not opened twice");
  // One tool, two kinds of panel: exactly one of panelId and slug; a stored panel takes no parameters.
  assert.equal(await errorCode(admin.mutation(internal.layout.openPanelAs, { principal, panelId: "objects", slug: "mine" })), "BAD_REQUEST", "both");
  assert.equal(await errorCode(admin.mutation(internal.layout.openPanelAs, { principal })), "BAD_REQUEST", "neither");
  assert.equal(await errorCode(admin.mutation(internal.layout.openPanelAs, { principal, slug: "mine", params: { limit: 3 } })), "BAD_REQUEST", "params on a stored panel");
  // The browser sees what the tools did, attributed to the credential.
  const seen = await ada.c.query(api.layout.current, { roomId });
  assert.equal(seen.setBy?.kind, "device");
  assert.equal(Object.keys(seen.layout.panes).length, 3);
  // The same read of the layout the assistant gets.
  const current = await admin.query(internal.layout.currentAs, { principal });
  assert.deepEqual(current.layout, seen.layout);
  // Rate limit: 12 writes a minute per human per room (the human's own writes count too).
  let code = "no error";
  for (let i = 0; i < 12 && code === "no error"; i++) code = await errorCode(admin.mutation(internal.layout.setPanelParamsAs, { principal, paneId: "p1", params: { show: i % 2 ? "top3" : "all" } }));
  assert.equal(code, "RATE_LIMITED");
});

test("open_panel with a place reuses a pane already showing that panel with the same parameters instead of duplicating it", async () => {
  // gpt-4.1-mini, asked for "who else cares … in a second panel on the right", also opened a second Objects pane identical
  // to the one on screen, filling the dock with a copy.
  const [ada] = await gods("Ada Dupes");
  const { roomId } = await roomWith([ada]);
  const act = await admin.mutation(internal.testing.seedCredential, { subject: ada.subject, roomId, permission: "act" });
  const principal = { credentialId: act };
  const start = await admin.query(internal.layout.currentAs, { principal });
  const objects = Object.values(start.layout.panes).find((p: any) => p.kind === "panel" && p.panelId === "objects") as { id: string };
  assert.ok(objects, "the default layout shows the objects panel");
  const copy = await admin.mutation(internal.layout.openPanelAs, { principal, panelId: "objects", params: {}, place: { relativeTo: "p2", direction: "right" } });
  assert.deepEqual([copy.paneId, copy.reused, Object.keys(copy.layout.panes).length], [objects.id, true, Object.keys(start.layout.panes).length], "no duplicate pane");
  // Different parameters are a different view: the asked-for second pane opens.
  const second = await admin.mutation(internal.layout.openPanelAs, { principal, panelId: "objects", params: { filter: "chips" }, place: { relativeTo: "p2", direction: "right" } });
  assert.deepEqual([second.reused, Object.keys(second.layout.panes).length], [false, Object.keys(start.layout.panes).length + 1]);
});
