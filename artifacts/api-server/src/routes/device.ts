import { Router } from "express";
import type { Request } from "express";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { pool } from "@workspace/db";
import { hash, opaque, requireIdentity, issueSession, invalidateSession } from "../lib/identity";
import { resolveRoom, member, owner } from "../game/store";

const router = Router();
const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });
const codeOf = (value: unknown) => String(value ?? "").toUpperCase().replaceAll("-", "");
function browser(req: Request) {
  const actor = requireIdentity(req);
  if (actor.scope !== "browser") throw fail("Human browser approval required", 403);
  return actor;
}
function proof(body: Record<string, unknown> = {}) {
  const { deviceId, deviceSecret, verifier } = body;
  if (![deviceId, deviceSecret, verifier].every(v => typeof v === "string" && v.length > 0 && v.length <= 256))
    throw fail("Invalid device request");
  return [deviceId, hash(deviceSecret as string), createHash("sha256").update(verifier as string).digest("base64url")];
}
async function invalidateRows(rows: { hash: string; data: { expiresAt?: string } }[]) {
  for (const row of rows) invalidateSession(row.hash, row.data.expiresAt);
}
const attempts = new Map<string, { count: number; since: number }>();
router.use("/device", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  const key = req.ip ?? "unknown", now = Date.now();
  let record = attempts.get(key);
  if (!record || now - record.since > 60000) { record = { count: 0, since: now }; attempts.set(key, record); }
  if (++record.count > 60) { res.status(429).json({ error: "Too many device requests" }); return; }
  if (attempts.size > 10000) for (const [key, entry] of attempts) if (now - entry.since > 60000) attempts.delete(key);
  next();
});
router.post("/device/request", async (req, res) => {
  if (typeof req.body?.roomId !== "string" || typeof req.body?.challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(req.body.challenge))
    throw fail("roomId and S256 challenge required");
  const permission = req.body.permission ?? "act";
  const clientLabel = req.body.clientLabel ?? "Room assistant";
  if (!["read", "act", "owner"].includes(permission)) throw fail("permission must be read, act or owner");
  if (typeof clientLabel !== "string" || !clientLabel.trim() || clientLabel.length > 120 || /[\u0000-\u001f\u007f]/.test(clientLabel))
    throw fail("clientLabel must be 1–120 printable characters (self-reported)");
  const room = resolveRoom(req.body.roomId), id = randomUUID(), secret = opaque();
  const code = randomBytes(5).toString("hex").toUpperCase();
  await pool.query(`INSERT INTO cg_devices(id,code,secret_hash,challenge,room_id,expires,client_label,permission)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
  [id, code, hash(secret), req.body.challenge, room.id, new Date(Date.now() + 300000), clientLabel.trim(), permission]);
  res.json({ deviceId: id, delegateId: id, deviceSecret: secret, roomId: room.id, userCode: code,
    verificationPath: `/device?code=${code}`, expiresIn: 300, interval: 2, permission });
});
router.get("/device/details", async (req, res) => {
  const actor = browser(req);
  const result = await pool.query("SELECT * FROM cg_devices WHERE code=$1", [codeOf(req.query.code)]);
  const row = result.rows[0];
  if (!row) throw fail("Invalid approval code", 404);
  const room = resolveRoom(row.room_id);
  member(room, actor);
  if (row.user_id && row.user_id !== actor.id) throw fail("Approval belongs to another user", 403);
  res.json({ roomId: room.id, roomCode: room.shortCode, clientLabel: row.client_label,
    permission: row.permission, expiresAt: new Date(row.expires).toISOString(),
    canApprove: row.status === "pending" && !row.user_id && new Date(row.expires).getTime() > Date.now() &&
      (row.permission !== "owner" || room.ownerId === actor.id),
    status: new Date(row.expires).getTime() <= Date.now() ? "expired" :
      row.status === "pending" && row.user_id ? "approved" : row.status });
});
for (const decision of ["approve", "deny"] as const) router.post(`/device/${decision}`, async (req, res) => {
  const actor = browser(req), code = codeOf(req.body?.code);
  const found = await pool.query("SELECT * FROM cg_devices WHERE code=$1", [code]);
  const row = found.rows[0];
  if (!row || row.status !== "pending" || row.user_id || new Date(row.expires).getTime() <= Date.now()) throw fail("Invalid or expired approval code");
  const room = resolveRoom(row.room_id);
  if (row.permission === "owner") owner(room, actor);
  else member(room, actor);
  const status = decision === "approve" ? "approved" : "denied";
  const updated = await pool.query(`UPDATE cg_devices SET user_id=$1,user_name=$2,status=$4
    WHERE code=$3 AND status='pending' AND user_id IS NULL AND expires>now() RETURNING id`, [actor.id, actor.name, code, status]);
  if (!updated.rows.length) throw fail("Approval already decided", 409);
  res.json({ status });
});
router.post("/device/poll", async (req, res) => {
  const args = proof(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`UPDATE cg_devices SET status='redeemed' WHERE id=$1 AND secret_hash=$2 AND challenge=$3
      AND (status='approved' OR (status='pending' AND user_id IS NOT NULL)) AND expires>now() RETURNING *`, args);
    const row = result.rows[0];
    if (!row) {
      const pending = await client.query(`SELECT status FROM cg_devices WHERE id=$1 AND secret_hash=$2 AND challenge=$3 AND expires>now()`, args);
      await client.query("COMMIT");
      const status = pending.rows[0]?.status === "pending" ? "pending" : pending.rows[0]?.status === "denied" ? "denied" : "expired";
      res.status(status === "pending" ? 202 : 400).json({ status }); return;
    }
    const identity = { id: row.user_id, name: row.user_name, kind: "human" as const, scope: "player" as const, roomId: row.room_id,
      delegateId: row.id, clientLabel: row.client_label, permission: row.permission };
    // Approval cannot outlive the approving human's ownership of this room.
    if (row.permission === "owner") owner(resolveRoom(row.room_id), identity);
    const token = await issueSession(identity, 900000, client);
    await client.query("COMMIT");
    res.json({ token, expiresIn: 900, roomId: row.room_id, godId: row.user_id, delegateId: row.id, permission: row.permission });
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
});
router.post("/device/cancel", async (req, res) => {
  const args = proof(req.body);
  // Redemption and cancellation lock the same request row. Revocation runs only
  // after a concurrent redemption transaction (including session insert) commits.
  const result = await pool.query("DELETE FROM cg_devices WHERE id=$1 AND secret_hash=$2 AND challenge=$3 RETURNING id", args);
  if (!result.rows.length) throw fail("Invalid or already cancelled device request");
  const deleted = await pool.query("DELETE FROM cg_sessions WHERE data->>'delegateId'=$1 RETURNING hash,data", [args[0]]);
  await invalidateRows(deleted.rows);
  res.json({ status: "cancelled" });
});
router.get("/device/grants", async (req, res) => {
  const actor = browser(req);
  const result = await pool.query(`SELECT data,expires FROM cg_sessions
    WHERE data->>'id'=$1 AND data->>'scope'='player' AND data->>'delegateId' IS NOT NULL AND expires>now()`, [actor.id]);
  res.json({ grants: result.rows.map(({ data, expires }) => ({ delegateId: data.delegateId, roomId: data.roomId,
    clientLabel: data.clientLabel, permission: data.permission, expiresAt: new Date(expires).toISOString() })) });
});
router.post("/device/grants/:delegateId/revoke", async (req, res) => {
  const actor = browser(req);
  const result = await pool.query(`DELETE FROM cg_sessions WHERE data->>'delegateId'=$1 AND data->>'id'=$2
    AND data->>'scope'='player' RETURNING hash,data`, [String(req.params.delegateId), actor.id]);
  if (!result.rows.length) throw fail("Grant not found", 404);
  await invalidateRows(result.rows);
  res.json({ status: "revoked" });
});
router.post("/device/revoke", async (req, res) => {
  const actor = requireIdentity(req);
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : undefined;
  if (!token || actor.scope !== "player") throw fail("Player bearer required", 403);
  await pool.query("DELETE FROM cg_sessions WHERE hash=$1", [hash(token)]);
  invalidateSession(hash(token), actor.expiresAt);
  res.json({ status: "revoked" });
});
export default router;
