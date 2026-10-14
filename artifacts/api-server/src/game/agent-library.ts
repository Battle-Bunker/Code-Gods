import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { z } from "zod";
import { AI_MODEL_CATALOG, getAIModel } from "./ai-provider";

export type AgentProvider = "anthropic" | "openai";
export type AgentDefinition = {
  id: string; name: string; provider: AgentProvider; model: string; prompt: string;
  revision: number; createdAt: string; updatedAt: string;
};
export type AgentModel = {
  id: string; label: string; provider: AgentProvider; configured: boolean;
  inputUsdPerMillion: number; outputUsdPerMillion: number;
};

// Standard uncached text token rates, verified against official provider docs.
// https://platform.claude.com/docs/en/about-claude/models/overview
// https://platform.claude.com/docs/en/about-claude/pricing
// https://developers.openai.com/api/docs/pricing.md
export const DEFAULT_AGENT_MODEL = "claude-sonnet-5-5";

export function listAgentModels(): AgentModel[] {
  return AI_MODEL_CATALOG.map(model => ({
    ...model, configured: Boolean((model.provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY)?.trim()),
  }));
}
export const agentInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  provider: z.enum(["anthropic", "openai"]),
  model: z.string().min(1),
  prompt: z.string().max(10000),
}).strict();
export const agentUpdateSchema = agentInputSchema.extend({ revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) });
export const agentRevisionSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export type AgentInput = z.infer<typeof agentInputSchema>;
function validateModel(input: AgentInput) {
  getAIModel(input.provider, input.model);
}
function definition(row: Record<string, any>): AgentDefinition {
  return {
    id: row.id, name: row.name, provider: row.provider, model: row.model, prompt: row.prompt,
    revision: row.revision, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function initializeAgentLibrary(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const marker = await client.query("INSERT INTO cg_agent_library_seeds(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id", ["initial-v1"]);
    if (marker.rowCount) {
      await client.query(
        "INSERT INTO cg_ai_agents(id,name,provider,model,prompt) VALUES($1,$2,$3,$4,$5)",
        ["sonnet-strategist", "Sonnet Strategist", "anthropic", DEFAULT_AGENT_MODEL,
          "Play strategically. Understand your private values, negotiate constructively, and build efficient agents while respecting your energy budget."],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
export async function listAgentDefinitions(): Promise<AgentDefinition[]> {
  const result = await pool.query("SELECT * FROM cg_ai_agents ORDER BY created_at,id");
  return result.rows.map(definition);
}
export async function getAgentDefinition(id: string): Promise<AgentDefinition | undefined> {
  const result = await pool.query("SELECT * FROM cg_ai_agents WHERE id=$1", [id]);
  return result.rows[0] ? definition(result.rows[0]) : undefined;
}
export async function listPublicAgents(): Promise<Pick<AgentDefinition, "id" | "name" | "provider" | "model">[]> {
  const result = await pool.query("SELECT id,name,provider,model FROM cg_ai_agents ORDER BY created_at,id");
  return result.rows;
}
export async function createAgent(input: AgentInput): Promise<AgentDefinition> {
  input = agentInputSchema.parse(input);
  validateModel(input);
  const result = await pool.query(
    "INSERT INTO cg_ai_agents(id,name,provider,model,prompt) VALUES($1,$2,$3,$4,$5) RETURNING *",
    [randomUUID(), input.name, input.provider, input.model, input.prompt],
  );
  return definition(result.rows[0]);
}
async function missingOrConflict(id: string): Promise<never> {
  if (!await getAgentDefinition(id)) throw Object.assign(new Error("AI agent not found"), { status: 404 });
  throw Object.assign(new Error("AI agent changed; reload before saving"), { status: 409 });
}
export async function updateAgent(id: string, input: z.infer<typeof agentUpdateSchema>): Promise<AgentDefinition> {
  input = agentUpdateSchema.parse(input);
  validateModel(input);
  const result = await pool.query(
    "UPDATE cg_ai_agents SET name=$2,provider=$3,model=$4,prompt=$5,revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$6 RETURNING *",
    [id, input.name, input.provider, input.model, input.prompt, input.revision],
  );
  return result.rows[0] ? definition(result.rows[0]) : missingOrConflict(id);
}
export async function deleteAgent(id: string, revision: number): Promise<void> {
  revision = agentRevisionSchema.parse(revision);
  const result = await pool.query("DELETE FROM cg_ai_agents WHERE id=$1 AND revision=$2 RETURNING id", [id, revision]);
  if (!result.rowCount) await missingOrConflict(id);
}
