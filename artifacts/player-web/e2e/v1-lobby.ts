/**
 * The old site smoke (archive/engine-v1 artifacts/player-web/e2e/site-smoke.ts), ported to the v2 app: sign-in and the
 * lobby, room creation and its settings, setups, the palette, the device page and the admin page. Its game half
 * (start, bidding, preparation, end, past games) is in e2e/v1-game.ts.
 *
 *   pnpm --filter @workspace/engine dev
 *   pnpm --filter @workspace/player-web run e2e:v1-lobby          (SKIP_DEPLOY=1 reuses the uploaded build; ~2 min)
 *
 * At desktop (1280×900) and phone (390×844): alice (Ada Admin: AI is only available in rooms an administrator owns),
 * bob and carol sign in. What v2 genuinely changed is noted where the check is; a check the app does not pass because
 * the behaviour is missing is `missing(...)` with its inventory rows (docs/engine-v2/v1-parity.json).
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { DESKTOP, PHONE, SITE, chromium, check, deploy, missing, noHorizontalScroll, report, shot, signIn, watch, type Page, type Player } from "./v1-harness.ts";

deploy();

/** POST /api/device/request as a player app would (`pnpm player connect`), PKCE S256. */
async function deviceRequest(room: string, permission: "read" | "act" | "owner", label: string) {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const r = await fetch(`${SITE}/api/device/request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challenge, room, permission, label }) });
  assert.equal(r.status, 200, `device request: ${r.status} ${await r.clone().text()}`);
  const body = await r.json() as { deviceId: string; deviceSecret: string; userCode: string; verificationUrl: string; roomCode: string };
  return { ...body, verifier };
}
const lastPoll = new Map<string, number>();
async function devicePoll(d: { deviceId: string; deviceSecret: string; verifier: string }) {
  const wait = (lastPoll.get(d.deviceId) ?? 0) + 2100 - Date.now();
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  lastPoll.set(d.deviceId, Date.now());
  const r = await fetch(`${SITE}/api/device/poll`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: d.deviceId, deviceSecret: d.deviceSecret, verifier: d.verifier }) });
  return { status: r.status, body: await r.json() as { status: string; credential?: string; credentialId?: string } };
}

/** Opens the command palette from its search box, types a query and runs the first row (Enter). */
async function palette(page: Page, query: string) {
  await page.getByTestId("button-palette").click();
  await page.getByTestId("dialog-palette").waitFor();
  await page.getByTestId("input-palette").fill(query);
  await page.keyboard.press("Enter");
}
/** The row ids the open palette lists (empty query), after opening it by `how`; closes it again. */
async function paletteItems(page: Page, how: "search box" | "menu button" | "ctrl+k"): Promise<string[]> {
  if (how === "search box") await page.getByTestId("button-palette").click();
  else if (how === "menu button") {
    const menu = page.getByTestId("button-palette-menu");
    await ((await menu.isVisible()) ? menu : page.getByTestId("button-palette")).click();
  } else await page.keyboard.press("Control+k");
  await page.getByTestId("dialog-palette").waitFor();
  const rows = page.locator('[data-testid^="row-palette-"]');
  await rows.first().waitFor();
  const ids = (await rows.evaluateAll((els: Element[]) => els.map(e => e.getAttribute("data-testid")!))).sort();
  await page.keyboard.press("Escape");
  await page.getByTestId("dialog-palette").waitFor({ state: "hidden" });
  return ids;
}
async function escapeAll(page: Page) {
  for (let i = 0; i < 3; i++) await page.keyboard.press("Escape");
}
/** The member row of a signed-in person (v2's member ids are not user ids: found by name). */
const memberRow = (page: Page, name: RegExp) => page.locator('[data-testid^="row-member-"]', { hasText: name });

const browser = await chromium.launch();
const everyone: Player[] = [];
try {
  for (const [name, viewport] of [["desktop", { ...DESKTOP, width: 1280 }], ["phone", PHONE]] as const) {
    const alice = await signIn(browser, "admin", viewport);
    const bob = await signIn(browser, "bob", viewport);
    const carol = await signIn(browser, "carol", viewport);
    everyone.push(alice, bob, carol);
    const a = alice.page, b = bob.page, c = carol.page;
    watch(a, b, c);
    let code = "";

    await check(`${name}: alice creates a room in one click; it shows its code and owner; the next step is a practice game; she may watch instead, and play again`, async () => {
      // One click makes the room and opens it, ready to share: nothing is asked first.
      await a.getByTestId("button-create-room").first().click();
      await a.waitForURL(/\/rooms\/[0-9A-Z]+$/);
      // v2: the old "Copy link" button is "Copy invite link" (button-copy-invite).
      await a.getByTestId("button-copy-invite").waitFor();
      code = (await a.getByTestId("text-room-code").innerText()).trim();
      assert.match(code, /^[0-9A-Z]{4,}$/);
      assert.match(await a.getByTestId("text-room-owner").innerText(), /Ada Admin/);
      assert.match(await a.getByTestId("text-viewer-seat").innerText(), /A game needs three players\. Play a practice game against practice partners, or invite friends\./);
      // v2: practice partners (no key, no cost) fill the seats, not AI players: the button says "Play a practice game".
      assert.match(await a.getByTestId("button-practice-game").innerText(), /Play a practice game/);
      assert.match(await a.getByTestId(`text-member-seat-${(await memberRow(a, /Ada Admin/).getAttribute("data-testid"))!.replace("row-member-", "")}`).innerText(), /owner · player/);
    });

    await missing(["e2e-site-smoke-1", "comp-ai-quotas-sheet"], `${name}: the owner changes the assistant quota in the AI quotas sheet (300,000 → 200,000 per player)`, async () => {
      await a.getByTestId("text-ai-quotas").filter({ hasText: /Assistant: 300,000 per player/ }).waitFor({ timeout: 5_000 });
      await a.getByTestId("button-ai-quotas").click();
      await a.getByTestId("sheet-ai-quotas").waitFor();
      assert.equal(await a.getByTestId("input-assistant-quota").inputValue(), "300000");
      await a.getByTestId("input-assistant-quota").fill("200000");
      await a.getByTestId("button-save-ai-quotas").click();
      await a.getByTestId("text-ai-quotas").filter({ hasText: /Assistant: 200,000 per player/ }).waitFor();
    }, () => escapeAll(a));

    await missing(["e2e-site-smoke-1", "page-room-created-date"], `${name}: the room shows its creation date and no name (old: "code, owner and creation date (no name)")`, async () => {
      assert.match(await a.getByTestId("text-room-created").innerText({ timeout: 3_000 }), /\d{4}/);
      assert.equal(await a.getByTestId("text-room-name").count(), 0, "the room has no name");
    });

    await missing(["e2e-site-smoke-1", "comp-room-members"], `${name}: the lone owner may watch instead from the room page, and play again`, async () => {
      // v2: the per-member spectator toggle is the next step's "Watch instead" / "Play the next game".
      await a.getByTestId("button-watch").click({ timeout: 3_000 });
      await a.getByTestId("text-viewer-seat").filter({ hasText: /you're watching|You'll watch/ }).waitFor();
      await a.waitForTimeout(400);
      await a.getByTestId("button-play").click();
      await a.getByTestId("text-viewer-seat").filter({ hasText: /A game needs three players/ }).waitFor();
    });

    await check(`${name}: the home list shows the room with its owner; it opens the room`, async () => {
      await a.goto(`${SITE}/`);
      const row = a.locator('[data-testid^="row-room-"]', { hasText: code });
      await row.waitFor();
      assert.match(await row.innerText(), /Ada Admin/);
      await shot(a, `home-${name}`);
      await noHorizontalScroll(a, `${name} home`);
      await row.click();
      await a.getByTestId("text-room-code").waitFor();
    });

    await missing(["e2e-site-smoke-1", "page-room-created-date"], `${name}: the home row reads "Owner: Ada Admin (you)" and "Created: <date>"`, async () => {
      await a.goto(`${SITE}/`);
      const row = a.locator('[data-testid^="row-room-"]', { hasText: code });
      assert.match(await row.innerText(), /Owner: Ada Admin \(you\)/);
      assert.match(await row.innerText(), /Created: .*\d{4}/);
    }, async () => { await a.goto(`${SITE}/rooms/${code}`); await a.getByTestId("text-room-code").waitFor(); });

    await check(`${name}: bob opens the room by typing its code in the palette ("Open room CODE" is the first row)`, async () => {
      await b.goto(`${SITE}/`);
      await palette(b, code);
      await b.waitForURL(new RegExp(`/rooms/${code}$`), { timeout: 5_000 });
    });

    await check(`${name}: bob and carol open the room by its link and join; alice's player list updates live; Start is her one primary`, async () => {
      for (const p of [b, c]) {
        await p.goto(`${SITE}/rooms/${code}`);
        await p.getByTestId("button-join-room").click();
        await memberRow(p, p === b ? /Bob Okafor/ : /Carol Nguyen/).waitFor();
      }
      await a.locator('[data-testid^="row-member-"]').nth(2).waitFor();
      const members = await a.locator('[data-testid^="row-member-"]').allInnerTexts();
      assert.ok(members.some((t: string) => /Bob Okafor/.test(t)) && members.some((t: string) => /Carol Nguyen/.test(t)), members.join(" | "));
      assert.match(await b.getByTestId("text-viewer-seat").innerText(), /Waiting for Ada to start the game\./);
      await a.getByTestId("button-start-game").waitFor();   // three players: Start is the owner's one primary now
    });

    await missing(["e2e-site-smoke-2"], `${name}: bob says he is ready (a text link, gating nothing); alice sees "ready" on his row`, async () => {
      await b.getByTestId("button-ready").click({ timeout: 3_000 });
      await memberRow(a, /Bob Okafor/).getByText("ready").waitFor();
    });

    await check(`${name}: the Setup combobox searches every setup; a system setup's Edit is unavailable; Duplicate opens the copy (v1, restored)`, async () => {
      // A saved setup of alice's to find (setups are shared, as in v1).
      const saved = `Combo ${name}`;
      await a.goto(`${SITE}/rooms/${code}/configure`);
      await a.getByTestId("input-setup-name").fill(saved);
      await a.getByTestId("button-save-setup").click();
      await a.getByTestId(`row-setup-${saved}`).waitFor({ timeout: 15_000 });
      await a.goto(`${SITE}/rooms/${code}`);
      await a.getByTestId("select-setup").click({ timeout: 5_000 });
      await a.getByTestId("input-setup-search").fill("bidding");
      await a.getByTestId("row-setup-preset-lines-beginner-bidding").waitFor();
      assert.equal(await a.getByTestId("button-edit-setup-preset-lines-beginner-bidding").getAttribute("aria-disabled"), "true", "a system setup cannot be edited");
      await a.getByTestId("input-setup-search").fill(saved);
      await a.getByTestId(`row-setup-${saved}`).waitFor({ timeout: 15_000 });
      await a.getByTestId(`button-duplicate-setup-${saved}`).click();
      await a.waitForURL(new RegExp(`/rooms/${code}/configure\\?setup=`));
      await a.getByTestId(`row-setup-${saved}'s copy`).waitFor({ timeout: 15_000 });
      await a.goto(`${SITE}/rooms/${code}`);
      await a.getByTestId("text-room-code").waitFor();
    });

    await missing(["e2e-site-smoke-4", "page-configure", "set-setupName", "cmd-site-ui-nav-configure"], `${name}: alice edits her copy on /rooms/:code/configure (name first, every engine choice, saved for the next game); bob reads it as a read-only page offering "Duplicate and edit"`, async () => {
      await a.goto(`${SITE}/rooms/${code}/configure`);
      await a.getByTestId("page-configure").waitFor({ timeout: 5_000 });
      await a.getByTestId("input-setup-name").waitFor();
      await b.goto(`${SITE}/rooms/${code}/configure`);
      await b.getByTestId("button-duplicate-and-edit").waitFor({ timeout: 5_000 });
    }, async () => {
      for (const p of [a, b]) { await p.goto(`${SITE}/rooms/${code}`); await p.getByTestId("text-room-code").waitFor(); }
    });

    // v2's replacement for the configure page: the room's Next game form (owner only), which every member reads live.
    await check(`${name}: alice changes the next game's settings on the room page; bob sees the summary change live`, async () => {
      const before = await b.getByTestId("text-next-game-summary").innerText();
      const form = a.getByTestId("form-room-settings");
      if (!await form.isVisible()) await a.getByTestId("section-next-game").locator("summary, button").filter({ hasText: /settings/i }).first().click();
      await form.waitFor();
      const field = form.locator('[data-testid^="input-setting-"]').first();
      const key = (await field.getAttribute("data-testid"))!.replace("input-setting-", "");
      const value = Number(await field.inputValue());
      await field.fill(String(Math.max(1, Math.round(value * 2))));
      await a.getByTestId("button-save-settings").click();
      await b.getByTestId("text-next-game-summary").filter({ hasNotText: before }).waitFor({ timeout: 15_000 }).catch(async () => {
        throw new Error(`bob's summary did not change after alice set ${key}: still "${before}"`);
      });
      await a.getByTestId("button-reset-settings").click();
    });

    await missing(["e2e-site-smoke-5", "cmd-site-aiTemplates-create"], `${name}: alice adds a mock AI player with no approval step ("Choose a model" is the palette's pick list); its seat has its own name; the AI quotas sheet shows its usage`, async () => {
      await a.getByTestId("button-choose-ai").click({ timeout: 3_000 });
      await a.locator('[data-testid^="row-palette-option-"]').first().waitFor();
      await escapeAll(a);
      await a.getByTestId("button-add-ai").click();
      await a.locator('[data-testid^="row-member-"]', { hasText: /AI player/ }).waitFor();
      await b.locator('[data-testid^="row-member-"]', { hasText: /AI player/ }).waitFor();
      await a.getByTestId("button-ai-quotas").click();
      await a.getByTestId("text-ai-usage").waitFor();
    }, () => escapeAll(a));

    await check(`${name}: public chat reaches every member live`, async () => {
      await b.getByTestId("input-chat").fill(`Bob says hello (${name})`);
      await b.getByTestId("button-send-chat").click();
      await a.locator('[data-testid^="row-chat-"]', { hasText: `Bob says hello (${name})` }).waitFor();
      await c.locator('[data-testid^="row-chat-"]', { hasText: `Bob says hello (${name})` }).waitFor();
    });

    await missing(["e2e-site-smoke-7"], `${name}: the palette explains connecting a player app (engine URL and "pnpm player connect --room CODE")`, async () => {
      await palette(a, "connect a player app");
      const info = a.getByTestId("panel-palette-info");
      await info.waitFor({ timeout: 4_000 });
      assert.match(await info.innerText(), new RegExp(`CODE_GODS_ENGINE_URL to ${SITE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
      assert.match(await info.innerText(), new RegExp(`pnpm player connect --room ${code}`));
    }, () => escapeAll(a));

    await missing(["e2e-site-smoke-7"], `${name}: searching the palette shows owner commands dimmed (with the reason) for members, not hidden`, async () => {
      await b.getByTestId("button-palette").click();
      await b.getByTestId("input-palette").fill("end game");
      const row = b.getByTestId("row-palette-game.end");
      await row.waitFor({ timeout: 4_000 });
      assert.equal(await row.getAttribute("data-unavailable"), "true", "dimmed, with the reason in the detail line");
    }, () => escapeAll(b));

    await check(`${name}: one palette: the search box, the menu button and Ctrl+K list exactly the same commands`, async () => {
      const viaBox = await paletteItems(a, "search box");
      assert.ok(viaBox.length > 12, `the whole list, not a curated few (${viaBox.length})`);
      assert.deepEqual(await paletteItems(a, "menu button"), viaBox, "menu button = search box");
      assert.deepEqual(await paletteItems(a, "ctrl+k"), viaBox, "Ctrl+K = search box");
      await shot(a, `room-${name}`);
      await noHorizontalScroll(a, `${name} room`);
    });

    await check(`${name}: the device page approves an act request; the credential is listed under Connected apps and revoked`, async () => {
      const req = await deviceRequest(code, "act", `e2e smoke app (${name})`);
      assert.equal(req.roomCode, code);
      assert.equal(new URL(req.verificationUrl).pathname, "/device");
      await c.goto(`${SITE}/device?code=${encodeURIComponent(req.userCode)}`);
      await c.getByTestId("panel-device-details").waitFor();
      assert.equal(await c.getByTestId("text-device-code").innerText(), req.userCode);
      assert.match(await c.getByTestId("text-device-room").innerText(), new RegExp(`^${code}\\b`));
      assert.equal(await c.getByTestId("text-device-requester").innerText(), `e2e smoke app (${name})`);
      assert.match(await c.getByTestId("text-device-permission").innerText(), /^Act/);
      assert.match(await c.getByTestId("text-device-expiry").innerText(), /in \d+:\d\d/);
      assert.equal(await c.getByTestId("text-device-status").textContent(), "pending");
      await noHorizontalScroll(c, `${name} device`);
      assert.equal((await devicePoll(req)).status, 202, "pending before approval");
      await c.getByTestId("button-approve-device").click();
      // v2: the old "status-approved" marker is the panel reading "Access approved".
      await c.getByText("Access approved").waitFor();
      const claimed = await devicePoll(req);
      assert.equal(claimed.status, 200);
      assert.match(claimed.body.credential ?? "", /^cgc_/);
      await c.goto(`${SITE}/rooms/${code}`);
      await c.getByTestId("text-room-code").waitFor();
      // The avatar menu can miss a click made while the page is still settling: open it until its item shows.
      for (let i = 0; i < 5 && !await c.getByTestId("menu-connected-apps").isVisible(); i++) {
        await c.getByTestId("button-avatar").click();
        await c.getByTestId("menu-connected-apps").waitFor({ timeout: 2_000 }).catch(() => {});
      }
      await c.getByTestId("menu-connected-apps").click();
      const row = c.getByTestId(`row-credential-${claimed.body.credentialId}`);
      await row.waitFor();
      assert.match(await row.innerText(), /e2e smoke app/);
      assert.match(await row.innerText(), /act · room/i);
      await c.getByTestId(`button-revoke-${claimed.body.credentialId}`).click();
      await c.getByTestId(`button-revoke-${claimed.body.credentialId}`).click();   // inline confirmation
      await row.waitFor({ state: "detached" });
      const token = await fetch(`${SITE}/api/device/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential: claimed.body.credential }) });
      assert.equal(token.status, 401, "a revoked credential no longer gets tokens");
      await escapeAll(c);
    });

    await check(`${name}: an owner grant needs the owner's explicit consent`, async () => {
      const req = await deviceRequest(code, "owner", "e2e owner assistant");
      await c.goto(`${SITE}/device?code=${encodeURIComponent(req.userCode)}`);
      await c.getByTestId("text-device-owner-required").waitFor();
      assert.ok(await c.getByTestId("button-approve-device").isDisabled(), "a non-owner cannot approve an owner grant");
      await a.goto(`${SITE}/device?code=${encodeURIComponent(req.userCode)}`);
      await a.getByTestId("checkbox-device-owner-consent").waitFor();
      assert.ok(await a.getByTestId("button-approve-device").isDisabled(), "approval waits for consent");
      await a.getByTestId("checkbox-device-owner-consent").check();
      await a.getByTestId("button-approve-device").click();
      await a.getByText("Access approved").waitFor();
      assert.equal((await devicePoll(req)).body.status, "approved");
    });

    for (const who of [alice, bob, carol]) await who.context.close();
  }

  await check("admin: the AI library is for admins only, reached from the avatar menu", async () => {
    const admin = await signIn(browser, "admin", { ...DESKTOP, width: 1280 });
    const alice = await signIn(browser, "alice", { ...DESKTOP, width: 1280 });
    everyone.push(admin, alice);
    watch(admin.page, alice.page);
    await admin.page.getByTestId("button-avatar").click();
    await admin.page.getByTestId("link-admin-agents").click();
    // v2: the local deployment seeds no AI templates (v1 had "Sonnet Strategist"): the library itself is the check.
    await admin.page.waitForURL(/\/admin\/agents$/);
    await admin.page.getByText(/^Library/).first().waitFor();
    await shot(admin.page, "admin-agents-desktop");
    await alice.page.goto(`${SITE}/admin/agents`);
    await alice.page.getByText("Admins only").waitFor();
    await alice.page.getByTestId("button-avatar").click();
    assert.equal(await alice.page.getByTestId("link-admin-agents").count(), 0, "the avatar menu offers the AI library to admins only");
    for (const who of [admin, alice]) await who.context.close();
  });

  await check("sign-in goes to Google; sign-out (avatar menu) returns to the landing page; every path signed out shows sign-in in place", async () => {
    const context = await browser.newContext({ viewport: { ...DESKTOP, width: 1280 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    watch(page);
    await context.route(/^https:\/\/accounts\.google\.com\//, (route: any) => route.fulfill({ status: 200, contentType: "text/html", body: "google" }));
    await context.addInitScript(() => {
      const w = window as unknown as { __beforeunloadListeners: number };
      w.__beforeunloadListeners = 0;
      const add = window.addEventListener.bind(window);
      window.addEventListener = ((type: string, ...rest: unknown[]) => {
        if (type === "beforeunload") w.__beforeunloadListeners += 1;
        return (add as (...a: unknown[]) => void)(type, ...rest);
      }) as typeof window.addEventListener;
    });
    await page.goto(`${SITE}/`);
    await page.getByTestId("button-login").waitFor();
    assert.equal(await page.evaluate(() => (window as unknown as { __beforeunloadListeners: number }).__beforeunloadListeners), 0, "a beforeunload guard was registered; leaving for Google would prompt \"Leave site?\"");
    const google = page.waitForRequest(/^https:\/\/accounts\.google\.com\//);
    await page.getByTestId("button-login").click();
    const url = new URL((await google).url());
    assert.equal(url.searchParams.get("redirect_uri"), `${SITE}/api/auth/callback/google`);
    assert.equal(url.searchParams.get("prompt"), "select_account");
    // v2: /rooms/:code/configure is gone (the room page's Next game form replaced it), so it is not among the paths.
    for (const p of ["/rooms/ZZZZZZ", "/device?code=ABCD-EFGH", "/admin/agents"]) {
      await page.goto(`${SITE}${p}`);
      await page.getByTestId("button-login").waitFor();
      assert.equal(new URL(page.url()).pathname, p.split("?")[0], `the signed-out page at ${p} moved`);
    }
    await context.close();
    const carol = await signIn(browser, "carol", { ...DESKTOP, width: 1280 });
    everyone.push(carol);
    watch(carol.page);
    await carol.page.getByTestId("button-avatar").click();
    await carol.page.getByTestId("button-logout").click();
    await carol.page.getByTestId("button-login").waitFor();
    await carol.page.reload();
    await carol.page.getByTestId("button-login").waitFor();
    await carol.context.close();
  });

  await check("no uncaught page errors", () => {
    const errs = everyone.flatMap(p => p.errors.map(e => `${p.who}: ${e}`));
    assert.deepEqual(errs, []);
  });
} finally {
  await browser.close();
}
report(everyone);
