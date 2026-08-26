-- Produccion puede registrar 0113 como aplicada aunque PostgREST no encuentre
-- create_patient_atomic. Restaura solo la dependencia y la RPC necesarias para
-- el alta normal de pacientes, sin volver a ejecutar toda la migracion original.
create table if not exists public.clinic_operation_idempotency (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  key text not null,
  operation text not null,
  request_hash text not null,
  response_body jsonb not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (clinic_id, key)
);

alter table public.clinic_operation_idempotency enable row level security;
revoke all on table public.clinic_operation_idempotency
  from public, anon, authenticated;

create or replace function public.create_patient_atomic(
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
  v_patient public.patients%rowtype;
  v_response jsonb;
  v_full_name text := nullif(trim(p_input->>'full_name'), '');
  v_email text := nullif(trim(p_input->>'email'), '');
  v_allergies text[];
  v_alerts text[];
begin
  if v_actor is null or v_clinic is null then
    raise exception 'operation_forbidden' using errcode = '42501';
  end if;

  select p.role, p.active as profile_active, c.active as clinic_active
    into v_profile
    from public.profiles p
    join public.clinics c on c.id = p.clinic_id
   where p.id = v_actor
     and p.clinic_id = v_clinic;

  if not found
     or not coalesce(v_profile.profile_active, false)
     or not coalesce(v_profile.clinic_active, false)
     or v_profile.role not in (
       'admin',
       'recepcionista',
       'colega',
       'odontologo_general',
       'especialista'
     ) then
    raise exception 'operation_forbidden' using errcode = '42501';
  end if;

  if jsonb_typeof(p_input) <> 'object'
     or v_full_name is null
     or char_length(v_full_name) > 200
     or char_length(coalesce(p_input->>'national_id', '')) > 80
     or char_length(coalesce(p_input->>'phone', '')) > 80
     or char_length(coalesce(p_input->>'sex', '')) > 40
     or char_length(coalesce(p_input->>'address', '')) > 500
     or (
       v_email is not null
       and (
         char_length(v_email) > 254
         or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
       )
     )
     or jsonb_typeof(coalesce(p_input->'allergies', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_input->'medical_alerts', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_input->'allergies', '[]'::jsonb)) > 50
     or jsonb_array_length(coalesce(p_input->'medical_alerts', '[]'::jsonb)) > 50 then
    raise exception 'patient_invalid' using errcode = '22023';
  end if;

  if p_idempotency_key is null
     or char_length(trim(p_idempotency_key)) = 0
     or char_length(p_idempotency_key) > 120
     or p_request_hash is null
     or char_length(p_request_hash) = 0 then
    raise exception 'idempotency_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_clinic::text || ':' || p_idempotency_key)
  );

  select *
    into v_existing
    from public.clinic_operation_idempotency
   where clinic_id = v_clinic
     and key = p_idempotency_key
   for update;

  if found then
    if v_existing.request_hash is distinct from p_request_hash
       or v_existing.operation <> 'create_patient' then
      raise exception 'idempotency_key_reused' using errcode = '22023';
    end if;

    return v_existing.response_body;
  end if;

  select coalesce(
           array_agg(trim(value)) filter (where trim(value) <> ''),
           array[]::text[]
         )
    into v_allergies
    from jsonb_array_elements_text(
      coalesce(p_input->'allergies', '[]'::jsonb)
    );

  select coalesce(
           array_agg(trim(value)) filter (where trim(value) <> ''),
           array[]::text[]
         )
    into v_alerts
    from jsonb_array_elements_text(
      coalesce(p_input->'medical_alerts', '[]'::jsonb)
    );

  begin
    insert into public.patients (
      clinic_id,
      full_name,
      national_id,
      dob,
      sex,
      phone,
      email,
      address,
      allergies,
      medical_alerts
    ) values (
      v_clinic,
      v_full_name,
      nullif(trim(p_input->>'national_id'), ''),
      nullif(p_input->>'dob', '')::date,
      nullif(trim(p_input->>'sex'), ''),
      nullif(trim(p_input->>'phone'), ''),
      v_email,
      nullif(trim(p_input->>'address'), ''),
      v_allergies,
      v_alerts
    )
    returning * into v_patient;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'patient_invalid' using errcode = '22023';
  end;

  v_response := jsonb_build_object('patientId', v_patient.id);

  insert into public.clinic_operation_idempotency (
    clinic_id,
    key,
    operation,
    request_hash,
    response_body,
    created_by
  ) values (
    v_clinic,
    p_idempotency_key,
    'create_patient',
    p_request_hash,
    v_response,
    v_actor
  );

  return v_response;
end;
$$;

revoke all on function public.create_patient_atomic(jsonb, text, text)
  from public, anon;
grant execute on function public.create_patient_atomic(jsonb, text, text)
  to authenticated;

notify pgrst, 'reload schema';
