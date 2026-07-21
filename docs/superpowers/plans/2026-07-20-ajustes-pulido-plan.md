# Ajustes: orden de menú, logo por archivo y moneda configurable — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover "Ajustes" al final del menú lateral, reemplazar el campo de URL de logo por la subida de archivo ya existente (retirando el addon pago "logo"), y hacer la moneda configurable por clínica (`clinics.currency`, default `"Bs"`) reemplazando el formateador fijo `bs()` por `money(n, currency)` en los 28 archivos que lo usan.

**Architecture:** Cambio de configuración pura para el orden del menú (reordenar un array). Para el logo, eliminar un gate de feature-flag y una ruta de UI duplicada, dejando un solo mecanismo (subida a R2) ya probado. Para la moneda: una columna nueva en `clinics`, un formateador con parámetro (`money`) en vez de uno fijo (`bs`), un helper cacheado por request (`getClinicCurrency`, mismo patrón que `getClinicFeatures`) para los server components, y threading manual de una prop `currency: string` en los client components que hoy formatean montos.

**Tech Stack:** Next.js App Router (server components + server actions), Supabase/Postgres (migración SQL), TypeScript, Vitest.

## Global Constraints

- Español neutro en toda la UI (sin voseo: "haz" no "hacé", "puedes" no "podés").
- NUNCA hacer push sin autorización explícita del usuario — este plan termina en un commit local; no se hace `git push`.
- Sin conversión de tipo de cambio entre monedas.
- Sin formato numérico por locale (separador de miles, decimal `,` vs `.`) — se mantiene `.toFixed(2)` tal cual, solo cambia el símbolo antepuesto.
- Sin campo de moneda de texto libre — 5 opciones fijas en un `<select>` (Bs, S/, $, US$, €).
- La columna `clinics.logo_url` NO se borra de la base de datos ni se agrega migración para limpiarla — queda como fallback funcional, solo deja de ser editable desde la UI.
- Migración nueva: `supabase/migrations/0092_clinic_currency.sql`. Antes de crear el archivo, correr `ls supabase/migrations | grep 0092` — si ya existe un `0092_*.sql` de otra rama mergeada mientras tanto, usar `0093` en su lugar para no colisionar.

---

### Task 1: Mover "Ajustes" al final del menú lateral

**Files:**
- Modify: `lib/features.ts:61` (mover la línea) y el final del array `FEATURES` (después de la línea 112, entrada `odontograma_pediatrico`)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada que otras tasks consuman — cambio autocontenido.

- [ ] **Step 1: Mover la entrada `ajustes` dentro del array `FEATURES`**

En `lib/features.ts`, elimina esta línea de su posición actual (línea 61, justo después de `cuentas`):

```ts
  { key: "ajustes", label: "Ajustes", href: "/ajustes", core: true },
```

Y agrégala como la ÚLTIMA entrada del array `FEATURES`, después de la línea de `odontograma_pediatrico` (que termina en `optIn: true },`) y antes del `];` que cierra el array:

```ts
  { key: "odontograma_pediatrico", label: "Odontograma Pediátrico", href: "/pacientes", optIn: true },
  { key: "ajustes", label: "Ajustes", href: "/ajustes", core: true },
];
```

El resto del array no cambia de orden.

- [ ] **Step 2: Verificar visualmente**

Run: `npm run dev` (si no está corriendo), abrir `/agenda` en el navegador logueado como admin de una clínica con varios módulos activos.
Expected: "Ajustes" aparece como el último ítem del menú lateral, después de todos los demás módulos activos para esa clínica.

- [ ] **Step 3: Commit**

```bash
git add lib/features.ts
git commit -m "feat(nav): mover Ajustes al final del menu lateral"
```

---

### Task 2: Moneda configurable — columna, formateador y helper cacheado

**Files:**
- Create: `supabase/migrations/0092_clinic_currency.sql`
- Modify: `lib/format.ts:1-4` (renombrar `bs` a `money`)
- Modify: `lib/superadmin.ts` (agregar `getClinicCurrency`, mismo archivo que `getClinicFeatures`)
- Test: `tests/format.test.ts`

**Interfaces:**
- Produces: `export function money(n: number | null | undefined, currency: string): string` en `lib/format.ts` — usado por TODAS las tasks siguientes en vez de `bs(n)`.
- Produces: `export const getClinicCurrency = cache(async (): Promise<string> => ...)` en `lib/superadmin.ts` — usado por las tasks de server pages/print pages.

- [ ] **Step 1: Crear la migración**

Primero verifica que el número no colisione:

```bash
ls supabase/migrations | grep 0092
```

Si no hay resultado, crea `supabase/migrations/0092_clinic_currency.sql` (si hay resultado, usa `0093_clinic_currency.sql` en su lugar y ajusta el resto de este task con ese nombre):

```sql
alter table clinics add column if not exists currency text not null default 'Bs';

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Aplicar la migración local**

Run: `npx supabase db reset` (o el comando que use este proyecto para aplicar migraciones locales — revisar `package.json` scripts si `supabase db reset` no aplica; si el proyecto usa `supabase migration up`, usar ese).
Expected: la migración corre sin error y la tabla `clinics` local tiene la columna `currency` con default `'Bs'`.

- [ ] **Step 3: Escribir el test que falla para `money()`**

Reemplaza el contenido de `tests/format.test.ts` líneas 1-18 (el describe de `bs`) por:

```ts
import { describe, it, expect } from "vitest";
import { money, getInitials, normalizeSearch, boliviaTodayISO } from "@/lib/format";

