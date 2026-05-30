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
