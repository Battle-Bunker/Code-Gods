import { test } from "node:test";
import assert from "node:assert/strict";
import { commitmentBriefing, commitmentsOf, findDeals, linesIn, skipsLines, type ChatRow, type MoveRow } from "../src/index.ts";

const chat: ChatRow[] = [
  { from: "Ada", text: "Lines 2 and 9: I'll keep my agent off them if you keep off line 4. Deal?", at: 20 },
  { from: "Bo", text: "Deal!", at: 40 },
  { from: "Cy", text: "Line 5: let's both leave it. Deal?", at: 40 },
  { from: "Ada", text: "Line 5: I'd rather you leave c at 4 instead. Deal?", at: 60 },   // a counter-offer, not an acceptance
  { from: "Bo", text: "ok, line 5 it is", at: 60 },
];
const simple = "function agent(offer) {\n  const v = look(offer, \"si\");\n  return null;\n}";
const kept = "function agent(offer) {\n  if ([2, 9, 4].includes(offer.object)) return null;   // the deal with Bo\n  return null;\n}";

test("deals: lines named in a list, a counter-offer is not an acceptance, a reply names the same line", () => {
  assert.deepEqual(linesIn("lines 2, 7 and 9 and line 11"), [2, 7, 9, 11]);
  const { deals, proposals } = findDeals(chat);
  assert.deepEqual(proposals, [0, 2, 3]);
  assert.deepEqual(deals.map(d => [d.proposer, d.accepter, d.lines, d.at]), [["Ada", "Bo", [2, 9, 4], 40], ["Cy", "Bo", [5], 60]]);
});

test("a promise is pending until the agents' code skips the lines; a line number in a comment does not count", () => {
  assert.equal(skipsLines(kept, [2, 9, 4]), true);
  assert.equal(skipsLines(kept, [2, 9, 7]), false);
  assert.equal(skipsLines(simple, [2, 9]), false);
  const starter = "const FAR = 2;\nconst LEAVE = [];\nfunction agent(offer) {\n  if (LEAVE.includes(offer.object)) return null;\n  return [move(\"si.shift\", { k: 9 })];\n}";
  assert.equal(skipsLines(starter, [2, 9]), false, "an empty LEAVE list keeps nothing, whatever other numbers the code has");
  assert.equal(skipsLines(starter.replace("LEAVE = []", "LEAVE = [2, 9]"), [2, 9]), true);
  assert.equal(skipsLines("if (String(offer.object) === \"19\") return null;", [19]), false, "only plain numbers are read");
  assert.equal(skipsLines("if (offer.object === 19) return null;", [19]), true);
  assert.equal(skipsLines("function agent(offer) { return offer.object > 0 ? null : null; } // lines 2 and 9", [2, 9]), false);
  assert.equal(skipsLines("def agent(offer):\n    if offer.object in (2, 9):\n        return None\n", [2, 9]), true);
  const [c] = commitmentsOf("Ada", chat, [], [simple]);
  assert.equal(c!.status, "pending");
  assert.equal(commitmentsOf("Ada", chat, [], [kept])[0]!.status, "enacted");
  assert.equal(commitmentsOf("Ada", chat, [], [kept, simple])[0]!.status, "pending", "every agent must skip them");
});

test("breaks by either side after the deal are reported; a retraction ends the commitment", () => {
  const moves: MoveRow[] = [
    { by: "Bo", line: 9, at: 30, lowered: ["Ada"] },    // before the deal: not a break
    { by: "Bo", line: 9, at: 50, lowered: ["Ada"] },
    { by: "Ada", line: 2, at: 55, lowered: ["Bo"] },
    { by: "Ada", line: 3, at: 55, lowered: ["Bo"] },    // not a named line
  ];
  const [c] = commitmentsOf("Ada", chat, moves, [simple]);
  assert.deepEqual(c!.partnerBreaks, [{ line: 9, at: 50 }]);
  assert.deepEqual(c!.myBreaks, [{ line: 2, at: 55 }]);
  const retracted = commitmentsOf("Ada", [...chat, { from: "Ada", text: "Bo, I'm calling off our deal on line 2, sorry.", at: 80 }], moves, [simple]);
  assert.equal(retracted[0]!.status, "retracted");
});

test("the briefing says what each deal needs now, with the edit and its price", () => {
  const text = commitmentBriefing(commitmentsOf("Ada", chat, [{ by: "Bo", line: 9, at: 50, lowered: ["Ada"] }], [simple]));
  assert.match(text, /With Bo, lines 2, 9 and 4 \(agreed at 40 s\): PENDING/);
  assert.match(text, /if \(\[2, 9, 4\]\.includes\(offer\.object\)\) return null;/);
  assert.match(text, /if offer\.object in \(2, 9, 4\): return None/);
  assert.match(text, /agent_replace/);
  assert.match(text, /if it has a PROTECT list, add 2, 9, 4 to it/);
  assert.equal(skipsLines("const LEAVE = [2, 9, 4];\nfunction agent(offer) {\n  if (LEAVE.includes(offer.object)) return null;\n}", [2, 9, 4]), true, "a starter's LEAVE list keeps it");
  assert.match(text, /about 20 ⚡\) or retract it in chat/);
  assert.match(text, /Bo's agents lowered your points on line 9/);
  assert.match(commitmentBriefing(commitmentsOf("Ada", chat, [], [kept])), /your agents skip them: kept\. Bo has kept it so far\./);
  assert.equal(commitmentBriefing([]), "YOUR DEALS: none yet.");
});
