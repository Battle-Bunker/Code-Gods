/** `rep.mutators`: a representation's price list, from v2-linear. W3-4. */
import { defineOp, notYet } from "./define";

export const { op: mutators, as: mutatorsAs } = defineOp("rep.mutators", "query", () => notYet("W3-4"));
