export interface Limits { callsPerMinute:number; totalTokens:number; roomSpendUsd:number }
/** Share one instance across all bots in a room. Reservations are synchronous. */
export class RoomBudget {
  private calls:number[]=[];
  private tokens=0;
  private spend=0;
  constructor(readonly limits:Limits) {
    for(const value of Object.values(limits)) if(!Number.isFinite(value)||value<=0) throw new Error("Positive finite budgets required");
    if(!Number.isInteger(limits.callsPerMinute)||!Number.isInteger(limits.totalTokens)) throw new Error("Integer call/token budgets required");
  }
  reserve(tokens:number,usd:number,now=Date.now()) {
    if(!Number.isSafeInteger(tokens)||tokens<=0||!Number.isFinite(usd)||usd<=0) throw new Error("Invalid reservation");
    this.calls=this.calls.filter(t=>now-t<60000);
    if(this.calls.length>=this.limits.callsPerMinute || this.tokens+tokens>this.limits.totalTokens || this.spend+usd>this.limits.roomSpendUsd) throw new Error("AI budget exhausted");
    this.calls.push(now);this.tokens+=tokens;this.spend+=usd;
    // Conservative accounting: retain reservations even on cancellation or ambiguous provider errors.
    return {reservedTokens:tokens,reservedUsd:usd};
  }
  snapshot() {return {reservedTokens:this.tokens,reservedUsd:this.spend,callsLastMinute:this.calls.length};}
}
