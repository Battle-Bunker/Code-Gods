/**
 * Live tests against a local engine (scripts/test.mjs starts or reuses one; CG_TEST_SITE_URL is its site URL).
 * Three browser users (alice owns, bob and carol join) sign in through the real login flow; their player apps
 * connect with the device flow through the CLI, and the human approves through the engine as the browser user.
 */
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import type { Id } from "@workspace/engine/convex/_generated/dataModel.js";
import { VERSION } from "../src/protocol.ts";
import { TOKEN_PATH, createEngine, parseEnvFile, tokenHandler } from "../src/engine.ts";
import { envelopeHash, journalPath } from "../src/assistant.ts";
import { SITE, api, appDir, cli, connectAndApprove, parse, signIn, type Browser } from "./helpers.ts";

const TS_INT = { objectType: "Int", typeArgs: { min: -2147483648, max: 2147483647 }, language: "typescript", grammarId: "typescript-agent-v1",
  complexityFunctionId: "ts-ast-bits-v1-uniform", startingObjectCount: 5, spawnRateHz: 0, planningSeconds: 1, agentEnergyPerSecond: 100, agentBatteryActs: 2, interactionRateHz: 20 };
const AGENT = "function agent(x) { return [add(1)]; }";
const envelope = (command: Record<string, unknown>, gameId?: string) => ({ version: VERSION, commandId: randomUUID(), ...(gameId ? { gameId } : {}), command });
const noSecrets = (text: string) => assert.ok(!/cgc_|cgd_|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(text), `a secret leaked: ${text.slice(0, 200)}`);

let alice: Browser, bob: Browser, carol: Browser;
let room: { roomId: Id<"rooms">; shortCode: string };
const apps = { bob: appDir("bob"), carol: appDir("carol"), alice: appDir("alice"), stdout: appDir("stdout") };
let gameId: string | undefined;

before(async () => {
  [alice, bob, carol] = [await signIn("alice"), await signIn("bob"), await signIn("carol")];
  const created = await alice.client.mutation(api.rooms.create, {});
  room = { roomId: created.roomId, shortCode: created.shortCode };
  await bob.client.mutation(api.rooms.join, { room: room.shortCode });
  await carol.client.mutation(api.rooms.join, { room: room.shortCode });
  // The room's settings need its calibration catalog (filled by a scheduled action after create).
  for (let i = 0; ; i++) {
    const r = await alice.client.query(api.rooms.get, { room: room.roomId });
    if (r.utilityCatalog) { await alice.client.action(api.owner.settings, { roomId: room.roomId, revision: r.revision, settings: TS_INT }); break; }
    if (i > 100) throw new Error("catalog never filled");
    await new Promise(res => setTimeout(res, 200));
  }
});
after(async () => {
  // Leave no game loop running on the shared local engine.
  try { await alice.client.mutation(api.rooms.endActiveGame, { roomId: room.roomId }); } catch { /* none running */ }
});

test("connect: device flow with PKCE; --write-env writes both Secrets with mode 0600 and prints no secret", async () => {
  const run = await connectAndApprove(bob, room.shortCode, "act", ["--write-env", apps.bob.envFile], apps.bob.env);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stderr, /\/device\?code=[A-Z0-9]{4}-[A-Z0-9]{4}/);
  noSecrets(run.stdout + run.stderr);
  const out = parse(run);
  assert.equal(out.approved, true);
  assert.equal(out.room, room.shortCode);
  assert.equal(out.permission, "act");
  assert.equal(statSync(apps.bob.envFile).mode & 0o777, 0o600);
  const vars = parseEnvFile(readFileSync(apps.bob.envFile, "utf8"));
  assert.equal(vars.CODE_GODS_ENGINE_URL, SITE);
  assert.match(vars.CODE_GODS_CREDENTIAL, /^cgc_/);
});

