/**
 * The Divine Lottery deals every seat the same family distribution. Without the final shuffle a repeated draw was
 * redrawn for the later seat, so families with few param variants got rarer down the table (Annotated basics, 6 gods:
 * number_bonds 8.9% at seat 0 against 6.6% at seat 5).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate, seededRng } from "@workspace/game-types";
import { availableFamilies, divineLottery } from "../src/index.ts";

test("divine lottery: the first and last seats get each family about equally often", () => {
  const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" });
  // A small pool where several families have one param class, so redraws are frequent.
  const keep = ["number_bonds", "set_spotter", "magic_accountant", "colour_mirror", "kingdom", "chessmaster"];
  const rng = seededRng("deal-seat-symmetry"), seats = 6, deals = 3000;
  const first = new Map<string, number>(), last = new Map<string, number>();
  for (let d = 0; d < deals; d++) {
    const deal = divineLottery.select(inst, seats, rng, { exclude: excludeAllBut(inst, keep) });
    first.set(deal[0].familyId, (first.get(deal[0].familyId) ?? 0) + 1);
    last.set(deal[seats - 1].familyId, (last.get(deal[seats - 1].familyId) ?? 0) + 1);
  }
  for (const f of new Set([...first.keys(), ...last.keys()])) {
    const a = (first.get(f) ?? 0) / deals, b = (last.get(f) ?? 0) / deals;
    assert.ok(Math.abs(a - b) < 0.04, `${f}: seat 0 ${a.toFixed(3)} vs seat ${seats - 1} ${b.toFixed(3)}`);
  }
});

function excludeAllBut(inst: ReturnType<typeof instantiate>, keep: readonly string[]): string[] {
  return availableFamilies(inst, "reward").map(f => f.id).filter(id => !keep.includes(id));
}
