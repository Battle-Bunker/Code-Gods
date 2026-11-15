/**
 * Every move a board offers says each of its arguments for a person (playtest round 23: the form showed "centre", "turn"
 * and "f" with nothing about what to type): a label, a hint, a starting value the form accepts and the move takes, and
 * plain words for each word it takes. Read from the mutators' own `argHelp`, for every preset's board.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS } from "@workspace/engine/convex/v2/presets.ts";
import { variantMutators } from "@workspace/v2-core";
import { objectTypeOf, variantOf } from "../src/sdk/object-types.ts";
import { formError, mutatorChoices, wireArgs } from "../src/panes/what-if-model.ts";

const variants = [...new Set(PRESETS.map(p => p.variant))];

test("every move's every argument has a label, a hint, a start the form accepts, and words for its choices", () => {
  for (const id of variants) {
    const variant = variantOf(id);
    const byId = new Map(variantMutators(objectTypeOf(id), variant).map(m => [m.id, m]));
    for (const c of mutatorChoices(variant)) {
      const start = Object.fromEntries(c.args.map(a => [a.name, a.start]));
      for (const a of c.args) {
        const where = `${id} ${c.id} ${a.name}`;
        assert.ok(a.label && a.label !== a.name, `${where}: a label, not the raw name`);
        assert.ok(a.hint, `${where}: a hint of what to type`);
        if (a.kind === "choice") for (const v of a.choices) assert.ok(a.choiceWords?.[v], `${where}: words for the choice ${v}`);
        if (!a.optional) assert.ok(a.start !== "", `${where}: a starting value`);
      }
      assert.equal(formError(c.args, start), null, `${id} ${c.id}: the form accepts its own start`);
      assert.doesNotThrow(() => byId.get(c.id)!.args(variant).decode(wireArgs(c.args, start)), `${id} ${c.id}: the move takes its start`);
    }
  }
});
