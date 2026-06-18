-- Lista de recepcionistas por clínica (sin cuenta de auth propia).
-- Permite gestionar quién cobró cada pago cuando la clínica usa una cuenta compartida.
create table clinic_receptionists (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  name       text not null check (char_length(trim(name)) > 0),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table clinic_receptionists enable row level security;

create policy "clinic_receptionists_read"
  on clinic_receptionists for select
  using (clinic_id = (select clinic_id from profiles where id = auth.uid()));

create policy "clinic_receptionists_insert"
  on clinic_receptionists for insert
  with check (
    clinic_id = (select clinic_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) = 'admin'
  );

create policy "clinic_receptionists_update"
  on clinic_receptionists for update
  using (
    clinic_id = (select clinic_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) = 'admin'
  );

create policy "clinic_receptionists_delete"
  on clinic_receptionists for delete
  using (
    clinic_id = (select clinic_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) = 'admin'
  );

-- Cambiar FK de collected_by_id: de profiles → clinic_receptionists.
-- Los registros existentes quedan en NULL (los UUIDs de profiles ya no son válidos aquí).
alter table doctor_works drop constraint doctor_works_collected_by_id_fkey;
update doctor_works set collected_by_id = null where collected_by_id is not null;
alter table doctor_works
  add constraint doctor_works_collected_by_id_fkey
  foreign key (collected_by_id) references clinic_receptionists(id) on delete set null;

alter table payments drop constraint payments_collected_by_id_fkey;
update payments set collected_by_id = null where collected_by_id is not null;
alter table payments
  add constraint payments_collected_by_id_fkey
  foreign key (collected_by_id) references clinic_receptionists(id) on delete set null;

create index clinic_receptionists_clinic_idx on clinic_receptionists(clinic_id);
