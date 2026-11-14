/**
 * Which model a deployment uses for a kind of model step: the kind's own setting (AI_MODEL_ASSISTANT, AI_MODEL_SEAT,
 * AI_MODEL_PITCH), else AI_MODEL, else lib/v2-ai's DEFAULT_MODEL. Changing the default is the owner's call. Pure.
 */
import { DEFAULT_MODEL } from "@workspace/v2-ai";

export type StepKind = "assistant" | "seat" | "pitch";
const KIND_SETTING: Record<StepKind, string> = { assistant: "AI_MODEL_ASSISTANT", seat: "AI_MODEL_SEAT", pitch: "AI_MODEL_PITCH" };

/** The setting that decides `kind`'s model, and the model id it names. */
export function modelSetting(kind: StepKind, env: Readonly<Record<string, string | undefined>>): { setting: string; id: string } {
  const own = KIND_SETTING[kind];
  if (env[own]) return { setting: own, id: env[own]! };
  if (env.AI_MODEL) return { setting: "AI_MODEL", id: env.AI_MODEL };
  return { setting: "the default", id: DEFAULT_MODEL };
}
