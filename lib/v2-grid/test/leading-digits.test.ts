/** Leading Digits (leading-digits.ts): the readings matched against the starts of powers, leading zeros, the guard, the tie-breaker on the exponents, the cards, the view. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, type Q } from "@workspace/v2-core";
import { gridType, grid4, gridPresets, LEADING_DIGITS_DEALT, leadMatch, leadingDigitsNote, type GridState, type LeadingDigitsParams } from "../src/index.ts";
import { board } from "./helpers.ts";

const fam = gridType.families.find(f => f.id === "leading-digits")!;
const terms = (s: GridState, p: LeadingDigitsParams) => Object.fromEntries(evaluateSite(gridType, fam, p, s, grid4, 0, null).terms.map(t => [t.id, Number((t.value as Q).n)]));

/** An independent oracle: the longest common start of x's digits and b^k's, over every k ≤ 1000 (the first k on a tie). */
function brute(x: number, b: number): { digits: number; k: number | null } {
  if (x === 0) return { digits: 0, k: null };
  const s = String(x);
  let best = { digits: 0, k: null as number | null };
  for (let k = 0; k <= 1000; k++) {
    const t = (BigInt(b) ** BigInt(k)).toString();
    let n = 0;
    while (n < s.length && n < t.length && s[n] === t[n]) n++;
    if (n > best.digits) best = { digits: n, k };
  }
  return best;
}

test("a reading shares its leading digits with the start of some power of b (k up to 1000), exactly, not in floating point", () => {
  // 2^129 = 680564733841876926926749214863536422912.
  assert.deepEqual(leadMatch(68051234, 2), { digits: 4, k: 129 });
  assert.deepEqual(brute(68051234, 2), { digits: 4, k: 129 });
  assert.deepEqual(leadMatch(68056473, 2), { digits: 8, k: 129 });
  // 2^7 = 128 has three digits: 12800000 shares those three with it (no padding with zeros), unless a longer power starts 128…
  assert.deepEqual(leadMatch(12800000, 2), brute(12800000, 2));
  assert.ok(leadMatch(20000000, 2).digits < 8, "2 = 2¹ is not 20000000");
  // Leading zeros: 00000128 is read as 128, the whole of 2^7.
  assert.deepEqual(leadMatch(128, 2), { digits: 3, k: 7 });
  assert.deepEqual(leadMatch(0, 2), { digits: 0, k: null }, "a reading of 0 scores nothing");
  // 7^1000 starts 1.25…e845 (BigInt): the table reaches the 1000th power.
  const top = (7n ** 1000n).toString().slice(0, 8);
  assert.equal(leadMatch(Number(top), 7).digits, 8);
  // Against the oracle on spread-out readings, both bases.
  for (let i = 0; i < 300; i++) {
    const x = (i * 7919 * 104729) % 100_000_000;
    for (const b of [2, 7]) assert.deepEqual(leadMatch(x, b), brute(x, b), `${x} against powers of ${b}`);
  }
});

test("the main part adds the matched digits over the four readings, less the repeated rows and columns; the tie-breaker adds the exponents' digits", () => {
  const p: LeadingDigitsParams = { b: 2, layout: "halves" };
  // Top half 6805 6473 = 2^129's first eight digits; bottom half 0000 0128 = 128 = 2^7 (three digits).
  const A = board("6805", "6473", "0000", "0128");
  // Columns: the left half 6600 8401 = 66008401, the right half 0702 5308 = 7025308 (its leading 0 dropped).
  const left = brute(66008401, 2), right = brute(7025308, 2);
  // Repeats: no two rows hold the same numbers (6805, 6473, 0000, 0128), nor two columns (6600, 8401, 0702, 5308).
  assert.deepEqual(terms(A, p), {
    digits: 8 + 3 + left.digits + right.digits,
    "exponent-digits": (1 + 2 + 9) + 7 + [...String(left.k)].reduce((t, d) => t + Number(d), 0) + [...String(right.k)].reduce((t, d) => t + Number(d), 0),
  });
  // A board of 0s: every reading is 0 (no digits), the rows repeat three times and the columns three times.
  assert.deepEqual(terms(board("0000", "0000", "0000", "0000"), p), { digits: -6, "exponent-digits": 0 });
  // Alternate: rows 1 and 3, rows 2 and 4, columns 1 and 3, columns 2 and 4.
  const B = board("6805", "1111", "6473", "2222");
  // Columns 1 and 3: 6162 0172; columns 2 and 4: 8142 5132. No repeats.
  assert.equal(terms(B, { b: 2, layout: "alternate" }).digits, 8 + brute(11112222, 2).digits + brute(61620172, 2).digits + brute(81425132, 2).digits);
});

