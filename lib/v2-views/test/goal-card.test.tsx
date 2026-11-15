/**
 * The goal card says what a player needs first (playtest round 27: Whole Crossing's card read 52 words before anything
 * else): the title, the main sentence and one tie-breaker line; the worked example folded until asked for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { q } from "@workspace/v2-core";
import { fromMC, lineQ, lineType, wholeCrossing, type LineState } from "@workspace/v2-linear";
import { GoalCard, type RuleRef } from "../src/index.ts";

const rule: RuleRef<LineState, unknown> = { type: lineType, family: wholeCrossing as never, params: wholeCrossing.dealable(lineQ)[0], variant: lineQ, tieBreaker: "shared-factor" };
const example: LineState = { lines: [fromMC(q(-2), q(12))] };

test("the card: the main sentence and one tie-breaker line, each on its own; the worked example closed", () => {
  const html = renderToStaticMarkup(<GoalCard rule={rule} example={example} exampleOpen={false} />);
  const main = /data-testid="text-goal-main"[^>]*>([^<]+)</.exec(html)?.[1];
  const tb = /data-testid="text-goal-tie-breaker"[^>]*>(.+?)<\/p>/.exec(html)?.[1]?.replace(/<[^>]+>/g, "");
  assert.equal(main, wholeCrossing.main.sentence(rule.params as never));
  assert.match(tb ?? "", /^Tie-breaker: The crossing without its 5s/);
  assert.doesNotMatch(tb ?? "", /Tie-breaker: Tie-breaker/);
  assert.match(html, /<details class="v2v-goal-example">/, "the game's card folds the worked example until asked for");
  assert.match(renderToStaticMarkup(<GoalCard rule={rule} example={example} />), /<details class="v2v-goal-example" open=""/, "a gallery opens it");
});
