/**
 * The annotation helpers (src/annotations.ts): merging, the legend, the per-cell and per-character marks the renderers
 * draw, region outlines, and the quiet cues: tone as the cue's shape (never a glyph or a hue), weight as its thickness
 * and opacity, each growing with the weight.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  TONE_DECORATION, annotationBadges, annotationLegend, cellWeightMap, cueColour, cueOpacity, legendText, mergeAnnotations, regionEdges,
  textSegments, underlinePx, type Annotation,
} from "../src/annotations.ts";

const good: Annotation = { kind: "cells", tone: "good", label: "safe red", cells: [{ r: 0, c: 0 }, { r: 1, c: 1, weight: 0.5 }] };
const bad: Annotation = { kind: "cells", tone: "bad", label: "touching", cells: [{ r: 1, c: 1, weight: 0.8 }, { r: 2, c: 2, weight: 0.2 }] };
const badge: Annotation = { kind: "badge", tone: "neutral", text: "1 safe red · 3 safe blue" };

test("mergeAnnotations concatenates, skips missing lists and empty marks, and keeps one copy of a repeated badge", () => {
  const empty: Annotation = { kind: "cells", tone: "good", cells: [] };
  assert.deepEqual(mergeAnnotations([good], undefined, [empty, badge], null, [badge, bad]), [good, badge, bad]);
  assert.deepEqual(mergeAnnotations(), []);
});

test("annotationLegend lists each label once with its tone, in first-seen order; badges are not legend entries", () => {
  const again: Annotation = { kind: "region", tone: "good", label: "safe red", cells: [{ r: 0, c: 1 }] };
  const unlabelled: Annotation = { kind: "cells", tone: "neutral", cells: [{ r: 0, c: 2 }] };
  assert.deepEqual(annotationLegend([good, badge, bad, again, unlabelled]), [{ label: "safe red", tone: "good" }, { label: "touching", tone: "bad" }]);
  assert.equal(legendText(annotationLegend([good, bad])), "solid underline: safe red · dotted underline: touching");
  assert.doesNotMatch(legendText([{ label: "a", tone: "good" }, { label: "b", tone: "bad" }, { label: "c", tone: "neutral" }]), /[✓✗•]/u, "no glyphs");
  assert.equal(legendText([]), "");
  assert.deepEqual(annotationBadges([good, badge, bad]), [badge]);
});

test("cellWeightMap: one mark per cell, the heavier mark wins, weights default to 1 and are clamped, off-board cells are ignored", () => {
  const off: Annotation = { kind: "cells", tone: "neutral", cells: [{ r: 3, c: 0 }, { r: -1, c: 1 }, { r: 0, c: 1, weight: 7 }] };
  const map = cellWeightMap([good, bad, off, badge], 3);
  assert.deepEqual(map, [
    [{ tone: "good", weight: 1, label: "safe red" }, { tone: "neutral", weight: 1 }, null],
    [null, { tone: "bad", weight: 0.8, label: "touching" }, null],
    [null, null, { tone: "bad", weight: 0.2, label: "touching" }],
  ]);
  // Regions are outlines, not per-cell marks.
  assert.deepEqual(cellWeightMap([{ kind: "region", tone: "good", cells: [{ r: 0, c: 0 }] }], 2), [[null, null], [null, null]]);
});

test("regionEdges draws a region's outer border only: the sides of member cells that face a non-member", () => {
  // An L of three cells: (0,0), (1,0), (1,1).
  const edges = regionEdges([{ kind: "region", tone: "good", cells: [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 1, c: 1 }] }], 2);
  assert.deepEqual(edges[0][0], { tone: "good", top: true, right: true, bottom: false, left: true });
  assert.deepEqual(edges[1][0], { tone: "good", top: false, right: false, bottom: true, left: true });
  assert.deepEqual(edges[1][1], { tone: "good", top: true, right: true, bottom: true, left: false });
  assert.equal(edges[0][1], null);
});

test("tone sets the cue's shape: good, bad and neutral differ without hue", () => {
  assert.deepEqual(TONE_DECORATION, { good: "solid", bad: "dotted", neutral: "dashed" });
  assert.equal(new Set(Object.values(TONE_DECORATION)).size, 3);
});

test("weight sets the cue's thickness and opacity, each growing with the weight", () => {
  assert.equal(cueOpacity(0), 0);
  assert.ok(cueOpacity(0.1) >= 0.3, "a light mark is still visible");
  assert.ok(cueOpacity(0.2) < cueOpacity(0.6) && cueOpacity(0.6) < cueOpacity(1));
  assert.ok(cueOpacity(1) <= 0.75, "a strong mark stays quiet beside the coloured digit");
  assert.equal(cueOpacity(5), cueOpacity(1), "clamped");
  assert.deepEqual([0.1, 0.5, 1].map(underlinePx), [1, 1.5, 2]);
});

test("a cue is drawn in the page's ink (the theme's foreground, with a fallback), not a tone hue", () => {
  assert.equal(cueColour(1), "hsl(var(--foreground, 232 38% 14%) / 0.7)");
  assert.doesNotMatch(cueColour(0.5), /accent|destructive/);
});

test("textSegments: string spans index characters, not the JSON-quoted display; Int digits count from the left, past the sign", () => {
  const spans: Annotation = { kind: "spans", tone: "good", label: "a", spans: [{ start: 1, end: 3, weight: 0.5 }] };
  const segs = textSegments('x"ab', [spans]);
  assert.deepEqual(segs.map(s => s.text), ['"x', '\\"', "a", 'b"']);
  assert.deepEqual(segs.map(s => s.mark?.weight ?? null), [null, 0.5, 0.5, null]);
  const digits: Annotation = { kind: "digits", tone: "good", label: "7s", positions: [1, 3] };
  const int = textSegments(-1707, [digits]);
  assert.deepEqual(int.map(s => [s.text, s.mark?.tone ?? null]), [["-1", null], ["7", "good"], ["0", null], ["7", "good"]]);
  const weighted: Annotation = { kind: "digits", tone: "bad", positions: [0], weights: [0.25] };
  assert.equal(textSegments(42, [weighted])[0].mark?.weight, 0.25);
  // Spans do not apply to numbers, digits do not apply to strings.
  assert.deepEqual(textSegments(17, [spans]), [{ text: "17", mark: null }]);
  assert.deepEqual(textSegments("17", [digits]), [{ text: '"17"', mark: null }]);
});
