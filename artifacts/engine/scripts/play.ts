/**
 * LOCAL ONLY. Submit one v3 command as a player app (credential from an env file written by
 * seed-players.ts):  node --experimental-transform-types scripts/play.ts ENV_FILE '{"type":"chat","text":"hi"}'
 */
import { readFileSync } from "node:fs";
const [envFile, json] = process.argv.slice(2);
const env = Object.fromEntries(readFileSync(envFile, "utf8").trim().split("\n").map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const site = env.CODE_GODS_ENGINE_URL, credential = env.CODE_GODS_CREDENTIAL;
const { convexUrl } = await (await fetch(`${site}/api/config`)).json() as { convexUrl: string };
const { token, roomId } = await (await fetch(`${site}/api/device/token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credential }) })).json() as { token: string; roomId: string };
const { ConvexHttpClient } = await import("convex/browser");
const { makeFunctionReference } = await import("convex/server");
const c = new ConvexHttpClient(convexUrl); c.setAuth(token);
const command = JSON.parse(json);
const obs = await c.query(makeFunctionReference<"query">("player:observation"), { roomId }) as { gameId?: string; language: string };
if (command.source && !command.language) command.language = obs.language;
const envelope = { version: "code-gods.player.v3", commandId: crypto.randomUUID(), command, ...(["validate", "summon", "pause", "destroy"].includes(command.type) ? { gameId: obs.gameId } : {}) };
console.log(JSON.stringify(await c.action(makeFunctionReference<"action">("commands:submit"), { roomId, envelope })));
