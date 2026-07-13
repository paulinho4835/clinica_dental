-- 0085_partial_commission_payments.sql — Abonos parciales de comisión a doctores
-- Problema: commission_paid era todo-o-nada. Al registrar un adelanto (monto
-- editado a menos de la comisión total), el trabajo se marcaba pagado al 100%
-- y desaparecía de "pendientes" en /pagos — se perdía el rastro visual (la
-- barra del paciente) y el saldo restante de la comisión.
-- Solución: bitácora de abonos por trabajo + acumulado pagado. El boolean
-- commission_paid se conserva por compatibilidad pero pasa a ser DERIVADO:
-- true solo cuando el acumulado cubre la comisión completa.

-- Bitácora: cuánto de CADA pago fue a CADA trabajo (transparencia y
-- anti-duplicidad). Borrar el pago la limpia en cascada; el código revierte
-- el acumulado antes de borrar.
create table if not exists staff_payment_works (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references clinics(id) on delete cascade,
  staff_payment_id uuid not null references staff_payments(id) on delete cascade,
  work_id          uuid not null references doctor_works(id) on delete cascade,
  amount           numeric(10,2) not null check (amount > 0),
  created_at       timestamptz not null default now()
);

create index if not exists staff_payment_works_payment_idx
  on staff_payment_works (staff_payment_id);
create index if not exists staff_payment_works_work_idx
  on staff_payment_works (work_id);

alter table staff_payment_works enable row level security;

drop policy if exists staff_payment_works_admin_all on staff_payment_works;
create policy staff_payment_works_admin_all on staff_payment_works
  for all to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) = 'admin'
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) = 'admin'
  );

-- Acumulado pagado de la comisión del trabajo (suma de sus abonos).
alter table doctor_works
  add column if not exists commission_paid_amount numeric(10,2) not null default 0;

comment on column doctor_works.commission_paid_amount is
  'Suma de abonos de comisión recibidos (staff_payment_works). commission_paid = true cuando cubre commission_amount + lab_commission_amount.';

-- Backfill: los trabajos ya marcados como pagados quedan con el acumulado
-- igual a su comisión total, para que los históricos sigan coherentes.
update doctor_works
set commission_paid_amount = coalesce(commission_amount, 0) + coalesce(lab_commission_amount, 0)
where commission_paid = true
  and commission_paid_amount = 0;

-- Índice parcial para la lista de pendientes (reemplaza el filtro por boolean).
create index if not exists idx_doctor_works_commission_pending
  on doctor_works (clinic_id, doctor_id)
  where commission_paid = false;

notify pgrst, 'reload schema';
