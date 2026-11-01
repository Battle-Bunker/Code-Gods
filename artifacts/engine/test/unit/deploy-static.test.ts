/**
 * deploy-static --if-changed skips a site whose built dist hashes to the marker recorded at its last upload, so
 * distHash must change with any byte, file name or layout change, and only then (the Vite builds are deterministic).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildIdOf, distHash } from "../../scripts/deploy-static.mjs";
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

test("buildIdOf: the id the Vite plugin wrote into index.html (as the browser reads it), else null", () => {
  const html = `<!doctype html><head>\n  <meta name="code-gods-build" content="0f1e2d3c4b5a6978">\n  </head>`;
  const built = tree({ ...SITE, "index.html": html }), old = tree(SITE);
  try {
    assert.equal(buildIdOf(built), "0f1e2d3c4b5a6978");
    assert.equal(buildIdOf(built), readBuildMeta(html), "deploy-static and the page agree");
    assert.equal(buildIdOf(old), null);
    assert.equal(buildIdOf(join(old, "missing")), null);
  } finally { rmSync(built, { recursive: true }); rmSync(old, { recursive: true }); }
});
