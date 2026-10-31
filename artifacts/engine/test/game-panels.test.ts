/**
 * Stored panels (convex/panels.ts, convex/panels/*): the store a human's agents write TSX to and every client of
 * that human renders. Panels belong to the human across rooms; browser sessions and act/owner credentials may
 * write, read credentials may only read, and nobody else can see or address them.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, api, gods, internal, playerClient, rejects, roomWith } from "./game-helpers.ts";

const panel = (text: string, title = "Hello") =>
  `import { definePanel } from "@sdk";\nexport default definePanel({ title: ${JSON.stringify(title)}, placement: "left", Component() { return <p>${text}</p>; } });\n`;

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try { await promise; } catch (error) { return (error as { data?: { code?: string } }).data?.code ?? `untyped: ${(error as Error).message}`; }
  return "no error";
}

test("the owner saves, lists, reads and rolls back a panel; versions increment", async () => {
  const [ada] = await gods("Ada Lovelace");
  const first = await ada.c.action(api.panels.save, { slug: "hello", source: panel("one") });
  assert.deepEqual({ ok: first.ok, version: first.version, diagnostics: first.diagnostics }, { ok: true, version: 1, diagnostics: [] });
  const second = await ada.c.action(api.panels.save, { slug: "hello", source: panel("two", "Hello again") });
  assert.equal(second.version, 2);

  const [listed] = await ada.c.query(api.panels.list, {});
  assert.equal(listed.slug, "hello");
  assert.equal(listed.currentVersion, 2);
  assert.equal(listed.title, "Hello again", "title read from the literal definePanel manifest");
  assert.equal(listed.placement, "left");
  assert.equal(listed.size, "md");
  assert.equal(listed.enabled, true);
  assert.deepEqual(listed.author, { kind: "browser", label: "Ada Lovelace" });

  const current = await ada.c.query(api.panels.code, { slug: "hello" });
  assert.equal(current.version, 2);
  assert.match(current.source, /two/);
  assert.match(current.compiled, /require\("@sdk"\)/);
  const old = await ada.c.query(api.panels.code, { slug: "hello", version: 1 });
  assert.match(old.source, /one/);

  const rolled = await ada.c.mutation(api.panels.rollback, { slug: "hello", version: 1 });
  assert.equal(rolled.version, 3, "a rollback is a new version with the old code");
  const now = await ada.c.query(api.panels.code, { slug: "hello" });
  assert.equal(now.version, 3);
  assert.equal(now.source, old.source);
  assert.equal(now.compiled, old.compiled);
  assert.equal((await ada.c.query(api.panels.list, {}))[0].title, "Hello");
});

test("a syntax error returns line/column diagnostics and commits nothing", async () => {
  const [ada] = await gods("Ada Lovelace");
  await ada.c.action(api.panels.save, { slug: "keep", source: panel("good") });
  const result = await ada.c.action(api.panels.save, { slug: "keep", source: `export default (\n` });
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.length > 0);
  assert.equal(typeof result.diagnostics[0].line, "number");
  assert.equal(typeof result.diagnostics[0].column, "number");
  assert.equal((await ada.c.query(api.panels.list, {}))[0].currentVersion, 1);
  const broken = await ada.c.action(api.panels.save, { slug: "never", source: `import fs from "fs";\nexport default fs;\n` });
  assert.equal(broken.ok, false);
  assert.match(broken.diagnostics[0].message, /"@sdk"/);
  assert.deepEqual((await ada.c.query(api.panels.list, {})).map((p: { slug: string }) => p.slug), ["keep"]);
});

test("another human can neither see nor address a player's panels", async () => {
  const [ada, bob] = await gods("Ada Lovelace", "Bob Ross");
  await ada.c.action(api.panels.save, { slug: "secret-view", source: panel("mine") });
  assert.deepEqual(await bob.c.query(api.panels.list, {}), []);
  assert.equal(await errorCode(bob.c.query(api.panels.code, { slug: "secret-view" })), "NOT_FOUND");
  assert.equal(await errorCode(bob.c.query(api.panels.code, { slug: "secret-view", version: 1 })), "NOT_FOUND");
  assert.equal(await errorCode(bob.c.mutation(api.panels.rollback, { slug: "secret-view", version: 1 })), "NOT_FOUND");
  assert.equal(await errorCode(bob.c.mutation(api.panels.remove, { slug: "secret-view" })), "NOT_FOUND");
  assert.equal(await errorCode(bob.c.mutation(api.panels.setEnabled, { slug: "secret-view", enabled: false })), "NOT_FOUND");
  // Bob saving the same slug makes his own panel; Ada's is untouched.
  await bob.c.action(api.panels.save, { slug: "secret-view", source: panel("his") });
  assert.match((await ada.c.query(api.panels.code, { slug: "secret-view" })).source, /mine/);
  assert.equal((await ada.c.query(api.panels.list, {}))[0].currentVersion, 1);
});

test("a read credential reads but cannot write; an act credential writes as a device author", async () => {
  const [ada] = await gods("Ada Lovelace");
  const { roomId } = await roomWith([ada]);
  await ada.c.action(api.panels.save, { slug: "shared", source: panel("browser") });
  const reader = await playerClient(ada, roomId, "read");
  assert.equal((await reader.query(api.panels.list, {}))[0].slug, "shared");
  assert.match((await reader.query(api.panels.code, { slug: "shared" })).source, /browser/);
  assert.equal(await errorCode(reader.action(api.panels.save, { slug: "shared", source: panel("read") })), "FORBIDDEN");
  assert.equal(await errorCode(reader.mutation(api.panels.rollback, { slug: "shared", version: 1 })), "FORBIDDEN");
  assert.equal(await errorCode(reader.mutation(api.panels.setLayout, { layout: { version: 1, panels: {}, regions: {} } })), "FORBIDDEN");

  const actor = await playerClient(ada, roomId, "act");
  const saved = await actor.action(api.panels.save, { slug: "shared", source: panel("agent") });
  assert.equal(saved.version, 2);
  const [listed] = await ada.c.query(api.panels.list, {});
  assert.deepEqual(listed.author, { kind: "device", label: "test" });
  assert.equal(listed.lastForeignVersion, 2, "the version a non-browser author wrote (resets a 'let it act' grant)");
  await ada.c.action(api.panels.save, { slug: "shared", source: panel("browser again") });
  assert.equal((await ada.c.query(api.panels.list, {}))[0].lastForeignVersion, 2, "a browser save keeps it");
  // Rolling back (even in the browser) to code an agent wrote makes agent code current again: it counts as foreign.
  const back = await ada.c.mutation(api.panels.rollback, { slug: "shared", version: 2 });
  assert.equal((await ada.c.query(api.panels.list, {}))[0].lastForeignVersion, back.version);
  await ada.c.mutation(api.panels.rollback, { slug: "shared", version: 3 });
  assert.equal((await ada.c.query(api.panels.list, {}))[0].lastForeignVersion, back.version, "rolling back to browser code keeps it");
});

test("a removed and re-created slug is a different panel (its id changes), so old client grants cannot carry over", async () => {
  const [ada] = await gods("Ada Lovelace");
  await ada.c.action(api.panels.save, { slug: "again", source: panel("one") });
  const [first] = await ada.c.query(api.panels.list, {});
  assert.equal(typeof first.id, "string");
  await ada.c.mutation(api.panels.remove, { slug: "again" });
  await ada.c.action(api.panels.save, { slug: "again", source: panel("two") });
  const [second] = await ada.c.query(api.panels.list, {});
  assert.equal(second.currentVersion, 1);
  assert.notEqual(second.id, first.id);
});

test("a save's literal manifest sets title, placement and size; explicit arguments win", async () => {
  const [ada] = await gods("Ada Lovelace");
  await ada.c.action(api.panels.save, { slug: "where", source: panel("a") });
  await ada.c.mutation(api.panels.place, { slug: "where", placement: "bottom", title: "Renamed" });
  const moved = `import { definePanel } from "@sdk";\nexport default definePanel({ title: "Moved", placement: "right", size: "lg", Component: () => null });\n`;
  await ada.c.action(api.panels.save, { slug: "where", source: moved });
  const [after] = await ada.c.query(api.panels.list, {});
  assert.deepEqual([after.title, after.placement, after.size], ["Moved", "right", "lg"]);
  await ada.c.action(api.panels.save, { slug: "where", source: moved, placement: "left", title: "Mine" });
  const [explicit] = await ada.c.query(api.panels.list, {});
  assert.deepEqual([explicit.title, explicit.placement, explicit.size], ["Mine", "left", "lg"]);
  // No manifest values: the stored ones stay.
  await ada.c.action(api.panels.save, { slug: "where", source: `export default () => null;\n` });
  const [kept] = await ada.c.query(api.panels.list, {});
  assert.deepEqual([kept.title, kept.placement, kept.size], ["Mine", "left", "lg"]);
});

test("internal twins act as a credential principal: act may write, read may not, revoked is refused", async () => {
  const [ada] = await gods("Ada Lovelace");
  const { roomId } = await roomWith([ada]);
  const act = await admin.mutation(internal.testing.seedCredential, { subject: ada.subject, roomId, permission: "act" });
  const read = await admin.mutation(internal.testing.seedCredential, { subject: ada.subject, roomId, permission: "read" });
  const saved = await admin.action(internal.panels.saveAs, { principal: { credentialId: act }, slug: "via-registry", source: panel("x") });
  assert.equal(saved.version, 1);
  assert.equal((await admin.query(internal.panels.listAs, { principal: { credentialId: read } }))[0].slug, "via-registry");
  assert.match((await admin.query(internal.panels.codeAs, { principal: { credentialId: read }, slug: "via-registry" })).source, /x/);
  assert.equal(await errorCode(admin.action(internal.panels.saveAs, { principal: { credentialId: read }, slug: "via-registry", source: panel("y") })), "FORBIDDEN");
  await admin.mutation(internal.panels.placeAs, { principal: { credentialId: act }, slug: "via-registry", placement: "bottom", size: "lg" });
  assert.equal((await ada.c.query(api.panels.list, {}))[0].placement, "bottom");
  await admin.mutation(internal.panels.testing.revoke, { credentialId: act });
  assert.equal(await errorCode(admin.action(internal.panels.saveAs, { principal: { credentialId: act }, slug: "via-registry", source: panel("z") })), "UNAUTHENTICATED");
  assert.equal(await errorCode(admin.query(internal.panels.listAs, { principal: { credentialId: act } })), "UNAUTHENTICATED");
});

test("limits: source size, 32 panels per player, 30 saves a minute, bad slugs", async () => {
  const [ada] = await gods("Ada Lovelace");
  const big = `export default ${JSON.stringify("x".repeat(64 * 1024))};\n`;
  assert.equal(await errorCode(ada.c.action(api.panels.save, { slug: "big", source: big })), "BAD_REQUEST");
  assert.equal(await errorCode(ada.c.action(api.panels.save, { slug: "Not A Slug", source: panel("x") })), "BAD_REQUEST");

  await admin.mutation(internal.panels.testing.seedPanels, { subject: ada.subject, count: 32 });
  assert.equal(await errorCode(ada.c.action(api.panels.save, { slug: "one-too-many", source: panel("x") })), "BAD_REQUEST");
  // Updating an existing panel is still fine at the cap.
  assert.equal((await ada.c.action(api.panels.save, { slug: "seeded-0", source: panel("x") })).ok, true);

  const [bob] = await gods("Bob Ross");
  for (let i = 0; i < 30; i++) await bob.c.action(api.panels.save, { slug: "busy", source: panel(`n${i}`) });
  assert.equal(await errorCode(bob.c.action(api.panels.save, { slug: "busy", source: panel("31") })), "RATE_LIMITED");
  assert.equal(await errorCode(bob.c.mutation(api.panels.rollback, { slug: "busy", version: 25 })), "RATE_LIMITED");
  await admin.mutation(internal.panels.testing.ageSaves, { subject: bob.subject, ms: 61_000 });
  assert.equal((await bob.c.action(api.panels.save, { slug: "busy", source: panel("later") })).version, 31);
});

test("only the last 20 versions are kept", async () => {
  const [ada] = await gods("Ada Lovelace");
  for (let i = 1; i <= 22; i++) {
    await ada.c.action(api.panels.save, { slug: "long", source: panel(`v${i}`) });
    if (i % 10 === 0) await admin.mutation(internal.panels.testing.ageSaves, { subject: ada.subject, ms: 61_000 });
  }
  assert.equal((await ada.c.query(api.panels.list, {}))[0].currentVersion, 22);
  assert.equal(await errorCode(ada.c.query(api.panels.code, { slug: "long", version: 2 })), "NOT_FOUND");
  assert.match((await ada.c.query(api.panels.code, { slug: "long", version: 3 })).source, /v3/);
  assert.equal(await errorCode(ada.c.mutation(api.panels.rollback, { slug: "long", version: 1 })), "NOT_FOUND");
  assert.equal(await admin.query(internal.panels.testing.versionCount, { subject: ada.subject, slug: "long" }), 20);
});

test("enable, place, remove and the layout follow the player", async () => {
  const [ada, bob] = await gods("Ada Lovelace", "Bob Ross");
  await ada.c.action(api.panels.save, { slug: "tool", source: panel("t") });
  await ada.c.mutation(api.panels.setEnabled, { slug: "tool", enabled: false });
  assert.equal((await ada.c.query(api.panels.list, {}))[0].enabled, false);
  await ada.c.mutation(api.panels.place, { slug: "tool", placement: "right", size: "sm", title: "Tool" });
  const [placed] = await ada.c.query(api.panels.list, {});
  assert.deepEqual([placed.placement, placed.size, placed.title], ["right", "sm", "Tool"]);

  assert.equal(await ada.c.query(api.panels.layout, {}), null);
  const layout = { version: 1, panels: { tool: { region: "bottom", order: 2 } }, regions: { bottom: { mode: "tabs" } } };
  await ada.c.mutation(api.panels.setLayout, { layout });
  assert.deepEqual(await ada.c.query(api.panels.layout, {}), layout);
  assert.equal(await bob.c.query(api.panels.layout, {}), null);
  assert.equal(await errorCode(ada.c.mutation(api.panels.setLayout, { layout: { version: 1, panels: { x: "y".repeat(20_000) }, regions: {} } })), "BAD_REQUEST");

  await ada.c.mutation(api.panels.remove, { slug: "tool" });
  assert.deepEqual(await ada.c.query(api.panels.list, {}), []);
  assert.equal(await errorCode(ada.c.query(api.panels.code, { slug: "tool", version: 1 })), "NOT_FOUND");
  assert.equal(await admin.query(internal.panels.testing.orphanVersions, {}), 0);
});

test("unauthenticated callers get nothing", async () => {
  const { ConvexHttpClient } = await import("convex/browser");
  const { URL_ } = await import("./game-helpers.ts");
  const anon = new ConvexHttpClient(URL_);
  assert.match(await rejects(anon.query(api.panels.list, {})), /sign in/i);
  assert.equal(await errorCode(anon.action(api.panels.save, { slug: "x", source: panel("x") })), "UNAUTHENTICATED");
});
