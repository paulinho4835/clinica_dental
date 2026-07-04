-- 0076_agent_intake_source.sql — Origen de los registros entrantes
-- El agente de WhatsApp (Asistente Virtual) ya NO crea fichas de pacientes
-- directamente: deja una solicitud de registro pendiente (kind='new') que el
-- admin/recepción aprueba en el panel "Registros entrantes", igual que las
-- altas por enlace. Esta columna deja constancia de quién originó la solicitud
-- para mostrarlo en el panel.

alter table anamnesis_invitations
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'agente'));

notify pgrst, 'reload schema';
