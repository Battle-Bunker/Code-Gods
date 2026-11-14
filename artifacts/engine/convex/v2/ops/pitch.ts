/** `pitch.draft`: the negotiation aid (owner decision 9), model-backed. M3 (W3-7). */
import { defineOp, notYet } from "./define";

export const { op: draft, as: draftAs } = defineOp("pitch.draft", "action", () => notYet("W3-7"));