describe("money (formato de moneda configurable)", () => {
  it("formatea con dos decimales usando el símbolo dado", () => {
    expect(money(10, "Bs")).toBe("Bs 10.00");
    expect(money(1234.5, "Bs")).toBe("Bs 1234.50");
  });

  it("trata null/undefined como 0", () => {
    expect(money(null, "Bs")).toBe("Bs 0.00");
    expect(money(undefined, "Bs")).toBe("Bs 0.00");
  });

  it("redondea a 2 decimales", () => {
    expect(money(1.005, "Bs")).toBe("Bs 1.00"); // toFixed redondeo binario conocido
    expect(money(2.345, "Bs")).toBe("Bs 2.35");
  });

  it("usa el símbolo de moneda de la clínica, no un valor fijo", () => {
    expect(money(10, "S/")).toBe("S/ 10.00");
    expect(money(10, "€")).toBe("€ 10.00");
  });
});
```

Y reemplaza el describe `"bs – casos límite"` (líneas 51-63 del archivo original) por:

```ts
describe("money – casos límite", () => {
  it("cero explícito", () => {
    expect(money(0, "Bs")).toBe("Bs 0.00");
  });

  it("número negativo (devolución / nota de crédito)", () => {
    expect(money(-50, "Bs")).toBe("Bs -50.00");
  });

  it("número grande", () => {
    expect(money(10000, "Bs")).toBe("Bs 10000.00");
  });
});
```

No toques los describes de `getInitials`, `normalizeSearch` ni `boliviaTodayISO` — quedan igual.

- [ ] **Step 4: Correr el test y verificar que falla**

Run: `npx vitest run tests/format.test.ts`
Expected: FAIL — `money` no existe todavía en `lib/format.ts` (sigue exportando `bs`).

- [ ] **Step 5: Renombrar `bs` a `money` en `lib/format.ts`**

Reemplaza las líneas 1-4 de `lib/format.ts`:

```ts
// Formato de moneda: Boliviano (Bs). "Bs " es ASCII -> seguro para el PDF.
export function bs(n: number | null | undefined): string {
  return `Bs ${Number(n ?? 0).toFixed(2)}`;
}
```

por:

```ts
// Formato de moneda: símbolo (ASCII) + monto con 2 decimales. El símbolo es
// configurable por clínica (clinics.currency); "Bs" es el default histórico.
export function money(n: number | null | undefined, currency: string): string {
  return `${currency} ${Number(n ?? 0).toFixed(2)}`;
}
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `npx vitest run tests/format.test.ts`
Expected: PASS — todos los tests en verde.

- [ ] **Step 7: Agregar `getClinicCurrency` a `lib/superadmin.ts`**

Abre `lib/superadmin.ts` y localiza `getClinicFeatures` (empieza en la línea 24). Justo después del cierre de esa función (después de la línea `});` que la cierra, antes de `getClinicPhotoQuota`), agrega:

```ts
// Moneda de la clínica del usuario actual. Cacheado por request.
export const getClinicCurrency = cache(async (): Promise<string> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Bs";
  const { data: profile } = await supabase
    .from("profiles")
    .select("clinic_id")
    .eq("id", user.id)
    .single();
  if (!profile) return "Bs";
  const { data: clinic } = await supabase
    .from("clinics")
    .select("currency")
    .eq("id", profile.clinic_id)
    .single();
  return (clinic?.currency as string | null) ?? "Bs";
});
```

`cache` y `createClient` ya están importados en ese archivo (se usan en `getClinicFeatures`); no hace falta agregar imports nuevos.

- [ ] **Step 8: Verificar que el archivo compila**

Run: `npx tsc --noEmit`
Expected: en este punto seguirán apareciendo MUCHOS errores de tipo `Expected 2 arguments, but got 1` en los ~28 archivos que aún llaman a `bs(x)` (que ya no existe) — eso es esperado en esta task, las tasks siguientes los arreglan uno por uno. Confirma solo que NO hay errores en `lib/format.ts` ni `lib/superadmin.ts` (busca esos dos nombres de archivo en la salida).

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0092_clinic_currency.sql lib/format.ts lib/superadmin.ts tests/format.test.ts
git commit -m "feat(moneda): agregar clinics.currency, money() y getClinicCurrency()"
```

---

### Task 3: Selector de moneda en Ajustes (perfil de clínica)

**Files:**
- Modify: `components/ajustes/ClinicProfilePanel.tsx` (tipo `ClinicProfile`, campo nuevo en el form)
- Modify: `app/(dashboard)/ajustes/actions.ts` (`ClinicProfileSchema`, `updateClinicProfile`)
- Modify: `app/(dashboard)/ajustes/page.tsx:38-44` (agregar `currency` al `select()` de `clinicProfile`)

**Interfaces:**
- Consumes: nada de tasks anteriores directamente (el `<select>` es HTML plano).
- Produces: `ClinicProfile.currency: string` — de aquí en adelante cualquier código que arme un objeto `ClinicProfile` debe incluir `currency`.

- [ ] **Step 1: Agregar `currency` al tipo `ClinicProfile` y al `<select>`**

En `components/ajustes/ClinicProfilePanel.tsx`, el tipo `ClinicProfile` (líneas 7-13) gana un campo:

```ts
export type ClinicProfile = {
  name: string;
  address: string | null;
  phone: string | null;
  nit: string | null;
  logo_url: string | null;
  currency: string;
};
```

Justo después del bloque "NIT / RUC" (que cierra en la línea 89 con `</label>`), agrega este nuevo campo:

```tsx
        {/* Moneda */}
        <label className="text-xs">
          <span className="mb-1 block font-medium text-slate-600">Moneda</span>
          <select
            name="currency"
            defaultValue={profile.currency}
            disabled={!canWrite}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="Bs">Bs — Boliviano</option>
            <option value="S/">S/ — Sol peruano</option>
            <option value="$">$ — Peso / genérico</option>
            <option value="US$">US$ — Dólar</option>
            <option value="€">€ — Euro</option>
          </select>
        </label>
```

(La eliminación del campo "URL del logo" que estaba justo después del NIT se hace en Task 4 — por ahora deja ese bloque tal cual, solo agrega el de Moneda inmediatamente después del cierre del `</label>` de NIT/RUC y antes del bloque de "Logo URL".)

- [ ] **Step 2: Agregar `currency` al schema y a `updateClinicProfile`**

En `app/(dashboard)/ajustes/actions.ts`, el `ClinicProfileSchema` (líneas 249-255) gana un campo:

```ts
const ClinicProfileSchema = z.object({
  name:     z.string().trim().min(1, "El nombre de la clínica es requerido"),
  address:  z.string().trim().optional().nullable(),
  phone:    z.string().trim().optional().nullable(),
  nit:      z.string().trim().optional().nullable(),
  logo_url: z.string().trim().url("URL de logo inválida").optional().nullable().or(z.literal("")),
  currency: z.string().trim().min(1).max(5, "Máximo 5 caracteres"),
});
```

En `updateClinicProfile`, agrega `currency` al `parsed = ClinicProfileSchema.safeParse({...})` (línea ~265-271):

```ts
  const parsed = ClinicProfileSchema.safeParse({
    name:     formData.get("name"),
    address:  formData.get("address") || null,
    phone:    formData.get("phone") || null,
    nit:      formData.get("nit") || null,
    logo_url: formData.get("logo_url") || null,
    currency: formData.get("currency") || "Bs",
  });
```

Y agrega `currency` al `.update({...})` (línea ~278-284):

```ts
  const { error } = await admin
    .from("clinics")
    .update({
      name:     parsed.data.name,
      address:  parsed.data.address ?? null,
      phone:    parsed.data.phone ?? null,
      nit:      parsed.data.nit ?? null,
      logo_url: parsed.data.logo_url || null,
      currency: parsed.data.currency,
    })
    .eq("id", profile.clinicId);
