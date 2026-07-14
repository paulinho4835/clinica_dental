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
