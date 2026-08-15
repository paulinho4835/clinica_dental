-- Al borrar un item del plan, elimina también sus trabajos clínicos todavía
-- pendientes de pago. Antes, la FK ON DELETE SET NULL dejaba esos trabajos
-- huérfanos y seguían apareciendo en "Pagos a personal".
--
-- Los trabajos con comisión abonada se conservan: primero debe revertirse el
-- pago al doctor para no destruir el historial contable.
create or replace function delete_treatment_item_with_pending_works(
  p_item_id uuid,
  p_patient_id uuid,
  p_clinic_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (select auth_role()) is distinct from 'admin' then
    raise exception using
      errcode = '42501',
      message = 'Solo el administrador puede eliminar trabajos del plan.';
  end if;

  -- El bloqueo del item impide que se vincule un trabajo nuevo mientras se
  -- completa esta transacción.
  perform 1
    from treatment_items ti
    join treatment_phases tph on tph.id = ti.phase_id
    join treatment_plans tp on tp.id = tph.plan_id
    where ti.id = p_item_id
      and ti.clinic_id = p_clinic_id
      and tp.clinic_id = p_clinic_id
      and tp.patient_id = p_patient_id
    for update of ti;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'El tratamiento no pertenece al paciente o ya fue eliminado.';
  end if;

  -- Serializa esta eliminación con cualquier abono de comisión concurrente.
  perform 1
  from doctor_works
  where treatment_item_id = p_item_id
    and clinic_id = p_clinic_id
  for update;

  if exists (
    select 1
    from doctor_works
    where treatment_item_id = p_item_id
      and clinic_id = p_clinic_id
      and (
        commission_paid
        or commission_paid_amount > 0
        or staff_payment_id is not null
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'No se puede eliminar: la comisión del doctor ya tiene pagos. Revierte primero el pago al doctor.';
  end if;

  delete from doctor_works
  where treatment_item_id = p_item_id
    and clinic_id = p_clinic_id;

  delete from treatment_items
  where id = p_item_id
    and clinic_id = p_clinic_id;
end;
$$;

revoke all on function delete_treatment_item_with_pending_works(uuid, uuid, uuid) from public;
grant execute on function delete_treatment_item_with_pending_works(uuid, uuid, uuid) to authenticated;
grant execute on function delete_treatment_item_with_pending_works(uuid, uuid, uuid) to service_role;

notify pgrst, 'reload schema';
