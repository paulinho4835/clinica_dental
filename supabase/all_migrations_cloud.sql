-- ============================================================================
-- CLINICA DENTAL - ALL MIGRATIONS COMBINED
-- Run in Supabase SQL Editor
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────
-- 0001_schema.sql
-- ────────────────────────────────────────────────────────────────────
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


-- ────────────────────────────────────────────────────────────────────
-- 0002_rls.sql
-- ────────────────────────────────────────────────────────────────────
-- ============================================================================
-- 0002_rls.sql — Row Level Security multi-inquilino + custom JWT claims
-- Aislamiento: cada usuario solo ve filas de SU clínica. clinic_id viaja en el JWT.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Custom Access Token Hook: inyecta clinic_id y role en app_metadata del JWT.
-- Así RLS NO necesita un JOIN a profiles en cada consulta -> rápido y escalable.
-- (Registrado en config.toml -> [auth.hook.custom_access_token])
-- ----------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims   jsonb;
  v_clinic uuid;
  v_role   text;
begin
  select p.clinic_id, p.role::text
    into v_clinic, v_role
  from public.profiles p
  where p.id = (event->>'user_id')::uuid;

  claims := coalesce(event->'claims', '{}'::jsonb);
  claims := jsonb_set(claims, '{app_metadata}', coalesce(claims->'app_metadata', '{}'::jsonb));

  if v_clinic is not null then
    claims := jsonb_set(claims, '{app_metadata, clinic_id}', to_jsonb(v_clinic::text));
    claims := jsonb_set(claims, '{app_metadata, role}', to_jsonb(v_role));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant usage on schema public to supabase_auth_admin;
grant select on public.profiles to supabase_auth_admin;

-- ----------------------------------------------------------------------------
-- Helpers leídos por las políticas (envueltos en (select ...) en cada policy
-- para que el planner los evalúe UNA vez por statement, no por fila).
-- ----------------------------------------------------------------------------
create or replace function public.auth_clinic_id()
returns uuid language sql stable as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'clinic_id',
    ''
  )::uuid
$$;

create or replace function public.auth_role()
returns app_role language sql stable as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role',
    'asistente'
  )::app_role
$$;

-- ----------------------------------------------------------------------------
-- clinics: el usuario ve / edita solo su propia clínica.
-- ----------------------------------------------------------------------------
alter table clinics enable row level security;
create policy clinics_select on clinics for select
  using (id = (select auth_clinic_id()));
create policy clinics_update on clinics for update
  using (id = (select auth_clinic_id()) and (select auth_role()) = 'admin');

-- profiles: ve a los miembros de su clínica; solo admin gestiona roles.
alter table profiles enable row level security;
create policy profiles_select on profiles for select
  using (clinic_id = (select auth_clinic_id()));
create policy profiles_admin_write on profiles for all
  using (clinic_id = (select auth_clinic_id()) and (select auth_role()) = 'admin')
  with check (clinic_id = (select auth_clinic_id()) and (select auth_role()) = 'admin');

-- El custom_access_token_hook corre como supabase_auth_admin y necesita leer
-- profiles ANTES de que existan los claims (clinic_id/role aún no están en el
-- JWT). Sin esta policy, RLS devuelve 0 filas y el hook no inyecta nada.
create policy profiles_auth_admin_read on profiles for select
  to supabase_auth_admin using (true);

-- ----------------------------------------------------------------------------
-- Política de aislamiento por tenant aplicada en bloque a TODA tabla con clinic_id.
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_name = c.table_name and tb.table_schema = c.table_schema
    where c.table_schema = 'public'
      and c.column_name = 'clinic_id'
      and tb.table_type = 'BASE TABLE'
      and c.table_name <> 'clinics'
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      create policy tenant_isolation on public.%I
        for all
        using (clinic_id = (select auth_clinic_id()))
        with check (clinic_id = (select auth_clinic_id()));
    $f$, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Catálogo global de condiciones dentales: lectura para cualquier autenticado.
-- ----------------------------------------------------------------------------
alter table dental_condition_catalog enable row level security;
create policy condition_catalog_read on dental_condition_catalog for select
  to authenticated using (true);

