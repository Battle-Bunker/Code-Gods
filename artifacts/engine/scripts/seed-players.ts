/**
 * LOCAL ONLY. Seed a room on the local engine and connect simulated player apps, the way real players
 * would: each identity signs in through the stand-in OIDC provider (scripts/fake-oidc.mjs), the first
 * creates the room and the others join, and each player app gets a room credential through the real
 * device flow (request → approve in the "browser" → poll).
 *
 *   node --experimental-transform-types scripts/seed-players.ts [--players alice,bob,carol]
 *        [--permission act] [--out DIR] [--settings '{"objectType":"Int"}']
 *
 * Prints JSON {roomId, shortCode, players: [{identity, session, envFile}]}. Each env file holds
 * CODE_GODS_ENGINE_URL and CODE_GODS_CREDENTIAL (mode 0600), standing in for that app's Replit Secrets.
 * Ports follow the CG_TEST_* variables of test/helpers.ts (defaults: the dev.mjs ports 3210/3211/3399).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

process.env.CG_TEST_CLOUD_URL ??= "http://127.0.0.1:3210";
process.env.CG_TEST_SITE_URL ??= "http://127.0.0.1:3211";
process.env.CG_TEST_OIDC_URL ??= "http://127.0.0.1:3399";
const { SITE, browserJwt, client, deviceRequest, login, poll, sleep } = await import("../test/helpers.ts");

const { values } = parseArgs({ options: {
  players: { type: "string", default: "alice,bob,carol" },
  permission: { type: "string", default: "act" },
  out: { type: "string", default: ".convex/players" },
  settings: { type: "string" },
} });
const identities = values.players!.split(",").map(s => s.trim()).filter(Boolean);
const out = resolve(values.out!);
mkdirSync(out, { recursive: true, mode: 0o700 });

const sessions = new Map<string, string>();
for (const identity of identities) sessions.set(identity, (await login(identity)).session);
const as = async (identity: string) => client(await browserJwt(sessions.get(identity)!));

const owner = await as(identities[0]);
const { roomId, shortCode } = await owner.mutation("rooms:create") as { roomId: string; shortCode: string };
for (const identity of identities.slice(1)) await (await as(identity)).mutation("rooms:join", { room: roomId });
if (values.settings) {
  const room = await owner.query("rooms:get", { room: roomId }) as { revision: number };
  const { ConvexHttpClient } = await import("convex/browser");
  const { makeFunctionReference } = await import("convex/server");
  const c = new ConvexHttpClient(process.env.CG_TEST_CLOUD_URL!);
  c.setAuth(await browserJwt(sessions.get(identities[0])!));
  await c.action(makeFunctionReference<"action">("owner:settings"), { roomId, revision: room.revision, settings: JSON.parse(values.settings) });
}

const players = [];
for (const identity of identities) {
  const device = await deviceRequest(roomId, values.permission!, `${identity}'s player app`);
  await (await as(identity)).mutation("auth/device:approve", { userCode: device.userCode, ownerConsent: values.permission === "owner" });
  let claimed: Record<string, any> | undefined;
  for (let attempt = 0; attempt < 10 && !claimed; attempt++) {
    const result = await poll(device);
    if (result.status === 200) claimed = result.body;
    else await sleep(2100);
  }
  if (!claimed) throw new Error(`device flow for ${identity} did not complete`);
  const envFile = join(out, `${identity}.env`);
  writeFileSync(envFile, `CODE_GODS_ENGINE_URL=${SITE}\nCODE_GODS_CREDENTIAL=${claimed.credential}\n`, { mode: 0o600 });
  players.push({ identity, session: sessions.get(identity), envFile });
}
console.log(JSON.stringify({ roomId, shortCode, players }, null, 2));
