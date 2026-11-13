/**
 * A pane's own record of its failed live queries. Inside a pane a failed query is reported here (the pane alone shows
 * "could not load" above its content, which stays mounted, so its subscription stays live and the line goes when a
 * value arrives); outside a pane it goes to the dock's record (sdk/query-errors.ts). Either way the consumer gets
 * "not loaded" and nothing is thrown through the root (sdk/transport.ts useSdkQuery).
 */
import { createContext } from "react";

export interface PaneErrors { report(key: string, message: string): void; clear(key: string): void }
export const PaneErrorContext = createContext<PaneErrors | null>(null);
