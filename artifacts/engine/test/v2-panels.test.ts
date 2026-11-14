/**
 * Stored panels on v2 (convex/v2/panels.ts, ops/panel.ts): the store a human and their delegates write TSX to and
 * every client of that human renders. Panels belong to the human across rooms; nobody else can see or address them;
 * a read grant reads and cannot write; compile errors store nothing; v1's limits hold.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, anonymous, errorCode, humans, perform, type Caller } from "./v2-helpers.ts";

const panel = (text: string, title = "Hello") =>
  `import { definePanel } from "@sdk";\nexport default definePanel({ title: ${JSON.stringify(title)}, placement: "left", Component() { return <p>${text}</p>; } });\n`;

const KIND: Record<string, "query" | "mutation" | "action"> = {
  "panel.list": "query", "panel.code": "query", "panel.save": "action", "panel.rollback": "mutation", "panel.setEnabled": "mutation", "panel.remove": "mutation",
};
/** An operation's outcome, whether returned or thrown (a failed mutation throws its outcome to roll back). */
async function run(who: Caller, id: string, args: Record<string, unknown> = {}): Promise<any> {
  try { return await perform(who, id, args, {}, KIND[id]); } catch (e) {
    const data = (e as { data?: { ok?: boolean } }).data;
    if (data && typeof data === "object" && "ok" in data) return data;
    throw e;
  }
}
/** The result of an operation that must succeed. */
async function ok(who: Caller, id: string, args: Record<string, unknown> = {}): Promise<any> {
  const out = await run(who, id, args);
  assert.equal(out.ok, true, `${id}: ${JSON.stringify(out.error)}`);
  return out.result;
}
/** The failure message of an operation that must fail with `code`. */
async function failure(who: Caller, id: string, args: Record<string, unknown>, code = "failed"): Promise<string> {
  const out = await run(who, id, args);
  assert.equal(out.ok, false, `${id} should fail`);
  assert.equal(out.error.code, code, out.error.message);
  return out.error.message;
}
const listed = async (who: Caller) => (await ok(who, "panel.list")).panels;
const delegate = (userId: string, grant: string) => (id: string, args: Record<string, unknown>) =>
  admin[KIND[id]!](`v2/ops/${id.replace(".", ":")}As`, { args, delegate: { userId, roomId: null, grant, via: "mcp" } });

test("a human saves, lists, reads and rolls back a panel; versions increment; the live reads agree", async () => {
  const [ada] = await humans("Panel Ada");
  const first = await ok(ada!, "panel.save", { slug: "hello", source: panel("one") });
  assert.deepEqual(first, { saved: true, slug: "hello", version: 1, diagnostics: [] });
  assert.equal((await ok(ada!, "panel.save", { slug: "hello", source: panel("two", "Hello again") })).version, 2);

  const [row] = await listed(ada!);
  assert.deepEqual([row.slug, row.currentVersion, row.title, row.placement, row.size, row.enabled], ["hello", 2, "Hello again", "left", "md", true],
    "title and placement read from the literal definePanel manifest");
  assert.deepEqual(row.author, { kind: "browser", label: "Panel Ada" });
  assert.deepEqual(await ada!.query("v2/panels:list"), [row], "the app's live read is the same list");

  const current = await ok(ada!, "panel.code", { slug: "hello" });
  assert.equal(current.version, 2);
  assert.match(current.source, /two/);
  assert.match(current.compiled, /require\("@sdk"\)/);
  assert.deepEqual(await ada!.query("v2/panels:code", { slug: "hello" }), current);
  const old = await ok(ada!, "panel.code", { slug: "hello", version: 1 });
  assert.match(old.source, /one/);

  assert.deepEqual(await ok(ada!, "panel.rollback", { slug: "hello", version: 1 }), { slug: "hello", version: 3, from: 1 }, "a rollback is a new version with the old code");
  const now = await ok(ada!, "panel.code", { slug: "hello" });
  assert.deepEqual([now.version, now.source, now.compiled], [3, old.source, old.compiled]);
  assert.equal((await listed(ada!))[0].title, "Hello");
});

test("a syntax error or a refused import returns diagnostics and commits nothing", async () => {
  const [ada] = await humans("Panel Ada");
  await ok(ada!, "panel.save", { slug: "keep", source: panel("good") });
  const result = await ok(ada!, "panel.save", { slug: "keep", source: "export default (\n" });
  assert.equal(result.saved, false);
  assert.equal(result.version, null);
  assert.ok(result.diagnostics.length > 0);
  assert.equal(typeof result.diagnostics[0].line, "number");
  assert.equal(typeof result.diagnostics[0].column, "number");
  assert.equal((await listed(ada!))[0].currentVersion, 1);
  const broken = await ok(ada!, "panel.save", { slug: "never", source: `import fs from "fs";\nexport default fs;\n` });
  assert.equal(broken.saved, false);
  assert.match(broken.diagnostics[0].message, /"@sdk"/);
  assert.deepEqual((await listed(ada!)).map((p: { slug: string }) => p.slug), ["keep"]);
});

