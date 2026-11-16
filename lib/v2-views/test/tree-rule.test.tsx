/** @jsxRuntime automatic */
/**
 * The line rules' tree shape (docs/engine-v2/pool-plan.md v2): the target nearest a reading (bigger is better), how far
 * the reading is from it (closer is better), then a third number judged against the same target. A family that emits
 * the annotation contract (each mark labelled with its layer's term: the reading's focus, the target and its
 * neighbours as candidates, the closeness as a measure, the third's own reading with its working as a note) is
 * explained by the views with no code of its own: each part says what was counted or measured and the nearest better
 * state, in the card's words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { q, type Q } from "@workspace/v2-core";
import { fromMC, lineQ, lineType, type LineState } from "@workspace/v2-linear";
import { annotate, CompactFace, ExpandedFace, type RuleRef } from "../src/index.ts";

import { treePrimeIntercept as primeIntercept } from "../src/demo.ts";
type P = { ends: number };
const rule = { type: lineType, family: primeIntercept, params: { ends: 1 }, variant: lineQ, tieBreaker: "close>times" } as RuleRef<LineState, P>;
const mc = (m: Q, c: Q): LineState => ({ lines: [fromMC(m, c)] });
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

test("the target: the reading, the nearest target and its neighbours from the rule's own marks, and the next one up", () => {
  const a = annotate(rule, mc(q(1, 31), q(32)));
  const [target, close, times] = a.sites[0]!.parts;
  // What was read and the target it is nearest, in the card's words; the direction of the next better level.
  assert.match(target!.sentence, /y-intercept 32/);
  assert.match(target!.sentence, /nearest 31/);
  assert.match(target!.sentence, /next up 41: 9 more/);
  // The ruler shows exactly the rule's targets (11, 31, 41), never guessed neighbours.
  assert.deepEqual(target!.ruler!.refs.map(r => r.at).sort((x, y) => x - y), [11, 31, 41]);
  // Closeness: measured to the target the rule named (the measure mark), not to a guess.
  assert.equal(close!.reference?.value, 31);
  assert.match(close!.sentence, /1 above 31/);
  // The third: its own reading and its working, from the rule's note.
  assert.match(times!.sentence, /31 × 1\/31 = 1|31 × ¹⁄₃₁ = 1/);
  assert.equal(times!.depth, 2);
  assert.equal(times!.name, "third preference");
});

test("the tree on a face, desktop and compact: three parts, each with its symbol; the measure drawn on the plane", () => {
  const s = mc(q(2, 7), q(103, 2)); // y = 2x/7 + 51½: 61 is nearer than 41
  const t = text(renderToStaticMarkup(<ExpandedFace rule={rule} state={s} improvement={false} initialRep="cart" />));
  assert.match(t, /● Main part/);
  assert.match(t, /◆ Secondary preference/);
  assert.match(t, /▲ Third preference/);
  assert.match(t, /nearest 61/);
  assert.match(t, /next up 71: 19½ more|next up 71: 19 ½ more/);
  const html = renderToStaticMarkup(<ExpandedFace rule={rule} state={s} improvement={false} initialRep="cart" />);
  assert.match(html, /data-mark="measure"/, "the closeness drawn as a bracket on the plane");
  const compact = text(renderToStaticMarkup(<CompactFace rule={rule} state={s} toScore={false} />));
  assert.match(compact, /● main part: .*61/);
  assert.match(compact, /◆ secondary preference: /);
  assert.match(compact, /▲ third preference: /);
});

test("said once, and labelled truly: the compact line names the reading once; the plane's targets are labelled by value", () => {
  const s = mc(q(1, 31), q(32));
  const compact = text(renderToStaticMarkup(<CompactFace rule={rule} state={s} toScore={false} />));
  const mainLine = /● main part: (.*?) ◆/.exec(compact)?.[1] ?? "";
  assert.equal((mainLine.match(/y-intercept 32/g) ?? []).length, 1, compact);
  const plane = renderToStaticMarkup(<ExpandedFace rule={rule} state={s} improvement={false} initialRep="cart" />);
  assert.doesNotMatch(text(plane), /41 · \d+ away/, "a neighbour target is not '31 away'");
});