```

- [ ] **Step 3: Agregar `currency` al `select()` en `ajustes/page.tsx`**

En `app/(dashboard)/ajustes/page.tsx`, la consulta que arma `clinicProfile` (líneas 38-43):

```ts
    const { data } = await supabase
      .from("clinics")
      .select("name, address, phone, nit, logo_url")
      .eq("id", profile.clinicId)
      .single();
    clinicProfile = data as ClinicProfile | null;
```

pasa a:

```ts
    const { data } = await supabase
      .from("clinics")
      .select("name, address, phone, nit, logo_url, currency")
      .eq("id", profile.clinicId)
      .single();
    clinicProfile = data as ClinicProfile | null;
```

- [ ] **Step 4: Verificar manualmente**

Run: `npm run dev`, abrir `/ajustes` como admin de clínica con el addon "perfil" activo.
Expected: aparece un selector "Moneda" con 5 opciones, valor por defecto "Bs — Boliviano". Cambiar a "S/ — Sol peruano" y guardar; recargar la página y confirmar que quedó guardado "S/".

- [ ] **Step 5: Commit**

```bash
git add components/ajustes/ClinicProfilePanel.tsx app/\(dashboard\)/ajustes/actions.ts app/\(dashboard\)/ajustes/page.tsx
git commit -m "feat(ajustes): selector de moneda en perfil de clinica"
```

---

### Task 4: Unificar el logo — subida de archivo reemplaza la URL manual

**Files:**
- Modify: `lib/features.ts` (quitar `"logo"` de `FeatureKey`, `FEATURES`, `ADDON_GROUPS`)
- Modify: `lib/clinicLogo.ts` (quitar el gate `features.logo`)
- Modify: `components/ajustes/ClinicProfilePanel.tsx` (quitar campo `logo_url` y su preview)
- Modify: `app/(dashboard)/ajustes/actions.ts` (quitar `logo_url` del schema y del update)
- Modify: `app/(dashboard)/ajustes/page.tsx` (sección "Logo de la clínica" pasa a depender de `features.perfil`)

**Interfaces:**
- Consumes: `ClinicProfile` de Task 3 (ya tiene `currency`; en este task pierde `logo_url`).
- Produces: nada que otras tasks consuman.

- [ ] **Step 1: Quitar `"logo"` de `lib/features.ts`**

Quita `"logo"` del tipo `FeatureKey` (línea 35, entre `"agente_ia_info"` y `"periodontograma"`):

```ts
  | "agente_ia_info"
  | "periodontograma"
  | "odontograma_pediatrico";
```

Quita la entrada completa de `FEATURES` (líneas 104-106, con su comentario):

```ts
  // Addon: subir el logo de la clínica para que aparezca en los documentos
  // impresos (presupuesto, recetas, consentimientos, etc.). Opt-in.
  { key: "logo", label: "Logo en documentos", href: "/ajustes", optIn: true },
```

Y quita `"logo"` de la lista de keys del grupo "🦷 Ficha clínica y documentos" en `ADDON_GROUPS`:

```ts
  { label: "🦷 Ficha clínica y documentos", keys: ["recetas", "consentimientos", "fotos", "fotos_contador", "periodontograma", "odontograma_pediatrico"] },
```

- [ ] **Step 2: Simplificar `lib/clinicLogo.ts`**

Reemplaza todo el archivo:

```ts
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isR2Configured, presignDownload } from "@/lib/r2";

// Resuelve la URL del logo a mostrar en un documento impreso de la clínica, o
// null si no hay logo. Pensado para llamarse desde las páginas de impresión
// (server components): genera una URL firmada FRESCA en cada render, por lo que
// el bucket privado de R2 no es problema (la URL expira en minutos, pero el
// documento ya quedó renderizado).
//
// Prioridad:
//   1) Logo SUBIDO a R2 (logo_storage_key) → URL firmada.
//   2) URL pública pegada a mano en `logo_url` (legado) → tal cual. Se mantiene
//      como compatibilidad: clínicas que ya pegaron una URL antes de que se
//      retirara ese campo del formulario siguen viéndola.
export async function getClinicLogoUrl(clinicId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clinics")
    .select("logo_storage_key, logo_url")
    .eq("id", clinicId)
    .single();
  if (!data) return null;

  if (data.logo_storage_key && isR2Configured()) {
    try {
      return await presignDownload(data.logo_storage_key as string, 600);
    } catch {
      // Si falla la firma, caemos al logo_url manual si existe.
    }
  }

  return (data.logo_url as string | null) ?? null;
}
```

- [ ] **Step 3: Quitar el campo `logo_url` y su preview de `ClinicProfilePanel.tsx`**

Quita el campo `logo_url` del tipo `ClinicProfile`:

```ts
export type ClinicProfile = {
  name: string;
  address: string | null;
  phone: string | null;
  nit: string | null;
  currency: string;
};
```

Quita el bloque "Logo URL" completo (el `<label>` con `name="logo_url"` y su `<span>` de ayuda) y el bloque "Preview del logo" completo (el `{profile.logo_url && (...)}`) que quedaron después del campo de Moneda agregado en Task 3.

- [ ] **Step 4: Quitar `logo_url` de `actions.ts`**

En `ClinicProfileSchema`, quita la línea:

```ts
  logo_url: z.string().trim().url("URL de logo inválida").optional().nullable().or(z.literal("")),
```

En `updateClinicProfile`, quita `logo_url` del `safeParse({...})`:

```ts
  const parsed = ClinicProfileSchema.safeParse({
    name:     formData.get("name"),
    address:  formData.get("address") || null,
    phone:    formData.get("phone") || null,
    nit:      formData.get("nit") || null,
    currency: formData.get("currency") || "Bs",
  });
```

Y quita `logo_url` del `.update({...})`:

```ts
  const { error } = await admin
    .from("clinics")
    .update({
      name:     parsed.data.name,
      address:  parsed.data.address ?? null,
      phone:    parsed.data.phone ?? null,
      nit:      parsed.data.nit ?? null,
      currency: parsed.data.currency,
    })
    .eq("id", profile.clinicId);
```

- [ ] **Step 5: Ajustar `ajustes/page.tsx` — sección de logo pasa a depender de `features.perfil`**

Quita `logo_url` del `select()` de `clinicProfile` (queda `"name, address, phone, nit, currency"`).

Reemplaza el bloque de `logoCurrentUrl` (líneas 46-58):

```ts
  // Logo de la clínica para documentos impresos (addon "logo").
  let logoCurrentUrl: string | null = null;
  if (isClinicAdmin && features.logo && profile) {
    const { data } = await supabase
      .from("clinics")
      .select("logo_storage_key")
      .eq("id", profile.clinicId)
      .single();
    const key = data?.logo_storage_key as string | null;
    if (key && isR2Configured()) {
      logoCurrentUrl = await presignDownload(key, 600).catch(() => null);
    }
  }
