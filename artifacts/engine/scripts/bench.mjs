#!/usr/bin/env node
/**
 * Engine throughput benchmark against the local backend (npx convex dev on 3210, DEV=1).
 *
 *   node scripts/bench.mjs [--language typescript|python] [--agents 12] [--rate 100] [--seconds 30] [--objects 80] [--type Int|Grid]
 *
 * Starts a 3-god game, summons K agents with energy that never binds (so the interaction cap and the
 * engine's capacity are what limit), runs it for the given time and reports sustained acts/s, commit
 * latency, window size (acts and world seconds per commit), simulate time and discarded windows.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const api = anyApi, internal = anyApi;
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const language = arg("language", "typescript"), K = Number(arg("agents", 12)), rate = Number(arg("rate", 100));
const seconds = Number(arg("seconds", 30)), objects = Number(arg("objects", 80)), type = arg("type", "Int");

const root = fileURLToPath(new URL("..", import.meta.url));
const config = JSON.parse(readFileSync(`${root}/.convex/local/default/config.json`, "utf8"));
const url = process.env.CONVEX_URL ?? `http://127.0.0.1:${config.ports.cloud}`;
const admin = new ConvexHttpClient(url); admin.setAdminAuth(config.adminKey);
const as = (subject, sid) => { const c = new ConvexHttpClient(url); c.setAdminAuth(config.adminKey, { subject, issuer: "https://bench.local", scope: "browser", sid }); return c; };

const gods = [];
for (const name of ["Bench Host", "Bench Two", "Bench Three"]) {
  const subject = `bench|${randomUUID()}`;
  const sid = await admin.mutation(internal.testing.seedUser, { subject, name, emailVerified: false });
  gods.push(as(subject, sid));
}
await gods[0].mutation(api.activity.touch, {});
const { roomId, shortCode } = await gods[0].mutation(api.rooms.create, {});
for (const g of gods.slice(1)) await g.mutation(api.rooms.join, { room: shortCode });
const typeArgs = type === "Grid" ? { size: 5, symbols: "base10", colours: "rgby" } : { min: -2147483648, max: 2147483647 };
const room = await gods[0].query(api.rooms.get, { room: roomId });
await gods[0].action(api.owner.settings, { roomId, revision: room.revision, settings: {
  languages: [language],
  objectType: type, typeArgs, startingObjectCount: objects, spawnRateHz: 0, planningSeconds: 3600, interactionRateHz: rate,
  startingEnergy: 1e9, agentEnergyPerSecond: 1e6, agentBatteryActs: 1e6,
} });
const game = await gods[0].action(api.owner.start, { roomId });
const source = (i) => type === "Grid"
  ? (language === "python" ? `def agent(grid):\n    return [slide(row(${i % 5}), ${1 + (i % 4)})]` : `function agent(grid) { return [slide(row(${i % 5}), ${1 + (i % 4)})]; }`)
  : (language === "python" ? `def agent(x):\n    return [add(${i + 1})]` : `function agent(x) { return [add(${i + 1})]; }`);
const t0 = Date.now();
for (let i = 0; i < K; i++) {
  const receipt = await gods[i % 3].action(api.commands.submit, { roomId, envelope: { version: "code-gods.player.v3", commandId: randomUUID(), gameId: game.gameId,
    command: { type: "summon", language, source: source(i) } } });
  if (!receipt.accepted) throw new Error(receipt.message);
}
const summonMs = (Date.now() - t0) / K;
await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 1e6 }, kick: true });
await new Promise(r => setTimeout(r, 3000)); // warm up
const read = () => admin.query(internal.testing.rawGame, { gameId: game.gameId });
const before = (await read()).game, start = Date.now();
await new Promise(r => setTimeout(r, seconds * 1000));
const after = (await read()).game, elapsed = (Date.now() - start) / 1000;
await gods[0].mutation(api.rooms.endActiveGame, { roomId });

const samples = (await read()).batches.filter(b => b.at >= start && b.perf).map(b => b.perf);
const stat = (xs) => {
  const s = xs.filter(x => typeof x === "number").sort((a, b) => a - b);
  if (!s.length) return null;
  const q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1), p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +s.at(-1).toFixed(1) };
};
const result = {
  language, type, agents: K, rateCapHz: rate, seconds: +elapsed.toFixed(1), summonMsPerAgent: Math.round(summonMs),
  actsPerSecond: +((after.stats.acts - before.stats.acts) / elapsed).toFixed(1),
  opportunitiesPerSecond: +((after.stats.opportunities - before.stats.opportunities) / elapsed).toFixed(1),
  commitsPerSecond: +((after.stats.commits - before.stats.commits) / elapsed).toFixed(2),
  discardedWindows: after.stats.discarded - before.stats.discarded,
  windowActs: stat(samples.map(p => p.acts)), windowWorldSeconds: stat(samples.map(p => p.window)),
  simulateMs: stat(samples.map(p => p.simulateMs)), commitMs: stat(samples.map(p => p.commitMs)),
};
console.log(JSON.stringify(result, null, 2));
