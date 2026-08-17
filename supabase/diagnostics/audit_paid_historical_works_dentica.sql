-- SOLO LECTURA. No contiene INSERT, UPDATE, DELETE ni llamadas RPC.
-- Ejecutar en Supabase SQL Editor antes de aplicar cualquier regularizacion.
with dentica as (
  select id
  from clinics
  where lower(trim(name)) = 'dentica'
),
ledger as (
  select work_id, sum(amount) as ledger_paid
  from staff_payment_works
  where clinic_id = (select id from dentica)
  group by work_id
),
item_work_counts as (
  select treatment_item_id, count(*) as linked_work_count
  from doctor_works
  where clinic_id = (select id from dentica)
    and treatment_item_id is not null
  group by treatment_item_id
),
patient_items as (
  select
    tp.patient_id,
    count(*) filter (where ti.status <> 'cancelled') as available_items,
    count(*) filter (
      where ti.status <> 'cancelled'
        and coalesce(iwc.linked_work_count, 0) = 0
    ) as unoccupied_items
  from treatment_plans tp
  join treatment_phases tph on tph.plan_id = tp.id
  join treatment_items ti on ti.phase_id = tph.id
  left join item_work_counts iwc on iwc.treatment_item_id = ti.id
  where tp.clinic_id = (select id from dentica)
  group by tp.patient_id
)
select
  p.full_name as patient_name,
  dw.id as work_id,
  dw.performed_at,
  dw.description,
  dw.cost,
  coalesce(dw.commission_amount, 0) + coalesce(dw.lab_commission_amount, 0) as commission_total,
  greatest(coalesce(dw.commission_paid_amount, 0), coalesce(l.ledger_paid, 0)) as commission_paid_amount,
  case
    when dw.commission_paid
      or (
        coalesce(dw.commission_amount, 0) + coalesce(dw.lab_commission_amount, 0) > 0
        and greatest(coalesce(dw.commission_paid_amount, 0), coalesce(l.ledger_paid, 0))
          >= coalesce(dw.commission_amount, 0) + coalesce(dw.lab_commission_amount, 0) - 0.005
      ) then 'PAGADA_COMPLETA'
    when greatest(coalesce(dw.commission_paid_amount, 0), coalesce(l.ledger_paid, 0)) > 0
      or dw.staff_payment_id is not null then 'ABONO_PARCIAL_REVISAR'
    else 'SIN_ABONOS_NO_VINCULAR'
  end as commission_status,
  coalesce(pi.available_items, 0) as patient_plan_items,
  coalesce(pi.unoccupied_items, 0) as unoccupied_plan_items
from doctor_works dw
join patients p on p.id = dw.patient_id
left join ledger l on l.work_id = dw.id
left join patient_items pi on pi.patient_id = dw.patient_id
where dw.clinic_id = (select id from dentica)
  and dw.treatment_item_id is null
order by commission_status, p.full_name, dw.performed_at, dw.id;
