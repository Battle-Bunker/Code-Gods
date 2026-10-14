import { Router } from "express";
import * as oidc from "openid-client";
import { pool } from "@workspace/db";
import { getOidc, opaque, hash, origin, cookieOptions, safeReturn, issueSession } from "../lib/identity";

const router = Router();
router.get("/auth/user", (req, res) => {
  const user = req.identity?.scope === "browser" ? { id: req.identity.id, firstName: req.identity.name, lastName: null } : null;
  res.json({ user });
});
router.get("/login", async (req, res) => {
  const config = await getOidc();
  const verifier = oidc.randomPKCECodeVerifier(), state = oidc.randomState(), nonce = oidc.randomNonce();
  const key = opaque();
  await pool.query("INSERT INTO cg_sessions(hash,data,expires) VALUES($1,$2,$3)",
    [hash(key), JSON.stringify({ verifier, state, nonce, returnTo: safeReturn(req.query.returnTo), flow: "oidc" }), new Date(Date.now() + 600000)]);
  res.cookie("cg_oidc", key, { ...cookieOptions, maxAge: 600000 });
  res.redirect(oidc.buildAuthorizationUrl(config, {
    redirect_uri: `${origin(req)}/api/callback`, scope: "openid profile",
    state, nonce, code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: "S256",
  }).href);
});
router.get("/callback", async (req, res) => {
  const key = req.cookies?.cg_oidc;
  if (typeof key !== "string") { res.status(400).send("Login expired; please try again."); return; }
  const result = await pool.query("DELETE FROM cg_sessions WHERE hash=$1 AND expires>now() RETURNING data", [hash(key)]);
  res.clearCookie("cg_oidc", cookieOptions);
  const flow = result.rows[0]?.data;
  if (flow?.flow !== "oidc") { res.status(400).send("Login expired; please try again."); return; }
  const tokens = await oidc.authorizationCodeGrant(await getOidc(), new URL(req.originalUrl, origin(req)), {
    pkceCodeVerifier: flow.verifier, expectedState: flow.state, expectedNonce: flow.nonce, idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims?.sub) throw new Error("Identity provider returned no subject");
  const name = String(claims.name || claims.first_name || claims.preferred_username || "Deity").slice(0, 80);
  const token = await issueSession({ id: claims.sub, name, kind: "human", scope: "browser" }, 86400000);
  res.cookie("cg_session", token, { ...cookieOptions, maxAge: 86400000 });
  res.redirect(safeReturn(flow.returnTo));
});
router.get("/logout", async (req, res) => {
  if (typeof req.cookies?.cg_session === "string") {
    await pool.query("DELETE FROM cg_sessions WHERE hash=$1", [hash(req.cookies.cg_session)]);
  }
  res.clearCookie("cg_session", cookieOptions);
  res.redirect("/");
});
export default router;
