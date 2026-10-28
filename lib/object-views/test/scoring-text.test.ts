import assert from "node:assert/strict";
import test from "node:test";
import { instantiate, instanceInfo, OBJECT_TYPES } from "@workspace/game-types";
import { publicCatalog } from "@workspace/game-utilities";
import {
  formatCount, objectNoun, oneInN, penaltyLine, penaltyPercent, penaltySurprisal, rarerThanPerMille, rarityText,
} from "../src/rarity.ts";
import { familyUses, groupByBadge, lockedText, primaryBadge, shelfCounts, WORKS_EVERYWHERE, DEFENCE_GOALS } from "../src/catalog.ts";
import { changedParams, componentBadges, findOffered, ruleDelta, snapToOffered, type ObjectTypeInfoLike } from "../src/settings.ts";
import { createObjectTypeRegistry } from "../src/registry.ts";
import { looksLikeGrid } from "../src/grid-display.ts";

test("rarity: kid-cards §2 table (1 in N headline, ✨ bits, per mille)", () => {
  // score → bits from lib/grid-lab/docs/kid-cards.md §2
  const rows: [number, string, number, string][] = [
    [Math.log2(2.5), "1 in 2.5", 600, "1.3"],
    [-Math.log2(0.072), "1 in 14", 928, "3.8"],
    [7.18, "1 in 145", 993, "7.2"],
    [11.2, "1 in 2,400", 999, "11.2"],
    [20.2, "1 in 1.2 million", 999, "20.2"],
    [40, "1 in 1.1 trillion", 999, "40.0"],
  ];
  for (const [bits, oneIn, perMille, sparkles] of rows) {
    const r = rarityText(bits, "grid");
    assert.equal(r.oneIn, oneIn, `bits ${bits}`);
    assert.equal(rarerThanPerMille(bits), perMille, `bits ${bits}`);
    assert.equal(r.sparkles, sparkles);
  }
  assert.equal(rarityText(7.18, "grid").rarerThan, "rarer than 993 of 1,000 grids");
  assert.equal(rarityText(7.18, "grid").sentence, "Only 1 random grid in 145 does this well.");
});

test("rarity: everyday objects, zero, negative and non-finite bits", () => {
  for (const b of [0, 0.4, -3, NaN]) {
    const r = rarityText(b, "grid");
    assert.equal(r.everyday, true);
    assert.equal(r.oneIn, "an everyday grid");
  }
  assert.equal(rarityText(0, "grid").sparkles, "0.0");
  assert.equal(rarityText(-0.01).sparkles, "0.0");
  assert.equal(oneInN(-5), 1);
  assert.equal(formatCount(Infinity), "more than a quintillion");
  assert.match(formatCount(2 ** 70), /^1\.2 × 10\^21$/);
  assert.equal(objectNoun("Grid"), "grid");
  assert.equal(objectNoun("Int"), "number");
  assert.equal(objectNoun(undefined), "object");
});

test("penalty: soft hinge inverted; ⚠️ line only above the median", () => {
  // η(s) = log2(1 + 2^(s−1)) − log2(1.5)
  const eta = (s: number) => Math.log2(1 + 2 ** (s - 1)) - Math.log2(1.5);
  for (const s of [0, 0.5, 1, 3.32, 12]) assert.ok(Math.abs(penaltySurprisal(eta(s)) - s) < 1e-9, `s=${s}`);
  // s = log2(10): worse than 90% of random grids
  const h = eta(Math.log2(10));
  assert.equal(penaltyPercent(h), 90);
  assert.equal(penaltyLine(h, "redder", "grid"), "⚠️ redder than 90% of grids");
  assert.equal(penaltyLine(eta(0.9), "redder", "grid"), "⚠️ fine");
  assert.equal(penaltyLine(0, "blobbier", "grid"), "⚠️ fine");
  assert.equal(penaltyPercent(1e6), 99);
});

