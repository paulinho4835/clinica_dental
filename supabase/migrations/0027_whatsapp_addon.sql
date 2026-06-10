-- WhatsApp como add-on opt-in por clínica.
-- Se almacena en clinics.features (JSONB existente) bajo la clave "whatsapp".
-- El código en lib/features.ts (optIn: true) devuelve false cuando la clave falta,
-- por lo que no hay riesgo de activarlo accidentalmente en clínicas existentes.

-- Actualizar el default de la columna features para incluir whatsapp: false
-- explícitamente en nuevas clínicas creadas sin features personalizadas.
alter table clinics
  alter column features set default '{
    "agenda": true,
    "pacientes": true,
    "inventario": true,
    "caja": true,
    "ajustes": true,
    "whatsapp": false
  }'::jsonb;
