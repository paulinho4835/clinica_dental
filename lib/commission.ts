// Cálculo de comisión del doctor — DEBE coincidir con la columna generada
// `doctor_works.commission_amount` (ver migración 0045_commission_proportional).
//
// Fórmula DB:
//   round(amount_paid
//         * (cost > 0 ? greatest(cost - lab_cost, 0) / cost : 1)
//         * commission_pct / 100, 2)
//
// Cada cuota aporta su fracción proporcional de la ganancia NETA de lab.
// Si cost=0 (sin precio registrado) se usa la cuota directa, sin deducir lab.
//
// Esta función es la fuente de verdad del preview en la UI (WorkForm), para que
// lo que ve el usuario nunca se desincronice de lo que calcula la base de datos.

export interface CommissionInput {
  amountPaid: number; // cuánto se cobró en esta operación
  cost: number; // costo total del tratamiento
  labCost: number; // costo de laboratorio (se descuenta del neto)
  pct: number; // porcentaje de comisión del doctor
}

/** Fracción neta de la ganancia tras descontar laboratorio (0..1). */
export function netRate(cost: number, labCost: number): number {
  if (cost > 0) return Math.max(0, cost - labCost) / cost;
  return 1;
}

/** Comisión en Bs, redondeada a 2 decimales (espejo de la columna generada). */
export function computeCommission({ amountPaid, cost, labCost, pct }: CommissionInput): number {
  const a = Number(amountPaid) || 0;
  const c = Number(cost) || 0;
  const lab = Number(labCost) || 0;
  const p = Number(pct) || 0;
  return Math.round(a * netRate(c, lab) * p) / 100;
}
