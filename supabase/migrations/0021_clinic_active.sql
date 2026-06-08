-- ----------------------------------------------------------------------------
-- Estado de alta/baja de la clínica. Una clínica dada de baja (active = false)
-- sigue existiendo con todos sus datos, pero sus usuarios no pueden operar:
-- el layout del dashboard les muestra un aviso de cuenta suspendida.
-- Reversible desde /superadmin (distinto de eliminar, que borra todo).
-- ----------------------------------------------------------------------------
alter table clinics
  add column if not exists active boolean not null default true;
