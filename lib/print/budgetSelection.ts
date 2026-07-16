export function parseSelectedIds(raw: string | undefined): Set<string> | null {
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return new Set(ids);
}

export function filterBySelection<T extends { id: string }>(
  items: T[],
  selectedIds: Set<string> | null,
): T[] {
  if (selectedIds === null) return items;
  return items.filter((item) => selectedIds.has(item.id));
}

export function sumPaymentsForSelection(
  payments: { amount: number; treatment_item_id: string | null }[],
  selectedIds: Set<string> | null,
): number {
  if (selectedIds === null) {
    return payments.reduce((s, p) => s + Number(p.amount), 0);
  }
  return payments.reduce((s, p) => {
    if (p.treatment_item_id && selectedIds.has(p.treatment_item_id)) {
      return s + Number(p.amount);
    }
    return s;
  }, 0);
}
