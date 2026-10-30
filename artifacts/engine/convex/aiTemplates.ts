/**
 * The AI template library: persistent, admin-editable named records (provider, model, prompt ≤ 10,000
 * characters), Sonnet 5.5 by default. Defaults are seeded once; edits and deletions are preserved (deleted
 * templates stay as tombstones, so a re-seed never recreates them). Admin CRUD is gated by `viewer.isAdmin`
 * (the verified-email allowlist). Members see only the public catalog (no prompts).
 */
import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { requireViewer } from "./auth/access";
import { AI_MODEL_CATALOG, DEFAULT_AGENT_MODEL, PROMPT_MAX, findModel, mockEnabled, providerConfigured } from "./lib/aiModels";
import { fail } from "./lib/errors";

const SEEDS = [{
  templateId: "sonnet-strategist", name: "Sonnet Strategist", provider: "anthropic" as const, model: DEFAULT_AGENT_MODEL,
  prompt: "Play strategically. Understand your private utility function, negotiate constructively, and build efficient agents while respecting your energy budget.",
}];

export async function seed(ctx: MutationCtx) {
  for (const s of SEEDS) {
    const existing = await ctx.db.query("aiTemplates").withIndex("by_template", q => q.eq("templateId", s.templateId)).first();
    if (existing) continue; // seeded before: edited or deleted, keep it that way
    const now = Date.now();
    await ctx.db.insert("aiTemplates", { ...s, revision: 1, createdAt: now, updatedAt: now, deleted: false });
  }
}
export const ensureSeeded = internalMutation({ args: {}, handler: async (ctx) => { await seed(ctx); } });

async function requireAdmin(ctx: Parameters<typeof requireViewer>[0]) {
  const viewer = await requireViewer(ctx);
  if (!viewer.isAdmin) fail("FORBIDDEN", "Administrator access required");
  return viewer;
}
function validate(input: { name: string; provider: string; model: string; prompt: string }) {
  const name = input.name.trim();
  if (!name || name.length > 100) fail("BAD_REQUEST", "Name must be 1–100 characters");
  if (input.prompt.length > PROMPT_MAX) fail("BAD_REQUEST", `Prompts are at most ${PROMPT_MAX} characters`);
  if (!findModel(input.provider, input.model)) fail("BAD_REQUEST", "Select an available model for the chosen provider");
  return { ...input, name, provider: input.provider as "anthropic" | "openai" };
}
const view = (t: { templateId: string; name: string; provider: string; model: string; prompt: string; revision: number; createdAt: number; updatedAt: number }) => ({
  id: t.templateId, name: t.name, provider: t.provider, model: t.model, prompt: t.prompt, revision: t.revision,
  createdAt: new Date(t.createdAt).toISOString(), updatedAt: new Date(t.updatedAt).toISOString(),
});

/** Public catalog for owners adding AI seats (the assistant's `ai-catalog`): no prompts. */
export const catalog = query({
  args: {},
  handler: async (ctx) => {
    await requireViewer(ctx);
    const rows = await ctx.db.query("aiTemplates").withIndex("by_deleted", q => q.eq("deleted", false)).take(500);
    return { agents: rows.sort((a, b) => a.createdAt - b.createdAt).map(t => ({ id: t.templateId, name: t.name, provider: t.provider, model: t.model })) };
  },
});

export const adminList = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("aiTemplates").withIndex("by_deleted", q => q.eq("deleted", false)).take(500);
    return {
      agents: rows.sort((a, b) => a.createdAt - b.createdAt).map(view),
      models: AI_MODEL_CATALOG.map(m => ({ ...m, configured: mockEnabled() || providerConfigured(m.provider) })),
    };
  },
});

export const create = mutation({
  args: { name: v.string(), provider: v.string(), model: v.string(), prompt: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const input = validate(args), now = Date.now();
    const templateId = crypto.randomUUID();
    await ctx.db.insert("aiTemplates", { templateId, ...input, revision: 1, createdAt: now, updatedAt: now, deleted: false });
    return view({ templateId, ...input, revision: 1, createdAt: now, updatedAt: now });
  },
});

/** Optimistic on `revision`: a stale editor gets a conflict. */
export const update = mutation({
  args: { id: v.string(), revision: v.number(), name: v.string(), provider: v.string(), model: v.string(), prompt: v.string() },
  handler: async (ctx, { id, revision, ...rest }) => {
    await requireAdmin(ctx);
    const input = validate(rest);
    const doc = await ctx.db.query("aiTemplates").withIndex("by_template", q => q.eq("templateId", id)).first();
    if (!doc || doc.deleted) fail("NOT_FOUND", "AI agent not found");
    if (doc.revision !== revision) fail("CONFLICT", "AI agent changed; reload before saving");
    const now = Date.now();
    await ctx.db.patch(doc._id, { ...input, revision: revision + 1, updatedAt: now });
    return view({ ...doc, ...input, revision: revision + 1, updatedAt: now });
  },
});

export const remove = mutation({
  args: { id: v.string(), revision: v.number() },
  handler: async (ctx, { id, revision }) => {
    await requireAdmin(ctx);
    const doc = await ctx.db.query("aiTemplates").withIndex("by_template", q => q.eq("templateId", id)).first();
    if (!doc || doc.deleted) fail("NOT_FOUND", "AI agent not found");
    if (doc.revision !== revision) fail("CONFLICT", "AI agent changed; reload before saving");
    await ctx.db.patch(doc._id, { deleted: true, revision: revision + 1, updatedAt: Date.now() });
    return null;
  },
});
