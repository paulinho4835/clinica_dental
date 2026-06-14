-- Track whether a doctor's commission has been paid out via staff_payments
ALTER TABLE doctor_works
  ADD COLUMN IF NOT EXISTS commission_paid boolean NOT NULL DEFAULT false;

-- Partial index for fast lookup of pending commissions per doctor
CREATE INDEX IF NOT EXISTS idx_doctor_works_unpaid_commission
  ON doctor_works(clinic_id, doctor_id)
  WHERE commission_paid = false;
