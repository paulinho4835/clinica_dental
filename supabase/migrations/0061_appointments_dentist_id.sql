-- 0061_appointments_dentist_id.sql — Vincula la cita al perfil del odontólogo por id.
-- `dentist_name` (texto) se conserva como copia denormalizada para display,
-- compatibilidad con el webhook de Vapi y los filtros actuales de la agenda.
-- `dentist_id` pasa a ser la fuente de verdad para la detección de choques de
-- horario (evita que dos doctores homónimos choquen o que un cambio de nombre
-- deje citas huérfanas) y habilita filtros robustos en el futuro.

alter table appointments
  add column if not exists dentist_id uuid references profiles(id) on delete set null;

create index if not exists appointments_dentist_id_idx
  on appointments (dentist_id)
  where dentist_id is not null;

-- Backfill: emparejar por nombre exacto dentro de la misma clínica.
update appointments a
set dentist_id = p.id
from profiles p
where a.dentist_id is null
  and a.dentist_name is not null
  and p.clinic_id = a.clinic_id
  and p.full_name = a.dentist_name;
