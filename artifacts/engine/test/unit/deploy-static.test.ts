/**
 * deploy-static --if-changed skips a site whose built dist hashes to the marker recorded at its last upload, so
 * distHash must change with any byte, file name or layout change, and only then (the Vite builds are deterministic).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { distHash, stampBuildId } from "../../scripts/deploy-static.mjs";
import { readBuildMeta } from "@workspace/player-client/build-meta";

function tree(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "dist-"));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

const SITE = { "index.html": "<html></html>", "assets/app.js": "console.log(1)", "assets/app.css": "body{}" };

test("distHash: the same files in another directory, written in another order, hash the same", () => {
  const a = tree(SITE), b = tree(Object.fromEntries(Object.entries(SITE).reverse()));
  try { assert.equal(distHash(a), distHash(b)); } finally { rmSync(a, { recursive: true }); rmSync(b, { recursive: true }); }
});

test("distHash: one changed byte, a renamed file, a moved file or an added empty file each change the hash", () => {
  const base = tree(SITE);
  const variants = [
    tree({ ...SITE, "assets/app.js": "console.log(2)" }),
    tree({ "index.html": SITE["index.html"], "assets/app2.js": SITE["assets/app.js"], "assets/app.css": SITE["assets/app.css"] }),
    tree({ "index.html": SITE["index.html"], "app.js": SITE["assets/app.js"], "assets/app.css": SITE["assets/app.css"] }),
    tree({ ...SITE, "empty.txt": "" }),
  ];
  try {
    const hashes = new Set([base, ...variants].map(distHash));
    assert.equal(hashes.size, 1 + variants.length);
  } finally { for (const d of [base, ...variants]) rmSync(d, { recursive: true }); }
});

test("distHash: a file's name and contents can't trade bytes with the next entry", () => {
  const a = tree({ "a": "bc", "d": "" }), b = tree({ "a": "b", "cd": "" });
  try { assert.notEqual(distHash(a), distHash(b)); } finally { rmSync(a, { recursive: true }); rmSync(b, { recursive: true }); }
});

test("distHash: the hash follows the tree, not the directory's own name", () => {
  const a = tree(SITE);
  const moved = `${a}-moved`;
  try {
    const before = distHash(a);
    renameSync(a, moved);
    assert.equal(distHash(moved), before);
  } finally { rmSync(moved, { recursive: true, force: true }); rmSync(a, { recursive: true, force: true }); }
});

test("stampBuildId: an id over every file, written where the page reads it; stamping again changes nothing", () => {
  const page = "<!doctype html><html><head><title>x</title></head><body></body></html>";
  const a = tree({ ...SITE, "index.html": page }), same = tree({ ...SITE, "index.html": page });
  const frame = tree({ ...SITE, "index.html": page, "panel-runtime.js": "v2" }), html = tree({ ...SITE, "index.html": page.replace("x", "y") });
  const none = tree(SITE), headless = tree({ ...SITE, "index.html": "<p>no head</p>" });
  try {
    const id = stampBuildId(a);
    assert.match(id!, /^[0-9a-f]{16}$/);
    const stamped = readFileSync(join(a, "index.html"), "utf8");
    assert.equal(readBuildMeta(stamped), id, "the page reads the id deploy-static wrote (lib/player-client/src/build-meta.ts)");
    const hash = distHash(a);
    assert.equal(stampBuildId(a), id, "idempotent, so --skip-build and --if-changed see the same build");
    assert.equal(distHash(a), hash);
    assert.equal(stampBuildId(same), id, "a byte-identical build gets the same id");
    assert.notEqual(stampBuildId(frame), id, "a file outside the main bundle (the panel frame) counts");
    assert.notEqual(stampBuildId(html), id, "index.html itself counts");
    assert.equal(stampBuildId(none), null);
    assert.equal(stampBuildId(headless), null);
    assert.equal(stampBuildId(join(none, "missing")), null);
  } finally { for (const d of [a, same, frame, html, none, headless]) rmSync(d, { recursive: true }); }
});
