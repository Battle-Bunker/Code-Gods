#!/usr/bin/env node
/**
 * Switch the LOCAL deployment's in-client assistant between the mock and a real Anthropic provider.
 *
 *   pnpm --filter @workspace/engine assistant:live     copy CODE_GODS_ANTHROPIC_API_KEY into the local deployment
 *                                                      as ANTHROPIC_API_KEY and set ASSISTANT_LIVE=1; also copies
 *                                                      CODE_GODS_OPENAI_API_KEY (or OPENAI_API_KEY) as OPENAI_API_KEY
 *                                                      when one is set, for rooms on an OpenAI model
 *   pnpm --filter @workspace/engine assistant:mock     remove both (the standard local state)
 *   pnpm --filter @workspace/engine assistant:status   report the mode; never prints a key
 *
 * AI seats stay mocked (AI_MOCK=1, set by scripts/dev.mjs): only the assistant goes live
 * (convex/lib/aiModels.ts assistantMockEnabled). Takes effect without a restart. scripts/dev.mjs returns the
 * deployment to mock on every start, so the mock-scripted suites never spend money by accident.
 *
 * Local only: local-only.mjs refuses cloud deployment variables, and this script also requires the checkout's
 * deployment (artifacts/engine/.env.local, written by `pnpm --filter @workspace/engine dev`) to be the
 * anonymous local backend on a loopback URL. The key goes through a private temp file (umask 077, deleted at
 * once), never through argv or output.
 */
import "./local-only.mjs";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, CONVEX_AGENT_MODE: "anonymous" };
const convex = (args, options = {}) => spawnSync("npx", ["convex", ...args], { cwd: root, env, encoding: "utf8", ...options });
const die = message => { console.error(`[assistant] ${message}`); process.exit(1); };

const mode = process.argv[2];
if (!["live", "mock", "status"].includes(mode)) die("usage: assistant-provider.mjs live|mock|status");

// The local deployment only: an anonymous deployment served on loopback.
let dotenv = "";
try { dotenv = readFileSync(join(root, ".env.local"), "utf8"); } catch { /* checked below */ }
const read = name => dotenv.match(new RegExp(`^\\s*${name}\\s*=\\s*["']?([^"'\\s#]*)`, "m"))?.[1] ?? "";
const deployment = process.env.CONVEX_DEPLOYMENT || read("CONVEX_DEPLOYMENT");
const url = read("CONVEX_URL");
if (!/^anonymous:/.test(deployment)) die(`expected the anonymous local deployment (start \`pnpm --filter @workspace/engine dev\` first); found ${deployment ? `"${deployment}"` : "none"}`);
if (!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+\/?$/.test(url)) die(`expected a loopback CONVEX_URL in artifacts/engine/.env.local; found ${url ? `"${url}"` : "none"}`);

/** A deployment env var's value, or "" (the CLI prints nothing and exits 0 or 1 when it is unset). Never printed. */
const current = name => (convex(["env", "get", name]).stdout ?? "").trim();
const remove = name => {
  if (!current(name)) return;
  if (convex(["env", "remove", name], { stdio: ["ignore", "ignore", "inherit"] }).status !== 0) die(`removing ${name} failed`);
};

if (mode === "live") {
  const key = process.env.CODE_GODS_ANTHROPIC_API_KEY?.trim();
  if (!key) die("CODE_GODS_ANTHROPIC_API_KEY is not set in this shell");
  if (!/^[A-Za-z0-9_-]+$/.test(key)) die("CODE_GODS_ANTHROPIC_API_KEY does not look like an API key (unexpected characters)");
  const openai = (process.env.CODE_GODS_OPENAI_API_KEY || process.env.OPENAI_API_KEY)?.trim();
  if (openai && !/^[A-Za-z0-9_-]+$/.test(openai)) die("the OpenAI API key does not look like an API key (unexpected characters)");
  const old = process.umask(0o077);
  const dir = mkdtempSync(join(tmpdir(), "cg-assistant-"));
  let status;
  try {
    const file = join(dir, "assistant.env");
    writeFileSync(file, `ANTHROPIC_API_KEY='${key}'\nASSISTANT_LIVE='1'\n${openai ? `OPENAI_API_KEY='${openai}'\n` : ""}`, { mode: 0o600 });
    status = convex(["env", "set", "--force", "--from-file", file], { stdio: ["ignore", "ignore", "inherit"] }).status;
  } finally {
    rmSync(dir, { recursive: true, force: true });
    process.umask(old);
  }
  if (status !== 0) die("setting the local deployment's env vars failed");
} else if (mode === "mock") {
  remove("ASSISTANT_LIVE");
  remove("ANTHROPIC_API_KEY");
  remove("OPENAI_API_KEY");
}

const live = current("ASSISTANT_LIVE") === "1", aiMock = current("AI_MOCK") === "1", keySet = !!current("ANTHROPIC_API_KEY"), openaiSet = !!current("OPENAI_API_KEY");
const effective = aiMock && !live ? "mock" : keySet ? `live (anthropic${openaiSet ? ", openai" : ""})` : "live, but no ANTHROPIC_API_KEY: turns fail as not set up";
console.log(`[assistant] ${effective} — AI_MOCK=${aiMock ? "1" : "unset"} ASSISTANT_LIVE=${live ? "1" : "unset"} ANTHROPIC_API_KEY=${keySet ? "set" : "unset"} OPENAI_API_KEY=${openaiSet ? "set" : "unset"}`);
