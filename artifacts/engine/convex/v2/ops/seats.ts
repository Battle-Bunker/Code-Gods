/** `seats.*`: the owner fills empty seats with practice partners, or seats and removes AI players. */
import { OpFailure } from "@workspace/v2-affordances";
import { addAiSeat, fillPracticePartners as fill, removeSeat } from "../lobby";
import { providerFor } from "../ai";
import { defineOp, inRoom } from "./define";

export const { op: fillPracticePartners, as: fillPracticePartnersAs } = defineOp("seats.fillPracticePartners", "mutation", async env => {
  const { room } = inRoom(env);
  return { added: await fill(env.ctx, room) };
});
/** Model-backed AI players are for admins (integration plan §1, M3): they spend the deployment's model allowance. */
export const { op: addAi, as: addAiAs } = defineOp("seats.addAi", "mutation", async (env, a) => {
  const { room, user } = inRoom(env);
  if (!user.admin) throw new OpFailure("Only admins can seat model-backed AI players.", "seats.fillPracticePartners");
  providerFor();   // refuses on a deployment with no model configured

  return { memberId: await addAiSeat(env.ctx, room, a.template) };
});
export const { op: removeAi, as: removeAiAs } = defineOp("seats.removeAi", "mutation", async (env, a) => {
  const { room } = inRoom(env);
  await removeSeat(env.ctx, room, a.memberId);
  return { ok: true as const };
});