-- ----------------------------------------------------------------------------
-- Restricciones por ROL sobre la base de aislamiento (políticas RESTRICTIVE
-- se suman con AND a la permisiva tenant_isolation).
-- ----------------------------------------------------------------------------
-- Solo admin/recepcionista borran pacientes.
create policy patients_delete_roles on patients as restrictive for delete
  using ((select auth_role()) in ('admin', 'recepcionista'));

-- Finanzas sensibles: solo admin gestiona gastos y liquida comisiones.
create policy expenses_admin on expenses as restrictive for all
  using ((select auth_role()) = 'admin')
  with check ((select auth_role()) = 'admin');

-- El log de auditoría no se modifica ni borra por la app (solo insert + select).
create policy audit_no_mutate on audit_log as restrictive for update using (false);
create policy audit_no_delete on audit_log as restrictive for delete using (false);


-- ────────────────────────────────────────────────────────────────────
-- 0003_functions_triggers.sql
-- ────────────────────────────────────────────────────────────────────
-- ============================================================================
-- 0003_functions_triggers.sql — Lógica de negocio crítica en la DB
-- (integridad financiera y de stock vive aquí, no solo en la app)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- updated_at automático
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_odontograms_updated
  before update on odontograms
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Hash de consentimiento (sin imagen): sha256(texto || paciente || fecha)
-- ----------------------------------------------------------------------------
create or replace function consent_hash(p_text text, p_patient uuid, p_at timestamptz)
returns text language sql immutable as $$
  select encode(digest(p_text || p_patient::text || p_at::text, 'sha256'), 'hex')
$$;

create or replace function fill_consent_hash()
returns trigger language plpgsql as $$
begin
  new.content_hash := consent_hash(new.content_text, new.patient_id, new.signed_at);
  return new;
end;
$$;

create trigger trg_consent_hash
  before insert on informed_consents
  for each row execute function fill_consent_hash();

-- ----------------------------------------------------------------------------
-- Comisión al marcar un tratamiento como 'done'
-- Base = price del item; % = default_commission_pct del procedimiento.
-- ----------------------------------------------------------------------------
create or replace function generate_commission_on_done()
returns trigger language plpgsql as $$
declare
  v_pct numeric(5,2);
begin
  if new.status = 'done' and (old.status is distinct from 'done') and new.dentist_id is not null then
    select default_commission_pct into v_pct
    from procedure_catalog where id = new.procedure_id;

    insert into commissions (clinic_id, dentist_id, treatment_item_id, base_amount, percentage, amount)
    values (
      new.clinic_id, new.dentist_id, new.id,
      new.price, coalesce(v_pct, 0),
      round(new.price * coalesce(v_pct, 0) / 100.0, 2)
    )
    on conflict (treatment_item_id) do nothing;

    if new.done_at is null then
      new.done_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_commission_on_done
  before update on treatment_items
  for each row execute function generate_commission_on_done();

-- ----------------------------------------------------------------------------
-- Stock: cada movimiento ajusta current_stock (y el lote si aplica)
-- in: +qty | out: -qty | adjust: qty es el delta (puede ser negativo)
-- ----------------------------------------------------------------------------
create or replace function apply_inventory_movement()
returns trigger language plpgsql as $$
declare
  v_delta numeric(12,2);
begin
  v_delta := case new.type
    when 'in'  then new.quantity
    when 'out' then -new.quantity
    else new.quantity                  -- adjust
  end;

  update inventory_items
    set current_stock = current_stock + v_delta
  where id = new.item_id;

  if new.batch_id is not null then
    update inventory_batches
      set quantity = quantity + v_delta
    where id = new.batch_id;
  end if;

  return new;
end;
$$;

create trigger trg_inventory_movement
  after insert on inventory_movements
  for each row execute function apply_inventory_movement();

-- ----------------------------------------------------------------------------
-- Estado de cuenta del paciente: balance_after acumulado
-- debit aumenta lo que debe; credit (pago / saldo a favor) lo reduce.
-- ----------------------------------------------------------------------------
create or replace function compute_ledger_balance()
returns trigger language plpgsql as $$
declare
  v_prev numeric(12,2);
