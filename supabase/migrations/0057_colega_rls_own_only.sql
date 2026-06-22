-- Ajuste del rol "colega": ve y registra SOLO sus propios trabajos (como un doctor),
-- NO toda la clínica como recepcionista.
-- La migración 0056 lo había incluido en el grupo 'recepcionista'; esto lo corrige.

-- Lectura: admin y recepcionista ven toda la clínica; doctores y colegas solo lo suyo.
drop policy if exists doctor_works_select on doctor_works;
create policy doctor_works_select on doctor_works as restrictive for select
  using (
    (select auth_role()) in ('admin', 'recepcionista')
    or doctor_id = (select auth.uid())
  );

-- Inserción: admin y recepcionista registran para cualquier doctor;
-- doctores y colegas solo insertan trabajos con su propio doctor_id.
drop policy if exists doctor_works_insert on doctor_works;
create policy doctor_works_insert on doctor_works as restrictive for insert
  with check (
    (select auth_role()) in ('admin', 'recepcionista')
    or doctor_id = (select auth.uid())
  );

-- Modificación y borrado: sin cambio (admin o el propio doctor/colega).
drop policy if exists doctor_works_update on doctor_works;
create policy doctor_works_update on doctor_works as restrictive for update
  using ((select auth_role()) = 'admin' or doctor_id = (select auth.uid()))
  with check ((select auth_role()) = 'admin' or doctor_id = (select auth.uid()));

drop policy if exists doctor_works_delete on doctor_works;
create policy doctor_works_delete on doctor_works as restrictive for delete
  using ((select auth_role()) = 'admin' or doctor_id = (select auth.uid()));

-- La eliminación de pacientes no aplica a colega (solo admin).
-- La policy de patients_delete_admin de 0056 ya está bien: colega no tiene patients:delete.
-- Solo nos aseguramos de que la policy sea correcta:
drop policy if exists patients_delete_admin on patients;
create policy patients_delete_admin on patients for delete
  using ((select auth_role()) in ('admin', 'recepcionista'));

notify pgrst, 'reload schema';
