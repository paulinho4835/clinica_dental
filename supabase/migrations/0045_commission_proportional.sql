-- Corrección: comisión proporcional al neto de lab, sin castigar cuotas parciales.
--
-- Fórmula anterior (0044): greatest(amount_paid - lab_cost, 0) * pct / 100
--   Problema: si amount_paid < lab_cost la comisión es siempre 0 aunque se haya
--   cobrado dinero. Esto ocurre cuando el paciente paga en cuotas y la primera
--   cuota no alcanza a cubrir el costo del laboratorio.
--
-- Fórmula nueva: amount_paid × (cost - lab_cost) / cost × pct / 100
--   Cada cuota aporta su fracción proporcional de la ganancia neta.
--   Ej. Coronas: cost=2500, lab=1000 → neto=60% del total.
--       Cuota de Bs 500: 500 × 60% × 40% = Bs 120 de comisión.
--
-- Cuando cost=0 (sin precio registrado) se usa la cuota directamente sin
-- deducción de lab para evitar división por cero.

alter table doctor_works drop column commission_amount;
alter table doctor_works
  add column commission_amount numeric(12,2)
    generated always as (
      round(
        amount_paid
        * case when cost > 0 then greatest(cost - lab_cost, 0) / cost else 1 end
        * commission_pct / 100,
        2
      )
    ) stored;