test("another human can neither see nor address a human's panels", async () => {
  const [ada, bob] = await humans("Panel Ada", "Panel Bob");
  await ok(ada!, "panel.save", { slug: "secret-view", source: panel("mine") });
  assert.deepEqual(await listed(bob!), []);
  assert.deepEqual(await bob!.query("v2/panels:list"), []);
  assert.equal(await bob!.query("v2/panels:code", { slug: "secret-view" }), null);
  for (const [id, args] of [
    ["panel.code", { slug: "secret-view" }], ["panel.code", { slug: "secret-view", version: 1 }], ["panel.rollback", { slug: "secret-view", version: 1 }],
    ["panel.remove", { slug: "secret-view" }], ["panel.setEnabled", { slug: "secret-view", enabled: false }],
  ] as const) assert.match(await failure(bob!, id, args), /^No panel "secret-view"/, id);
  // Bob saving the same slug makes his own panel; Ada's is untouched.
  await ok(bob!, "panel.save", { slug: "secret-view", source: panel("his") });
  assert.match((await ok(ada!, "panel.code", { slug: "secret-view" })).source, /mine/);
  assert.equal((await listed(ada!))[0].currentVersion, 1);
});

test("a read delegate reads but cannot write; an act delegate writes as a delegate author", async () => {
  const [ada] = await humans("Panel Ada");
  await ok(ada!, "panel.save", { slug: "shared", source: panel("browser") });
  const reader = delegate(ada!.userId, "read"), actor = delegate(ada!.userId, "act");
  assert.equal((await reader("panel.list", {})).result.panels[0].slug, "shared");
  assert.match((await reader("panel.code", { slug: "shared" })).result.source, /browser/);
  assert.equal((await reader("panel.save", { slug: "shared", source: panel("read") })).error.code, "refused");
  assert.equal(await errorCode(reader("panel.rollback", { slug: "shared", version: 1 })), "no error", "refusals are values");
  assert.equal((await reader("panel.rollback", { slug: "shared", version: 1 })).error.code, "refused");

  assert.equal((await actor("panel.save", { slug: "shared", source: panel("agent") })).result.version, 2);
  const [row] = await listed(ada!);
  assert.deepEqual(row.author, { kind: "delegate", label: "remote assistant (act)" });
  assert.equal(row.lastForeignVersion, 2, "the version a delegate wrote (voids a client's 'let it act' grant)");
  await ok(ada!, "panel.save", { slug: "shared", source: panel("browser again") });
  assert.equal((await listed(ada!))[0].lastForeignVersion, 2, "a browser save keeps it");
  // Rolling back (even in the browser) to code a delegate wrote makes delegate code current again.
  const back = await ok(ada!, "panel.rollback", { slug: "shared", version: 2 });
  assert.equal((await listed(ada!))[0].lastForeignVersion, back.version);
  await ok(ada!, "panel.rollback", { slug: "shared", version: 3 });
  assert.equal((await listed(ada!))[0].lastForeignVersion, back.version, "rolling back to browser code keeps it");
});

test("a removed and re-created slug is a different panel (its id changes); remove leaves no versions", async () => {
  const [ada] = await humans("Panel Ada");
  await ok(ada!, "panel.save", { slug: "again", source: panel("one") });
  await ok(ada!, "panel.save", { slug: "again", source: panel("two") });
  const [first] = await listed(ada!);
  assert.deepEqual(await ok(ada!, "panel.remove", { slug: "again" }), { ok: true });
  assert.deepEqual(await listed(ada!), []);
  assert.equal(await admin.query("v2/panelTesting:versionCount", { panelId: first.panelId }), 0);
  assert.match(await failure(ada!, "panel.code", { slug: "again", version: 1 }), /^No panel/);
  await ok(ada!, "panel.save", { slug: "again", source: panel("three") });
  const [second] = await listed(ada!);
  assert.equal(second.currentVersion, 1);
  assert.notEqual(second.panelId, first.panelId);
});

