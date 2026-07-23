-- Saldo deudor agregado para el Dashboard (caja/page.tsx). Antes la página
-- traía TODA la tabla payments y TODOS los treatment_plans (con sus fases e
-- items anidados) de la clínica en cada carga, sin filtro de fecha, y sumaba
-- todo en JS — un fetch que crece sin límite con la antigüedad de la clínica
-- y corre en cada visita al dashboard. Mismo patrón que dash_revenue_by_day
-- (0016/0017): mover la agregación a SQL.
--
-- Replica exactamente el cálculo que hacía la página: "cotizado" = suma de
-- treatment_items.price de TODOS los planes del paciente (cualquier status,
-- no solo 'done'); "pagado" = suma de payments.amount de TODOS los kinds
-- (incluye 'credit', no solo 'payment' — así estaba el código original).
create or replace function dash_debt_summary()
returns table(total_debt numeric, debt_patients bigint)
language sql
stable
security invoker
as $$
  with quoted as (
    select tp.patient_id, coalesce(sum(ti.price), 0) as quoted
    from treatment_plans tp
    join treatment_phases th on th.plan_id = tp.id
    join treatment_items ti on ti.phase_id = th.id
    group by tp.patient_id
  ),
  paid as (
    select patient_id, coalesce(sum(amount), 0) as paid
    from payments
    group by patient_id
  )
  select
    coalesce(sum(greatest(q.quoted - coalesce(p.paid, 0), 0)), 0) as total_debt,
    count(*) filter (where q.quoted - coalesce(p.paid, 0) > 0)::bigint as debt_patients
  from quoted q
  left join paid p on p.patient_id = q.patient_id;
$$;
