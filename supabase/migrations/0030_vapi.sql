-- Agrega soporte para llamadas de voz via Vapi en la tabla de recordatorios.
-- El campo `channel` ya es text (default 'whatsapp'), así que 'vapi' es válido
-- sin modificar ningún enum. Solo agregamos vapi_call_id para trazabilidad.

alter table appointment_reminders
  add column if not exists vapi_call_id text;

comment on column appointment_reminders.vapi_call_id is
  'ID de llamada Vapi para trazabilidad (null en recordatorios WhatsApp).';
