/**
 * The v2 CLI (`pnpm player …`), generated from the directory: `<namespace> <verb> --flag value`, `call <id> '<json>'`
 * and `help`. By default it talks to a deployment through `/mcp` with a device-flow credential (remote.ts). With
 * `--fake` first it runs against the in-memory fake instead, whose world it keeps in a JSON file between runs
 * (`--state`, default ./.v2-fake.json), acting as `--as <userId>` in `--room <id>` / `--game <id>`:
 *   pnpm player --fake --as u1 room create --name "Lines night"
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseCli } from "./surfaces.ts";
import { defaultConfigPath, helpLines, LOCAL_SITE, runRemoteCli } from "./remote.ts";
import { createFake, emptyState, type FakeState } from "./fake.ts";

export interface CliIo { out(line: string): void; err(line: string): void }

/** Runs one CLI invocation against a fake; returns the exit code. */
export async function runCli(argv: readonly string[], state: FakeState, io: CliIo): Promise<number> {
  // Global flags come before the command, so a command's own flags and values are never taken for them.
  const global: Record<string, string> = {};
  let i = 0;
  for (let m; i < argv.length && (m = /^--(as|room|game|state)$/.exec(argv[i]!)); i += 2) {
    if (argv[i + 1] === undefined) { io.err(`--${m[1]} needs a value`); return 2; }
    global[m[1]!] = argv[i + 1]!;
  }
  const rest = argv.slice(i);
  if (rest.length === 0 || rest[0] === "help") {
    const lines = helpLines(rest.slice(1));
    if (!lines) { io.err(`No command ${rest.slice(1).join(" ")}`); return 2; }
    for (const l of lines) io.out(l);
    return 0;
  }
  const parsed = parseCli(rest);
  if (!parsed.ok) { io.err(parsed.error); return 2; }
  const fake = createFake(state);
  const userId = global.as ?? "u1";
  if (!state.users[userId]) fake.addUser(userId, userId);
  const out = await fake.perform({ userId, roomId: global.room ?? null, gameId: global.game ?? null, via: "cli" }, parsed.id, parsed.args);
  if (!out.ok) { io.err(`${out.error.code}: ${out.error.message}${out.error.fix ? ` (${out.error.fix})` : ""}`); return 1; }
  io.out(JSON.stringify(out.result, null, 2));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const io = { out: (l: string) => console.log(l), err: (l: string) => console.error(l) };
  const argv = process.argv.slice(2);
  if (argv[0] === "--fake") {
    const at = argv.indexOf("--state");
    const file = (at >= 0 ? argv[at + 1] : undefined) ?? ".v2-fake.json";
    const state: FakeState = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : emptyState();
    process.exitCode = await runCli(argv.slice(1), state, io);
    writeFileSync(file, JSON.stringify(state));
  } else {
    process.exitCode = await runRemoteCli(argv, {
      io, fetch, configPath: defaultConfigPath(), defaultSite: process.env.CODE_GODS_ENGINE_URL?.replace(/\/+$/, "") || LOCAL_SITE,
      sleep: ms => new Promise(r => setTimeout(r, ms)),
    });
  }
}
