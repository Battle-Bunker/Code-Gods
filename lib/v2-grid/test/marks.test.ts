/**
 * Every dealt layer marks what it reads (docs/engine-v2/v1-audit.md §6, G2): on a corpus of boards, each preset rule's
 * main layer and each dealt secondary put marks on the board, a secondary's labelled with its own id, so a player sees
 * on the object what each part of their rule counts. v1's lenses did this for every unit of every tier.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateObject, rng, walkStep, type ElementRef, type Mark } from "@workspace/v2-core";
import { grid4, gridType, gridPresets, type GridState } from "../src/index.ts";


function corpus(): GridState[] {
  const g = rng("grid-marks-corpus");
  let s = gridType.origin(grid4);
  const out: GridState[] = [];
  for (let i = 0; i < 400; i++) { s = walkStep(gridType, grid4, s, g); if (i % 20 === 19) out.push(s); }
  return out;
}
const termOf = (m: Mark): string | undefined => m.term;
const refsOf = (m: Mark): readonly ElementRef[] => (m.kind === "measure" ? [m.from, m.to] : [m.ref]);

for (const preset of gridPresets) test(`every dealt secondary of ${preset.title} marks what it reads, under its own id, wherever it counts anything`, () => {
  const boards = corpus();
  const missing: string[] = [];
  for (const rule of preset.rules) {
    const family = gridType.families.find(f => f.id === rule.family)!;
    for (const tb of rule.tieBreakers) {
      let marked = 0, total = 0;
      for (const s of boards) {
        const ev = evaluateObject(gridType, family, rule.params, s, grid4, tb);
        const mine = ev.sites[0]!.marks.filter(m => termOf(m) === tb);
        for (const m of mine) for (const r of refsOf(m)) assert.ok(gridType.representations.some(x => x.id === r.rep), `${rule.family}/${tb}: a mark on ${r.rep}`);
        // A count at 0 has nothing to point at; any other value is made of something on the board.
        const value = ev.sites[0]!.terms.find(t => t.id === tb)!.value;
        const counts = !("n" in value) || value.n !== 0n;
        if (counts) { total++; if (mine.length) marked++; }
      }
      if (marked < total || total === 0) missing.push(`${rule.family}/${tb}: ${marked}/${total}`);
    }
  }
  assert.deepEqual(missing, [], "dealt secondaries that mark nothing on most boards");
});
