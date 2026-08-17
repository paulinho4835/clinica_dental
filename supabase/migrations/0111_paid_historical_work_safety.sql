-- Regularizacion autorizada por direccion de Dentica: los trabajos historicos
-- solo pueden vincularse cuando su comision esta completamente abonada.
-- Tambien se serializan los abonos para impedir que dos pagos concurrentes
-- excedan la comision restante de un mismo trabajo.

create or replace function guard_staff_payment_work_amount()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_commission_total numeric(12,2);
  v_already_paid numeric(12,2);
  v_doctor_id uuid;
  v_excluded_id uuid;
begin
  if tg_op = 'UPDATE' then
    if new.work_id is distinct from old.work_id
      or new.staff_payment_id is distinct from old.staff_payment_id
      or new.clinic_id is distinct from old.clinic_id
    then
      raise exception using errcode = '23514', message = 'No se puede cambiar el origen de un abono de comision.';
    end if;
    v_excluded_id := old.id;
  end if;

  select
    coalesce(commission_amount, 0) + coalesce(lab_commission_amount, 0),
    doctor_id
  into v_commission_total, v_doctor_id
  from doctor_works
  where id = new.work_id
    and clinic_id = new.clinic_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'El trabajo no existe o pertenece a otra clinica.';
  end if;

  perform 1
  from staff_payments
  where id = new.staff_payment_id
    and clinic_id = new.clinic_id
    and employee_id = v_doctor_id
  for key share;

  if not found then
    raise exception using errcode = '23514', message = 'El pago no pertenece al doctor o a la clinica del trabajo.';
  end if;

  if exists (
    select 1
    from staff_payment_works
    where staff_payment_id = new.staff_payment_id
      and work_id = new.work_id
      and (v_excluded_id is null or id <> v_excluded_id)
  ) then
    raise exception using errcode = '23505', message = 'Este pago ya contiene un abono para el trabajo.';
  end if;

  select coalesce(sum(amount), 0)
  into v_already_paid
  from staff_payment_works
  where work_id = new.work_id
    and (v_excluded_id is null or id <> v_excluded_id);

  if v_already_paid + new.amount > v_commission_total + 0.005 then
    raise exception using errcode = '23514', message = 'El abono excede la comision restante del trabajo.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_staff_payment_work_amount on staff_payment_works;
create trigger trg_guard_staff_payment_work_amount
before insert or update on staff_payment_works
for each row execute function guard_staff_payment_work_amount();

