/**
 * LOCAL ONLY. Run an owner action as a signed-in browser session (from seed-players.ts output):
 *   node --experimental-transform-types scripts/owner-action.ts SESSION ROOM_ID ACTION ['{"settings":{...}}']
 * ACTION: start | endGame | resume | settings (owner.command).
 */
process.env.CG_TEST_CLOUD_URL ??= "http://127.0.0.1:3210";
process.env.CG_TEST_SITE_URL ??= "http://127.0.0.1:3211";
const { CLOUD, browserJwt } = await import("../test/helpers.ts");
const { ConvexHttpClient } = await import("convex/browser");
const { makeFunctionReference } = await import("convex/server");
const [session, roomId, action, extra] = process.argv.slice(2);
const c = new ConvexHttpClient(CLOUD);
c.setAuth(await browserJwt(session));
const args: Record<string, unknown> = { roomId, action, requestId: crypto.randomUUID(), ...(extra ? JSON.parse(extra) : {}) };
if (action === "settings" && args.revision === undefined) {
  args.revision = (await c.query(makeFunctionReference<"query">("rooms:get"), { room: roomId }) as { revision: number }).revision;
}
console.log(JSON.stringify(await c.action(makeFunctionReference<"action">("owner:command"), args)));
export {};
