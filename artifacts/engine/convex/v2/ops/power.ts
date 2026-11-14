/** `power.allocate`: split the caller's power between their agents (energy moves with power). */
import { allocatePower } from "../agents.ts";
import { defineOp, seated } from "./define";

export const { op: allocate, as: allocateAs } = defineOp("power.allocate", "mutation", async (env, a) => {
  const { game, player } = seated(env);
  await allocatePower(env.ctx, game, player, a.shares);
  return { ok: true as const };
});
