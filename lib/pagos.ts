// Lógica pura del módulo Pagos a personal (sin dependencias de Supabase/React
// para poder testearla con Vitest).

// Roles que ganan comisión por trabajos clínicos. El admin se incluye porque en
// clínicas chicas suele atender pacientes además de administrar (tiene
// doctor_works y comisiones, igual que un doctor). Un admin puramente
// administrativo no tendrá trabajos pendientes → sin badge, sin daño.
export const COMMISSION_ROLES = new Set([
  "odontologo_general",
  "especialista",
  "colega",
  "admin",
]);

export type PendingCommissionRow = {
  doctor_id: string;
  commission_amount: number;
  lab_commission_amount: number;
  commission_paid_amount: number;
};

// Suma por doctor la comisión aún no pagada (comisión + lab − abonos previos).
// Alimenta el badge "Bs X pendiente" de la lista de personas en /pagos.
export function sumPendingCommissions(
  rows: PendingCommissionRow[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const remaining =
      r.commission_amount + r.lab_commission_amount - r.commission_paid_amount;
    if (remaining <= 0.005) continue;
    const next = (map.get(r.doctor_id) ?? 0) + remaining;
    map.set(r.doctor_id, Math.round(next * 100) / 100);
  }
  return map;
}

// Umbral para marcar una comisión pendiente como "atrasada" (sin pagar hace
// más de este número de días desde que se hizo el trabajo).
export const OVERDUE_DAYS = 30;

// Días completos entre dos fechas YYYY-MM-DD (o timestamps ISO — se recorta a
// la parte de fecha, ignorando la hora).
export function daysSince(dateStr: string, today: string): number {
  const a = new Date(dateStr.slice(0, 10) + "T00:00:00");
  const b = new Date(today.slice(0, 10) + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function isOverdue(dateStr: string, today: string): boolean {
  return daysSince(dateStr, today) > OVERDUE_DAYS;
}

export type PendingCommissionRowWithDate = PendingCommissionRow & {
  performed_at: string;
};

export type PendingCommissionSummary = {
  amount: number;
  oldestPerformedAt: string;
};

// Igual que sumPendingCommissions, pero además guarda la fecha del trabajo
// pendiente más antiguo por doctor — alimenta la vista "Pagos pendientes"
// (qué tan atrasada está la comisión más vieja de cada persona).
export function summarizePendingByDoctor(
  rows: PendingCommissionRowWithDate[],
): Map<string, PendingCommissionSummary> {
  const map = new Map<string, PendingCommissionSummary>();
  for (const r of rows) {
    const remaining =
      r.commission_amount + r.lab_commission_amount - r.commission_paid_amount;
    if (remaining <= 0.005) continue;
    const existing = map.get(r.doctor_id);
    const amount = Math.round(((existing?.amount ?? 0) + remaining) * 100) / 100;
    const oldestPerformedAt =
      !existing || r.performed_at < existing.oldestPerformedAt
        ? r.performed_at
        : existing.oldestPerformedAt;
    map.set(r.doctor_id, { amount, oldestPerformedAt });
  }
  return map;
}
