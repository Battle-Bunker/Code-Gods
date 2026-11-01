// Guard: engine tests must not read a game straight off an owner start.
//
// `owner.start` (and the MCP `start_game` tool) returns `{ status: "preparing" }` with no gameId when the random
// deal draws a calibration table this deployment has not computed yet; the game begins by itself later. A test that
// reads `.gameId` (or `.shortCode`) off the start result, or drops the result and carries on as if the game were
// live, flakes whenever the deal is unlucky. Use `startGame` / `startedGame` from test/game-helpers.ts instead.
//
// game-preparing.test.ts tests the preparing protocol itself and is exempt. Elsewhere, a line that reads a start
// result on purpose, after the game is known to have begun, says why in a `start-result-ok: <reason>` comment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TEST_DIR = join(import.meta.dirname, "..");
const EXEMPT = new Set(["game-preparing.test.ts"]);
const START_CALL = /api\.owner\.start\b|["']start_game["']/;
const OK = /start-result-ok: \S/;

/** The problems in one file's source: one message per offending line. */
export function startResultProblems(source: string): string[] {
  const lines = source.split("\n");
  const lineAt = (offset: number) => source.slice(0, offset).split("\n").length;
  const problems: string[] = [];
  const report = (line: number, why: string) => { if (!OK.test(lines[line - 1])) problems.push(`line ${line}: ${lines[line - 1].trim()} (${why})`); };
  // Each start call, with the statement text before it (back to the last `;`, `{` or `}` at a line end) and after it.
  const bound = new Set<string>();
  for (const call of source.matchAll(new RegExp(START_CALL, "g"))) {
    const line = lineAt(call.index);
    const before = source.slice(0, call.index).split(/[;{}]\s*\n/).at(-1)!;
    const after = source.slice(call.index + call[0].length).split(/;\s*\n/)[0];
    const binding = before.match(/\b(?:const|let|var)\s+(\w+|\{[^}]*\})\s*=\s*await\b/);
    if (binding?.[1].startsWith("{")) report(line, "destructures the start result, which may be preparing");
    else if (binding) bound.add(binding[1]);
    else if (/^\s*await\b/.test(before)) report(line, "the start result is dropped; the game may still be preparing");
    if (/\)\s*\)?[\w.?!]*(\.|\[["'])(gameId|shortCode)\b/.test(after) || /\.then\(/.test(after)) report(line, "reads the game straight off the start result");
  }
  for (const name of bound) {
    const read = new RegExp(`\\b${name}\\b[\\w.?!]*(\\.|\\[["'])(gameId|shortCode)\\b`);
    lines.forEach((text, i) => { if (read.test(text)) report(i + 1, `\`${name}\` is a start result, which may be preparing`); });
  }
  return problems;
}

test("the guard catches each way of reading a game off a start, and passes the helper", () => {
  assert.equal(startResultProblems("const game = await host.c.action(api.owner.start, { roomId });\nraw(game.gameId);").length, 1);
  assert.equal(startResultProblems("view(game1.shortCode);\nconst game1 = await host.c.action(api.owner.start, { roomId, requestId });").length, 1);
  assert.equal(startResultProblems("const id = (await host.c.action(api.owner.start, { roomId })).gameId;").length, 1);
  assert.equal(startResultProblems("  await lia.c.action(api.owner.start, { roomId });").length, 1);
  assert.equal(startResultProblems('const started = await call(owner.token, "start_game", {});\nraw(started.data.result.gameId);').length, 1);
  assert.equal(startResultProblems("const { gameId } = await host.c.action(api.owner.start, { roomId });").length, 1);
  assert.equal(startResultProblems("foo();\nconst game = await host.c.action(\n  api.owner.start, { roomId });\nraw(game.gameId);").length, 1);
  assert.equal(startResultProblems('const game = await host.c.action(api.owner.start, { roomId });\nraw(game["gameId"]);').length, 1);
  assert.equal(startResultProblems("const id = await host.c.action(api.owner.start, { roomId }).then(r => r.gameId);").length, 1);
  assert.deepEqual(startResultProblems("const game = await startGame(host, roomId);\nraw(game.gameId);"), []);
  assert.deepEqual(startResultProblems("assert.match(await rejects(host.c.action(api.owner.start, { roomId })), /owner/i);"), []);
  assert.deepEqual(startResultProblems("const started = await host.c.action(api.owner.start, { roomId });\nconst game = await startedGame(host, roomId, started);"), []);
  assert.deepEqual(startResultProblems('const started = await call(owner.token, "start_game", {});\nconst game = await startedGame(host, roomId, started.data.result);'), []);
  assert.deepEqual(startResultProblems("const again = await host.c.action(api.owner.start, { roomId });\nuse(again.gameId); // start-result-ok: the game began above"), []);
  assert.equal(startResultProblems("const again = await host.c.action(api.owner.start, { roomId });\nuse(again.gameId); // start-result-ok:").length, 1, "the exemption needs a reason");
});

test("no engine test reads a game straight off an owner start", () => {
  const files = readdirSync(TEST_DIR).filter(f => f.endsWith(".test.ts") && !EXEMPT.has(f));
  assert.ok(files.length > 10, `found the engine tests in ${TEST_DIR}`);
  const problems = files.flatMap(f => startResultProblems(readFileSync(join(TEST_DIR, f), "utf8")).map(p => `${f} ${p}`));
  assert.deepEqual(problems, [], `use startGame/startedGame from test/game-helpers.ts:\n${problems.join("\n")}`);
});
