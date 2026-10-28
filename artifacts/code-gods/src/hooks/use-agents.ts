import { useMutation } from "convex/react";
import { api, useLive } from "@/lib/convex";

export type { AiAgent, AiModel } from "@/lib/types";
export interface AgentInput { name: string; provider: string; model: string; prompt: string }

/** Admin library with prompts and the model catalog (admins only). */
export const useAdminAgents = (enabled = true) => useLive(api.aiTemplates.adminList, enabled ? {} : "skip");
/** Public library for seating AI players (no prompts). */
export const useAgentOptions = (enabled = true) => useLive(api.aiTemplates.catalog, enabled ? {} : "skip");

export const useCreateAgent = () => useMutation(api.aiTemplates.create);
export const useUpdateAgent = () => useMutation(api.aiTemplates.update);
export const useDeleteAgent = () => useMutation(api.aiTemplates.remove);
