-- ============================================================================
-- 0013_appointment_finance.sql
-- Capa financiera del agendamiento: cotización inicial + adelanto/seña.
-- Para consulta rápida (sin patient_id) el dinero NO puede ir a `payments`
-- (FK obligatoria), así que se guarda aquí de forma temporal y migra al
-- historial del paciente cuando éste asiste o se vincula a un expediente.
-- ============================================================================

alter table appointments
  add column consult_price  numeric(12,2) not null default 0, -- cotización / precio de consulta
  add column deposit        numeric(12,2) not null default 0, -- adelanto / seña dejada
  add column deposit_method payment_method,                   -- efectivo/tarjeta/transferencia
  add column finance_migrated boolean not null default false; -- ya pasó al historial
