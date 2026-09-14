-- Regla: laboratorio se descuenta solo del pago donde se registra.
-- Cuotas anteriores conservan su comision; cuotas posteriores no lo repiten.

alter table public.doctor_works
  add column if not exists commission_lab_applied numeric(12,2) not null default 0;

-- Trabajos existentes: solo lab_cost de la propia operacion cuenta como
-- laboratorio aplicado. treatment_lab_cost es referencia del tratamiento.
update public.doctor_works
   set commission_lab_applied = least(
     greatest(coalesce(lab_cost, 0), 0),
     greatest(coalesce(amount_paid, 0), 0)
   );

create or replace function public.allocate_doctor_work_lab_commission()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.commission_lab_applied := least(
    greatest(coalesce(new.lab_cost, 0), 0),
    greatest(coalesce(new.amount_paid, 0), 0)
  );
  return new;
end;
$$;

drop trigger if exists doctor_works_allocate_lab_commission on public.doctor_works;
create trigger doctor_works_allocate_lab_commission
before insert or update of amount_paid, lab_cost, treatment_lab_cost,
  treatment_item_id, doctor_id, patient_id, clinic_id
on public.doctor_works
for each row
execute function public.allocate_doctor_work_lab_commission();

alter table public.doctor_works drop column if exists commission_amount;
alter table public.doctor_works
  add column commission_amount numeric(12,2)
    generated always as (
      round(greatest(amount_paid - commission_lab_applied, 0) * commission_pct / 100, 2)
    ) stored;

revoke all on function public.allocate_doctor_work_lab_commission() from public;
grant execute on function public.allocate_doctor_work_lab_commission() to authenticated, service_role;

notify pgrst, 'reload schema';