test("locked reasons render as 'locked: needs X. Pick Y'", () => {
  assert.equal(lockedText("needs ♠ Suits: pick Playing cards"), "locked: needs ♠ Suits. Pick Playing cards");
  assert.equal(lockedText("needs 🎯 a middle square: pick size 3, 5 or 7"), "locked: needs 🎯 a middle square. Pick size 3, 5 or 7");
  assert.equal(lockedText("needs a bigger board: size 6 or more"), "locked: needs a bigger board: size 6 or more");
  assert.equal(lockedText(undefined), "locked");
  // Every real locked reason from the catalog renders with the "locked: needs" form.
  const inst = instantiate("Grid", { size: 5, symbols: "base10", colours: "rgby" });
  const locked = publicCatalog(inst).filter(e => !e.available);
  assert.ok(locked.length > 0);
  for (const e of locked) assert.match(lockedText(e.locked?.reason), /^locked: (needs|doesn't work|only for|has )/);
  const suits = locked.find(e => e.locked?.reason.includes("♠ Suits"));
  assert.equal(lockedText(suits!.locked!.reason), "locked: needs ♠ Suits. Pick Playing cards");
});

test("catalog grouping: Works everywhere first, defence goals last, locked rules join their badge", () => {
  const inst = instantiate("Grid", { size: 5, symbols: "base10", colours: "rgby" });
  const entries = publicCatalog(inst);
  const badges = OBJECT_TYPES.find(t => t.id === "Grid")!.classes.map(c => c.badge);
  const groups = groupByBadge(entries, badges);
  assert.equal(groups[0].badge.id, WORKS_EVERYWHERE.id);
  assert.equal(groups.at(-1)!.badge.id, DEFENCE_GOALS.id);
  assert.equal(groups.reduce((n, g) => n + g.entries.length, 0), entries.length);
  const suited = groups.find(g => g.badge.id === "Suited");
  assert.ok(suited && suited.available === 0 && suited.entries.length > 0, "locked suit rules are grouped under ♠ Suits");
  for (const g of groups) for (const e of g.entries) if (e.available && e.role === "reward") assert.equal(primaryBadge(e).id, g.badge.id);
  const c = shelfCounts(entries);
  assert.equal(c.available + c.locked, c.total);
  assert.ok(c.locked > 0 && c.available > 0);
});

test("familyUses: badges a card relies on, [] for unknown or unconstrained", () => {
  const inst = instantiate("Grid", { size: 4, symbols: "cards", colours: "rainbow6" });
  const suited = publicCatalog(inst).find(e => e.available && e.badges.some(b => b.id === "Suited"))!;
  assert.ok(familyUses(suited.id).some(b => b.id === "Suited"));
  assert.deepEqual(familyUses("no-such-family"), []);
});

const gridType = (): ObjectTypeInfoLike => {
  const T = OBJECT_TYPES.find(t => t.id === "Grid")!;
  const offered = [{ size: 5, symbols: "base10", colours: "rgby" }, { size: 4, symbols: "cards", colours: "rainbow6" }, { size: 3, symbols: "base10", colours: "rgb" }]
    .map(args => { const info = instanceInfo(instantiate("Grid", args)); return { key: info.key, args: info.args as Record<string, string | number>, label: info.label, badges: info.badges }; });
  return { id: T.id, label: T.label, emoji: T.emoji, kid: T.kid, params: T.params as ObjectTypeInfoLike["params"], defaults: T.defaults as Record<string, string | number>, offered };
};

test("settings: snapping to offered instantiations keeps the most of the current choice", () => {
  const t = gridType();
  const cur = { size: 5, symbols: "base10", colours: "rgby" };
  assert.equal(findOffered(t, cur)?.key, "Grid(5,base10,rgby)");
  assert.equal(findOffered(t, { size: 6 }), undefined);
  assert.equal(snapToOffered(t, cur, { symbols: "cards" })?.key, "Grid(4,cards,rainbow6)");
  assert.equal(snapToOffered(t, cur, { colours: "rgb" })?.key, "Grid(3,base10,rgb)");
  assert.equal(snapToOffered(t, cur, { symbols: "base16" }), undefined);
  assert.equal(snapToOffered(t, { size: 3, symbols: "base10", colours: "rgb" }, { size: 5 })?.key, "Grid(5,base10,rgby)");
  assert.deepEqual(changedParams(cur, { size: 4, symbols: "cards", colours: "rgby" }), ["size", "symbols"]);
});

test("settings: component badges are maximal; rule deltas count gained and lost rules", () => {
  const t = gridType();
  const symbols = t.params.find(p => p.id === "symbols")!;
  assert.deepEqual(componentBadges("Grid", symbols, "base10").map(b => b.label), ["Place value"]);
  assert.deepEqual(componentBadges("Grid", symbols, "cards").map(b => b.id).sort(), ["Faced", "Suited", "Valued"]);
  const colours = t.params.find(p => p.id === "colours")!;
  assert.ok(componentBadges("Grid", colours, "rainbow6").some(b => b.id === "Wheel"));
  const d = ruleDelta("Grid", { size: 5, symbols: "base10", colours: "rgby" }, "Grid", { size: 4, symbols: "cards", colours: "rainbow6" });
  assert.ok(d.gained > 0 && d.lost > 0);
  assert.deepEqual(ruleDelta("Grid", { size: 5 }, "Grid", { size: 5 }), { gained: 0, lost: 0 });
});

test("dispatch: a known objectType wins over inference; untyped values fall back by shape", () => {
  const r = createObjectTypeRegistry<string>();
  r.register({ type: "string", component: "S", infer: v => typeof v === "string" });
  r.register({ type: "Int", component: "I", infer: v => typeof v === "number" });
  r.register({ type: "Grid", component: "G", infer: looksLikeGrid });
  assert.equal(r.resolve("1R,2G/3B,4R")?.component, "G");
  assert.equal(r.resolve("1R,2G/3B,4R", { objectType: "string" })?.component, "S");
  assert.equal(r.resolve(7)?.component, "I");
  assert.equal(r.resolve("hello")?.component, "S");
  assert.equal(r.resolve("7R", {})?.component, "S", "1×1 is not inferred as a grid");
  assert.equal(r.resolve(3, { objectType: "Tree" })?.component, "I", "unknown types fall back to inference");
});
