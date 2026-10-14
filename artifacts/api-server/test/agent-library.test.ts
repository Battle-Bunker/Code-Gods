import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import type { Request } from "express";
import { pool } from "@workspace/db";
import { isAdmin, requireAdmin, type Identity } from "../src/lib/identity";
import {
  agentInputSchema, createAgent, updateAgent, deleteAgent, getAgentDefinition,
  initializeAgentLibrary, listPublicAgents, DEFAULT_AGENT_MODEL,
} from "../src/game/agent-library";

test("admin requires a verified OIDC email and browser session, never a name", () => {
  const previous = process.env.CODE_GODS_ADMIN_EMAILS;
  process.env.CODE_GODS_ADMIN_EMAILS = "admin@example.com";
  try {
    const identity: Identity = {
      id: "test", name: "admin@example.com", kind: "human", scope: "browser",
      email: "ADMIN@example.com", emailVerified: true, issuer: "https://replit.com/oidc",
    };
    assert.equal(isAdmin(identity), true);
    for (const invalid of [
      undefined, { ...identity, email: undefined }, { ...identity, emailVerified: false },
      { ...identity, email: "other@example.com" }, { ...identity, issuer: undefined },
      { ...identity, scope: "player" as const },
    ]) assert.equal(isAdmin(invalid), false);
    assert.throws(() => requireAdmin({} as Request), { status: 401 });
    assert.throws(() => requireAdmin({ identity: { ...identity, emailVerified: false } } as Request), { status: 403 });
  } finally {
    if (previous === undefined) delete process.env.CODE_GODS_ADMIN_EMAILS;
    else process.env.CODE_GODS_ADMIN_EMAILS = previous;
  }
});

test("prompt/name validation is bounded and rejects extra fields", () => {
  const input = { name: "Agent", provider: "anthropic", model: DEFAULT_AGENT_MODEL, prompt: "x".repeat(10000) };
  assert.equal(agentInputSchema.parse(input).prompt.length, 10000);
  assert.throws(() => agentInputSchema.parse({ ...input, prompt: "x".repeat(10001) }));
  assert.throws(() => agentInputSchema.parse({ ...input, prompt: null }));
  assert.throws(() => agentInputSchema.parse({ ...input, name: "   " }));
  assert.throws(() => agentInputSchema.parse({ ...input, provider: "unknown" }));
  assert.throws(() => agentInputSchema.parse({ ...input, secret: "extra" }));
});

test("Postgres CRUD uses optimistic revisions and deleting seeds survives initialization", async () => {
  // Dedicated connection + temporary schema: no real library records are touched.
  const client = await pool.connect();
  const schema = `agent_test_${randomUUID().replaceAll("-", "")}`;
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query("CREATE TABLE cg_ai_agents (LIKE public.cg_ai_agents INCLUDING ALL)");
    await client.query("CREATE TABLE cg_agent_library_seeds (LIKE public.cg_agent_library_seeds INCLUDING ALL)");
    // Route repository calls into the dedicated real Postgres test schema.
    pool.query = client.query.bind(client) as typeof pool.query;
    pool.connect = (async () => ({ query: client.query.bind(client), release() {} })) as typeof pool.connect;
    await initializeAgentLibrary();
    const seed = await getAgentDefinition("sonnet-strategist");
    assert.ok(seed);
    await deleteAgent(seed.id, seed.revision);
    await initializeAgentLibrary();
    assert.equal(await getAgentDefinition(seed.id), undefined);
    assert.equal((await listPublicAgents()).length, 0);
    const input = { name: "Editable", provider: "anthropic" as const, model: DEFAULT_AGENT_MODEL, prompt: "Private strategy" };
    await assert.rejects(createAgent({ ...input, model: "made-up" }), { status: 400 });
    const agent = await createAgent(input);
    assert.equal(agent.revision, 1);
    assert.equal((await getAgentDefinition(agent.id))?.prompt, input.prompt);
    const publicAgent = (await listPublicAgents())[0];
    assert.deepEqual(Object.keys(publicAgent).sort(), ["id", "model", "name", "provider"]);
    const updated = await updateAgent(agent.id, { ...input, name: "Renamed", revision: 1 });
    assert.equal(updated.revision, 2);
    assert.equal(updated.name, "Renamed");
    await assert.rejects(updateAgent(agent.id, { ...input, revision: 1 }), { status: 409 });
    await assert.rejects(deleteAgent(agent.id, 1), { status: 409 });
    await deleteAgent(agent.id, 2);
    assert.equal(await getAgentDefinition(agent.id), undefined);
    await assert.rejects(deleteAgent(agent.id, 2), { status: 404 });
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    client.release();
    await pool.end();
  }
});
