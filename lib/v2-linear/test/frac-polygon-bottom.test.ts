/** Polygon Bottom (frac-polygon-bottom.ts). Every expected value below was worked out by hand from the card. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, type Evaluation, type TieBreaker } from "@workspace/v2-core";
import { beginnerPool, lineQ, lineType, lineZ, nearestPolygon, POLYGON_SIDES, polygonBottom, polygonNumber, presets } from "../src/index.ts";
import { abc, mc } from "./helpers.ts";

const f = Qn.q;
const ev = (s: Parameters<typeof evaluateSite>[3], tb: TieBreaker = null, sides = 3) =>
  evaluateSite(lineType, polygonBottom, { s: sides } as never, s as never, lineQ, 0, tb);
const term = (e: Evaluation, id: string) => { const v = e.terms.find(x => x.id === id)!.value; return v && typeof v === "object" && "n" in v ? Qn.toWire(v as never) : JSON.stringify(v); };

test("on the line type, in no pool or preset, dealable only on rational lines, five polygons", () => {
  assert.ok(lineType.families.some(x => x.id === "polygon-bottom"));
  assert.ok(!beginnerPool.some(x => x.id === "polygon-bottom"));
  assert.ok(!presets.some(p => p.rules.some(r => r.family === "polygon-bottom")));
  assert.equal(polygonBottom.dealable(lineZ).length, 0);
  assert.deepEqual(polygonBottom.dealable(lineQ).map(p => p.s), [...POLYGON_SIDES]);
  assert.equal(polygonBottom.tieBreakers.length, 4);
});

test("polygon numbers and the nearest one (halfway goes to the bigger)", () => {
  assert.deepEqual([1n, 2n, 3n, 4n, 5n].map(n => polygonNumber(3, n)), [1n, 3n, 6n, 10n, 15n]);
  assert.deepEqual([1n, 2n, 3n, 4n, 5n].map(n => polygonNumber(5, n)), [1n, 5n, 12n, 22n, 35n]);
  assert.equal(nearestPolygon(1n, 3).n, 1n);
  assert.equal(nearestPolygon(4n, 3).n, 2n);    // 1 from 3, 2 from 6
  assert.equal(nearestPolygon(8n, 3).n, 4n);    // 2 from 6 and from 10
  assert.equal(nearestPolygon(17n, 5).n, 4n);   // 5 from 12 and from 22
  const big = 10n ** 12n;
  assert.equal(nearestPolygon(polygonNumber(7, big), 7).n, big);
});

test("main, secondary and thirds (triangles): y = (7/10)x + 13/15", () => {
  const s = mc(f(7, 10), f(13, 15));
  const e = ev(s, "near");
  assert.equal(term(e, "side"), "4");                                     // smaller bottom 10 = triangle of side 4
  assert.equal(term(e, "near"), "0");
  assert.equal(term(ev(s, "top-side"), "top-side"), "3");                 // |7 − 4|
  assert.equal(term(ev(s, "crossing-ratio"), "crossing-ratio"), "105/13"); // x-intercept size 26/21; 10 ÷ 26/21
  assert.equal(term(ev(s, "whole-side"), "whole-side"), "4");             // whole part 0
  assert.ok(term(ev(mc(0, f(1, 10)), "crossing-ratio"), "crossing-ratio").includes("undefined"));
});

test("robust: whole moves and three reflections keep main and secondary", () => {
  const want = ev(mc(f(7, 10), f(13, 15)), "near").score;
  for (const s of [mc(f(17, 10), f(13, 15)), mc(f(7, 10), f(28, 15)), mc(f(-7, 10), f(13, 15)), mc(f(-7, 10), f(-13, 15)), mc(f(7, 10), f(-13, 15))])
    assert.deepEqual(ev(s, "near").score, want);
});

test("a vertical line is worst", () => {
  assert.equal(ev(abc(1, 0, -3)).score, null);
});
