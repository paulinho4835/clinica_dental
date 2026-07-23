-- Soporte para el filtro de "Registros entrantes" en /pacientes
-- (kind='new' and reviewed_at is null), que corre en cada carga de la página
-- para admin/recepción/colega. Sin este índice parcial, cada carga hace un
-- seq scan sobre toda anamnesis_invitations de la clínica.
create index if not exists idx_anamnesis_invitations_pending_new
  on anamnesis_invitations (clinic_id, created_at desc)
  where kind = 'new' and reviewed_at is null;
