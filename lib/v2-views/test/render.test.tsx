/** @jsxRuntime automatic */
/**
 * Static markup over every representation of the line, every family's marks and a corpus of states (plan §3.2): every
 * mark's element produces a node in the expanded view, focus marks survive in the compact view, and the text form
 * mentions every coordinate.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { Qn, q, rng, walkStep, type Q, type RuleFamily } from "@workspace/v2-core";
import { families, fromMC, lineQ, lineType, normalise, type Line, type LineState } from "@workspace/v2-linear";
import { annotate, fmtQ, markRefs, ObjectChip, RepView, repText, type RuleRef } from "../src/index.ts";
import { emptyTank } from "../src/demo.ts";
import { key as refNodeKey } from "../src/render/common.tsx";

const mc = (m: number | Q, c: number | Q): LineState =>
  ({ lines: [fromMC(typeof m === "number" ? q(m) : m, typeof c === "number" ? q(c) : c)] });
const abc = (a: number, b: number, c: number): LineState => ({ lines: [normalise(BigInt(a), BigInt(b), BigInt(c)) as Line] });

test("equation text: signs fold into operators, implied 1s and zero terms drop", () => {
  assert.equal(repText(lineType, mc(-3, 10), "si"), "y = −3x + 10");
  assert.equal(repText(lineType, mc(1, -2), "si"), "y = x − 2");
  assert.equal(repText(lineType, mc(-1, 0), "si"), "y = −x");
  assert.equal(repText(lineType, mc(0, -4), "si"), "y = −4");
  assert.equal(repText(lineType, mc(q(1, 2), q(11, 2)), "si"), "y = ½x + 5½");
  assert.equal(repText(lineType, mc(-3, 10), "gen"), "3x + y − 10 = 0");
  assert.equal(repText(lineType, abc(1, 0, -3), "gen"), "x − 3 = 0");
  assert.equal(repText(lineType, abc(1, 0, -3), "si"), "a vertical line has no gradient or y-intercept");
  assert.equal(repText(lineType, mc(2, 1), "seq"), "3, 5, 7, 9, … (+ 2 each time; start 1)");
  assert.equal(repText(lineType, mc(2, -1), "mach"), "1 → × 2 → − 1 → 1");
});

function corpus(): LineState[] {
  const fixed = [mc(-3, 10), mc(4, -3), mc(1, 5), mc(2, 1), mc(0, 3), mc(3, 0), mc(-1, 4), mc(q(1, 2), q(11, 2)), abc(1, 0, -3), abc(2, 3, -12)];
  const g = rng("render-corpus");
  let s = mc(1, 1);
  const walked: LineState[] = [];
  for (let i = 0; i < 40; i++) { s = walkStep(lineType, lineQ, s, g); walked.push(s); }
  return [...fixed, ...walked];
}

const nodes = (html: string) => new Set([...html.matchAll(/data-ref="([^"]+)"/g)].map(m => m[1]!.replace(/&quot;/g, '"')));

test("every mark of every family produces a node; focus survives the compact view", () => {
  const all = [...families, emptyTank] as readonly RuleFamily<LineState, any>[];
  let checked = 0;
  for (const s of corpus()) {
    for (const f of all) {
      for (const params of f.dealable(lineQ).slice(0, 2)) {
        const rule: RuleRef<LineState, unknown> = { type: lineType, family: f, params, variant: lineQ };
        const a = annotate(rule, s);
        const e = a.sites[0]!.evaluation;
        for (const rep of lineType.representations) {
          for (const size of ["compact", "expanded"] as const) {
            const html = renderToStaticMarkup(<RepView type={lineType} state={s} rep={rep.id} size={size} marks={e.marks} terms={e.terms} />);
            if (html.includes("v2v-undef")) continue; // the representation cannot express this line: its sentence is shown
            const have = nodes(html);
            for (const m of e.marks) {
              if (!markRefs(m).every(r => r.rep === rep.id)) continue;
              if (size === "compact" && m.kind !== "focus") continue;
              if (m.kind === "note" && size === "compact") continue;
              for (const r of markRefs(m)) {
                const k = refNodeKey(r);
                assert.ok(have.has(k), `${f.id} ${rep.id} ${size}: no node for ${k} (mark ${m.kind}) on ${lineType.encode(s)}`);
                checked++;
              }
            }
          }
        }
      }
    }
  }
  assert.ok(checked > 1000, `checked ${checked}`);
});

test("the text form mentions every coordinate", () => {
  for (const s of corpus()) {
    for (const rep of lineType.representations) {
      const t = repText(lineType, s, rep.id);
      for (const el of rep.elements.filter(e => e.role === "coordinate")) {
        const v = el.value(s, 0, {});
        if (v.kind === "undefined") continue;
        const nums: Q[] = v.kind === "number" ? [v.q] : v.kind === "point" ? [v.x, v.y] : v.kind === "segment" ? [v.from.x, v.from.y, v.to.x, v.to.y] : [];
        for (const n of nums) {
          if (rep.scene === "equation" && (n.n === 0n || Qn.eq(Qn.abs(n), Qn.ONE))) continue; // implied: "x", no "+ 0"
          assert.ok(t.includes(fmtQ(Qn.abs(n))), `${rep.id}.${el.name} = ${fmtQ(n)} missing from "${t}"`);
        }
      }
    }
  }
});

test("cross-highlight lights every element sharing the meaning; the chip is the primary's text", () => {
  const s = mc(-3, 10);
  const lit = (rep: string) => renderToStaticMarkup(<RepView type={lineType} state={s} rep={rep} size="expanded" highlight="yIntercept" />);
  assert.match(lit("si"), /data-ref="si\.c"[^>]*data-lit=""/);
  assert.doesNotMatch(lit("si"), /data-ref="si\.m"[^>]*data-lit=""/);
  assert.match(lit("cart"), /data-ref="cart\.yInt"[^>]*data-lit=""/);
  assert.match(renderToStaticMarkup(<ObjectChip type={lineType} state={s} rep="si" extra="5/8" />), /y = −3x \+ 10.*5\/8/);
});

test("a previous state: changed elements are marked and the old value shown", () => {
  const html = renderToStaticMarkup(<RepView type={lineType} state={mc(-3, 9)} before={mc(-3, 10)} rep="si" size="expanded" />);
  assert.match(html, /data-ref="si\.c"[^>]*data-changed=""/);
  assert.doesNotMatch(html, /data-ref="si\.m"[^>]*data-changed=""/);
  assert.match(html, /class="v2v-was">10</);
  assert.match(renderToStaticMarkup(<RepView type={lineType} state={mc(-3, 9)} before={mc(-3, 10)} rep="cart" size="expanded" />), /class="line-was"/);
});

test("the storyboard's compact plane: the x-intercept ringed, minute 3 ticked, the gap bracketed", () => {
  const rule: RuleRef<LineState, Record<string, never>> = { type: lineType, family: emptyTank, params: {}, variant: lineQ };
  const e = annotate(rule, mc(-3, 10)).sites[0]!.evaluation;
  const html = renderToStaticMarkup(<RepView type={lineType} state={mc(-3, 10)} rep="cart" size="compact" marks={e.marks} terms={e.terms} />);
  assert.match(html, /data-ref="cart\.xInt"[^>]*data-focus=""/);
  assert.match(html, /class="ring"/);
  assert.match(html, /data-ref="cart\.xAxisMark\(x=3\)"/);
  assert.match(html, /data-mark="measure"[^>]*>.*⅓/);
});
