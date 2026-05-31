-- ============================================================================
-- 0010_treatment_custom_procedure.sql
-- Permite procedimientos libres (escritos por el odontólogo) en el plan,
-- sin obligar a que existan en procedure_catalog.
-- ============================================================================

-- El item puede venir del catálogo (procedure_id) O ser texto libre (custom_name).
alter table treatment_items alter column procedure_id drop not null;
alter table treatment_items add column custom_name text;

-- Al menos uno de los dos debe existir.
alter table treatment_items
  add constraint treatment_items_procedure_or_name
  check (procedure_id is not null or custom_name is not null);
