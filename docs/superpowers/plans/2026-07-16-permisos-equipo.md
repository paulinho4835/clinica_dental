# Permisos del equipo (addon `permisos_equipo`) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El admin de la clínica oculta módulos concretos a miembros concretos de su equipo desde un panel nuevo en Ajustes (addon opt-in `permisos_equipo`).

**Architecture:** Tercera capa de visibilidad por usuario (`profiles.hidden_modules jsonb`), aplicada en los dos puntos ya centralizados: el filtro del menú en `app/(dashboard)/layout.tsx` y el guard `requireNavAccess` en `lib/guard.ts`. Helpers puros en `lib/rbac.ts`, server action en Ajustes, panel client nuevo.

**Tech Stack:** Next.js App Router (server components + server actions), Supabase (migración SQL, RLS existente sin cambios), Vitest, Tailwind con primitivos de `components/ui/`.

**Spec:** `docs/superpowers/specs/2026-07-16-permisos-equipo-design.md`

## Global Constraints

- Español neutro en toda la UI (sin voseo: "haz" no "hacé", "puedes" no "podés").
- NUNCA hacer push sin autorización explícita del usuario. Commits sí, push no.
- Solo restar visibilidad, nunca sumar por encima del rol (`NAV_WHITELIST` es el techo).
- Con el addon `permisos_equipo` apagado, `hidden_modules` se ignora por completo: comportamiento actual intacto.
- El rol `admin` nunca es recortable; `agenda` y `ajustes` nunca son ocultables.
- Default de la columna: `'[]'::jsonb` — cero impacto en clínicas existentes.
- Usar primitivos de `components/ui/` y `cn()` de `lib/cn`; avisos con `toast()` de `lib/toast`.
- Typecheck con `npx tsc --noEmit`; tests con `npm test` (Vitest, corre `tests/`).

---

### Task 1: Helpers puros + clave del addon (TDD)

**Files:**
- Modify: `lib/features.ts` (agregar clave `permisos_equipo`)
- Modify: `lib/rbac.ts` (helpers nuevos al final del archivo)
- Test: `tests/permisos.test.ts` (nuevo)

**Interfaces:**
- Produces: `parseHiddenModules(raw: unknown): FeatureKey[]`, `hideableModules(role: Role | undefined): FeatureKey[]`, `sanitizeHiddenModules(role: Role | undefined, keys: unknown): FeatureKey[]` — consumidas por Tasks 2–5.
- Produces: `FeatureKey` ahora incluye `"permisos_equipo"` (optIn).

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/permisos.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  parseHiddenModules,
  hideableModules,
  sanitizeHiddenModules,
} from "@/lib/rbac";

describe("parseHiddenModules", () => {
  it("devuelve [] para null/undefined/corrupto", () => {
    expect(parseHiddenModules(null)).toEqual([]);
    expect(parseHiddenModules(undefined)).toEqual([]);
    expect(parseHiddenModules("caja")).toEqual([]);
    expect(parseHiddenModules({ caja: true })).toEqual([]);
  });

  it("filtra claves que no son FeatureKey", () => {
    expect(parseHiddenModules(["caja", "no_existe", 42, "inventario"])).toEqual([
      "caja",
      "inventario",
    ]);
  });
});

describe("hideableModules", () => {
  it("admin no es recortable: devuelve []", () => {
    expect(hideableModules("admin")).toEqual([]);
  });

  it("undefined devuelve []", () => {
    expect(hideableModules(undefined)).toEqual([]);
  });

  it("nunca incluye agenda ni ajustes", () => {
    for (const role of ["recepcionista", "colega", "odontologo_general", "especialista", "asistente"] as const) {
      const hideable = hideableModules(role);
      expect(hideable).not.toContain("agenda");
      expect(hideable).not.toContain("ajustes");
    }
  });

  it("doctor: subconjunto de su whitelist sin agenda", () => {
    expect(hideableModules("odontologo_general")).toEqual([
      "inicio",
      "pacientes",
      "mis_trabajos",
      "calificaciones",
    ]);
  });

  it("asistente: inventario es ocultable", () => {
    expect(hideableModules("asistente")).toEqual(["inicio", "pacientes", "inventario"]);
  });
});

