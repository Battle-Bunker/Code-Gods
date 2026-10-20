import { Router } from "express";
import { pool } from "@workspace/db";
import { requireIdentity } from "../lib/identity";
import { allRooms } from "../game/store";
import { resolveGameLink, type ArchivedGameLink } from "../game/game-links";

const router = Router();
router.get("/games/:code", async (req, res) => {
  const actor = requireIdentity(req);
  const games = await pool.query<ArchivedGameLink>("SELECT id,room_id,prefix_length FROM cg_games");
  res.set("Cache-Control", "no-store").json(resolveGameLink(String(req.params.code), games.rows, allRooms(), actor));
});
export default router;
