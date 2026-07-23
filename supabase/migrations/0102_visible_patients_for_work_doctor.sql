-- Reemplaza el cálculo en JS de qué pacientes ve un doctor/colega en
-- "Mis trabajos" (app/(dashboard)/mis-trabajos/page.tsx). Antes la página
-- traía TODAS las citas, TODOS los doctor_works y TODOS los treatment_items
-- de ese doctor (sin filtro de fecha) en cada carga, solo para armar un Set
-- de patient_ds en memoria. Mismo patrón que 0100 (agenda), pero con una
-- regla distinta: acá NO hay fallback de "paciente sin reclamar" — solo
-- pacientes con los que el doctor ya tuvo contacto real (cita, trabajo, o
-- ítem de plan de tratamiento asignado a él).
create or replace function visible_patients_for_work_doctor(
  p_clinic_id uuid,
  p_doctor_id uuid,
  p_dentist_name text
)
returns table(id uuid, full_name text, national_id text)
language sql
stable
security invoker
as $$
  select p.id, p.full_name, p.national_id
  from patients p
  where p.clinic_id = p_clinic_id
    and (
      exists (
        select 1 from appointments a
        where a.patient_id = p.id and a.dentist_name = p_dentist_name
      )
      or exists (
        select 1 from doctor_works w
        where w.patient_id = p.id and w.doctor_id = p_doctor_id
      )
      or exists (
        select 1
        from treatment_items ti
        join treatment_phases th on th.id = ti.phase_id
        join treatment_plans tp on tp.id = th.plan_id
        where tp.patient_id = p.id and ti.doctor_id = p_doctor_id
      )
    )
  order by p.full_name;
$$;

-- Soporte para el EXISTS de treatment_items por doctor_id (sin índice hasta
-- ahora). appointments(patient_id) y doctor_works(patient_id) ya se agregaron
-- en la migración 0100, y treatment_plans(clinic_id, patient_id) ya existe
-- desde 0001 — cubren el resto de los EXISTS de arriba.
create index if not exists idx_treatment_items_doctor_id
  on treatment_items(doctor_id)
  where doctor_id is not null;