test("connect without --write-env prints the two Secrets once, to stdout, with a privacy warning", async () => {
  const run = await connectAndApprove(carol, room.shortCode, "read", [], apps.stdout.env);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  noSecrets(run.stderr);
  assert.equal(run.stdout.match(/cgc_[A-Za-z0-9_-]+/g)?.length, 1, "the credential appears exactly once");
  assert.match(run.stdout, new RegExp(`^CODE_GODS_ENGINE_URL=${SITE.replace(/[.:/]/g, "\\$&")}$`, "m"));
  assert.match(run.stdout, /^CODE_GODS_CREDENTIAL=cgc_[A-Za-z0-9_-]+$/m);
  assert.match(run.stdout, /Keep CODE_GODS_CREDENTIAL private/);
  assert.ok(!existsSync(apps.stdout.envFile), "nothing written without --write-env");
  // Use it the way a dev container does: as secrets in the environment.
  const credential = /^CODE_GODS_CREDENTIAL=(cgc_[A-Za-z0-9_-]+)$/m.exec(run.stdout)![1];
  const status = await cli(["status"], { env: { ...apps.carol.env, CODE_GODS_ENGINE_URL: SITE, CODE_GODS_CREDENTIAL: credential } });
  assert.equal(status.status, 0, status.stdout);
  assert.equal(parse(status).credential.permission, "read");
  writeFileSync(apps.carol.envFile, `CODE_GODS_ENGINE_URL=${SITE}\nCODE_GODS_CREDENTIAL=${credential}\n`, { mode: 0o600 });
});

test("status: engine, credential, room, permission, expiry and the current user", async () => {
  const run = await cli(["status"], { env: apps.bob.env });
  assert.equal(run.status, 0, run.stdout);
  noSecrets(run.stdout);
  const s = parse(run);
  assert.equal(s.ok, true);
  assert.equal(s.engine.reachable, true);
  assert.equal(s.credential.valid, true);
  assert.equal(s.credential.permission, "act");
  assert.equal(s.credential.roomId, room.roomId);
  assert.ok(Date.parse(s.credential.expiresAt) > Date.now() + 6 * 86400_000, "7-day credential");
  assert.equal(s.user.name, "Bob Okafor");
  assert.equal(s.user.scope, "player");
  assert.equal(s.user.labelIsSelfReported, true);
  assert.equal(s.room.code, room.shortCode);
  const missing = await cli(["status"], { env: appDir("none").env });
  assert.equal(missing.status, 1);
  assert.match(parse(missing).error, /CODE_GODS_ENGINE_URL and CODE_GODS_CREDENTIAL/);
});

test("tools and call: the CLI is an MCP client of /mcp with the device credential, filtered by its permission", async () => {
  const tools = parse(await cli(["tools"], { env: apps.bob.env }));
  const names = tools.tools.map((t: { name: string }) => t.name);
  assert.ok(names.includes("summon_agent") && names.includes("get_observation"), names.join());
  assert.ok(!names.includes("start_game"), "an act credential lists no owner tools");
  assert.equal(tools.tools.find((t: { name: string }) => t.name === "get_rules").readOnly, true);
  const who = await cli(["call", "whoami", "{}"], { env: apps.bob.env });
  assert.equal(who.status, 0, who.stdout);
  noSecrets(who.stdout);
  const me = parse(who);
  assert.equal(me.untrusted, true);
  assert.equal(me.data.name, "Bob Okafor");
  assert.equal(me.data.roomCode, room.shortCode);
  assert.equal(me.data.kind, "device");
  const rules = parse(await cli(["call", "get_rules", "-"], { env: apps.bob.env, input: "{}" }));
  assert.match(rules.data.rules, /payoff/);
  const readOnly = parse(await cli(["tools"], { env: apps.carol.env })).tools.map((t: { name: string }) => t.name);
  assert.ok(!readOnly.includes("send_chat"), "a read credential lists no act tools");
  const refused = await cli(["call", "send_chat", JSON.stringify({ text: "carol's read grant must not post" })], { env: apps.carol.env });
  assert.equal(refused.status, 1);
  assert.ok(parse(refused).code, refused.stdout);
  const bad = await cli(["call", "get_events", "not json"], { env: apps.bob.env });
  assert.equal(parse(bad).code, "INVALID");
});