begin
  select balance_after into v_prev
  from account_movements
  where patient_id = new.patient_id
  order by created_at desc, id desc
  limit 1;

  v_prev := coalesce(v_prev, 0);
  new.balance_after := v_prev + case new.kind
    when 'debit'  then new.amount
    when 'credit' then -new.amount
  end;
  return new;
end;
$$;

create trigger trg_ledger_balance
  before insert on account_movements
  for each row execute function compute_ledger_balance();

-- Un pago genera automáticamente un movimiento de crédito en la cuenta del paciente.
create or replace function payment_to_ledger()
returns trigger language plpgsql as $$
begin
  insert into account_movements (clinic_id, patient_id, kind, amount, ref_type, ref_id)
  values (new.clinic_id, new.patient_id, 'credit', new.amount, 'payment', new.id);
  return new;
end;
$$;

create trigger trg_payment_ledger
  after insert on payments
  for each row execute function payment_to_ledger();

-- Una factura emitida genera el débito (cuenta por cobrar) del paciente.
create or replace function invoice_to_ledger()
returns trigger language plpgsql as $$
begin
  if new.status = 'issued' and (old.status is distinct from 'issued') then
    insert into account_movements (clinic_id, patient_id, kind, amount, ref_type, ref_id)
    values (new.clinic_id, new.patient_id, 'debit', new.total, 'invoice', new.id);
  end if;
  return new;
end;
$$;

create trigger trg_invoice_ledger
  after update on invoices
  for each row execute function invoice_to_ledger();


-- ────────────────────────────────────────────────────────────────────
-- 0004_seed_catalog.sql
-- ────────────────────────────────────────────────────────────────────
-- ============================================================================
-- 0004_seed_catalog.sql — Datos de referencia globales (parte del esquema)
-- Catálogo de condiciones dentales que la UI usa para colorear el odontograma.
-- ============================================================================
insert into dental_condition_catalog (code, label, color, scope) values
  ('sano',                'Sano',                  '#ffffff', 'surface'),
  ('caries',              'Caries',                '#ef4444', 'surface'),
  ('resina',              'Resina / Obturación',   '#3b82f6', 'surface'),
  ('amalgama',            'Amalgama',              '#64748b', 'surface'),
  ('sellante',            'Sellante',              '#22c55e', 'surface'),
  ('fractura',            'Fractura',              '#f97316', 'surface'),
  ('corona',              'Corona',                '#eab308', 'whole'),
  ('endodoncia',          'Endodoncia',            '#a855f7', 'whole'),
  ('implante',            'Implante',              '#06b6d4', 'whole'),
  ('ausente',             'Ausente',               '#94a3b8', 'whole'),
  ('extraccion_indicada', 'Extracción indicada',   '#dc2626', 'whole'),
  ('protesis',            'Prótesis',              '#d946ef', 'whole')
on conflict (code) do nothing;


-- ────────────────────────────────────────────────────────────────────
-- 0005_cron.sql
-- ────────────────────────────────────────────────────────────────────
-- ============================================================================
-- 0005_cron.sql — Jobs programados que invocan las Edge Functions
-- Recordatorios cada 15 min; alertas de stock/caducidad cada noche.
-- Defensivo: si pg_net o las funciones de cron no están, no rompe el reset.
-- ============================================================================
do $$
declare
  v_base text := 'http://kong:8000/functions/v1';  -- URL interna en local; ajustar en prod
begin
  -- pg_net para llamadas HTTP salientes (puede no existir en todos los entornos).
  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'pg_net no disponible; cron de edge functions omitido';
    return;
  end;

  -- Recordatorios de cita: cada 15 minutos.
  perform cron.schedule(
    'send-appointment-reminders',
    '*/15 * * * *',
    format($cmd$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json')
      );
    $cmd$, v_base || '/reminders')
  );

  -- Alertas de stock/caducidad: todos los días 02:00.
  perform cron.schedule(
    'nightly-stock-alerts',
    '0 2 * * *',
    format($cmd$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json')
      );
    $cmd$, v_base || '/stock-alerts')
  );
exception when others then
  raise notice 'Programación de cron omitida: %', sqlerrm;
end $$;


