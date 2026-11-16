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
  // 60 boards, 20 walk steps apart (20 were too few: a rare count, e.g. opposite-nines/different-splits, could miss them all).
  for (let i = 0; i < 1200; i++) { s = walkStep(gridType, grid4, s, g); if (i % 20 === 19) out.push(s); }
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

test("Mirrormancer says which mirror pairs make a row's gap", () => {
  const family = gridType.families.find(f => f.id === "mirrormancer")!;
  const ev = evaluateObject(gridType, family, {}, gridType.decode("3113/0480/2222/9003"), grid4, "one-apart");
  const notes = ev.sites[0]!.marks.flatMap(m => (m.kind === "note" && m.ref.rep === "mirror" ? [`${m.ref.name}: ${m.text}`] : []));
  assert.deepEqual(notes, ["gap1: off by 4: 4 vs 8", "gap3: off by 6: 9 vs 3"]);
});

test("Opposite Nines says how far each pair is from 9; Strangers names the touching pairs that are not strangers", () => {
  const s = gridType.decode("3113/0480/2222/9003");
  const mainNotes = (id: string, params: object, tb: string) => evaluateObject(gridType, gridType.families.find(f => f.id === id)!, params, s, grid4, tb)
    .sites[0]!.marks.flatMap(m => (m.kind === "note" && m.term === undefined ? [m.text] : []));
  const on = mainNotes("opposite-nines", { T: 9 }, "mirror-nines");
  assert.ok(on.every(t => /^adds up to \d+: \d+ (short|over)$/.test(t)), on.join(" | "));
  const st = mainNotes("strangers", {}, "across-strangers");
  assert.ok(st.length > 0 && st.every(t => /^\d of 4: /.test(t)), st.join(" | "));
  assert.ok(st.some(t => /share|next-door|1|0/.test(t)), st.join(" | "));
});