test("panel: push, list and pull a stored panel with the device credential; diagnostics on a syntax error; read cannot push", async () => {
  // The engine keeps panels across runs: a fresh slug per run starts at version 1.
  const slug = `cli-${randomUUID().slice(0, 8)}`;
  const source = `import { definePanel } from "@sdk";\nexport default definePanel({ title: "From the CLI", Component() { return <p>cli</p>; } });\n`;
  writeFileSync(join(apps.bob.dir, "cli-panel.tsx"), source);
  const push = await cli(["panel", "push", slug, "--file", "cli-panel.tsx"], { env: apps.bob.env });
  assert.equal(push.status, 0, push.stdout + push.stderr);
  assert.deepEqual([parse(push).ok, parse(push).slug, parse(push).version], [true, slug, 1]);

  const list = await cli(["panel", "list"], { env: apps.bob.env });
  assert.equal(list.status, 0, list.stdout);
  const listed = parse(list).panels.find((p: { slug: string }) => p.slug === slug);
  assert.equal(listed.title, "From the CLI");
  assert.equal(listed.author.kind, "device");

  const pull = await cli(["panel", "pull", slug, "--file", "pulled.tsx"], { env: apps.bob.env });
  assert.equal(pull.status, 0, pull.stdout);
  assert.equal(readFileSync(join(apps.bob.dir, "pulled.tsx"), "utf8"), source);
  const again = await cli(["panel", "pull", slug, "--file", "pulled.tsx"], { env: apps.bob.env });
  assert.equal(again.status, 1, "pull never overwrites without --force");
  assert.match(parse(again).error, /--force/);

  writeFileSync(join(apps.bob.dir, "broken.tsx"), `export default (\n`);
  const broken = await cli(["panel", "push", slug, "--file", "broken.tsx"], { env: apps.bob.env });
  assert.equal(broken.status, 1);
  assert.equal(parse(broken).ok, false);
  assert.equal(typeof parse(broken).diagnostics[0].line, "number");

  const reader = await cli(["panel", "push", slug, "--file", join(apps.bob.dir, "cli-panel.tsx")], { env: apps.carol.env });
  assert.equal(reader.status, 1);
  assert.equal(parse(reader).code, "FORBIDDEN");
  await bob.client.mutation(api.panels.remove, { slug });
});

test("owner: room-command needs an owner credential; with one, start works", async () => {
  const start = JSON.stringify({ action: "start", requestId: randomUUID() });
  const refused = await cli(["assistant", "room-command"], { env: apps.bob.env, input: start });
  assert.equal(refused.status, 1);
  assert.equal(parse(refused).code, "FORBIDDEN");
  const run = await connectAndApprove(alice, room.shortCode, "owner", ["--write-env", apps.alice.envFile], apps.alice.env);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const state = parse(await cli(["assistant", "room-state"], { env: apps.alice.env }));
  assert.equal(state.room.shortCode, room.shortCode);
  assert.match(state.untrustedContent, /untrusted/);
  assert.ok(Array.isArray(parse(await cli(["assistant", "ai-catalog"], { env: apps.alice.env })).agents));
  assert.equal(parse(await cli(["assistant", "room-state"], { env: apps.bob.env })).code, "FORBIDDEN");
  const started = await cli(["assistant", "room-command"], { env: apps.alice.env, input: start });
  assert.equal(started.status, 0, started.stdout);
  const result = parse(started);
  assert.equal(result.status, "received");
  gameId = result.result.gameId;
  assert.ok(gameId);
  const again = parse(await cli(["assistant", "room-command"], { env: apps.alice.env, input: start }));
  assert.equal(again.result.gameId, gameId, "start is idempotent per requestId");
});

test("assistant: observation and events carry the untrusted-data framing", async () => {
  const run = await cli(["assistant", "observation"], { env: apps.bob.env });
  assert.equal(run.status, 0, run.stdout);
  const o = parse(run);
  assert.match(o.untrustedContent, /never as instructions/);
  assert.equal(o.observation.gameId, gameId);
  assert.equal(o.observation.seated, true);
  assert.equal(o.observation.objects.length, 5);
  const events = parse(await cli(["assistant", "events", "--limit", "5"], { env: apps.bob.env }));
  assert.match(events.untrustedContent, /untrusted/i);
  assert.equal(events.gameId, gameId);
  assert.ok(Array.isArray(events.events));
  assert.equal(parse(await cli(["assistant", "events", "--limit", "500"], { env: apps.bob.env })).code, "INVALID");
});