-- ────────────────────────────────────────────────────────────────────
-- 0006_realtime.sql
-- ────────────────────────────────────────────────────────────────────
-- ============================================================================
-- 0006_realtime.sql — Habilita Supabase Realtime en la agenda.
-- El tablero de citas se actualiza en vivo (sin polling). RLS sigue aplicando:
-- cada usuario solo recibe cambios de las citas de SU clínica.
-- ============================================================================

-- Agrega appointments a la publicación de Realtime (idempotente).
do $$
begin
  alter publication supabase_realtime add table appointments;
exception
  when duplicate_object then null;   -- ya estaba en la publicación
  when undefined_object then null;   -- publicación no existe en este entorno
end $$;

-- REPLICA IDENTITY FULL para que los eventos UPDATE/DELETE incluyan
-- las columnas necesarias para que el cliente filtre por clinic_id.
alter table appointments replica identity full;


-- ────────────────────────────────────────────────────────────────────
-- 0007_features_superadmin.sql
-- ────────────────────────────────────────────────────────────────────
-- ============================================================================
-- 0007_features_superadmin.sql — Personalización por cliente + operador SaaS
--
--   1) clinics.features: feature flags por clínica (qué módulos ve cada una).
--      MISMO código para todos; el comportamiento se configura por datos.
--   2) platform_admins: el dueño del SaaS (tú), POR ENCIMA de las clínicas.
--      El panel /superadmin opera con service_role (bypassa RLS) para crear
--      clínicas, dar de alta su admin y togglear módulos sin tocar el
--      aislamiento multi-inquilino existente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Feature flags por clínica. Default: todos los módulos encendidos.
-- 'ajustes' es núcleo (no se apaga desde la UI) para no dejar a un admin
-- sin forma de gestionar su propia clínica.
-- ----------------------------------------------------------------------------
alter table clinics
  add column if not exists features jsonb not null default '{
    "agenda": true,
    "pacientes": true,
    "tratamientos": true,
    "caja": true,
    "inventario": true,
    "ajustes": true
  }'::jsonb;

-- ----------------------------------------------------------------------------
-- Operadores de la plataforma (superadmins del SaaS). No pertenecen a una
-- clínica: gestionan TODAS desde /superadmin.
-- ----------------------------------------------------------------------------
create table if not exists platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null default '',
  created_at timestamptz not null default now()
);

alter table platform_admins enable row level security;

-- Cada usuario puede comprobar SOLO si él mismo es superadmin (para el gate de
-- UI). La gestión real va por service_role en las server actions del panel.
create policy platform_admins_self on platform_admins for select
  using (user_id = auth.uid());


-- ────────────────────────────────────────────────────────────────────
-- 0008_patient_ci.sql
-- ────────────────────────────────────────────────────────────────────
-- ============================================================================
-- 0008_patient_ci.sql — Cédula de identidad (CI) del paciente + búsqueda
--   national_id: documento de identidad. Único por clínica (no global: dos
--   clínicas pueden atender a la misma persona de forma independiente).
-- ============================================================================

create extension if not exists unaccent;
create extension if not exists pg_trgm;

alter table patients
  add column if not exists national_id text;

-- Único por clínica, ignorando nulos (pacientes sin CI cargado aún).
create unique index if not exists uq_patients_clinic_ci
  on patients (clinic_id, national_id)
  where national_id is not null;

-- Texto de búsqueda normalizado (sin acentos, minúsculas): nombre + CI.
-- Así "maria" encuentra "María" y la búsqueda es predecible.
-- unaccent no es IMMUTABLE por defecto -> envoltura inmutable para poder
-- usarla en una columna generada.
create or replace function public.immutable_unaccent(text)
returns text language sql immutable parallel safe as $$
  select public.unaccent('public.unaccent', $1)
$$;

alter table patients
  add column if not exists search_text text
  generated always as (
    lower(public.immutable_unaccent(coalesce(full_name, '') || ' ' || coalesce(national_id, '')))
  ) stored;

create index if not exists idx_patients_search
  on patients using gin (search_text gin_trgm_ops);


-- ────────────────────────────────────────────────────────────────────
-- 0009_patient_history.sql
-- ────────────────────────────────────────────────────────────────────
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


