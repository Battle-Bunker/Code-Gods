/**
 * Play or watch the next game: the room page has two controls for it (the step link under the status line, StepAction
 * "rooms.setSpectator", and the small Play / Watch button beside your name in Members). Both must seat a watching
 * owner with one click: the step's command sends setSpectator(false) for the viewer, and its label says what a click does.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { engineCommands, paletteContextFor, type EngineActions, type EngineScope } from "../src/site/lib/commands.ts";
import { nextStep } from "../src/site/lib/next-step.ts";

const calls: [boolean, string | undefined][] = [];
const act = new Proxy({ setSpectator: async (spectator: boolean, godId?: string) => { calls.push([spectator, godId]); } } as Partial<EngineActions>, {
  get: (target, key) => (key in target ? (target as Record<string | symbol, unknown>)[key] : () => undefined),
}) as EngineActions;
const ada = { id: "ada", name: "Ada Lovelace", isAdmin: false };
const room = (spectator: boolean, extra: Partial<NonNullable<EngineScope["room"]>> = {}): NonNullable<EngineScope["room"]> => ({
  id: "r1", shortCode: "K7QX", ownerId: "ada", ownerName: "Ada Lovelace", aiEnabled: true, aiQuota: 300_000, assistantQuota: 300_000, activeGame: null,
  members: [{ id: "ada", name: "Ada", kind: "human", ready: false, spectator }, { id: "bob", name: "Bob", kind: "human", ready: false }, { id: "cy", name: "Cy", kind: "human", ready: false }],
  ...extra,
});
const scope = (r: NonNullable<EngineScope["room"]>): EngineScope => ({ user: ada, minPlayers: 3, maxPlayers: 8, aiConfigured: true, room: r });
const toggle = (s: EngineScope) => engineCommands(s, act).find(c => c.id === "rooms.setSpectator")!;

test("a watching owner with two friends: the step offered is Play the next game, and one click seats them", async () => {
  const s = scope(room(true));
  const step = nextStep("ada", s.room! as Parameters<typeof nextStep>[1], { minPlayers: 3, maxPlayers: 8 });
  assert.match(step.status, /1 more player needed; you're watching/);
  assert.ok([step.primary, ...step.secondary].includes("rooms.setSpectator"), "the status line offers the toggle");
  const c = toggle(s);
  assert.equal(c.human.title, "Play the next game");
  assert.deepEqual(c.available(paletteContextFor(s)), { ok: true });
  assert.equal(c.performer.kind, "submit");
  calls.length = 0;
  await (c.performer as { run(): Promise<unknown> }).run();
  assert.deepEqual(calls, [[false, undefined]], "plays, for the viewer themself");
});

test("once seated the same control says Watch the next game and a click un-seats", async () => {
  const s = scope(room(false));
  const c = toggle(s);
  assert.equal(c.human.title, "Watch the next game");
  calls.length = 0;
  await (c.performer as { run(): Promise<unknown> }).run();
  assert.deepEqual(calls, [[true, undefined]]);
});

test("the toggle says why it is off while the next game is preparing, instead of doing nothing", () => {
  const s = scope(room(true, { preparing: { ready: 1, total: 4 } } as never));
  const a = toggle(s).available(paletteContextFor(s));
  assert.equal(a.ok, false);
  assert.match((a as { reason: string }).reason, /preparing/);
});

test("a double click on Play the next game seats the player once: the second click is dropped, a later one works", async () => {
  const { oncePerKey } = await import("../src/site/lib/click-once.ts");
  let clock = 1000;
  const sent: [boolean, string][] = [];
  let release: () => void = () => {};
  const send = oncePerKey((spectator: boolean, godId?: string) => new Promise<void>(done => { sent.push([spectator, godId ?? "me"]); release = done; }),
    (_spectator, godId) => godId ?? "me", spectator => spectator, 800, () => clock);
  const first = send(false);
  clock += 100;
  assert.equal(await send(false), undefined, "the same click again while the first is in flight sends nothing");
  release(); await first;
  clock += 200;
  assert.equal(await send(true), undefined, "nor does the second click of a double click, made on the label that just flipped");
  assert.deepEqual(sent, [[false, "me"]]);
  const other = send(true, "bob");
  assert.deepEqual(sent, [[false, "me"], [true, "bob"]], "another member's toggle is its own");
  release(); await other;
  clock += 801;
  const later = send(true);
  release(); await later;
  assert.deepEqual(sent, [[false, "me"], [true, "bob"], [true, "me"]], "a deliberate later click toggles as before");
});

test("a deliberate toggle the other way is not swallowed because the first call settled a moment ago", async () => {
  const { oncePerKey } = await import("../src/site/lib/click-once.ts");
  let clock = 1000;
  const sent: boolean[] = [];
  let release: () => void = () => {};
  const send = oncePerKey((spectator: boolean) => new Promise<void>(done => { sent.push(spectator); release = done; }), () => "me", spectator => spectator, 800, () => clock);
  // A slow call: the click was 2 s ago, the room updated just now, and the player clicks the new label at once.
  const first = send(false);
  clock += 2000;
  release(); await first;
  clock += 100;
  const back = send(true);
  assert.deepEqual(sent, [false, true], "sent: the quiet period runs from the click, not from the call settling");
  release(); await back;
  // The other value while the first is still in flight, long after the click: also deliberate.
  clock += 5000;
  const slow = send(false);
  clock += 900;
  const meanwhile = send(true);
  assert.deepEqual(sent, [false, true, false, true]);
  assert.equal(await send(true), undefined, "but the same value twice in flight is one call");
  release(); await meanwhile; void slow;
});

test("after a failed call nothing is dropped: the player retries at once", async () => {
  const { oncePerKey } = await import("../src/site/lib/click-once.ts");
  const clock = 1000;
  let calls = 0;
  const failing = oncePerKey(async (_spectator: boolean) => { calls++; throw new Error("refused"); }, () => "k", spectator => spectator, 800, () => clock);
  await assert.rejects(failing(false));
  await assert.rejects(failing(false), "the same click again, in the same instant, is sent");
  await assert.rejects(failing(true), "and so is the other way");
  assert.equal(calls, 3);
  const throwing = oncePerKey((): Promise<void> => { throw new Error("offline"); }, () => "k", () => 0, 800, () => clock);
  await assert.rejects(throwing());
  await assert.rejects(throwing(), "a call that throws before it starts frees the control too");
});
