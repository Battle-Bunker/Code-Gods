/** @jsxRuntime automatic */
/**
 * The faces, the goal card and the move line for a grid under every grid rule family (read at run time, so a revised
 * pool is covered as it stands): the rule's own views, its marks, a short working and the noun "grid".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { grid4, gridType, type GridState } from "@workspace/v2-grid";
import { annotate, CompactFace, ExpandedFace, GoalCard, mainLine, MoveLine, repText, type RuleRef } from "../src/index.ts";
import { key as refNodeKey } from "../src/render/common.tsx";

const board = (...rows: string[]): GridState => ({ cells: rows.flatMap(r => [...r].map(Number)) });
const B = board("3113", "0480", "2222", "9003");
const rules: RuleRef<GridState, unknown>[] = gridType.families.map(f => ({ type: gridType, family: f, params: f.dealable(grid4)[0], variant: grid4 }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const raritiesFor = (rule: RuleRef<GridState, unknown>) => Array.from({ length: annotate(rule, B).top + 1 }, (_, i) => i / 2);

test("compact face: each rule's main view with its focus marks, the main part in a line, the step, no word 'line'", () => {
  for (const rule of rules) {
    const html = renderToStaticMarkup(<CompactFace rule={rule} state={B} next />);
    assert.match(html, new RegExp(`data-rep="${rule.family.main.rep}"`), rule.family.id);
    const e = annotate(rule, B).sites[0]!.evaluation;
    for (const m of e.marks) if (m.kind === "focus" && m.ref.rep === rule.family.main.rep) assert.match(html, new RegExp(`data-ref="${refNodeKey(m.ref).replace(/[.()]/g, "\\$&")}"[^>]*data-focus=""`), rule.family.id);
    const t = text(html);
    assert.match(t, /step \d+ of \d+|not scoring/, rule.family.id);
    assert.doesNotMatch(t, /(?<!fold )\bline\b/, rule.family.id);   // "the fold line" is Crosswise Threes' word, not the object's noun
    // The one line says the main part's quantity and amount, never a single unit's note standing for the whole.
    const line = mainLine(rule, B, annotate(rule, B));
    const part = annotate(rule, B).sites[0]!.parts[0]!;
    const notes = part.marks.filter(m => m.kind === "note");
    if (notes.length > 1) assert.ok(!notes.some(n => n.kind === "note" && line.startsWith(n.text)), `${rule.family.id}: "${line}"`);
  }
});

test("expanded face: the views the rule reads side by side, a short worked computation, the noun grid", () => {
  for (const rule of rules) {
    const html = renderToStaticMarkup(<ExpandedFace rule={rule} state={B} rarities={raritiesFor(rule)} />);
    const panels = new Set([...rule.family.depends, rule.family.main.rep]);
    assert.equal((html.match(/class="v2v-panel"/g) ?? []).length, panels.size, rule.family.id);
    assert.match(html, /aria-label="Ways to see this grid"/);
    assert.equal((html.match(/role="tab"/g) ?? []).length, gridType.representations.length);
    const t = text(html);
    assert.match(t, /rarer among random grids/);
    assert.doesNotMatch(t, /(?<!fold )\bline\b/, rule.family.id);   // "the fold line" is Crosswise Threes' word, not the object's noun
    // The working: a rule that reads every cell gets the board in one line, not sixteen lines of cells.
    const reads = annotate(rule, B).sites[0]!.evaluation.reads;
    if (reads.filter(r => r.rep === "cells").length >= 9) {
      assert.match(t, new RegExp(`the board: ${repText(gridType, B, "cells").replace(/\//g, "\\/")}`), rule.family.id);
      assert.doesNotMatch(t, /row 1, column 1 = 3/, rule.family.id);
    }
  }
});

test("goal card: every grid family's card renders on a worked example", () => {
  for (const rule of rules) {
    const t = text(renderToStaticMarkup(<GoalCard rule={rule} example={B} />));
    assert.ok(t.includes(rule.family.title), rule.family.id);
    assert.match(t, /Steps to the top/);
    assert.doesNotMatch(t, /(?<!fold )\bline\b/, rule.family.id);   // "the fold line" is Crosswise Threes' word, not the object's noun
  }
});

test("move line: the cells that changed, the move in words, the step and rarity with the noun grid", () => {
  const rule = rules[0]!;
  const after = board("7113", "0480", "2222", "9003");
  const m = gridType.mutators.find(x => x.id === "cells.add")!;
  const what = m.describe(m.args(grid4).decode({ cell: "r0c0", k: "4" }));
  const t = text(renderToStaticMarkup(<MoveLine rule={rule} before={B} after={after} who="Your agent Row-1" what={what} rarities={raritiesFor(rule)}
    points={{ before: 2, after: 5, want: 1.5 }} />));
  assert.match(t, /Your agent Row-1 changed a grid: row 1, column 1: 3 → 7 \(\+4 in row 1, column 1\)\. (Up|Down|Still)/);
  assert.match(t, /Points on this grid 2\.00 → 5\.00/);
  assert.doesNotMatch(t, /\bline\b/);
  const many = text(renderToStaticMarkup(<MoveLine rule={rule} before={B} after={board("1331", "0480", "2222", "9003")} who="Ada's agent" />));
  assert.match(many, /changed a grid: row 1, column 1: 3 → 1; row 1, column 2: 1 → 3; and 2 more ?\./);
});
