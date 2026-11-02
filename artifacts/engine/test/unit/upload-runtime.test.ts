/** The runtime upload's build decision: dev rebuilds a missing or stale bundle before uploading it. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { bundleStatus } from "../../scripts/upload-runtime.mjs";

const dir = mkdtempSync(join(tmpdir(), "cg-bundle-"));
const pinned = Buffer.from("the pinned bundle");
const pin = createHash("sha256").update(pinned).digest("hex");   // the pin is over the uncompressed bytes
const file = (name: string, bytes: Buffer) => { const path = join(dir, name); writeFileSync(path, bytes); return path; };

test("a bundle that is not there is missing", () => {
  assert.equal(bundleStatus(join(dir, "absent.bin.gz"), pin), "missing");
});

test("the gzip of the pinned bytes is current", () => {
  assert.equal(bundleStatus(file("current.bin.gz", gzipSync(pinned)), pin), "current");
});

test("a bundle built from other bytes is stale", () => {
  assert.equal(bundleStatus(file("old.bin.gz", gzipSync(Buffer.from("last week's guest code"))), pin), "stale");
});

test("the pinned bytes stored without gzip are stale, not current", () => {
  assert.equal(bundleStatus(file("raw.bin.gz", pinned), pin), "stale");
});
