/** Commands from the catalogue: one per palette entry on the surface, bound by the app; availability by audience; search ranks and dims. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { GLOSSARY, GLOSSARY_IDS } from "../src/glossary.ts";
import type { PaletteContext } from "../src/types.ts";

const member: PaletteContext = { role: "member", admin: false, assistantOn: false };

test("the glossary names each concept once, in player words, and never with a pictograph (owner, 2026-11-15)", () => {
  for (const id of GLOSSARY_IDS) {
    const { term, gloss } = GLOSSARY[id];
    assert.ok(gloss.length > 20 && gloss.length <= 160, `${id}: ${gloss.length}`);
    assert.doesNotMatch(term + gloss, /\p{Extended_Pictographic}/u, id);
  }
  const terms = GLOSSARY_IDS.map(id => GLOSSARY[id].term.toLowerCase());
  assert.equal(new Set(terms).size, terms.length, "one entry per name");
  for (const id of ["points", "bits", "others-bits", "energy", "power", "look", "main-part", "tie-breaker", "pane", "panel", "palette"] as const) assert.ok(GLOSSARY_IDS.includes(id), id);
  for (const gone of ["god", "payoff", "salience", "points-tuple", "defence-goal", "utility-function"]) assert.ok(!(GLOSSARY_IDS as string[]).includes(gone), `v1's ${gone} is gone`);
});
