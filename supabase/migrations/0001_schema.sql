-- ============================================================================
-- 0001_schema.sql — Esquema base multi-inquilino (tenant = clínica)
-- Patrón: schema compartido + columna clinic_id en toda tabla de negocio.
-- RESTRICCIÓN: cero imágenes. Odontograma/ficha/firmas = datos estructurados.
-- ============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid, digest (hash)
create extension if not exists "pg_cron";     -- jobs programados (recordatorios, alertas)

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
create type app_role as enum (
  'admin', 'recepcionista', 'odontologo_general', 'especialista', 'asistente'
);
create type appt_status as enum (
  'scheduled', 'confirmed', 'waiting', 'in_chair', 'finished', 'cancelled', 'no_show'
);
create type treatment_item_status as enum (
  'proposed', 'approved', 'in_progress', 'done', 'cancelled'
);
create type plan_status as enum ('draft', 'active', 'completed', 'cancelled');
create type invoice_status as enum ('draft', 'issued', 'paid', 'void');
create type payment_method as enum ('cash', 'card', 'transfer');
create type payment_kind as enum ('payment', 'credit');        -- credit = saldo a favor
create type ledger_kind as enum ('debit', 'credit');           -- debe / haber del paciente
create type commission_status as enum ('pending', 'paid');
create type inventory_move_type as enum ('in', 'out', 'adjust');
create type condition_scope as enum ('surface', 'whole');

-- ----------------------------------------------------------------------------
-- TENANT + IDENTIDAD
-- ----------------------------------------------------------------------------
create table clinics (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  timezone    text not null default 'America/Mexico_City',
  plan        text not null default 'starter',
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Perfil 1:1 con auth.users. Lleva clinic_id + rol (se inyectan al JWT vía hook).
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  clinic_id   uuid not null references clinics(id) on delete cascade,
  role        app_role not null default 'asistente',
  full_name   text not null default '',
  created_at  timestamptz not null default now()
);
create index idx_profiles_clinic on profiles(clinic_id);

-- ----------------------------------------------------------------------------
-- MÓDULO 1 — PACIENTES (CRM clínico)
-- ----------------------------------------------------------------------------
create table patients (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics(id) on delete cascade,
  full_name      text not null,
  dob            date,
  sex            text,
  phone          text,
  email          text,
  address        text,
  anamnesis      jsonb not null default '{}'::jsonb,   -- antecedentes médicos estructurados
  allergies      text[] not null default '{}',
  medical_alerts text[] not null default '{}',         -- banderas críticas (UI en rojo)
  notes          text,
  created_at     timestamptz not null default now()
);
create index idx_patients_clinic_name on patients(clinic_id, full_name);

-- Consentimiento informado SIN imagen: texto + hash + firma vectorial opcional (SVG path).
create table informed_consents (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics(id) on delete cascade,
  patient_id      uuid not null references patients(id) on delete cascade,
  template_code   text not null,
  content_text    text not null,
  content_hash    text not null,            -- sha256(content_text || patient_id || signed_at)
  signed_by_name  text not null,
  signature_svg   jsonb,                    -- trazo vectorial (path data), NUNCA raster
  signed_at       timestamptz not null default now()
);
create index idx_consents_patient on informed_consents(clinic_id, patient_id);

-- ----------------------------------------------------------------------------
-- MÓDULO 2 — AGENDA Y CITAS
-- ----------------------------------------------------------------------------
create table operatories (   -- sillones / box
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  name       text not null
);

