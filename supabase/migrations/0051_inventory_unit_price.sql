-- Precio unitario opcional por insumo (en Bs.).
-- Permite calcular el capital total en inventario: sum(current_stock * unit_price).
alter table inventory_items
  add column if not exists unit_price numeric(10, 2);
