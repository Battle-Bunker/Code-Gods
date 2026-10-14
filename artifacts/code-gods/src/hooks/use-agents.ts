import { useQueryClient } from "@tanstack/react-query";
import { useListAdminAiAgents, useListPublicAiAgents, useCreateAdminAiAgent, useUpdateAdminAiAgent, useDeleteAdminAiAgent, getListAdminAiAgentsQueryKey, getListPublicAiAgentsQueryKey } from "@workspace/api-client-react";

export interface AiAgent { id: string; name: string; provider: string; model: string; prompt: string; revision: number; createdAt: string; updatedAt: string }
export interface AiModel { id: string; label: string; provider: string; configured: boolean; inputUsdPerMillion: number; outputUsdPerMillion: number }
export interface AgentInput { name: string; provider: string; model: string; prompt: string }
export interface AgentOption { id: string; name: string; provider: string; model: string }

const ADMIN_KEY = getListAdminAiAgentsQueryKey();
const LIST_KEY = getListPublicAiAgentsQueryKey();

export function useAdminAgents() {
  return useListAdminAiAgents({ query: { queryKey: ADMIN_KEY, retry: 1 } });
}

export function useAgentOptions(enabled = true) {
  return useListPublicAiAgents({ query: { queryKey: LIST_KEY, enabled, staleTime: 30_000, retry: 1 } });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => { qc.invalidateQueries({ queryKey: ADMIN_KEY }); qc.invalidateQueries({ queryKey: LIST_KEY }); };
}

export function useCreateAgent() {
  const inv = useInvalidate();
  const m = useCreateAdminAiAgent({ mutation: { onSuccess: inv } });
  return { ...m, mutate: (d: AgentInput, o?: Parameters<typeof m.mutate>[1]) => m.mutate({ data: d as Parameters<typeof m.mutate>[0]["data"] }, o) };
}
export function useUpdateAgent() {
  const inv = useInvalidate();
  const m = useUpdateAdminAiAgent({ mutation: { onSuccess: inv } });
  return { ...m, mutate: ({ id, ...d }: AgentInput & { id: string; revision: number }, o?: Parameters<typeof m.mutate>[1]) =>
    m.mutate({ id, data: d as Parameters<typeof m.mutate>[0]["data"] }, o) };
}
export function useDeleteAgent() {
  const inv = useInvalidate();
  const m = useDeleteAdminAiAgent({ mutation: { onSuccess: inv } });
  return { ...m, mutate: ({ id, revision }: { id: string; revision: number }, o?: Parameters<typeof m.mutate>[1]) =>
    m.mutate({ id, params: { revision } }, o) };
}
