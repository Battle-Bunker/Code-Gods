/**
 * Parity with the old app is enforced, not remembered (coordinator, 15 November): docs/engine-v2/v1-parity.json lists
 * every pane, component, page, palette command, shortcut, setting and e2e scenario of archive/engine-v1's player app.
 * A row that is not present must say why (a decision and its source) or what restores it (who ports it, what the
 * server supplies). Restoring something: set its row "present" with the v2 file. Never delete a row.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

type Row = { id: string; kind: string; v1: string; v1Source: string; status: "present" | "missing" | "changed"; v2: string; reason: string; plan: string; server: string; hours: number };
const rows = JSON.parse(readFileSync(new URL("../../../docs/engine-v2/v1-parity.json", import.meta.url), "utf8")) as Row[];

test("every row is well formed and its id unique", () => {
  assert.ok(rows.length >= 400, "the inventory is whole");
  assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
  for (const r of rows) {
    assert.ok(["present", "missing", "changed"].includes(r.status), `${r.id}: status`);
    assert.ok(r.v1 && r.v1Source, `${r.id}: what it was in v1 and where`);
    if (r.status === "present") assert.ok(r.v2, `${r.id}: present, so it names the v2 file`);
  }
});

test("nothing is missing or changed without a named reason or a plan", () => {
  const silent = rows.filter(r => r.status !== "present" && !r.reason.trim() && !r.plan.trim()).map(r => r.id);
  assert.deepEqual(silent, [], "rows missing or changed with no reason and no plan");
});
