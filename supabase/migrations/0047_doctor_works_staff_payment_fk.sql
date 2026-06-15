-- Vincula cada doctor_work con el pago de staff que cubrió su comisión.
-- Permite mostrar los trabajos agrupados bajo cada pago en el panel de Pagos a personal.
alter table doctor_works
  add column if not exists staff_payment_id uuid references staff_payments(id) on delete set null;

create index if not exists idx_doctor_works_staff_payment_id
  on doctor_works(staff_payment_id)
  where staff_payment_id is not null;
