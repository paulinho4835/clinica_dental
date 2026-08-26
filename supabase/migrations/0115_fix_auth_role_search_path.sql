-- auth_role() puede ser inlineada dentro de funciones con search_path vacío
-- (por ejemplo get_agenda_appointments). Calificar el tipo evita que
-- PostgreSQL intente resolver app_role fuera de public.
create or replace function public.auth_role()
returns public.app_role
language sql
stable
set search_path = public
as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::jsonb
      -> 'app_metadata' ->> 'role',
    'asistente'
  )::public.app_role
$$;

notify pgrst, 'reload schema';
