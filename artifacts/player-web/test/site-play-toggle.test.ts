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
    (_spectator, godId) => godId ?? "me", 800, () => clock);
  const first = send(false);
  assert.equal(await send(true), undefined, "a second click while the first is in flight sends nothing");
  release(); await first;
  clock += 300;
  assert.equal(await send(true), undefined, "nor does one just after the room updated and the label flipped");
  assert.deepEqual(sent, [[false, "me"]]);
  const other = send(true, "bob");
  assert.deepEqual(sent, [[false, "me"], [true, "bob"]], "another member's toggle is its own");
  release(); await other;
  clock += 801;
  const later = send(true);
  release(); await later;
  assert.deepEqual(sent, [[false, "me"], [true, "bob"], [true, "me"]], "a deliberate later click toggles as before");
  // A failed call frees the control too.
  const failing = oncePerKey(async () => { throw new Error("refused"); }, () => "k", 0, () => clock);
  await assert.rejects(failing());
  await assert.rejects(failing(), "not stuck busy after a failure");
});
