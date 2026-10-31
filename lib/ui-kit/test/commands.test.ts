/** Commands from the catalogue: one per palette entry on the surface, bound by the app; availability by audience; search ranks and dims. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG, paletteEntries } from "@workspace/player-client/catalog";
import { availabilityFor, commandsFromCatalog, searchCommands } from "../src/commands.ts";
import { GLOSSARY, GLOSSARY_IDS } from "../src/glossary.ts";
import type { PaletteContext } from "../src/types.ts";

const member: PaletteContext = { role: "member", admin: false, assistantOn: false };

test("one command per palette entry of the surface, unless the app leaves it unbound", () => {
  const all = commandsFromCatalog(CATALOG, () => ({ kind: "local", run() {} }), "engine");
  assert.equal(all.length, paletteEntries("engine").length);
  assert.ok(all.some(c => c.id === "owner.start" && c.human.title === "Start the game" && c.confirm === "summary"));
  const none = commandsFromCatalog(CATALOG, path => (path === "owner.start" ? null : { kind: "local", run() {} }), "engine");
  assert.equal(none.length, all.length - 1);
  assert.ok(!commandsFromCatalog(CATALOG, () => ({ kind: "local", run() {} }), "player").some(c => c.id === "rooms.create"), "surfaces are respected");
});

test("availability follows the audience; search ranks titles first and hides what can never apply", () => {
  assert.deepEqual(availabilityFor(CATALOG["owner.start"], member), { ok: false, reason: "Only the room owner can do this.", fix: "Ask the owner, or let your assistant propose it if you own the room." });
  assert.deepEqual(availabilityFor(CATALOG["owner.start"], { ...member, role: "owner" }), { ok: true });
  assert.equal(availabilityFor(CATALOG["aiTemplates.create"], member).ok, false);
  assert.equal((availabilityFor(CATALOG["aiTemplates.create"], member) as { hidden?: boolean }).hidden, true);
  assert.equal(availabilityFor(CATALOG["panels.save"], { ...member, permission: "read" }).ok, false, "a read credential cannot write");
  const commands = commandsFromCatalog(CATALOG, () => ({ kind: "local", run() {} }), "engine");
  const rows = searchCommands(commands, "start", member);
  assert.equal(rows[0].command.id, "owner.start");
  assert.equal(rows[0].availability.ok, false, "shown dimmed with its reason");
  assert.ok(!searchCommands(commands, "template", member).length, "admin commands are hidden from non-admins");
  assert.ok(searchCommands(commands, "", member).every(r => r.availability.ok), "the empty query shows only what is available");
});

test("the glossary has the 15 game terms plus the client's own words", () => {
  assert.equal(GLOSSARY_IDS.length, 18);
  for (const id of GLOSSARY_IDS) assert.ok(GLOSSARY[id].gloss.length > 20 && GLOSSARY[id].gloss.length <= 160, id);
  assert.ok(GLOSSARY_IDS.includes("payoff") && GLOSSARY_IDS.includes("panel") && GLOSSARY_IDS.includes("pane") && GLOSSARY_IDS.includes("palette"));
});
