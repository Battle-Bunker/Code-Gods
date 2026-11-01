/**
 * Rules: declared needs and clear text, exhaustively (docs/rules-design.md §4.3). Over every playable instantiation ×
 * every family × its support (canonical params plus a seeded sample):
 *   - a family is dealt only where it is `applicable`, and every param it can sample is applicable with its needs;
 *   - the summary, the card comments and the example render on that shape (the phrasebook throws RuleTextError on any
 *     sentence that cannot be true there) and pass the lint (colours the room has, resolved symbols, short sentences);
 *   - where a family declares its best ordinal (`top`), its exemplar reaches it;
 *   - an example board decodes in its shape's symbols and colours, and its caption passes the lint.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeGrid, instantiate, objectType, seededRng, type GridTypeArgs, type Instantiation } from "@workspace/game-types";
import { FAMILIES, applicable, canonicalSupport, card, compareOrdinals, context, evaluator, familiesFor, paramsKey } from "../src/catalog.ts";
import { availableFamilies, divineLottery } from "../src/selectors.ts";
import { playableInstantiations } from "../src/calibration.ts";
import { MAX_SENTENCE_WORDS, RuleTextError, lintRuleText } from "../src/families/say.ts";
import type { Params, UtilityFamily } from "../src/types.ts";

const SHAPES: readonly Instantiation[] = [
  ...playableInstantiations("Grid"),
  instantiate("Int", objectType("Int").defaults), instantiate("Int", { min: 0, max: 9999 }),
  instantiate("string", objectType("string").defaults), instantiate("string", { maxLength: 16 }),
];
const SAMPLE = 48;

function paramsOf(f: UtilityFamily<any>, inst: Instantiation): Params[] {
  const ctx = context(inst), out = new Map<string, Params>();
  for (const p of canonicalSupport(f, ctx)) out.set(paramsKey(p), p);
  const rng = seededRng(`rules:${f.id}:${inst.key}`);
  for (let i = 0; i < SAMPLE; i++) { const p = f.sample(rng, ctx); out.set(paramsKey(p), p); }
  return [...out.values()];
}

/** Comment text of a TypeScript card (the header and the constants' notes): what the player reads in the source. */
const comments = (source: string) => source.split("\n").flatMap(l => { const m = l.match(/\/\/\s?(.*)$/); return m ? [m[1]!] : []; }).join(" ");

