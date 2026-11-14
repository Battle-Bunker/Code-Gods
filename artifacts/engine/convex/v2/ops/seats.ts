/** `seats.*`: the owner fills empty seats with practice partners, or seats and removes AI players. */
import { defineOp, notYet } from "./define";

export const { op: fillPracticePartners, as: fillPracticePartnersAs } = defineOp("seats.fillPracticePartners", "mutation", () => notYet("W3-3"));
export const { op: addAi, as: addAiAs } = defineOp("seats.addAi", "mutation", () => notYet("W3-5"));
export const { op: removeAi, as: removeAiAs } = defineOp("seats.removeAi", "mutation", () => notYet("W3-3"));
