-- PostgREST ejecuta las consultas de la app como authenticated o service_role.
-- RLS mantiene el aislamiento de filas y permisos por rol de negocio; estos
-- grants solo habilitan el acceso SQL requerido para que dichas policies corran.
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;
grant usage, select on all sequences in schema public
  to authenticated, service_role;

-- Evita que tablas/secuencias creadas por migraciones futuras vuelvan a quedar
-- inaccesibles después de un reset local.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to authenticated, service_role;
