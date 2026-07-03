-- Memoria de conversación del agente de IA por WhatsApp (addon "agente_ia").
-- Una fila por (clínica, teléfono del paciente): guarda el historial reciente
-- del chat y el estado. status = 'active' (el bot responde) | 'paused' (derivado
-- a humano: el bot se calla y el equipo responde desde el mismo WhatsApp).
create table if not exists wa_conversations (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  phone       text not null,
  status      text not null default 'active',
  messages    jsonb not null default '[]'::jsonb,
  paused_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (clinic_id, phone)
);

create index if not exists wa_conversations_clinic_phone_idx
  on wa_conversations (clinic_id, phone);

-- Solo el service-role (el webhook del agente) toca esta tabla. RLS activa sin
-- políticas = ningún usuario logueado puede leerla; el service-role la salta.
alter table wa_conversations enable row level security;
