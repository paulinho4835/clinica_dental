# Pulido pre-lanzamiento + add-ons agrupados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar seis arreglos de pulido pre-lanzamiento, todos mecánicos y de bajo riesgo: eliminar diálogos nativos del navegador, íconos faltantes del menú, dark mode consistente en superadmin, clínicas nuevas en preset "Consultorio", el modal de cupo de fotos, y agrupar la sección ADD-ONS por categoría.

**Architecture:** Cambios localizados en componentes de cliente + una server action + una constante de datos y un helper puro en `lib/features.ts`. Se reutiliza infraestructura ya existente: `confirm()`/`ConfirmHost`, `Modal`, `toast`, `MODULE_PRESETS`. No se introduce ninguna dependencia nueva.

**Tech Stack:** Next.js App Router (client components + server action), TypeScript, Tailwind, Vitest.

**Specs:**
- `docs/superpowers/specs/2026-07-20-pulido-pre-lanzamiento-design.md` (Tasks 1-5)
- `docs/superpowers/specs/2026-07-20-superadmin-addons-agrupados-design.md` (Task 6)

## Global Constraints

- Español neutro en toda la UI (sin voseo: "haz" no "hacé").
- **NUNCA hacer push sin autorización explícita del usuario** (commits locales sí).
- Nunca usar `window.confirm` / `window.prompt` / `window.alert`: usar `confirm()` de `lib/confirm.ts`, el `Modal` de `components/ui/Modal.tsx`, y `toast` de `lib/toast`.
- No tocar nada listado como "Fuera de alcance" en los specs — en particular NO unificar el color de `FeatureToggle` (bg-clinic) vs `AddonToggle` (bg-green-500); NO migrar el panel de superadmin a los componentes de `components/ui/`; NO pestañas ni rediseños estructurales.
- El add-on de fotos se activa SOLO tras confirmar un número entero > 0; cancelar deja el add-on apagado. El resto de add-ons pasa por `confirm()` (ya implementado, no cambia).
- Clínicas nuevas nacen con preset "Consultorio" por defecto; las existentes no se tocan.
- Tests con `npm test` (vitest); typecheck con `npx tsc --noEmit`. Solo el helper puro del preset (Task 5) amerita test unitario nuevo; el resto se verifica con typecheck + prueba manual, siguiendo la convención del repo.

## Datos del código existente que necesitas saber

- `lib/confirm.ts` — `confirm({ title?, message, confirmText?, cancelText?, tone?: "danger" | "default" }): Promise<boolean>`. `<ConfirmHost/>` ya montado en `app/(dashboard)/layout.tsx`. Uso típico: `if (!(await confirm({...}))) return;`.
- `lib/toast.ts` — `toast(message: string, type?: "success" | "error" | ...): void`.
- `components/ui/Modal.tsx` — `<Modal open onClose title? subtitle? size? >children</Modal>`. Cierra con Escape; el click en el fondo NO cierra. Client component (usa portal).
- `lib/features.ts` — `MODULE_KEYS`, `MODULE_PRESETS` (`consultorio`/`clinica`), `ModulePreset`, `MODULE_PRESET_LABELS`, `FeatureKey`, `FOTOS_DEFAULT_QUOTA`. `normalizeFeatures` trata claves no-optIn ausentes como ENCENDIDAS (por eso una clínica nueva sin `features` explícito nace "Clínica completa").
- `app/(dashboard)/superadmin/actions.ts` — `createClinic` (insert en línea ~41-48, hoy `{ name, plan, features: { whatsapp }, max_patients: 500 }`), `toggleFeature`, `applyModulePreset` (línea 225, patrón de armado de `features` por preset).
- `components/superadmin/AddonToggle.tsx` — client component; `flip()` async; hoy usa `window.prompt`/`window.alert` para `fotos` (líneas 34-44).
- `components/superadmin/ClinicList.tsx` — render de add-ons en línea ~236 (`addons.map(...)`); badge "Suspendida" (`bg-amber-100 text-amber-700`, sin `dark:`) y `ring-amber-300` de tarjeta suspendida (línea ~142, ~168).
- `components/Sidebar.tsx` — mapa `ICONS` (línea ~31); faltan `/tratamientos`, `/campanas`, `/disponibilidad`.

