/** The parity test (integration plan §2.5): fails if any operation is reachable from one surface and not the others. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod/v4";
import { DIRECTORY, GENERATORS, affordance, parityProblems, type AnyAffordance } from "../src/index.ts";

const extra = (over: Partial<AnyAffordance>): AnyAffordance => ({
  ...affordance({
    id: "test.thing", title: "Do a thing", description: "Does a thing.", tooltip: "A thing.", keywords: ["thing"], group: "play",
    scope: "game", params: z.object({}).strict(), result: z.object({}), contexts: ["live"], caller: "seated",
    effect: "read", confirm: "none", runs: "server",
  }),
  ...over,
} as AnyAffordance);

test("the directory has parity: every operation on every surface, the same offer everywhere, sound declarations", () => {
  assert.deepEqual(parityProblems(), []);
  assert.ok(DIRECTORY.length >= 40);
});

test("an exemption other than consent is refused", () => {
  const dir = [...DIRECTORY, extra({ surfaces: { except: ["mcp"], because: "laziness" as "consent" } })];
  const p = parityProblems(dir);
  assert.ok(p.includes("check 1: test.thing declares an exemption other than consent"), p.join("\n"));
  assert.ok(p.includes("check 1: test.thing is not reachable from the mcp"));
});

test("an operation offered in no context reaches no surface", () => {
  const p = parityProblems([...DIRECTORY, extra({ contexts: [] })]);
  assert.ok(p.includes("check 5: test.thing is offered in no context"));
  assert.ok(p.includes("check 1: test.thing is not reachable from the assistant"));
  assert.ok(p.includes("check 1: test.thing is not reachable from the palette"));
});

test("a generator that drops an operation breaks parity", () => {
  const p = parityProblems(DIRECTORY, { ...GENERATORS, mcp: (ctx, dir) => GENERATORS.mcp(ctx, dir).filter(n => n !== "agent_summon") });
  assert.ok(p.some(x => x.startsWith("check 4: in live as seated, the surfaces differ on agent_summon")), p.join("\n"));
  assert.ok(p.includes("check 1: agent.summon is not reachable from the mcp"));
});

test("a CLI that misses an operation breaks parity", () => {
  const p = parityProblems(DIRECTORY, { ...GENERATORS, cli: dir => GENERATORS.cli(dir).filter(n => n !== "game_end") });
  assert.deepEqual(p, ["check 1: game.end is not reachable from the cli"]);
});

test("unsound declarations are named", () => {
  const p = parityProblems([...DIRECTORY,
    extra({ id: "test.boom", effect: "destructive", confirm: "none" }),
    extra({ id: "test.spend", effect: "write", spends: "energy", confirm: "none" }),
    extra({ id: "Bad id", title: "lower case title that is also far too long to fit in sixty characters", keywords: [] }),
    extra({ id: "game.end" }),
  ]);
  for (const want of [
    "check 5: test.boom is destructive but does not confirm",
    "check 5: test.spend spends energy but does not confirm",
    "check 5: test.spend writes on the server but takes no requestId",
    'check 5: Bad id is not "namespace.verb"',
    "check 5: Bad id needs keywords of 1–40 characters",
    "check 5: duplicate id game.end",
  ]) assert.ok(p.includes(want), `${want}\n in\n${p.join("\n")}`);
  assert.ok(p.some(x => x.startsWith("check 5: Bad id title")));
});