```

por:

```ts
  // Logo de la clínica para documentos impresos (parte del perfil, sin addon aparte).
  let logoCurrentUrl: string | null = null;
  if (isClinicAdmin && features.perfil && profile) {
    const { data } = await supabase
      .from("clinics")
      .select("logo_storage_key")
      .eq("id", profile.clinicId)
      .single();
    const key = data?.logo_storage_key as string | null;
    if (key && isR2Configured()) {
      logoCurrentUrl = await presignDownload(key, 600).catch(() => null);
    }
  }
```

Y en el JSX, la sección "Logo de la clínica" (línea 205):

```tsx
      {isClinicAdmin && features.logo && (
```

pasa a:

```tsx
      {isClinicAdmin && features.perfil && (
```

- [ ] **Step 6: Verificar que compila y probar manualmente**

Run: `npx tsc --noEmit`
Expected: ya no hay errores relacionados a `"logo"` como `FeatureKey`, ni a `logo_url` en `ClinicProfilePanel`/`actions.ts`.

Prueba manual: en una clínica con addon "perfil" activo pero SIN el addon "logo" (ya no existe como addon), abrir `/ajustes` y confirmar que la sección "Logo de la clínica" con el uploader de archivo aparece igual, inmediatamente después de "Perfil de la clínica". Confirmar que el formulario de perfil ya NO tiene campo de URL de logo.

- [ ] **Step 7: Commit**

```bash
git add lib/features.ts lib/clinicLogo.ts components/ajustes/ClinicProfilePanel.tsx app/\(dashboard\)/ajustes/actions.ts app/\(dashboard\)/ajustes/page.tsx
git commit -m "feat(ajustes): unificar logo en subida de archivo, retirar addon pago"
```

---

### Task 5: Threading de moneda — páginas server del dashboard

**Files:**
- Modify: `app/(dashboard)/inicio/page.tsx`
- Modify: `app/(dashboard)/pagos/page.tsx`
- Modify: `app/(dashboard)/mis-trabajos/page.tsx`
- Modify: `app/(dashboard)/caja/page.tsx`
- Modify: `app/(dashboard)/pacientes/[id]/page.tsx`
- Modify: `app/(dashboard)/auditoria/page.tsx`
- Modify: `app/(dashboard)/agenda/page.tsx` (no usa `bs` directamente, pero pasa `currency` a `AgendaShell` para `ApptModal`, ver Task 7)
- Modify: `app/(dashboard)/cuentas/page.tsx` (no usa `bs` directamente, pero pasa `currency` a `PatientHistoryPanel`, ver Task 7)

**Interfaces:**
- Consumes: `getClinicCurrency()` de `lib/superadmin.ts` (Task 2), `money(n, currency)` de `lib/format.ts` (Task 2).
- Produces: cada página pasa `currency` como prop a los client components que lo necesiten (consumido por Task 7).

Regla mecánica para TODAS las páginas de este task: (1) importar `getClinicCurrency` desde `@/lib/superadmin` (agregar al import existente si ya se importa `getClinicFeatures` de ese archivo, o agregar un import nuevo), (2) agregar `const currency = await getClinicCurrency();` junto a donde se obtiene `profile`/`features`, (3) en el import de `"@/lib/format"`, reemplazar `bs` por `money`, (4) reemplazar cada llamada `bs(x)` por `money(x, currency)`.

- [ ] **Step 1: `app/(dashboard)/inicio/page.tsx`**

Línea 15: `import { boliviaTodayISO, BOLIVIA_TZ, bs, fmtBoliviaTime } from "@/lib/format";` → `import { boliviaTodayISO, BOLIVIA_TZ, money, fmtBoliviaTime } from "@/lib/format";`

Agrega el import de `getClinicCurrency` (si `lib/superadmin` no está importado en este archivo, agrégalo: `import { getClinicCurrency } from "@/lib/superadmin";`).

Justo después de `const profile = await getProfile();` (línea 45), agrega: `const currency = await getClinicCurrency();`

Línea 169: `<div className="text-2xl font-bold leading-none">{bs(income)}</div>` → `{money(income, currency)}`

- [ ] **Step 2: `app/(dashboard)/pagos/page.tsx`**

Línea 6: `import { boliviaTodayISO, bs, fmtBoliviaTime } from "@/lib/format";` → `import { boliviaTodayISO, money, fmtBoliviaTime } from "@/lib/format";`

Agrega `import { getClinicCurrency } from "@/lib/superadmin";` (o súmalo al import existente de `lib/superadmin` si ya hay uno).

Después de `const profile = await getProfile();` (línea 99), agrega: `const currency = await getClinicCurrency();`

Reemplaza cada `bs(...)` por `money(..., currency)` en las líneas: 410, 464, 497, 504, 511, 541, 571, 621, 657 (mismo argumento que tenía cada llamada, solo agregando `, currency`).

Además, la sección que renderiza `<StaffPaymentForm key={selectedPayee.key} payee={selectedPayee} today={today} />` (línea 520) y `<PrintPagosButton rows={printRows} monthLabel={monthLabel} />` (importado en línea 22) deben recibir la prop `currency={currency}` — se agrega en este step aunque los componentes reciban la prop recién en las Tasks 7 y 8; TypeScript señalará error de prop desconocida hasta que esas tasks corran, lo cual es esperado en este punto del plan (ver Step 8 de verificación general en Task 9).

```tsx
              <StaffPaymentForm key={selectedPayee.key} payee={selectedPayee} today={today} currency={currency} />
```

```tsx
                  <PrintPagosButton rows={printRows} monthLabel={monthLabel} currency={currency} />
```

- [ ] **Step 3: `app/(dashboard)/mis-trabajos/page.tsx`**

Línea 5: `import { bs, boliviaTodayISO, fmtBoliviaTime } from "@/lib/format";` → `import { money, boliviaTodayISO, fmtBoliviaTime } from "@/lib/format";`

`getClinicCurrency` ya se puede importar junto a `getClinicFeatures` (línea 75 ya llama `getClinicFeatures()` — revisa el import existente de `@/lib/superadmin` y agrégalo ahí).

Después de `const features = await getClinicFeatures();` (línea 75), agrega: `const currency = await getClinicCurrency();`

Reemplaza cada `bs(...)` por `money(..., currency)` en las líneas: 347, 354, 362, 391, 434, 465, 468, 476, 486, 587, 589, 594, 604, 608.

Agrega `currency={currency}` a `<WorkForm ... />` (línea 328) y a ambas instancias de `<EditWorkButton work={w} />` (líneas 515 y 623 → `<EditWorkButton work={w} currency={currency} />`), y a `<PrintPdfButton ... />` (busca su uso alrededor de la línea 408 y agrega `currency={currency}`).

- [ ] **Step 4: `app/(dashboard)/caja/page.tsx`**

Línea 5: `import { bs, boliviaTodayISO } from "@/lib/format";` → `import { money, boliviaTodayISO } from "@/lib/format";`

Este archivo ya llama `getClinicFeatures()` en un `Promise.all` (línea 25) junto a `getProfile()` (línea 26) — agrega `getClinicCurrency()` a ese mismo `Promise.all` y desestructura `currency`.

Reemplaza `bs(...)` en las líneas 313 y 387 por `money(..., currency)`.

Agrega `currency={currency}` a `<RevenueChart .../>`, `<TopTreatmentsChart .../>` y `<TopDoctorsChart .../>` (líneas 344, 345, 359).

- [ ] **Step 5: `app/(dashboard)/pacientes/[id]/page.tsx`**

Línea 24: `import { bs } from "@/lib/format";` → `import { money } from "@/lib/format";`

Agrega `import { getClinicCurrency } from "@/lib/superadmin";` y, cerca de donde se obtiene el `profile` del usuario actual, agrega `const currency = await getClinicCurrency();`.

Reemplaza `bs(...)` en las líneas 447, 611, 615, 620 por `money(..., currency)`.

Agrega `currency={currency}` a `<TreatmentPlanPanel .../>` (línea 548).

- [ ] **Step 6: `app/(dashboard)/auditoria/page.tsx`**

Línea 9: `import { bs } from "@/lib/format";` → `import { money } from "@/lib/format";` (la línea 7 `import { BOLIVIA_TZ } from "@/lib/format";` puede fusionarse en un solo import o dejarse separada, como prefieras — ambos imports vienen del mismo módulo).

Agrega `import { getClinicCurrency } from "@/lib/superadmin";` y, junto a `getProfile()` (línea 73), agrega `const currency = await getClinicCurrency();`.

Reemplaza `bs(...)` en las líneas 182, 194, 195 por `money(..., currency)`.

- [ ] **Step 7: `app/(dashboard)/agenda/page.tsx` — solo pasa `currency` a `AgendaShell`**

Este archivo ya importa `getClinicFeatures` de `@/lib/superadmin` (línea 7) — agrega `getClinicCurrency` al mismo import.

Cerca de donde el componente arma sus datos antes del `return`, agrega `const currency = await getClinicCurrency();`.

Encuentra el `<AgendaShell ... />` (línea 160) y agrégale la prop `currency={currency}`.

- [ ] **Step 8: `app/(dashboard)/cuentas/page.tsx` — solo pasa `currency` a `PatientHistoryPanel`**

Agrega `import { getClinicCurrency } from "@/lib/superadmin";` (o súmalo a un import existente de ese módulo) y, junto a donde se resuelve el perfil/clínica del usuario, agrega `const currency = await getClinicCurrency();`.

Encuentra `<PatientHistoryPanel ... />` (línea 250) y agrégale la prop `currency={currency}`.

- [ ] **Step 9: Commit**

```bash
git add app/\(dashboard\)/inicio/page.tsx app/\(dashboard\)/pagos/page.tsx app/\(dashboard\)/mis-trabajos/page.tsx app/\(dashboard\)/caja/page.tsx "app/(dashboard)/pacientes/[id]/page.tsx" app/\(dashboard\)/auditoria/page.tsx app/\(dashboard\)/agenda/page.tsx app/\(dashboard\)/cuentas/page.tsx
git commit -m "feat(moneda): threading de currency en paginas server del dashboard"
```

Nota: `npx tsc --noEmit` seguirá mostrando errores hasta que las Tasks 6, 7 y 8 agreguen la prop `currency` a los componentes cliente referenciados aquí — es esperado, no lo intentes dejar en verde todavía.

---

### Task 6: Threading de moneda — páginas de impresión, API route y acción del agente IA

**Files:**
- Modify: `app/(print)/pacientes/[id]/imprimir/page.tsx`
- Modify: `app/(print)/pacientes/[id]/expediente/page.tsx`
- Modify: `app/api/budgets/[planId]/route.ts`
- Modify: `app/(dashboard)/ajustes/agent-info-actions.ts`

**Interfaces:**
- Consumes: `money(n, currency)` de Task 2.
- Produces: nada consumido por otras tasks (hojas del árbol de dependencias).

- [ ] **Step 1: `app/(print)/pacientes/[id]/imprimir/page.tsx`**

Línea 3: `import { bs } from "@/lib/format";` → `import { money } from "@/lib/format";`

Este archivo ya hace `.from("clinics")` para resolver datos de la clínica del paciente (alrededor de la línea 57-59, `.select(...)` con `.eq("id", patient.clinic_id)`). Agrega `currency` a ese `select()` existente y captura el valor en una variable, por ejemplo `const currency = (clinicData?.currency as string | null) ?? "Bs";` (usa el nombre real de la variable que ya recibe el resultado de ese `select` en el archivo — revisa el `const { data: ... }` de esa consulta).

Reemplaza `bs(...)` en las líneas 197, 209, 214, 222 por `money(..., currency)`.

- [ ] **Step 2: `app/(print)/pacientes/[id]/expediente/page.tsx`**

Línea 14: `import { bs } from "@/lib/format";` → `import { money } from "@/lib/format";`

Mismo patrón: este archivo ya hace `.from("clinics").select(...)` en la línea 57 con `.eq("id", patient.clinic_id)` (línea 59). Agrega `currency` a ese select y captura la variable.

Reemplaza `bs(...)` en las líneas 251, 260 por `money(..., currency)`.

- [ ] **Step 3: `app/api/budgets/[planId]/route.ts`**

Línea 4: `import { bs } from "@/lib/format";` → `import { money } from "@/lib/format";`

La consulta existente (línea 26) ya trae `clinic:clinics(name)`:

```ts
      "id, status, patient:patients(full_name), clinic:clinics(name), treatment_phases(title, phase_no, treatment_items(tooth_fdi, price, status, custom_name, procedure:procedure_catalog(name)))",
```

Cámbiala a `clinic:clinics(name, currency)`:

```ts
      "id, status, patient:patients(full_name), clinic:clinics(name, currency), treatment_phases(title, phase_no, treatment_items(tooth_fdi, price, status, custom_name, procedure:procedure_catalog(name)))",
```

Después de la línea que resuelve `clinicName` (línea 33), agrega:

```ts
  const currency = (plan.clinic as { currency?: string } | null)?.currency ?? "Bs";
```

Reemplaza `bs(price)` (línea 92) y `bs(total)` (línea 101) por `money(price, currency)` y `money(total, currency)`.

- [ ] **Step 4: `app/(dashboard)/ajustes/agent-info-actions.ts`**

Línea 7: `import { bs } from "@/lib/format";` → `import { money } from "@/lib/format";`

Agrega `import { getClinicCurrency } from "@/lib/superadmin";`.

En `buildCatalogDraft` (empieza línea 132), después de `const profile = await getProfile();` (línea 135), agrega: `const currency = await getClinicCurrency();`

Línea 147: `const lines = procs.map((p) => \`- ${p.name}: ${bs(Number(p.base_price))}\`);` → `const lines = procs.map((p) => \`- ${p.name}: ${money(Number(p.base_price), currency)}\`);`

- [ ] **Step 5: Verificar manualmente**

Run: `npm run dev`, generar un PDF de presupuesto para un plan de tratamiento de una clínica con moneda "S/" configurada (Task 3), confirmar que el PDF muestra "S/" en vez de "Bs". Imprimir la ficha de un paciente (`/pacientes/[id]/imprimir`) y confirmar el mismo cambio.

- [ ] **Step 6: Commit**

```bash
git add "app/(print)/pacientes/[id]/imprimir/page.tsx" "app/(print)/pacientes/[id]/expediente/page.tsx" "app/api/budgets/[planId]/route.ts" app/\(dashboard\)/ajustes/agent-info-actions.ts
git commit -m "feat(moneda): threading de currency en impresion, PDF de presupuesto y agente IA"
```

---

### Task 7: Threading de moneda — componentes cliente con prop `currency`

**Files:**
- Modify: `components/history/PatientHistoryPanel.tsx`
- Modify: `components/treatments/TreatmentPlanPanel.tsx`
- Modify: `components/treatments/PrintSelectModal.tsx`
- Modify: `components/treatments/TreatmentProgressBar.tsx`
- Modify: `components/treatments/TreatmentCatalog.tsx`
- Modify: `components/agenda/ApptModal.tsx`
- Modify: `components/agenda/AgendaShell.tsx`
- Modify: `components/pagos/StaffPaymentForm.tsx`
- Modify: `components/mis-trabajos/WorkForm.tsx`
- Modify: `components/mis-trabajos/EditWorkButton.tsx`
- Modify: `components/caja/CashSessionPanel.tsx`
- Modify: `components/dashboard/TopDoctorsChart.tsx`
- Modify: `components/dashboard/TopTreatmentsChart.tsx`
- Modify: `components/dashboard/RevenueChart.tsx`
- Modify: `app/(dashboard)/tratamientos/page.tsx` (pasa `currency` a `TreatmentCatalog`)

**Interfaces:**
- Consumes: `money(n, currency)` de Task 2; props `currency` pasadas desde Task 5 (`WorkForm`, `EditWorkButton`, `PrintPdfButton`, `RevenueChart`, `TopTreatmentsChart`, `TopDoctorsChart`, `TreatmentPlanPanel`, `StaffPaymentForm`, `PatientHistoryPanel`, `PrintPagosButton`, `AgendaShell`).
- Produces: nada consumido más allá — hojas del árbol, salvo `AgendaShell` que produce la prop `currency` que consume `ApptModal` (anidado dentro), y `TreatmentPlanPanel`/`StaffPaymentForm`/`PatientHistoryPanel` que producen `currency` para `PrintSelectModal`/`TreatmentProgressBar` (anidados dentro de ellos).

Regla mecánica para cada componente: (1) reemplazar `import { bs } from "@/lib/format";` por `import { money } from "@/lib/format";` (o agregar `money` a un import ya existente de `@/lib/format`), (2) agregar `currency: string` a la desestructuración de props y a su tipo inline, (3) reemplazar cada `bs(x)` por `money(x, currency)`.

- [ ] **Step 1: `components/history/PatientHistoryPanel.tsx`**

Este archivo exporta 3 componentes (`VisitasPanel` línea 78, `WorkStatusPanel` línea 112, `PatientHistoryPanel` línea 142) pero solo `PatientHistoryPanel` usa `bs()` (todas las llamadas en las líneas 179, 180, 181, 232, 238, 295, 465, 532, 719, 741, 742 están dentro del cuerpo de esa función o de funciones internas que declara). Agrega `currency: string` a la desestructuración de props de `PatientHistoryPanel` (línea 142) y a su tipo. Reemplaza `bs(...)` por `money(..., currency)` en todas esas líneas.

Este componente renderiza `<TreatmentProgressBar paid={item.paidAmount} total={item.price} size="md" />` en la línea 202 — agrégale `currency={currency}`.

- [ ] **Step 2: `components/treatments/TreatmentProgressBar.tsx`**

Agrega `currency: string` a la desestructuración de props (línea 9-13) y a su tipo. Línea 36: `{isPaid ? "Saldado ✓" : \`${bs(paid)} / ${bs(total)}\`}` → `\`${money(paid, currency)} / ${money(total, currency)}\``. Cambia el import de `bs` a `money`.

- [ ] **Step 3: `components/treatments/TreatmentPlanPanel.tsx`**

Línea 11: `import { bs, fmtBoliviaDateTime } from "@/lib/format";` → `import { money, fmtBoliviaDateTime } from "@/lib/format";`

Agrega `currency: string` a la desestructuración de props (línea 34-41) y a su tipo. Reemplaza `bs(...)` por `money(..., currency)` en las líneas 84, 114.

Este componente renderiza `<PrintSelectModal patientId={patientId} works={works} />` en la línea 61 — agrégale `currency={currency}`.

- [ ] **Step 4: `components/treatments/PrintSelectModal.tsx`**

Línea 5: `import { bs, fmtBoliviaDateTime } from "@/lib/format";` → `import { money, fmtBoliviaDateTime } from "@/lib/format";`

Agrega `currency: string` a la desestructuración de props (línea 8-13) y a su tipo. Reemplaza `bs(...)` por `money(..., currency)` en las líneas 77, 101.

Actualiza `tests/printSelectModal.test.tsx`: los 5 `render(<PrintSelectModal patientId="p1" works={works} />)` (líneas 18, 25, 34, 42, 52) pasan a `render(<PrintSelectModal patientId="p1" works={works} currency="Bs" />)`.

- [ ] **Step 5: `components/treatments/TreatmentCatalog.tsx`**

Línea 12: `import { bs } from "@/lib/format";` → `import { money } from "@/lib/format";`

Agrega `currency: string` a la desestructuración de props (línea 28) y a su tipo. Reemplaza `bs(item.base_price)` (línea 160) por `money(item.base_price, currency)`.

En `app/(dashboard)/tratamientos/page.tsx`, agrega `import { getClinicCurrency } from "@/lib/superadmin";`, agrega `const currency = await getClinicCurrency();` en el componente de página, y agrégale `currency={currency}` a `<TreatmentCatalog items={items} />` (línea 36).

- [ ] **Step 6: `components/agenda/ApptModal.tsx`**

Línea 12: `import { bs } from "@/lib/format";` → `import { money } from "@/lib/format";`

Agrega `currency: string` a la desestructuración de props (líneas 31-40) y a su tipo. Reemplaza `bs(saldo)` (línea 347) por `money(saldo, currency)`.

- [ ] **Step 7: `components/agenda/AgendaShell.tsx`**

Agrega `currency: string` a la desestructuración de props de `AgendaShell` (línea 64) y a su tipo. Encuentra `<ApptModal ... />` (línea 606) y agrégale `currency={currency}`.

- [ ] **Step 8: `components/pagos/StaffPaymentForm.tsx`**

Línea 9: `import { bs } from "@/lib/format";` → `import { money } from "@/lib/format";`

Agrega `currency: string` a la desestructuración de props (línea 63-68) y a su tipo. Reemplaza `bs(...)` por `money(..., currency)` en las líneas 255, 374, 375, 391 (tres apariciones en esa línea), 435, 467, 472, 488, 567.

Este componente renderiza `<TreatmentProgressBar paid={g.planItemPaid} total={g.planItemPrice} />` en la línea 403 — agrégale `currency={currency}`.

En `app/(dashboard)/pagos/page.tsx` (ya actualizado en Task 5 Step 2 para pasar `currency={currency}` a `<StaffPaymentForm ... />`), no se necesita ningún cambio adicional aquí.

- [ ] **Step 9: `components/mis-trabajos/WorkForm.tsx`**

Línea 8: `import { bs } from "@/lib/format";` → `import { money } from "@/lib/format";`

Agrega `currency: string` a la desestructuración de props (línea 27-31) y a su tipo. Reemplaza `bs(...)` por `money(..., currency)` en las líneas 290, 291, 294, 334 (dos apariciones), 337, 462, 575, 579, 648, 654, 659, 670.

- [ ] **Step 10: `components/mis-trabajos/EditWorkButton.tsx`**

Línea 7: `import { bs } from "@/lib/format";` → `import { money } from "@/lib/format";`

Agrega `currency: string` a la desestructuración de props (línea 33) y a su tipo. Reemplaza `bs(...)` por `money(..., currency)` en las líneas 149, 152.

- [ ] **Step 11: `components/caja/CashSessionPanel.tsx`**

Línea 10: `import { bs } from "@/lib/format";` → `import { money } from "@/lib/format";`

Agrega `currency: string` a la desestructuración de props (línea 20) y a su tipo. Reemplaza `bs(Number(session.opening_float))` (línea 41) por `money(Number(session.opening_float), currency)`.

Nota: este componente no tiene ningún caller actual en el código (`grep` no encuentra ningún `<CashSessionPanel` en el repo) — no hace falta actualizar ningún padre, solo el componente en sí para que compile.

- [ ] **Step 12: `components/dashboard/TopDoctorsChart.tsx`**

Línea 4: `import { bs } from "@/lib/format";` → `import { money } from "@/lib/format";`

Agrega `currency: string` a la desestructuración de props (línea 12) y a su tipo. Reemplaza `bs(d.commission)` (línea 41) por `money(d.commission, currency)`.

- [ ] **Step 13: `components/dashboard/TopTreatmentsChart.tsx`**

Línea 15: `import { bs } from "@/lib/format";` → `import { money } from "@/lib/format";`

Agrega `currency: string` a la desestructuración de props (línea 49) y a su tipo. Reemplaza `bs(t.revenue)` (línea 44) por `money(t.revenue, currency)`.

- [ ] **Step 14: `components/dashboard/RevenueChart.tsx`**

Línea 16: `import { bs } from "@/lib/format";` → `import { money } from "@/lib/format";`

Agrega `currency: string` a la desestructuración de props (líneas 49-56) y a su tipo. Reemplaza `bs(Number(row.value))` (línea 43) por `money(Number(row.value), currency)`.

- [ ] **Step 15: Commit**

```bash
git add components/history/PatientHistoryPanel.tsx components/treatments/TreatmentPlanPanel.tsx components/treatments/PrintSelectModal.tsx components/treatments/TreatmentProgressBar.tsx components/treatments/TreatmentCatalog.tsx components/agenda/ApptModal.tsx components/agenda/AgendaShell.tsx components/pagos/StaffPaymentForm.tsx components/mis-trabajos/WorkForm.tsx components/mis-trabajos/EditWorkButton.tsx components/caja/CashSessionPanel.tsx components/dashboard/TopDoctorsChart.tsx components/dashboard/TopTreatmentsChart.tsx components/dashboard/RevenueChart.tsx app/\(dashboard\)/tratamientos/page.tsx tests/printSelectModal.test.tsx
git commit -m "feat(moneda): threading de currency en componentes cliente"
```

---

### Task 8: Threading de moneda — botones de impresión con formateador local (`PrintPagosButton`, `PrintPdfButton`)

**Files:**
- Modify: `components/pagos/PrintPagosButton.tsx`
- Modify: `components/mis-trabajos/PrintPdfButton.tsx`

**Interfaces:**
- Consumes: prop `currency` pasada desde `app/(dashboard)/pagos/page.tsx` (Task 5 Step 2) y `app/(dashboard)/mis-trabajos/page.tsx` (Task 5 Step 3).
- Produces: nada.

Estos dos componentes generan HTML como string para imprimir (`handlePrint`) y NO importan `bs` de `lib/format` — cada uno declara su propia función local `function bs(n: number) { return \`Bs ${n.toFixed(2)}\`; }`. Se convierten en una función local que cierra sobre la prop `currency`.

- [ ] **Step 1: `components/pagos/PrintPagosButton.tsx`**

Agrega `currency: string` a la desestructuración de props y tipo de `PrintPagosButton` (líneas 51-57):

```ts
export function PrintPagosButton({
  rows,
  monthLabel,
  currency,
}: {
  rows: PrintPaymentRow[];
  monthLabel: string;
  currency: string;
}) {
```

Quita la función de nivel de módulo `function bs(n: number) { return \`Bs ${n.toFixed(2)}\`; }` (líneas 5-7) y, dentro del cuerpo de `handlePrint` (después de la línea 58, antes de su primer uso en la línea 65), agrega:

```ts
    const money = (n: number) => `${currency} ${n.toFixed(2)}`;
```

Reemplaza cada `bs(...)` por `money(...)` en las líneas 84, 101, 169, 170, 176, 179 (el nombre de la función local cambia de `bs` a `money`, la firma de llamada no cambia porque `currency` ya quedó cerrado sobre el closure).

- [ ] **Step 2: `components/mis-trabajos/PrintPdfButton.tsx`**

Agrega `currency: string` a la desestructuración de props y tipo de `PrintPdfButton` (líneas 18-28):

```ts
export function PrintPdfButton({
  rows,
  doctorName,
  from,
  to,
  currency,
}: {
  rows: CsvWorkRow[];
  doctorName: string;
  from: string;
  to: string;
  currency: string;
}) {
```

Quita la función de nivel de módulo `function bs(n: number) { return \`Bs ${n.toFixed(2)}\`; }` (líneas 6-8) y, dentro del cuerpo de `handlePrint` (después de la línea 29, antes de su primer uso en la línea 31), agrega:

```ts
    const money = (n: number) => `${currency} ${n.toFixed(2)}`;
```

Reemplaza cada `bs(...)` por `money(...)` en las líneas 63, 64, 145, 153, 159, 163.

- [ ] **Step 3: Verificar manualmente**

Run: `npm run dev`, en una clínica con moneda "S/" configurada, ir a `/pagos` y hacer clic en el botón de impresión de un pago — confirmar que el HTML impreso muestra "S/" en vez de "Bs". Repetir en `/mis-trabajos` con el botón de exportar PDF.

- [ ] **Step 4: Commit**

```bash
git add components/pagos/PrintPagosButton.tsx components/mis-trabajos/PrintPdfButton.tsx
git commit -m "feat(moneda): threading de currency en botones de impresion HTML"
```

---

### Task 9: Test de exportación PDF, verificación general y limpieza final

**Files:**
- Modify: `tests/mis-trabajos-export.test.ts`

**Interfaces:**
- Consumes: todo lo anterior — este task es la verificación final de que las 28 llamadas quedaron migradas.

- [ ] **Step 1: Actualizar el helper local `bsPdf` en el test**

En `tests/mis-trabajos-export.test.ts`, el helper local (línea 13-15, que replica la lógica de `PrintPdfButton.tsx` ANTES de este plan) es:

```ts
function bsPdf(n: number): string {
  return `Bs ${n.toFixed(2)}`;
}
```

Reemplázalo por (replicando la nueva forma con moneda configurable de `PrintPdfButton.tsx` tras Task 8):

```ts
function moneyPdf(n: number, currency: string): string {
  return `${currency} ${n.toFixed(2)}`;
}
```

Actualiza el describe `"bsPdf() — formato local del PDF"` (línea 97) y sus asserts:

```ts
describe("moneyPdf() — formato local del PDF", () => {
  it("dos decimales, moneda por defecto Bs", () => {
    expect(moneyPdf(150, "Bs")).toBe("Bs 150.00");
    expect(moneyPdf(0, "Bs")).toBe("Bs 0.00");
    expect(moneyPdf(1234.5, "Bs")).toBe("Bs 1234.50");
  });

  it("negativo (descuento o ajuste)", () => {
    expect(moneyPdf(-50, "Bs")).toBe("Bs -50.00");
  });

  it("usa el simbolo de moneda dado, no un valor fijo", () => {
    expect(moneyPdf(150, "S/")).toBe("S/ 150.00");
  });
});
```

(Mantén cualquier otro `it()` que ya existiera en ese describe además de "negativo" — solo agrégale el parámetro `"Bs"` a cada llamada `bsPdf(x)` existente y renómbrala a `moneyPdf(x, "Bs")`; no elimines casos de test previos.)

- [ ] **Step 2: Correr el test suite completo**

Run: `npx vitest run`
Expected: PASS en todos los archivos, incluyendo `tests/format.test.ts`, `tests/printSelectModal.test.tsx` y `tests/mis-trabajos-export.test.ts`.

- [ ] **Step 3: Verificación de tipos completa**

Run: `npx tsc --noEmit`
Expected: 0 errores. Si aparece algún error `Expected 2 arguments, but got 1` en un archivo no cubierto por las Tasks 5-8, significa que el grep original de este plan no lo detectó — localízalo, aplica la misma regla mecánica (agregar `currency` como segundo argumento a `money()`, threando la prop o variable `currency` desde el componente/página padre correspondiente) y vuelve a correr `tsc --noEmit` hasta que quede en 0 errores.

- [ ] **Step 4: Prueba manual end-to-end**

Run: `npm run dev`.
Checklist:
1. Menú lateral: "Ajustes" es la última opción, para cualquier rol.
2. En `/ajustes`, subir un logo de archivo (JPG o PNG) sin que exista ya el addon "logo" en el panel de superadmin de esa clínica (confirmar que el addon ya no aparece en absoluto en el panel de superadmin, `/superadmin` → clínica → Add-ons).
3. En `/ajustes`, cambiar la moneda a "S/ — Sol peruano" y guardar.
4. Ir a `/pagos`, confirmar que los montos muestran "S/" en vez de "Bs".
5. Generar un PDF de presupuesto de un plan de tratamiento y confirmar que muestra "S/".
6. Volver la moneda a "Bs" y confirmar que todo vuelve a mostrar "Bs" (sin caché obsoleta — si hace falta, recargar la página con hard refresh).

- [ ] **Step 5: Commit**

```bash
git add tests/mis-trabajos-export.test.ts
git commit -m "test(moneda): migrar bsPdf a moneyPdf con moneda configurable"
```

---

## Self-Review (hecho al escribir este plan)

**Cobertura del spec:**
1. "Ajustes" al final del menú → Task 1. ✅
2. Logo por archivo, retirar addon pago → Task 4. ✅
3. Moneda configurable: migración + `money()` + `getClinicCurrency()` → Task 2. Selector de UI → Task 3. Threading en los 28 sitios (server pages, print pages, API route, componentes cliente, botones de impresión HTML) → Tasks 5, 6, 7, 8. ✅
4. Testing: `tests/format.test.ts` → Task 2. `tests/mis-trabajos-export.test.ts` → Task 9. `initialFeaturesForPreset`/`normalizeFeatures` no tocados → confirmado, ningún task los modifica. Verificación general `tsc --noEmit` + `npm test` + prueba manual → Task 9. ✅
5. Fuera de alcance (conversión de cambio, locale numérico, campo libre, limpieza de `logo_url`) → ningún task lo implementa, consistente con el spec. ✅

**Hallazgos durante la investigación de código no explícitos en el spec, cubiertos igual:**
- `app/(dashboard)/ajustes/agent-info-actions.ts` usa `bs()` (no estaba en la lista de 28 archivos del spec, pero apareció en el grep) → cubierto en Task 6 Step 4.
- `components/caja/CashSessionPanel.tsx` no tiene ningún caller actual en el código — cubierto de todos modos en Task 7 Step 11 para que compile, sin threading de padre (no existe).
- `components/agenda/AgendaShell.tsx` y `app/(dashboard)/cuentas/page.tsx` no llaman `bs()` directamente pero son el eslabón que debe pasar `currency` a `ApptModal` y `PatientHistoryPanel` respectivamente — cubiertos en Task 5 Steps 7-8 y Task 7 Step 7.
