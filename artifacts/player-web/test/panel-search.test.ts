/** The panel picker's filtering (src/dock/panel-search.ts): fuzzy over the title and synonyms, sections kept. */
import test from "node:test";
import assert from "node:assert/strict";
import { PANEL_IDS, PANELS } from "@workspace/player-client/panels";
import { PANEL_SYNONYMS, filterChoices, type PickerChoice } from "../src/dock/panel-search.ts";

const choices: PickerChoice[] = PANEL_IDS.map(id => ({ key: id, title: PANELS[id].title, section: id === "results" || id === "timeline" ? "later" : "now", keywords: PANEL_SYNONYMS[id] }));
choices.push({ key: "stored:mine", title: "Mine plus", section: "mine" });
const keys = (q: string) => filterChoices(choices, q).flatMap(g => g.choices.map(c => c.key));

test("every built-in panel has synonyms", () => { for (const id of PANEL_IDS) assert.ok(PANEL_SYNONYMS[id].length > 0, id); });

test("an empty query lists every choice, sections in order, input order kept", () => {
  const groups = filterChoices(choices, "");
  assert.deepEqual(groups.map(g => g.section.id), ["now", "later", "mine"]);
  assert.equal(groups.flatMap(g => g.choices).length, choices.length);
  assert.deepEqual(groups[0].choices.map(c => c.key).slice(0, 2), [PANEL_IDS[0], PANEL_IDS[1]]);
});

test("typing the name or a synonym finds the panel: \"chat\" is Public chat, \"leaderboard\" is the race", () => {
  assert.equal(keys("chat")[0], "public-chat");
  assert.equal(keys("leader")[0], "race");
  assert.equal(keys("replay")[0], "timeline", "a synonym");
  assert.equal(keys("how game")[0], "results", "several words each match the title");
});

test("fuzzy: scattered letters of the title match, nonsense matches nothing, sections without a match disappear", () => {
  assert.ok(keys("pblcht").includes("public-chat"));
  assert.deepEqual(keys("zzzqqq"), []);
  assert.deepEqual(filterChoices(choices, "plus").map(g => g.section.id), ["mine"]);
});

test("a title match outranks a synonym match", () => {
  const two: PickerChoice[] = [{ key: "a", title: "Agent code", section: "now", keywords: ["chat"] }, { key: "b", title: "Chat", section: "now" }];
  assert.deepEqual(filterChoices(two, "chat")[0].choices.map(c => c.key), ["b", "a"]);
});
