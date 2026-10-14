import { pgTable, text, timestamp, integer, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const aiAgentsTable = pgTable("cg_ai_agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  prompt: text("prompt").notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  check("cg_ai_agents_prompt_length", sql`char_length(${table.prompt}) <= 10000`),
  check("cg_ai_agents_provider", sql`${table.provider} in ('anthropic', 'openai')`),
  check("cg_ai_agents_revision", sql`${table.revision} > 0`),
]);

// Separate durable marker: deleting every seed never causes reseeding on boot.
export const agentLibrarySeedsTable = pgTable("cg_agent_library_seeds", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
