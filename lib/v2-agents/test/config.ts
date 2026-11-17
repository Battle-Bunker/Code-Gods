/** The boards as the game configurations set them up (physics from v2-economy's beginner configurations). */
import { withPhysics } from "@workspace/v2-core";
import { GRIDS_BEGINNER_PHYSICS, LINES_BEGINNER_PHYSICS } from "@workspace/v2-economy";
import { grid4 as g4 } from "@workspace/v2-grid";
import { lineQ as q, lineZ as z } from "@workspace/v2-linear";

export const lineQ = withPhysics(q, LINES_BEGINNER_PHYSICS);
export const lineZ = withPhysics(z, LINES_BEGINNER_PHYSICS);
export const grid4 = withPhysics(g4, GRIDS_BEGINNER_PHYSICS);
