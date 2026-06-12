-- Datos de perfil público de la clínica (addon "perfil").
-- Se usan en documentos impresos: encabezados de recetas, presupuestos, etc.
alter table clinics
  add column if not exists address   text,
  add column if not exists phone     text,
  add column if not exists nit       text,   -- NIT / RUC / número fiscal
  add column if not exists logo_url  text;   -- URL pública de la imagen del logo
