/**
 * Choosing the room's setup in the browser as a player does with the keyboard (the room's setup combobox, v1's picker):
 * open it, type the setup's title, wait until its row is the highlighted one, press Enter, and wait until the room
 * shows it. Shared by the e2e suites.
 */
type Page = any;
export async function chooseSetup(page: Page, presetId: string, title: string) {
  if (!await page.getByTestId("popover-setups").isVisible().catch(() => false)) await page.getByTestId("select-setup").click();
  await page.getByTestId("input-setup-search").fill(title);
  await page.locator(`[data-testid="row-setup-preset-${presetId}"][aria-selected="true"]`).waitFor({ timeout: 10_000 });
  await page.getByTestId("input-setup-search").press("Enter");
  await page.getByTestId("popover-setups").waitFor({ state: "detached", timeout: 5_000 });
  await page.getByTestId("text-current-setup").filter({ hasText: title }).waitFor({ timeout: 15_000 });
}
