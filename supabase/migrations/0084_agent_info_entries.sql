-- 0084_agent_info_entries.sql — Información oficial para el Agente de IA
-- Addon "agente_ia_info": la clínica cura entradas de texto (tratamientos y
-- precios, horarios, dirección, promociones, FAQ) que el agente de WhatsApp
-- inyecta en su prompt como ÚNICA fuente para responder esas preguntas.
-- El bot solo sabe lo que el admin escribió aquí: nada se filtra del catálogo
-- interno (que tiene comisiones y precios que no deben salir).

create table if not exists agent_info_entries (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  title      text not null,
  content    text not null,
  active     boolean not null default true,
  position   int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_info_entries_clinic_idx
  on agent_info_entries (clinic_id, position);

alter table agent_info_entries enable row level security;

-- Solo el admin de la clínica gestiona (y ve) esta información desde Ajustes.
-- El agente la lee con service-role (bypassa RLS), igual que el resto del bot.
drop policy if exists agent_info_entries_select on agent_info_entries;
create policy agent_info_entries_select on agent_info_entries
  for select
  using (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) = 'admin'
  );

drop policy if exists agent_info_entries_insert on agent_info_entries;
create policy agent_info_entries_insert on agent_info_entries
  for insert
  with check (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) = 'admin'
  );

drop policy if exists agent_info_entries_update on agent_info_entries;
create policy agent_info_entries_update on agent_info_entries
  for update
  using (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) = 'admin'
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) = 'admin'
  );

drop policy if exists agent_info_entries_delete on agent_info_entries;
create policy agent_info_entries_delete on agent_info_entries
  for delete
  using (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) = 'admin'
  );

notify pgrst, 'reload schema';
