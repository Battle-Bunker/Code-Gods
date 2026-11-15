/** The landing page's three steps say what a first (practice) game really is (playtest round 26, 01). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { presetOf, DEFAULT_PRESET } from "@workspace/engine/convex/v2/presets.ts";
import { landingSteps } from "../src/site/lib/landing.ts";

test("the first game's length is the default preset's, and nothing promises a bargaining partner a practice game lacks", () => {
  const steps = landingSteps(presetOf(DEFAULT_PRESET));
  const text = steps.map(s => s.join(" ")).join(" ");
  assert.match(text, /A first game lasts 10 minutes/);
  assert.doesNotMatch(text, /five minutes/);
  assert.doesNotMatch(steps[1]!.join(" "), /^.*bargain in chat/, "chat is for games with other people");
  assert.match(text, /practice/);
  // A hidden end says so rather than promising a length.
  assert.match(landingSteps({ ...presetOf(DEFAULT_PRESET), durationMode: "halfLife", worldSeconds: 300 }).map(s => s.join(" ")).join(" "), /about 5 minutes, ending at a moment nobody knows in advance/);
});
