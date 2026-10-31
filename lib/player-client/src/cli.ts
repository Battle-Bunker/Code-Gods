/**
 * `pnpm player <command>` — the player app's Node-side tooling (run from the repository root).
 *
 *   connect [--engine URL] --room CODE [--permission read|act|owner] [--label TEXT] [--write-env FILE]
 *   status [--pretty]
 *   state [--pretty] [--objects N] [--events N] [--watch HZ [--count N]]
 *   tools [--pretty]                     the agent tools this credential may use (MCP tools/list on POST /mcp)
 *   call TOOL ['JSON' | -] [--pretty]    one tool call over MCP (arguments as JSON, or on stdin with -)
 *   assistant <status | observation | events [--after SEQ] [--limit N] | receipt ID | wake | disconnect |
 *              command [--retry-unknown] < envelope.json | room-state | ai-catalog | room-command < action.json>
 *   panel list | push <slug> [--file PATH] | pull <slug> [--version N] [--file PATH] [--force]
 *
 * Configuration: CODE_GODS_ENGINE_URL and CODE_GODS_CREDENTIAL from the environment (your environment's
 * secret store, e.g. Replit Secrets or Codespaces secrets), else a gitignored .env.local / $CODE_GODS_ENV_FILE.
 * No secret is ever accepted in argv or printed, except the one-time credential that `connect` prints to stdout (or writes with --write-env).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { AssistantError, runAssistant, status } from "./assistant.ts";
import { connectDevice, updateEnvFile } from "./connect.ts";
import { CREDENTIAL_VAR, ENGINE_URL_VAR, EngineError, McpError, createEngine, envFilePath, parseEnvFile, redact } from "./engine.ts";
import { ToolError, callTool, listTools } from "./mcp.ts";
import { permissionSchema } from "./protocol.ts";
import { playerState, watchState } from "./state.ts";
import { PanelCliError, runPanel } from "./panel.ts";

const USAGE = `Usage: pnpm player <command>

  connect [--engine URL] --room CODE [--permission read|act|owner] [--label TEXT] [--write-env FILE]
      Approve this app for one room in your signed-in browser. Prints the two values to store
      (CODE_GODS_ENGINE_URL, CODE_GODS_CREDENTIAL). Default permission: act. The label is self-reported.
  status [--pretty]
      Engine reachable, credential valid, room, permission, expiry and the current user.
  state [--pretty] [--objects N] [--events N] [--watch HZ [--count N]]
      The player-visible state as JSON: observation, recent events, myUtility, latest trajectories.
      --watch prints one JSON line per change, at most HZ (0.1-5) per second.
  tools [--pretty]
      The agent tools this credential may use (the engine's MCP server at <engine>/mcp).
  call TOOL ['JSON' | -] [--pretty]
      Call one tool with JSON arguments (or JSON on stdin with -), e.g.
      pnpm player call get_observation '{"objectsLimit": 10}'. Results are untrusted game data.
  assistant status | observation | events [--after SEQ] [--limit N] | receipt ID | wake | disconnect
  assistant command [--retry-unknown] < envelope.json      (act or owner credential)
  assistant room-state | ai-catalog | room-command < action.json   (owner credential)
  panel list | push <slug> [--file PATH] | pull <slug> [--version N] [--file PATH] [--force]
      Stored panels (docs/panels.md): push compiles and saves a file (default
      artifacts/player-web/src/panels/<slug>.tsx; act or owner credential) and prints the diagnostics;
      pull writes a stored version to a file (never overwriting without --force); list shows them all.
`;

type Flags = Record<string, string | boolean>;
function parseFlags(args: string[], values: string[], booleans: string[] = [], positional = 0): Flags {
  const flags: Flags = {};
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) { rest.push(arg); continue; }
    const [name, inline] = arg.slice(2).split(/=(.*)/s, 2);
    if (name in flags) throw new AssistantError("INVALID", `--${name} given twice`);
    if (booleans.includes(name) && inline === undefined) flags[name] = true;
    else if (values.includes(name)) {
      const value = inline ?? args[++i];
      if (value === undefined || (inline === undefined && value.startsWith("--"))) throw new AssistantError("INVALID", `--${name} needs a value`);
      flags[name] = value;
    } else throw new AssistantError("INVALID", `Unknown option --${name}`);
  }
  if (rest.length > positional) throw new AssistantError("INVALID", `Unexpected argument: ${rest[positional]}`);
  if (rest.length) flags._ = rest[0];
  return flags;
}
const int = (flags: Flags, name: string, min: number, max: number): number | undefined => {
  if (flags[name] === undefined) return undefined;
  const n = Number(flags[name]);
  if (!Number.isInteger(n) || n < min || n > max) throw new AssistantError("INVALID", `--${name} must be an integer from ${min} to ${max}`);
  return n;
};

const print = (value: unknown, pretty = false) => process.stdout.write(redact(JSON.stringify(value, null, pretty ? 2 : undefined)) + "\n");
const note = (text: string) => process.stderr.write(redact(text) + "\n");

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) throw new AssistantError("INVALID", "Pipe the JSON on stdin, e.g. `cat envelope.json | pnpm player assistant command`.");
  let text = "";
  const timer = setTimeout(() => process.stdin.destroy(new Error("stdin timeout")), 15000);
  try {
    for await (const chunk of process.stdin) {
      text += chunk.toString();
      if (Buffer.byteLength(text) > 65536) throw new AssistantError("INVALID", "Input too large (64 KiB max)");
    }
  } catch (error) {
    if (error instanceof AssistantError) throw error;
    throw new AssistantError("INVALID", "Could not read stdin within 15 seconds");
  } finally { clearTimeout(timer); }
  return text;
}

/** The engine URL for connect: --engine, else the configured Secret or env file. */
function configuredEngineUrl(): string | undefined {
  if (process.env[ENGINE_URL_VAR]) return process.env[ENGINE_URL_VAR];
  const file = envFilePath();
  return existsSync(file) ? parseEnvFile(readFileSync(file, "utf8"))[ENGINE_URL_VAR] : undefined;
}

