/** `power.allocate`: split the caller's power between their agents. W3-4. */
import { defineOp, notYet } from "./define";

export const { op: allocate, as: allocateAs } = defineOp("power.allocate", "mutation", () => notYet("W3-4"));
