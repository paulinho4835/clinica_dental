ALTER TABLE payments
  ADD COLUMN doctor_id uuid REFERENCES doctors(id) ON DELETE SET NULL;