-- ────────────────────────────────────────────────────────────────────
-- 0010_treatment_custom_procedure.sql
-- ────────────────────────────────────────────────────────────────────
-- ============================================================================
-- 0010_treatment_custom_procedure.sql
-- Permite procedimientos libres (escritos por el odontólogo) en el plan,
-- sin obligar a que existan en procedure_catalog.
-- ============================================================================

-- El item puede venir del catálogo (procedure_id) O ser texto libre (custom_name).
alter table treatment_items alter column procedure_id drop not null;
alter table treatment_items add column custom_name text;

-- Al menos uno de los dos debe existir.
alter table treatment_items
  add constraint treatment_items_procedure_or_name
  check (procedure_id is not null or custom_name is not null);


-- ────────────────────────────────────────────────────────────────────
-- 0011_appointment_dentist_text.sql
-- ────────────────────────────────────────────────────────────────────
-- ============================================================================
-- 0011_appointment_dentist_text.sql
-- El odontólogo de la cita ahora es texto libre (se escribe), no un usuario.
-- ============================================================================

alter table appointments alter column dentist_id drop not null;
alter table appointments add column dentist_name text;


-- ────────────────────────────────────────────────────────────────────
-- 0012_appointment_patient_text.sql
-- ────────────────────────────────────────────────────────────────────
-- ============================================================================
-- 0012_appointment_patient_text.sql
-- Permite agendar pacientes NO registrados (consulta rápida / emergencia):
-- patient_id pasa a ser opcional y se agrega patient_name (texto libre).
-- Una cita debe tener paciente registrado (patient_id) O nombre suelto.
-- ============================================================================

alter table appointments alter column patient_id drop not null;
alter table appointments add column patient_name text;

alter table appointments
  add constraint appointments_patient_present
  check (patient_id is not null or patient_name is not null);


-- ────────────────────────────────────────────────────────────────────
-- 0013_appointment_finance.sql
-- ────────────────────────────────────────────────────────────────────
-- ============================================================================
-- 0013_appointment_finance.sql
-- Capa financiera del agendamiento: cotización inicial + adelanto/seña.
-- Para consulta rápida (sin patient_id) el dinero NO puede ir a `payments`
-- (FK obligatoria), así que se guarda aquí de forma temporal y migra al
-- historial del paciente cuando éste asiste o se vincula a un expediente.
-- ============================================================================

alter table appointments
  add column consult_price  numeric(12,2) not null default 0, -- cotización / precio de consulta
  add column deposit        numeric(12,2) not null default 0, -- adelanto / seña dejada
  add column deposit_method payment_method,                   -- efectivo/tarjeta/transferencia
  add column finance_migrated boolean not null default false; -- ya pasó al historial


-- ────────────────────────────────────────────────────────────────────
-- 0014_payment_method_qr.sql
-- ────────────────────────────────────────────────────────────────────
-- ============================================================================
-- 0014_payment_method_qr.sql
-- La clínica solo cobra en Efectivo o QR. Se agrega 'qr' al enum.
-- 'card'/'transfer' quedan en el tipo (no se pueden borrar valores de enum en
-- Postgres) pero ya no se ofrecen en la UI ni se aceptan en validación.
-- ============================================================================

alter type payment_method add value if not exists 'qr';


-- ────────────────────────────────────────────────────────────────────
-- 0015_inventory_movement_author.sql
-- ────────────────────────────────────────────────────────────────────
-- ============================================================================
-- 0015_inventory_movement_author.sql
-- Trazabilidad: registra QUIÉN hizo cada movimiento de inventario.
-- ============================================================================

alter table inventory_movements
  add column created_by uuid references profiles(id) on delete set null;

create index idx_inv_mov_recent on inventory_movements(clinic_id, created_at desc);


-- ────────────────────────────────────────────────────────────────────
-- 0016_dashboard_analytics.sql
-- ────────────────────────────────────────────────────────────────────
-- ============================================================================
-- 0016_dashboard_analytics.sql
-- Funciones de agregación para el Dashboard de Caja y Finanzas (BI).
-- Todas son SECURITY INVOKER → respetan RLS: cada clínica ve solo lo suyo.
-- ============================================================================

