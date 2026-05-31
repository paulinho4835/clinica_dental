-- ============================================================================
-- 0011_appointment_dentist_text.sql
-- El odontólogo de la cita ahora es texto libre (se escribe), no un usuario.
-- ============================================================================

alter table appointments alter column dentist_id drop not null;
alter table appointments add column dentist_name text;
