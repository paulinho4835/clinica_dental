-- Corrección: la comisión del doctor se calcula sobre lo COBRADO (amount_paid)
-- y no sobre el costo total del tratamiento (cost).
-- Esto permite pagos en cuotas: cada cuota genera la comisión proporcional.
--
-- Fórmula anterior: round((cost - lab_cost) * commission_pct / 100, 2)
-- Fórmula nueva:    round(greatest(amount_paid - lab_cost, 0) * commission_pct / 100, 2)
--
-- greatest(..., 0) evita comisiones negativas cuando amount_paid < lab_cost.

alter table doctor_works drop column commission_amount;
alter table doctor_works
  add column commission_amount numeric(12,2)
    generated always as (
      round(greatest(amount_paid - lab_cost, 0) * commission_pct / 100, 2)
    ) stored;
