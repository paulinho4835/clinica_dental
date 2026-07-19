# Modo "Consultorio compartido entre colegas" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que varios odontólogos compartan una clínica como pares con confidencialidad financiera mutua: pacientes y agenda comunes, pero cobros, gastos, producción y comisiones visibles solo para su dueño.

**Architecture:** Un flag `clinics.shared_practice` activa el modo. Los socios usan el rol `colega` existente, que en modo compartido gana permisos de administración común (ajustes, usuarios, catálogo) vía `rbac.ts`, mientras la RLS (helper `auth_shared_practice()`) restringe las tablas financieras a filas propias. Nadie puede tener rol `admin` en una clínica compartida.

**Tech Stack:** Next.js App Router (server actions), Supabase (Postgres + RLS), TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-19-consultorio-compartido-colegas-design.md`

## Global Constraints

- Español neutro en toda la UI (sin voseo: "haz" no "hacé").
- **NUNCA hacer push sin autorización explícita del usuario** (commits locales sí).
- Las clínicas con `shared_practice = false` NO deben cambiar de comportamiento en absoluto (toda policy nueva lleva la cláusula de escape `not auth_shared_practice()`).
- `payments.doctor_id` YA EXISTE (FK a profiles desde la migración 0025) — no crear esa columna.
- La numeración de migraciones va por 0090 → la nueva es `0091`.
- Los tests corren con `npm test` (vitest); typecheck con `npx tsc --noEmit`.

## Datos del código existente que necesitas saber

- `lib/rbac.ts` — `Role`, `can()`, `canSeeNav()`, `NAV_WHITELIST`, `MATRIX`. El rol `colega` ya es own-only en `doctor_works` (migración 0057).
- `lib/auth.ts` — `getProfile()` cacheado devuelve `{ userId, clinicId, role, fullName }`.
- `lib/guard.ts` — `requireNavAccess(key)` gatea páginas por feature + rol.
- `app/(dashboard)/layout.tsx` — construye el menú con `canSeeNav(role, f.key)` (línea ~111) y gatea Términos solo para `role === "admin"` (línea ~87).
- RLS: `auth_role()` y `auth_clinic_id()` leen claims del JWT (0002). `payments` NO tiene policy restrictiva por rol (solo aislamiento por tenant); `expenses` tiene `expenses_admin` restrictiva solo-admin (0002:129); `staff_payments` tiene `staff_payments_admin_all` permisiva solo-admin (0033) y columnas `employee_id`/`receptionist_id` (0072), SIN columna de quién pagó; `clinics_update` es solo-admin (0002:69).
- Inserts de `payments` en: `app/(dashboard)/caja/actions.ts:35`, `app/(dashboard)/pacientes/history-actions.ts:58`, `app/(dashboard)/mis-trabajos/actions.ts:138` (ya pone `doctor_id` correcto), `app/(dashboard)/agenda/actions.ts:508` (sin doctor_id).
- `app/(dashboard)/ajustes/actions.ts` — `assertClinicAdmin()` (línea 86) exige rol admin; `TEAM_ROLES` (línea 77) ya excluye `admin`.
- `app/(dashboard)/superadmin/actions.ts` — `createClinic` (línea 24) crea clínica + invita admin; `addClinicUser` (línea 74) permite rol admin.
- `components/superadmin/NewClinicForm.tsx` — formulario de alta de clínica con checkbox `whatsapp_addon` como modelo a imitar.

---

### Task 1: Migración SQL 0091 — flag, helper y RLS

**Files:**
- Create: `supabase/migrations/0091_shared_practice.sql`

**Interfaces:**
- Produces: columna `clinics.shared_practice boolean`, función SQL `auth_shared_practice() returns boolean`, columna `expenses.doctor_id uuid`, columna `staff_payments.paid_by uuid`, policies nuevas. Las tareas 3–6 dependen de estas columnas.

- [ ] **Step 1: Escribir la migración**

```sql
-- Modo "consultorio compartido entre colegas": varios doctores comparten
-- pacientes y agenda como pares, pero NADIE ve las finanzas del otro.
-- Spec: docs/superpowers/specs/2026-07-19-consultorio-compartido-colegas-design.md
-- Con shared_practice = false (default) TODO el comportamiento actual se
-- conserva idéntico: cada policy nueva tiene el escape "not auth_shared_practice()".

