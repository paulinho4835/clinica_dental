-- La Agenda se consulta directamente desde el navegador. Esta función aplica
-- el tenant y el alcance por doctor dentro de PostgreSQL sin endurecer la tabla
-- appointments globalmente (otros módulos clínicos necesitan ver el historial
-- completo del paciente).
drop policy if exists appointments_direct_read_scope on public.appointments;

create or replace function public.get_agenda_appointments(
  p_start timestamptz,
  p_end timestamptz
)
returns table (
  id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  dentist_name text,
  patient_name text,
  patient_id uuid,
  reason text,
  consult_price numeric,
  deposit numeric,
  deposit_method text,
  patients jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    a.starts_at,
    a.ends_at,
    a.status::text,
    a.dentist_name,
    a.patient_name,
    a.patient_id,
    a.reason,
    a.consult_price,
    a.deposit,
    a.deposit_method::text,
    case
      when patient.id is null then null
      else jsonb_build_object(
        'full_name', patient.full_name,
        'national_id', patient.national_id
      )
    end as patients
  from public.appointments a
  left join public.patients patient on patient.id = a.patient_id
  where a.clinic_id = (select public.auth_clinic_id())
    and a.starts_at >= p_start
    and a.starts_at < p_end
    and a.status <> 'cancelled'::public.appt_status
    and (
      (select public.auth_role()) in ('admin', 'recepcionista')
      or a.dentist_id = (select auth.uid())
      or a.dentist_name = (
      select p.full_name
      from public.profiles p
      where p.id = (select auth.uid())
      )
    )
  order by a.starts_at;
$$;

revoke execute on function public.get_agenda_appointments(timestamptz, timestamptz)
  from public, anon;
grant execute on function public.get_agenda_appointments(timestamptz, timestamptz)
  to authenticated, service_role;
