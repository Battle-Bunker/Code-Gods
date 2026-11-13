export * from "./settings.ts";
export * from "./settings-model.ts";
export * from "./scoring.ts";
export * from "./random.ts";
export * from "./game-timer.ts";
export * from "./identifiers.ts";
export * from "./energy.ts";

/** The read price (docs/energy-model.md §2.1), re-exported for the texts that explain the economy. */
export { CHANGE_BETA, CHANGE_READ_RATIO, READ_PRICE } from "@workspace/game-types";
/** The cost models a room may price changes with (settings.costModel), for the clients that only depend on game-core. */
export { COST_MODELS, DEFAULT_COST_MODEL } from "@workspace/game-types";
/** What a change costs, in words, under the room's cost model (docs/energy-model.md §4). */
export * from "./change-cost.ts";
