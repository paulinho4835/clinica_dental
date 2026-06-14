-- ============================================================================
-- 0042_payment_treatment_item.sql
-- Vincula cada pago a un ítem específico del plan de tratamiento (nullable).
-- Permite al dashboard saber exactamente qué procedimiento se cobró.
-- ============================================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS treatment_item_id uuid
    REFERENCES treatment_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_treatment_item
  ON payments(treatment_item_id)
  WHERE treatment_item_id IS NOT NULL;