function lint(text: string, inst: Instantiation): string[] {
  if (inst.objectType === "Grid") return lintRuleText(text, String(inst.args.symbols), String(inst.args.colours));
  return text.split(/(?<=[.!?])\s+(?=[A-Z"(])/).filter(s => s.split(/\s+/).length > MAX_SENTENCE_WORDS)
    .map(s => `sentence of more than ${MAX_SENTENCE_WORDS} words: "${s.slice(0, 60)}…"`);
}

test("every dealable draw on every shape fits its declared needs and renders clear text", async () => {
  const problems: string[] = [];
  for (const inst of SHAPES) {
    const ctx = context(inst);
    for (const f of familiesFor(inst.objectType)) {
      if (!applicable(f, inst).ok) continue;
      for (const p of paramsOf(f, inst)) {
        const where = `${f.id} ${paramsKey(p)} on ${inst.key}`;
        const r = applicable(f, inst, p);
        if (!r.ok) { problems.push(`${where}: sampled but not applicable (${r.reason})`); continue; }
        try {
          const c = f.role === "reward" ? card({ familyId: f.id, params: p }, ctx) : null;
          const text = c ? c.summary : f.summary(p, ctx);
          const source = c ? c.source.typescript : f.card.typescript(p, ctx);
          for (const msg of lint(text, inst)) problems.push(`${where}: summary ${msg}`);
          for (const msg of lint(comments(source), inst)) problems.push(`${where}: card comment ${msg}`);
          if (c?.example) for (const msg of lint(c.example.caption, inst)) problems.push(`${where}: example ${msg}`);
          f.card.python(p, ctx);
        } catch (e) {
          if (e instanceof RuleTextError) problems.push(`${where}: ${e.message}`);
          else throw e;
        }
      }
    }
  }
  if (process.env.RULES_DUMP) (await import("node:fs")).writeFileSync(process.env.RULES_DUMP, problems.join("\n") + "\n");
  assert.deepEqual(problems.slice(0, 60), [], `${problems.length} problems`);
});

test("a family whose needs are unmet is never dealt and is listed as locked with a reason", () => {
  for (const inst of SHAPES) {
    const dealable = new Set(availableFamilies(inst, "reward").map(f => f.id));
    for (const f of familiesFor(inst.objectType)) {
      const r = applicable(f, inst);
      if (!r.ok) {
        assert.ok(!dealable.has(f.id), `${f.id} dealable on ${inst.key} though ${r.reason}`);
        assert.ok(r.reason.length > 0, `${f.id} on ${inst.key}: locked without a reason`);
      }
    }
    const deal = divineLottery.select(inst, 6, seededRng(`deal:${inst.key}`));
    for (const d of deal) assert.ok(applicable(FAMILIES.find(f => f.id === d.familyId)!, inst, d.params).ok, `${d.familyId} dealt on ${inst.key}`);
  }
});

test("declared tops are reached by the exemplar", () => {
  for (const inst of SHAPES) {
    const ctx = context(inst);
    for (const f of familiesFor(inst.objectType)) {
      if (!f.top || !f.exemplar || !applicable(f, inst).ok) continue;
      for (const p of canonicalSupport(f, ctx)) {
        const u = evaluator({ familyId: f.id, params: p }, inst);
        assert.equal(compareOrdinals(u(f.exemplar(p, ctx)), f.top(p, ctx)), 0, `${f.id} ${paramsKey(p)} on ${inst.key}: exemplar scores ${JSON.stringify(u(f.exemplar(p, ctx)))}, top is ${JSON.stringify(f.top(p, ctx))}`);
      }
    }
  }
});

/**
 * Reward families with no example board, and why (docs/rules-design.md §3.2). Every other Grid reward family must have
 * one. Int and string worlds have none: their goals are about one number or one string, which the card already shows.
 */
const NO_EXAMPLE: Readonly<Record<string, string>> = {
  border_baron: "countries must reach a size set by the room (up to 2N − 2 cells), which a tiny board cannot hold",
  far_apart: "the score is a distance between two middles, scaled by 64, so a tiny board misstates how points grow",
  magic_accountant: "the magic number is sized for the room's full lines, so a short line cannot reach it",
  divisibility_detective: "a pure number goal: rows read as one big number, which a tiny board would only make shorter",
  robin_hood: "a pure number goal about colour totals; no pattern to show",
  column_addition: "the written sum sits on rows chosen for the room's size",
  ladder_of_numbers: "a pure number goal: rows read as big numbers compared with each other",
  bingo_caller: "the BINGO bonus is the board's size, so a tiny board would contradict the card's own bonus",
  twenty_one: "the target is sized for the room's full lines, so a short line cannot show going bust or hitting it",
};

/** Example draws for one family on one shape: the canonical params plus a few sampled ones (examples follow params). */
function exampleParams(f: UtilityFamily<any>, inst: Instantiation): Params[] {
  const ctx = context(inst), out = new Map<string, Params>();
  for (const p of canonicalSupport(f, ctx)) out.set(paramsKey(p), p);
  const rng = seededRng(`example:${f.id}:${inst.key}`);
  for (let i = 0; i < 6; i++) { const p = f.sample(rng, ctx); out.set(paramsKey(p), p); }
  return [...out.values()];
}

test("every Grid reward family has an example board, or a stated reason not to", () => {
  const wrong = familiesFor("Grid", "reward").filter(f => !f.example === !(f.id in NO_EXAMPLE)).map(f => f.id);
  assert.deepEqual(wrong, [], "each needs exactly one of an example board or a reason in NO_EXAMPLE");
});

test("example boards render on every shape in its own tiles, and their captions state the card's own score", async () => {
  const problems: string[] = [];
  for (const inst of SHAPES.filter(i => i.objectType === "Grid")) {
    const ctx = context(inst), args = inst.args as unknown as GridTypeArgs;
    for (const f of familiesFor("Grid", "reward")) {
      if (!f.example || !applicable(f, inst).ok) continue;
      for (const p of exampleParams(f, inst)) {
        const where = `${f.id} ${paramsKey(p)} on ${inst.key}`;
        let e;
        try { e = f.example(p, ctx); } catch (err) { problems.push(`${where}: example fails: ${(err as Error).message}`); continue; }
        if (!e) { problems.push(`${where}: no example`); continue; }
        if (!(e.size >= 2 && e.size <= 4)) problems.push(`${where}: example of size ${e.size}`);
        // The player client's protocol bounds (lib/player-client/src/protocol.ts utilityCardSchema).
        if (String(e.value).length > 256 || e.caption.length > 300) problems.push(`${where}: example too long for the card protocol`);
        // Decoding in the room's own symbols and colours (at the example's size) is what "uses only this shape's tiles" means.
        try { decodeGrid(String(e.value), { ...args, size: e.size }); } catch { problems.push(`${where}: ${String(e.value)} is not in this room's tiles`); continue; }
        const stated = [...e.caption.matchAll(/\b(\d+) points?\b/g)].map(m => Number(m[1]));
        const o = evaluator({ familyId: f.id, params: p }, inst, e.size)(e.value), scored = typeof o === "number" ? o : o[0]!;
        if (stated.length !== 1) problems.push(`${where}: caption should state its points once: "${e.caption}"`);
        else if (stated[0] !== scored) problems.push(`${where}: caption says ${stated[0]} points, the card scores ${scored}: "${e.caption}"`);
        if (!(scored > 0)) problems.push(`${where}: the example scores ${scored}, so it shows nothing: "${e.caption}"`);
        if (e.caption.split(/(?<=[.!?])\s+(?=[A-Z"(])/).length > 2) problems.push(`${where}: caption is more than one short sentence: "${e.caption}"`);
        for (const msg of lintRuleText(e.caption, String(args.symbols), String(args.colours))) problems.push(`${where}: caption ${msg}`);
      }
    }
  }
  if (process.env.RULES_DUMP) (await import("node:fs")).writeFileSync(`${process.env.RULES_DUMP}.examples`, problems.join("\n") + "\n");
  assert.deepEqual(problems.slice(0, 40), [], `${problems.length} problems`);
});
