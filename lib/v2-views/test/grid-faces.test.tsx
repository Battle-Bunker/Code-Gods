/** @jsxRuntime automatic */
/**
 * The faces, the goal card and the move line for a grid under every grid rule family (read at run time, so a revised
 * pool is covered as it stands): the rule's own views, its marks, a short working and the noun "grid".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { rng, walkStep, type Score } from "@workspace/v2-core";
import { grid4, gridType, type GridState } from "@workspace/v2-grid";
import { annotate, CompactFace, ExpandedFace, GoalCard, mainLine, MoveLine, repText, type RuleRef } from "../src/index.ts";
import { key as refNodeKey } from "../src/render/common.tsx";

const board = (...rows: string[]): GridState => ({ cells: rows.flatMap(r => [...r].map(Number)) });
const B = board("3113", "0480", "2222", "9003");
const rules: RuleRef<GridState, unknown>[] = gridType.families.map(f => ({ type: gridType, family: f, params: f.dealable(grid4)[0], variant: grid4 }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
/** A stand-in value function (the real one is the rule's calibrated record): bits grow with the main utility. */
const VALUE = (u: Score) => (u === null ? 0 : 2 + Math.atan(Number(u[0]!.n) / Number(u[0]!.d)));

test("compact face: each rule's main view with its focus marks, the main part in a line, the bits, no word 'line'", () => {
  for (const rule of rules) {
    const html = renderToStaticMarkup(<CompactFace rule={rule} state={B} value={VALUE} next />);
    assert.match(html, new RegExp(`data-rep="${rule.family.main.rep}"`), rule.family.id);
    // The marks shown: an undealt secondary's marks are recorded but not drawn.
    const shown = annotate(rule, B).sites[0]!.marks;
    for (const m of shown) if (m.kind === "focus" && m.ref.rep === rule.family.main.rep) assert.match(html, new RegExp(`data-ref="${refNodeKey(m.ref).replace(/[.()]/g, "\\$&")}"[^>]*data-focus=""`), rule.family.id);
    const t = text(html);
    assert.match(t, /bits \(1 in|not scoring/, rule.family.id);
    assert.doesNotMatch(t, /\bstep \d/, rule.family.id);
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
    const html = renderToStaticMarkup(<ExpandedFace rule={rule} state={B} value={VALUE} />);
    const panels = new Set([...rule.family.depends, rule.family.main.rep]);
    assert.equal((html.match(/class="v2v-panel"/g) ?? []).length, panels.size, rule.family.id);
    assert.match(html, /aria-label="Ways to see this grid"/);
    assert.equal((html.match(/role="tab"/g) ?? []).length, panels.size);
    const t = text(html);
    if (annotate(rule, B).score !== null) assert.match(t, /random grids are at least this good/, rule.family.id);
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
    assert.match(t, /A worked example/);
    assert.doesNotMatch(t, /Steps to the top|\bstep \d/);
    assert.doesNotMatch(t, /(?<!fold )\bline\b/, rule.family.id);   // "the fold line" is Crosswise Threes' word, not the object's noun
  }
});

test("move line: the cells that changed, the move in words, the rarity with the noun grid", () => {
  const rule = rules[0]!;
  const after = board("7113", "0480", "2222", "9003");
  const m = gridType.mutators.find(x => x.id === "cells.add")!;
  const what = m.describe(m.args(grid4).decode({ cell: "r0c0", k: "4" }));
  const t = text(renderToStaticMarkup(<MoveLine rule={rule} before={B} after={after} who="Your agent Row-1" what={what} value={VALUE}
    points={{ before: 2, after: 5, want: 1.5 }} />));
  assert.match(t, /Your agent Row-1 changed a grid: row 1, column 1: 3 → 7 \(\+4 in row 1, column 1\)\./);
  assert.doesNotMatch(t, /\bstep \d/);
  assert.match(t, /Points on this grid 2\.00 → 5\.00/);
  assert.doesNotMatch(t, /\bline\b/);
  const many = text(renderToStaticMarkup(<MoveLine rule={rule} before={B} after={board("1331", "0480", "2222", "9003")} who="Ada's agent" />));
  assert.match(many, /changed a grid: row 1, column 1: 3 → 1; row 1, column 2: 1 → 3; and 2 more ?\./);
});

test("playtest round 4: a plural noun is one word; a compact face draws nothing over its board", () => {
  const g = rng("playtest-4");
  const boards: GridState[] = [B];
  for (let i = 0; i < 30; i++) boards.push(walkStep(gridType, grid4, boards[boards.length - 1]!, g));
  for (const base of rules) for (const board of boards.slice(0, 3)) {
    const rule = { ...base, tieBreaker: base.family.tieBreakers[0]?.id };
    const html = renderToStaticMarkup(<ExpandedFace rule={rule} state={board} value={VALUE} />) + renderToStaticMarkup(<GoalCard rule={rule} example={board} />);
    assert.doesNotMatch(html, /grid<!-- -->s/, `${rule.family.id}: "grid" and "s" render as separate text`);
    // The part lines under the face say the quantity; an overlay caption on the board covered cells on a phone.
    for (const b of boards) assert.doesNotMatch(renderToStaticMarkup(<CompactFace rule={rule} state={b} value={VALUE} />), /v2v-overlay/, rule.family.id);
  }
});

test("grid contributors: each part says what every unit contributes, sits on a ruler from 0, and a move names the part's change", async () => {
  const { contributors } = await import("../src/contributors.ts");
  const { moves } = await import("../src/moves.ts");
  const B2: GridState = { cells: [3, 2, 0, 8, 3, 2, 3, 3, 2, 1, 0, 9, 1, 0, 1, 2] };
  const magic = { ...rules.find(r => r.family.id === "magic-eighteen")!, tieBreaker: undefined };
  const main = contributors(magic, B2).parts[0]!;
  // The chain: the rows read, each one's own amount (the board's notes), then the part's sum.
  assert.deepEqual(main.units.map(u => u.text), ["5 short", "7 short", "6 short", "14 short"], main.units.map(u => `${u.label} ${u.text}`).join(", "));
  assert.ok(main.units.every(u => /^row \d$/.test(u.label)), main.units.map(u => u.label).join(", "));
  assert.equal(main.distance, "off by 32");
  // A unit already at its target is listed too, said as such (the rule marks it with focus, not a note).
  const two = { ...rules.find(r => r.family.id === "two-pair")!, tieBreaker: undefined };
  const boxes = contributors(two, B2).parts[0]!.units;
  assert.equal(boxes.length, 4, boxes.map(u => `${u.label}: ${u.text}`).join(" · "));
  assert.ok(boxes.some(u => u.text === "on target"), boxes.map(u => `${u.label}: ${u.text}`).join(" · "));
  // A sum of distances sits on a ruler whose strong mark is 0: perfect.
  assert.ok(main.ruler, "an off-by part has a ruler");
  assert.equal(main.ruler!.value, 32);
  assert.deepEqual(main.ruler!.refs.filter(r => r.strong).map(r => r.at), [0]);
  // Every family's parts never throw and never say NaN on a walk of boards.
  for (const r of rules) for (const p of contributors({ ...r, tieBreaker: r.family.tieBreakers[0]?.id }, B2).parts)
    assert.doesNotMatch(`${p.sentence} ${p.units.map(u => u.text).join(" ")}`, /NaN|undefined/, r.family.id);
  // A move says what it did to the part's own quantity, not to one row of it.
  const ms = moves(magic, B2, null, { k: 3 });
  assert.ok(ms.length > 0);
  for (const m of ms) assert.ok(m.changes.some(c => /off by 32 → /.test(c)) || m.changes.length > 0, `${m.words}: ${m.changes.join(" · ")}`);
  assert.ok(ms.some(m => m.changes.some(c => /off by 32 → \d+/.test(c))), ms.map(m => m.changes.join(" · ")).join(" | "));
});

test("grid expanded face: the parts' units listed under each part, its ruler drawn", () => {
  const magic = { ...rules.find(r => r.family.id === "magic-eighteen")!, tieBreaker: undefined };
  const t = text(renderToStaticMarkup(<ExpandedFace rule={magic} state={{ cells: [3, 2, 0, 8, 3, 2, 3, 3, 2, 1, 0, 9, 1, 0, 1, 2] }} value={VALUE} />));
  assert.match(t, /row 1: 5 short · row 2: 7 short · row 3: 6 short · row 4: 14 short/);
  assert.match(t, /What would make it rarer/);
  assert.doesNotMatch(t, /→ \d \d \d \d \/ /, "a move does not repeat the whole board after its words");
  assert.match(renderToStaticMarkup(<ExpandedFace rule={magic} state={B} value={VALUE} />), /class="v2v-ruler" data-role="main"/);
});

test("a bounded count's ruler ends where the count can end (Layer.most; playtest baseline-2 #5: 0–17 for a count of 4)", async () => {
  const { contributors } = await import("../src/contributors.ts");
  const fam = gridType.families.find(f => f.id === "two-pair")!;
  const capped = { ...fam, tieBreakers: fam.tieBreakers.map(t => (t.id === "diagonal-pairs" ? { ...t, most: () => 4 } : t)) };
  const rule = { type: gridType, family: capped, params: capped.dealable(grid4)[0], variant: grid4, tieBreaker: "diagonal-pairs" } as RuleRef<GridState, unknown>;
  const part = contributors(rule, B).parts[1]!;
  assert.ok(part.ruler, "the count has a ruler");
  assert.ok(Math.max(...part.ruler!.refs.map(r => r.at)) <= 4, JSON.stringify(part.ruler!.refs.map(r => r.at)));
});
