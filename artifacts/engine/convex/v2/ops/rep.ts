/** `rep.mutators`: a representation's price list, from v2-linear (reads.ts). */
import { defineOp, inGame } from "./define";
import { mutatorsOf } from "../reads.ts";

export const { op: mutators, as: mutatorsAs } = defineOp("rep.mutators", "query", async (env, a) => ({ mutators: mutatorsOf(a.rep, inGame(env).game.variant) }));