alter table clinics
  add column if not exists shared_practice boolean not null default false;

-- Helper para las policies. SECURITY DEFINER: se usa dentro de policies de la
-- propia tabla clinics (evita recursión de RLS al leerla).
create or replace function public.auth_shared_practice()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select shared_practice from clinics where id = auth_clinic_id()),
    false
  )
$$;

-- Gastos por doctor: en modo compartido cada colega registra y ve solo los suyos.
-- null = gasto general de la clínica (visible para todos; solo admin lo crea).
alter table expenses
  add column if not exists doctor_id uuid references profiles(id) on delete set null;
create index if not exists idx_expenses_doctor on expenses(clinic_id, doctor_id);

-- Quién registró el pago al personal: en modo compartido cada colega ve solo
-- los pagos de personal que él mismo hizo.
alter table staff_payments
  add column if not exists paid_by uuid references profiles(id) on delete set null;

-- ── payments: confidencialidad por doctor en modo compartido ────────────────
-- Filas con doctor_id null son "históricas/comunes": visibles para todos
-- (ya eran visibles antes de activar el modo; no se filtra nada nuevo).
create policy payments_shared_select on payments as restrictive for select
  using (
    (select auth_role()) in ('admin', 'recepcionista')
    or not (select auth_shared_practice())
    or doctor_id is null
    or doctor_id = (select auth.uid())
  );

create policy payments_shared_insert on payments as restrictive for insert
  with check (
    (select auth_role()) in ('admin', 'recepcionista')
    or not (select auth_shared_practice())
    or doctor_id is null
    or doctor_id = (select auth.uid())
  );

create policy payments_shared_update on payments as restrictive for update
  using (
    (select auth_role()) in ('admin', 'recepcionista')
    or not (select auth_shared_practice())
    or doctor_id is null
    or doctor_id = (select auth.uid())
  )
  with check (
    (select auth_role()) in ('admin', 'recepcionista')
    or not (select auth_shared_practice())
    or doctor_id is null
    or doctor_id = (select auth.uid())
  );

create policy payments_shared_delete on payments as restrictive for delete
  using (
    (select auth_role()) in ('admin', 'recepcionista')
    or not (select auth_shared_practice())
    or doctor_id is null
    or doctor_id = (select auth.uid())
  );

-- ── expenses: en modo compartido el colega gestiona SOLO sus gastos ─────────
-- (antes: restrictiva solo-admin, definida en 0002)
drop policy if exists expenses_admin on expenses;
create policy expenses_admin on expenses as restrictive for all
  using (
    (select auth_role()) = 'admin'
    or (
      (select auth_shared_practice())
      and (select auth_role()) = 'colega'
      and (doctor_id is null or doctor_id = (select auth.uid()))
    )
  )
  with check (
    (select auth_role()) = 'admin'
    or (
      (select auth_shared_practice())
      and (select auth_role()) = 'colega'
      and doctor_id = (select auth.uid())
    )
  );

-- ── staff_payments: el colega gestiona los pagos de personal que él hizo ────
-- (permisiva, se suma con OR a staff_payments_admin_all de 0033)
create policy staff_payments_colega_own on staff_payments
  for all to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select auth_shared_practice())
    and (select auth_role()) = 'colega'
    and paid_by = (select auth.uid())
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select auth_shared_practice())
    and (select auth_role()) = 'colega'
    and paid_by = (select auth.uid())
  );

-- ── clinics: en modo compartido el colega también edita los ajustes ─────────
drop policy if exists clinics_update on clinics;
create policy clinics_update on clinics for update
  using (
    id = (select auth_clinic_id())
    and (
      (select auth_role()) = 'admin'
      or ((select auth_shared_practice()) and (select auth_role()) = 'colega')
    )
  );

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Aplicar la migración en local**

Run: `npx supabase migration up`
Expected: `Applying migration 0091_shared_practice.sql...` sin errores. (Si el stack local no está corriendo: `npx supabase start` primero.)

- [ ] **Step 3: Verificar columnas y función**

Run: `npx supabase db psql -c "select auth_shared_practice(); select column_name from information_schema.columns where table_name in ('clinics','expenses','staff_payments') and column_name in ('shared_practice','doctor_id','paid_by');"`

