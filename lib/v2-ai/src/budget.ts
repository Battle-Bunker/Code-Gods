/**
 * Token and dollar accounting with caps. A caller checks a call's worst case before it (`allows`) and records what the
 * provider reported after it (`record`); a billed failure (ChatError with usage) is recorded too. One instance can be
 * shared by every model call that draws on the same pool (an AI seat's game, a player's assistant).
 */
import { usageUsd, type Prices, type Usage } from "./chat.ts";

export interface Limits {
  /** Input plus output tokens. */
  tokens: number;
  usd: number;
  /** Model calls; unlimited when absent. */
  calls?: number;
}

export interface Spent { tokens: number; usd: number; calls: number }

export class Budget {
  private spent: Spent = { tokens: 0, usd: 0, calls: 0 };
  readonly limits: Readonly<Limits>;
  constructor(limits: Limits) {
    this.limits = { ...limits };
    if (!Number.isSafeInteger(limits.tokens) || limits.tokens <= 0 || !Number.isFinite(limits.usd) || limits.usd <= 0 ||
        (limits.calls !== undefined && (!Number.isSafeInteger(limits.calls) || limits.calls <= 0))) {
      throw new Error("Positive budget limits required");
    }
  }
  /** Whether a call that may use up to these tokens (input estimate plus the output ceiling) fits what is left. */
  allows(prices: Prices, inputTokens: number, maxOutputTokens: number): boolean {
    // Every input token at the dearer of plain input and a cache write, and the whole output ceiling.
    const worstUsd = (inputTokens * Math.max(prices.input, prices.cacheWrite ?? 0) + maxOutputTokens * prices.output) / 1_000_000;
    return this.spent.tokens + inputTokens + maxOutputTokens <= this.limits.tokens
      && this.spent.usd + worstUsd <= this.limits.usd
      && (this.limits.calls === undefined || this.spent.calls < this.limits.calls);
  }
  /** Records one call's reported usage; returns its USD. */
  record(prices: Prices, usage: Usage): number {
    const usd = usageUsd(prices, usage);
    this.spent = { tokens: this.spent.tokens + usage.inputTokens + usage.outputTokens, usd: this.spent.usd + usd, calls: this.spent.calls + 1 };
    return usd;
  }
  snapshot(): Spent { return { ...this.spent }; }
}
