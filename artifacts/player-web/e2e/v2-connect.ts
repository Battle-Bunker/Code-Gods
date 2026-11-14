/**
 * /connect against the live local engine: an MCP client asks (OAuth) to act in the human's room; the page reads the
 * request (`v2/connect:pending`), preselects the hinted room, and Approve (`account.approveConnection`) sends the browser
 * back to the client with a code; a second request is denied (`account.denyConnection`) and the client gets an error.
 * /device approves a device request the same way, and the device claims its credential.
 * At desktop (1440×900) and phone (390×844).
 *
 *   pnpm --filter @workspace/player-web run e2e:connect        (SKIP_DEPLOY=1 reuses the uploaded build)
 */
import "../../engine/scripts/local-only.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const SITE = process.env.CODE_GODS_SITE_URL ?? `http://127.0.0.1:${process.env.CONVEX_LOCAL_SITE_PORT ?? "3211"}`;
const ROOT = path.resolve(import.meta.dirname, "../../..");
const REDIRECT = "http://127.0.0.1:9/callback";

if (!process.env.SKIP_DEPLOY) {
  const deploy = spawnSync("pnpm", ["--filter", "@workspace/engine", "run", "deploy-static"], { cwd: ROOT, stdio: "inherit" });
  assert.equal(deploy.status, 0, "deploy-static failed");
}

/** An MCP client registers and starts OAuth for `room` (its code); the engine answers with /connect?request=…. */
async function startOAuth(room: string, scope: string): Promise<string> {
  const registered = await fetch(`${SITE}/api/oauth/register`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "e2e connect client", redirect_uris: [REDIRECT] }) });
  assert.equal(registered.status, 201, await registered.clone().text());
  const { client_id } = await registered.json() as { client_id: string };
  const verifier = randomBytes(32).toString("base64url");
  const authorize = new URL(`${SITE}/oauth/authorize`);
  for (const [k, v] of Object.entries({ response_type: "code", client_id, redirect_uri: REDIRECT, code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256", state: randomUUID(), scope, resource: SITE, room })) authorize.searchParams.set(k, v);
  const toConnect = await fetch(authorize, { redirect: "manual" });
  assert.equal(toConnect.status, 302, await toConnect.clone().text());
  return new URL(toConnect.headers.get("location")!).searchParams.get("request")!;
}

/** Where the browser is sent back to the client: the redirect URL it navigates to (the client itself is not there). */
function backToClient(page: any): Promise<URL> {
  return new Promise(resolve => page.on("request", (r: any) => { if (r.url().startsWith(REDIRECT)) resolve(new URL(r.url())); }));
}

const browser = await chromium.launch();
try {
  for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e: Error) => errors.push(e.message));
    await page.goto(`${SITE}/`);
    await page.getByTestId("button-login").waitFor();
    const url = await page.evaluate(async () => {
      const r = await fetch("/api/auth/sign-in/oauth2", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId: "fake", callbackURL: "/" }) });
      return ((await r.json()) as { url: string }).url;
    });
    await page.goto(url);
    await page.getByRole("link", { name: /\(carol\)/ }).click();
    await page.waitForURL(`${SITE}/`);
    await page.getByTestId("button-create-room").first().click();
    await page.waitForURL(/\/rooms\/[A-Z0-9]+$/);
    const code = page.url().split("/").at(-1)!;

    // Approve: the hinted room is preselected; the browser goes back to the client with a code.
    const request = await startOAuth(code, "act");
    await page.goto(`${SITE}/connect?request=${encodeURIComponent(request)}`);
    await page.getByTestId("text-connect-client").getByText("e2e connect client").waitFor({ timeout: 15_000 });
    assert.match(await page.getByTestId("select-connect-room").locator("option:checked").innerText(), new RegExp(`^${code} `), `${label}: the hinted room is chosen`);
    const back = backToClient(page);
    await page.getByTestId("button-approve-connect").click();
    const approved = await back;
    assert.ok(approved.searchParams.get("code"), `${label}: approved: the client gets a code (${approved})`);
    console.log(`${label}: approved, back to the client with a code`);

    // Deny: the client hears access_denied.
    const second = await startOAuth(code, "read");
    await page.goto(`${SITE}/connect?request=${encodeURIComponent(second)}`);
    await page.getByTestId("button-deny-connect").waitFor({ timeout: 15_000 });
    const back2 = backToClient(page);
    await page.getByTestId("button-deny-connect").click();
    const denied = await back2;
    assert.equal(denied.searchParams.get("code"), null, `${label}: denied: no code`);
    assert.ok(denied.searchParams.get("error"), `${label}: denied: the client is told (${denied})`);
    console.log(`${label}: denied, the client is told: ${denied.searchParams.get("error")}`);
    // A device (`pnpm player connect`): /device?code=… shows the request; Approve (account.approveConnection with the
    // user code) lets the device claim its credential on its next poll.
    const verifier = randomBytes(32).toString("base64url");
    const dev = await (await fetch(`${SITE}/api/device/request`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ room: code, permission: "act", label: "e2e device", challenge: createHash("sha256").update(verifier).digest("base64url") }) })).json() as Record<string, string>;
    await page.goto(dev.verificationUrl!);
    await page.getByTestId("text-device-requester").getByText("e2e device").waitFor({ timeout: 15_000 });
    await page.getByTestId("button-approve-device").click();
    await page.getByTestId("status-approved").waitFor({ timeout: 15_000 });
    const claimed = await fetch(`${SITE}/api/device/poll`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: dev.deviceId, deviceSecret: dev.deviceSecret, verifier }) });
    assert.equal(claimed.status, 200, `${label}: the approved device claims its credential: ${await claimed.clone().text()}`);
    console.log(`${label}: device approved and its credential claimed`);
    assert.deepEqual(errors, [], `${label}: no page errors`);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log("ok - /connect approves and denies an MCP client's request through the directory, at desktop and phone");