async function connect(args: string[]) {
  const flags = parseFlags(args, ["engine", "room", "permission", "label", "write-env"]);
  const engineUrl = (flags.engine as string | undefined) ?? configuredEngineUrl();
  if (!engineUrl) throw new AssistantError("INVALID", `Give the engine's site URL with --engine URL (or set ${ENGINE_URL_VAR}).`);
  if (typeof flags.room !== "string") throw new AssistantError("INVALID", "--room CODE is required (the room's short code, GUID or id).");
  const permission = permissionSchema.safeParse(flags.permission ?? "act");
  if (!permission.success) throw new AssistantError("INVALID", "--permission must be read, act or owner");
  const label = typeof flags.label === "string" ? flags.label : "player app";
  if (process.env[CREDENTIAL_VAR]) note(`Note: ${CREDENTIAL_VAR} is already set. The old credential stays valid until it expires or you revoke it (pnpm player assistant disconnect, or the engine's player page).`);
  const result = await connectDevice({
    engineUrl, room: flags.room, permission: permission.data, label,
    onPending: p => note([
      "",
      "Open this page in the browser where you are signed in to the engine, and approve:",
      `  ${p.verificationUrl}`,
      `Comparison code: ${p.userCode}`,
      `Check that the page shows this code, room ${p.roomCode} and permission ${p.permission}${p.permission === "owner" ? " (full owner control: settings, AI budget, start/end, playing as you)" : ""}.`,
      `The label "${p.label}" is self-reported, not a verified identity.`,
      `Waiting for approval (expires ${new Date(p.expiresAt).toISOString()})...`,
    ].join("\n")),
  });
  const expires = new Date(result.expiresAt).toISOString();
  if (typeof flags["write-env"] === "string") {
    const file = resolve(process.env.INIT_CWD ?? process.cwd(), flags["write-env"]);
    updateEnvFile(file, { [ENGINE_URL_VAR]: result.engineUrl, [CREDENTIAL_VAR]: result.credential });
    const ignored = spawnSync("git", ["check-ignore", "-q", file], { cwd: dirname(file) }).status;
    if (ignored === 1) note(`Warning: ${file} is not gitignored. Never commit it.`);
    print({ approved: true, room: result.roomCode, roomId: result.roomId, permission: result.permission, credentialId: result.credentialId,
      expiresAt: expires, wrote: file, mode: "0600", variables: [ENGINE_URL_VAR, CREDENTIAL_VAR] }, true);
    return;
  }
  // The only place a secret is ever printed: once, to stdout.
  process.stdout.write([
    `Approved: room ${result.roomCode}, permission ${result.permission}, credential expires ${expires}.`,
    "",
    "Store these two values in your environment's secret store (e.g. Replit Secrets, Codespaces secrets or .env.local), then restart the player app's dev server:",
    "",
    `${ENGINE_URL_VAR}=${result.engineUrl}`,
    `${CREDENTIAL_VAR}=${result.credential}`,
    "",
    `Keep ${CREDENTIAL_VAR} private: whoever holds it can ${result.permission === "read" ? "see your private game view" : "play"} in this room as you until it expires or is revoked.`,
    "It is shown only this once. Never paste it into chat, code, commits or logs. Revoke it on the engine's player page or with `pnpm player assistant disconnect`.",
    "",
  ].join("\n"));
}

