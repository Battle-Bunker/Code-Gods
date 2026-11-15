import { test } from "node:test";
import assert from "node:assert/strict";
import { rulesForAi, type RulesInput } from "../src/panes/rules-words.ts";

const input: RulesInput = { title: "Beginner lines", minPlayers: 2, planningSeconds: 60, worldSeconds: 300, startingEnergy: 100, powerPerSecond: 4, fullChargeSeconds: 30 };

test("the rules for an AI: how to play, this game's values, then the agent primer", () => {
  const text = rulesForAi(input, "PRIMER TEXT");
  assert.match(text, /^# Code Gods: the rules, for an AI assistant/);
  const play = text.indexOf("## How to play"), game = text.indexOf("## This game"), agents = text.indexOf("## Writing agents");
  assert.ok(play > 0 && game > play && agents > game, "in that order");
  assert.match(text, /- Power: /);
  assert.ok(text.trimEnd().endsWith("PRIMER TEXT"));
});
