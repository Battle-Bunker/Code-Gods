/**
 * A pane's own record of its failed live queries. Inside a pane a failed query is held here (the pane alone shows
 * "could not load" above its content, which stays mounted, so its subscription stays live and the line goes when a
 * value arrives); outside a pane it goes to the dock's record (sdk/query-errors.ts). Either way the consumer gets
 * "not loaded" and nothing is thrown through the root (sdk/transport.ts).
 */
import { createContext } from "react";
import type { ErrorRecord } from "./query-errors";

export const PaneErrorContext = createContext<ErrorRecord | null>(null);
