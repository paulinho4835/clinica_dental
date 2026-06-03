-- Agrega campo opcional de nota a pagos (ej: "Adelanto", "Pago tratamiento").
alter table payments add column if not exists note text;