describe("sanitizeHiddenModules", () => {
  it("recorta a lo ocultable por el rol", () => {
    expect(
      sanitizeHiddenModules("odontologo_general", ["mis_trabajos", "caja", "agenda", "basura"]),
    ).toEqual(["mis_trabajos"]);
  });

  it("admin siempre []", () => {
    expect(sanitizeHiddenModules("admin", ["caja", "inventario"])).toEqual([]);
  });

  it("payload no-array devuelve []", () => {
    expect(sanitizeHiddenModules("colega", "caja")).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run tests/permisos.test.ts`
Expected: FAIL — `parseHiddenModules` no existe en `@/lib/rbac`.

- [ ] **Step 3: Agregar la clave del addon en `lib/features.ts`**

En el union `FeatureKey`, después de `| "aviso_doctores"`, agregar:

```typescript
  | "permisos_equipo"
```

En el array `FEATURES`, después de la entrada de `aviso_doctores`, agregar:

```typescript
  // Addon: el admin de la clínica decide qué módulos ve cada miembro de su
  // equipo (oculta módulos por usuario, sin dar nunca más que su rol).
  { key: "permisos_equipo", label: "Permisos del equipo", href: "/ajustes", optIn: true },
```

- [ ] **Step 4: Implementar los helpers en `lib/rbac.ts`**

Al final de `lib/rbac.ts`, agregar (importar `FEATURES` junto al import de tipos existente: `import { FEATURES, type FeatureKey } from "@/lib/features";` — reemplaza el import type actual de la línea 1):

```typescript
// ── Permisos del equipo (addon "permisos_equipo") ───────────────────────────
// El admin oculta módulos por usuario. Solo resta: NAV_WHITELIST sigue siendo
// el techo. "agenda" nunca es ocultable (es el destino de redirect de todos
// los guards) y "ajustes" tampoco (solo la ve el admin, que no es recortable).

const NEVER_HIDEABLE = new Set<FeatureKey>(["agenda", "ajustes"]);

const ALL_FEATURE_KEYS = new Set<FeatureKey>(FEATURES.map((f) => f.key));

// Valida el jsonb crudo de profiles.hidden_modules. Cualquier cosa que no sea
// un array de FeatureKeys conocidas se descarta (falla abierto: [] = nada oculto).
export function parseHiddenModules(raw: unknown): FeatureKey[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (k): k is FeatureKey => typeof k === "string" && ALL_FEATURE_KEYS.has(k as FeatureKey),
  );
}

// Módulos que el admin puede ocultarle a un usuario según su rol.
export function hideableModules(role: Role | undefined): FeatureKey[] {
  if (!role || role === "admin") return [];
  return (NAV_WHITELIST[role] ?? []).filter((k) => !NEVER_HIDEABLE.has(k));
}

// Recorta un payload arbitrario a lo realmente ocultable para ese rol.
export function sanitizeHiddenModules(role: Role | undefined, keys: unknown): FeatureKey[] {
  const hideable = new Set(hideableModules(role));
  return parseHiddenModules(keys).filter((k) => hideable.has(k));
}
```

Nota: el orden de `hideableModules` sale del orden de `NAV_WHITELIST[role]`, que para `odontologo_general` es `["inicio", "agenda", "pacientes", "mis_trabajos", "calificaciones"]` → sin agenda queda `["inicio", "pacientes", "mis_trabajos", "calificaciones"]` (coincide con el test).

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npx vitest run tests/permisos.test.ts`
Expected: PASS (10 tests)

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/features.ts lib/rbac.ts tests/permisos.test.ts
git commit -m "feat(permisos): addon permisos_equipo + helpers puros de módulos ocultos"
```

---

### Task 2: Migración + perfil con `hiddenModules`

**Files:**
- Create: `supabase/migrations/0089_hidden_modules.sql`
- Modify: `lib/auth.ts`

**Interfaces:**
- Consumes: `parseHiddenModules` de Task 1.
- Produces: `CurrentProfile.hiddenModules: FeatureKey[]` — consumido por Tasks 3 y 4.

- [ ] **Step 1: Crear la migración**

Crear `supabase/migrations/0089_hidden_modules.sql`:

```sql
-- Addon "permisos_equipo": módulos que el admin de la clínica le ocultó a este
-- usuario. Solo resta visibilidad (NAV_WHITELIST por rol sigue siendo el techo)
-- y solo tiene efecto si la clínica tiene el addon encendido.
-- Sin cambios de RLS: profiles_admin_write ya deja al admin actualizar perfiles
-- de su clínica, y profiles_select deja a cada usuario leer el suyo.
alter table profiles
  add column if not exists hidden_modules jsonb not null default '[]'::jsonb;
```

- [ ] **Step 2: Aplicar la migración en local**

Run: `npx supabase db push --local` (o aplicar el SQL directo con `docker exec -i supabase_db_dentalsaas psql -U postgres -d postgres` si el CLI da problemas, como es habitual en este repo)
Expected: columna creada. Verificar: `docker exec -i supabase_db_dentalsaas psql -U postgres -d postgres -c "\d profiles"` muestra `hidden_modules | jsonb | not null | '[]'::jsonb`.

Nota: en producción esta migración se aplica a mano por el dashboard de Supabase (el CLI está logueado con otra cuenta — ver docs/DEPLOY-MIGRACIONES.md). Anotarlo como pendiente de prod al cerrar la rama.

- [ ] **Step 3: Extender `getProfile()` en `lib/auth.ts`**

En la interfaz `CurrentProfile`, agregar el campo:

```typescript
export interface CurrentProfile {
  userId: string;
  clinicId: string;
  role: Role;
  fullName: string;
  /** Módulos ocultados por el admin (addon "permisos_equipo"). [] = nada oculto. */
  hiddenModules: FeatureKey[];
}
```

Agregar imports: `import { parseHiddenModules, type Role } from "@/lib/rbac";` (reemplaza el import type actual) y `import type { FeatureKey } from "@/lib/features";`.

En la query, cambiar el select a:

```typescript
    .select("clinic_id, role, full_name, hidden_modules")
```

Y en el return del perfil, agregar:

```typescript
    hiddenModules: parseHiddenModules(profile.hidden_modules),
```

- [ ] **Step 4: Verificar typecheck y suite completa**

Run: `npx tsc --noEmit && npm test`
Expected: sin errores de tipos; todos los tests pasan.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0089_hidden_modules.sql lib/auth.ts
git commit -m "feat(permisos): columna profiles.hidden_modules + hiddenModules en getProfile"
```

---

### Task 3: Aplicar el ocultado en guard y menú

**Files:**
- Modify: `lib/guard.ts`
- Modify: `app/(dashboard)/layout.tsx`
- Modify: `app/(dashboard)/pacientes/page.tsx` (línea ~37: `requireFeature("pacientes")` → `requireNavAccess("pacientes")`)
- Modify: `app/(dashboard)/tratamientos/page.tsx` (línea ~8: `requireFeature("tratamientos")` → `requireNavAccess("tratamientos")`)

**Interfaces:**
- Consumes: `CurrentProfile.hiddenModules` (Task 2), `features.permisos_equipo` (Task 1).
- Produces: ningún export nuevo; comportamiento de guard/menú.

- [ ] **Step 1: Extender `requireNavAccess` en `lib/guard.ts`**

Reemplazar el cuerpo de `requireNavAccess` por:

```typescript
// Verifica feature habilitada Y que el rol del usuario pueda ver ese módulo,
// Y (addon "permisos_equipo") que el admin no le haya ocultado el módulo.
// Usar en lugar de requireFeature() para módulos con restricción por rol/usuario.
export async function requireNavAccess(key: FeatureKey) {
  const [features, profile] = await Promise.all([getClinicFeatures(), getProfile()]);
  if (!features[key] || !canSeeNav(profile?.role, key)) redirect("/agenda");
  if (
    features.permisos_equipo &&
    profile &&
    profile.role !== "admin" &&
    profile.hiddenModules.includes(key)
  ) {
    redirect("/agenda");
  }
}
```

("agenda" nunca llega aquí oculta — `hideableModules` la excluye y esta página usa `requireFeature` — así que el redirect no puede ciclar.)

- [ ] **Step 2: Migrar pacientes y tratamientos a `requireNavAccess`**

En `app/(dashboard)/pacientes/page.tsx`: cambiar el import de `requireFeature` a `requireNavAccess` y la llamada `await requireFeature("pacientes")` → `await requireNavAccess("pacientes")`.

Igual en `app/(dashboard)/tratamientos/page.tsx` con `"tratamientos"`.

(Ambos módulos están en el `NAV_WHITELIST` de todos los roles que hoy los usan, así que este cambio no restringe a nadie por sí solo; solo habilita el ocultado por URL directa.)

- [ ] **Step 3: Filtrar el menú en `app/(dashboard)/layout.tsx`**

El layout hace su propia query de `profiles` (no usa `getProfile`). Agregar `hidden_modules` al select de la línea ~26:

```typescript
    .select("full_name, role, active, terms_accepted_at, terms_accepted_version, hidden_modules, clinics(name, features, active)")
```

Agregar al import de rbac: `import { canSeeNav, parseHiddenModules, type Role } from "@/lib/rbac";`

Después de `const role = profile?.role as Role | undefined;` (línea ~104), agregar:

```typescript
  // Módulos ocultados a este usuario por el admin (addon "permisos_equipo").
  // Nunca aplica al admin ni al superadmin.
  const hidden =
    features.permisos_equipo && role !== "admin"
      ? new Set(parseHiddenModules((profile as { hidden_modules?: unknown } | null)?.hidden_modules))
      : new Set<string>();
```

Y en el filtro del nav (línea ~111):

```typescript
        FEATURES.filter(
          (f) => features[f.key] && canSeeNav(role, f.key) && !hidden.has(f.key),
        ).map((f) => ({
```

- [ ] **Step 4: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Prueba manual rápida en local**

Con el seed: poner a mano un módulo oculto al doctor y encender el addon:

```bash
docker exec -i supabase_db_dentalsaas psql -U postgres -d postgres -c "
update clinics set features = coalesce(features,'{}'::jsonb) || '{\"permisos_equipo\": true}'::jsonb where name ilike '%sonrisa%';
update profiles set hidden_modules = '[\"mis_trabajos\"]'::jsonb where full_name ilike '%doctor%';"
```

Login como `doctor@sonrisa.com` / `password123`: el menú NO muestra "Mis trabajos" y entrar a `/mis-trabajos` por URL redirige a `/agenda`. Login como `admin@sonrisa.com`: menú completo intacto. Revertir: `update profiles set hidden_modules = '[]'::jsonb ...`.

- [ ] **Step 6: Commit**

```bash
git add lib/guard.ts "app/(dashboard)/layout.tsx" "app/(dashboard)/pacientes/page.tsx" "app/(dashboard)/tratamientos/page.tsx"
git commit -m "feat(permisos): aplicar módulos ocultos en el menú y en requireNavAccess"
```

---

### Task 4: Server action `setHiddenModules`

**Files:**
- Create: `app/(dashboard)/ajustes/permissions-actions.ts`

**Interfaces:**
- Consumes: `sanitizeHiddenModules`, `hideableModules` (Task 1), `getProfile` con `hiddenModules` (Task 2), `getClinicFeatures` de `lib/superadmin`, `can` de `lib/rbac`.
- Produces: `setHiddenModules(targetUserId: string, keys: string[]): Promise<{ ok?: true; error?: string }>` — consumido por Task 5.

- [ ] **Step 1: Crear la action**

Crear `app/(dashboard)/ajustes/permissions-actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { getClinicFeatures } from "@/lib/superadmin";
import { can, sanitizeHiddenModules, type Role } from "@/lib/rbac";

// Guarda los módulos ocultos de un miembro del equipo (addon "permisos_equipo").
// Solo el admin de la clínica; el target no puede ser admin ni uno mismo.
// RLS (profiles_admin_write) limita además el update a la propia clínica.
export async function setHiddenModules(
  targetUserId: string,
  keys: string[],
): Promise<{ ok?: true; error?: string }> {
  const [profile, features] = await Promise.all([getProfile(), getClinicFeatures()]);

  if (!profile || !can(profile.role, "settings:write")) {
    return { error: "Sin permisos." };
  }
  if (!features.permisos_equipo) {
    return { error: "El módulo de permisos no está habilitado para esta clínica." };
  }
  if (targetUserId === profile.userId) {
    return { error: "No puedes modificar tus propios permisos." };
  }

  const supabase = await createClient();

  // Rol del target: define el techo de lo ocultable. RLS ya limita a la clínica.
  const { data: target } = await supabase
    .from("profiles")
    .select("id, role, clinic_id")
    .eq("id", targetUserId)
    .single();

  if (!target || target.clinic_id !== profile.clinicId) {
    return { error: "Usuario no encontrado." };
  }
  if (target.role === "admin") {
    return { error: "No se pueden restringir módulos a un administrador." };
  }

  const hidden = sanitizeHiddenModules(target.role as Role, keys);

  const { error } = await supabase
    .from("profiles")
    .update({ hidden_modules: hidden })
    .eq("id", targetUserId);

  if (error) return { error: "No se pudo guardar. Intenta de nuevo." };

  revalidatePath("/ajustes");
  return { ok: true };
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/ajustes/permissions-actions.ts"
git commit -m "feat(permisos): server action setHiddenModules con validación por rol"
```

---

### Task 5: Panel "Permisos del equipo" en Ajustes

**Files:**
- Create: `components/ajustes/PermissionsPanel.tsx`
- Modify: `app/(dashboard)/ajustes/page.tsx`

**Interfaces:**
- Consumes: `setHiddenModules` (Task 4), `hideableModules`/`parseHiddenModules` (Task 1), `FEATURES`/`Features` de `lib/features`.
- Produces: sección nueva en Ajustes, visible solo con `isClinicAdmin && features.permisos_equipo`.

- [ ] **Step 1: Crear `components/ajustes/PermissionsPanel.tsx`**

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setHiddenModules } from "@/app/(dashboard)/ajustes/permissions-actions";
import { FEATURES, type FeatureKey, type Features } from "@/lib/features";
import { hideableModules, type Role } from "@/lib/rbac";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/cn";

export type PermissionMember = {
  id: string;
  full_name: string;
  role: string;
  hidden_modules: FeatureKey[];
};

const ROLE_LABEL: Record<string, string> = {
  recepcionista: "Recepcionista",
  colega: "Colega",
  odontologo_general: "Odontólogo general",
  especialista: "Especialista",
  asistente: "Asistente",
};

const FEATURE_LABEL: Record<string, string> = Object.fromEntries(
  FEATURES.map((f) => [f.key, f.label]),
);

export function PermissionsPanel({
  members,
  clinicFeatures,
}: {
  members: PermissionMember[];
  clinicFeatures: Features;
}) {
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
      <div className="divide-y divide-slate-100">
        {members.map((m) => (
          <MemberPermissions key={m.id} member={m} clinicFeatures={clinicFeatures} />
        ))}
        {members.length === 0 && (
          <p className="px-4 py-3 text-sm text-slate-500">
            No hay miembros del equipo para configurar.
          </p>
        )}
      </div>
    </div>
  );
}

function MemberPermissions({
  member,
  clinicFeatures,
}: {
  member: PermissionMember;
  clinicFeatures: Features;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<FeatureKey>>(new Set(member.hidden_modules));
  const [pending, start] = useTransition();

  // Solo módulos que la clínica tiene encendidos Y que el rol del miembro
  // permite ocultar. Lo que no aparece aquí, no es configurable.
  const toggleable = hideableModules(member.role as Role).filter(
    (k) => clinicFeatures[k],
  );

  const dirty =
    hidden.size !== member.hidden_modules.length ||
    member.hidden_modules.some((k) => !hidden.has(k));

  function toggle(key: FeatureKey) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function save() {
    start(async () => {
      const res = await setHiddenModules(member.id, Array.from(hidden));
      if (res.error) {
        toast(res.error, "error");
        return;
      }
      toast("Permisos guardados.");
      router.refresh();
    });
  }

  return (
    <div className="px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span>
          <span className="text-sm font-medium text-slate-800">{member.full_name}</span>
          <span className="ml-2 text-xs text-slate-500">
            {ROLE_LABEL[member.role] ?? member.role}
          </span>
        </span>
        <span className="text-xs text-slate-400">
          {member.hidden_modules.length > 0
            ? `${member.hidden_modules.length} módulo(s) oculto(s)`
            : "Todo visible"}
          <span className="ml-2">{open ? "▴" : "▾"}</span>
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {toggleable.length === 0 ? (
            <p className="text-sm text-slate-500">
              Este rol no tiene módulos configurables.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {toggleable.map((key) => {
                const visible = !hidden.has(key);
                return (
                  <label
                    key={key}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1",
                      visible
                        ? "bg-white text-slate-700 ring-slate-200"
                        : "bg-slate-50 text-slate-400 ring-slate-200",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={() => toggle(key)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    {FEATURE_LABEL[key] ?? key}
                  </label>
                );
              })}
            </div>
          )}
          {toggleable.length > 0 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={save}
                disabled={!dirty || pending}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium",
                  dirty && !pending
                    ? "bg-night text-white hover:opacity-90"
                    : "cursor-not-allowed bg-slate-100 text-slate-400",
                )}
              >
                {pending ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

Nota para el implementador: revisar `components/ajustes/TeamPanel.tsx` y ajustar clases/firma de `toast()` al patrón real del repo si difiere (p. ej. si `toast` no acepta segundo argumento de tipo, usar la firma existente).

- [ ] **Step 2: Cablear la sección en `app/(dashboard)/ajustes/page.tsx`**

Import nuevo:

```typescript
import { PermissionsPanel, type PermissionMember } from "@/components/ajustes/PermissionsPanel";
import { parseHiddenModules } from "@/lib/rbac";
```

En el fetch del equipo (bloque `if (isClinicAdmin && profile)` de la línea ~157), agregar `hidden_modules` al select de profiles:

```typescript
        .select("id, full_name, role, phone, hidden_modules")
```

Después del bloque del equipo, construir la lista para el panel (excluye admins):

```typescript
  // Permisos del equipo (addon "permisos_equipo"): miembros recortables (no admin).
  const permissionMembers: PermissionMember[] = features.permisos_equipo
    ? team
        .filter((m) => m.role !== "admin")
        .map((m) => ({
          id: m.id,
          full_name: m.full_name,
          role: m.role,
          hidden_modules: parseHiddenModules(
            (m as { hidden_modules?: unknown }).hidden_modules,
          ),
        }))
    : [];
```

(El tipo `TeamMember` no incluye `hidden_modules`; extender el map del equipo para arrastrar el campo crudo junto a `phone`, o tipar el resultado del select localmente. El implementador elige lo más limpio; el dato debe llegar al panel.)

En el JSX, antes de la sección "Usuarios del equipo", agregar:

```tsx
      {isClinicAdmin && features.permisos_equipo && profile && (
        <section>
          <h2 className="text-lg font-semibold text-slate-800">Permisos del equipo</h2>
          <p className="mb-3 text-sm text-slate-500">
            Decide qué módulos ve cada miembro de tu equipo. Solo puedes ocultar
            módulos que su rol ya permite; la Agenda siempre queda visible.
          </p>
          <PermissionsPanel members={permissionMembers} clinicFeatures={features} />
        </section>
      )}
```

- [ ] **Step 3: Verificar typecheck y suite**

Run: `npx tsc --noEmit && npm test`
Expected: sin errores.

- [ ] **Step 4: Prueba manual end-to-end en local**

1. Encender el addon para la clínica seed (SQL del Task 3 Step 5 o desde Superadmin → clínica → addons: debe aparecer "Permisos del equipo" automáticamente, el panel de superadmin itera `FEATURES`).
2. Login `admin@sonrisa.com` → Ajustes → sección "Permisos del equipo" visible.
3. Ocultar "Mis trabajos" al doctor → guardar → toast de éxito.
4. Login `doctor@sonrisa.com` → menú sin "Mis trabajos", `/mis-trabajos` redirige.
5. Volver a mostrarlo → el doctor lo recupera al navegar.
6. Apagar el addon → la sección desaparece de Ajustes y el doctor ve todo de nuevo (aunque `hidden_modules` siga poblado).

- [ ] **Step 5: Commit**

```bash
git add "components/ajustes/PermissionsPanel.tsx" "app/(dashboard)/ajustes/page.tsx"
git commit -m "feat(permisos): panel Permisos del equipo en Ajustes"
```

---

### Task 6: Verificación final

**Files:**
- Ninguno nuevo (verificación + posibles fixes menores).

- [ ] **Step 1: Suite completa + typecheck**

Run: `npx tsc --noEmit && npm test`
Expected: todo verde.

- [ ] **Step 2: Verificar que el addon aparece en Superadmin**

Login `super@plataforma.com` → clínica → lista de addons debe incluir "Permisos del equipo" (sale solo de `FEATURES`; si el panel de superadmin tiene una lista manual de addons, agregar la clave ahí).

- [ ] **Step 3: Regresión de módulos NO afectados**

Con el addon apagado y `hidden_modules = '[]'`, verificar que doctor y recepcionista ven exactamente el menú de siempre (comparar contra `NAV_WHITELIST`).

- [ ] **Step 4: Registrar pendiente de producción**

La migración `0089_hidden_modules.sql` va a mano por el dashboard de Supabase antes del deploy (consolidar con `npm run db:consolidate -- 0089` si aplica). NO hacer push sin autorización de Paulo.
