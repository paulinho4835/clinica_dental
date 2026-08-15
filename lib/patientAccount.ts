export type PricedPlanItem = { price: number };

// El plan es la unica fuente del total del tratamiento. doctor_works puede
// contener varias sesiones o cuotas del mismo item y no representa deuda nueva.
export function calculateTreatmentTotal(items: PricedPlanItem[]): number {
  return items.reduce((total, item) => total + Number(item.price), 0);
}

export function summarizePatientAccount(input: {
  planTotal: number;
  paidTotal: number;
  historicalWorks: Array<{ cost: number }>;
}) {
  const historicalReferenceTotal = input.historicalWorks.reduce(
    (sum, work) => sum + Number(work.cost || 0),
    0,
  );
  return {
    planTotal: input.planTotal,
    paidTotal: input.paidTotal,
    balance: input.planTotal - input.paidTotal,
    historicalCount: input.historicalWorks.length,
    historicalReferenceTotal,
    isProvisional: input.historicalWorks.length > 0,
  };
}
