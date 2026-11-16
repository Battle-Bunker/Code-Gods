/**
 * Promotion gate: develop's schema accepts every row production can hold. Convex refuses to push a schema that stored
 * rows do not match, and production still holds v1's rows. test/fixtures/production-schema.json is the schema last
 * deployed to production (each table's exported document validator); every one of its tables must still be in the
 * schema, and each validator must accept everything the old one did (v.any(), the same, or wider). Rows of a table
 * production's schema never listed are not validated by Convex, so they need nothing.
 *
 * When production is promoted, refresh the fixture from the new `main` (docs/engine-v2/release-readiness.md says how).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

/** esbuild as `convex deploy` bundles with it (the convex package's own dependency). */
const { build } = createRequire(createRequire(import.meta.url).resolve("convex/package.json"))("esbuild") as { build(options: Record<string, unknown>): Promise<unknown> };

type V = { type: string; value?: unknown; tableName?: string; keys?: V; values?: { fieldType: V; optional: boolean } };
type Field = { fieldType: V; optional: boolean };

/** True when every value `old` accepts, `now` accepts too. */
export function widens(now: V, old: V): boolean {
  if (now.type === "any") return true;
  if (old.type === "union") return (old.value as V[]).every(member => widens(now, member));
  if (now.type === "union") return (now.value as V[]).some(member => widens(member, old));
  if (now.type !== old.type) return false;
  switch (old.type) {
    case "literal": return now.value === old.value;
    case "id": return now.tableName === old.tableName;
    case "array": return widens(now.value as V, old.value as V);
    case "record": return widens(now.keys!, old.keys!) && widens(now.values!.fieldType, old.values!.fieldType);
    case "object": {
      const n = now.value as Record<string, Field>, o = old.value as Record<string, Field>;
      for (const [name, f] of Object.entries(o)) {
        const g = n[name];
        if (!g || (f.optional && !g.optional) || !widens(g.fieldType, f.fieldType)) return false;
      }
      // A field the old shape never had must be optional: old rows lack it.
      return Object.entries(n).every(([name, g]) => name in o || g.optional);
    }
    default: return true;   // string, number, boolean, bigint, bytes, null: same type
  }
}

async function currentSchema(): Promise<Record<string, V>> {
  const dir = mkdtempSync(join(tmpdir(), "schema-"));
  try {
    const out = join(dir, "schema.mjs");
    await build({ entryPoints: [fileURLToPath(new URL("../../convex/schema.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "error" });
    const schema = (await import(out)).default as { tables: Record<string, { export(): { documentType: V } }> };
    return Object.fromEntries(Object.entries(schema.tables).map(([name, t]) => [name, t.export().documentType]));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const obj = (fields: Record<string, [V, boolean?]>): V =>
  ({ type: "object", value: Object.fromEntries(Object.entries(fields).map(([k, [fieldType, optional = false]]) => [k, { fieldType, optional }])) });
const S: V = { type: "string" }, N: V = { type: "number" }, lit = (value: string): V => ({ type: "literal", value });

test("widens: any, an added literal and a loosened field widen; a dropped literal, a new required field and a narrowed field do not", () => {
  const old = obj({ a: [S], b: [{ type: "union", value: [lit("x"), lit("y")] }], c: [N, true] });
  assert.ok(widens({ type: "any" }, old));
  assert.ok(widens(obj({ a: [S], b: [{ type: "union", value: [lit("x"), lit("y"), lit("z")] }], c: [N, true] }), old));
  assert.ok(widens(obj({ a: [S, true], b: [{ type: "union", value: [lit("x"), lit("y")] }], c: [N, true], d: [N, true] }), old));
  assert.ok(!widens(obj({ a: [S], b: [lit("x")], c: [N, true] }), old), "a dropped literal");
  assert.ok(!widens(obj({ a: [S], b: [{ type: "union", value: [lit("x"), lit("y")] }], c: [N, true], d: [N] }), old), "a new required field");
  assert.ok(!widens(obj({ a: [S], b: [{ type: "union", value: [lit("x"), lit("y")] }], c: [N] }), old), "optional made required");
  assert.ok(!widens(obj({ b: [{ type: "union", value: [lit("x"), lit("y")] }], c: [N, true] }), old), "a field removed from a strict object");
});

test("develop's schema accepts every table and row shape production's schema allowed", async () => {
  const production = JSON.parse(readFileSync(new URL("../fixtures/production-schema.json", import.meta.url), "utf8")) as { tables: Record<string, V> };
  const now = await currentSchema();
  const missing = Object.keys(production.tables).filter(t => !now[t]);
  assert.deepEqual(missing, [], "a production table left the schema (keep it loose until D3)");
  const narrowed = Object.entries(production.tables).filter(([t, old]) => !widens(now[t], old)).map(([t]) => t);
  assert.deepEqual(narrowed, [], "these tables' validators reject rows production's schema allowed");
});
