-- Restaura la RPC de lectura requerida por "Mis trabajos".
-- Produccion tenia 0113 registrada, pero esta funcion no existia en el esquema.
create or replace function public.get_patient_financial_summary(
  p_patient_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_clinic uuid := public.auth_clinic_id();
  v_items jsonb;
  v_total_worked numeric := 0;
  v_total_paid numeric := 0;
begin
  if auth.uid() is null or v_clinic is null then
    raise exception 'operation_forbidden' using errcode = '42501';
  end if;

  -- Conserva RLS: cada usuario solo puede consultar pacientes visibles para
  -- su cuenta dentro de la clinica indicada en su JWT.
  perform 1
    from public.patients
   where id = p_patient_id
     and clinic_id = v_clinic;
  if not found then
    raise exception 'operation_forbidden' using errcode = '42501';
  end if;

  with item_rows as (
    select ti.id,
           coalesce(pc.name, ti.custom_name, '-') as name,
           ti.price,
           ti.doctor_id,
           dp.full_name as doctor_name,
           coalesce(pc.default_commission_pct, 0) as default_commission_pct,
           coalesce((
             select sum(pay.amount)
               from public.payments pay
              where pay.clinic_id = v_clinic
                and pay.patient_id = p_patient_id
                and pay.treatment_item_id = ti.id
           ), 0) as paid_amount,
           coalesce((
             select max(dw.lab_cost)
               from public.doctor_works dw
              where dw.clinic_id = v_clinic
                and dw.patient_id = p_patient_id
                and dw.treatment_item_id = ti.id
                and dw.lab_cost > 0
           ), 0) as lab_cost
      from public.treatment_plans tp
      join public.treatment_phases ph
        on ph.plan_id = tp.id
       and ph.clinic_id = v_clinic
      join public.treatment_items ti
        on ti.phase_id = ph.id
       and ti.clinic_id = v_clinic
      left join public.procedure_catalog pc
        on pc.id = ti.procedure_id
      left join public.profiles dp
        on dp.id = ti.doctor_id
       and dp.clinic_id = v_clinic
     where tp.clinic_id = v_clinic
       and tp.patient_id = p_patient_id
       and ti.status <> 'cancelled'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id,
           'name', name,
           'price', price,
           'paidAmount', paid_amount,
           'labCost', lab_cost,
           'doctorId', doctor_id,
           'doctorName', doctor_name,
           'defaultCommissionPct', default_commission_pct
         )), '[]'::jsonb),
         coalesce(sum(price), 0)
    into v_items, v_total_worked
    from item_rows;

  select coalesce(sum(amount), 0)
    into v_total_paid
    from public.payments
   where clinic_id = v_clinic
     and patient_id = p_patient_id;

  return jsonb_build_object(
    'items', v_items,
    'totalWorked', v_total_worked,
    'totalPaid', v_total_paid
  );
end;
$$;

revoke all on function public.get_patient_financial_summary(uuid)
  from public, anon;
grant execute on function public.get_patient_financial_summary(uuid)
  to authenticated;

notify pgrst, 'reload schema';
