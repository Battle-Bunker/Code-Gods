/**
 * Params are named and typed (v1; owner 2026-11-03: "colours by name, never an index"; v1-audit §2.3): every rule a
 * deployed preset deals carries its parameters as a record by name (never a positional list, never a numeric key), each
 * value a number, a word, or a list of numbers; and a parameter that names a colour holds the colour's name, in every
 * rule that deals it. Cards, drift, the agents' API and the gallery read params by these names.
 *
 * What would break: params dealt positionally or under numeric keys; a colour parameter dealt as an index into a palette.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS } from "../../convex/v2/presets.ts";
import { dealablePool } from "../../convex/v2/deal.ts";

const COLOURS = new Set(["red", "green", "blue", "yellow", "black", "white", "orange", "purple"]);
const typed = (v: unknown) => (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.length > 0)
  || (Array.isArray(v) && v.every(x => typeof x === "number" && Number.isFinite(x)));

test("every dealt rule's params are a record by name; values are numbers, words or number lists; colours by name", () => {
  const problems = new Set<string>();
  const values = new Map<string, unknown[]>();   // family.param → every value dealt
  for (const preset of PRESETS) {
    for (const rule of dealablePool(preset)) {
      const params = rule.params as unknown;
      if (typeof params !== "object" || params === null || Array.isArray(params)) { problems.add(`${rule.family}: params are not a record by name`); continue; }
      for (const [name, value] of Object.entries(params)) {
        if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) problems.add(`${rule.family}: parameter "${name}" is not a name`);
        if (!typed(value)) problems.add(`${rule.family}.${name}: ${JSON.stringify(value)} is not a number, a word or a number list`);
        const key = `${rule.family}.${name}`;
        values.set(key, [...(values.get(key) ?? []), value]);
      }
    }
  }
  assert.ok(values.size > 20, `the presets deal named parameters (${values.size})`);
  // A colour parameter: one that deals a colour's name anywhere. It must deal names everywhere, never an index.
  for (const [key, vs] of values)
    if (vs.some(v => typeof v === "string" && COLOURS.has(v)) && !vs.every(v => typeof v === "string" && COLOURS.has(v)))
      problems.add(`${key}: a colour parameter dealt as ${JSON.stringify(vs.find(v => !(typeof v === "string" && COLOURS.has(v))))}, not by name`);
  assert.deepEqual([...problems].sort(), []);
});
