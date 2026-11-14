/** `bid.*`: the room's bid phase (integration plan §5.9). The handlers arrive in W3-8; the screen reads `v2/bids:state`. */
import { defineOp, notYet } from "./define";

export const { op: state, as: stateAs } = defineOp("bid.state", "query", () => notYet("W3-8"));
export const { op: place, as: placeAs } = defineOp("bid.place", "mutation", () => notYet("W3-8"));
export const { op: withdraw, as: withdrawAs } = defineOp("bid.withdraw", "mutation", () => notYet("W3-8"));
export const { op: done, as: doneAs } = defineOp("bid.done", "mutation", () => notYet("W3-8"));
