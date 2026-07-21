-- Firma digital del doctor (data URL PNG, trazo blanco+negro del SignaturePad).
-- Se autocompleta en recetas médicas usando prescriptions.doctor_id.
alter table profiles add column if not exists signature text;
