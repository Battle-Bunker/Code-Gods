/** Commands from the catalogue: one per palette entry on the surface, bound by the app; availability by audience; search ranks and dims. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { GLOSSARY, GLOSSARY_IDS } from "../src/glossary.ts";
import type { PaletteContext } from "../src/types.ts";

const member: PaletteContext = { role: "member", admin: false, assistantOn: false };

test("the glossary has the 16 game terms plus the client's own words", () => {
  assert.equal(GLOSSARY_IDS.length, 28);
  assert.ok(GLOSSARY_IDS.includes("points-tuple"), "points tuples are explained once, in the glossary");
  for (const id of GLOSSARY_IDS) assert.ok(GLOSSARY[id].gloss.length > 20 && GLOSSARY[id].gloss.length <= 160, id);
  assert.ok(GLOSSARY_IDS.includes("payoff") && GLOSSARY_IDS.includes("panel") && GLOSSARY_IDS.includes("pane") && GLOSSARY_IDS.includes("palette"));
});