test("a save's literal manifest sets title, placement and size (add-pane hints); explicit arguments win", async () => {
  const [ada] = await humans("Panel Ada");
  await ok(ada!, "panel.save", { slug: "where", source: panel("a") });
  const moved = `import { definePanel } from "@sdk";\nexport default definePanel({ title: "Moved", placement: "right", size: "lg", Component: () => null });\n`;
  await ok(ada!, "panel.save", { slug: "where", source: moved });
  const hints = async () => { const [p] = await listed(ada!); return [p.title, p.placement, p.size]; };
  assert.deepEqual(await hints(), ["Moved", "right", "lg"]);
  await ok(ada!, "panel.save", { slug: "where", source: moved, placement: "left", title: "Mine" });
  assert.deepEqual(await hints(), ["Mine", "left", "lg"]);
  await ok(ada!, "panel.save", { slug: "where", source: "export default () => null;\n" });
  assert.deepEqual(await hints(), ["Mine", "left", "lg"], "no manifest values: the stored ones stay");
});

test("enable follows the human; another human never sees it", async () => {
  const [ada, bob] = await humans("Panel Ada", "Panel Bob");
  await ok(ada!, "panel.save", { slug: "tool", source: panel("t") });
  await ok(ada!, "panel.setEnabled", { slug: "tool", enabled: false });
  assert.equal((await listed(ada!))[0].enabled, false);
  await ok(ada!, "panel.setEnabled", { slug: "tool", enabled: true });
  assert.equal((await listed(ada!))[0].enabled, true);
  assert.deepEqual(await listed(bob!), []);
});

test("limits: source size, bad slugs, 32 panels per human, 30 saves a minute (rollbacks count)", async () => {
  const [ada, bob] = await humans("Panel Ada", "Panel Bob");
  // Under the character cap but over the 64 KB byte cap (é is two bytes).
  const big = `export default ${JSON.stringify("é".repeat(33 * 1024))};\n`;
  assert.match(await failure(ada!, "panel.save", { slug: "big", source: big }), /limit is 64 KB/);
  await failure(ada!, "panel.save", { slug: "Not A Slug", source: panel("x") }, "invalid_args");

  await admin.mutation("v2/panelTesting:seedPanels", { userId: ada!.userId, count: 32 });
  assert.match(await failure(ada!, "panel.save", { slug: "one-too-many", source: panel("x") }), /At most 32 panels/);
  assert.equal((await ok(ada!, "panel.save", { slug: "seeded-0", source: panel("x") })).saved, true, "updating an existing panel is fine at the cap");

  for (let i = 0; i < 30; i++) await ok(bob!, "panel.save", { slug: "busy", source: panel(`n${i}`) });
  assert.match(await failure(bob!, "panel.save", { slug: "busy", source: panel("31") }), /At most 30 panel saves a minute/);
  assert.match(await failure(bob!, "panel.rollback", { slug: "busy", version: 25 }), /At most 30 panel saves a minute/);
  await admin.mutation("v2/panelTesting:ageSaves", { userId: bob!.userId, ms: 61_000 });
  assert.equal((await ok(bob!, "panel.save", { slug: "busy", source: panel("later") })).version, 31);
});

test("only the last 20 versions are kept", async () => {
  const [ada] = await humans("Panel Ada");
  for (let i = 1; i <= 22; i++) {
    await ok(ada!, "panel.save", { slug: "long", source: panel(`v${i}`) });
    if (i % 10 === 0) await admin.mutation("v2/panelTesting:ageSaves", { userId: ada!.userId, ms: 61_000 });
  }
  const [row] = await listed(ada!);
  assert.equal(row.currentVersion, 22);
  assert.match(await failure(ada!, "panel.code", { slug: "long", version: 2 }), /has no version 2 \(the last 20 are kept\)/);
  assert.equal(await ada!.query("v2/panels:code", { slug: "long", version: 2 }), null);
  assert.match((await ok(ada!, "panel.code", { slug: "long", version: 3 })).source, /v3/);
  assert.match(await failure(ada!, "panel.rollback", { slug: "long", version: 1 }), /has no version 1/);
  assert.equal(await admin.query("v2/panelTesting:versionCount", { panelId: row.panelId }), 20);
});

test("signed-out callers get nothing", async () => {
  assert.equal(await errorCode(anonymous.query("v2/panels:list")), "UNAUTHENTICATED");
  assert.equal(await errorCode(anonymous.query("v2/panels:code", { slug: "x" })), "UNAUTHENTICATED");
  assert.equal((await run(anonymous, "panel.list")).error.code, "refused");
  assert.equal((await run(anonymous, "panel.save", { slug: "x", source: panel("x") })).error.code, "refused");
});
