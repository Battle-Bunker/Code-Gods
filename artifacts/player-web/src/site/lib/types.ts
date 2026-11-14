/** UI types, derived from the engine's Convex functions (the contract) where the engine types them. */
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/site/lib/convex-api";

export type AdminAgents = FunctionReturnType<typeof api.aiTemplates.adminList>;
export type AiAgent = AdminAgents["agents"][number];
export type AiModel = AdminAgents["models"][number];
