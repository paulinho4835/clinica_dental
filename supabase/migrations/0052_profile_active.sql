-- ----------------------------------------------------------------------------
-- Estado de alta/baja del usuario (cuenta con login) dentro de una clínica.
-- Un usuario desactivado (active = false) sigue existiendo con TODO su rastro
-- intacto (citas, trabajos, comisiones, notas), pero no puede operar: el layout
-- del dashboard le muestra un aviso de cuenta desactivada.
-- Reversible desde Ajustes → Usuarios (distinto de eliminar, que borra la cuenta
-- auth y deja su información clínica anonimizada o, si tiene comisiones/citas,
-- bloquea el borrado por las foreign keys ON DELETE RESTRICT).
-- ----------------------------------------------------------------------------
alter table profiles
  add column if not exists active boolean not null default true;
