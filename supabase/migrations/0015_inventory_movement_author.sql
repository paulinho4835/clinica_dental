-- ============================================================================
-- 0015_inventory_movement_author.sql
-- Trazabilidad: registra QUIÉN hizo cada movimiento de inventario.
-- ============================================================================

alter table inventory_movements
  add column created_by uuid references profiles(id) on delete set null;

create index idx_inv_mov_recent on inventory_movements(clinic_id, created_at desc);
