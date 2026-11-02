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

test("example boards decode in their shape's symbols and colours", () => {
  for (const inst of SHAPES.filter(i => i.objectType === "Grid")) {
    const ctx = context(inst);
    for (const f of familiesFor("Grid")) {
      if (!f.example || !applicable(f, inst).ok) continue;
      for (const p of canonicalSupport(f, ctx)) {
        const e = f.example(p, ctx);
        assert.ok(e.size >= 1 && e.size <= 3, `${f.id}: example of size ${e.size}`);
        assert.doesNotThrow(() => decodeGrid(String(e.value), { ...(inst.args as unknown as GridTypeArgs), size: e.size }), `${f.id} on ${inst.key}: example ${String(e.value)} does not decode`);
        assert.ok(e.caption.length > 0 && e.caption.length <= 160, `${f.id}: caption`);
      }
    }
  }
});
