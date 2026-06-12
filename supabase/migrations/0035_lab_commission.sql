-- Comisión separada para el trabajo de laboratorio.
alter table doctor_works
  add column lab_commission_pct    numeric(5,2)  not null default 0,
  add column lab_commission_amount numeric(12,2)
    generated always as (round(lab_cost * lab_commission_pct / 100, 2)) stored;
