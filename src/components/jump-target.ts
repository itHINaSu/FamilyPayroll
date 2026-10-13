/**
 * The id a child's card carries so the jump row — and links like
 * /balances#child-… from the Dashboard — can land on it. A plain module, not
 * part of jump-row.tsx, because server components call it too.
 */
export const jumpTargetId = (childId: string) => `child-${childId}`;
