-- Restringir eliminación de pacientes solo al rol admin (antes también recepcionista).
drop policy if exists patients_delete_roles on patients;

create policy patients_delete_roles on patients as restrictive for delete
  using ((select auth_role()) = 'admin');
