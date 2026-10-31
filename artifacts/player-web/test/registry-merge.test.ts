/** Merging file panels (src/panels/*.tsx) with stored panels (panels.list) into one registry (src/shell/registry-merge.ts). */
import test from "node:test";
import assert from "node:assert/strict";
import { mergePanels, policyKey, type StoredPanelMeta } from "../src/shell/registry-merge.ts";
import type { PanelEntry } from "../src/shell/panel-store.ts";

const file = (id: string): PanelEntry => ({ file: `${id}.tsx`, id, origin: "file", load: async () => ({}) });
const stored = (slug: string, over: Partial<StoredPanelMeta> = {}): StoredPanelMeta => ({
  slug, title: slug, placement: "right", size: "md", currentVersion: 2, enabled: true, lastForeignVersion: 0, ...over,
});

test("stored panels join the file panels as stored:<slug> entries with their version", () => {
  const entries = mergePanels([file("a")], [stored("b")]);
  assert.deepEqual(entries.map(e => [e.file, e.id, e.origin, e.version]), [["a.tsx", "a", "file", undefined], ["stored:b", "b", "stored", 2]]);
});

test("on an id clash the file panel wins and records the stored version it shadows", () => {
  const entries = mergePanels([file("same")], [stored("same", { currentVersion: 7 })]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].origin, "file");
  assert.equal(entries[0].shadows, 7);
});

test("a 'let it act' grant key names the stored panel's identity, not just its slug (a re-created slug is new code)", () => {
  const [a] = mergePanels([], [stored("tool", { id: "id-1" })]);
  const [b] = mergePanels([], [stored("tool", { id: "id-2", currentVersion: 1 })]);
  assert.notEqual(policyKey(a), policyKey(b));
  assert.equal(policyKey(file("x")), "file:x");
});

test("disabled stored panels are left out", () => {
  assert.deepEqual(mergePanels([], [stored("off", { enabled: false })]), []);
});

test("entries keep their identity when nothing changed (frames do not remount)", () => {
  const files = [file("a")];
  const first = mergePanels(files, [stored("b")]);
  const second = mergePanels(files, [stored("b")], first);
  assert.equal(second[0], first[0]);
  assert.equal(second[1], first[1]);
  const bumped = mergePanels(files, [stored("b", { currentVersion: 3 })], first);
  assert.notEqual(bumped[1], first[1]);
});
