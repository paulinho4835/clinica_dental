-- ============================================================================
-- 0009_patient_history.sql — Historial clínico del paciente (reemplaza consentimientos en la UI)
-- Una entrada = una visita/sesión: procedimientos realizados + cotización + notas.
-- El adelanto se registra como payment (history_id) y fluye al ledger existente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Encuentro clínico (visita en una fecha)
-- ----------------------------------------------------------------------------
create table patient_history (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  dentist_id  uuid references profiles(id) on delete set null,
  occurred_on date not null default current_date,
  notes       text,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index idx_history_patient on patient_history(clinic_id, patient_id, occurred_on);

-- Procedimientos realizados en esa sesión (price = cotización de la clínica por la línea)
create table patient_history_items (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics(id) on delete cascade,
  history_id   uuid not null references patient_history(id) on delete cascade,
  procedure_id uuid references procedure_catalog(id) on delete set null,
  description  text not null,
  tooth_fdi    text,
  price        numeric(12,2) not null default 0
);
create index idx_history_items_history on patient_history_items(clinic_id, history_id);

-- Vincula el adelanto/pago a la sesión (el trigger payment_to_ledger ya recalcula el saldo).
alter table payments add column history_id uuid references patient_history(id) on delete set null;
create index idx_payments_history on payments(history_id);

-- ----------------------------------------------------------------------------
-- RLS multi-inquilino (replica tenant_isolation; el bloque de 0002 ya corrió).
-- ----------------------------------------------------------------------------
alter table patient_history enable row level security;
create policy tenant_isolation on patient_history
  for all
  using (clinic_id = (select auth_clinic_id()))
  with check (clinic_id = (select auth_clinic_id()));

alter table patient_history_items enable row level security;
create policy tenant_isolation on patient_history_items
  for all
  using (clinic_id = (select auth_clinic_id()))
  with check (clinic_id = (select auth_clinic_id()));
