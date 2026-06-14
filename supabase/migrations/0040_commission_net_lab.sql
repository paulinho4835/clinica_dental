-- Nueva regla de cálculo de comisión del doctor:
--   Escenario A (sin lab, lab_cost = 0): commission = cost × pct / 100
--   Escenario B (con lab, lab_cost > 0):  commission = (cost − lab_cost) × pct / 100
-- La fórmula unificada cubre ambos casos: cuando lab_cost = 0 es idéntica al cálculo anterior.
-- Se debe dropear y recrear porque PostgreSQL no permite ALTER en GENERATED ALWAYS columns.

alter table doctor_works drop column commission_amount;
alter table doctor_works
  add column commission_amount numeric(12,2)
    generated always as (round((cost - lab_cost) * commission_pct / 100, 2)) stored;
