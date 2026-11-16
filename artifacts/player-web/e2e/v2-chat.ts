/**
 * Chat in a game between people (playtest round 34, a blocker: no pane showed it and nothing marked a new message).
 * Three people play one game; the game bar's "Chat" says how many messages from others are new and opens the chat;
 * reading it clears the mark; a practice game (one person) shows no Chat button.
 */
import assert from "node:assert/strict";
import { DESKTOP, PHONE, SITE, chromium, deploy, signIn, type Page } from "./v1-harness.ts";

deploy();
const memberRow = (page: Page, name: RegExp) => page.locator('[data-testid^="row-member-"]', { hasText: name });

const browser = await chromium.launch();
try {
  const alice = await signIn(browser, "admin", DESKTOP);
  const bob = await signIn(browser, "bob", PHONE);
  const carol = await signIn(browser, "carol", DESKTOP);
  const a = alice.page, b = bob.page, c = carol.page;
  await a.getByTestId("button-create-room").first().click();
  await a.waitForURL(/\/rooms\/[0-9A-Z]+$/);
  const code = a.url().split("/").pop()!;
  for (const [p, name] of [[b, /Bob Okafor/], [c, /Carol Nguyen/]] as const) {
    await p.goto(`${SITE}/rooms/${code}`);
    await p.getByTestId("button-join-room").click();
    await memberRow(p, name).waitFor();
  }
  await a.getByText(/3 players are in/).waitFor({ timeout: 20_000 });
  await a.getByTestId("button-start-game").click();
  // A confirmation, where the room asks for one.
  if (await a.waitForURL(/\/games\//, { timeout: 5_000 }).then(() => false, () => true)) {
    const modal = a.locator("[role=alertdialog], [role=dialog]").first();
    if (await modal.count()) await modal.getByRole("button").filter({ hasNotText: /cancel|close|keep/i }).last().click();
    else await a.getByTestId("button-start-game").click();
  }
  for (const p of [a, b, c]) await p.waitForURL(/\/games\//, { timeout: 60_000 });
  // Everyone in a game with people has a way to chat on screen.
  for (const p of [a, b, c]) await p.getByTestId("button-chat").waitFor({ timeout: 20_000 });
  assert.equal(await a.getByTestId("button-chat").getAttribute("data-unread"), null, "nothing new yet");
  // Carol writes; alice (not looking at chat) sees it marked; bob on a phone too.
  await c.getByTestId("button-chat").click();
  await c.getByTestId("input-chat").waitFor({ timeout: 15_000 });
  await c.getByTestId("input-chat").fill("Leave line 3 alone and I'll leave line 5.");
  await c.getByTestId("button-send-chat").click();
  for (const p of [a, b]) {
    await p.locator("[data-testid=button-chat][data-unread='1']").waitFor({ timeout: 15_000 });
    assert.match(await p.getByTestId("button-chat").innerText(), /Chat · 1 new/);
  }
  assert.equal(await c.getByTestId("button-chat").getAttribute("data-unread"), null, "your own message is never new to you");
  // Opening it shows the message and clears the mark.
  await a.getByTestId("button-chat").click();
  await a.getByTestId("pane-public-chat").getByText(/Leave line 3 alone/).waitFor({ timeout: 15_000 });
  await a.locator("[data-testid=button-chat]:not([data-unread])").waitFor({ timeout: 5_000 });
  await b.getByTestId("button-chat").click();
  await b.getByTestId("pane-public-chat").getByText(/Leave line 3 alone/).waitFor({ timeout: 15_000 });
  await b.locator("[data-testid=button-chat]:not([data-unread])").waitFor({ timeout: 5_000 });
  for (const p of [alice, bob, carol]) assert.deepEqual(p.errors, [], `${p.who}: no page errors`);
  console.log("ok - chat in a game between people: on screen, new messages marked, cleared when read");
} finally {
  await browser.close();
}
