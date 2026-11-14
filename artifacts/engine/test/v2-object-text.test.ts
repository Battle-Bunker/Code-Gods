/**
 * object.read writes an equation as a person writes it, by the views' one writer (lib/v2-views equation-text.ts), so the
 * assistant and the CLI quote "y = −x + 12", never "y = −1x + 12" or "y = 59x + 0" (playtest round 10), and a vertical
 * line as "x = 3".
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { fromMC, lineType, normalise } from "@workspace/v2-linear";
import { q } from "@workspace/v2-core";
import { admin, humans, perform, type Human } from "./v2-helpers.ts";

let ada: Human, gameId: string, objectId: string;
before(async () => {
  [ada] = await humans("Text Ada", "Text Bo");
  const g = await admin.mutation("v2/testing:seedGame", { owner: ada!.userId, practice: 1, objects: 3 });
  gameId = g.gameId; objectId = g.objects[0]!;
});

const put = (state: string) => admin.mutation("v2/testing:setObjectState", { gameId, number: 1, state });
const read = async (rep: string) => (await perform(ada!, "object.read", { objectId, rep }, { gameId }, "query")).result;

test("object.read's text: −x, no + 0, a vertical line solved, and nothing for a picture", async () => {
  await put(lineType.encode({ lines: [fromMC(q(-1), q(12))] }));
  assert.equal((await read("si")).text, "y = −x + 12");
  await put(lineType.encode({ lines: [fromMC(q(59), q(0))] }));
  assert.equal((await read("si")).text, "y = 59x");
  assert.equal((await read("gen")).text, "−59x + y = 0");
  await put(lineType.encode({ lines: [normalise(1n, 0n, -3n) as never] }));
  assert.equal((await read("gen")).text, "x = 3");
  assert.equal((await read("cart")).text, null, "a picture has no text");
});
