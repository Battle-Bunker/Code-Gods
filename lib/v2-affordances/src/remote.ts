/**
 * The CLI against a real deployment (`pnpm player …`): the commands are generated from the directory (surfaces.ts
 * `parseCli`), and every call goes to the deployment's `/mcp` with the room credential the device flow issued, so
 * the server decides exactly as it does for any remote assistant.
 *
 *   pnpm player connect --room CODE [--permission read|act|owner]   device approval in the browser, credential saved
 *   pnpm player status                                                the connection, and how many tools it may use now
 *   pnpm player tools                                                 the tools offered right now (context and grant)
 *   pnpm player <namespace> <verb> --flag value …                     one affordance, e.g. `chat send --text hi`
 *   pnpm player call <id> '<json>'                                    any affordance by id
 *   pnpm player disconnect                                            revokes the credential and forgets it
 *
 * Global flags, before the command: `--site URL` (default $CODE_GODS_ENGINE_URL, else the local engine), `--config FILE`
 * (default $CODE_GODS_CONFIG, else ~/.config/code-gods/cli.json), `--game ID` (a game of the room to act on, e.g. one
 * that has ended; default the room's current game). Credentials are kept per site, file mode 0600.
 */
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { affordanceForTool, cliCommand, cliCommands, parseCli, toolName } from "./surfaces.ts";
import { GAME_SCOPE_HEADER } from "./mcp.ts";

export interface RemoteIo { out(line: string): void; err(line: string): void }
export interface Saved { credential: string; credentialId: string; roomId: string; roomCode: string | null; permission: string }
export interface RemoteEnv {
  io: RemoteIo;
  fetch: typeof fetch;
  configPath: string;
  defaultSite: string;
  /** Waits between device polls (tests pass a no-op). */
  sleep(ms: number): Promise<void>;
}

export class CliError extends Error {}

export const LOCAL_SITE = "http://127.0.0.1:3211";
export const defaultConfigPath = () => process.env.CODE_GODS_CONFIG ?? join(homedir(), ".config", "code-gods", "cli.json");

type Config = Record<string, Saved>;
function readConfig(path: string): Config {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, "utf8")) as Config; }
  catch { throw new CliError(`${path} is not valid JSON; fix or delete it, then connect again.`); }
}
function writeConfig(path: string, config: Config) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

const b64url = (b: Buffer) => b.toString("base64url");
const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/;

/**
 * The engine's site URL as the CLI calls it: no trailing slash, a deployment's `.convex.cloud` URL mapped to its
 * `.convex.site` (where /api and /mcp live), https required except on loopback (the credential is a bearer secret).
 */
export function normalizeSite(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new CliError(`${raw} is not a URL; give the engine's site, e.g. https://<deployment>.convex.site`); }
  if (url.hostname.endsWith(".convex.cloud")) url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.test(url.hostname)))
    throw new CliError(`${raw}: use https (plain http only for a local engine), since the credential travels with every call.`);
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}
const MODERN = "2026-07-28";

/** One MCP request with the credential (the stateless modern protocol era: per-request metadata, no initialize). */
async function mcp(env: RemoteEnv, site: string, credential: string, method: string, params: Record<string, unknown> = {}, game?: string): Promise<any> {
  const headers: Record<string, string> = {
    "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${credential}`,
    "mcp-protocol-version": MODERN, "mcp-method": method, ...(game ? { [GAME_SCOPE_HEADER]: game } : {}),
  };
  if (method === "tools/call") headers["mcp-name"] = String(params.name);
  const _meta = { "io.modelcontextprotocol/protocolVersion": MODERN, "io.modelcontextprotocol/clientInfo": { name: "code-gods-cli", version: "2" }, "io.modelcontextprotocol/clientCapabilities": {} };
  const res = await env.fetch(`${site}/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta } }) });
  if (res.status === 401) throw new CliError("This connection was revoked or has expired. Run `pnpm player connect --room CODE` again.");
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { throw new CliError(`${site}/mcp answered HTTP ${res.status} with no JSON: is this the engine's site URL?`); }
  if (body.error) throw new CliError(body.error.message ?? `MCP error ${body.error.code}`);
  return body.result;
}


async function postJson(env: RemoteEnv, url: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await env.fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** The device flow: request, show the code, poll until the human approves, save the credential. */
async function connect(env: RemoteEnv, site: string, args: Record<string, string | boolean>): Promise<number> {
  const room = args.room;
  if (typeof room !== "string") { env.io.err("connect needs --room CODE (the room's code or id)"); return 2; }
  const permission = typeof args.permission === "string" ? args.permission : "act";
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const req = await postJson(env, `${site}/api/device/request`, { room, permission, challenge, label: "Code Gods CLI" });
  if (req.status !== 200) { env.io.err(`Could not ask for approval: ${req.body.error ?? `HTTP ${req.status}`}`); return 1; }
  const { deviceId, deviceSecret, userCode, verificationUrl, expiresIn, interval } = req.body;
  env.io.out(`Open ${verificationUrl} and approve code ${userCode} (room ${req.body.roomCode ?? room}, ${permission}). Waiting…`);
  const deadline = Date.now() + expiresIn * 1000;
  let wait = (interval ?? 5) * 1000;
  while (Date.now() < deadline) {
    await env.sleep(wait);
    const poll = await postJson(env, `${site}/api/device/poll`, { deviceId, deviceSecret, verifier });
    switch (poll.body.status) {
      case "approved": {
        const config = readConfig(env.configPath);
        // The credential this replaces is revoked, so no live one is left that the CLI no longer knows.
        const previous = config[site];
        if (previous) await postJson(env, `${site}/api/device/revoke`, { credential: previous.credential }).catch(() => null);
        config[site] = { credential: poll.body.credential, credentialId: poll.body.credentialId, roomId: poll.body.roomId, roomCode: req.body.roomCode ?? null, permission: poll.body.permission };
        writeConfig(env.configPath, config);
        env.io.out(`Connected to room ${req.body.roomCode ?? poll.body.roomId} with ${poll.body.permission} rights. Try \`pnpm player status\`.`);
        return 0;
      }
      case "pending": continue;
      case "slow_down": wait += 5000; continue;
      case "denied": env.io.err("The approval was denied."); return 1;
      case "forbidden": env.io.err(poll.body.error ?? "Not allowed."); return 1;
      case "expired": env.io.err("The approval code expired; run connect again."); return 1;
      default: env.io.err(`Unexpected answer from the server: ${JSON.stringify(poll.body)}`); return 1;
    }
  }
  env.io.err("The approval code expired; run connect again.");
  return 1;
}

/** `--name value` / `--flag` pairs for connect (its own flags; not an affordance). */
function flags(argv: readonly string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z-]+)$/.exec(argv[i]!);
    if (!m) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[m[1]!] = true; else { out[m[1]!] = next; i++; }
  }
  return out;
}

