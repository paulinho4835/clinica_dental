-- ============================================================================
-- 0002_rls.sql — Row Level Security multi-inquilino + custom JWT claims
-- Aislamiento: cada usuario solo ve filas de SU clínica. clinic_id viaja en el JWT.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Custom Access Token Hook: inyecta clinic_id y role en app_metadata del JWT.
-- Así RLS NO necesita un JOIN a profiles en cada consulta -> rápido y escalable.
-- (Registrado en config.toml -> [auth.hook.custom_access_token])
-- ----------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims   jsonb;
  v_clinic uuid;
  v_role   text;
begin
  select p.clinic_id, p.role::text
    into v_clinic, v_role
  from public.profiles p
  where p.id = (event->>'user_id')::uuid;

  claims := coalesce(event->'claims', '{}'::jsonb);
  claims := jsonb_set(claims, '{app_metadata}', coalesce(claims->'app_metadata', '{}'::jsonb));

  if v_clinic is not null then
    claims := jsonb_set(claims, '{app_metadata, clinic_id}', to_jsonb(v_clinic::text));
    claims := jsonb_set(claims, '{app_metadata, role}', to_jsonb(v_role));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant usage on schema public to supabase_auth_admin;
grant select on public.profiles to supabase_auth_admin;

-- ----------------------------------------------------------------------------
-- Helpers leídos por las políticas (envueltos en (select ...) en cada policy
-- para que el planner los evalúe UNA vez por statement, no por fila).
-- ----------------------------------------------------------------------------
create or replace function public.auth_clinic_id()
returns uuid language sql stable as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'clinic_id',
    ''
  )::uuid
$$;

create or replace function public.auth_role()
returns app_role language sql stable as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role',
    'asistente'
  )::app_role
$$;

-- ----------------------------------------------------------------------------
-- clinics: el usuario ve / edita solo su propia clínica.
-- ----------------------------------------------------------------------------
alter table clinics enable row level security;
create policy clinics_select on clinics for select
  using (id = (select auth_clinic_id()));
create policy clinics_update on clinics for update
  using (id = (select auth_clinic_id()) and (select auth_role()) = 'admin');

-- profiles: ve a los miembros de su clínica; solo admin gestiona roles.
alter table profiles enable row level security;
create policy profiles_select on profiles for select
  using (clinic_id = (select auth_clinic_id()));
create policy profiles_admin_write on profiles for all
  using (clinic_id = (select auth_clinic_id()) and (select auth_role()) = 'admin')
  with check (clinic_id = (select auth_clinic_id()) and (select auth_role()) = 'admin');

-- ----------------------------------------------------------------------------
-- Política de aislamiento por tenant aplicada en bloque a TODA tabla con clinic_id.
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_name = c.table_name and tb.table_schema = c.table_schema
    where c.table_schema = 'public'
      and c.column_name = 'clinic_id'
      and tb.table_type = 'BASE TABLE'
      and c.table_name <> 'clinics'
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      create policy tenant_isolation on public.%I
        for all
        using (clinic_id = (select auth_clinic_id()))
        with check (clinic_id = (select auth_clinic_id()));
    $f$, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Catálogo global de condiciones dentales: lectura para cualquier autenticado.
-- ----------------------------------------------------------------------------
alter table dental_condition_catalog enable row level security;
create policy condition_catalog_read on dental_condition_catalog for select
  to authenticated using (true);

-- ----------------------------------------------------------------------------
-- Restricciones por ROL sobre la base de aislamiento (políticas RESTRICTIVE
-- se suman con AND a la permisiva tenant_isolation).
-- ----------------------------------------------------------------------------
-- Solo admin/recepcionista borran pacientes.
create policy patients_delete_roles on patients as restrictive for delete
  using ((select auth_role()) in ('admin', 'recepcionista'));

-- Finanzas sensibles: solo admin gestiona gastos y liquida comisiones.
create policy expenses_admin on expenses as restrictive for all
  using ((select auth_role()) = 'admin')
  with check ((select auth_role()) = 'admin');

-- El log de auditoría no se modifica ni borra por la app (solo insert + select).
create policy audit_no_mutate on audit_log as restrictive for update using (false);
create policy audit_no_delete on audit_log as restrictive for delete using (false);
