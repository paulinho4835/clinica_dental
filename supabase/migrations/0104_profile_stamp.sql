-- Sello digital del doctor (foto, data URL comprimida). Se autocompleta en
-- recetas médicas junto a la firma, usando prescriptions.doctor_id.
alter table profiles add column if not exists stamp text;
