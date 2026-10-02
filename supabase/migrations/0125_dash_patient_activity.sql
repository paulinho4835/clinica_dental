-- Actividad de pacientes del Dashboard (caja/page.tsx) agregada en SQL.
--
-- Antes la página traía en crudo TODAS las citas y TODOS los doctor_works
-- desde el 1 de enero, más el origen de TODOS los pacientes, y contaba en JS.
-- PostgREST corta cada respuesta en max_rows (1000) sin avisar y esas
-- consultas no tenían orden, así que pasadas las 1000 filas del año los KPIs
-- de pacientes atendidos, ausentismo, rendimiento por doctor y origen de
-- pacientes salían de una muestra arbitraria. Mismo patrón que 0017/0099:
-- mover la agregación a SQL.
--
-- Replica la regla de la página: un paciente "atendido" en un día es uno con
-- una cita 'finished' o un trabajo registrado ese día (distintos, unión de
-- ambas fuentes). Las filas sin patient_id cuentan cada una como un paciente.
-- Los días se agrupan en hora Bolivia (antes una cita a las 21:00 BOT caía en
-- el día siguiente porque el server calcula en UTC).
create or replace function public.dash_patient_activity(p_today date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_clinic uuid := public.auth_clinic_id();
  v_week_start date := p_today - (extract(isodow from p_today)::int - 1);
  v_month_start date := date_trunc('month', p_today)::date;
  v_next_month date := (date_trunc('month', p_today) + interval '1 month')::date;
  v_year_start date := date_trunc('year', p_today)::date;
  v_daily_from date := p_today - 29;
  v_from date;
  v_result jsonb;
begin
  if auth.uid() is null or v_clinic is null then
    raise exception 'operation_forbidden' using errcode = '42501';
  end if;
  if p_today is null then
    raise exception 'invalid_date' using errcode = '22023';
  end if;

  v_from := least(v_daily_from, v_year_start, v_week_start);

  with activity as (
    select (a.starts_at at time zone 'America/La_Paz')::date as day,
           coalesce(a.patient_id::text, 'cita:' || a.id::text) as patient_key
      from public.appointments a
     where a.clinic_id = v_clinic
       and a.status = 'finished'
       and a.starts_at >= (v_from::timestamp at time zone 'America/La_Paz')
       and a.starts_at <  ((p_today + 1)::timestamp at time zone 'America/La_Paz')
    union all
    select w.performed_at,
           coalesce(w.patient_id::text, 'trabajo:' || w.id::text)
      from public.doctor_works w
     where w.clinic_id = v_clinic
       and w.performed_at >= v_from
       and w.performed_at <= p_today
  ),
  doctor_activity as (
    select a.dentist_name as name,
           coalesce(a.patient_id::text, 'cita:' || a.id::text) as patient_key,
           0::numeric as commission
      from public.appointments a
     where a.clinic_id = v_clinic
       and a.status = 'finished'
       and a.dentist_name <> ''
       and a.starts_at >= (v_month_start::timestamp at time zone 'America/La_Paz')
       and a.starts_at <  (v_next_month::timestamp at time zone 'America/La_Paz')
    union all
    select pr.full_name,
           coalesce(w.patient_id::text, 'trabajo:' || w.id::text),
           coalesce(w.commission_amount, 0)
      from public.doctor_works w
      join public.profiles pr on pr.id = w.doctor_id
     where w.clinic_id = v_clinic
       and pr.full_name <> ''
       and w.performed_at >= v_month_start
       and w.performed_at <  v_next_month
  )
  select jsonb_build_object(
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'patients', d.patients) order by d.day)
        from (
          select day, count(distinct patient_key) as patients
            from activity
           where day >= v_daily_from
           group by day
        ) d
    ), '[]'::jsonb),
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object('month', m.month, 'patients', m.patients) order by m.month)
        from (
          select extract(month from day)::int as month, count(distinct patient_key) as patients
            from activity
           where day >= v_year_start
           group by 1
        ) m
    ), '[]'::jsonb),
    'today', (select count(distinct patient_key) from activity where day = p_today),
    'week', (select count(distinct patient_key) from activity where day >= v_week_start),
    'month', (select count(distinct patient_key) from activity where day >= v_month_start),
    'doctors', coalesce((
      select jsonb_agg(
               jsonb_build_object('name', s.name, 'patients', s.patients, 'commission', s.commission)
               order by s.patients desc, s.name
             )
        from (
          select name, count(distinct patient_key) as patients, sum(commission) as commission
            from doctor_activity
           group by name
        ) s
    ), '[]'::jsonb),
    'month_commissions', (select coalesce(sum(commission), 0) from doctor_activity),
    'month_appointments', (
      select count(*)
        from public.appointments a
       where a.clinic_id = v_clinic
         and a.starts_at >= (v_month_start::timestamp at time zone 'America/La_Paz')
         and a.starts_at <  ((p_today + 1)::timestamp at time zone 'America/La_Paz')
    ),
    'month_no_shows', (
      select count(*)
        from public.appointments a
       where a.clinic_id = v_clinic
         and a.status = 'no_show'
         and a.starts_at >= (v_month_start::timestamp at time zone 'America/La_Paz')
         and a.starts_at <  ((p_today + 1)::timestamp at time zone 'America/La_Paz')
    ),
    'new_patients', (
      select count(*)
        from public.patients p
       where p.clinic_id = v_clinic
         and p.created_at >= (v_month_start::timestamp at time zone 'America/La_Paz')
    ),
    'referrals', coalesce((
      select jsonb_agg(jsonb_build_object('source', r.source, 'patients', r.patients) order by r.patients desc, r.source)
        from (
          select coalesce(btrim(p.referral_source), '') as source, count(*) as patients
            from public.patients p
           where p.clinic_id = v_clinic
           group by 1
        ) r
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.dash_patient_activity(date)
  from public, anon;
grant execute on function public.dash_patient_activity(date)
  to authenticated;
