/** A deployment's model per kind of step (convex/v2/aiModel.ts). What would break: a setting ignored or misapplied. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MODEL } from "@workspace/v2-ai";
import { modelSetting } from "../../convex/v2/aiModel.ts";

test("a kind's own setting, else AI_MODEL, else the default", () => {
  assert.deepEqual(modelSetting("assistant", {}), { setting: "the default", id: DEFAULT_MODEL });
  assert.deepEqual(modelSetting("seat", { AI_MODEL: "claude-haiku-5-5" }), { setting: "AI_MODEL", id: "claude-haiku-5-5" });
  const env = { AI_MODEL: "claude-sonnet-5-5", AI_MODEL_SEAT: "claude-haiku-5-5" };
  assert.deepEqual(modelSetting("seat", env), { setting: "AI_MODEL_SEAT", id: "claude-haiku-5-5" });
  assert.deepEqual(modelSetting("assistant", env), { setting: "AI_MODEL", id: "claude-sonnet-5-5" }, "only the seat's own setting moves the seat");
  assert.deepEqual(modelSetting("pitch", { AI_MODEL_PITCH: "x" }), { setting: "AI_MODEL_PITCH", id: "x" });
});
