-- Bug real (Tayra Rocha Esprella, 2026-07-22): addPatientPayment hacía dos
-- inserts separados (payments, luego doctor_works). El pago se guardó bien
-- pero el segundo insert no se completó -> comisión del doctor invisible en
-- Mis trabajos, sin rastro del fallo. No son atómicos porque son dos llamadas
-- de red independientes desde el server action.
--
-- Esta función hace ambos inserts en UNA transacción de Postgres: si el
-- insert a doctor_works falla, el insert a payments se revierte también. Ya
-- no puede quedar un pago "huérfano" sin su comisión.
--
-- SECURITY INVOKER (default): corre con los permisos del usuario que llama,
-- así que las policies de RLS (tenant_isolation, doctor_works_insert) se
-- siguen evaluando exactamente igual que con los inserts sueltos.
create or replace function create_payment_with_work(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_amount numeric,
  p_method payment_method,
  p_kind payment_kind,
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
begin
  insert into payments (
    clinic_id, patient_id, amount, method, kind, received_at,
    doctor_id, commission_pct, note, collected_by_id, treatment_item_id
  ) values (
    p_clinic_id, p_patient_id, p_amount, p_method, p_kind, p_received_at,
    p_doctor_id, p_commission_pct, p_note, p_collected_by_id, p_treatment_item_id
  )
  returning id into v_payment_id;

  if p_doctor_id is not null then
    insert into doctor_works (
      clinic_id, doctor_id, patient_id, description, cost, commission_pct,
      amount_paid, payment_method, performed_at, collected_by_id,
      treatment_item_id, payment_id
    ) values (
      p_clinic_id, p_doctor_id, p_patient_id,
      coalesce(p_note, 'Pago desde ficha de paciente'),
      p_amount, p_commission_pct, p_amount, p_method,
      current_date, p_collected_by_id, p_treatment_item_id, v_payment_id
    );
  end if;

  return v_payment_id;
end;
$$;

revoke all on function create_payment_with_work from public;
grant execute on function create_payment_with_work to authenticated, service_role;
