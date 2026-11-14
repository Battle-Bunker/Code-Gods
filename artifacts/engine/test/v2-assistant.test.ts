/**
 * The in-client assistant on v2 (W3-7) on the live local backend with the offline mock model (AI_MOCK=1): a message
 * starts a turn whose tool calls run through the directory as the human's delegate, a server operation and a view
 * operation alike, and the spend counts against the human's allowance; read-only mode offers read tools only; a
 * message sent while a turn runs waits and starts the next turn; a Stop holds what waits; autopilot plays while the
 * game runs; a conversation is its human's only; the assistant cannot drive its own conversation.
 *
 * What would break: a tool call that bypasses the directory or the human's rights, an unrecorded spend, a write in
 * read-only mode, a lost or reordered queued message, another human reading the transcript.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform, type Human } from "./v2-helpers.ts";

let ada: Human, bo: Human, roomId: string, gameId: string, adaMember: string;
const mock = (steps: unknown[]) => `/mock ${JSON.stringify(steps)}`;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

before(async () => {
  [ada, bo] = await humans("Assist Ada", "Assist Bo");
  const created = await perform(ada!, "room.create", { name: "Assistant room" });
  roomId = created.result.roomId;
  await perform(bo!, "room.join", { code: created.result.code });
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  await perform(ada!, "room.settings", { overrides: { planningSeconds: 600, worldSeconds: 600 } }, { roomId });
  gameId = (await perform(ada!, "game.start", {}, { roomId })).result.gameId;
  adaMember = (await ada!.query("v2/rooms:get", { roomId })).members.find((m: any) => m.me).memberId;
});

/** Waits until the human's latest turn has ended; returns it with its tool calls. */
async function settled(h: Human, turnId: string) {
  for (let i = 0; ; i++) {
    const t = await h.query("v2/assistant:turn", { turnId });
    if (t && !["running", "cancelling"].includes(t.status)) return t;
    assert.ok(i < 120, `turn ${turnId} ended`);
    await sleep(250);
  }
}
const messages = async (h: Human, threadId: string) =>
  (await h.query("v2/assistant:transcript", { threadId, paginationOpts: { numItems: 30, cursor: null } })).page.reverse();

test("a turn: a server operation and a view operation as the human, its words kept, its spend counted", { timeout: 60_000 }, async () => {
  const sent = await perform(ada!, "assistant.send", { text: mock([
    { text: "Reading your rule.", tools: [{ name: "rule_explain", input: {} }, { name: "view_pinRepresentation", input: { rep: "cart" } }] },
    { text: "Your rule rewards gentle slopes." },
  ]) }, { roomId });
  assert.equal(sent.ok, true, JSON.stringify(sent));
  assert.equal(sent.result.queued, false);
  const turn = await settled(ada!, sent.result.turnId);
  assert.equal(turn.status, "done", JSON.stringify(turn));
  assert.deepEqual(turn.calls.map((c: any) => [c.tool, c.ok]), [["rule_explain", true], ["view_pinRepresentation", true]], JSON.stringify(turn.calls));
  assert.equal((await ada!.query("v2/layout:current", { roomId })).view.pins["*"], "cart", "the view operation reached Ada's layout");
  const said = await messages(ada!, sent.result.threadId);
  assert.deepEqual(said.map((m: any) => m.role), ["user", "assistant", "assistant"]);
  assert.equal(said.at(-1).text, "Your rule rewards gentle slopes.");
  const used = await admin.query("v2/testing:aiUsage", { gameId, memberId: adaMember });
  assert.ok(used.calls === 2 && used.tokens > 0, JSON.stringify(used));
  const status = await ada!.query("v2/assistant:status", { roomId });
  assert.equal(status.allowance.usedTokens, used.tokens);
  // The next message continues the thread, with the earlier exchange as history.
  const again = await perform(ada!, "assistant.send", { text: mock([{ text: "Still here." }]) }, { roomId });
  assert.equal(again.result.threadId, sent.result.threadId);
  await settled(ada!, again.result.turnId);
});

test("another human cannot read the conversation; the assistant cannot drive its own", async () => {
  const [thread] = await ada!.query("v2/assistant:threads", { roomId });
  assert.deepEqual((await messages(bo!, thread.threadId)), []);
  assert.equal(await bo!.query("v2/assistant:turn", { turnId: (await ada!.query("v2/assistant:status", { roomId })).turn.turnId }), null);
  const delegate = { userId: ada!.userId, roomId, grant: "act", via: "assistant" };
  try { await admin.mutation("v2/ops/assistant:sendAs", { args: { text: "loop" }, roomId, delegate }); assert.fail("refused"); } catch (e) {
    assert.match((e as any).data?.error?.message ?? "", /cannot run its own conversation/);
  }
});

test("a connection passing a message on cannot lend the assistant more rights than its own", { timeout: 60_000 }, async () => {
  assert.equal((await perform(ada!, "assistant.setMode", { mode: "onRequest", grant: "owner", ownerConsent: true }, { roomId })).result.grant, "owner");
  const as = (grant: string, text: string) => admin.mutation("v2/ops/assistant:sendAs", { args: { text }, roomId, delegate: { userId: ada!.userId, roomId, grant, via: "mcp" } });
  assert.equal((await as("read", "hello")).error.code, "refused", "a read connection sends nothing");
  const sent = await as("act", mock([{ tools: [{ name: "game_end", input: {} }] }, { text: "ok" }]));
  assert.equal(sent.ok, true, JSON.stringify(sent));
  const turn = await settled(ada!, sent.result.turnId);
  assert.deepEqual(turn.calls, [], "the turn ran with the connection's act rights: an owner's tool is not even offered");
  assert.equal((await ada!.query("v2/games:header", { gameId })).phase, "planning");
  assert.equal((await ada!.query("v2/assistant:status", { roomId })).grant, "owner", "the human's own choice is unchanged");
  await perform(ada!, "assistant.setMode", { mode: "onRequest", grant: "act" }, { roomId });
});

