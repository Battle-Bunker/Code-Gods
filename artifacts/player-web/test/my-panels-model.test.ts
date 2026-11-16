/** "Your panels" in player words (src/panes/my-panels-model.ts). */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { authorText, diagnosticText, EXAMPLE_PANEL, examplesFrom, rollbackTarget, saveOutcomeText, slugProblem } from "../src/panes/my-panels-model.ts";

test("a compile diagnostic reads as a line and column, with the compiler's code last", () => {
  assert.equal(diagnosticText({ line: 3, column: 9, code: "TS1005", message: "';' expected." }), "Line 3, column 9: ';' expected. (TS1005)");
});

test("a save says the version, or how many problems stopped it", () => {
  assert.equal(saveOutcomeText({ saved: true, slug: "my-stats", version: 2, diagnostics: [] }), "Saved my-stats as version 2.");
  assert.equal(saveOutcomeText({ saved: false, slug: "my-stats", version: null, diagnostics: [{ line: 1, column: 1, code: "X", message: "m" }] }), "Not saved: 1 problem to fix.");
  assert.equal(saveOutcomeText({ saved: false, slug: "x", version: null, diagnostics: [{ line: 1, column: 1, code: "X", message: "m" }, { line: 2, column: 1, code: "X", message: "m" }] }), "Not saved: 2 problems to fix.");
});

test("the author says who wrote the current version", () => {
  assert.equal(authorText({ kind: "browser", label: "Alice" }), "written by you");
  assert.equal(authorText({ kind: "delegate", label: "assistant (act)" }), "written by your assistant (act)");
  assert.equal(authorText({ kind: "delegate", label: "CLI" }), "written by the CLI");
});

test("a slug is checked before saving, in plain words", () => {
  assert.equal(slugProblem("my-stats"), null);
  assert.match(slugProblem("") ?? "", /Name the panel/);
  assert.match(slugProblem("My Stats") ?? "", /lowercase letters, digits and dashes/);
  assert.match(slugProblem("-x") ?? "", /lowercase letters, digits and dashes/);
  assert.match(slugProblem("a".repeat(49)) ?? "", /lowercase letters, digits and dashes/);
});

test("rolling back goes to the version before the current one, if one is kept", () => {
  assert.equal(rollbackTarget(1), null);
  assert.equal(rollbackTarget(4), 3);
});

test("the example panel uses only the v2 SDK, react's JSX and definePanel, with no em dashes", () => {
  assert.match(EXAMPLE_PANEL, /from "@sdk"/);
  assert.match(EXAMPLE_PANEL, /export default definePanel\(/);
  assert.doesNotMatch(EXAMPLE_PANEL, /—/);
  for (const m of EXAMPLE_PANEL.matchAll(/from "([^"]+)"/g)) assert.ok(["@sdk", "react"].includes(m[1]!), m[1]);
});

const EXAMPLES_DIR = path.join(import.meta.dirname, "../src/panels/examples");
const exampleFiles = () => Object.fromEntries(readdirSync(EXAMPLES_DIR).filter(f => f.endsWith(".tsx")).map(f => [`./${f}`, readFileSync(path.join(EXAMPLES_DIR, f), "utf8")]));

test("the example panels: v1's seven, each a valid slug with its own title, importing only what a panel may", () => {
  const examples = examplesFrom(exampleFiles());
  assert.equal(examples[0]!.slug, "my-stats", "the starting example comes first");
  assert.deepEqual(examples.slice(1).map(e => e.slug).sort(), [
    "agent-energy-timeline", "leaderboard-race", "mutator-explorer", "my-points-over-time", "opponent-interests", "salient-to-others", "what-if-mutation",
  ]);
  for (const e of examples) {
    assert.equal(slugProblem(e.slug), null, e.slug);
    assert.ok(e.title && !e.title.startsWith("./"), `${e.slug} names its title`);
    assert.match(e.source, /export default definePanel\(/, e.slug);
    for (const [, spec] of e.source.matchAll(/from\s+"([^"]+)"/g)) assert.ok(["react", "@sdk"].includes(spec!), `${e.slug} imports ${spec}`);
  }
  assert.equal(new Set(examples.map(e => e.title)).size, examples.length, "titles are distinct");
});