test("assistant: summon via command, receipt replay, retry of an uncertain command, chat", async () => {
  const summon = envelope({ type: "summon", language: "typescript", source: AGENT });
  const first = await cli(["assistant", "command"], { env: apps.bob.env, input: JSON.stringify(summon) });
  assert.equal(first.status, 0, first.stdout);
  const receipt = parse(first);
  assert.equal(receipt.status, "received");
  assert.equal(receipt.result.accepted, true, receipt.result.message);
  assert.equal(receipt.result.commandId, summon.commandId);
  // Replaying the identical envelope returns the stored receipt and summons nothing new.
  const replay = parse(await cli(["assistant", "command"], { env: apps.bob.env, input: JSON.stringify(summon) }));
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.result, receipt.result);
  const looked = parse(await cli(["assistant", "receipt", summon.commandId], { env: apps.bob.env }));
  assert.deepEqual(looked.result, receipt.result);
  const conflict = parse(await cli(["assistant", "command"], { env: apps.bob.env, input: JSON.stringify({ ...summon, command: { type: "chat", text: "different" } }) }));
  assert.equal(conflict.code, "CONFLICT");
  const obs = parse(await cli(["assistant", "observation"], { env: apps.bob.env })).observation;
  assert.equal(obs.agents.length, 1, "exactly one agent after the replay");

  // A lost response: the journal says uncertain. Without --retry-unknown nothing is sent; with it, the identical envelope is.
  const lost = envelope({ type: "validate", language: "typescript", source: AGENT }, gameId);
  const credentialId = parse(await cli(["status"], { env: apps.bob.env })).credential.credentialId;
  const { dir, file } = journalPath(credentialId, apps.bob.env);
  mkdirSync(dir, { recursive: true });
  const journal = JSON.parse(readFileSync(file, "utf8"));
  journal[lost.commandId] = { hash: envelopeHash(lost as never), gameId, status: "uncertain", at: Date.now() };
  writeFileSync(file, JSON.stringify(journal));
  const unknown = parse(await cli(["assistant", "command"], { env: apps.bob.env, input: JSON.stringify(lost) }));
  assert.equal(unknown.status, "uncertain");
  assert.match(unknown.message, /--retry-unknown/);
  assert.equal(parse(await cli(["assistant", "receipt", lost.commandId], { env: apps.bob.env })).status, "not_found");
  const retried = parse(await cli(["assistant", "command", "--retry-unknown"], { env: apps.bob.env, input: JSON.stringify(lost) }));
  assert.equal(retried.status, "received");
  assert.equal(retried.result.accepted, true);

  const chat = parse(await cli(["assistant", "command"], { env: apps.bob.env, input: JSON.stringify(envelope({ type: "chat", text: "hello from bob's assistant" })) }));
  assert.equal(chat.result.accepted, true, chat.result.message);
  const seen = parse(await cli(["assistant", "observation"], { env: apps.carol.env })).observation;
  assert.ok(seen.chat.some((m: { text: string }) => m.text === "hello from bob's assistant"));
});

test("a read credential is refused for commands and wake", async () => {
  const refused = await cli(["assistant", "command"], { env: apps.carol.env, input: JSON.stringify(envelope({ type: "chat", text: "should not send" })) });
  assert.equal(refused.status, 1);
  assert.equal(parse(refused).code, "FORBIDDEN");
  assert.equal(parse(await cli(["assistant", "wake"], { env: apps.carol.env })).code, "FORBIDDEN");
  assert.equal(parse(await cli(["assistant", "wake"], { env: apps.bob.env })).wakeRequested, true);
});

