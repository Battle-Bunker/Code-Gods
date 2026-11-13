/** Card texts shown to a player never say "point(s)" for what the card counts: that word is the leaderboard's. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate } from "@workspace/game-types";
import { FAMILIES, canonicalSupport, context } from "../src/catalog.ts";
import { ruleScoreWording, usesReservedPoints } from "../src/card-text.ts";

test("the common card sentences read as changes to your rule score", () => {
  const cases: [string, string][] = [
    ["Each SET scores 1 point.", "Each SET adds 1 to your rule score."],
    ["Two cells that touch score 1 point, or 2 points if one of them is red.", "Two cells that touch add 1 to your rule score, or 2 rule-score points if one of them is red."],
    ["Each row scores 1 primary point.", "Each row adds 1 to your primary rule score."],
    ["Each line also scores as many secondary points as it has cells.", "Each line also adds as much to your secondary rule score as it has cells."],
    ["any other character deducts 1 point.", "any other character takes 1 off your rule score."],
    ["A cell of that colour loses 2 points.", "A cell of that colour takes 2 off your rule score."],
    ["You lose 1 point for each unit the total is away from 9.", "You lose 1 from your rule score for each unit the total is away from 9."],
    ["Score 1 point every time a knight could jump.", "Add 1 to your rule score every time a knight could jump."],
    ["it scores that many points.", "it adds that many to your rule score."],
    ["Each one scores 2 more points.", "Each one adds 2 more to your rule score."],
    ["This board scores 3 points.", "This board's rule score is 3."],
    ["This board scores 1 point. Point at a scoring unit to see how it counts.", "This board's rule score is 1. Point at a scoring unit to see how it counts."],
    ["This board scores the points tuple (3, −5).", "This board's rule score is (3, −5)."],
    ["Each cell adds 1 point of badness.", "Each cell adds 1 rule-score point of badness."],
  ];
  for (const [from, to] of cases) assert.equal(ruleScoreWording(from), to);
});

test("a text without the word is left alone, and rewording twice changes nothing", () => {
  assert.equal(ruleScoreWording("Make every row the same colour."), "Make every row the same colour.");
  const once = ruleScoreWording("Each SET scores 1 point, and each pair scores as many points as the gap.");
  assert.equal(ruleScoreWording(once), once);
  // A sentence-initial "Points" (a caption reworded by the card and again by the goal board).
  for (const text of ["Points are counted per row.", "Points: 3. Each arrow that points to a red cell scores 2 points.", "Two cells score 1 point, or 2 points if red."]) {
    const shown = ruleScoreWording(text);
    assert.equal(ruleScoreWording(shown), shown, text);
    assert.ok(!usesReservedPoints(shown), shown);
  }
  assert.equal(ruleScoreWording("Points are counted per row."), "Rule-score points are counted per row.");
});

test("the verb is left alone, and decimal or negative amounts are reworded", () => {
  const cases: [string, string][] = [
    ["Each arrow that points to a red cell scores 2 points.", "Each arrow that points to a red cell adds 2 to your rule score."],
    ["An arrow that points left scores 1 point; one that points up, down or right scores 0.5 points.", "An arrow that points left adds 1 to your rule score; one that points up, down or right adds 0.5 to your rule score."],
    ["A hand that points towards the centre loses 1.5 points.", "A hand that points towards the centre takes 1.5 off your rule score."],
    ["Point at a unit. Each one scores −2 points.", "Point at a unit. Each one adds −2 to your rule score."],
    ["Each pair scores -1 point.", "Each pair adds -1 to your rule score."],
    ["Worth 2.5 points.", "Worth 2.5 rule-score points."],
  ];
  for (const [from, to] of cases) {
    assert.equal(ruleScoreWording(from), to);
    assert.equal(ruleScoreWording(to), to);
    assert.ok(!usesReservedPoints(to), to);
  }
});

test("no family's card text, reworded, uses the reserved word for what the card counts", () => {
  const shapes = [
    instantiate("Grid", {}), instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" }), instantiate("Grid", { size: 7, symbols: "cards", colours: "rainbow6" }),
    instantiate("Int", {}), instantiate("string", {}),
  ];
  let checked = 0;
  for (const inst of shapes) {
    const ctx = context(inst);
    for (const f of FAMILIES) {
      if (f.objectType !== inst.objectType) continue;
      let support: unknown[];
      try { support = canonicalSupport(f, ctx); } catch { continue; }
      for (const p of support.slice(0, 60)) {
        let text: string;
        try { text = f.summary(p as never, ctx); } catch { continue; }
        const shown = ruleScoreWording(text);
        assert.ok(!usesReservedPoints(shown), `${f.id}: ${shown}`);
        assert.equal(ruleScoreWording(shown), shown, f.id);
        checked++;
      }
    }
  }
  assert.ok(checked > 300, `only ${checked} card texts checked`);
});

test("no lens's goal-board texts (unit titles, checks, tallies, stories, example captions), reworded, use the reserved word", async () => {
  const { LENSES, explainer, story } = await import("../src/explain/index.ts");
  const { family } = await import("../src/catalog.ts");
  const shapes = [instantiate("Grid", {}), instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" }), instantiate("Grid", { size: 5, symbols: "cards", colours: "rainbow6" })];
  let checked = 0;
  const check = (where: string, text: string | undefined) => {
    if (!text) return;
    const shown = ruleScoreWording(text);
    assert.ok(!usesReservedPoints(shown), `${where}: ${shown}`);
    assert.equal(ruleScoreWording(shown), shown, where);
    checked++;
  };
  for (const l of LENSES) {
    for (const inst of shapes) {
      const ctx = context(inst), f = family(l.familyId);
      let support: unknown[];
      try { support = canonicalSupport(f, ctx).slice(0, 6); } catch { continue; }
      for (const params of support) {
        let goal;
        try { goal = explainer({ familyId: l.familyId, params: params as never }, inst); } catch { continue; }
        const example = goal.example();
        if (!example) continue;
        check(`${l.familyId} caption`, example.caption);
        const e = goal.explain(example.value);
        for (const part of e?.parts ?? []) {
          check(`${l.familyId} unit`, part.title);
          for (const fact of (part as { facts?: { text: string }[] }).facts ?? []) check(`${l.familyId} check`, fact.text);
        }
        try { for (const frame of story({ familyId: l.familyId, params: params as never }, inst, example.value)?.frames ?? []) check(`${l.familyId} story`, frame.text); } catch { /* no story for this family */ }
      }
    }
  }
  assert.ok(checked > 100, `only ${checked} texts checked`);
});
