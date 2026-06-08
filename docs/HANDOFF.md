# Handoff — estado del proyecto para la próxima sesión

> Última actualización: 2026-06-07. Rama: `main`. Último commit relevante: `3e1d094`.

## Resumen rápido
SaaS multi-tenant de clínica dental (Next.js 15 App Router + Supabase). Aislamiento
por clínica vía RLS + `clinic_id` inyectado al JWT. Panel `/superadmin` para el
operador de la plataforma (dueño del SaaS).

---

## ⚠️ PENDIENTE CRÍTICO — correr antes de probar el superadmin
La última feature agregó la columna `clinics.active`, pero **la migración aún NO se
ha aplicado en la base de datos**. Sin esto, `/superadmin` da error al consultar `active`.

Correr en el SQL Editor de Supabase (en la base que use la app):
```sql
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
```
Migración versionada: `supabase/migrations/0021_clinic_active.sql`.

---

## ⚠️ Confusión de entornos (local vs cloud) — causa de los problemas de login
`.env.local` apunta a **Supabase LOCAL** (`NEXT_PUBLIC_SUPABASE_URL=https://127.0.0.1:54321`),
pero todo el SQL (crear usuarios, `platform_admins`, etc.) se estuvo ejecutando en el
**Supabase CLOUD** (el dashboard). Son **dos bases de datos distintas** → por eso
`localhost:3000` daba "Invalid login credentials": el usuario no existe en la base local.

**Decisión pendiente del usuario** (no resuelta aún):
- **Opción A:** probar en la app desplegada en Vercel (`clinica-dental-one-vert…`), que usa el Cloud.
- **Opción B:** apuntar `.env.local` al proyecto Cloud (necesita Project URL + anon key del Cloud).

Si se elige B, también aplicar ahí la migración `0021` y el bootstrap de platform_admin.

---

## Bootstrap del operador de plataforma (platform_admin)
Para que aparezca el botón **Superadmin** en el sidebar, el usuario debe estar en la
tabla `platform_admins` **en la base que use la app**, y luego cerrar sesión y volver a entrar.

Usuario de prueba creado en CLOUD: `leoncito@gmail.com` / pass `123`
(UID `1c762361-9814-42cd-93cb-a6cda96003a9`), email auto-confirmado.

```sql
-- registrar como admin de plataforma
INSERT INTO platform_admins (user_id, full_name)
SELECT id, 'Paulo' FROM auth.users WHERE email = 'leoncito@gmail.com'
ON CONFLICT DO NOTHING;
```

Notas aprendidas sobre Supabase:
- Crear usuarios desde **Authentication → Users → Add user** con **"Auto Confirm User"** ✅
  es lo más confiable (evita líos con email links expirados / passwords).
- `crypt()`/`gen_salt()` viven en el schema `extensions`, no `public`. Si se setea el
  password por SQL hay que usar `extensions.crypt(...)`, si no falla silenciosamente.
- Hay un usuario `b2be4ddd-330f-4ce4-8245-487972ba3b15` (paulinho4835@gmail.com) que
  quedó con login roto por intentos previos de setear password por SQL. Ignorar / borrar.

---

## Estado del panel /superadmin (COMPLETO y commiteado)
Ubicación: `app/(dashboard)/superadmin/`

Funcionalidad implementada:
- Crear clínica + su admin (`NewClinicForm`)
- Renombrar clínica inline (`EditClinicName`)
- Cambiar plan (`PlanSelect`: starter/pro/premium)
- Toggles de módulos/features por clínica (`FeatureToggle`)
- Gestión de usuarios por clínica: listar, cambiar rol, eliminar (`ClinicUsers`)
- Añadir usuario a clínica (`AddUserForm`)
- **Eliminar** clínica permanentemente + sus usuarios (`DeleteClinicButton`)
- **Dar de baja / reactivar** clínica (reversible) (`SuspendClinicButton`) ← nuevo
- **Filtro de orden**: más recientes / más antiguas / nombre (inline en `page.tsx`) ← nuevo

