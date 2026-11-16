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
  assert.match(tb ?? "", /^Secondary: The crossing without its 5s/);
  assert.doesNotMatch(tb ?? "", /Secondary: (Secondary|Tie-breaker)/);
  assert.match(html, /<details class="v2v-goal-example">/, "the game's card folds the worked example until asked for");
  assert.match(renderToStaticMarkup(<GoalCard rule={rule} example={example} />), /<details class="v2v-goal-example" open=""/, "a gallery opens it");
});

test("a rule of any depth: each preference on its own line, in order (#879: 'a>b')", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { GoalCard } = await import("../src/index.ts");
  const { lineType, lineZ } = await import("@workspace/v2-linear");
  const fam = lineType.families.find(f => f.tieBreakers.length >= 2 && (f as { main?: { sentence?: unknown } }).main?.sentence)!;
  const params = fam.dealable(lineZ)[0];
  const tb = `${fam.tieBreakers[0]!.id}>${fam.tieBreakers[1]!.id}`;
  const rule = { type: lineType, family: fam, params, variant: lineZ, tieBreaker: tb } as never;
  const html = renderToStaticMarkup(<GoalCard rule={rule} example={lineType.origin(lineZ)} />);
  assert.match(html, /data-testid="text-goal-tie-breaker"><b>Secondary:<\/b>/);
  assert.match(html, /data-testid="text-goal-preference-2"><b>Third:<\/b>/);
  assert.doesNotMatch(html, /Tie-breaker/);
});
