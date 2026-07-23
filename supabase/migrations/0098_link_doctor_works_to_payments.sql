-- Vincula cada doctor_work con el pago de paciente que registró el mismo cobro
-- (registrado desde "Mis trabajos" o desde la ficha del paciente). Antes ambos
-- registros se creaban por separado sin relación explícita, dependiendo de
-- coincidencias ambiguas de fecha/monto/texto para conciliarlos a mano.
-- ON DELETE CASCADE: borrar el pago borra el trabajo vinculado (representan el
-- mismo hecho financiero, no tiene sentido que sobreviva uno sin el otro).
alter table doctor_works
  add column if not exists payment_id uuid references payments(id) on delete cascade;

create index if not exists idx_doctor_works_payment_id
  on doctor_works(payment_id)
  where payment_id is not null;