---

### Task 1: Reemplazar diálogos nativos en los 3 paneles de cliente

**Files:**
- Modify: `components/patients/EvolutionPanel.tsx`
- Modify: `components/treatments/TreatmentPlanPanel.tsx`
- Modify: `components/treatments/TreatmentCatalog.tsx`

**Interfaces:**
- Consumes: `confirm()` de `@/lib/confirm`, `toast` de `@/lib/toast` (ambos ya existen).
- Produces: nada para otras tareas.

- [ ] **Step 1: `EvolutionPanel.tsx` — importar `confirm` y hacer `handleDelete` async**

Agregar al bloque de imports (junto a `import { toast } from "@/lib/toast";`, línea ~15):

```typescript
import { confirm } from "@/lib/confirm";
```

Reemplazar `handleDelete` (líneas ~70-77):

```typescript
  async function handleDelete(noteId: string) {
    const ok = await confirm({
      title: "Borrar nota",
      message: "¿Borrar esta nota de evolución? No se puede deshacer.",
      confirmText: "Borrar",
      cancelText: "Cancelar",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => {
      const res = await deleteEvolutionNote(noteId, patientId);
      if (res.error) toast(res.error, "error");
      else { router.refresh(); toast("Nota borrada", "success"); }
    });
  }
```

- [ ] **Step 2: `TreatmentPlanPanel.tsx` — importar `confirm` y `toast`, mover la confirmación fuera de la transición**

Agregar al bloque de imports (después de `import { bs, fmtBoliviaDateTime } from "@/lib/format";`):

```typescript
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/toast";
```

Reemplazar el `<button ... onClick={...}>` de eliminar trabajo (líneas ~115-129) por:

```tsx
          <button
            disabled={pending}
            onClick={async () => {
              const ok = await confirm({
                title: "Eliminar trabajo",
                message: "¿Eliminar este trabajo?",
                confirmText: "Eliminar",
                cancelText: "Cancelar",
                tone: "danger",
              });
              if (!ok) return;
              start(async () => {
                const res = await deleteWork(work.id, patientId);
                if (res.error) toast(res.error, "error");
                else router.refresh();
              });
            }}
            className="text-slate-300 hover:text-red-500"
            title="Eliminar"
          >
            ✕
          </button>
```

- [ ] **Step 3: `TreatmentCatalog.tsx` — importar `confirm` y hacer `handleDeactivate` async**

Agregar al bloque de imports (junto a `import { toast } from "@/lib/toast";`):

```typescript
import { confirm } from "@/lib/confirm";
```

Reemplazar `handleDeactivate` (líneas ~135-147):

```typescript
  async function handleDeactivate() {
    const ok = await confirm({
      title: "Desactivar tratamiento",
      message: `¿Desactivar "${item.name}"? Dejará de aparecer en el catálogo y al agregar trabajos.`,
      confirmText: "Desactivar",
      cancelText: "Cancelar",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => {
      const res = await deactivateTreatment(item.id);
      if (res.error) toast(res.error, "error");
      else {
        router.refresh();
        toast("Tratamiento desactivado", "success");
      }
    });
  }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add components/patients/EvolutionPanel.tsx components/treatments/TreatmentPlanPanel.tsx components/treatments/TreatmentCatalog.tsx
git commit -m "fix(ux): reemplazar dialogos nativos por el modal de confirmacion propio"
```

---

### Task 2: Modal para el cupo de fotos en `AddonToggle`

**Files:**
- Modify: `components/superadmin/AddonToggle.tsx`

**Interfaces:**
- Consumes: `Modal` de `@/components/ui/Modal`, `confirm()` de `@/lib/confirm` (ya importado), `FOTOS_DEFAULT_QUOTA` (ya importado).
- Produces: nada para otras tareas.

