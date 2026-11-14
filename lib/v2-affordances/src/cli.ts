/**
 * The v2 CLI, generated from the directory: `<namespace> <verb> --flag value`, `call <id> '<json>'` and `help`.
 * Until the v2 server exists (W3) it runs against the in-memory fake, whose world it keeps in a JSON file between
 * runs (`--state`, default ./.v2-fake.json), acting as `--as <userId>` in `--room <id>` / `--game <id>`. Global flags
 * come first: pnpm --filter @workspace/v2-affordances cli --as u1 room create --name "Lines night"
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { cliCommands, parseCli } from "./surfaces.ts";
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
    const cmds = cliCommands().filter(c => !rest[1] || c.words[0] === rest[1] && (!rest[2] || c.words[1] === rest[2]));
    if (cmds.length === 0) { io.err(`No command ${rest.slice(1).join(" ")}`); return 2; }
    for (const c of cmds) io.out(rest[2] ? `${c.usage}\n\n${c.help}\n${c.flags.map(f => `  --${f.name}${f.required ? "" : " (optional)"}: ${f.description ?? f.type}${f.choices ? ` (one of ${f.choices.join(", ")})` : ""}`).join("\n")}` : `${c.usage}`);
    if (!rest[1]) io.out("\ncall <id> '<json>' runs any of them; global flags, before the command: --as <userId> --room <id> --game <id> --state <file>");
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
  const argv = process.argv.slice(2);
  const at = argv.indexOf("--state");
  const file = (at >= 0 ? argv[at + 1] : undefined) ?? ".v2-fake.json";
  const state: FakeState = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : emptyState();
  const code = await runCli(argv, state, { out: l => console.log(l), err: l => console.error(l) });
  writeFileSync(file, JSON.stringify(state));
  process.exitCode = code;
}
