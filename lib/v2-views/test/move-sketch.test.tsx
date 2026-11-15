/** @jsxRuntime automatic */
/**
 * The five lens moves drawn on the plane and said for a 12-year-old (lenses-and-mutators.md §5): the geometry each
 * sketch draws is checked against the line the mutator really makes, and the words against the numbers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { q, type Q } from "@workspace/v2-core";
import { encodeLine, fromMC, lineQLenses, lensMutators, normalise, type Line, type LineState } from "@workspace/v2-linear";
import { MoveSketch, sketchMove, type Sketch } from "../src/move-sketch.tsx";

const mc = (m: Q, c: Q): Line => fromMC(m, c) as Line;
const L = (a: bigint, b: bigint, c: bigint): Line => normalise(a, b, c) as Line;
/** Apply a lens mutator with wire args, as the what-if pane does. */
function apply(id: string, line: Line, wire: Record<string, string>): Line {
  const m = lensMutators.find(x => x.id === id)!;
  const r = m.apply({ lines: [line] }, 0, m.args(lineQLenses).decode(wire), lineQLenses) as LineState | { invalid: string };
  if ("invalid" in r) throw new Error(r.invalid);
  return r.lines[0]!;
}
const sketch = (id: string, before: Line, wire: Record<string, string>): Sketch & { after: Line } => {
  const after = apply(id, before, wire);
  const s = sketchMove(before, after, { mutator: id, args: wire });
  assert.ok(s, `${id} is sketched`);
  return { ...s, after };
};
const onLine = (l: Line, p: { x: number; y: number }) => Math.abs(Number(l.a) * p.x + Number(l.b) * p.y + Number(l.c)) < 1e-9 * (1 + Math.abs(Number(l.c)));
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const BAD = /(^|[^\d/⁄.])1x|−1x|\b0x|\+ 0\b|\+ −|− −/;

test("turn about a pin: the pin stays on both lines, the arc turns anticlockwise by the angle of the gradient", () => {
  const before = mc(q(1, 2), q(1));
  const s = sketch("rot.turn", before, { centre: "2", turn: "3/4" });
  const pin = s.points.find(p => p.role === "pin")!;
  assert.deepEqual([pin.x, pin.y], [2, 2]);
  assert.ok(onLine(s.after, pin) && onLine(before, pin));
  assert.equal(s.arc?.ccw, true);
  assert.ok(near(s.arc!.sweep, Math.atan(3 / 4)));
  assert.match(s.words, /pin in the line at \(2, 2\)/);
  assert.match(s.words, /anticlockwise/);
  assert.match(s.words, /3 up for every 4 across/);
  assert.doesNotMatch(s.words, BAD);
  const quarter = sketch("rot.turn", before, { centre: "2", turn: "left" });
  assert.ok(near(quarter.arc!.sweep, Math.PI / 2));
  assert.match(quarter.words, /quarter turn/);
});

test("turn about the origin: the line keeps its distance from O, shown by the two dotted perpendiculars", () => {
  const before = mc(q(0), q(5)); // y = 5
  const s = sketch("rot.turn", before, { centre: "origin", turn: "-3/4" });
  const perps = s.guides.filter(g => g.role === "perp");
  assert.equal(perps.length, 2);
  for (const g of perps) {
    assert.deepEqual([g.from.x, g.from.y], [0, 0]);
    assert.ok(near(Math.hypot(g.to.x, g.to.y), 5));
  }
  assert.ok(onLine(before, perps[0]!.to) && onLine(s.after, perps[1]!.to));
  assert.equal(s.arc?.ccw, false);
  assert.match(s.words, /clockwise/);
  assert.match(s.words, /origin/);
});

test("fold in a crease: the crease passes through the pin, and a tick pair sits at equal distances either side", () => {
  const before = mc(q(2), q(-1));
  const s = sketch("fold", before, { x0: "1", s: "0" });
  assert.ok(s.crease);
  assert.ok(onLine(s.crease!, { x: 1, y: 1 }));
  const pair = s.guides.find(g => g.role === "pair")!;
  assert.ok(onLine(before, pair.from) && onLine(s.after, pair.to), "the dot on the old line meets its twin on the new one");
  const mid = { x: (pair.from.x + pair.to.x) / 2, y: (pair.from.y + pair.to.y) / 2 };
  assert.ok(onLine(s.crease!, mid), "the crease halves the pair");
  assert.match(s.words, /[Ff]old/);
  assert.match(s.words, /\(1, 1\)/);
  const mirror = sketch("fold", before, { mirror: encodeLine(L(1n, -1n, 0n)) });
  assert.deepEqual(mirror.crease, L(1n, -1n, 0n));
  assert.match(mirror.words, /mirror y = x/);
});

