-- Límite configurable de pacientes por clínica.
-- null = sin límite (comportamiento actual, no cambia para clínicas existentes).
-- El superadmin lo ajusta por clínica según el acuerdo comercial.
alter table clinics add column if not exists max_patients integer;
