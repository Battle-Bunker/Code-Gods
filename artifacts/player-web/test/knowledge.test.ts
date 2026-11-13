/**
 * Paid observation in the objects panel (src/core/panels/knowledge.ts). What would break: a row that has not changed
 * shown as stale (or a changed one as fresh), ages that read wrongly, a Look button offered at a price the player
 * cannot pay without saying why, and free games (no `knownAt`) showing any of it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ageText, lookAllNote, lookOffer, seenText, staleness } from "../src/core/panels/knowledge.ts";

test("ages are compact world seconds: now, 42s, 3m 10s, 1h 2m", () => {
  assert.equal(ageText(0), "now");
  assert.equal(ageText(0.4), "now");
  assert.equal(ageText(-3), "now", "a clock a tick behind the row never shows a negative age");
  assert.equal(ageText(42.7), "42s");
  assert.equal(ageText(60), "1m");
  assert.equal(ageText(190), "3m 10s");
  assert.equal(ageText(3725), "1h 2m");
  assert.equal(seenText(0), "seen just now");
  assert.equal(seenText(42), "seen 42s ago");
});

test("a free game's row (no knownAt) has no staleness at all", () => {
  assert.equal(staleness({}, 100), null);
  assert.equal(staleness({ changesSince: 3 }, 100), null);
});

test("an unchanged row is fresh however old; a changed one is stale and says how often", () => {
  const fresh = staleness({ knownAt: 10, changesSince: 0 }, 310);
  assert.deepEqual(fresh, { stale: false, age: 300, changes: 0, seen: "seen 5m ago", note: "unchanged since" });
  const stale = staleness({ knownAt: 268, changesSince: 3 }, 310);
  assert.deepEqual(stale, { stale: true, age: 42, changes: 3, seen: "seen 42s ago", note: "changed 3× since" });
  assert.equal(staleness({ knownAt: 268, changesSince: 1 }, 310)?.note, "changed once since");
  // Rows without the count (player.objectsTop, the board): only the age is known.
  assert.deepEqual(staleness({ knownAt: 300 }, 310), { stale: false, age: 10, changes: undefined, seen: "seen 10s ago", note: null });
});

test("one look: the price on the button, affordable or the reason with price and balance", () => {
  assert.deepEqual(lookOffer({ price: 1.66, energy: 5 }), { total: 1.66, label: "Look · 1.66 energy", ok: true, reason: null });
  const poor = lookOffer({ price: 1.66, energy: 0.4 });
  assert.equal(poor.ok, false);
  assert.equal(poor.reason, "A look costs 1.66 energy; you have 0.40");
  assert.equal(lookOffer({ price: 1.66, energy: -2 }).reason, "A look costs 1.66 energy; you have 0.00", "a debt reads as nothing to spend");
  assert.equal(lookOffer({ price: 1.66, energy: 1.66 }).ok, true, "exactly the price is enough (the engine refuses only below it)");
  assert.equal(lookOffer({ price: 1.66, energy: 0, noPower: true }).reason, "A look costs 1.66 energy; you have 0.00. All your power is with your agents: keep some power for yourself to look",
    "a god whose power is all with its agents is told what to do about it");
  assert.equal(lookOffer({ price: 1.66, energy: 5, noPower: true }).reason, null, "an affordable look says nothing of power");
});

test("a look at all: the price times the object count, said before paying", () => {
  const all = lookOffer({ price: 1.66, energy: 100, count: 40 });
  assert.deepEqual(all, { total: 66.4, label: "Look at all 40 · about 66.40 energy", ok: true, reason: null });
  const poor = lookOffer({ price: 1.66, energy: 12.5, count: 40 });
  assert.equal(poor.ok, false);
  assert.equal(poor.reason, "A look at all 40 objects costs 66.40 energy; you have 12.50");
  const none = lookOffer({ price: 1.66, energy: 12.5, count: 0 });
  assert.equal(none.ok, false);
  assert.equal(none.reason, "There are no objects to look at yet");
});

test("the look at all is quoted as 'about', with what a new object adds (quoted 19.93 for 12, charged 23.25 for 14)", () => {
  assert.equal(lookAllNote({ price: 1.66, count: 12 }), "12 objects now; each new one costs 1.66 more.");
  assert.equal(lookAllNote({ price: 1.66, count: 1 }), "1 object now; each new one costs 1.66 more.");
  assert.equal(lookOffer({ price: 1.66, energy: 100, count: 12 }).label, "Look at all 12 · about 19.92 energy");
});
