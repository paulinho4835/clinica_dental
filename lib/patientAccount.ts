export type PricedPlanItem = { price: number };

// El plan es la unica fuente del total del tratamiento. doctor_works puede
// contener varias sesiones o cuotas del mismo item y no representa deuda nueva.
export function calculateTreatmentTotal(items: PricedPlanItem[]): number {
  return items.reduce((total, item) => total + Number(item.price), 0);
}
