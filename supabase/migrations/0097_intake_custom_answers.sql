-- Respuestas a las preguntas adicionales de registro configuradas por cada
-- clínica (ver lib/intakeQuestions.ts). Ambas columnas guardan un array de
-- snapshots [{key, label, type, value}], no un mapa key->value: así una
-- respuesta ya guardada conserva su etiqueta aunque la clínica edite o borre
-- la pregunta después.
alter table anamnesis_invitations add column if not exists submitted_custom jsonb;
alter table patients add column if not exists custom_intake_answers jsonb not null default '[]'::jsonb;
