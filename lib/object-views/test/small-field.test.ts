/**
 * The small-field colour model (S-CIELAB, Zhang and Wandell 1996): a digit's stroke is thin enough that the eye's
 * spatial filtering blurs its colour into the page, much more along the blue–yellow axis than along luminance. These
 * tests pin the model to hand-derived values and to the limits it must reach (a huge stroke is the plain colour; no
 * stroke is the page).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { channelRetention, deltaE2000, deltaE2000Lab, erf, labOf, opponentOf, smallFieldLab, stripeRetention, SCIELAB_FILTERS } from "../src/colour-science.ts";

const close = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test("erf matches tabulated values", () => {
  close(erf(0), 0, 1e-7, "erf 0");
  close(erf(0.5), 0.5204999, 2e-7, "erf 0.5");
  close(erf(1), 0.8427008, 2e-7, "erf 1");
  close(erf(-1), -0.8427008, 2e-7, "erf -1");
  close(erf(3), 0.9999779, 2e-7, "erf 3");
});

test("a stripe keeps its full signal when wide and none when vanishingly thin", () => {
  close(stripeRetention(100, 0.05), 1, 1e-3, "wide");
  close(stripeRetention(1e-6, 0.05), 0, 1e-3, "thin");
  // The mean over the stripe of the blurred stripe ½[erf((w/2−x)/s) + erf((w/2+x)/s)] is (s/w)·∫₀^{w/s} erf(u) du;
  // at w = s that is erf(1) − (1 − e⁻¹)/√π ≈ 0.4861.
  close(stripeRetention(0.05, 0.05), 0.4861, 1e-4, "w = s");
});

test("the opponent transform is Zhang and Wandell's (XYZ, white Y = 1)", () => {
  // White's XYZ is (0.9505, 1, 1.089); O1 = 0.279X + 0.72Y − 0.107Z, O2 = −0.449X + 0.29Y − 0.077Z, O3 = 0.086X − 0.59Y + 0.501Z.
  const [o1, o2, o3] = opponentOf("#ffffff");
  close(o1, 0.8687, 2e-3, "O1"); close(o2, -0.2207, 2e-3, "O2"); close(o3, 0.0372, 2e-3, "O3");
  // O2 is the red–green channel (green high, red low), O3 the blue–yellow one (blue high).
  assert.ok(opponentOf("#00ff00")[1] > opponentOf("#ff0000")[1] + 0.1);
  assert.ok(opponentOf("#0000ff")[2] > opponentOf("#ffff00")[2] + 0.4);
});

test("the spatial filters each pass a uniform field unchanged (weights sum to 1)", () => {
  for (const [name, f] of Object.entries(SCIELAB_FILTERS)) close(f.reduce((s, [, w]) => s + w, 0), 1, 1e-4, name);
});

test("smallFieldLab: a huge stroke is the colour itself, a vanishing one the page", () => {
  const page = "#f5f1eb";
  for (const hex of ["#c20d39", "#0555e7", "#06641a"]) {
    assert.ok(deltaE2000Lab(smallFieldLab(hex, page, 1e5), labOf(hex)) < 0.05, `${hex} wide`);
    assert.ok(deltaE2000Lab(smallFieldLab(hex, page, 1e-7), labOf(page)) < 0.05, `${hex} thin`);
  }
});

test("at digit size blue–yellow collapses first: small-field tritanopia", () => {
  // A 1.3 px stem seen at 45 px per degree is 0.03°. Hand-derived from stripeRetention and the filters above:
  // luminance keeps 0.329 of its signal, red–green 0.156 and blue–yellow 0.114.
  const [lum, rg, by] = channelRetention(0.03);
  close(lum, 0.329, 3e-3, "luminance"); close(rg, 0.156, 3e-3, "red–green"); close(by, 0.114, 3e-3, "blue–yellow");
  // So a pair apart only in hue keeps a smaller share of its difference than a pair apart in lightness.
  const page = "#f5f1eb";
  const share = (a: string, b: string) => deltaE2000Lab(smallFieldLab(a, page, 0.03), smallFieldLab(b, page, 0.03)) / deltaE2000(a, b);
  const hue = share("#8a7400", "#5f6cc4"), light = share("#404040", "#8a8a8a");
  assert.ok(light > 1.5 * hue, `lightness keeps ${light.toFixed(3)}, hue ${hue.toFixed(3)}`);
});
