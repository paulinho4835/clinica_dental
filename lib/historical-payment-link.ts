export type HistoricalPaymentFingerprint = {
  amount: number;
  method: string;
  note: string | null;
  treatmentItemId?: string | null;
  // Payments only have received_at, which is the business date and not a
  // reliable insertion timestamp for historical rows.
  createdAt?: string | null;
};

export type HistoricalWorkCandidate = {
  id: string;
  cost: number | string | null;
  amount_paid: number | string | null;
  payment_method: string | null;
  description: string | null;
  treatment_item_id?: string | null;
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
  const paymentCreatedAt = payment.createdAt ? Date.parse(payment.createdAt) : NaN;
  const paymentAmount = moneyInCents(payment.amount);
  if (paymentAmount === null) return null;

  const matches = candidates
    .map((candidate) => ({
      candidate,
      distance: Number.isFinite(paymentCreatedAt)
        ? Math.abs(Date.parse(candidate.created_at) - paymentCreatedAt)
        : 0,
      sameCost: moneyInCents(candidate.cost) === paymentAmount,
      sameAmountPaid: moneyInCents(candidate.amount_paid) === paymentAmount,
      sameTreatment:
        Boolean(payment.treatmentItemId) &&
        candidate.treatment_item_id === payment.treatmentItemId,
      sameMethod: candidate.payment_method === payment.method,
      sameDescription:
        normalizedDescription(candidate.description) === normalizedDescription(payment.note),
    }))
    .filter(
      ({ distance, sameCost, sameAmountPaid, sameTreatment, sameMethod, sameDescription }) =>
        Number.isFinite(distance) &&
        (!Number.isFinite(paymentCreatedAt) || distance <= MAX_CREATION_DISTANCE_MS) &&
        // amount_paid refleja el cobro concreto; cost puede ser el precio total
        // del tratamiento y por eso no basta para vincular un pago parcial.
        sameAmountPaid &&
        [sameTreatment, sameMethod, sameDescription].filter(Boolean).length >= 2,
    )
    .map((match) => ({
      ...match,
      score:
        (match.sameCost ? 4 : 0) +
        (match.sameAmountPaid ? 4 : 0) +
        (match.sameTreatment ? 3 : 0) +
        (match.sameMethod ? 2 : 0) +
        (match.sameDescription ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.distance - b.distance);

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].candidate;

  if (matches[0].score > matches[1].score) return matches[0].candidate;

  return matches[1].distance - matches[0].distance >= MIN_UNIQUE_DISTANCE_MARGIN_MS
    ? matches[0].candidate
    : null;
}