export function helpLines(rest: readonly string[], fake = false): string[] | null {
  const cmds = cliCommands().filter(c => !rest[0] || c.words[0] === rest[0] && (!rest[1] || c.words[1] === rest[1]));
  if (cmds.length === 0) return null;
  const lines = cmds.map(c => rest[1]
    ? `${c.usage}\n\n${c.help}\n${c.flags.map(f => `  --${f.name}${f.required ? "" : " (optional)"}: ${f.description ?? f.type}${f.choices ? ` (one of ${f.choices.join(", ")})` : ""}`).join("\n")}`
    : c.usage);
  if (!rest[0]) lines.push("", ...(fake
    ? ["call <id> '<json>' runs any of them.", "Global flags, after --fake and before the command: --as <userId> --room <id> --game <id> --state <file>."]
    : ["connect --room CODE [--permission read|act|owner] · status · tools · disconnect · call <id> '<json>'",
      "Global flags, before the command: --site URL, --config FILE, --game ID (a game of the room, e.g. one that has ended) (or --fake first, for the in-memory stand-in)."]));
  return lines;
}

/** Runs one CLI invocation against a deployment; returns the exit code. */
export async function runRemoteCli(argv: readonly string[], env: RemoteEnv): Promise<number> {
  let i = 0, site = env.defaultSite, game: string | undefined;
  for (let m; i < argv.length && (m = /^--(site|config|game)$/.exec(argv[i]!)); i += 2) {
    if (argv[i + 1] === undefined) { env.io.err(`--${m[1]} needs a value`); return 2; }
    if (m[1] === "site") site = argv[i + 1]!; else if (m[1] === "game") game = argv[i + 1]!; else env = { ...env, configPath: argv[i + 1]! };
  }
  const rest = argv.slice(i);
  try {
    site = normalizeSite(site);
    if (rest.length === 0 || rest[0] === "help") {
      const lines = helpLines(rest.slice(1));
      if (!lines) { env.io.err(`No command ${rest.slice(1).join(" ")}`); return 2; }
      for (const l of lines) env.io.out(l);
      return 0;
    }
    if (rest[0] === "connect") return await connect(env, site, flags(rest.slice(1)));
    const saved = readConfig(env.configPath)[site];
    if (!saved) { env.io.err(`Not connected to ${site}. Run \`pnpm player connect --room CODE\` first.`); return 2; }
    switch (rest[0]) {
      case "status": {
        const { tools } = await mcp(env, site, saved.credential, "tools/list", {}, game);
        env.io.out(`Connected to ${site}, room ${saved.roomCode ?? saved.roomId}, ${saved.permission} rights: ${tools.length} tools offered now.`);
        return 0;
      }
      case "tools": {
        const { tools } = await mcp(env, site, saved.credential, "tools/list", {}, game);
        for (const t of tools) {
          const a = affordanceForTool(t.name);
          env.io.out(`${a ? cliCommand(a).words.join(" ") : t.name}  ${t.title}`);
        }
        return 0;
      }
      case "disconnect": {
        const revoked = await postJson(env, `${site}/api/device/revoke`, { credential: saved.credential });
        // 401: already revoked or expired, so forgetting it is safe; anything else keeps it, to retry.
        if (revoked.status !== 200 && revoked.status !== 401) {
          env.io.err(`Could not revoke the credential (HTTP ${revoked.status}); it is kept so you can try again, or revoke it on the engine site (menu → Connected apps).`);
          return 1;
        }
        const config = readConfig(env.configPath);
        delete config[site];
        writeConfig(env.configPath, config);
        env.io.out(`Disconnected from ${site}.`);
        return 0;
      }
    }
    const parsed = parseCli(rest);
    if (!parsed.ok) { env.io.err(parsed.error); return 2; }
    const result = await mcp(env, site, saved.credential, "tools/call", { name: toolName(parsed.id), arguments: parsed.args }, game);
    if (result.isError) { env.io.err(result.content?.map((c: { text?: string }) => c.text ?? "").join("\n").trim() || "The call failed."); return 1; }
    env.io.out(JSON.stringify(result.structuredContent?.data ?? result.structuredContent ?? null, null, 2));
    return 0;
  } catch (e) {
    if (e instanceof CliError) { env.io.err(e.message); return 1; }
    env.io.err(`Could not reach ${site}: ${(e as Error).message}`);
    return 1;
  }
}
