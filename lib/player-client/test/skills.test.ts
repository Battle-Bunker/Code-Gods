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
const layout = { panels: [{ id: "objects", title: "Objects", blurb: "Ranked objects", phases: ["running"], paramsSchema: { properties: { sortBy: { enum: ["payoff", "mine"] }, limit: {} } } }], storedPanels: [{ slug: "mine" }] };

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
  assert.ok(screen.includes("objects — Objects (Ranked objects): params sortBy(payoff|mine), limit; phases running"), screen);
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

test("writing-agents: many long mutators never crowd out the read helpers (the 1WB8 Grid: 22 mutators, 39 read helpers)", () => {
  const long = (n: number, group: string) => ({ group, name: { python: `${group}_${n}` }, signature: { python: `${group}_${n}(where, colour, other_way=False)` },
    kid: "A long description of what this helper does to the grid, row by row, wrapping round the rainbow, as the Grid helpers' descriptions are.".slice(0, 140) });
  const many = [...Array.from({ length: 22 }, (_, n) => long(n, "mutator")), ...Array.from({ length: 39 }, (_, n) => long(n, "read"))];
  const body = skillBody("writing-agents", { observation: { ...observation, language: "python", languages: ["python"], instance: { helpers: many } } });
  assert.ok(body.includes("mutator_21("), "every mutator");
  assert.ok(body.includes("Read helpers:") && body.includes("read_0("), "the read helpers too");
  assert.ok(body.includes("def u(x)"), "and the utility source");
});

test("writing-agents: the player's rule and defence goal arrive whole, however long the helper lists and the first agent are", () => {
  // What would break (seen live, 13 Nov 2026: Tetromino Tamer on a 4×4 colour grid): the body is cut at its limit and
  // the rule's source comes last, so with long helper lists and a first agent before it the assistant read a rule
  // whose last lines were missing. The helper lists are what gives way: get_observation has them all.
  const long = (i: number, group: string) => ({ group, name: { python: `h${group[0]}${i}` }, signature: { python: `h${group[0]}${i}(${"x".repeat(150)})` }, kid: "k".repeat(140) });
  const helpers = [{ group: "mutator", name: { python: "slide" }, signature: { python: "slide(line, steps=1)" }, kid: "Slide a line" },
    ...Array.from({ length: 200 }, (_, i) => long(i, "mutator")), ...Array.from({ length: 200 }, (_, i) => long(i, "read"))];
  const source = `def utility(grid):\n${"    total = total + 1  # a long rule\n".repeat(79)}    return (total, LAST_LINE_OF_THE_RULE)`;
  const penalty = `def penalty(grid):\n${"    worst = worst + 1  # a long goal\n".repeat(78)}    return LAST_LINE_OF_THE_GOAL`;
  assert.ok(source.length > 2900 && source.length <= SKILL_LIMITS.source && penalty.length <= SKILL_LIMITS.source);
  const firstAgent = { name: "Example", source: `def agent(grid):\n${"    # a commented step of the example\n".repeat(10)}    return [slide(row(0), 1)]` };
  const body = skillBody("writing-agents", { firstAgent, observation: { phase: "planning", languages: ["python"], instance: { objectType: "Grid", helpers },
    self: { utility: { familyId: "tetromino_tamer", name: "Tetromino Tamer", summary: "s".repeat(60), source, penalty: { name: "Goal", summary: "s".repeat(60), source: penalty } } } } });
  assert.ok(body.length <= SKILL_LIMITS.body, `${body.length} characters`);
  assert.ok(!body.endsWith("… [cut]"), "the body is not cut");
  assert.ok(body.includes("LAST_LINE_OF_THE_RULE") && body.includes("LAST_LINE_OF_THE_GOAL"), "both sources to their last line");
  assert.ok(body.includes("This skill's tools"), "and the tools line after them");
  assert.ok(body.includes("hm0(") && body.includes("hr0(") && body.includes("… more in get_observation"), "the helper lists are what gives way, both groups still present");
});

test("the writing-agents skill carries a first agent for the player's game: short, commented, readable back, and absent when it could not work", async () => {
  const { firstAgentFor, firstAgentIn } = await import("../src/first-agent.ts");
  const { CHIP_TEXT, chipIntent } = await import("../src/chips.ts");
  const slide = { group: "mutator", name: { python: "slide", typescript: "slide" }, signature: { python: "slide(line, steps=1)", typescript: "slide(line, steps = 1)" }, kid: "Slide a line" };
  const grid = { phase: "planning", languages: ["python"], instance: { objectType: "Grid", helpers: [slide, ...Array.from({ length: 400 }, (_, i) => ({ ...slide, name: { python: `m${i}` }, signature: { python: `m${i}(${"x".repeat(150)})` } }))] },
    self: { utility: { familyId: "mirrormancer", name: "Mirrormancer", summary: "Mirror the halves.", source: "def u(g): return 1" } } };
  const body = skillBody("writing-agents", { observation: grid });
  const example = firstAgentIn(body);
  assert.deepEqual(example, { language: "python", ...firstAgentFor({ objectType: "Grid", language: "python" })! }, "the example is in the body, whole, before the long helper lists");
  const lines = example!.source.split("\n");
  assert.ok(lines.length >= 5 && lines.length <= 15, `${lines.length} lines`);
  assert.ok(lines.filter(l => l.trim().startsWith("#")).length >= 2 && lines.some(l => l.startsWith("def agent(")), example!.source);
  assert.doesNotMatch(example!.source, /\bbits\b/, "plain words in the comments");
  for (const [objectType, language, opens] of [["Grid", "typescript", "function agent(grid) {"], ["Int", "python", "def agent(x):"], ["string", "typescript", "function agent(s) {"]] as const) {
    assert.ok(firstAgentFor({ objectType, language })!.source.includes(opens), `${objectType} in ${language}`);
  }
  // A game whose prelude lacks the move's mutator, an unknown type and the lobby get no example (the assistant says so).
  assert.equal(firstAgentFor({ objectType: "Grid", language: "python", mutators: ["paint"] }), null);
  assert.equal(firstAgentIn(skillBody("writing-agents", { observation: { ...grid, instance: { objectType: "Grid", helpers: [] } } })), null);
  assert.equal(firstAgentIn(skillBody("writing-agents", { observation })), null, "no object type known");
  assert.equal(firstAgentIn(skillBody("writing-agents", {})), null);
  assert.equal(chipIntent(` ${CHIP_TEXT.firstAgent}. `), "writeAgent");
  assert.equal(chipIntent(CHIP_TEXT.explainGoal), "explainGoal");
  assert.equal(chipIntent(CHIP_TEXT.whatNext), null);
});
