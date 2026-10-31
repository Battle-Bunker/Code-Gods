/**
 * Helpers for the live tests (run by scripts/test.mjs against a local engine; CG_TEST_SITE_URL is its site URL).
 * Browser users sign in through the engine's real login flow against the stand-in OIDC provider
 * (identities alice, bob, carol), with a small cookie jar, exactly as a browser would.
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@workspace/engine/convex/_generated/api.js";

export { api };
export const SITE = process.env.CG_TEST_SITE_URL ?? "http://127.0.0.1:3611";
const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

export async function convexUrl(): Promise<string> {
  return (await (await fetch(`${SITE}/api/config`)).json() as { convexUrl: string }).convexUrl;
}

const manual = { redirect: "manual" as const };
function cookies(response: Response): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const index = pair.indexOf("=");
    jar[pair.slice(0, index)] = pair.slice(index + 1);
  }
  return jar;
}

export interface Browser { identity: string; session: string; jwt: string; name: string; subject: string; client: ConvexHttpClient }

/** Signs `identity` in through /api/login → stand-in OIDC → /api/callback, then gets a browser JWT from /api/auth/token. */
export async function signIn(identity: "alice" | "bob" | "carol"): Promise<Browser> {
  const jar: Record<string, string> = {};
  const header = () => ({ cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ") });
  const start = await fetch(`${SITE}/api/login?returnTo=%2F`, manual);
  Object.assign(jar, cookies(start));
  const authorize = new URL(start.headers.get("location")!);
  authorize.searchParams.set("login_hint", identity);
  const picked = await fetch(authorize, manual);
  if (picked.status !== 302) throw new Error(`authorize: ${picked.status}`);
  const back = await fetch(picked.headers.get("location")!, { ...manual, headers: header() });
  Object.assign(jar, cookies(back));
  if (!jar.cg_session) throw new Error(`login failed: ${back.status}`);
  const tokenResponse = await fetch(`${SITE}/api/auth/token`, { method: "POST", headers: { ...header(), origin: SITE } });
  if (tokenResponse.status !== 200) throw new Error(`auth/token: ${tokenResponse.status}`);
  const { token } = await tokenResponse.json() as { token: string };
  const client = new ConvexHttpClient(await convexUrl());
  client.setAuth(token);
  const me = await client.query(api.auth.user.me, {});
  return { identity, session: jar.cg_session, jwt: token, name: me!.name, subject: me!.subject, client };
}

export interface Run { status: number | null; stdout: string; stderr: string; json: any }

/** Runs the player CLI with a clean environment (only the given secrets / env file), optional stdin. */
export function cli(args: string[], options: { env?: Record<string, string>; input?: string; onStderr?: (text: string) => void } = {}): Promise<Run> {
  const env: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...options.env };
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "--experimental-transform-types", CLI, ...args], { env, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; options.onStderr?.(stderr); });
  if (options.input !== undefined) child.stdin.end(options.input); else child.stdin.end();
  return new Promise(resolve => child.on("close", status => {
    let json: unknown;
    try { json = JSON.parse(stdout); } catch { json = undefined; }
    resolve({ status, stdout, stderr, json });
  }));
}

/** A private temp dir for one app's env file and receipt journal. */
export function appDir(name: string) {
  const dir = mkdtempSync(join(tmpdir(), `cg-player-${name}-`));
  return { dir, envFile: join(dir, ".env.local"), env: { CODE_GODS_ENV_FILE: join(dir, ".env.local"), CODE_GODS_STATE_DIR: join(dir, "state"), INIT_CWD: dir } };
}

/**
 * `pnpm player connect` as a subprocess; when it prints the comparison code, `browser` approves it through
 * the engine (auth/device:approve with its browser JWT), as the /device page would.
 */
export async function connectAndApprove(browser: Browser, room: string, permission: "read" | "act" | "owner", extra: string[], env: Record<string, string>) {
  let approval: Promise<unknown> | undefined;
  const run = await cli(["connect", "--engine", SITE, "--room", room, "--permission", permission, "--label", `Test ${permission} app`, ...extra], {
    env, onStderr: text => {
      const code = /Comparison code: ([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(text)?.[1];
      if (code && !approval) approval = browser.client.mutation(api.auth.device.approve, { userCode: code, ...(permission === "owner" ? { ownerConsent: true } : {}) });
    },
  });
  await approval;
  return run;
}

/** Parses a JSON document printed by the CLI (pretty or single line). */
export const parse = (run: Run) => {
  try { return JSON.parse(run.stdout); } catch { throw new Error(`not JSON (exit ${run.status}): ${run.stdout}\n${run.stderr}`); }
};
