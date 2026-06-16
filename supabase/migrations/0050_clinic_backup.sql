-- ============================================================================
-- 0050: Backup y restauración de clínicas (Superadmin)
-- Tres funciones SECURITY DEFINER, ejecutables solo por service_role:
--   backup_clinic(uuid)            -> snapshot jsonb de toda la clínica
--   clinic_backup_schema()         -> metadata (columnas, generadas, FKs) para el restore
--   restore_clinic_apply(jsonb,jsonb) -> inserta el clon de forma atómica
-- Diseño: docs/superpowers/specs/2026-06-16-backup-restore-clinicas-design.md
-- ============================================================================

-- Tablas que NO se respaldan como datos restaurables:
--   profiles -> son cuentas de login (auth.users); el restore reusa las existentes.
-- (clinics se maneja aparte; platform_admins no tiene clinic_id.)

-- ── backup_clinic ───────────────────────────────────────────────────────────
create or replace function backup_clinic(p_clinic_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  tbl_rows jsonb;
  clinic_row jsonb;
  tables_out jsonb := '{}'::jsonb;
begin
  select to_jsonb(c) into clinic_row from clinics c where c.id = p_clinic_id;
  if clinic_row is null then
    raise exception 'Clínica % no encontrada', p_clinic_id;
  end if;

  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'clinic_id'
      and t.table_type = 'BASE TABLE'
      and c.table_name <> 'profiles'
    order by c.table_name
  loop
    execute format(
      'select coalesce(jsonb_agg(t), ''[]''::jsonb) from public.%I t where t.clinic_id = $1',
      r.table_name
    ) into tbl_rows using p_clinic_id;
    tables_out := tables_out || jsonb_build_object(r.table_name, tbl_rows);
  end loop;

  return jsonb_build_object(
    'version', 1,
    'generated_at', now(),
    'source_clinic_id', p_clinic_id,
    'clinic', clinic_row,
    'tables', tables_out
  );
end;
$$;

-- ── clinic_backup_schema ────────────────────────────────────────────────────
create or replace function clinic_backup_schema()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with clinic_tables as (
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'clinic_id'
      and t.table_type = 'BASE TABLE'
      and c.table_name <> 'profiles'
  ),
  cols as (
    select c.table_name,
           jsonb_agg(
             jsonb_build_object(
               'name', c.column_name,
               'generated', (c.is_generated = 'ALWAYS'),
               'not_null', (c.is_nullable = 'NO')
             ) order by c.ordinal_position
           ) as columns
    from information_schema.columns c
    join clinic_tables ct on ct.table_name = c.table_name
    where c.table_schema = 'public'
    group by c.table_name
  ),
  fk_edges as (
    select replace(con.conrelid::regclass::text, 'public.', '') as child,
           att.attname as column_name,
           replace(con.confrelid::regclass::text, 'public.', '') as parent
    from pg_constraint con
    join lateral unnest(con.conkey) with ordinality as wk(attnum, ord) on true
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = wk.attnum
    where con.contype = 'f'
      and con.connamespace = 'public'::regnamespace
      and replace(con.conrelid::regclass::text, 'public.', '')
          in (select table_name from clinic_tables)
  ),
  fk_agg as (
    select child as table_name,
           jsonb_agg(jsonb_build_object('column', column_name, 'parent', parent)) as fks
    from fk_edges
    group by child
  )
  select jsonb_build_object(
    'tables',
    (select jsonb_object_agg(
       ct.table_name,
       jsonb_build_object(
         'columns', coalesce(co.columns, '[]'::jsonb),
         'fks', coalesce(fa.fks, '[]'::jsonb)
       )
     )
     from clinic_tables ct
     left join cols co on co.table_name = ct.table_name
     left join fk_agg fa on fa.table_name = ct.table_name)
  );
$$;

-- ── restore_clinic_apply ────────────────────────────────────────────────────
-- p_new_clinic: objeto jsonb con la fila de la clínica nueva (id ya asignado).
-- p_ordered:    array [{ "table": "...", "rows": [...] }] en orden topológico,
--               con ids/FKs ya remapeados por TS y SIN columnas generadas.
-- Todo ocurre en una transacción: si algo falla, rollback total.
create or replace function restore_clinic_apply(p_new_clinic jsonb, p_ordered jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_clinic_id uuid;
  entry jsonb;
  tname text;
  trows jsonb;
  col_list text;
begin
  -- 1) Clínica nueva (excluye columnas generadas, por si las hubiera).
  select string_agg(quote_ident(column_name), ', ')
    into col_list
  from information_schema.columns
  where table_schema = 'public' and table_name = 'clinics'
    and is_generated <> 'ALWAYS';

  -- Se desactivan los triggers de USUARIO durante los inserts: los datos del
  -- backup ya están completos, no deben re-derivarse (p.ej. un trigger que crea
  -- account_movements al insertar payments duplicaría filas). Los triggers de
  -- sistema (FKs) siguen activos, así que las llaves foráneas se validan igual.
  alter table public.clinics disable trigger user;
  execute format(
    'insert into public.clinics (%s) select %s from jsonb_populate_record(null::public.clinics, $1) returning id',
    col_list, col_list
  ) into new_clinic_id using p_new_clinic;
  alter table public.clinics enable trigger user;

  -- 2) Resto de tablas en orden, excluyendo columnas generadas.
  for entry in select * from jsonb_array_elements(p_ordered)
  loop
    tname := entry->>'table';
    trows := entry->'rows';
    if trows is null or jsonb_array_length(trows) = 0 then
      continue;
    end if;

    select string_agg(quote_ident(column_name), ', ')
      into col_list
    from information_schema.columns
    where table_schema = 'public' and table_name = tname
      and is_generated <> 'ALWAYS';

    execute format('alter table public.%I disable trigger user', tname);
    execute format(
      'insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1)',
      tname, col_list, col_list, tname
    ) using trows;
    execute format('alter table public.%I enable trigger user', tname);
  end loop;

  return new_clinic_id;
end;
$$;

-- ── Permisos: solo service_role (y el owner) pueden ejecutar ────────────────
revoke all on function backup_clinic(uuid) from public;
revoke all on function clinic_backup_schema() from public;
revoke all on function restore_clinic_apply(jsonb, jsonb) from public;
grant execute on function backup_clinic(uuid) to service_role;
grant execute on function clinic_backup_schema() to service_role;
grant execute on function restore_clinic_apply(jsonb, jsonb) to service_role;
