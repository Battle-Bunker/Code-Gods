/**
 * A signed-in browser's calls never make the backend fetch Better Auth's JWKS. Convex validates the caller's JWT on
 * every function call, nested ones included (each `ctx.runQuery`/`runMutation`/`runAction` of an action), and with the
 * JWKS given as a URL it fetched `/api/auth/convex/jwks` from this deployment each time: 80–190 ms before every nested
 * call, so a forge check (about 25 nested calls) spent 2.5 s of its 3.7 s there, and 10–12 s before examinations batched
 * their runs. auth.config.ts inlines the JWKS from BETTER_AUTH_JWKS (scripts/dev.mjs, the deploy workflow and
 * preview-setup set it); this checks that the inlining is in effect, through the backend's own execution log.
 *
 * The test suites impersonate players with the admin key, which validates no JWT, so only a real browser JWT shows it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { ADMIN_KEY, URL_, api, sleep } from "./game-helpers.ts";

const config = await import("../.convex/local/default/config.json", { with: { type: "json" } }).then(m => m.default as { ports?: { site?: number } }).catch(() => ({}) as { ports?: { site?: number } });
process.env.CG_TEST_SITE_URL ??= `http://127.0.0.1:${config.ports?.site ?? 3211}`;
process.env.CG_TEST_OIDC_URL ??= `http://127.0.0.1:${process.env.FAKE_OIDC_PORT ?? 3399}`;
const { login } = await import("./helpers.ts");

type Entry = { kind?: string; identifier?: string; udfType?: string };
async function logPage(cursor: number): Promise<{ entries: Entry[]; newCursor: number }> {
  const response = await fetch(`${URL_}/api/stream_function_logs?cursor=${cursor}`, { headers: { Authorization: `Convex ${ADMIN_KEY}` } });
  assert.equal(response.status, 200, "the admin log stream answers");
  return response.json();
}

test("a signed-in browser's calls, nested ones included, never fetch Better Auth's JWKS", { timeout: 120000 }, async () => {
  const { jwt } = await login("alice");
  const browser = new ConvexHttpClient(URL_);
  browser.setAuth(jwt);
  // Everything logged from here on: the sign-in above fetched from /api/auth/* itself.
  let { newCursor: cursor } = await logPage(0);
  // A mutation (validated once) and an action whose handler makes nested calls (each validated again).
  const { roomId } = await browser.mutation(api.rooms.create, {});
  for (let i = 0; i < 3; i++) {
    // Accepted or refused (chat's rate limit), each receipt took the action's nested calls.
    const receipt = await browser.action(api.commands.submit, { roomId, envelope: { version: "code-gods.player.v3", commandId: crypto.randomUUID(), command: { type: "chat", text: `hello ${i}` } } });
    assert.equal(typeof receipt.accepted, "boolean", JSON.stringify(receipt));
  }
  // The stream long-polls: read it until the three actions are in (other games keep it busy, so never "until empty").
  const seen: Entry[] = [];
  const submits = () => seen.filter(e => e.kind === "Completion" && e.identifier === "commands:submit").length;
  for (let i = 0; i < 50 && submits() < 3; i++) { const page = await logPage(cursor); seen.push(...page.entries); cursor = page.newCursor; if (!page.entries.length) await sleep(100); }
  assert.equal(submits(), 3, "the actions are in the log");
  const done = seen.filter(e => e.kind === "Completion");
  const jwksFetches = done.filter(e => e.udfType === "HttpAction" && e.identifier === "GET /api/auth/*").length;
  assert.equal(jwksFetches, 0, `the backend fetched from /api/auth/* ${jwksFetches} times while validating the browser's JWT`);
});
