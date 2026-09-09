export type HistoricalPaymentFingerprint = {
  amount: number;
  method: string;
  note: string | null;
  createdAt: string;
};

export type HistoricalWorkCandidate = {
  id: string;
  cost: number | string | null;
  amount_paid: number | string | null;
  payment_method: string | null;
  description: string | null;
  created_at: string;
};

const MAX_CREATION_DISTANCE_MS = 10 * 60 * 1000;
const MIN_UNIQUE_DISTANCE_MARGIN_MS = 5 * 1000;

function moneyInCents(value: number | string | null): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function normalizedDescription(value: string | null): string {
  return (value?.trim() || "Pago desde ficha de paciente").replace(/\s+/g, " ");
}

/**
 * Identifica un doctor_work historico creado inmediatamente despues de su pago.
 * Si dos candidatos son demasiado cercanos, no adivina: el admin debe revisarlo.
 */
export function findHistoricalWorkForPayment<T extends HistoricalWorkCandidate>(
  payment: HistoricalPaymentFingerprint,
  candidates: T[],
): T | null {
  const paymentCreatedAt = Date.parse(payment.createdAt);
  const paymentAmount = moneyInCents(payment.amount);
  if (!Number.isFinite(paymentCreatedAt) || paymentAmount === null) return null;

  const matches = candidates
    .map((candidate) => ({
      candidate,
      distance: Math.abs(Date.parse(candidate.created_at) - paymentCreatedAt),
    }))
    .filter(({ candidate, distance }) =>
      Number.isFinite(distance) &&
      distance <= MAX_CREATION_DISTANCE_MS &&
      moneyInCents(candidate.cost) === paymentAmount &&
      moneyInCents(candidate.amount_paid) === paymentAmount &&
      candidate.payment_method === payment.method &&
      normalizedDescription(candidate.description) === normalizedDescription(payment.note),
    )
    .sort((a, b) => a.distance - b.distance);

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].candidate;

  return matches[1].distance - matches[0].distance >= MIN_UNIQUE_DISTANCE_MARGIN_MS
    ? matches[0].candidate
    : null;
}
