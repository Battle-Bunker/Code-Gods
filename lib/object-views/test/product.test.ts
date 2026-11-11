import assert from "node:assert/strict";
import test from "node:test";
import { productText, readDisplayed } from "../src/product.ts";

const round1 = (x: number) => { const v = Math.round(x * 10) / 10; return v === 0 ? 0 : v; };

test("factors that would not multiply out at one decimal get more decimals", () => {
  // 3.24 × 4.73 = 15.3252: "3.2 × 4.7" is 15.04, so one decimal would read as a mistake.
  const p = productText(3.24, 4.73);
  assert.deepEqual([p.a, p.b, p.product, p.sign], ["3.24", "4.73", "15.3", "="]);
  // Factors that already multiply out stay short.
  assert.deepEqual(productText(2, 3.5), { a: "2.0", b: "3.5", product: "7.0", exact: true, sign: "=" });
  assert.deepEqual(productText(-1.5, 4), { a: "−1.5", b: "4.0", product: "−6.0", exact: true, sign: "=" });
  assert.equal(productText(7.3, 0).product, "0.0");
});

test("the displayed a × the displayed b is the displayed product, or the line says ≈", () => {
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  let approx = 0;
  for (let i = 0; i < 20000; i++) {
    const a = (rnd() - 0.2) * 40, b = rnd() * 120;
    const p = productText(a, b);
    assert.equal(readDisplayed(p.product), round1(a * b));
    if (p.exact) assert.equal(round1(readDisplayed(p.a) * readDisplayed(p.b)), readDisplayed(p.product), `${p.a} × ${p.b} = ${p.product}`);
    else { approx++; assert.equal(p.sign, "≈"); }
  }
  assert.ok(approx < 200, `${approx} of 20000 lines fell back to ≈`);
});

test("a product given by the server that its factors cannot reach is marked ≈", () => {
  const p = productText(2, 3, 7);
  assert.deepEqual([p.a, p.b, p.product, p.sign], ["2.00", "3.00", "7.0", "≈"]);
});
