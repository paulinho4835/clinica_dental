-- 0077_appointment_source.sql — Origen de las citas
-- Deja constancia de quién creó cada cita para medir el desempeño del
-- Asistente Virtual (agente de IA por WhatsApp). 'manual' = agendada por el
-- equipo desde la agenda; 'agente' = agendada por el asistente virtual.
-- Contar por esta columna es fiable y a prueba de futuro (antes había que
-- adivinar por dentist_name o por el texto del motivo).

alter table appointments
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'agente'));

-- Backfill: marcar como 'agente' las citas que ya agendó el asistente antes de
-- existir esta columna. Sin doctor pedido quedaban a nombre de "Asistente
-- Virtual" (o "Inteligencia Artificial", nombre anterior); con doctor real el
-- rastro quedó en el motivo.
update appointments
  set source = 'agente'
  where source = 'manual'
    and (
      dentist_name in ('Asistente Virtual', 'Inteligencia Artificial')
      or reason ilike '%agendada por asistente virtual%'
    );

notify pgrst, 'reload schema';
