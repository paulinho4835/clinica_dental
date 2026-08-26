-- Registra la cita y su adelanto en una sola transaccion. Un adelanto deja de
-- ser un dato temporal invisible: crea un item del plan y un pago trazable.

alter table public.payments
  add column if not exists source_appointment_id uuid
  references public.appointments(id) on delete set null;

alter table public.treatment_items
  add column if not exists source_appointment_id uuid
  references public.appointments(id) on delete set null;

create unique index if not exists payments_source_appointment_unique
  on public.payments(source_appointment_id)
  where source_appointment_id is not null;

create unique index if not exists treatment_items_source_appointment_unique
  on public.treatment_items(source_appointment_id)
  where source_appointment_id is not null;

create or replace function public.prevent_migrated_appointment_financial_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.finance_migrated and (
    new.consult_price is distinct from old.consult_price
    or new.deposit is distinct from old.deposit
    or new.deposit_method is distinct from old.deposit_method
  ) then
    raise exception 'appointment_finance_locked' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_migrated_appointment_finance on public.appointments;
create trigger trg_lock_migrated_appointment_finance
before update of consult_price, deposit, deposit_method on public.appointments
for each row execute function public.prevent_migrated_appointment_financial_edit();

create or replace function public.apply_appointment_finance_atomic(
  p_appointment_id uuid,
  p_actor uuid,
  p_clinic uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appt public.appointments%rowtype;
  v_plan_id uuid;
  v_phase_id uuid;
  v_item_id uuid;
  v_payment_id uuid;
  v_price numeric;
  v_deposit numeric;
  v_item_name text;
begin
  select * into v_appt
    from public.appointments
   where id = p_appointment_id
     and clinic_id = p_clinic
   for update;
  if not found then
    raise exception 'appointment_invalid' using errcode = '22023';
  end if;

  if v_appt.patient_id is null then
    return jsonb_build_object(
      'patientId', null,
      'treatmentItemId', null,
      'paymentId', null
    );
  end if;

  if v_appt.finance_migrated then
    select id, treatment_item_id
      into v_payment_id, v_item_id
      from public.payments
     where source_appointment_id = v_appt.id;
    if v_payment_id is not null then
      return jsonb_build_object(
        'patientId', v_appt.patient_id,
        'treatmentItemId', v_item_id,
        'paymentId', v_payment_id
      );
    end if;
  end if;

  v_price := coalesce(v_appt.consult_price, 0);
  v_deposit := coalesce(v_appt.deposit, 0);
  if v_price <= 0 and v_deposit <= 0 then
    return jsonb_build_object(
      'patientId', v_appt.patient_id,
      'treatmentItemId', null,
      'paymentId', null
    );
  end if;

  select id into v_plan_id
    from public.treatment_plans
   where clinic_id = p_clinic
     and patient_id = v_appt.patient_id
     and status in ('draft', 'active')
   order by created_at desc
   limit 1
   for update;
  if v_plan_id is null then
    insert into public.treatment_plans (
      clinic_id, patient_id, status, created_by
    ) values (
      p_clinic, v_appt.patient_id, 'active', p_actor
    ) returning id into v_plan_id;
  end if;

  select id into v_phase_id
    from public.treatment_phases
   where clinic_id = p_clinic
     and plan_id = v_plan_id
   order by phase_no asc
   limit 1
   for update;
  if v_phase_id is null then
    insert into public.treatment_phases (
      clinic_id, plan_id, phase_no, title, status
    ) values (
      p_clinic, v_plan_id, 1, 'General', 'active'
    ) returning id into v_phase_id;
  end if;

  v_item_name := coalesce(nullif(trim(v_appt.reason), ''), 'Adelanto de cita');

  -- La migración antigua podía haber creado el ítem y fallar antes de crear
  -- el pago. Reutiliza ese ítem parcial cuando coincide de forma inequívoca,
  -- en vez de duplicarlo durante la reparación.
  select ti.id into v_item_id
    from public.treatment_items ti
    join public.treatment_phases tph on tph.id = ti.phase_id
    join public.treatment_plans tpl on tpl.id = tph.plan_id
   where ti.clinic_id = p_clinic
     and tpl.clinic_id = p_clinic
     and tpl.patient_id = v_appt.patient_id
     and ti.source_appointment_id is null
     and ti.custom_name = v_item_name
     and ti.price = greatest(v_price, v_deposit)
     and ti.created_at between v_appt.created_at - interval '10 minutes'
                           and v_appt.created_at + interval '10 minutes'
     and not exists (
       select 1 from public.payments pay where pay.treatment_item_id = ti.id
     )
   order by ti.created_at asc
   limit 1
   for update of ti;
  if v_item_id is null then
    insert into public.treatment_items (
      clinic_id, phase_id, custom_name, price, doctor_id, status,
      source_appointment_id
    ) values (
      p_clinic, v_phase_id, v_item_name, greatest(v_price, v_deposit),
      v_appt.dentist_id, 'approved', v_appt.id
    ) returning id into v_item_id;
  else
    update public.treatment_items
       set source_appointment_id = v_appt.id,
           doctor_id = coalesce(doctor_id, v_appt.dentist_id)
     where id = v_item_id;
  end if;

  if v_deposit > 0 then
    insert into public.payments (
      clinic_id, patient_id, amount, method, kind, received_at, note,
      treatment_item_id, source_appointment_id
    ) values (
      p_clinic,
      v_appt.patient_id,
      v_deposit,
      coalesce(v_appt.deposit_method, 'cash'::public.payment_method),
      'payment',
      v_appt.created_at,
      left('Adelanto de cita: ' || coalesce(nullif(trim(v_appt.reason), ''), 'Sin detalle'), 120),
      v_item_id,
      v_appt.id
    ) returning id into v_payment_id;
  end if;

  update public.appointments
     set finance_migrated = true
   where id = v_appt.id;

  return jsonb_build_object(
    'patientId', v_appt.patient_id,
    'treatmentItemId', v_item_id,
    'paymentId', v_payment_id
  );
end;
$$;

revoke all on function public.apply_appointment_finance_atomic(uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function public.create_appointment_with_finance_atomic(
  p_input jsonb,
  p_idempotency_key text,
  p_request_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_clinic uuid := public.auth_clinic_id();
  v_profile record;
  v_existing public.clinic_operation_idempotency%rowtype;
  v_appointment_id uuid;
  v_patient_id uuid;
  v_dentist_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_price numeric;
  v_deposit numeric;
  v_method public.payment_method;
  v_finance jsonb;
  v_response jsonb;
begin
  if v_actor is null or v_clinic is null then
    raise exception 'operation_forbidden' using errcode = '42501';
  end if;
  select p.role, p.active as profile_active, c.active as clinic_active
    into v_profile
    from public.profiles p
    join public.clinics c on c.id = p.clinic_id
   where p.id = v_actor and p.clinic_id = v_clinic;
  if not found or not coalesce(v_profile.profile_active, false)
     or not coalesce(v_profile.clinic_active, false)
     or v_profile.role not in (
       'admin', 'recepcionista', 'colega', 'odontologo_general', 'especialista'
     ) then
    raise exception 'operation_forbidden' using errcode = '42501';
  end if;

  if jsonb_typeof(p_input) <> 'object'
     or p_idempotency_key is null
     or char_length(trim(p_idempotency_key)) = 0
     or char_length(p_idempotency_key) > 120
     or p_request_hash is null
     or char_length(p_request_hash) = 0 then
    raise exception 'appointment_invalid' using errcode = '22023';
  end if;

  begin
    v_patient_id := nullif(p_input->>'patient_id', '')::uuid;
    v_dentist_id := nullif(p_input->>'dentist_id', '')::uuid;
    v_starts_at := (p_input->>'starts_at')::timestamptz;
    v_ends_at := (p_input->>'ends_at')::timestamptz;
    v_price := coalesce(nullif(p_input->>'consult_price', '')::numeric, 0);
    v_deposit := coalesce(nullif(p_input->>'deposit', '')::numeric, 0);
    v_method := nullif(p_input->>'deposit_method', '')::public.payment_method;
  exception when others then
    raise exception 'appointment_invalid' using errcode = '22023';
  end;

  if v_starts_at is null or v_ends_at is null or v_ends_at <= v_starts_at
     or v_price < 0 or v_price > 1000000000
     or v_deposit < 0 or v_deposit > 1000000000
     or (v_patient_id is null and nullif(trim(p_input->>'patient_name'), '') is null)
     or nullif(trim(p_input->>'dentist_name'), '') is null
     or char_length(coalesce(p_input->>'patient_name', '')) > 200
     or char_length(p_input->>'dentist_name') > 200
     or char_length(coalesce(p_input->>'reason', '')) > 500 then
    raise exception 'appointment_invalid' using errcode = '22023';
  end if;

  if v_patient_id is not null then
    perform 1 from public.patients
     where id = v_patient_id and clinic_id = v_clinic
     for update;
    if not found then
      raise exception 'patient_invalid' using errcode = '22023';
    end if;
  end if;
  if v_dentist_id is not null then
    perform 1 from public.profiles
     where id = v_dentist_id and clinic_id = v_clinic and active
     for update;
    if not found then
      raise exception 'dentist_invalid' using errcode = '22023';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_clinic::text || ':' || p_idempotency_key));
  select * into v_existing
    from public.clinic_operation_idempotency
   where clinic_id = v_clinic and key = p_idempotency_key
   for update;
  if found then
    if v_existing.request_hash is distinct from p_request_hash
       or v_existing.operation <> 'create_appointment' then
      raise exception 'idempotency_key_reused' using errcode = '22023';
    end if;
    return v_existing.response_body;
  end if;

  insert into public.appointments (
    clinic_id, patient_id, patient_name, dentist_name, dentist_id,
    starts_at, ends_at, reason, overbooked, consult_price, deposit,
    deposit_method
  ) values (
    v_clinic,
    v_patient_id,
    case when v_patient_id is null then nullif(trim(p_input->>'patient_name'), '') else null end,
    trim(p_input->>'dentist_name'),
    v_dentist_id,
    v_starts_at,
    v_ends_at,
    nullif(trim(p_input->>'reason'), ''),
    coalesce((p_input->>'overbooked')::boolean, false),
    v_price,
    v_deposit,
    case when v_deposit > 0 then coalesce(v_method, 'cash'::public.payment_method) else null end
  ) returning id into v_appointment_id;

  v_finance := public.apply_appointment_finance_atomic(
    v_appointment_id, v_actor, v_clinic
  );
  v_response := jsonb_build_object('appointmentId', v_appointment_id) || v_finance;

  insert into public.clinic_operation_idempotency (
    clinic_id, key, operation, request_hash, response_body, created_by
  ) values (
    v_clinic, p_idempotency_key, 'create_appointment', p_request_hash,
    v_response, v_actor
  );
  return v_response;
end;
$$;

create or replace function public.migrate_appointment_finance_atomic(
  p_appointment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_clinic uuid := public.auth_clinic_id();
  v_role public.app_role;
begin
  if v_actor is null or v_clinic is null then
    raise exception 'operation_forbidden' using errcode = '42501';
  end if;
  select role into v_role
    from public.profiles
   where id = v_actor and clinic_id = v_clinic and active;
  if not found or v_role not in (
    'admin', 'recepcionista', 'colega', 'odontologo_general', 'especialista'
  ) then
    raise exception 'operation_forbidden' using errcode = '42501';
  end if;
  return public.apply_appointment_finance_atomic(
    p_appointment_id, v_actor, v_clinic
  );
end;
$$;

revoke all on function public.create_appointment_with_finance_atomic(jsonb, text, text)
  from public, anon;
grant execute on function public.create_appointment_with_finance_atomic(jsonb, text, text)
  to authenticated;
revoke all on function public.migrate_appointment_finance_atomic(uuid)
  from public, anon;
grant execute on function public.migrate_appointment_finance_atomic(uuid)
  to authenticated;

-- Recupera adelantos de citas aun no finalizadas (incluida la cita que revelo
-- este incidente). Las finalizadas se dejan para revision manual porque una
-- version anterior pudo haber creado registros parciales sin marcar la cita.
do $$
declare
  v_row record;
begin
  for v_row in
    select id, clinic_id
      from public.appointments
     where patient_id is not null
       and not finance_migrated
       and (consult_price > 0 or deposit > 0)
       and status <> 'finished'
     order by created_at
  loop
    perform public.apply_appointment_finance_atomic(
      v_row.id, null, v_row.clinic_id
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';