test("cards: one sentence each, at most four numbers, no \"line\", with the guard; dealt: b 2 and 7 × halves and alternate", () => {
  assert.equal(fam.card({ b: 2, layout: "halves" }, null),
    "Read the top half and the bottom half row by row, and the left half and the right half column by column, each as one number: each should start with the same digits as some power of 2 (up to the 1000th), for as many digits as possible, and no two rows or two columns may hold the same numbers.");
  assert.deepEqual(fam.dealable(grid4), [...LEADING_DIGITS_DEALT]);
  assert.deepEqual(LEADING_DIGITS_DEALT, [{ b: 2, layout: "halves" }, { b: 2, layout: "alternate" }, { b: 7, layout: "halves" }, { b: 7, layout: "alternate" }]);
  for (const p of fam.dealable(grid4)) for (const tb of [null, ...fam.tieBreakers.map(t => t.id)]) {
    const c = fam.card(p, tb);
    assert.doesNotMatch(c, /\bline\b/i, c);
    assert.ok((c.match(/\d+/g) ?? []).length <= 4, c);
    assert.match(c, /no two rows or two columns may hold the same numbers/);
  }
  // The arithmetic playtest preset deals the four, each with its tie-breaker; no other preset deals the family.
  for (const pr of gridPresets) for (const r of pr.rules) if (r.family === "leading-digits") assert.equal(pr.id, "grids-arithmetic");
  const pool = gridPresets.find(p => p.id === "grids-arithmetic")!.rules;
  assert.deepEqual(pool.filter(r => r.family === "leading-digits").map(r => [r.params, r.tieBreakers]), LEADING_DIGITS_DEALT.map(p => [p, ["exponent-digits"]]));
  assert.deepEqual([...new Set(pool.map(r => r.family))], ["divisibility", "leading-digits"]);
});

test("the view: the four readings are cited, the ones with the most digits focused, a note on each", () => {
  assert.equal(leadingDigitsNote(68051234, 2), "starts like 2¹²⁹ = 6805…: 4 digits");
  assert.equal(leadingDigitsNote(128, 2), "starts like 2⁷ = 128: 3 digits");
  assert.equal(leadingDigitsNote(0, 2), "0 counts nothing");
  const A = board("6805", "6473", "0000", "0128");
  const e = evaluateSite(gridType, fam, { b: 2, layout: "halves" }, A, grid4, 0, null);
  assert.deepEqual(e.terms.find(t => t.id === "digits")!.from.map(r => r.name), ["h0", "h1", "h2", "h3"]);
  const notes = e.marks.filter(m => m.kind === "note") as { ref: { name: string }; text: string }[];
  assert.ok(notes.some(m => m.ref.name === "h0" && m.text === "starts like 2¹²⁹ = 68056473…: 8 digits"), JSON.stringify(notes));
  assert.ok(notes.some(m => m.ref.name === "h1" && m.text === "starts like 2⁷ = 128: 3 digits"));
  assert.deepEqual(e.marks.filter(m => m.kind === "focus").map(m => (m as { ref: { name: string } }).ref.name), ["h0"]);
});
