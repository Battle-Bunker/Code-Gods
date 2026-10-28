#!/usr/bin/env node
/**
 * Local engine: the official Convex CLI's local backend (`npx convex dev`, anonymous local deployment;
 * no Convex account), with the test environment variables. Usage: pnpm --filter @workspace/engine dev
 */
import { spawnSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const env = { ...process.env, CONVEX_AGENT_MODE: "anonymous" };
const run = (...args) => spawnSync("npx", ["convex", ...args], { env, stdio: "inherit" });

// Push once so the deployment exists, then configure test-only environment variables.
if (run("dev", "--once").status !== 0) process.exit(1);
const vars = {
  CODE_GODS_SEASON_SALT: process.env.CODE_GODS_SEASON_SALT ?? `local-${randomBytes(16).toString("hex")}`,
  CODE_GODS_AI_MOCK: "1",
};
for (const [name, value] of Object.entries(vars)) run("env", "set", name, value);
spawn("npx", ["convex", "dev", ...process.argv.slice(2)], { env, stdio: "inherit" }).on("exit", code => process.exit(code ?? 0));
