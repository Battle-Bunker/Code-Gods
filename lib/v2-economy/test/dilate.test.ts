/**
 * Time dilation (owner decision 37; src/dilate.ts). A game dilated by a factor plays the same game faster: window by
 * window, the same opportunities, births and energies as the undilated game over windows `factor` times longer.
 * Breaks caught: a rate or duration left out of the dilation (energy per act, births per game or capacity would change).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rng } from "@workspace/v2-core";
import { dilate, energyCapacity, LINES_BEGINNER_ECONOMY, opportunities, settle } from "../src/index.ts";

const game = {
  planningSeconds: 60, worldSeconds: 600, scoreIntervalSeconds: 10, startingEnergy: 600,
  economy: { ...LINES_BEGINNER_ECONOMY, birthsPerSecond: 1 / 240 }, bid: { seconds: 45, pricing: "first" },
};

/** A game's tick record over windows of the given lengths: opportunities, births, and one account's balance. */
function play(g: typeof game, windows: readonly number[]) {
  const offers = rng("dilate", "offers"), births = rng("dilate", "births");
  const income = g.economy.powerPerSecond / 2, capacity = energyCapacity(income, g.economy.fullChargeSeconds);
  let account = { balance: 0, settledWorldSeconds: 0 }, world = 0;
  return windows.map(dt => {
    world += dt;
    account = settle(account, world, income, capacity);
    const out = { opportunities: opportunities(g.economy.opportunitiesPerSecond, dt, offers), births: opportunities(g.economy.birthsPerSecond, dt, births), balance: account.balance };
    account = { ...account, balance: Math.max(0, account.balance - 3 * out.opportunities) };   // acts spend
    return out;
  });
}

test("a dilated game has the same opportunities, births and energies, window for window, in a tenth of the time", () => {
  const windows = Array.from({ length: 400 }, (_, i) => 1.5 + (i % 7) * 0.1);   // the tick's uneven windows
  const fast = dilate(game, 10);
  const slow = play(game, windows), quick = play(fast, windows.map(w => w / 10));
  for (const [i, s] of slow.entries()) {
    const q = quick[i]!;
    assert.deepEqual([q.opportunities, q.births], [s.opportunities, s.births], `window ${i}`);
    assert.ok(Math.abs(q.balance - s.balance) < 1e-9 * Math.max(1, s.balance), `window ${i}: ${q.balance} vs ${s.balance}`);
  }
  assert.ok(slow.reduce((t, s) => t + s.opportunities, 0) > 1000, "a game's worth of opportunities");
});

test("every rate is multiplied, every duration divided, energies untouched; a factor of 1 changes nothing", () => {
  const fast = dilate(game, 10);
  assert.deepEqual([fast.planningSeconds, fast.worldSeconds, fast.scoreIntervalSeconds, fast.bid.seconds], [6, 60, 1, 4.5]);
  assert.deepEqual([fast.economy.powerPerSecond, fast.economy.opportunitiesPerSecond, fast.economy.fullChargeSeconds], [30, 30, 24]);
  assert.ok(Math.abs(fast.economy.birthsPerSecond - 10 / 240) < 1e-15);
  assert.equal(fast.startingEnergy, 600, "energies are not rates");
  assert.equal(energyCapacity(fast.economy.powerPerSecond, fast.economy.fullChargeSeconds), energyCapacity(game.economy.powerPerSecond, game.economy.fullChargeSeconds));
  assert.deepEqual(dilate(game, 1), game);
  assert.throws(() => dilate(game, 0));
});
