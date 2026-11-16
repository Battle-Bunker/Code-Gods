/** @jsxRuntime automatic */
/**
 * Grid annotations at v1 parity (docs/engine-v2/v1-audit.md §6): a mark names the layer it belongs to, a dealt
 * secondary shows its own marks, an undealt layer's marks are shown to nobody, and a grid representation draws the
 * marks a rule puts on the board's cells.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { q, ref, type RuleFamily } from "@workspace/v2-core";
import { grid4, gridType, type GridState } from "@workspace/v2-grid";
import { annotate, RepView, type RuleRef } from "../src/index.ts";

const board = (...rows: string[]): GridState => ({ cells: rows.flatMap(r => [...r].map(Number)) });
const B = board("3113", "0480", "2222", "9003");

/** A made-up family: a main layer on the mirror view, two secondaries on the cells, each marking what it reads. */
const probe: RuleFamily<GridState, Record<string, never>> = {
  id: "probe", title: "Probe", card: () => "", params: [], dealable: () => [{}], depends: ["mirror", "cells"],
  main: { id: "mirror", title: "mirror", sentence: () => "", rep: "mirror", sense: "min" },
  tieBreakers: [
    { id: "corner", title: "the top-left corner", sentence: () => "", rep: "cells", sense: "max" },
    { id: "last", title: "the bottom-right corner", sentence: () => "", rep: "cells", sense: "max" },
  ],
  evaluate(ctx) {
    const g = ref("mirror", "gap0");
    ctx.term("mirror", "gap", (ctx.read(g) as { q: ReturnType<typeof q> }).q, [g]);
    ctx.mark({ kind: "note", ref: g, text: "main note" });
    const a = ref("cells", "r0c0"), z = ref("cells", "r3c3");
    ctx.term("corner", "corner", (ctx.read(a) as { q: ReturnType<typeof q> }).q, [a]);
    ctx.mark({ kind: "focus", ref: a, term: "corner" });
    ctx.term("last", "last", (ctx.read(z) as { q: ReturnType<typeof q> }).q, [z]);
    ctx.mark({ kind: "note", ref: z, text: "last note", term: "last" });
  },
};
const rule = (tieBreaker: string | null): RuleRef<GridState, Record<string, never>> =>
  ({ type: gridType, family: probe, params: {}, variant: grid4, tieBreaker });

test("a focus or note mark labelled with a dealt secondary's term belongs to that secondary; unlabelled ones to the main part", () => {
  const [main, corner] = annotate(rule("corner"), B).sites[0]!.parts;
  assert.deepEqual(main!.marks.map(m => m.kind), ["note"]);
  assert.deepEqual(corner!.marks.map(m => [m.kind, "ref" in m ? m.ref.name : ""]), [["focus", "r0c0"]]);
});

test("an undealt layer's marks are shown to nobody", () => {
  const parts = annotate(rule("corner"), B).sites[0]!.parts;
  const all = parts.flatMap(p => p.marks);
  assert.ok(!all.some(m => m.kind === "note" && m.text === "last note"), "the undealt 'last' layer's note is not shown");
  const alone = annotate(rule(null), B).sites[0]!.parts;
  assert.equal(alone.length, 1);
  assert.deepEqual(alone[0]!.marks.map(m => m.kind), ["note"], "the main layer alone: no secondary's marks");
});

test("a grid representation draws the marks a rule puts on the board's cells", () => {
  const e = annotate(rule("corner"), B).sites[0]!.evaluation;
  const html = renderToStaticMarkup(<RepView type={gridType} state={B} rep="mirror" size="expanded" marks={e.marks} terms={e.terms} />);
  assert.match(html, /data-ref="cells\.r0c0"[^>]*data-focus=""/, "the focused cell is marked in the mirror view");
});

test("a note on a cell is said under the board, not repeated under every other view of it", () => {
  const e = annotate(rule("last"), B).sites[0]!.evaluation;
  const at = (rep: string) => renderToStaticMarkup(<RepView type={gridType} state={B} rep={rep} size="expanded" marks={e.marks} terms={e.terms} />);
  assert.match(at("cells"), /last note/);
  assert.doesNotMatch(at("mirror"), /last note/);
});

test("a focused cell carries its part's glyph (● main part, ◆ secondary), so a mark never relies on colour alone", () => {
  const a = annotate(rule("corner"), B);
  const sa = a.sites[0]!;
  const html = renderToStaticMarkup(<RepView type={gridType} state={B} rep="cells" size="expanded" marks={sa.marks} terms={sa.evaluation.terms} parts={sa.parts} />);
  assert.match(html, /data-ref="cells\.r0c0"[^]*?class="mark-glyph"[^>]*>◆</, "the secondary's focus on row 1, column 1 has ◆");
});

test("a third preference's marks carry ▲: glyphs follow the part's depth", () => {
  const sa = annotate(rule("corner>last"), B).sites[0]!;
  assert.equal(sa.parts.length, 3);
  const html = renderToStaticMarkup(<RepView type={gridType} state={B} rep="cells" size="expanded" marks={sa.marks} terms={sa.evaluation.terms} parts={sa.parts} />);
  assert.match(html, /▲ last note/);
});

test("every marked element is a keyboard stop, and each note under the board names the element it is about", () => {
  const sa = annotate(rule("last"), B).sites[0]!;
  const html = renderToStaticMarkup(<RepView type={gridType} state={B} rep="cells" size="expanded" marks={sa.marks} terms={sa.evaluation.terms} parts={sa.parts} onHover={() => {}} />);
  assert.match(html, /<g class="cell" data-ref="cells\.r3c3"[^>]*tabindex="0"/, "the noted cell can be reached with Tab");
  assert.doesNotMatch(html, /<g class="cell" data-ref="cells\.r1c1"[^>]*tabindex/, "an unmarked cell is not a stop");
  assert.match(html, /<li[^>]*data-ref="cells\.r3c3"[^>]*>[^<]*row 4, column 4/, "the note's line points at its cell");
});

