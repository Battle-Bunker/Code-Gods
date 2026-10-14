export interface EnergyAccount {
  balance: number;
  settledAtMs: number;
}

/** Real-time accrual: callers must NOT pass game-world time here. */
export function settleEnergy(account: EnergyAccount, nowMs: number, perSecond: number): EnergyAccount {
  if (
    !Number.isFinite(nowMs) || !Number.isFinite(account.settledAtMs) ||
    nowMs < account.settledAtMs || !Number.isFinite(perSecond) || perSecond < 0 ||
    !Number.isFinite(account.balance) || account.balance < 0
  ) throw new Error("Invalid energy clock/account");
  const balance = account.balance + (nowMs - account.settledAtMs) / 1000 * perSecond;
  if (!Number.isFinite(balance)) throw new Error("Energy overflow");
  return { balance, settledAtMs: nowMs };
}

/** Pure calculation; service must persist under a lock with the summon receipt. */
export function spendEnergy(
  account: EnergyAccount, nowMs: number, perSecond: number, cost: number,
): EnergyAccount {
  if (!Number.isSafeInteger(cost) || cost < 0) throw new Error("Invalid complexity cost");
  const settled = settleEnergy(account, nowMs, perSecond);
  if (settled.balance < cost) throw new Error("Insufficient energy");
  return { ...settled, balance: settled.balance - cost };
}
