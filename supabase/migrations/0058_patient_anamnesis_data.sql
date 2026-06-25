-- 0058_patient_anamnesis_data.sql — Anamnesis estructurada (Fase 1)
-- Cuestionario médico estructurado en JSONB. El campo de texto libre
-- patients.anamnesis se conserva como "anamnesis histórica" de solo lectura.
-- Las alergias/alertas siguen viviendo en patients.allergies / medical_alerts.

alter table patients add column if not exists anamnesis_data jsonb;
