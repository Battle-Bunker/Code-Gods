/**
 * The commit clause (v1's option, off by default; coordinator's call 34), live: an agent that wraps its moves in
 * onlyIfBetter(...) is refused in a room that does not offer the clause, and in one that does its plan is judged by
 * runAct (lib/v2-agents act.ts) on what othersAfter discloses: it commits, or is kept with COMMIT_KEPT's reason.
 *
 * What would break: the room setting not reaching runAct (every clause act refused), or reaching it when off.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform } from "./v2-helpers.ts";

const SOURCE = `function agent(offer) { return onlyIfBetter([move("si.shift", { k: 1 })]); }`;

async function clauseActs(offered: boolean) {
  const [ada] = await humans(`Clause ${offered ? "On" : "Off"} Ada`);
  const { roomId } = (await perform(ada!, "room.create", { name: "Clause room" })).result;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  if (offered) assert.equal((await perform(ada!, "room.settings", { overrides: { commitClause: true } }, { roomId })).ok, true);
  const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
  const summoned = await perform(ada!, "agent.summon", { language: "typescript", source: SOURCE }, { gameId }, "action");
  assert.equal(summoned.ok, true, JSON.stringify(summoned));
  const me = (await ada!.query("v2/games:header", { gameId })).me;
  await perform(ada!, "game.startWorldNow", {}, { gameId });
  let acts: any[] = [];
  for (let i = 0; acts.length < 3; i++) {
    assert.ok(i < 240, "Ada's agent acts");
    await new Promise(r => setTimeout(r, 500));
    acts = (await admin.query("v2/testing:events", { gameId, after: -1 })).filter((e: any) => e.kind === "act" && e.data.memberId === me);
  }
  await perform(ada!, "game.end", {}, { gameId });
  return acts.map(e => e.data);
}

test("an onlyIfBetter plan is refused where the room does not offer the commit clause, and judged where it does", { timeout: 240_000 }, async () => {
  const off = await clauseActs(false);
  assert.ok(off.every(a => a.outcome === "failed" && /does not offer the commit clause/.test(a.reason ?? "")), JSON.stringify(off.map(a => [a.outcome, a.reason])));
  const on = await clauseActs(true);
  assert.ok(on.every(a => !/does not offer the commit clause/.test(a.reason ?? "")), "offered: never refused for the setting");
  assert.ok(on.every(a => a.outcome === "committed" || a.outcome === "stale" || a.outcome === "unaffordable" || /commit clause kept/.test(a.reason ?? "")),
    JSON.stringify(on.map(a => [a.outcome, a.reason])));
});
