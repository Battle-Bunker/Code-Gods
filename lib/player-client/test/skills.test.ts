/**
 * Skills (src/skills.ts): the assistant's on-demand domain knowledge. What would break: a skill whose body is empty
 * or unbounded (it rides on every later step once loaded), a live part that throws on missing or odd data, another
 * god's data in a body, or an index entry the load_skill tool cannot load.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SKILLS, SKILL_LIMITS, SKILL_NAMES, findSkill, skillBody } from "../src/skills.ts";
import { CORE_TOOLS, TOOL_NAMES, tool } from "../src/tools.ts";

const helpers = [
  { group: "mutator", name: { python: "swap_digits", typescript: "swapDigits" }, signature: { python: "swap_digits(i, j)", typescript: "swapDigits(i, j)" }, kid: "Swap two digits" },
  { group: "read", name: { python: "digits", typescript: "digits" }, signature: { python: "digits(x) -> list[int]", typescript: "digits(x): number[]" } },
];
const observation = { phase: "planning", language: "typescript", instance: { helpers }, self: { utility: { name: "Power Hoarder", summary: "Factors of 3.", source: "def u(x): return x % 3", penalty: { name: "Odd", source: "def p(x): return x % 2" } } } };
const layout = { panels: [{ id: "objects", title: "Objects by payoff", blurb: "Ranked objects", phases: ["running"], paramsSchema: { properties: { sortBy: { enum: ["payoff", "mine"] }, limit: {} } } }], storedPanels: [{ slug: "mine" }] };

test("the index: kebab-case names, one-line descriptions, every skill loadable by load_skill", () => {
  for (const s of SKILLS) {
    assert.match(s.name, /^[a-z]+(-[a-z]+)*$/);
    assert.ok(s.description.length >= 40 && s.description.length <= 160 && !s.description.includes("\n"), s.name);
    assert.equal(findSkill(s.name), s);
    for (const t of s.tools) assert.ok(TOOL_NAMES.includes(t as never) && !(CORE_TOOLS as readonly string[]).includes(t), `${s.name}: ${t} is an index tool of the registry`);
  }
  assert.deepEqual(tool("load_skill").input.safeParse({ name: "writing-agents" }).success, true);
  assert.deepEqual(tool("load_skill").input.safeParse({ name: "nope" }).success, false);
  assert.deepEqual([...SKILL_NAMES], SKILLS.map(s => s.name));
});

test("bodies carry their guidance and live parts, within the limit, and survive missing or odd data", () => {
  const writing = skillBody("writing-agents", { observation });
  for (const expected of ["validate_agent", "swapDigits(i, j) — Swap two digits", "digits(x): number[]", "def u(x): return x % 3", "Defence goal", "Allowed languages: typescript", "Helpers in typescript:"]) {
    assert.ok(writing.includes(expected), `writing-agents has ${expected}`);
  }
  assert.ok(!writing.includes("swap_digits"), "only the allowed language's helper names");
  const both = skillBody("writing-agents", { observation: { ...observation, languages: ["typescript", "python"] } });
  assert.ok(both.includes("Allowed languages: typescript, python"), "every language the game allows");
  assert.ok(both.includes("swapDigits(i, j)") && both.includes("swap_digits(i, j)"), "with each allowed language's helper names");
  const screen = skillBody("screen", { layout });
  assert.ok(screen.includes("objects — Objects by payoff (Ranked objects): params sortBy(payoff|mine), limit; phases running"), screen);
  assert.ok(screen.includes("Stored panels of the player (open_panel {slug}): mine"));
  assert.match(skillBody("game-rules", { rules: { rules: "# Code Gods rules" } }), /# Code Gods rules/);
  assert.match(skillBody("game-setups", {}), /update_settings/);
  for (const name of SKILL_NAMES) {
    for (const data of [{}, { rules: 42, observation: "nope", layout: { panels: "nope" } }, { rules: { rules: "r".repeat(100_000) }, observation: { ...observation, self: { utility: { source: "s".repeat(100_000) } } }, layout }]) {
      const body = skillBody(name, data);
      assert.ok(body.length > 40 && body.length <= SKILL_LIMITS.body + 10, `${name}: ${body.length}`);
    }
  }
  assert.match(skillBody("game-rules", {}), /call get_rules/);
  assert.match(skillBody("writing-agents", {}), /call get_observation/);
});
