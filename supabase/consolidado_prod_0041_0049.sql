-- ============================================================================
-- Consolidado de migraciones 0041–0049 — aplicar en PRODUCCIÓN (Supabase nube)
-- Pega TODO en el SQL Editor del dashboard de Supabase y ejecuta.
-- Es IDEMPOTENTE: seguro de correr aunque algunas partes ya existan.
-- Atómico: si algo falla, no aplica nada (rollback).
-- ============================================================================

begin;

-- ── 0041: columna de evolución (texto libre legado del paciente) ────────────
alter table patients add column if not exists evolution text;

-- ── 0042: vincular cada pago con un ítem del plan de tratamiento ────────────
alter table payments
  add column if not exists treatment_item_id uuid
    references treatment_items(id) on delete set null;
create index if not exists idx_payments_treatment_item
  on payments(treatment_item_id) where treatment_item_id is not null;

-- ── 0043: marca de comisión pagada por trabajo del doctor ───────────────────
alter table doctor_works
  add column if not exists commission_paid boolean not null default false;
create index if not exists idx_doctor_works_unpaid_commission
  on doctor_works(clinic_id, doctor_id) where commission_paid = false;

-- ── 0044–0046: comisión proporcional al neto de laboratorio (forma final) ───
alter table doctor_works
  add column if not exists treatment_item_id uuid
    references treatment_items(id) on delete set null;
alter table doctor_works
  add column if not exists treatment_lab_cost numeric(12,2) not null default 0;
update doctor_works set treatment_lab_cost = lab_cost
  where treatment_lab_cost = 0 and lab_cost > 0;
alter table doctor_works drop column if exists commission_amount;
alter table doctor_works
  add column commission_amount numeric(12,2)
    generated always as (
      case when cost > 0
        then round(amount_paid * greatest(cost - treatment_lab_cost, 0) / cost * commission_pct / 100, 2)
        else round(amount_paid * commission_pct / 100, 2)
      end
    ) stored;

-- ── 0047: vincular doctor_work con el pago de staff que cubrió su comisión ───
alter table doctor_works
  add column if not exists staff_payment_id uuid
    references staff_payments(id) on delete set null;
create index if not exists idx_doctor_works_staff_payment_id
  on doctor_works(staff_payment_id) where staff_payment_id is not null;

-- ── 0048: notas de evolución firmadas por autor ─────────────────────────────
create table if not exists patient_evolution_notes (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  author_id   uuid references profiles(id) on delete set null,
  author_name text not null,
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists patient_evolution_notes_patient_idx
  on patient_evolution_notes (patient_id, created_at desc);
alter table patient_evolution_notes enable row level security;

drop policy if exists evolution_select on patient_evolution_notes;
create policy evolution_select on patient_evolution_notes
  for select using (clinic_id = (select auth_clinic_id()));

drop policy if exists evolution_insert on patient_evolution_notes;
create policy evolution_insert on patient_evolution_notes
  for insert with check (
    clinic_id = (select auth_clinic_id())
    and author_id = (select auth.uid())
    and (select auth_role()) in ('admin', 'odontologo_general', 'especialista')
  );

drop policy if exists evolution_update on patient_evolution_notes;
create policy evolution_update on patient_evolution_notes
  for update using (clinic_id = (select auth_clinic_id()) and author_id = (select auth.uid()))
  with check (clinic_id = (select auth_clinic_id()) and author_id = (select auth.uid()));

drop policy if exists evolution_delete on patient_evolution_notes;
create policy evolution_delete on patient_evolution_notes
  for delete using (clinic_id = (select auth_clinic_id()) and author_id = (select auth.uid()));

-- ── 0049: historial inmutable de notas (trigger guarda versión anterior) ────
create table if not exists patient_evolution_note_history (
  id                 uuid primary key default gen_random_uuid(),
  note_id            uuid not null,
  patient_id         uuid not null,
  clinic_id          uuid not null,
  author_id          uuid,
  author_name        text not null,
  body               text not null,
  version_created_at timestamptz,
  action             text not null check (action in ('edited', 'deleted')),
  changed_at         timestamptz not null default now()
);
create index if not exists evolution_note_history_patient_idx
  on patient_evolution_note_history (patient_id, changed_at desc);
alter table patient_evolution_note_history enable row level security;

drop policy if exists evolution_history_select on patient_evolution_note_history;
create policy evolution_history_select on patient_evolution_note_history
  for select using (clinic_id = (select auth_clinic_id()));

create or replace function log_evolution_note_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'UPDATE') then
    if (new.body is distinct from old.body) then
      insert into patient_evolution_note_history
        (note_id, patient_id, clinic_id, author_id, author_name, body, version_created_at, action)
      values
        (old.id, old.patient_id, old.clinic_id, old.author_id, old.author_name, old.body, old.created_at, 'edited');
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    insert into patient_evolution_note_history
      (note_id, patient_id, clinic_id, author_id, author_name, body, version_created_at, action)
    values
      (old.id, old.patient_id, old.clinic_id, old.author_id, old.author_name, old.body, old.created_at, 'deleted');
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists evolution_note_history on patient_evolution_notes;
create trigger evolution_note_history
  before update or delete on patient_evolution_notes
  for each row execute function log_evolution_note_change();

commit;
