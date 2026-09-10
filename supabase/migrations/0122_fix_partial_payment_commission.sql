-- Las cuotas creadas desde la ficha del paciente deben usar el precio total
-- del item del plan como cost. amount_paid sigue siendo solo esta cuota.
-- Además heredan el costo de laboratorio del tratamiento para que ninguna
-- cuota posterior calcule comisión como si no existiera laboratorio.
create or replace function public.create_payment_with_work(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_kind public.payment_kind,
  p_received_at timestamptz,
  p_doctor_id uuid,
  p_commission_pct numeric,
  p_note text,
  p_collected_by_id uuid,
  p_treatment_item_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_payment_id uuid;
  v_treatment_cost numeric := p_amount;
  v_treatment_lab_cost numeric := 0;
begin
  if p_treatment_item_id is not null then
    select ti.price
      into v_treatment_cost
      from public.treatment_items ti
      join public.treatment_phases ph on ph.id = ti.phase_id
      join public.treatment_plans tp on tp.id = ph.plan_id
     where ti.id = p_treatment_item_id
       and ti.clinic_id = p_clinic_id
       and ph.clinic_id = p_clinic_id
       and tp.clinic_id = p_clinic_id
       and tp.patient_id = p_patient_id;
  end if;

  if p_doctor_id is not null and p_treatment_item_id is not null then
    select greatest(
      coalesce(max(dw.treatment_lab_cost), 0),
      coalesce(max(dw.lab_cost), 0)
    )
      into v_treatment_lab_cost
      from public.doctor_works dw
     where dw.clinic_id = p_clinic_id
       and dw.patient_id = p_patient_id
       and dw.doctor_id = p_doctor_id
       and dw.treatment_item_id = p_treatment_item_id;
  end if;

  insert into public.payments (
    clinic_id, patient_id, amount, method, kind, received_at,
    doctor_id, commission_pct, note, collected_by_id, treatment_item_id
  ) values (
    p_clinic_id, p_patient_id, p_amount, p_method, p_kind, p_received_at,
    p_doctor_id, p_commission_pct, p_note, p_collected_by_id, p_treatment_item_id
  )
  returning id into v_payment_id;

  if p_doctor_id is not null then
    insert into public.doctor_works (
      clinic_id, doctor_id, patient_id, description, cost, commission_pct,
      amount_paid, payment_method, performed_at, collected_by_id,
      treatment_item_id, treatment_lab_cost, payment_id
    ) values (
      p_clinic_id, p_doctor_id, p_patient_id,
      coalesce(p_note, 'Pago desde ficha de paciente'),
      coalesce(v_treatment_cost, p_amount), p_commission_pct, p_amount, p_method,
      current_date, p_collected_by_id, p_treatment_item_id,
      coalesce(v_treatment_lab_cost, 0), v_payment_id
    );
  end if;

  return v_payment_id;
end;
$$;
