-- Cuentas por cobrar: pacientes con saldo pendiente, ordenados por monto.
--
-- Antes solo existía el total (dash_debt_summary, 0099) y para saber QUIÉN
-- debía había que abrir los pacientes uno por uno en /cuentas.
--
-- Usa la MISMA fórmula que el saldo de la ficha, /cuentas y
-- get_patient_financial_summary (0117/0124), para que la lista cuadre con lo
-- que se ve al abrir cada paciente:
--   total  = suma de precios de los ítems del plan NO cancelados
--   pagado = suma de todos los pagos del paciente
-- `provisional` marca a quien tiene trabajos históricos sin ítem del plan
-- (la ficha muestra "Saldo provisional" en ese caso).
create or replace function public.patient_balances()
returns table(
  patient_id uuid,
  full_name text,
  national_id text,
  phone text,
  total numeric,
  paid numeric,
  balance numeric,
  last_payment_at timestamptz,
  provisional boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with quoted as (
    select tp.patient_id, sum(ti.price) as total
      from public.treatment_plans tp
      join public.treatment_phases ph on ph.plan_id = tp.id
      join public.treatment_items ti on ti.phase_id = ph.id
     where tp.clinic_id = public.auth_clinic_id()
       and ti.status <> 'cancelled'
     group by tp.patient_id
  ),
  paid as (
    select pay.patient_id, sum(pay.amount) as paid, max(pay.received_at) as last_payment_at
      from public.payments pay
     where pay.clinic_id = public.auth_clinic_id()
     group by pay.patient_id
  )
  select p.id,
         p.full_name,
         p.national_id,
         p.phone,
         q.total,
         coalesce(pd.paid, 0),
         q.total - coalesce(pd.paid, 0),
         pd.last_payment_at,
         exists (
           select 1 from public.doctor_works w
            where w.patient_id = p.id and w.treatment_item_id is null
         )
    from quoted q
    join public.patients p on p.id = q.patient_id
    left join paid pd on pd.patient_id = q.patient_id
   where q.total - coalesce(pd.paid, 0) > 0
   order by q.total - coalesce(pd.paid, 0) desc, p.full_name;
$$;

revoke all on function public.patient_balances()
  from public, anon;
grant execute on function public.patient_balances()
  to authenticated;

-- El KPI "Cuentas por cobrar" del Dashboard ahora suma exactamente la lista de
-- arriba. Antes contaba también los ítems cancelados, así que el total no
-- coincidía con la suma de los saldos de las fichas.
create or replace function public.dash_debt_summary()
returns table(total_debt numeric, debt_patients bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(balance), 0), count(*)::bigint
    from public.patient_balances();
$$;
-- Sin revoke/grant a propósito: create or replace conserva los permisos que la
-- función ya tiene en producción (mismo criterio que cfdbe59).
