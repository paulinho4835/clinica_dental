-- payments.doctor_id apuntaba a doctors(id); lo reapuntamos a profiles(id).
-- No hay data real en doctors, así que no hay riesgo de pérdida.
alter table payments
  drop constraint if exists payments_doctor_id_fkey;

alter table payments
  add constraint payments_doctor_id_fkey
  foreign key (doctor_id) references profiles(id) on delete set null;

-- Comisión del doctor asociada al pago (opcional, 0 = sin comisión).
alter table payments
  add column if not exists commission_pct numeric(5,2) not null default 0
    check (commission_pct >= 0 and commission_pct <= 100);