test("swap the gradient and the y-intercept: both lines pass through the shared point (1, m + c)", () => {
  const before = mc(q(2), q(5));
  const s = sketch("coef.swap", before, { pair: "m-c" });
  const shared = s.points.find(p => p.role === "shared")!;
  assert.deepEqual([shared.x, shared.y], [1, 7]);
  assert.ok(onLine(before, shared) && onLine(s.after, shared));
  assert.match(s.words, /y = 2x \+ 5 becomes y = 5x \+ 2/);
  assert.match(s.words, /x = 1, at height 7/);
  const bc = sketch("coef.swap", mc(q(1, 2), q(3)), { pair: "b-c" });
  assert.match(bc.words, /upside down/);
  assert.match(bc.words, /from 3 to ⅓/);
  assert.doesNotMatch(bc.words, BAD);
});

test("lean: pinned where it crosses the x-axis; at 1 up, the line goes k further sideways", () => {
  const before = mc(q(2), q(-4)); // crosses the x-axis at 2; at y = 1, x = 2½
  const s = sketch("basis.lean", before, { k: "1/2" });
  const pin = s.points.find(p => p.role === "pin")!;
  assert.deepEqual([pin.x, pin.y], [2, 0]);
  assert.ok(onLine(s.after, pin));
  const arrow = s.guides.find(g => g.role === "arrow")!;
  assert.ok(onLine(before, arrow.from) && onLine(s.after, arrow.to));
  assert.deepEqual([arrow.from.y, arrow.to.y], [1, 1]);
  assert.ok(near(arrow.from.x - arrow.to.x, 0.5), "½ further left");
  assert.match(s.words, /for every 1 up, the line now goes ½ further left/);
});

test("zoom: arrows from O through both crossings to f times as far; same gradient", () => {
  const before = mc(q(-1), q(3)); // crossings at 3 and 3
  const s = sketch("basis.zoom", before, { f: "2" });
  const arrows = s.guides.filter(g => g.role === "arrow");
  assert.equal(arrows.length, 2);
  for (const a of arrows) { assert.ok(onLine(before, a.from) && onLine(s.after, a.to)); assert.ok(near(a.to.x, 2 * a.from.x) && near(a.to.y, 2 * a.from.y)); }
  assert.match(s.words, /twice as far from the origin/);
  assert.match(s.words, /same slope/);
});

test("drawn: the old line faint, the new line, each part named for a reader; a move that is not a lens move draws nothing", () => {
  const before = mc(q(1, 2), q(1));
  const after = apply("rot.turn", before, { centre: "2", turn: "3/4" });
  const html = renderToStaticMarkup(<MoveSketch before={before} after={after} call={{ mutator: "rot.turn", args: { centre: "2", turn: "3/4" } }} />);
  assert.match(html, /class="old"/);
  assert.match(html, /class="new"/);
  assert.match(html, /data-part="pin"/);
  assert.match(html, /data-part="arc"/);
  assert.match(html, /data-testid="text-move-sketch"/);
  assert.equal(sketchMove(before, after, { mutator: "si.shift", args: { k: "1" } }), null);
});

test("round 23: the sketch carries its own colours (a .v2v root), and the arc's label sits clear of the arrowhead", () => {
  for (const turn of ["left", "1", "3/4"]) {
    const before = mc(q(-1), q(-5));
    const after = apply("rot.turn", before, { centre: "0", turn });
    const html = renderToStaticMarkup(<MoveSketch before={before} after={after} call={{ mutator: "rot.turn", args: { centre: "0", turn } }} />);
    assert.match(html, /class="v2v v2v-sketch"/, "inside a pane that is not .v2v, the lines still get a colour");
    const head = [...html.matchAll(/<path class="arc" d="([^"]+)"/g)][0]![1]!.split(/[ML]/).filter(Boolean).at(-1)!.split(",").map(Number);
    const lab = html.match(/data-part="arc-label" x="([\d.]+)" y="([\d.]+)" text-anchor="(\w+)"/)!;
    const [x, y, anchor] = [Number(lab[1]), Number(lab[2]), lab[3]];
    const width = (turn === "left" ? "¼ turn" : html.match(/data-part="arc-label"[^>]*>([^<]+)</)![1]!).length * 6.5;
    const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
    const clear = head[0]! < left - 4 || head[0]! > left + width + 4 || head[1]! < y - 14 || head[1]! > y + 4;
    assert.ok(clear, `turn ${turn}: the arrowhead at (${head}) is clear of the label box at x ${left}–${left + width}, y ${y}`);
    assert.ok(left >= 0 && left + width <= 320, `turn ${turn}: the label fits the window`);
  }
});
