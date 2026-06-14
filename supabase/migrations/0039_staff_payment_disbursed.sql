-- Indica si el dinero fue físicamente entregado al empleado.
-- false (default): trabajo registrado pero dinero aún no desembolsado.
-- true: el administrador confirmó que el efectivo/transferencia fue entregado.
alter table staff_payments
  add column if not exists disbursed boolean not null default false;
