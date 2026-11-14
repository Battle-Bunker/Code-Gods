/** @jsxRuntime automatic */
/**
 * The grid scene as static markup (spec §11.3). Over every representation and every family of the grid type (read at
 * run time, so a revised pool is covered as it stands) and a corpus of boards, every mark's element produces a node in
 * the expanded view and focus survives the compact view. The drawing itself is checked on synthetic scenes: margins,
 * links, steps between neighbours, outlined groups (any set of cells, overlapping or not), and a board of numbers only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { q, ref, rng, walkStep, type ElementRef, type ElementValue, type GridScene, type Mark } from "@workspace/v2-core";
import { grid4, gridType, type GridState } from "@workspace/v2-grid";
import { annotate, defaultRep, markRefs, ObjectChip, RepView, rendererFor, repText, type RuleRef } from "../src/index.ts";
import { key as refNodeKey } from "../src/render/common.tsx";

const board = (...rows: string[]): GridState => ({ cells: rows.flatMap(r => [...r].map(Number)) });
const B = board("3113", "0480", "2222", "9003");
const nodes = (html: string) => new Set([...html.matchAll(/data-ref="([^"]+)"/g)].map(m => m[1]!));
const ruleOf = (f: (typeof gridType.families)[number]): RuleRef<GridState, unknown> => ({ type: gridType, family: f, params: f.dealable(grid4)[0], variant: grid4 });

function corpus(): GridState[] {
  const fixed = [B, gridType.origin(grid4), board("3333", "3333", "3333", "3333"), board("1357", "7531", "2468", "9999"), board("1221", "3443", "5005", "7227")];
  const g = rng("grid-render-corpus");
  let s = gridType.origin(grid4);
  const walked: GridState[] = [];
  for (let i = 0; i < 300; i++) { s = walkStep(gridType, grid4, s, g); if (i % 10 === 9) walked.push(s); }
  return [...fixed, ...walked];
}

test("every mark of every grid family produces a node in every representation; focus survives the compact view", () => {
  let checked = 0;
  for (const s of corpus()) {
    for (const f of gridType.families) {
      const e = annotate(ruleOf(f), s).sites[0]!.evaluation;
      for (const rep of gridType.representations) {
        for (const size of ["compact", "expanded"] as const) {
          const html = renderToStaticMarkup(<RepView type={gridType} state={s} rep={rep.id} size={size} marks={e.marks} terms={e.terms} />);
          assert.match(html, /<svg[^>]*class="v2v-grid"/, `${rep.id}: drawn by the grid renderer`);
          const have = nodes(html);
          for (const m of e.marks) {
            if (!markRefs(m).every(r => r.rep === rep.id)) continue;
            if (size === "compact" && m.kind !== "focus") continue;
            for (const r of markRefs(m)) {
              assert.ok(have.has(refNodeKey(r)), `${f.id} ${rep.id} ${size}: no node for ${refNodeKey(r)} (${m.kind}) on ${gridType.encode(s)}`);
              checked++;
            }
          }
        }
      }
    }
  }
  assert.ok(checked > 1000, `checked ${checked}`);
});

test("every representation draws every cell with its digit and every element of its layout, numbers only, no colour per value", () => {
  for (const rep of gridType.representations) {
    const html = renderToStaticMarkup(<RepView type={gridType} state={B} rep={rep.id} size="expanded" />);
    const scene = rep.layout(B, 0) as GridScene;
    const have = nodes(html);
    for (const r of [...scene.cells, ...(scene.right ?? []), ...(scene.bottom ?? []), ...(scene.groups ?? []).map(g => g.el)]) {
      assert.ok(have.has(refNodeKey(r)), `${rep.id}: no node for ${refNodeKey(r)}`);
    }
    assert.doesNotMatch(html, /fill="#|stroke="#|style="[^"]*(fill|color|background)/, `${rep.id}: a colour written into the drawing`);
    assert.match(html, /data-ref="cells\.r1c1"[^>]*>(<[^>]+>)*4</, `${rep.id}: the digit 4 at row 2, column 2`);
  }
  assert.match(renderToStaticMarkup(<RepView type={gridType} state={B} rep={defaultRep(gridType)} size="expanded" />), /role="img"[^>]*aria-label="3 1 1 3 \/ 0 4 8 0 \/ 2 2 2 2 \/ 9 0 0 3"/);
});

// ---------------------------------------------------------------- the drawing, on synthetic scenes

const N = 4;
const cell = (i: number) => ref("t", `c${i}`);
const DIGITS = [3, 1, 1, 3, 0, 4, 8, 0, 2, 2, 2, 2, 9, 0, 0, 3];
function drawScene(extra: Partial<GridScene>, opts: { marks?: Mark[]; size?: "compact" | "expanded"; highlight?: string; vals?: Record<string, number> } = {}) {
  const scene: GridScene = { kind: "grid", rows: N, cols: N, cells: DIGITS.map((_, i) => cell(i)), ...extra };
  const values = (r: ElementRef): ElementValue => {
    const m = /^c(\d+)$/.exec(r.name);
    if (m) return { kind: "number", q: q(DIGITS[Number(m[1])]!) };
    const v = opts.vals?.[r.name];
    return v === undefined ? { kind: "undefined", reason: "unknown" } : { kind: "number", q: q(v) };
  };
  const renderer = rendererFor("grid")!;
  return renderToStaticMarkup(renderer.render({
    rep: "t", scene, values, size: opts.size ?? "expanded", marks: opts.marks ?? [], terms: new Map(), highlight: opts.highlight ?? null,
    meaningOf: r => `m:${r.name}`, labelOf: r => `label of ${r.name}`,
  }));
}
const rowTot = (r: number) => ref("t", `row${r}`), colTot = (c: number) => ref("t", `col${c}`);
const TOTALS = { row0: 8, row1: 12, row2: 8, row3: 12, col0: 14, col1: 7, col2: 11, col3: 8 };

test("margins: a value beside each row and under each column, the margin's word over it, a short note beside a row's value", () => {
  const html = drawScene({ right: [0, 1, 2, 3].map(rowTot), bottom: [0, 1, 2, 3].map(colTot), rightTitle: "total", bottomTitle: "total" },
    { vals: TOTALS, marks: [{ kind: "note", ref: rowTot(0), text: "4 short" }, { kind: "focus", ref: rowTot(1) }, { kind: "note", ref: colTot(1), text: "5 short" }] });
  assert.match(html, /data-ref="t\.row0"[^>]*>(<[^>]+>)*8</);
  assert.match(html, /data-ref="t\.col0"[^>]*>(<[^>]+>)*14</);
  assert.match(html, />total</);
  assert.match(html, /class="note"[^>]*>4 short</);
  assert.match(html, /data-ref="t\.row1"[^>]*data-focus=""/);
  // A note with no room beside its element is listed under the picture, with the element's words.
  assert.match(html, /<li>label of col1: 5 short<\/li>/);
});

test("groups: two cells apart are linked, two neighbours get a step label on their shared edge, larger groups are outlined", () => {
  const link = drawScene({ groups: [{ cells: [0, 15], el: ref("t", "p0") }, { cells: [5, 10], el: ref("t", "p1") }] }, { vals: { p0: 6, p1: 6 } });
  assert.equal((link.match(/class="link"/g) ?? []).length, 2);
  assert.match(link, /data-ref="t\.p0"[^>]*>(<[^>]+>)*6</);
  const step = drawScene({ groups: [{ cells: [5, 6], el: ref("t", "s") }, { cells: [6, 10], el: ref("t", "d") }] }, { vals: { s: 4, d: -6 } });
  assert.equal((step.match(/class="step"/g) ?? []).length, 2);
  assert.match(step, /data-ref="t\.s"[^>]*>(<[^>]+>)*\+4</);
  assert.match(step, /data-ref="t\.d"[^>]*>(<[^>]+>)*−6</);
  const box = drawScene({ groups: [{ cells: [0, 1, 4, 5], el: ref("t", "b0") }, { cells: [2, 3, 6, 7], el: ref("t", "b1") }] }, { vals: { b0: 8, b1: 12 } });
  assert.equal((box.match(/class="box"/g) ?? []).length, 2);
  assert.match(box, /data-ref="t\.b0"[^>]*>(<[^>]+>)*8</);
  assert.match(box, /<rect class="box-line"/);
  // Steps sharing cells with each other do not make boxes that do not overlap count as overlapping.
  const mixed = drawScene({ groups: [{ cells: [0, 1], el: ref("t", "s0") }, { cells: [1, 2], el: ref("t", "s1") }, { cells: [10, 11, 14, 15], el: ref("t", "b") }] }, { vals: { s0: 1, s1: 2, b: 7 } });
  assert.match(mixed, /<rect class="box-line"/);
});

test("overlapping groups (nine 2×2 windows) and a group of any cells each get a node and a label of their own", () => {
  const windows = Array.from({ length: 9 }, (_, k) => {
    const r = Math.floor(k / 3), c = k % 3, i = r * N + c;
    return { cells: [i, i + 1, i + N, i + N + 1], el: ref("t", `w${k}`) };
  });
  const vals = Object.fromEntries(windows.map((w, k) => [`w${k}`, w.cells.reduce((t, i) => t + DIGITS[i]!, 0)]));
  const html = drawScene({ groups: windows }, { vals, marks: [{ kind: "focus", ref: ref("t", "w4") }] });
  for (let k = 0; k < 9; k++) assert.ok(nodes(html).has(`t.w${k}`), `window ${k}`);
  const labels = [...html.matchAll(/class="group-label"[^>]*x="([\d.]+)"[^>]*y="([\d.]+)"/g)].map(m => `${m[1]},${m[2]}`);
  assert.equal(new Set(labels).size, 9, "nine labels at nine places");
  // Overlapping outlines are drawn only for a group a mark or a pointer picks out.
  assert.equal((html.match(/<rect class="box-line"/g) ?? []).length, 1);
  const odd = drawScene({ groups: [{ cells: [0, 5, 10, 15], el: ref("t", "diag") }] }, { vals: { diag: 15 } });
  assert.match(odd, /data-ref="t\.diag"[^>]*>(<[^>]+>)*15</);
});

test("cross-highlight: the element sharing a meaning lights, and the cells a lit total is made of are picked out", () => {
  const html = drawScene({ right: [0, 1, 2, 3].map(rowTot) }, { vals: TOTALS, highlight: "m:row1" });
  assert.match(html, /data-ref="t\.row1"[^>]*data-lit=""/);
  for (let c = 0; c < 4; c++) assert.match(html, new RegExp(`data-ref="t\\.c${4 + c}"[^>]*data-member=""`));
  assert.doesNotMatch(html, /data-ref="t\.c0"[^>]*data-member=""/);
  assert.match(drawScene({}, { highlight: "m:c6" }), /data-ref="t\.c6"[^>]*data-lit=""/);
  const g = drawScene({ groups: [{ cells: [0, 15], el: ref("t", "p0") }] }, { vals: { p0: 6 }, highlight: "m:p0" });
  assert.match(g, /data-ref="t\.c15"[^>]*data-member=""/);
});

test("the compact board fits its card: step labels, notes and margins no mark cites are left out", () => {
  const html = drawScene({ right: [0, 1, 2, 3].map(rowTot), bottom: [0, 1, 2, 3].map(colTot), groups: [{ cells: [5, 6], el: ref("t", "s") }] },
    { size: "compact", vals: { ...TOTALS, s: 4 }, marks: [{ kind: "focus", ref: rowTot(1) }, { kind: "note", ref: rowTot(0), text: "4 short" }] });
  assert.match(html, /data-ref="t\.row1"[^>]*data-focus=""/);
  assert.doesNotMatch(html, /class="note"/);
  assert.doesNotMatch(html, /data-ref="t\.col0"/);
  assert.doesNotMatch(html, /class="step"/);
  const w = Number(/<svg[^>]*width="([\d.]+)"/.exec(html)![1]), h = Number(/<svg[^>]*height="([\d.]+)"/.exec(html)![1]);
  assert.ok(w <= 160 && h <= 100, `${w} × ${h}`);
});

test("the text form: the rows, then each margin and the groups by their words", () => {
  const scene = { right: [0, 1, 2, 3].map(rowTot), bottom: [0, 1, 2, 3].map(colTot), rightTitle: "total", bottomTitle: "total", groups: [{ cells: [0, 15], el: ref("t", "p0") }], groupTitle: "pair totals" };
  const values = (r: ElementRef): ElementValue => {
    const m = /^c(\d+)$/.exec(r.name);
    return { kind: "number", q: q(m ? DIGITS[Number(m[1])]! : ({ ...TOTALS, p0: 6 } as Record<string, number>)[r.name]!) };
  };
  assert.equal(rendererFor("grid")!.text({ kind: "grid", rows: N, cols: N, cells: DIGITS.map((_, i) => cell(i)), ...scene }, values, "t"),
    "3 1 1 3 / 0 4 8 0 / 2 2 2 2 / 9 0 0 3 · total per row: 8, 12, 8, 12 · total per column: 14, 7, 11, 8 · pair totals: 6");
});

test("a changed cell is marked and its old digit shown; the chip is the board; the default view is the board", () => {
  const html = renderToStaticMarkup(<RepView type={gridType} state={board("3113", "0480", "2232", "9003")} before={B} rep={defaultRep(gridType)} size="expanded" />);
  assert.match(html, /data-ref="cells\.r2c2"[^>]*data-changed=""/);
  assert.doesNotMatch(html, /data-ref="cells\.r2c1"[^>]*data-changed=""/);
  assert.match(html, /class="was"[^>]*>2</);
  assert.match(renderToStaticMarkup(<ObjectChip type={gridType} state={B} />), /3 1 1 3 \/ 0 4 8 0 \/ 2 2 2 2 \/ 9 0 0 3/);
  assert.equal(defaultRep(gridType), "cells");
  assert.equal(repText(gridType, B, "cells"), "3 1 1 3 / 0 4 8 0 / 2 2 2 2 / 9 0 0 3");
});
