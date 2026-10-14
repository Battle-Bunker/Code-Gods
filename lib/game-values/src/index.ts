export { generate, GenerationError } from "./generate.ts";
export type { Pantheon } from "./generate.ts";
export { GENERATOR_ID, payoffs } from "./model.ts";
export type { Options, Domain, ObjectValue, Language, Deity, Manifest, Preference } from "./model.ts";
export type { ScreeningReport, Witness, PairWitness, Baseline, TransitionStats } from "./screen.ts";
export { uniformAgentPayoffs, composeConstantAgents } from "./baselines.ts";

import { generate } from "./generate.ts";
import { GENERATOR_ID } from "./model.ts";
/** No dynamic imports, mutation, LLM, network, runtime execution or host eval. */
export const registry = Object.freeze({ [GENERATOR_ID]: generate });