create table dentist_schedules (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  dentist_id uuid not null references profiles(id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time   time not null
);

create table appointments (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics(id) on delete cascade,
  patient_id   uuid not null references patients(id) on delete restrict,
  dentist_id   uuid not null references profiles(id) on delete restrict,
  operatory_id uuid references operatories(id) on delete set null,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  status       appt_status not null default 'scheduled',
  reason       text,
  overbooked   boolean not null default false,   -- sobre-cupo permitido explícito
  created_at   timestamptz not null default now()
);
create index idx_appts_clinic_time on appointments(clinic_id, starts_at);
create index idx_appts_dentist_time on appointments(clinic_id, dentist_id, starts_at);

create table appointment_reminders (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics(id) on delete cascade,
  appointment_id uuid not null references appointments(id) on delete cascade,
  channel        text not null default 'whatsapp',
  scheduled_for  timestamptz not null,
  status         text not null default 'pending',   -- pending|sent|failed
  sent_at        timestamptz
);
create index idx_reminders_due on appointment_reminders(status, scheduled_for);

-- ----------------------------------------------------------------------------
-- MÓDULO 3 — ODONTOGRAMA DIGITAL ESTRUCTURADO (sin imágenes)
-- ----------------------------------------------------------------------------
-- Catálogo de estados que la UI usa para colorear el SVG.
create table dental_condition_catalog (
  code       text primary key,        -- 'caries','resina','corona','endodoncia','ausente',...
  label      text not null,
  color      text not null,           -- hex para render SVG
  scope      condition_scope not null -- aplica a 'surface' o a diente 'whole'
);

-- Estado actual del odontograma: 1 fila por paciente. teeth = mapa FDI -> estado.
create table odontograms (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade unique,
  teeth       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Log inmutable de cambios -> auditoría e historial reproducible.
create table odontogram_events (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  tooth_fdi   text not null,           -- '11'..'48', temporales '51'..'85'
  surface     text,                    -- 'O','M','D','V','L' o null (diente completo)
  prev_state  text,
  new_state   text,
  actor_id    uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index idx_odo_events_patient on odontogram_events(clinic_id, patient_id, created_at);

-- ----------------------------------------------------------------------------
-- MÓDULO 4 — PLANES DE TRATAMIENTO Y PRESUPUESTOS
-- ----------------------------------------------------------------------------
create table procedure_catalog (
  id                     uuid primary key default gen_random_uuid(),
  clinic_id              uuid not null references clinics(id) on delete cascade,
  code                   text not null,
  name                   text not null,
  base_price             numeric(12,2) not null default 0,
  default_commission_pct numeric(5,2) not null default 0,
  specialty              text,
  active                 boolean not null default true,
  unique (clinic_id, code)
);

create table treatment_plans (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  status      plan_status not null default 'draft',
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index idx_plans_patient on treatment_plans(clinic_id, patient_id);

create table treatment_phases (
  id        uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  plan_id   uuid not null references treatment_plans(id) on delete cascade,
  phase_no  int not null,
  title     text not null,
  status    plan_status not null default 'draft'
);

create table treatment_items (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics(id) on delete cascade,
  phase_id     uuid not null references treatment_phases(id) on delete cascade,
  procedure_id uuid not null references procedure_catalog(id) on delete restrict,
  tooth_fdi    text,
  surfaces     text[] not null default '{}',
  price        numeric(12,2) not null default 0,
  dentist_id   uuid references profiles(id) on delete set null,
  status       treatment_item_status not null default 'proposed',
  done_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index idx_titems_phase on treatment_items(clinic_id, phase_id);

-- Snapshot inmutable del presupuesto aprobado.
create table budgets (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  plan_id     uuid not null references treatment_plans(id) on delete cascade,
  version     int not null default 1,
  total       numeric(12,2) not null default 0,
  approved_by uuid references profiles(id) on delete set null,
  approved_at timestamptz not null default now(),
  unique (plan_id, version)
);

-- ----------------------------------------------------------------------------
-- MÓDULO 5 — FACTURACIÓN, CAJA Y FINANZAS
-- ----------------------------------------------------------------------------
create table cash_sessions (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  opened_by     uuid references profiles(id) on delete set null,
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  opening_float numeric(12,2) not null default 0,
  closing_total numeric(12,2)
);

create table invoices (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete restrict,
  total       numeric(12,2) not null default 0,
  status      invoice_status not null default 'draft',
  issued_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index idx_invoices_patient on invoices(clinic_id, patient_id);

create table invoice_items (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinics(id) on delete cascade,
  invoice_id        uuid not null references invoices(id) on delete cascade,
  description       text not null,
  qty               numeric(12,2) not null default 1,
  unit_price        numeric(12,2) not null default 0,
  treatment_item_id uuid references treatment_items(id) on delete set null
);

create table payments (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics(id) on delete cascade,
  patient_id      uuid not null references patients(id) on delete restrict,
  invoice_id      uuid references invoices(id) on delete set null,
  amount          numeric(12,2) not null,
  method          payment_method not null,
  kind            payment_kind not null default 'payment',
  cash_session_id uuid references cash_sessions(id) on delete set null,
  received_at     timestamptz not null default now()
);
create index idx_payments_patient on payments(clinic_id, patient_id, received_at);

-- Estado de cuenta del paciente: cuentas por cobrar + saldos a favor.
create table account_movements (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  patient_id    uuid not null references patients(id) on delete cascade,
  kind          ledger_kind not null,         -- debit aumenta deuda, credit la reduce
  amount        numeric(12,2) not null,
  ref_type      text,
  ref_id        uuid,
  balance_after numeric(12,2),
  created_at    timestamptz not null default now()
);
create index idx_ledger_patient on account_movements(clinic_id, patient_id, created_at);

create table expenses (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  category   text not null,
  amount     numeric(12,2) not null,
  vendor     text,
  notes      text,
  spent_at   date not null default current_date
);
create index idx_expenses_clinic on expenses(clinic_id, spent_at);

-- Liquidación de comisiones por tratamiento realizado.
create table commissions (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinics(id) on delete cascade,
  dentist_id        uuid not null references profiles(id) on delete restrict,
  treatment_item_id uuid not null references treatment_items(id) on delete cascade,
  base_amount       numeric(12,2) not null,
  percentage        numeric(5,2) not null,
  amount            numeric(12,2) not null,
  status            commission_status not null default 'pending',
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  unique (treatment_item_id)
);
create index idx_commissions_dentist on commissions(clinic_id, dentist_id, status);

-- ----------------------------------------------------------------------------
-- MÓDULO 6 — INVENTARIO Y SUMINISTROS
-- ----------------------------------------------------------------------------
create table inventory_items (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  name          text not null,
  category      text,
  unit          text not null default 'unidad',
  min_stock     numeric(12,2) not null default 0,
  current_stock numeric(12,2) not null default 0
);
create index idx_inv_low_stock on inventory_items(clinic_id) where current_stock <= min_stock;

create table inventory_batches (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  item_id     uuid not null references inventory_items(id) on delete cascade,
  lot         text,
  expiry_date date,
  quantity    numeric(12,2) not null default 0
);
create index idx_batches_expiry on inventory_batches(clinic_id, expiry_date);

create table inventory_movements (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinics(id) on delete cascade,
  item_id           uuid not null references inventory_items(id) on delete cascade,
  batch_id          uuid references inventory_batches(id) on delete set null,
  type              inventory_move_type not null,
  quantity          numeric(12,2) not null,
  reason            text,
  ref_treatment_item_id uuid references treatment_items(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- MÓDULO 7 — AUDITORÍA (gancho de cumplimiento HIPAA/GDPR futuro)
-- ----------------------------------------------------------------------------
create table audit_log (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  actor_id   uuid references profiles(id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  diff       jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_clinic on audit_log(clinic_id, created_at);
