/**
 * v1's arrow keys between a list's items (GoalBoard.tsx's scoring units, explain/modes.tsx's modes): Arrow Right or
 * Down steps forward, Left or Up back, stopping at the ends; Home and End jump. Null: the key is not one of these.
 */
export function rovingIndex(key: string, i: number, n: number): number | null {
  if (n <= 0) return null;
  switch (key) {
    case "ArrowRight": case "ArrowDown": return Math.min(n - 1, i + 1);
    case "ArrowLeft": case "ArrowUp": return Math.max(0, i - 1);
    case "Home": return 0;
    case "End": return n - 1;
    default: return null;
  }
}