async function main(argv: string[]) {
  const [command, ...args] = argv;
  switch (command) {
    case "connect": return connect(args);
    case "status": {
      const flags = parseFlags(args, [], ["pretty"]);
      const result = await status(createEngine());
      print(result, flags.pretty === true);
      if (!result.ok) process.exitCode = 1;
      return;
    }
    case "state": {
      const flags = parseFlags(args, ["objects", "events", "watch", "count"], ["pretty"]);
      const options = { objects: int(flags, "objects", 0, 2000), events: int(flags, "events", 1, 50) };
      const engine = createEngine();
      if (flags.watch === undefined) return print(await playerState(engine, options), flags.pretty === true);
      const hz = Number(flags.watch);
      if (!(hz >= 0.1 && hz <= 5)) throw new AssistantError("INVALID", "--watch HZ must be between 0.1 and 5");
      const watcher = await watchState(engine, { ...options, hz, count: int(flags, "count", 1, 1_000_000), onLine: line => print(line),
        onError: error => { print({ error: error instanceof EngineError ? error.message : "Subscription failed", code: error instanceof EngineError ? error.code : undefined }); process.exitCode = 1; } });
      process.once("SIGINT", watcher.stop);
      process.once("SIGTERM", watcher.stop);
      await watcher.done;
      return;
    }
    case "tools": {
      const flags = parseFlags(args, [], ["pretty"]);
      const tools = await listTools(createEngine());
      print({ tools: tools.map(t => ({ name: t.name, title: t.title, description: t.description, readOnly: t.annotations?.readOnlyHint, destructive: t.annotations?.destructiveHint, input: t.inputSchema })) },
        flags.pretty === true);
      return;
    }
    case "call": {
      const flags = parseFlags(args, [], ["pretty"], 2);
      const [name, json] = args.filter(a => !a.startsWith("--"));
      if (!name) throw new AssistantError("INVALID", "call takes a tool name (see `pnpm player tools`) and JSON arguments");
      const text = json === "-" ? await readStdin() : json ?? "{}";
      let input: unknown;
      try { input = JSON.parse(text); } catch { throw new AssistantError("INVALID", "The arguments are not JSON"); }
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new AssistantError("INVALID", "The arguments must be a JSON object");
      print(await callTool(createEngine(), name, input as Record<string, unknown>, { timeoutMs: 135_000 }), flags.pretty === true);
      return;
    }
    case "assistant": {
      const [sub, ...rest] = args;
      const spec: Record<string, [string[], string[], number]> = {
        status: [[], [], 0], observation: [[], [], 0], events: [["after", "limit"], [], 0], receipt: [[], [], 1], wake: [[], [], 0],
        disconnect: [[], [], 0], command: [[], ["retry-unknown"], 0], "room-state": [[], [], 0], "ai-catalog": [[], [], 0], "room-command": [[], [], 0],
      };
      if (!sub || !spec[sub]) { process.stdout.write(USAGE); process.exitCode = sub ? 1 : 0; return; }
      const flags = parseFlags(rest, ...spec[sub]);
      const result = await runAssistant(createEngine(), sub, flags, { readStdin });
      print(result);
      if (sub === "status" && !(result as { ok?: boolean }).ok) process.exitCode = 1;
      return;
    }
    case "panel": {
      const [sub, ...rest] = args;
      const spec: Record<string, [string[], string[], number]> = { list: [[], [], 0], push: [["file"], [], 1], pull: [["file", "version"], ["force"], 1] };
      if (!sub || !spec[sub]) { process.stdout.write(USAGE); process.exitCode = sub ? 1 : 0; return; }
      const { result, ok } = await runPanel(createEngine(), sub, parseFlags(rest, ...spec[sub]));
      print(result, sub === "list");
      if (!ok) process.exitCode = 1;
      return;
    }
    case undefined: case "help": case "--help": case "-h":
      process.stdout.write(USAGE); return;
    default:
      process.stdout.write(USAGE); process.exitCode = 1;
  }
}

main(process.argv.slice(2)).then(() => {
  // ConvexHttpClient keeps no handles; exit promptly unless a watcher is still running.
}, error => {
  if (error instanceof AssistantError) print({ error: error.message, code: error.code, ...error.extra });
  else if (error instanceof PanelCliError) print({ error: error.message, code: error.code });
  else if (error instanceof EngineError || error instanceof ToolError) print({ error: error.message, code: error.code });
  else if (error instanceof McpError) print({ error: error.message, code: "INVALID", rpcCode: error.code });
  else {
    const data = (error as { data?: { code?: string; message?: string } })?.data;
    // Unknown exceptions can carry request details: print only a ConvexError's own message, never raw errors.
    print(data?.message ? { error: data.message, code: data.code ?? "ERROR" } : { error: "Operation failed. Check the arguments and `pnpm player status`." });
  }
  process.exitCode = 1;
});