create or replace function regularize_historical_doctor_work(
  p_work_id uuid,
  p_patient_id uuid,
  p_clinic_id uuid,
  p_action text,
  p_treatment_item_id uuid default null,
  p_payment_id uuid default null,
  p_name text default null,
  p_price numeric default null,
  p_reason text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_work doctor_works%rowtype;
  v_item_id uuid;
  v_plan_id uuid;
  v_phase_id uuid;
  v_payment_id uuid;
  v_commission_total numeric(12,2);
  v_ledger_paid numeric(12,2);
  v_effective_paid numeric(12,2);
begin
  if (select auth_role()) is distinct from 'admin' then
    raise exception using errcode = '42501', message = 'Solo el administrador puede regularizar datos historicos.';
  end if;
  if p_clinic_id is distinct from (select auth_clinic_id()) then
    raise exception using errcode = '42501', message = 'Clinica no autorizada.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception using errcode = '23514', message = 'Debe registrar el motivo de la regularizacion.';
  end if;
  if p_action not in ('link', 'create', 'delete_duplicate') then
    raise exception using errcode = '22023', message = 'Accion de regularizacion invalida.';
  end if;

  select * into v_work
  from doctor_works
  where id = p_work_id
    and patient_id = p_patient_id
    and clinic_id = p_clinic_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'El trabajo historico no existe o no pertenece al paciente.';
  end if;
  if v_work.treatment_item_id is not null then
    raise exception using errcode = '23514', message = 'El trabajo ya fue regularizado.';
  end if;

  perform 1
  from staff_payment_works
  where work_id = p_work_id
  for update;

  select coalesce(sum(amount), 0)
  into v_ledger_paid
  from staff_payment_works
  where work_id = p_work_id;

  v_commission_total := coalesce(v_work.commission_amount, 0) + coalesce(v_work.lab_commission_amount, 0);
  v_effective_paid := greatest(coalesce(v_work.commission_paid_amount, 0), v_ledger_paid);

  if p_action in ('link', 'create')
    and not (
      v_work.commission_paid
      or (v_commission_total > 0 and v_effective_paid >= v_commission_total - 0.005)
    )
  then
    raise exception using errcode = '23514', message = 'Solo pueden vincularse trabajos con la comision completamente abonada.';
  end if;

  if p_action = 'delete_duplicate' then
    if v_work.commission_paid
      or v_effective_paid > 0
      or v_work.staff_payment_id is not null
    then
      raise exception using errcode = '23514', message = 'No se puede eliminar: la comision tiene pagos. Revierte primero el pago al doctor.';
    end if;

    insert into audit_log (clinic_id, actor_id, action, entity, entity_id, diff)
    values (
      p_clinic_id,
      auth.uid(),
      'historical_work_deleted_duplicate',
      'doctor_work',
      p_work_id,
      jsonb_build_object('reason', trim(p_reason), 'before', to_jsonb(v_work))
    );

    delete from doctor_works
    where id = p_work_id
      and clinic_id = p_clinic_id;
    return null;
  end if;

  if p_action = 'link' then
    select ti.id into v_item_id
    from treatment_items ti
    join treatment_phases tph on tph.id = ti.phase_id
    join treatment_plans tp on tp.id = tph.plan_id
    where ti.id = p_treatment_item_id
      and ti.clinic_id = p_clinic_id
      and tp.clinic_id = p_clinic_id
      and tp.patient_id = p_patient_id
    for update of ti;

    if not found then
      raise exception using errcode = '23514', message = 'El tratamiento no pertenece al paciente.';
    end if;

    perform 1
    from doctor_works
    where treatment_item_id = v_item_id
      and clinic_id = p_clinic_id
      and id <> p_work_id
    for update;

    if found then
      raise exception using errcode = '23514', message = 'El tratamiento ya tiene otro trabajo clinico asociado.';
    end if;
  else
    if length(trim(coalesce(p_name, ''))) = 0 or p_price is null or p_price < 0 then
      raise exception using errcode = '23514', message = 'Nombre y precio aprobado son obligatorios.';
    end if;

    select id into v_plan_id
    from treatment_plans
    where patient_id = p_patient_id
      and clinic_id = p_clinic_id
    order by created_at desc
    limit 1
    for update;

    if v_plan_id is null then
      insert into treatment_plans (clinic_id, patient_id, status, created_by)
      values (p_clinic_id, p_patient_id, 'active', auth.uid())
      returning id into v_plan_id;
    end if;

    select id into v_phase_id
    from treatment_phases
    where plan_id = v_plan_id
      and clinic_id = p_clinic_id
    order by phase_no
    limit 1
    for update;

    if v_phase_id is null then
      insert into treatment_phases (clinic_id, plan_id, phase_no, title, status)
      values (p_clinic_id, v_plan_id, 1, 'Regularizacion historica', 'active')
      returning id into v_phase_id;
    end if;

    insert into treatment_items (
      clinic_id, phase_id, procedure_id, custom_name, price, status, done_at,
      doctor_id, dentist_id, created_at
    ) values (
      p_clinic_id, v_phase_id, null, trim(p_name), p_price, 'done', v_work.performed_at,
      v_work.doctor_id, v_work.doctor_id, v_work.performed_at
    ) returning id into v_item_id;
  end if;

  update doctor_works
  set treatment_item_id = v_item_id
  where id = p_work_id
    and clinic_id = p_clinic_id;

  v_payment_id := coalesce(p_payment_id, v_work.payment_id);
  if v_payment_id is not null then
    perform 1
    from payments
    where id = v_payment_id
      and patient_id = p_patient_id
      and clinic_id = p_clinic_id
      and (treatment_item_id is null or treatment_item_id = v_item_id)
    for update;

    if not found then
      raise exception using errcode = '23514', message = 'El pago no pertenece al paciente o ya esta vinculado a otro tratamiento.';
    end if;

    update payments
    set treatment_item_id = v_item_id
    where id = v_payment_id
      and clinic_id = p_clinic_id;
  end if;

  insert into audit_log (clinic_id, actor_id, action, entity, entity_id, diff)
  values (
    p_clinic_id,
    auth.uid(),
    'historical_work_' || p_action,
    'doctor_work',
    p_work_id,
    jsonb_build_object(
      'reason', trim(p_reason),
      'authorization', 'Direccion clinica autorizo vincular trabajos con comision completamente abonada',
      'before', to_jsonb(v_work),
      'treatment_item_id', v_item_id,
      'payment_id', v_payment_id,
      'commission_total', v_commission_total,
      'commission_paid_amount', v_effective_paid,
      'approved_name', case when p_action = 'create' then trim(p_name) else null end,
      'approved_price', case when p_action = 'create' then p_price else null end
    )
  );

  return v_item_id;
end;
$$;

revoke all on function guard_staff_payment_work_amount() from public;
revoke all on function regularize_historical_doctor_work(uuid, uuid, uuid, text, uuid, uuid, text, numeric, text) from public;
grant execute on function regularize_historical_doctor_work(uuid, uuid, uuid, text, uuid, uuid, text, numeric, text) to authenticated;
grant execute on function regularize_historical_doctor_work(uuid, uuid, uuid, text, uuid, uuid, text, numeric, text) to service_role;

notify pgrst, 'reload schema';
