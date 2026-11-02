/**
 * Shared pieces of the two approval pages: device approval (/device, `pnpm player connect`) and MCP
 * connections (/connect, OAuth from Claude and other MCP clients). Both grant one room, one permission.
 */
export function permissionDescription(permission: string): string {
  return permission === "read" ? "Read — view your private room observation; no game actions."
    : permission === "act" ? "Act — view your private room observation and send game actions as you."
    : permission === "owner" ? "Owner — full control of this room and permission to play as you."
    : "Unknown permission — do not approve.";
}

export function OwnerAccessWarning() {
  return <p>Owner access allows changing room settings, approving AI budgets (provider spending), managing AI seats, starting, ending and resuming games, viewing your private observation and playing as you. It applies only to this room and does not grant admin access.</p>;
}

export function OwnerConsentCheck({ id, checked, disabled, onChange, testId }: { id: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void; testId: string }) {
  return (
    <label className="flex items-start gap-3" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-1" data-testid={testId} />
      <span>I understand and explicitly authorize this client to control this room, approve AI budgets, change AI seats, start, end and resume games, and play as me.</span>
    </label>
  );
}