- [ ] **Step 1: Reescribir `AddonToggle` con estado de modal**

Reemplazar el contenido completo de `components/superadmin/AddonToggle.tsx` por:

```tsx
"use client";

import { useOptimistic, useState, useTransition } from "react";
import { toggleFeature } from "@/app/(dashboard)/superadmin/actions";
import { FOTOS_DEFAULT_QUOTA, type FeatureKey } from "@/lib/features";
import { confirm } from "@/lib/confirm";
import { Modal } from "@/components/ui/Modal";

const ICONS: Partial<Record<FeatureKey, string>> = {
  whatsapp: "💬",
  recetas: "📄",
  consentimientos: "📝",
};

export function AddonToggle({
  clinicId,
  featureKey,
  label,
  enabled,
}: {
  clinicId: string;
  featureKey: FeatureKey;
  label: string;
  enabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [optimisticEnabled, setOptimistic] = useOptimistic(enabled);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [photoInput, setPhotoInput] = useState(String(FOTOS_DEFAULT_QUOTA));
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Aplica el cambio (activar/desactivar) enviando el toggle al servidor.
  // fotosMax solo se manda al activar fotos con un cupo elegido.
  function apply(next: boolean, fotosMax: number | null) {
    startTransition(async () => {
      setOptimistic(next);
      const fd = new FormData();
      fd.set("clinicId", clinicId);
      fd.set("key", featureKey);
      fd.set("enabled", String(next));
      if (fotosMax !== null) fd.set("fotosMax", String(fotosMax));
      await toggleFeature(fd);
    });
  }

  async function flip() {
    const next = !optimisticEnabled;

    // Desactivar: instantáneo, sin fricción.
    if (!next) {
      apply(false, null);
      return;
    }

    // Activar fotos: modal con input de cupo (reemplaza window.prompt).
    if (featureKey === "fotos") {
      setPhotoInput(String(FOTOS_DEFAULT_QUOTA));
      setPhotoError(null);
      setPhotoModalOpen(true);
      return;
    }

    // Resto de add-ons: confirmación explícita al activar.
    const ok = await confirm({
      title: "Activar add-on",
      message: `¿Activar "${label}" para esta clínica?`,
      confirmText: "Activar",
      cancelText: "Cancelar",
      tone: "default",
    });
    if (ok) apply(true, null);
  }

  function confirmPhotos() {
    const n = Number(photoInput);
    if (!Number.isInteger(n) || n <= 0) {
      setPhotoError("Ingresa un número entero mayor a 0.");
      return;
    }
    setPhotoModalOpen(false);
    apply(true, n);
  }

  const icon = ICONS[featureKey];

  return (
    <>
      <button
        type="button"
        onClick={flip}
        disabled={pending}
        title={
          optimisticEnabled
            ? "Add-on activo — clic para desactivar"
            : "Add-on inactivo — clic para activar"
        }
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition-all disabled:cursor-wait disabled:opacity-60 ${
          optimisticEnabled
            ? "bg-green-500 text-white ring-green-600 hover:bg-green-600"
            : "bg-slate-100 text-slate-500 ring-slate-300 hover:bg-slate-200"
        }`}
      >
        {pending ? (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <span aria-hidden>{optimisticEnabled ? "✓" : "○"}</span>
        )}
        {icon && <span aria-hidden>{icon}</span>}
        {label}
      </button>

      <Modal
        open={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
        title="Cupo de fotos"
        subtitle="¿Cuántas fotos incluye este plan para la clínica?"
        size="sm"
      >
        <div className="space-y-3">
          <input
            type="number"
            min="1"
            value={photoInput}
            autoFocus
            onChange={(e) => {
              setPhotoInput(e.target.value);
              setPhotoError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmPhotos();
            }}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
          {photoError && <p className="text-sm text-red-600">{photoError}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPhotoModalOpen(false)}
              className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmPhotos}
              className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg"
            >
              Activar
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Prueba manual**

