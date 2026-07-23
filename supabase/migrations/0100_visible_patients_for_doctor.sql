-- Reemplaza el cálculo en JS de qué pacientes ve un doctor en la agenda
-- (visiblePatientsForDoctor en lib/agenda/doctorPatientVisibility.ts). Antes
-- app/(dashboard)/agenda/page.tsx traía TODAS las citas y TODOS los
-- doctor_works de la clínica (patient_id de cada fila, sin filtro de fecha)
-- en cada carga de agenda para un doctor, solo para armar dos Sets en
-- memoria. Mismo patrón que 0099: mover el cálculo a SQL.
--
-- Replica exactamente la regla de negocio: un doctor ve (1) los pacientes que
-- ya atendió (cita o trabajo con él) y (2) los pacientes que TODAVÍA nadie en
-- la clínica atendió — no ve a los ya "reclamados" por otro doctor.
create or replace function visible_patients_for_doctor(
  p_clinic_id uuid,
  p_dentist_name text,
  p_doctor_id uuid
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
      or (
        not exists (select 1 from appointments a2 where a2.patient_id = p.id)
        and not exists (select 1 from doctor_works w2 where w2.patient_id = p.id)
      )
    )
  order by p.full_name;
$$;

-- Soporte para los EXISTS por patient_id de arriba (el índice existente de
-- doctor_works es (doctor_id, patient_id), no sirve para "¿algún doctor
-- atendió a este paciente?").
create index if not exists idx_appointments_patient_id
  on appointments(patient_id)
  where patient_id is not null;

create index if not exists idx_doctor_works_patient_id
  on doctor_works(patient_id)
  where patient_id is not null;
