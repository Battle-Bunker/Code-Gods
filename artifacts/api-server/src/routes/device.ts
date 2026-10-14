import { Router } from "express";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { pool } from "@workspace/db";
import { hash, opaque, requireIdentity, issueSession } from "../lib/identity";
import { resolveRoom, member } from "../game/store";

const router = Router();
const attempts = new Map<string, { count: number; since: number }>();
router.use("/device", (req, res, next) => {
  const key = req.ip ?? "unknown", now = Date.now();
  let record = attempts.get(key);
  if (!record || now - record.since > 60000) { record = { count: 0, since: now }; attempts.set(key, record); }
  if (++record.count > 60) { res.status(429).json({ error: "Too many device requests" }); return; }
  if (attempts.size > 10000) for (const [key, entry] of attempts) if (now - entry.since > 60000) attempts.delete(key);
  next();
});
router.post("/device/request", async (req, res) => {
  if (typeof req.body?.roomId !== "string" || typeof req.body?.challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(req.body.challenge)) {
    res.status(400).json({ error: "roomId and S256 challenge required" }); return;
  }
  const room = resolveRoom(req.body.roomId), id = randomUUID(), secret = opaque();
  const code = randomBytes(5).toString("hex").toUpperCase();
  await pool.query("INSERT INTO cg_devices(id,code,secret_hash,challenge,room_id,expires) VALUES($1,$2,$3,$4,$5,$6)",
    [id, code, hash(secret), req.body.challenge, room.id, new Date(Date.now() + 300000)]);
  res.json({ deviceId: id, deviceSecret: secret, userCode: code, verificationPath: `/device?code=${code}`, expiresIn: 300, interval: 2 });
});
router.post("/device/approve", async (req, res) => {
  const actor = requireIdentity(req);
  if (actor.scope !== "browser") throw new Error("Human browser approval required");
  const code = String(req.body?.code ?? "").toUpperCase().replaceAll("-", "");
  const found = await pool.query("SELECT room_id FROM cg_devices WHERE code=$1 AND expires>now() AND user_id IS NULL", [code]);
  if (!found.rows.length) throw new Error("Invalid or expired approval code");
  member(resolveRoom(found.rows[0].room_id), actor);
  await pool.query("UPDATE cg_devices SET user_id=$1,user_name=$2 WHERE code=$3 AND user_id IS NULL", [actor.id, actor.name, code]);
  res.json({ status: "approved" });
});
router.post("/device/poll", async (req, res) => {
  const { deviceId, deviceSecret, verifier } = req.body ?? {};
  if (![deviceId, deviceSecret, verifier].every(v => typeof v === "string" && v.length <= 256)) throw new Error("Invalid device request");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const result = await pool.query(`DELETE FROM cg_devices WHERE id=$1 AND secret_hash=$2 AND challenge=$3
    AND user_id IS NOT NULL AND expires>now() RETURNING *`, [deviceId, hash(deviceSecret), challenge]);
  const row = result.rows[0];
  if (!row) {
    const pending = await pool.query("SELECT id FROM cg_devices WHERE id=$1 AND secret_hash=$2 AND challenge=$3 AND expires>now()", [deviceId, hash(deviceSecret), challenge]);
    res.status(pending.rows.length ? 202 : 400).json({ status: pending.rows.length ? "pending" : "expired" }); return;
  }
  const token = await issueSession({ id: row.user_id, name: row.user_name, kind: "human", scope: "player", roomId: row.room_id }, 900000);
  res.json({ token, expiresIn: 900, roomId: row.room_id, godId: row.user_id });
});
router.post("/device/revoke", async (req, res) => {
  requireIdentity(req);
  const token = req.headers.authorization?.slice(7);
  if (token) await pool.query("DELETE FROM cg_sessions WHERE hash=$1", [hash(token)]);
  res.json({ status: "revoked" });
});
export default router;
