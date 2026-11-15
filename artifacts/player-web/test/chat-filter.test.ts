import { test } from "node:test";
import assert from "node:assert/strict";
import { chatFilter, mentions } from "../src/site/components/chat-filter.ts";

const kinds = new Map([["h1", "human"], ["h2", "human"], ["a1", "ai"], ["p1", "practice"]]);
const msgs = [
  { id: "1", memberId: "h2", text: "hi Alex" },
  { id: "2", memberId: "a1", text: "I'll take line 3" },
  { id: "3", memberId: null, text: "Alex joined" },
  { id: "4", memberId: "p1", text: "alex, leave 4?" },
  { id: "5", memberId: "h1", text: "Alexander said" },
];

test("people, AI players and mentions of you; room notices only under everyone", () => {
  const ids = (f: Parameters<typeof chatFilter>[1]) => chatFilter(msgs, f, { kinds, myName: "Alex", me: "h1" }).map(m => m.id);
  assert.deepEqual(ids("all"), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(ids("people"), ["1", "5"]);
  assert.deepEqual(ids("ai"), ["2", "4"]);
  assert.deepEqual(ids("mentions"), ["1", "4"]);
});

test("a mention is the name as a word, any case", () => {
  assert.ok(mentions("ok @alex!", "Alex"));
  assert.ok(!mentions("Alexander", "Alex"));
  assert.ok(!mentions("anything", ""));
});
