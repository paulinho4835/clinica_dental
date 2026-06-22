-- Permite a la recepcionista LEER e INSERTAR trabajos de su clínica vía RLS,
-- para dejar de usar el cliente service-role (createAdminClient) en las rutas
-- de clínica de /mis-trabajos y la ficha del paciente.
--
-- Contexto: la policy restrictiva original `doctor_works_own` (migración 0022)
-- solo permitía al admin o al propio doctor. La recepcionista quedaba fuera, así
-- que el código la bypaseaba con service-role (RLS apagada) — un footgun de
-- aislamiento entre clínicas. Aquí la incluimos en la RLS y separamos por
-- comando: la recepcionista puede ver e insertar (registra a nombre del doctor),
-- pero NO modificar ni borrar (eso sigue siendo admin o el propio doctor).
--
-- La policy PERMISIVA `tenant_isolation` (clinic_id = auth_clinic_id()) sigue
-- vigente y se combina con AND, así que el aislamiento por clínica se mantiene.

drop policy if exists doctor_works_own on doctor_works;

-- Lectura: admin y recepcionista ven toda su clínica; doctores solo lo suyo.
create policy doctor_works_select on doctor_works as restrictive for select
  using (
    (select auth_role()) in ('admin', 'recepcionista')
    or doctor_id = (select auth.uid())
  );

-- Inserción: admin y recepcionista (registran a nombre de un doctor) o el doctor.
create policy doctor_works_insert on doctor_works as restrictive for insert
  with check (
    (select auth_role()) in ('admin', 'recepcionista')
    or doctor_id = (select auth.uid())
  );

-- Modificación: solo admin o el propio doctor (recepcionista NO edita trabajos).
create policy doctor_works_update on doctor_works as restrictive for update
  using ((select auth_role()) = 'admin' or doctor_id = (select auth.uid()))
  with check ((select auth_role()) = 'admin' or doctor_id = (select auth.uid()));

-- Borrado: solo admin o el propio doctor.
create policy doctor_works_delete on doctor_works as restrictive for delete
  using ((select auth_role()) = 'admin' or doctor_id = (select auth.uid()));

notify pgrst, 'reload schema';
