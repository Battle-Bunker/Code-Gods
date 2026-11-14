/** `seats.*`: the owner fills empty seats with practice partners, or seats and removes AI players. */
import { fillPracticePartners as fill, removeSeat } from "../lobby";
import { defineOp, inRoom, notYet } from "./define";

export const { op: fillPracticePartners, as: fillPracticePartnersAs } = defineOp("seats.fillPracticePartners", "mutation", async env => {
  const { room } = inRoom(env);
  return { added: await fill(env.ctx, room) };
});
export const { op: addAi, as: addAiAs } = defineOp("seats.addAi", "mutation", () => notYet("W3-5"));
export const { op: removeAi, as: removeAiAs } = defineOp("seats.removeAi", "mutation", async (env, a) => {
  const { room } = inRoom(env);
  await removeSeat(env.ctx, room, a.memberId);
  return { ok: true as const };
});
