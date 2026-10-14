import { Router } from "express";
import { requireIdentity } from "../lib/identity";
import { resolveRoom } from "../game/store";
import { observation, executePlayerEnvelope } from "../game/player-api";
const router = Router();
router.get("/player/v1/rooms/:roomId/observation", (req, res) => {
  res.set("Cache-Control", "no-store").json(observation(resolveRoom(String(req.params.roomId)), requireIdentity(req)));
});
router.post("/player/v1/rooms/:roomId/commands", async (req, res) => {
  res.json(await executePlayerEnvelope(String(req.params.roomId), requireIdentity(req), req.body));
});
export default router;
