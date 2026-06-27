-- Estadísticas de almacenamiento de la PLATAFORMA (tamaño de la base de datos y
-- del Storage de Supabase) para que el superadmin sepa cuándo se acerca al límite
-- del free tier y tendrá que pagar el plan Pro.
--
-- SECURITY DEFINER: pg_database_size() y storage.objects requieren privilegios que
-- el rol service_role no tiene directamente vía PostgREST; la función corre como
-- su dueño (postgres). search_path acotado (sin public) para evitar secuestro.

create or replace function public.platform_storage_stats()
returns table (database_bytes bigint, storage_bytes bigint)
language sql
security definer
set search_path = pg_catalog, storage
as $$
  select
    pg_database_size(current_database())::bigint as database_bytes,
    coalesce(
      (select sum((metadata->>'size')::bigint) from storage.objects),
      0
    )::bigint as storage_bytes;
$$;

-- Solo el panel de superadmin (service_role) puede leerla; nunca anon/authenticated.
revoke all on function public.platform_storage_stats() from public;
grant execute on function public.platform_storage_stats() to service_role;
