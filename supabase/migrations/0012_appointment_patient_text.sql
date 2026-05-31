-- ============================================================================
-- 0012_appointment_patient_text.sql
-- Permite agendar pacientes NO registrados (consulta rápida / emergencia):
-- patient_id pasa a ser opcional y se agrega patient_name (texto libre).
-- Una cita debe tener paciente registrado (patient_id) O nombre suelto.
-- ============================================================================

alter table appointments alter column patient_id drop not null;
alter table appointments add column patient_name text;

alter table appointments
  add constraint appointments_patient_present
  check (patient_id is not null or patient_name is not null);