(Si `db psql` no existe en esta versión del CLI, usar `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "..."`.)
Expected: `f` (false, sin JWT) y las 3 columnas listadas.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0091_shared_practice.sql
git commit -m "feat(db): modo consultorio compartido - flag, helper RLS y policies financieras"
```

---

### Task 2: `rbac.ts` — permisos conscientes del modo compartido (TDD)

**Files:**
- Modify: `lib/rbac.ts`
- Test: `tests/rbac.test.ts` (extender el archivo existente)

**Interfaces:**
- Consumes: nada nuevo.
- Produces (las tareas 3–5 dependen de estas firmas exactas):
  - `canSeeNav(role: Role | undefined, key: FeatureKey, opts?: { sharedPractice?: boolean }): boolean`
  - `can(role: Role | undefined, perm: Permission, opts?: { sharedPractice?: boolean }): boolean`
  - `financialDoctorId(profile: { role: Role; sharedPractice: boolean; userId: string }, requested?: string | null): string | null`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `tests/rbac.test.ts` (respetar los imports existentes del archivo; si no importa `can`/`canSeeNav`/`financialDoctorId`, agregarlos al import de `@/lib/rbac`):

```typescript
describe("modo consultorio compartido (shared practice)", () => {
  const shared = { sharedPractice: true };

  it("colega gana módulos de administración común en modo compartido", () => {
    for (const key of ["caja", "cuentas", "pagos", "tratamientos", "ajustes"] as const) {
      expect(canSeeNav("colega", key)).toBe(false);
      expect(canSeeNav("colega", key, shared)).toBe(true);
    }
  });

  it("colega NO gana inventario ni en modo compartido", () => {
    expect(canSeeNav("colega", "inventario", shared)).toBe(false);
  });

  it("otros roles no cambian con el flag", () => {
    expect(canSeeNav("recepcionista", "ajustes", shared)).toBe(false);
    expect(canSeeNav("asistente", "caja", shared)).toBe(false);
    expect(canSeeNav("admin", "ajustes", shared)).toBe(true);
  });

  it("colega gana expenses:write y settings:write solo en modo compartido", () => {
    expect(can("colega", "expenses:write")).toBe(false);
    expect(can("colega", "settings:write")).toBe(false);
    expect(can("colega", "expenses:write", shared)).toBe(true);
    expect(can("colega", "settings:write", shared)).toBe(true);
  });

  it("financialDoctorId fuerza al propio colega en modo compartido", () => {
    const colega = { role: "colega" as const, sharedPractice: true, userId: "u1" };
    expect(financialDoctorId(colega, "otro-doctor")).toBe("u1");
    expect(financialDoctorId(colega, null)).toBe("u1");
    expect(financialDoctorId(colega)).toBe("u1");
  });

  it("financialDoctorId respeta lo pedido fuera del modo compartido", () => {
    const admin = { role: "admin" as const, sharedPractice: false, userId: "u2" };
    expect(financialDoctorId(admin, "doc-9")).toBe("doc-9");
    expect(financialDoctorId(admin)).toBe(null);
    const colegaNormal = { role: "colega" as const, sharedPractice: false, userId: "u3" };
    expect(financialDoctorId(colegaNormal, "doc-9")).toBe("doc-9");
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -- tests/rbac.test.ts`
Expected: FAIL — `financialDoctorId is not a function` (o no exportada) y asserts de `canSeeNav(..., shared)` en `false`.

- [ ] **Step 3: Implementar en `lib/rbac.ts`**

Agregar después de `NAV_WHITELIST` y `MATRIX` (dejando ambos intactos):

```typescript
// ── Modo "consultorio compartido entre colegas" ──────────────────────────────
// Con clinics.shared_practice activo, los colegas son PARES: administran lo
// común (ajustes, usuarios, catálogo) pero la RLS les muestra solo SUS finanzas.
// Espejo de la migración 0091 — la DB sigue siendo la fuente de verdad.

const SHARED_COLEGA_NAV_EXTRA: FeatureKey[] = [
  "caja", "cuentas", "pagos", "tratamientos", "ajustes",
];

const SHARED_COLEGA_PERMS_EXTRA: Permission[] = [
  "expenses:write", "settings:write",
];

export type SharedOpts = { sharedPractice?: boolean };

// En modo compartido, todo dato financiero que un colega crea es SUYO:
// se ignora el doctor pedido y se fuerza su propio id.
export function financialDoctorId(
  profile: { role: Role; sharedPractice: boolean; userId: string },
  requested?: string | null,
): string | null {
  if (profile.sharedPractice && profile.role === "colega") return profile.userId;
  return requested ?? null;
}
```

Y modificar las dos funciones existentes:

```typescript
export function canSeeNav(
  role: Role | undefined,
  key: FeatureKey,
  opts?: SharedOpts,
): boolean {
  if (!role) return false;
  if (NAV_WHITELIST[role]?.includes(key)) return true;
  return !!opts?.sharedPractice && role === "colega"
    && SHARED_COLEGA_NAV_EXTRA.includes(key);
}

export function can(
  role: Role | undefined,
  perm: Permission,
  opts?: SharedOpts,
): boolean {
  if (!role) return false;
  if (MATRIX[role]?.includes(perm)) return true;
  return !!opts?.sharedPractice && role === "colega"
    && SHARED_COLEGA_PERMS_EXTRA.includes(perm);
}
```

- [ ] **Step 4: Verificar que pasan (y que no rompió nada)**

Run: `npm test -- tests/rbac.test.ts`
Expected: PASS completo (los tests viejos del archivo siguen verdes: el tercer parámetro es opcional).

- [ ] **Step 5: Commit**

```bash
git add lib/rbac.ts tests/rbac.test.ts
git commit -m "feat(rbac): permisos de colega en modo consultorio compartido"
```

---

### Task 3: Perfil, guard y layout — propagar el flag

**Files:**
- Modify: `lib/auth.ts`
- Modify: `lib/guard.ts:16-19`
- Modify: `app/(dashboard)/layout.tsx:24-28,87,111`

**Interfaces:**
- Consumes: `canSeeNav(role, key, opts)` de Task 2.
- Produces: `CurrentProfile.sharedPractice: boolean` — las tareas 4 y 5 leen `profile.sharedPractice`.

- [ ] **Step 1: Extender `getProfile()` en `lib/auth.ts`**

```typescript
export interface CurrentProfile {
  userId: string;
  clinicId: string;
  role: Role;
  fullName: string;
  sharedPractice: boolean;
}
```

En la query, traer el flag de la clínica y mapearlo:

```typescript
  const { data: profile } = await supabase
    .from("profiles")
    .select("clinic_id, role, full_name, clinics(shared_practice)")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  const clinic = profile.clinics as { shared_practice?: boolean } | null;

  return {
    userId: user.id,
    clinicId: profile.clinic_id,
    role: profile.role as Role,
    fullName: profile.full_name,
    sharedPractice: clinic?.shared_practice ?? false,
  };
```

- [ ] **Step 2: `lib/guard.ts` — pasar el flag al gate de páginas**

```typescript
export async function requireNavAccess(key: FeatureKey) {
  const [features, profile] = await Promise.all([getClinicFeatures(), getProfile()]);
  if (
    !features[key] ||
    !canSeeNav(profile?.role, key, { sharedPractice: profile?.sharedPractice })
  )
    redirect("/agenda");
}
```

- [ ] **Step 3: `app/(dashboard)/layout.tsx` — menú y gate de Términos**

En el select de la línea 24-28, agregar `shared_practice` a la relación clinics:

```typescript
    .select("full_name, role, active, terms_accepted_at, terms_accepted_version, clinics(name, features, active, shared_practice)")
```

Extender el tipo del cast de `clinic` (línea 36-38):

```typescript
  const clinic = profile?.clinics as
    | { name?: string; features?: unknown; active?: boolean; shared_practice?: boolean }
    | null;
```

En el filtro del menú (línea 111), pasar el flag:

```typescript
        FEATURES.filter(
          (f) =>
            features[f.key] &&
            canSeeNav(role, f.key, { sharedPractice: clinic?.shared_practice }),
        ).map((f) => ({
          href: f.href,
          label: f.label,
        }));
```

En el gate de Términos (línea 87): en una clínica compartida no hay admin, así que el colega también debe aceptar en nombre de la clínica:

```typescript
  const mustAcceptTerms =
    profile?.role === "admin" ||
    (clinic?.shared_practice === true && profile?.role === "colega");
  if (!superadmin && profile && mustAcceptTerms && !termsAccepted) {
```

- [ ] **Step 4: Typecheck y suite**

Run: `npx tsc --noEmit && npm test`
Expected: sin errores de tipos; suite verde.

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts lib/guard.ts "app/(dashboard)/layout.tsx"
git commit -m "feat(auth): propagar shared_practice al perfil, guard y menu"
```

---

### Task 4: Acciones financieras — atribuir todo al colega dueño

**Files:**
- Modify: `app/(dashboard)/caja/actions.ts` (registerPayment línea 12-63, registerExpense línea 72-102)
- Modify: `app/(dashboard)/pacientes/history-actions.ts:58-96`
- Modify: `app/(dashboard)/agenda/actions.ts:506-515`
- Modify: `app/(dashboard)/pagos/actions.ts` (los dos inserts de `staff_payments`, líneas ~96 y ~163)

**Interfaces:**
- Consumes: `financialDoctorId(profile, requested)` y `can(role, perm, opts)` de Task 2; `profile.sharedPractice` de Task 3.
- Produces: nada nuevo para otras tareas.

- [ ] **Step 1: `caja/actions.ts` — registerPayment**

Importar `financialDoctorId` desde `@/lib/rbac`. Después del parseo, resolver el doctor y usarlo en AMBOS inserts:

```typescript
  // En modo compartido, el cobro pertenece SIEMPRE al colega que lo registra.
  const ownerDoctorId = financialDoctorId(profile, parsed.data.doctor_id ?? null);

  const supabase = await createClient();
  // Trigger en DB crea el account_movement (crédito) y actualiza el saldo.
  const { error } = await supabase.from("payments").insert({
    clinic_id: profile.clinicId,
    patient_id: parsed.data.patient_id,
    amount: parsed.data.amount,
    method: parsed.data.method,
    kind: parsed.data.kind,
    note: parsed.data.note ?? null,
    doctor_id: ownerDoctorId,
    commission_pct: parsed.data.commission_pct,
  });
  if (error) return { error: error.message };

  if (ownerDoctorId) {
    await supabase.from("doctor_works").insert({
      clinic_id: profile.clinicId,
      doctor_id: ownerDoctorId,
      patient_id: parsed.data.patient_id,
      description: parsed.data.note ?? "Pago registrado en caja",
      cost: parsed.data.amount,
      commission_pct: parsed.data.commission_pct,
      amount_paid: parsed.data.amount,
      payment_method: parsed.data.method,
      performed_at: new Date().toISOString().split("T")[0],
    });
  }
```

- [ ] **Step 2: `caja/actions.ts` — registerExpense**

Gate con el flag y atribuir el gasto:

```typescript
  if (!can(profile.role, "expenses:write", { sharedPractice: profile.sharedPractice }))
    return { error: "Solo administración registra gastos." };
```

y en el insert:

```typescript
  const { error } = await supabase.from("expenses").insert({
    clinic_id: profile.clinicId,
    category: parsed.data.category,
    amount: parsed.data.amount,
    vendor: parsed.data.vendor,
    notes: parsed.data.notes,
    doctor_id: financialDoctorId(profile),
  });
```

Aplicar el mismo gate `{ sharedPractice: profile.sharedPractice }` a `payCommission` (línea ~108) y a cualquier otro `can(profile.role, "expenses:write")` del archivo.

- [ ] **Step 3: `pacientes/history-actions.ts` — pago desde la ficha**

Importar `financialDoctorId`. Antes del insert de payments (línea 58):

```typescript
  const ownerDoctorId = financialDoctorId(profile, d.doctor_id ?? null);
```

Reemplazar `doctor_id: d.doctor_id ?? null` por `doctor_id: ownerDoctorId` en el insert de `payments` (línea 70), y en el bloque `if (d.doctor_id)` (línea 83) cambiar la condición y el campo a `ownerDoctorId`:

```typescript
  if (ownerDoctorId) {
    const { error: workError } = await supabase.from("doctor_works").insert({
      clinic_id: profile.clinicId,
      doctor_id: ownerDoctorId,
      // ... resto de campos idéntico al actual
```

- [ ] **Step 4: `agenda/actions.ts` — adelanto de cita (línea 506-515)**

Este insert no lleva doctor; en modo compartido debe quedar atribuido al colega que lo migra (si lo hace la recepcionista/admin, queda null = común, como hoy). Importar `financialDoctorId` y:

```typescript
  // 2) Adelanto -> pago real del paciente.
  if (deposit > 0) {
    await supabase.from("payments").insert({
      clinic_id: profile.clinicId,
      patient_id: appt.patient_id,
      amount: deposit,
      method: appt.deposit_method ?? "cash",
      kind: "payment",
      doctor_id: financialDoctorId(profile),
    });
  }
```

- [ ] **Step 5: `pagos/actions.ts` — pagos de personal**

En los DOS inserts a `staff_payments` (líneas ~96 y ~163), agregar el campo:

```typescript
      paid_by: profile.userId,
```

Y donde el archivo gatee con `can(profile.role, "expenses:write")` o `profile.role !== "admin"`, usar la forma con flag: `can(profile.role, "expenses:write", { sharedPractice: profile.sharedPractice })`.

- [ ] **Step 6: Typecheck + suite + prueba manual**

Run: `npx tsc --noEmit && npm test`
Expected: verde.

Prueba manual mínima (con el stack local y una clínica con `shared_practice = true` — se puede setear a mano: `update clinics set shared_practice = true where id = '...';`): logueado como colega, registrar un cobro en `/caja` y verificar en la DB que `payments.doctor_id` = id del colega aunque el formulario haya mandado otro doctor.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/caja/actions.ts" "app/(dashboard)/pacientes/history-actions.ts" "app/(dashboard)/agenda/actions.ts" "app/(dashboard)/pagos/actions.ts"
git commit -m "feat(finanzas): atribuir cobros, gastos y pagos de personal al colega en modo compartido"
```

---

### Task 5: Ajustes — gestión por colegas y activación del modo

**Files:**
- Modify: `app/(dashboard)/ajustes/actions.ts` (assertClinicAdmin línea 86-92 + nueva action)
- Create: `components/ajustes/SharedPracticeCard.tsx`
- Modify: `app/(dashboard)/ajustes/page.tsx` (render de la nueva card)
- Modify: `app/(dashboard)/superadmin/actions.ts` (addClinicUser línea 74-92)

**Interfaces:**
- Consumes: `profile.sharedPractice` (Task 3), columna `clinics.shared_practice` (Task 1).
- Produces: server action `enableSharedPractice(): Promise<ActionState>` usada por `SharedPracticeCard`.

- [ ] **Step 1: Generalizar el gate de gestión en `ajustes/actions.ts`**

Reemplazar `assertClinicAdmin` por:

```typescript
// Gestiona el equipo: el admin clásico, o cualquier colega si la clínica está
// en modo consultorio compartido (ahí los colegas son pares y no hay admin).
async function assertClinicManager() {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." as const };
  const isManager =
    profile.role === "admin" ||
    (profile.sharedPractice && profile.role === "colega");
  if (!isManager)
    return { error: "Solo el administrador de la clínica puede gestionar usuarios." as const };
  return { profile };
}
```

Actualizar TODOS los call sites de `assertClinicAdmin()` del archivo a `assertClinicManager()` (buscar con grep; no dejar ninguno). `TEAM_ROLES` ya excluye `admin`, así que un colega jamás puede crear un admin — no hace falta más.

- [ ] **Step 2: Nueva action `enableSharedPractice` en `ajustes/actions.ts`**

```typescript
// Activa el modo "consultorio compartido": el admin actual se convierte en
// colega (nadie conserva la super-vista financiera). Un solo sentido desde la
// UI; revertirlo requiere al superadmin (hay que elegir a mano quién vuelve
// a ser admin).
export async function enableSharedPractice(): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin")
    return { error: "Solo el administrador puede activar el modo compartido." };

  const admin = createAdminClient();

  const { error: clinicErr } = await admin
    .from("clinics")
    .update({ shared_practice: true })
    .eq("id", profile.clinicId);
  if (clinicErr) return { error: clinicErr.message };

  // Todos los admins de la clínica pasan a colega (normalmente es uno).
  const { error: roleErr } = await admin
    .from("profiles")
    .update({ role: "colega" })
    .eq("clinic_id", profile.clinicId)
    .eq("role", "admin");
  if (roleErr) return { error: roleErr.message };

  const { error: auditErr } = await admin.from("audit_log").insert({
    clinic_id: profile.clinicId,
    actor_id: profile.userId,
    action: "shared_practice_enabled",
    entity: "clinic",
    entity_id: profile.clinicId,
    diff: { actor_name: profile.fullName, admin_demoted_to: "colega" },
  });
  if (auditErr) console.error("audit shared_practice failed:", auditErr.message);

  revalidatePath("/ajustes");
  revalidatePath("/", "layout");
  return { ok: true };
}
```

Nota: el cambio de rol vive en `app_metadata` del JWT vía el custom_access_token_hook — el ex-admin ve su nuevo rol al refrescar el token (recargar la sesión). El componente avisa esto.

- [ ] **Step 3: Crear `components/ajustes/SharedPracticeCard.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { enableSharedPractice } from "@/app/(dashboard)/ajustes/actions";

type State = { error?: string; ok?: boolean };
const initial: State = {};

export function SharedPracticeCard({ active, isAdmin }: { active: boolean; isAdmin: boolean }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: State) => enableSharedPractice(),
    initial,
  );

  if (active) {
    return (
      <section className="rounded-xl bg-white p-6 shadow ring-1 ring-slate-200">
        <h2 className="text-base font-semibold text-slate-800">Consultorio compartido</h2>
        <p className="mt-2 text-sm text-slate-500">
          Modo activo: los colegas comparten pacientes y agenda, pero cada uno ve
          únicamente sus propios cobros, gastos y comisiones. Para desactivarlo,
          contacta al administrador de la plataforma.
        </p>
      </section>
    );
  }

  if (!isAdmin) return null;

  return (
    <section className="rounded-xl bg-white p-6 shadow ring-1 ring-slate-200">
      <h2 className="text-base font-semibold text-slate-800">Consultorio compartido</h2>
      <p className="mt-2 text-sm text-slate-500">
        Para clínicas donde varios odontólogos trabajan como socios en igualdad de
        condiciones. Al activarlo: tu cuenta pasa de administrador a colega, cada
        profesional ve solo sus propias finanzas, y ya no existirá un rol que vea
        los cobros de todos. Los pacientes y la agenda siguen siendo compartidos.
      </p>
      <p className="mt-2 text-xs font-medium text-red-600">
        Esta acción no se puede deshacer desde la aplicación.
      </p>
      <form
        action={formAction}
        onSubmit={(e) => {
          if (
            !window.confirm(
              "¿Activar el modo consultorio compartido? Tu cuenta dejará de ser administrador y nadie podrá ver las finanzas de otros profesionales.",
            )
          )
            e.preventDefault();
        }}
        className="mt-4"
      >
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-night px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Activando…" : "Activar modo compartido"}
        </button>
      </form>
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state.ok && (
        <p className="mt-2 text-sm text-green-700">
          Modo activado. Cierra sesión y vuelve a entrar para ver tu nuevo rol.
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Renderizar la card en `app/(dashboard)/ajustes/page.tsx`**

Leer el page.tsx para ubicar dónde se cargan perfil y clínica. Agregar `shared_practice` al select de la clínica si la página ya la consulta (o consultarla), importar la card y renderizarla junto a las demás secciones de configuración:

```tsx
<SharedPracticeCard
  active={clinic?.shared_practice ?? false}
  isAdmin={profile?.role === "admin"}
/>
```

- [ ] **Step 5: Bloquear admins en clínicas compartidas — `superadmin/actions.ts`**

En `addClinicUser`, después del parseo (línea ~84):

```typescript
  // En una clínica compartida no puede existir un admin: ese rol vería las
  // finanzas de todos los colegas y rompería la confidencialidad del modo.
  if (role === "admin") {
    const { data: clinicRow } = await admin
      .from("clinics")
      .select("shared_practice")
      .eq("id", clinicId)
      .single();
    if (clinicRow?.shared_practice) {
      return { error: "Esta clínica está en modo consultorio compartido: no admite rol admin. Usa el rol colega." };
    }
  }
```

(Mover `const admin = createAdminClient();` arriba del check si hace falta.)
Aplicar el mismo check en `updateUserRole` (línea ~95): si el rol destino es `admin` y la clínica del usuario es compartida, no aplicar el cambio.

- [ ] **Step 6: Typecheck + suite**

Run: `npx tsc --noEmit && npm test`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/ajustes/actions.ts" "app/(dashboard)/ajustes/page.tsx" components/ajustes/SharedPracticeCard.tsx "app/(dashboard)/superadmin/actions.ts"
git commit -m "feat(ajustes): activar modo consultorio compartido y gestion por colegas pares"
```

---

### Task 6: Alta de clínica compartida desde superadmin

**Files:**
- Modify: `app/(dashboard)/superadmin/actions.ts:16-64` (createClinic)
- Modify: `components/superadmin/NewClinicForm.tsx`

**Interfaces:**
- Consumes: columna `clinics.shared_practice` (Task 1).
- Produces: nada nuevo.

- [ ] **Step 1: `createClinic` acepta el modo**

```typescript
export async function createClinic(_prev: unknown, formData: FormData) {
  await assertSuperadmin();

  const parsed = newClinicSchema.safeParse({
    clinicName: formData.get("clinicName"),
    adminEmail: formData.get("adminEmail"),
    adminName: formData.get("adminName"),
    plan: formData.get("plan") || "starter",
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { clinicName, adminEmail, adminName, plan } = parsed.data;

  const whatsappAddon = formData.get("whatsapp_addon") === "true";
  const sharedPractice = formData.get("shared_practice") === "true";

  const admin = createAdminClient();

  const { data: clinic, error: clinicErr } = await admin
    .from("clinics")
    .insert({
      name: clinicName,
      plan,
      features: { whatsapp: whatsappAddon },
      shared_practice: sharedPractice,
    })
    .select("id")
    .single();
  if (clinicErr || !clinic) {
    return { error: `No se pudo crear la clínica: ${clinicErr?.message}` };
  }

  // En modo compartido el primer usuario entra como COLEGA (par), no admin:
  // en estas clínicas nadie tiene la super-vista financiera.
  const invite = await inviteClinicUser(admin, {
    email: adminEmail,
    fullName: adminName,
    clinicId: clinic.id,
    role: sharedPractice ? "colega" : "admin",
  });
  if (!invite.ok) {
    await admin.from("clinics").delete().eq("id", clinic.id);
    return { error: invite.error };
  }

  revalidatePath("/superadmin");
  return { ok: `Clínica "${clinicName}" creada. Invitación enviada a ${adminEmail}.` };
}
```

- [ ] **Step 2: Checkbox en `NewClinicForm.tsx`**

Debajo del checkbox de WhatsApp (línea 63), mismo patrón visual:

```tsx
      {/* Modo consultorio compartido */}
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 hover:bg-slate-100">
        <input
          type="checkbox"
          name="shared_practice"
          value="true"
          className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-clinic"
        />
        <div>
          <span className="text-sm font-medium text-slate-700">
            Consultorio compartido entre colegas
          </span>
          <p className="text-xs text-slate-500">
            Varios odontólogos como socios en igualdad: comparten pacientes y
            agenda, pero cada uno ve solo sus propias finanzas. El primer usuario
            se crea con rol colega (sin admin).
          </p>
        </div>
      </label>
```

- [ ] **Step 3: Typecheck + suite**

Run: `npx tsc --noEmit && npm test`
Expected: verde.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/superadmin/actions.ts" components/superadmin/NewClinicForm.tsx
git commit -m "feat(superadmin): alta de clinica en modo consultorio compartido"
```

---

### Task 7: Verificación de confidencialidad y regresión

**Files:**
- Ninguno nuevo (verificación).

- [ ] **Step 1: Suite completa y typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: todo verde.

- [ ] **Step 2: Verificación RLS con dos colegas (stack local)**

Preparar datos (SQL en el stack local, `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"`):

```sql
-- Con una clínica de prueba en shared_practice y dos usuarios colega A y B
-- creados vía la UI de ajustes o superadmin:
update clinics set shared_practice = true where name = 'CLINICA_PRUEBA';
```

Luego, logueado en la app como **colega A**: registrar un cobro en `/caja` y un gasto. Logueado como **colega B**:
- `/caja` NO muestra el cobro ni el gasto de A.
- `/cuentas` del paciente no muestra la deuda generada por trabajos de A.
- `/pagos` no muestra comisiones de A.
- `/pacientes/[id]` SÍ muestra el historial clínico completo (evoluciones de A incluidas).
- `/agenda` muestra las citas de ambos.
- `/ajustes` es accesible para B y NO ofrece crear rol admin.

- [ ] **Step 3: Regresión en clínica normal**

En una clínica con `shared_practice = false`: verificar como admin que caja/cuentas/pagos muestran TODO como antes, y como colega que NO ve caja/ajustes en el menú (igual que antes).

- [ ] **Step 4: Commit final si hubo ajustes**

```bash
git add -A
git commit -m "test(shared-practice): verificacion de confidencialidad entre colegas"
```
