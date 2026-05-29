-- ============================================================================
-- 0006_realtime.sql — Habilita Supabase Realtime en la agenda.
-- El tablero de citas se actualiza en vivo (sin polling). RLS sigue aplicando:
-- cada usuario solo recibe cambios de las citas de SU clínica.
-- ============================================================================

-- Agrega appointments a la publicación de Realtime (idempotente).
do $$
begin
  alter publication supabase_realtime add table appointments;
exception
  when duplicate_object then null;   -- ya estaba en la publicación
  when undefined_object then null;   -- publicación no existe en este entorno
end $$;

-- REPLICA IDENTITY FULL para que los eventos UPDATE/DELETE incluyan
-- las columnas necesarias para que el cliente filtre por clinic_id.
alter table appointments replica identity full;
