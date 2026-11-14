/**
 * Owner decision 23: no discrete steps anywhere a player looks (no "step N of M", rung, level or "main 4/11" pills).
 * Each e2e calls this on every surface it reaches (game, goal card, gallery, bidding, results), for lines and grids.
 */
import assert from "node:assert/strict";

export const STEP_WORDS = /\bstep \d+|\brung\b|\blevel \d+|\d+\/\d+ (main|tie)/i;

/** Fails with the offending text and where it was when any visible text on the page speaks of steps. */
export async function assertNoSteps(page: { locator(selector: string): { innerText(): Promise<string> } }, label: string): Promise<void> {
  const text = await page.locator("body").innerText();
  const m = STEP_WORDS.exec(text);
  assert.equal(m, null, `${label}: no steps (decision 23), found "${m ? text.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, " ") : ""}"`);
}