Stack local + superadmin en `/superadmin`, tarjeta de clínica expandida:
1. Click en "Fotos de pacientes" (apagado): abre el `Modal` con input (default 2000), NO el prompt del navegador. Escribir un número inválido (0, vacío, decimal) → muestra el error inline y no activa. Escribir 1500 y "Activar" (o Enter) → se activa y el badge de fotos existente muestra el cupo.
2. Cancelar el modal → el add-on queda apagado.
3. Desactivar fotos ya activo → instantáneo, sin modal.

- [ ] **Step 4: Commit**

```bash
git add components/superadmin/AddonToggle.tsx
git commit -m "fix(superadmin): modal estilizado para el cupo de fotos (reemplaza window.prompt)"
```

---

### Task 3: Íconos faltantes en el menú lateral

**Files:**
- Modify: `components/Sidebar.tsx`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada para otras tareas.

- [ ] **Step 1: Agregar los íconos al import de `lucide-react`**

En `components/Sidebar.tsx`, agregar al bloque de import de `lucide-react` (líneas ~5-20) los tres íconos nuevos: `Layers`, `Megaphone`, `CalendarClock`.

- [ ] **Step 2: Agregar las entradas al mapa `ICONS`**

En el objeto `ICONS` (línea ~31), agregar:

```typescript
  "/tratamientos": Layers,
  "/campanas": Megaphone,
  "/disponibilidad": CalendarClock,
```

- [ ] **Step 3: Verificar que no queden rutas sin ícono**

Run: `npx tsc --noEmit`
Expected: sin errores.

Además, revisar visualmente `lib/features.ts` (`FEATURES[].href`) contra el objeto `ICONS`: toda ruta que aparezca en el menú debe tener entrada. Si aparece alguna otra ruta sin ícono además de las tres agregadas, agregarle un ícono Lucide sensato también (no dejar ninguna cayendo al fallback `<span>•</span>`).

- [ ] **Step 4: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "fix(nav): iconos para tratamientos, campanas y disponibilidad en el menu"
```

---

### Task 4: Dark mode consistente en el panel de superadmin

**Files:**
- Modify: `app/(dashboard)/superadmin/page.tsx`
- Modify: `components/superadmin/ClinicList.tsx`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada para otras tareas.

- [ ] **Step 1: `page.tsx` — dark en el stat "Usuarios"**

En el array `stats` (línea ~199-203), cambiar el tono del stat "Usuarios":

```typescript
    { label: "Usuarios", value: totalUsers, icon: Users, tone: "text-slate-600 bg-slate-100 dark:bg-slate-500/10" },
```

- [ ] **Step 2: `ClinicList.tsx` — dark en el badge "Suspendida" y el ring de tarjeta suspendida**

El `ring-amber-300` de la tarjeta suspendida (línea ~142):

```tsx
        c.active ? "ring-slate-200" : "ring-amber-300 dark:ring-amber-500/40"
```

El badge "Suspendida" (línea ~165-168):

```tsx
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                  Suspendida
                </span>
```

- [ ] **Step 3: Barrido de pasteles restantes**

Revisar `app/(dashboard)/superadmin/page.tsx` y `components/superadmin/ClinicList.tsx` completos buscando clases pastel (`bg-{color}-50`, `bg-{color}-100`, `text-{color}-600/700`, `ring-{color}-200/300` para `red|amber|emerald|green|sky|slate`) que NO tengan su `dark:` correspondiente mientras un vecino equivalente sí lo tiene. Agregar el `dark:` faltante siguiendo el mismo patrón (`dark:bg-…-500/10`, `dark:text-…-300`). No inventar colores nuevos ni tocar clases que ya inviertan bien (los `white`/`slate` base ya invierten por variables CSS — solo los pasteles necesitan override).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Prueba manual**

Con dark mode activado (toggle del sidebar), abrir `/superadmin`: el stat "Usuarios" y el badge "Suspendida" (suspender una clínica de prueba) deben verse coherentes con sus vecinos, sin bloques de color claro que "salten" sobre el fondo oscuro.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/superadmin/page.tsx" components/superadmin/ClinicList.tsx
git commit -m "fix(superadmin): dark mode consistente en stats y badges pastel"
```

