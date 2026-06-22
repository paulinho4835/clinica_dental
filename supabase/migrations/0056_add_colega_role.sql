-- Agrega el rol "colega" como copia funcional de "recepcionista".
-- Diseñado para clínicas que trabajan de forma colaborativa entre sí.
-- Tiene exactamente los mismos permisos que recepcionista en RLS y en la app.

alter type app_role add value if not exists 'colega';

-- Recrear la policy de eliminación de pacientes para incluir 'colega'.
drop policy if exists patients_delete_admin on patients;
create policy patients_delete_admin on patients for delete
  using ((select auth_role()) in ('admin', 'recepcionista', 'colega'));

-- Recrear las policies de doctor_works para incluir 'colega'
-- (mismos permisos que 'recepcionista': leer e insertar, no editar ni borrar).
drop policy if exists doctor_works_select on doctor_works;
create policy doctor_works_select on doctor_works as restrictive for select
  using (
    (select auth_role()) in ('admin', 'recepcionista', 'colega')
    or doctor_id = (select auth.uid())
  );

drop policy if exists doctor_works_insert on doctor_works;
create policy doctor_works_insert on doctor_works as restrictive for insert
  with check (
    (select auth_role()) in ('admin', 'recepcionista', 'colega')
    or doctor_id = (select auth.uid())
  );

drop policy if exists doctor_works_update on doctor_works;
create policy doctor_works_update on doctor_works as restrictive for update
  using ((select auth_role()) = 'admin' or doctor_id = (select auth.uid()))
  with check ((select auth_role()) = 'admin' or doctor_id = (select auth.uid()));

drop policy if exists doctor_works_delete on doctor_works;
create policy doctor_works_delete on doctor_works as restrictive for delete
  using ((select auth_role()) = 'admin' or doctor_id = (select auth.uid()));

notify pgrst, 'reload schema';
