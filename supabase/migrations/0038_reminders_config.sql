-- Identifica qué timing generó cada fila: 24 (24h antes) o 2 (2h antes).
-- NULL en filas creadas antes de este addon (retrocompatible).
alter table appointment_reminders
  add column if not exists hours_before integer;
