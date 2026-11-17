/** The line boards as the game configuration sets them up (physics from v2-economy's beginner configuration). */
import { withPhysics } from "@workspace/v2-core";
import { LINES_BEGINNER_PHYSICS } from "@workspace/v2-economy";
import { lineQ as q, lineQLenses as ql, lineZ as z, lineZ4 as z4 } from "../src/type.ts";

export const lineQ = withPhysics(q, LINES_BEGINNER_PHYSICS);
export const lineQLenses = withPhysics(ql, LINES_BEGINNER_PHYSICS);
export const lineZ = withPhysics(z, LINES_BEGINNER_PHYSICS);
export const lineZ4 = withPhysics(z4, LINES_BEGINNER_PHYSICS);