-- 1) Tratamientos más realizados (volumen + ingreso) en un rango de fechas.
--    Etiqueta = nombre del catálogo o, si es libre, custom_name.
create or replace function dash_top_treatments(
  p_from timestamptz,
  p_to   timestamptz,
  p_limit int default 8
)
returns table(label text, cnt bigint, revenue numeric)
language sql
stable
security invoker
as $$
  select
    coalesce(pc.name, ti.custom_name, 'Sin nombre') as label,
    count(*)::bigint                                 as cnt,
    coalesce(sum(ti.price), 0)                       as revenue
  from treatment_items ti
  left join procedure_catalog pc on pc.id = ti.procedure_id
  where ti.status = 'done'
    and ti.done_at >= p_from
    and ti.done_at <  p_to
  group by 1
  order by cnt desc, revenue desc
  limit p_limit;
$$;

-- 2) Ingresos por día (solo pagos reales, no saldos a favor 'credit').
create or replace function dash_revenue_by_day(
  p_from timestamptz,
  p_to   timestamptz
)
returns table(day date, total numeric)
language sql
stable
security invoker
as $$
  select
    date_trunc('day', received_at)::date as day,
    coalesce(sum(amount), 0)             as total
  from payments
  where kind = 'payment'
    and received_at >= p_from
    and received_at <  p_to
  group by 1
  order by 1;
$$;

-- 3) Ingresos y pacientes únicos por mes de un año (detección de temporadas).
create or replace function dash_revenue_by_month(
  p_year int
)
returns table(month int, total numeric, patients bigint)
language sql
stable
security invoker
as $$
  select
    extract(month from received_at)::int as month,
    coalesce(sum(amount), 0)             as total,
    count(distinct patient_id)::bigint   as patients
  from payments
  where kind = 'payment'
    and extract(year from received_at) = p_year
  group by 1
  order by 1;
$$;


-- ────────────────────────────────────────────────────────────────────
-- 0017_dashboard_tz_bolivia.sql
-- ────────────────────────────────────────────────────────────────────
-- ============================================================================
-- 0017_dashboard_tz_bolivia.sql
-- Corrige las funciones de analítica para agrupar en hora local de Bolivia
-- (UTC-4 / America/La_Paz) en lugar de UTC. Sin este ajuste, un pago hecho
-- a las 21:00 BOT (01:00 UTC del día siguiente) cae en la fecha incorrecta.
-- ============================================================================

create or replace function dash_revenue_by_day(
  p_from timestamptz,
  p_to   timestamptz
)
returns table(day date, total numeric)
language sql
stable
security invoker
as $$
  select
    (received_at at time zone 'America/La_Paz')::date as day,
    coalesce(sum(amount), 0)                          as total
  from payments
  where kind = 'payment'
    and received_at >= p_from
    and received_at <  p_to
  group by 1
  order by 1;
$$;

create or replace function dash_revenue_by_month(
  p_year int
)
returns table(month int, total numeric, patients bigint)
language sql
stable
security invoker
as $$
  select
    extract(month from (received_at at time zone 'America/La_Paz'))::int as month,
    coalesce(sum(amount), 0)                                              as total,
    count(distinct patient_id)::bigint                                    as patients
  from payments
  where kind = 'payment'
    and extract(year from (received_at at time zone 'America/La_Paz')) = p_year
  group by 1
  order by 1;
$$;

create or replace function dash_top_treatments(
  p_from  timestamptz,
  p_to    timestamptz,
  p_limit int default 8
)
returns table(label text, cnt bigint, revenue numeric)
language sql
stable
security invoker
as $$
  select
    coalesce(pc.name, ti.custom_name, 'Sin nombre') as label,
    count(*)::bigint                                 as cnt,
    coalesce(sum(ti.price), 0)                       as revenue
  from treatment_items ti
  left join procedure_catalog pc on pc.id = ti.procedure_id
  where ti.status = 'done'
    and ti.done_at >= p_from
    and ti.done_at <  p_to
  group by 1
  order by cnt desc, revenue desc
  limit p_limit;
$$;



