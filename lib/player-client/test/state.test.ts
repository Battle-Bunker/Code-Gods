// watchState (`pnpm player state --watch`) subscribes to the engine's narrow queries, one per part, never to the
// whole-world player.observation (docs/convex-read-architecture.md §4.5), and puts a protocol v3 observation together
// from them. What would break: a watch that reads the world again, or a line that no longer parses as an observation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getFunctionName } from "convex/server";
import { VERSION } from "../src/protocol.ts";
import { watchState } from "../src/state.ts";

type Sub = { name: string; args: any; cb: (value: any) => void; live: boolean };

function fakeEngine() {
  const subs: Sub[] = [];
  const client = {
    onUpdate(ref: any, args: any, cb: (value: any) => void) {
      const sub = { name: getFunctionName(ref), args, cb, live: true };
      subs.push(sub);
      return () => { sub.live = false; };
    },
    close: async () => {},
  };
  const engine = { token: async () => ({ roomId: "room" }), realtimeClient: async () => client };
  const push = (name: string, value: unknown, match: (args: any) => boolean = () => true) => {
    for (const s of subs) if (s.live && s.name === name && match(s.args)) s.cb(value);
  };
  return { engine: engine as never, subs, push };
}

const state = { version: VERSION, roomId: "room", revision: 1, phase: "running", gameId: "game", seated: true, language: "python", languages: ["python"],
  self: { godId: "god", label: "Human", isAI: false, energy: 100, ready: true, score: 3 } };
const objectView = (id: string, payoff: number) => ({ id, value: 1, version: 0, mutations: 0, createdAt: 0, lastMutatedAt: null,
  own: { ordinal: 1, rewardBits: 1, netBits: 1 }, peerNetBits: 2, peerCare: 2, payoff });

test("watchState: one narrow subscription per part, objects followed one by one, never the whole observation", async () => {
  const { engine, subs, push } = fakeEngine();
  const lines: any[] = [];
  const watch = await watchState(engine, { hz: 5, objects: 2, onLine: l => lines.push(l), onError: e => { throw e; } });
  push("dock:state", state);
  push("dock:agents", []);
  push("dock:transformations", []);
  push("rooms:chat", { page: [{ id: "c2", authorId: "b", authorName: "Bo", kind: "ai", text: "second" }, { id: "c1", authorId: "a", authorName: "Ada", kind: "human", text: "first" }] });
  push("player:events", { events: [] });
  push("player:myUtility", null);
  push("games:standings", { rows: [{ deityId: "god", name: "Human", kind: "human", totalPayoff: 3, rank: 1 }], world: 12 });
  push("player:totals", { objectCount: 7 });
  push("player:objectIds", { rows: [{ id: "o1", key: 5 }, { id: "o2", key: 4 }], next: null });
  assert.deepEqual(subs.find(s => s.name === "player:objectIds")!.args, { gameId: "game", sort: "payoff", limit: 2 });
  push("player:object", objectView("o1", 5), a => a.objectId === "o1");
  await new Promise(r => setTimeout(r, 50));
  assert.equal(lines.length, 0, "no line until every listed object has answered");
  push("player:object", objectView("o2", 4), a => a.objectId === "o2");
  await new Promise(r => setTimeout(r, 50));
  assert.equal(lines.length, 1);
  const { observation, objectCount } = lines[0];
  assert.deepEqual(observation.objects.map((o: any) => o.id), ["o1", "o2"]);
  assert.equal(objectCount, 7);
  assert.deepEqual(observation.chat.map((m: any) => m.text), ["first", "second"], "oldest first, as in the observation");
  assert.deepEqual(observation.leaderboard, [{ godId: "god", label: "Human", isAI: false, totalPayoff: 3 }]);
  assert.equal(observation.leaderboardWorldSeconds, 12);
  // An object leaving the list drops its subscription.
  push("player:objectIds", { rows: [{ id: "o2", key: 4 }], next: null });
  assert.equal(subs.find(s => s.name === "player:object" && s.args.objectId === "o1")!.live, false);
  assert.ok(!subs.some(s => s.name === "player:observation"), "never the whole observation");
  watch.stop();
  await watch.done;
  assert.ok(subs.every(s => !s.live), "stop drops every subscription");
});