test("a Stop right after a send ends the turn rather than leaving it busy", { timeout: 60_000 }, async () => {
  const sent = await perform(ada!, "assistant.send", { text: mock([{ text: "never mind" }]) }, { roomId });
  await perform(ada!, "assistant.cancel", {}, { roomId });
  assert.ok(["cancelled", "done"].includes((await settled(ada!, sent.result.turnId)).status));
});

test("read-only mode offers read tools only; owner rights need consent", { timeout: 60_000 }, async () => {
  try { await perform(bo!, "assistant.setMode", { mode: "onRequest", grant: "owner", ownerConsent: true }, { roomId }); assert.fail("not the owner"); } catch (e) {
    assert.equal((e as any).data?.error?.code, "failed");
  }
  assert.equal((await perform(ada!, "assistant.setMode", { mode: "readOnly" }, { roomId })).ok, true);
  const sent = await perform(ada!, "assistant.send", { text: mock([{ tools: [{ name: "agent_destroy", input: { agentId: "x" } }, { name: "rule_explain", input: {} }] }, { text: "ok" }]) }, { roomId });
  const turn = await settled(ada!, sent.result.turnId);
  assert.equal(turn.status, "done");
  assert.deepEqual(turn.calls.map((c: any) => c.tool), ["rule_explain"], "a write tool is not offered in read-only mode");
  await perform(ada!, "assistant.setMode", { mode: "onRequest" }, { roomId });
});

test("a message sent while a turn runs waits and goes next; a Stop holds what waits", { timeout: 90_000 }, async () => {
  // agent.check runs the sandbox: long enough for a second message to arrive while it runs.
  const slow = (n: number) => mock(Array.from({ length: n }, () => ({ tools: [{ name: "agent_check", input: { language: "python", source: "def agent(offer):\n  return []\n" } }] })));
  const first = await perform(ada!, "assistant.send", { text: slow(3) }, { roomId });
  const second = await perform(ada!, "assistant.send", { text: mock([{ text: "second answered" }]) }, { roomId });
  assert.equal(second.result.queued, true, "it waits while the first runs");
  const third = await perform(ada!, "assistant.send", { text: "third" }, { roomId });
  await perform(ada!, "assistant.editQueued", { queueId: second.result.queueId, text: mock([{ text: "second, edited" }]) }, { roomId });
  await perform(ada!, "assistant.removeQueued", { queueId: third.result.queueId }, { roomId });
  await settled(ada!, first.result.turnId);
  for (let i = 0; ; i++) {
    const said = await messages(ada!, first.result.threadId);
    if (said.at(-1)?.text === "second, edited") break;
    assert.ok(i < 80, "the waiting message started the next turn, as edited");
    await sleep(250);
  }
  assert.ok(!(await messages(ada!, first.result.threadId)).some((m: any) => m.text === "third"), "the removed one never went");

  const busy = await perform(ada!, "assistant.send", { text: slow(6) }, { roomId });
  const waiting = await perform(ada!, "assistant.send", { text: mock([{ text: "after the stop" }]) }, { roomId });
  assert.equal((await perform(ada!, "assistant.cancel", {}, { roomId })).result.status, "stopping");
  assert.equal((await settled(ada!, busy.result.turnId)).status, "cancelled");
  const held = (await ada!.query("v2/assistant:status", { roomId })).queued;
  assert.deepEqual(held.map((q: any) => [q.queueId, q.held]), [[waiting.result.queueId, true]], "held, not sent");
  const resumed = await perform(ada!, "assistant.sendQueued", {}, { roomId });
  assert.equal((await settled(ada!, resumed.result.turnId)).status, "done");
  assert.equal((await messages(ada!, busy.result.threadId)).at(-1).text, "after the stop");
});

test("autopilot chosen before a game plays once its world runs", { timeout: 90_000 }, async () => {
  await perform(ada!, "game.end", {}, { gameId });
  assert.equal((await perform(bo!, "assistant.setMode", { mode: "autopilot" }, { roomId })).ok, true, "chosen between games");
  gameId = (await perform(ada!, "game.start", {}, { roomId })).result.gameId;
  await perform(ada!, "game.ready", { ready: true }, { gameId });
  await perform(bo!, "game.ready", { ready: true }, { gameId });
  for (let i = 0; ; i++) {
    const t = (await bo!.query("v2/assistant:status", { roomId })).turn;
    if (t?.autopilot && !["running", "cancelling"].includes(t.status)) { assert.equal(t.status, "done", JSON.stringify(t)); break; }
    assert.ok(i < 120, "an autopilot turn ran");
    await sleep(250);
  }
  await perform(bo!, "assistant.setMode", { mode: "onRequest" }, { roomId });
  await perform(ada!, "game.end", {}, { gameId });
});
