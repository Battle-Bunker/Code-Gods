/** What Check says in Agent code (src/panes/forge-check.ts): once, and about what pressing the main button would do. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkReport } from "../src/panes/forge-check.ts";

const r = { verdict: "works" as const, summary: "It made a change on 3 of 3 sample lines, spending about 1.20 energy a turn. Summoning it costs 38.88 energy.", price: 38.88, sample: [{ outcome: "committed" as const }] };

test("a new agent's check names the summon price once (playtest: the sentence was said twice)", () => {
  const t = checkReport(r, { replacing: false, many: "lines" });
  assert.equal(t.match(/Summoning it costs/g)?.length, 1, t);
});

test("an agent already summoned is not told about summoning: the edit's price is on the line below the editor", () => {
  const t = checkReport(r, { replacing: true, many: "lines" });
  assert.doesNotMatch(t, /Summoning/, t);
  assert.match(t, /^It works: It made a change on 3 of 3 sample lines/);
  assert.match(t, /On sample lines it made a move\./);
});
