import { createHash, randomBytes } from "node:crypto";
import { pool } from "@workspace/db";
import type { Request, Response, NextFunction } from "express";
import * as oidc from "openid-client";

export type Identity = { id: string; name: string; kind: "human"; scope: "browser" | "player"; roomId?: string; email?: string; emailVerified?: boolean; issuer?: string };
declare global {
  namespace Express { interface Request { identity?: Identity } }
}
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const opaque = () => randomBytes(32).toString("base64url");
export const cookieOptions = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };
let config: Promise<oidc.Configuration> | undefined;
export const getOidc = () => config ??= oidc.discovery(new URL("https://replit.com/oidc"), process.env.REPL_ID!);

export function origin(req: Request) {
  // Proxy-managed host is used only for same-origin checks and OIDC callback.
  const host = req.get("host");
  if (!host || /[\\/\s]/.test(host)) throw new Error("Invalid host");
  return `https://${host}`;
}
export function safeReturn(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return "/";
  return value;
}
export async function issueSession(identity: Identity, ttlMs: number) {
  const token = opaque();
  await pool.query("INSERT INTO cg_sessions(hash,data,expires) VALUES($1,$2,$3)",
    [hash(token), JSON.stringify(identity), new Date(Date.now() + ttlMs)]);
  return token;
}
export async function lookupSession(token: string): Promise<Identity | undefined> {
  const result = await pool.query("SELECT data FROM cg_sessions WHERE hash=$1 AND expires > now()", [hash(token)]);
  return result.rows[0]?.data;
}
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7) : req.cookies?.cg_session;
    if (typeof token === "string" && token.length < 256) req.identity = await lookupSession(token);
    next();
  } catch (error) { next(error); }
}
export function requireIdentity(req: Request): Identity {
  if (!req.identity) throw Object.assign(new Error("Please log in"), { status: 401 });
  return req.identity;
}
// Only signed OIDC claims persisted by the callback qualify. Device/player
// sessions and older sessions without verified email must sign in again.
export function isAdmin(identity: Identity | undefined): boolean {
  if (!identity || identity.scope !== "browser" || identity.issuer !== "https://replit.com/oidc" ||
      identity.emailVerified !== true || typeof identity.email !== "string") return false;
  const allowed = (process.env.CODE_GODS_ADMIN_EMAILS ?? "").split(/[,;\s]+/).map(email => email.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(identity.email.trim().toLowerCase());
}
export function requireAdmin(req: Request): Identity {
  const identity = requireIdentity(req);
  if (!isAdmin(identity)) throw Object.assign(new Error("Administrator access required"), { status: 403 });
  return identity;
}
export function sameOrigin(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method) || req.headers.authorization?.startsWith("Bearer ")) return next();
  if (req.get("origin") !== origin(req)) return next(Object.assign(new Error("Origin check failed"), { status: 403 }));
  next();
}