---

### Task 5: Clínicas nuevas nacen con preset "Consultorio"

**Files:**
- Modify: `lib/features.ts` (nuevo helper puro `initialFeaturesForPreset`)
- Test: `tests/features-preset.test.ts` (nuevo)
- Modify: `app/(dashboard)/superadmin/actions.ts` (`createClinic`)
- Modify: `components/superadmin/NewClinicForm.tsx`

**Interfaces:**
- Consumes: `MODULE_KEYS`, `MODULE_PRESETS`, `ModulePreset` (ya existen en `lib/features.ts`).
- Produces: `initialFeaturesForPreset(preset: ModulePreset, opts: { whatsapp: boolean }): Record<string, boolean>` — usada por `createClinic`.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/features-preset.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { initialFeaturesForPreset, MODULE_KEYS } from "@/lib/features";

describe("initialFeaturesForPreset", () => {
  it("consultorio apaga inventario/caja/cuentas/auditoria y deja lo esencial", () => {
    const f = initialFeaturesForPreset("consultorio", { whatsapp: false });
    expect(f.agenda).toBe(true);
    expect(f.pacientes).toBe(true);
    expect(f.mis_trabajos).toBe(true);
    expect(f.tratamientos).toBe(true);
    expect(f.inventario).toBe(false);
    expect(f.caja).toBe(false);
    expect(f.cuentas).toBe(false);
    expect(f.auditoria).toBe(false);
  });

  it("clinica enciende todos los modulos", () => {
    const f = initialFeaturesForPreset("clinica", { whatsapp: false });
    for (const k of MODULE_KEYS) expect(f[k]).toBe(true);
  });

  it("propaga el flag de whatsapp", () => {
    expect(initialFeaturesForPreset("consultorio", { whatsapp: true }).whatsapp).toBe(true);
    expect(initialFeaturesForPreset("clinica", { whatsapp: false }).whatsapp).toBe(false);
  });

  it("define explícitamente cada MODULE_KEY (no depende de defaults por ausencia)", () => {
    const f = initialFeaturesForPreset("consultorio", { whatsapp: false });
    for (const k of MODULE_KEYS) expect(k in f).toBe(true);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -- tests/features-preset.test.ts`
Expected: FAIL — `initialFeaturesForPreset is not a function` (no exportada aún).

- [ ] **Step 3: Implementar el helper en `lib/features.ts`**

Agregar después de `MODULE_PRESETS` (y antes o después de `detectModulePreset`, dejándolo intacto):

```typescript
// Construye el objeto `features` inicial de una clínica nueva según su preset
// de módulos. Define EXPLÍCITAMENTE cada MODULE_KEY (true/false) para no
// depender de que normalizeFeatures asuma "encendido por ausencia" — así una
// clínica "consultorio" nace realmente sin inventario/caja/cuentas/auditoría.
// Los add-ons opt-in no se incluyen: nacen apagados por su propia lógica.
export function initialFeaturesForPreset(
  preset: ModulePreset,
  opts: { whatsapp: boolean },
): Record<string, boolean> {
  const on = new Set(MODULE_PRESETS[preset]);
  const features: Record<string, boolean> = {};
  for (const key of MODULE_KEYS) features[key] = on.has(key);
  features.whatsapp = opts.whatsapp;
  return features;
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm test -- tests/features-preset.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Usar el helper en `createClinic`**

En `app/(dashboard)/superadmin/actions.ts`, `createClinic`:

El archivo ya importa de `@/lib/features` en la línea 8: `import { FEATURES, MODULE_KEYS, MODULE_PRESETS, type FeatureKey, type ModulePreset } from "@/lib/features";`. Solo falta agregar `initialFeaturesForPreset` a esa lista:

```typescript
import { FEATURES, MODULE_KEYS, MODULE_PRESETS, initialFeaturesForPreset, type FeatureKey, type ModulePreset } from "@/lib/features";
```

Después de `const whatsappAddon = formData.get("whatsapp_addon") === "true";` (línea ~36), leer el preset del form (default "consultorio"):

```typescript
  const presetRaw = String(formData.get("preset") ?? "consultorio");
  const preset: ModulePreset = presetRaw in MODULE_PRESETS ? (presetRaw as ModulePreset) : "consultorio";
```

Reemplazar el insert (líneas ~40-48) para usar el `features` derivado del preset:

```typescript
  const { data: clinic, error: clinicErr } = await admin
    .from("clinics")
    // Tope de pacientes por defecto para clínicas nuevas (editable después
    // desde el badge de MaxPatientsInput). Las clínicas existentes no se
    // tocan — esto solo aplica hacia adelante, al momento de creación.
    .insert({
      name: clinicName,
      plan,
      features: initialFeaturesForPreset(preset, { whatsapp: whatsappAddon }),
      max_patients: 500,
    })
    .select("id")
    .single();
```

- [ ] **Step 6: Selector de preset en `NewClinicForm.tsx`**

En `components/superadmin/NewClinicForm.tsx`, agregar un `<select name="preset">` en el grid del formulario (junto al de "Plan", dentro del mismo `<div className="grid ...">`), con "Consultorio" por defecto:

```tsx
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Tipo de clínica</span>
          <select
            name="preset"
            defaultValue="consultorio"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          >
            <option value="consultorio">Consultorio (solo lo esencial)</option>
            <option value="clinica">Clínica completa (todos los módulos)</option>
          </select>
        </label>
```

- [ ] **Step 7: Typecheck + suite**

Run: `npx tsc --noEmit && npm test`
Expected: verde.

- [ ] **Step 8: Prueba manual**

Stack local + superadmin: crear una clínica nueva dejando "Consultorio" (default). En su tarjeta expandida, la sección MÓDULOS debe mostrar Inventario / Dashboard / Cuentas de pacientes / Auditoría APAGADOS y Agenda / Pacientes / Mis trabajos / Tratamientos encendidos. Crear otra eligiendo "Clínica completa" → todos los módulos encendidos.

- [ ] **Step 9: Commit**

```bash
git add lib/features.ts tests/features-preset.test.ts "app/(dashboard)/superadmin/actions.ts" components/superadmin/NewClinicForm.tsx
git commit -m "feat(superadmin): clinicas nuevas nacen con preset Consultorio por defecto"
```

---

### Task 6: Agrupar la sección ADD-ONS por categoría

**Files:**
- Modify: `lib/features.ts` (nueva constante `ADDON_GROUPS`)
- Modify: `components/superadmin/ClinicList.tsx` (render de add-ons)

**Interfaces:**
- Consumes: `FeatureKey` (ya existe), la prop `addons: FeatureItem[]` que `ClinicList` ya recibe (cada item `{ key, label }`).
- Produces: `ADDON_GROUPS: { label: string; keys: FeatureKey[] }[]`.

Spec: `docs/superpowers/specs/2026-07-20-superadmin-addons-agrupados-design.md`.

- [ ] **Step 1: Definir `ADDON_GROUPS` en `lib/features.ts`**

Agregar (después de `FEATURES`, cerca de los otros helpers de features):

```typescript
// Agrupación temática de la sección ADD-ONS del panel de superadmin (solo
// presentación: no cambia ninguna lógica de features). Cubre exactamente los
// FeatureKey con optIn:true. Si se agrega un add-on nuevo a FEATURES hay que
// sumarlo a algún grupo aquí, o no se mostrará en el panel (ver console.warn
// en ClinicList).
export const ADDON_GROUPS: { label: string; keys: FeatureKey[] }[] = [
  { label: "💬 Comunicación", keys: ["whatsapp_manual", "wa_masivo", "campanas", "aviso_doctores", "recordatorios"] },
  { label: "🤖 Agente de IA", keys: ["agente_ia", "agente_ia_t2", "agente_ia_t3", "agente_ia_info"] },
  { label: "🦷 Ficha clínica y documentos", keys: ["recetas", "consentimientos", "fotos", "fotos_contador", "periodontograma", "odontograma_pediatrico", "logo"] },
  { label: "⚙️ Administración", keys: ["inicio", "pagos", "bloqueo_horario", "perfil", "disponibilidad", "calificaciones"] },
];
```

- [ ] **Step 2: Render agrupado en `ClinicList.tsx`**

Importar `ADDON_GROUPS` (junto al import existente de `@/lib/features` en `ClinicList.tsx`):

```typescript
import { detectModulePreset, ADDON_GROUPS, type Features, type FeatureKey } from "@/lib/features";
```

(Ajustar a lo que el archivo ya importe de `@/lib/features` — agregar solo `ADDON_GROUPS` si el resto ya está.)

Reemplazar el bloque de render de add-ons (el `<div className="flex flex-wrap items-center gap-2">{addons.map(...)}</div>`, líneas ~235-244) por un loop sobre grupos. Antes del `return` del componente `ClinicCard`, construir un mapa `key → label` desde la prop `addons` para no recalcular labels:

```tsx
            {/* Add-ons agrupados por categoría */}
            {(() => {
              const labelByKey = new Map(addons.map((a) => [a.key, a.label]));
              // Aviso en desarrollo si algún add-on quedó fuera de ADDON_GROUPS
              // (se agregó a FEATURES pero no a un grupo → invisible en el panel).
              if (process.env.NODE_ENV !== "production") {
                const grouped = new Set(ADDON_GROUPS.flatMap((g) => g.keys));
                const missing = addons.filter((a) => !grouped.has(a.key));
                if (missing.length > 0) {
                  console.warn("Add-ons sin grupo en ADDON_GROUPS:", missing.map((a) => a.key));
                }
              }
              return ADDON_GROUPS.map((group) => (
                <div key={group.label} className="space-y-1.5">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {group.label}
                  </h4>
                  <div className="flex flex-wrap items-center gap-2">
                    {group.keys.map((key) => {
                      const label = labelByKey.get(key);
                      if (!label) return null;
                      return (
                        <AddonToggle
                          key={key}
                          clinicId={c.id}
                          featureKey={key}
                          label={label}
                          enabled={c.features[key]}
                        />
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
```

Envolver los grupos en un contenedor con separación vertical: cambiar el `<h3>Add-ons</h3>` existente y su `<div>` para que el contenedor sea `space-y-3`. Es decir, el bloque queda:

```tsx
          {/* Add-ons opcionales */}
          <div className="border-t border-slate-100 pt-4">
            <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Add-ons
            </h3>
            <div className="space-y-3">
              {/* ← el IIFE del paso anterior va aquí */}
            </div>
          </div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Prueba manual**

Stack local + superadmin, tarjeta de clínica expandida: la sección ADD-ONS ahora muestra 4 subgrupos con encabezado (💬 Comunicación, 🤖 Agente de IA, 🦷 Ficha clínica y documentos, ⚙️ Administración). Contar que aparezcan los 22 add-ons, cada uno en su grupo, sin duplicados ni faltantes. La consola del navegador NO debe mostrar el warning de "add-ons sin grupo". Activar/desactivar sigue funcionando igual (incluido el modal de fotos de la Task 2).

- [ ] **Step 5: Commit**

```bash
git add lib/features.ts components/superadmin/ClinicList.tsx
git commit -m "feat(superadmin): agrupar la seccion add-ons por categoria"
```

---

### Task 7: Verificación final

**Files:**
- Ninguno nuevo (verificación).

- [ ] **Step 1: Suite completa y typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: todo verde (incluido el nuevo `tests/features-preset.test.ts`), sin regresiones.

- [ ] **Step 2: Commit final si hubo ajustes**

```bash
git add -A
git commit -m "test: verificacion final del pulido pre-lanzamiento"
```
