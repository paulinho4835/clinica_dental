-- ============================================================================
-- 0080_realtime_anamnesis_invitations.sql — Habilita Supabase Realtime en los
-- registros entrantes de pacientes por WhatsApp (anamnesis_invitations).
-- El panel se actualiza en vivo (sin F5). RLS sigue aplicando: cada usuario
-- solo recibe cambios de las invitaciones de SU clínica.
-- ============================================================================

do $$
begin
  alter publication supabase_realtime add table anamnesis_invitations;
exception
  when duplicate_object then null;   -- ya estaba en la publicación
  when undefined_object then null;   -- publicación no existe en este entorno
end $$;

alter table anamnesis_invitations replica identity full;
