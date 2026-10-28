import { Router } from "express";
import { pool } from "@workspace/db";
import { requireIdentity } from "../lib/identity";
import { allRooms, findGame } from "../game/store";
import { publicGameView } from "../game/projection";
import { resolveGameLink, type ArchivedGameLink } from "../game/game-links";

const router = Router();
router.get("/games/:code", async (req, res) => {
  const actor = requireIdentity(req);
  const games = await pool.query<ArchivedGameLink>("SELECT id,room_id,prefix_length FROM cg_games");
  res.set("Cache-Control", "no-store").json(resolveGameLink(String(req.params.code), games.rows, allRooms(), actor));
});
/** One game's own page: live while it runs, its final state once it has ended. */
router.get("/games/:code/state", async (req, res) => {
  const actor = requireIdentity(req);
  const { game, roomId, summary } = await findGame(String(req.params.code));
  if (actor.scope !== "browser" && actor.roomId !== roomId) throw Object.assign(new Error("Wrong room scope"), { status: 403 });
  const room = allRooms().find(r => r.id === roomId) ?? null;
  res.set("Cache-Control", "no-store").json(publicGameView(game, room, summary));
});
export default router;
