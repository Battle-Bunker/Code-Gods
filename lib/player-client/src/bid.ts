/**
 * `pnpm player bid …`: the bid phase of a game start (docs/bid-phase.md) from the command line, as the human the
 * device credential belongs to. A thin client of the registry's bid tools over MCP (get_bidding, place_bid,
 * withdraw_bid, finish_bidding), so the CLI, MCP clients and the in-client assistant share one path and one set of
 * refusals. Each command is one-shot: it prints the engine's answer and exits.
 */
import type { Engine } from "./engine.ts";
import { callTool } from "./mcp.ts";

export class BidCliError extends Error {
  readonly code = "INVALID";
}

export const BID_USAGE = "Usage: pnpm player bid [show] | place FAMILY PERCENT | withdraw FAMILY | done | pass | reopen";

/** The tool call a `bid` subcommand makes. `pass` and `done` are the same call: done with no bids placed is a pass. */
export function bidCall(args: readonly string[]): { tool: "get_bidding" | "place_bid" | "withdraw_bid" | "finish_bidding"; args: Record<string, unknown> } {
  const [sub = "show", ...rest] = args;
  const only = (n: number) => { if (rest.length !== n) throw new BidCliError(BID_USAGE); };
  switch (sub) {
    case "show": only(0); return { tool: "get_bidding", args: {} };
    case "place": {
      only(2);
      const percent = Number(rest[1].replace(/%$/, ""));
      if (!Number.isInteger(percent) || percent < 1 || percent > 100) throw new BidCliError("A bid is a whole percentage from 1 to 100, e.g. `pnpm player bid place leapfrog 10`.");
      return { tool: "place_bid", args: { familyId: rest[0], percent } };
    }
    case "withdraw": only(1); return { tool: "withdraw_bid", args: { familyId: rest[0] } };
    case "done": case "pass": only(0); return { tool: "finish_bidding", args: { done: true } };
    case "reopen": only(0); return { tool: "finish_bidding", args: { done: false } };
    default: throw new BidCliError(BID_USAGE);
  }
}

/** Runs one bid subcommand and returns the engine's answer (the tool's data: untrusted game data). */
export async function runBid(engine: Engine, args: readonly string[]): Promise<unknown> {
  const call = bidCall(args);
  return (await callTool(engine, call.tool, call.args)).data;
}
