-- Vincular doctor_works con el ítem del plan de tratamiento y separar
-- el "costo de lab del tratamiento" (para comisión) del "pago de lab de esta sesión".
--
-- Problema anterior: lab_cost hacía dos cosas:
--   1. Registrar el gasto real de laboratorio de esta sesión (ej. Bs 1000 pagados al lab)
--   2. Ser usado en la fórmula de comisión para deducir el lab
--
-- Con cuotas, el lab se paga UNA VEZ pero la comisión debe repartirse en TODAS las cuotas.
-- Si la segunda cuota no tiene lab_cost=1000, la comisión sale al 100% (sin deducción).
-- Si re-ingresas lab_cost=1000 en la segunda cuota, duplicas el gasto de lab.
--
-- Solución:
--   treatment_item_id: FK al ítem del plan (para trazar pagos por ítem)
--   treatment_lab_cost: costo de lab del TRATAMIENTO completo, copiado del primer pago.
--                       No es un nuevo gasto — solo para el cálculo proporcional de comisión.
--
-- Fórmula de comisión resultante:
--   comisión = cobrado × (costo_tratamiento − lab_tratamiento) / costo_tratamiento × %
--
-- Ej. Coronas: cost=2500, treatment_lab_cost=1000, pct=40%
--   Cuota 1 (500): 500 × 1500/2500 × 40% = Bs 120
--   Cuota 2 (450): 450 × 1500/2500 × 40% = Bs 108
--   Cuota 3 (1550): 1550 × 1500/2500 × 40% = Bs 372  → Total = Bs 600 ✓

-- 1. Vincular con ítem del plan
alter table doctor_works
  add column if not exists treatment_item_id uuid references treatment_items(id) on delete set null;

-- 2. Costo de lab del tratamiento (distinto del gasto de lab de esta sesión)
alter table doctor_works
  add column if not exists treatment_lab_cost numeric(12,2) not null default 0;

-- 3. Rellenar registros existentes (mejor estimación: el lab_cost de la propia sesión)
update doctor_works set treatment_lab_cost = lab_cost where treatment_lab_cost = 0 and lab_cost > 0;

-- 4. Actualizar fórmula de comisión para usar treatment_lab_cost en lugar de lab_cost
alter table doctor_works drop column commission_amount;
alter table doctor_works
  add column commission_amount numeric(12,2)
    generated always as (
      case when cost > 0
        then round(amount_paid * greatest(cost - treatment_lab_cost, 0) / cost * commission_pct / 100, 2)
        else round(amount_paid * commission_pct / 100, 2)
      end
    ) stored;
