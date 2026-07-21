-- ¿Cómo nos conociste? Capturado en el registro de alta por WhatsApp
-- (app/h/[token]) y guardado en la ficha del paciente al aprobar el alta.
alter table patients add column if not exists referral_source text;
alter table patients add column if not exists referral_source_other text;
