/**
 * Every dealt rule of the coloured boards marks what it reads (docs/engine-v2/v1-audit.md §6, G1–G3): on a corpus of
 * boards, each preset rule's main layer marks the board wherever it counts anything, and each dealt secondary marks
 * under its own id. The digit grid's twin is lib/v2-grid/test/marks.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateObject, rng, walkStep, type Mark } from "@workspace/v2-core";
import { board4rgb, boardPresets, BOARD_FAMILIES } from "../src/index.ts";
import { board4Type } from "../src/type.ts";

for (const preset of boardPresets) test(`every dealt layer of ${preset.title} marks the board wherever it counts anything`, () => {
  const g = rng("board-marks-corpus");
  const type = board4Type as never as Parameters<typeof walkStep>[0];
  let s = (type as { origin: (v: unknown) => unknown }).origin(board4rgb);
  const boards: unknown[] = [];
  for (let i = 0; i < 400; i++) { s = walkStep(type, board4rgb, s, g); if (i % 20 === 19) boards.push(s); }
  const missing: string[] = [];
  for (const rule of preset.rules) {
    const family = BOARD_FAMILIES.find(f => f.id === rule.family)!;
    for (const tb of rule.tieBreakers) {
      for (const layer of [family.main.id, ...(tb ? [tb] : [])]) {
        let marked = 0, total = 0;
        for (const b of boards) {
          const ev = evaluateObject(type, family as never, rule.params, b, board4rgb, tb);
          const e = ev.sites[0]!;
          const t = e.terms.find(x => x.id === layer);
          if (!t || !("n" in t.value) || t.value.n === 0n) continue;
          total++;
          const mine = e.marks.filter((m: Mark) => (layer === family.main.id ? m.term === undefined || m.term === layer : m.term === layer));
          if (mine.length) marked++;
        }
        if (marked < total) missing.push(`${rule.family} ${JSON.stringify(rule.params)} / ${layer}: ${marked}/${total}`);
      }
    }
  }
  assert.deepEqual(missing, [], "dealt layers that mark nothing where they count something");
});
