export function errMsg(e: unknown): string {
  if (!e) return "Unknown error";
  const any = e as { data?: { error?: string; message?: string }; message?: string; status?: number };
  return any.data?.error || any.data?.message || any.message || String(e);
}
export const rid = () => crypto.randomUUID();
export const fmt = (n: number, d = 0) => n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