test("state: a JSON dump of observation, events, myUtility and trajectories; --watch streams lines", async () => {
  // Let the game run a few ticks so the event log and trajectories have content.
  for (let i = 0; i < 50; i++) {
    const s = parse(await cli(["state"], { env: apps.bob.env }));
    if (s.observation.phase === "running" && s.events.latestCursor >= 1) break;
    await new Promise(r => setTimeout(r, 500));
  }
  const run = await cli(["state", "--pretty", "--objects", "2"], { env: apps.bob.env });
  assert.equal(run.status, 0, run.stdout);
  assert.match(run.stdout, /^\{\n  "roomId"/, "pretty-printed");
  noSecrets(run.stdout);
  const s = parse(run);
  assert.equal(s.observation.objects.length, 2);
  assert.match(s.untrustedContent, /Untrusted game data/);
  assert.equal(s.myUtility.godId, bob.subject);
  assert.equal(s.myUtility.gameId, gameId);
  assert.ok(Array.isArray(s.events.events));
  assert.ok(s.trajectories.objects.length <= 2);

  const watch = await cli(["state", "--watch", "5", "--count", "2", "--objects", "1"], { env: apps.bob.env });
  assert.equal(watch.status, 0, watch.stdout + watch.stderr);
  const lines = watch.stdout.trim().split("\n").map(line => JSON.parse(line));
  assert.equal(lines.length, 2);
  assert.ok(lines.every(l => l.observation.objects.length === 1 && l.roomId === room.roomId));
  assert.ok(lines[1].at - lines[0].at >= 150, "throttled to at most 5 lines per second");
});

test("token middleware against the engine: a launched same-origin browser gets a JWT, cross-site is refused", async () => {
  const handler = tokenHandler({ engine: createEngine({ env: {}, envFile: apps.bob.envFile }), launchKey: randomUUID() });
  const server = createServer((req, res) => handler(req, res));
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const cookie = (await fetch(handler.launchUrl(base), { redirect: "manual" })).headers.get("set-cookie")!.split(";")[0];
  try {
    const cross = await fetch(base + TOKEN_PATH, { headers: { "sec-fetch-site": "cross-site", origin: "https://evil.example", cookie } });
    assert.equal(cross.status, 403);
    assert.equal(cross.headers.get("cache-control"), "no-store");
    noSecrets(await cross.text());
    const same = await fetch(base + TOKEN_PATH, { headers: { "sec-fetch-site": "same-origin", cookie } });
    assert.equal(same.status, 200);
    assert.equal(same.headers.get("cache-control"), "no-store");
    const body = await same.json();
    assert.equal(body.roomId, room.roomId);
    assert.equal(body.permission, "act");
    assert.match(body.convexUrl, /^http/);
    assert.ok(body.expiresAt > Date.now() + 8 * 60_000);
    // The browser token works with the Convex client exactly like the app's own calls.
    const { ConvexHttpClient } = await import("convex/browser");
    const browser = new ConvexHttpClient(body.convexUrl);
    browser.setAuth(body.token);
    assert.equal((await browser.query(api.auth.user.me, {}))!.name, "Bob Okafor");
  } finally { server.close(); }
});

test("disconnect revokes the credential at the engine and forgets it locally", async () => {
  const engine = createEngine({ env: {}, envFile: apps.bob.envFile });
  await engine.token();
  const run = await cli(["assistant", "disconnect"], { env: apps.bob.env });
  assert.equal(run.status, 0, run.stdout);
  const out = parse(run);
  assert.equal(out.remoteRevocation, "confirmed");
  assert.match(out.forgotten, /Removed CODE_GODS_CREDENTIAL/);
  const vars = parseEnvFile(readFileSync(apps.bob.envFile, "utf8"));
  assert.equal(vars.CODE_GODS_CREDENTIAL, undefined);
  assert.equal(vars.CODE_GODS_ENGINE_URL, SITE, "the engine URL stays");
  // The engine refuses the old credential immediately, even its still-unexpired JWT.
  await assert.rejects(engine.token({ force: true }), /^EngineError: reconnect: /);
  await assert.rejects(engine.query(api.player.observation, { roomId: room.roomId }));
  const status = await cli(["status"], { env: apps.bob.env });
  assert.equal(status.status, 1);
});