Server actions en `app/(dashboard)/superadmin/actions.ts`:
`createClinic`, `addClinicUser`, `updateUserRole`, `removeClinicUser`,
`updateClinicName`, `setClinicActive` (nuevo), `deleteClinic`, `toggleFeature`, `setPlan`.
Todas llaman `assertSuperadmin()` y usan `createAdminClient()` (service_role, bypassa RLS).

Bloqueo de clínica suspendida: `app/(dashboard)/layout.tsx` — si `!superadmin` y
`clinic.active === false`, muestra pantalla "Cuenta suspendida" en lugar del dashboard.

---

## Arquitectura clave (referencia)
- **RLS multi-tenant:** cada tabla de negocio tiene `clinic_id`; policy `tenant_isolation`
  aplicada dinámicamente. Helper SQL `auth_clinic_id()` lee el JWT.
- **JWT hook:** `public.custom_access_token_hook` inyecta `clinic_id` y `role` en
  `app_metadata` al login (maneja bien usuarios sin clínica como el superadmin).
- **`isPlatformAdmin()`** (`lib/superadmin.ts`): React `cache()`, consulta `platform_admins`.
- **Feature flags:** columna `clinics.features` (jsonb) + `lib/features.ts` (FEATURES array).
- **Middleware:** `/superadmin` y módulos protegidos en `lib/supabase/middleware.ts`.
- **Timezone:** Bolivia (`America/La_Paz`), utilidades en `@/lib/agenda` / dashboard.

## Verificación
`npx tsc --noEmit` pasa con 0 errores. Suite de tests: 68 tests (estado de sesiones previas).

---

## 🔜 PRÓXIMO TEMA (pendiente para mañana): multi-sucursal (central + sucursal)
El usuario preguntó cómo manejar un cliente con **2 locales** (central + sucursal).
Se analizaron 3 opciones. **Decisión: pendiente** (se retoma mañana).

**Modelo actual:** `clinic` = tenant = un solo local. Un usuario pertenece a UNA
clínica (`profiles.clinic_id`); el JWT inyecta ese `clinic_id`; RLS aísla todo por él.
"Clínica" hoy significa a la vez *el cliente* y *el local físico*.

**Pregunta que define todo:** ¿las 2 sucursales comparten pacientes/personal/reportes,
o son negocios independientes?

- **Opción A — cada sucursal = clínica separada (tenant aparte).** Cero código; solo
  crear 2 clínicas en el superadmin. Contra: datos totalmente siloed, sin pacientes
  compartidos ni reportes consolidados, recepcionista necesita 2 cuentas. Sirve si los
  locales operan independientes.

- **Opción C — una clínica (el negocio) con varias sucursales adentro. ⭐ RECOMENDADA**
  El tenant sigue siendo el negocio. Agregar tabla `branches` (con `clinic_id`) + columna
  `branch_id` en agenda/caja/inventario + selector de sucursal en la UI. Pacientes y
  personal compartidos; reportes por sucursal y consolidados. **El RLS NO cambia** (sigue
  por `clinic_id`); la sucursal es solo una dimensión interna. Esfuerzo medio.
  → Es la correcta para "central + sucursal del mismo dueño".

- **Opción B — capa de organización (org → locations).** Refactor grande: cambia
  jerarquía, JWT, RLS y media UI. Sobreingeniería hoy; solo para cadenas grandes con
  facturación separada por local.

**Recomendación a implementar (si el usuario confirma Opción C):**
1. Migración: tabla `branches (id, clinic_id, name, address, active, created_at)`.
2. Agregar `branch_id` (nullable al inicio) a `appointments`, pagos/caja, movimientos de
   inventario. Migrar datos existentes a una sucursal "Principal" por clínica.
3. Selector de sucursal en el dashboard (filtro de agenda/caja/inventario).
4. Reportes: total consolidado + desglose por sucursal.
5. RLS sin cambios. Opcional: asignar usuarios a una sucursal o "todas".
