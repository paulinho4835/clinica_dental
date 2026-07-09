-- 0079_campaigns.sql — Campañas de WhatsApp (envío manual vía wa.me)
-- La clínica redacta un mensaje (con placeholder {nombre}) y lo envía manualmente,
-- paciente por paciente, abriendo wa.me con el chat prellenado. Esta tabla NO
-- envía nada por sí sola: solo registra qué mensaje se definió y a quién ya se
-- le envió, para que el progreso persista si el usuario cierra la página o
-- continúa la campaña otro día. Independiente de Baileys/wa_masivo.

create table if not exists campaigns (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  name       text not null,
  message    text not null, -- puede contener el placeholder literal "{nombre}"
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists campaigns_clinic_idx on campaigns (clinic_id);

create table if not exists campaign_sends (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  sent_by     uuid references profiles(id) on delete set null,
  sent_at     timestamptz not null default now(),
  unique (campaign_id, patient_id)
);

create index if not exists campaign_sends_campaign_idx on campaign_sends (campaign_id);

alter table campaigns enable row level security;
alter table campaign_sends enable row level security;

-- campaigns: admin, recepcionista y colega (mismos roles que ven wa_masivo)
-- pueden leer, crear y borrar campañas de su propia clínica.
drop policy if exists campaigns_select on campaigns;
create policy campaigns_select on campaigns
  for select
  using (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) in ('admin', 'recepcionista', 'colega')
  );

drop policy if exists campaigns_insert on campaigns;
create policy campaigns_insert on campaigns
  for insert
  with check (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) in ('admin', 'recepcionista', 'colega')
  );

drop policy if exists campaigns_delete on campaigns;
create policy campaigns_delete on campaigns
  for delete
  using (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) in ('admin', 'recepcionista', 'colega')
  );

-- campaign_sends: no tiene clinic_id propio; se valida vía join a campaigns.
drop policy if exists campaign_sends_select on campaign_sends;
create policy campaign_sends_select on campaign_sends
  for select
  using (
    exists (
      select 1 from campaigns c
      where c.id = campaign_sends.campaign_id
        and c.clinic_id = (select auth_clinic_id())
    )
    and (select auth_role()) in ('admin', 'recepcionista', 'colega')
  );

drop policy if exists campaign_sends_insert on campaign_sends;
create policy campaign_sends_insert on campaign_sends
  for insert
  with check (
    exists (
      select 1 from campaigns c
      where c.id = campaign_sends.campaign_id
        and c.clinic_id = (select auth_clinic_id())
    )
    and (select auth_role()) in ('admin', 'recepcionista', 'colega')
  );

drop policy if exists campaign_sends_delete on campaign_sends;
create policy campaign_sends_delete on campaign_sends
  for delete
  using (
    exists (
      select 1 from campaigns c
      where c.id = campaign_sends.campaign_id
        and c.clinic_id = (select auth_clinic_id())
    )
    and (select auth_role()) in ('admin', 'recepcionista', 'colega')
  );

notify pgrst, 'reload schema';
