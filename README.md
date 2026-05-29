# DentalSaaS — Gestión integral de clínicas dentales

SaaS multi-inquilino (Next.js + Supabase). **Sin almacenamiento de imágenes**: el
odontograma, la ficha clínica y las firmas de consentimiento viven como datos
estructurados (JSONB / SVG generado por código) en PostgreSQL.

## Stack
- **Next.js 15** (App Router, RSC/SSR) en Vercel — Fluid Compute.
- **Supabase**: Postgres + Auth + RLS + Edge Functions + pg_cron.
- Tailwind, TanStack Query, Zod, React Hook Form.

## Arquitectura multi-tenant
- Tenant = **clínica**. Toda tabla de negocio lleva `clinic_id`.
- `clinic_id` + `role` se inyectan en el **JWT** (`custom_access_token_hook`) →
  RLS filtra sin JOIN a `profiles` (rápido y escalable).
- RBAC: `admin`, `recepcionista`, `odontologo_general`, `especialista`, `asistente`.

## Restricción de imágenes — cómo se resuelve
| Necesidad clínica | Solución sin imagen |
|---|---|
| Odontograma | `odontograms.teeth` JSONB (FDI → caras/estado) → render **SVG** en cliente |
| Historial dental | `odontogram_events` (log inmutable) |
| Ficha / antecedentes | `patients.anamnesis` JSONB + `allergies` + `medical_alerts` |
| Consentimiento | `informed_consents`: texto + `content_hash` (sha256) + firma vectorial SVG |
| Reportes/presupuestos | PDF ligero generado on-demand desde datos (sin binarios pesados) |

## Setup local
```bash
npm install
supabase start          # requiere Docker
supabase db reset        # aplica migraciones + seed (2 clínicas demo)
cp .env.example .env.local   # rellena con las claves que imprime `supabase start`
npm run dev
```
Login demo: `admin@sonrisa.com` / `password123` (también `recepcion@`, `doctor@`).

## Migraciones (`supabase/migrations/`)
1. `0001_schema` — tablas, enums, índices (7 módulos).
2. `0002_rls` — JWT hook + helpers + políticas de aislamiento por clínica.
3. `0003_functions_triggers` — comisiones, stock, estado de cuenta, hash consentimiento.
4. `0004_seed_catalog` — catálogo global de condiciones dentales.
5. `0005_cron` — recordatorios (15 min) y alertas de stock (nocturno).

## Verificar aislamiento RLS
Inicia sesión como `admin@sonrisa.com` (Clínica A) → solo ves pacientes/datos de
Sonrisa. `admin@dentalnorte.com` (Clínica B) no ve nada de A. Núcleo del multi-tenant.

## Escalabilidad
- **Supabase**: Supavisor (modo transacción) para serverless; índices `(clinic_id, …)`;
  helpers RLS en `(select …)`; lógica crítica en triggers DB.
- **Vercel**: dashboard SSR/RSC + streaming; región de funciones = región Supabase;
  datos en vivo (agenda) por Supabase Realtime; ISR solo para marketing.