test("while an element is picked out, the cells outside it are dimmed", () => {
  const sa = annotate(rule("corner"), B).sites[0]!;
  const html = renderToStaticMarkup(<RepView type={gridType} state={B} rep="mirror" size="expanded" marks={sa.marks} terms={sa.evaluation.terms} highlight="mirrorGap:0" />);
  assert.match(html, /<svg class="v2v-grid"[^>]*data-picked=""/);
});

test("a secondary's notes on many units stay on the board: its card says its value in a sentence, not every note", () => {
  const fam = gridType.families.find(f => f.id === "mirrormancer")!;
  const r: RuleRef<GridState, unknown> = { type: gridType, family: fam, params: {}, variant: grid4, tieBreaker: "one-apart" };
  const s = board("2000", "0000", "1100", "0201");
  const part = annotate(r, s).sites[0]!.parts[1]!;
  assert.doesNotMatch(part.sentence, /should be 1\).*should be 1\)/, part.sentence);
  assert.ok(part.sentence.length < 200, part.sentence);
});

test("a bounded count's ruler ends where the count can end: Two Pair's boxes with diagonal pairs run to 4 (playtest baseline-2 #5)", () => {
  const fam = gridType.families.find(f => f.id === "two-pair")!;
  const r: RuleRef<GridState, unknown> = { type: gridType, family: fam, params: {}, variant: grid4, tieBreaker: "diagonal-pairs" };
  const part = annotate(r, board("7031", "7021", "3313", "3213")).sites[0]!.parts[1]!;
  assert.ok(part.ruler, "a ruler");
  assert.equal(Math.max(...part.ruler!.refs.map(x => x.at)), 4, part.ruler!.refs.map(x => x.at).join(","));
});

test("a view whose groups carry numbers says what those numbers are (the circled box totals)", () => {
  const html = renderToStaticMarkup(<RepView type={gridType} state={B} rep="boxes" size="expanded" />);
  assert.match(html, /class="v2v-legend"[^>]*>[^<]*box totals/);
});

test("a part lists only its own units: another layer's notes on the same cells are not its", () => {
  const fam = gridType.families.find(f => f.id === "magic-eighteen")!;
  const r: RuleRef<GridState, unknown> = { type: gridType, family: fam, params: { axis: "rows", T: 18 }, variant: grid4, tieBreaker: "first-line" };
  const part = annotate(r, board("3208", "3233", "2109", "1012")).sites[0]!.parts[1]!;
  assert.ok(!part.units.some(u => /repeats|diagonal/.test(u.text)), part.units.map(u => u.text).join(" · "));
});

test("arrow keys step through the marked units in reading order (v1's one keyboard stop), Home and End to the ends", async () => {
  const { stepStop } = await import("../src/render/grid.tsx");
  assert.equal(stepStop("ArrowRight", 0, 5), 1);
  assert.equal(stepStop("ArrowDown", 4, 5), 4, "stays at the last");
  assert.equal(stepStop("ArrowLeft", 0, 5), 0, "stays at the first");
  assert.equal(stepStop("ArrowUp", 3, 5), 2);
  assert.equal(stepStop("Home", 3, 5), 0);
  assert.equal(stepStop("End", 1, 5), 4);
  assert.equal(stepStop("a", 1, 5), null, "other keys are left alone");
});

test("a unit of up to four cells is listed with its cells as small tiles (v1's unit list), so a player sees its numbers beside its words", () => {
  const fam = gridType.families.find(f => f.id === "two-pair")!;
  const r: RuleRef<GridState, unknown> = { type: gridType, family: fam, params: {}, variant: grid4, tieBreaker: "apart" };
  const sa = annotate(r, board("7031", "7021", "3313", "3213")).sites[0]!;
  const html = renderToStaticMarkup(<RepView type={gridType} state={board("7031", "7021", "3313", "3213")} rep="boxes" size="expanded" marks={sa.marks} terms={sa.evaluation.terms} parts={sa.parts} />);
  assert.match(html, /<li[^>]*data-ref="boxes\.pairs0"[^>]*><span class="v2v-tiles"[^>]*>(<span class="v2v-tile">\d<\/span>){4}<\/span>/);
});

test("picking out a unit that is not drawn on the board (how far a box is from two pairs) lights its cells", () => {
  const html = renderToStaticMarkup(<RepView type={gridType} state={B} rep="boxes" size="expanded" highlight="@boxes.pairs0" />);
  assert.match(html, /data-ref="cells\.r0c0"[^>]*data-member=""/);
  assert.doesNotMatch(html, /data-ref="cells\.r3c3"[^>]*data-member=""/);
});

test("the fold and leap views say what their pair numbers are (a signed difference), and the notes say what each pair should be", () => {
  for (const [rep, words] of [["fold", /minus the cell it folds onto/], ["leaps", /minus/]] as const) {
    const html = renderToStaticMarkup(<RepView type={gridType} state={B} rep={rep} size="expanded" />);
    assert.match(html, new RegExp(`class="v2v-legend"[^>]*>[^<]*${words.source}`), rep);
  }
  const fam = gridType.families.find(f => f.id === "crosswise-threes")!;
  const notes = annotate({ type: gridType, family: fam, params: {}, variant: grid4, tieBreaker: "bigger-side" }, B).sites[0]!.marks
    .flatMap(m => (m.kind === "note" && m.term === undefined ? [m.text] : []));
  assert.ok(notes.length > 0 && notes.every(t => /^\d+ apart, not 3$/.test(t)), notes.join(" | "));
});
