# Defaults de clínicas nuevas + confirmación al activar add-ons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las clínicas nuevas arrancan con un tope de 500 pacientes por defecto, y activar cualquier add-on (salvo `fotos`, que ya tiene su propio flujo) desde `/superadmin` pide confirmación explícita antes de aplicarse.

**Architecture:** Cambio puntual de un valor en el insert de `createClinic` (server action) + un `await confirm(...)` del diálogo imperativo ya existente del proyecto (`lib/confirm.ts` / `<ConfirmHost/>`) insertado en `AddonToggle.flip()`, gateado por `featureKey !== "fotos"`.

**Tech Stack:** Next.js App Router (server actions + client component), TypeScript.

**Spec:** `docs/superpowers/specs/2026-07-20-defaults-confirmacion-addons-design.md`

## Global Constraints

- Español neutro en toda la UI (sin voseo: "haz" no "hacé").
- **NUNCA hacer push sin autorización explícita del usuario** (commits locales sí).
- El tope de 500 pacientes solo aplica a clínicas creadas de ahora en adelante — no hay backfill para clínicas existentes.
- La confirmación al activar add-ons usa `confirm()` de `lib/confirm.ts` (el diálogo imperativo ya montado vía `<ConfirmHost/>` en `app/(dashboard)/layout.tsx`) — **nunca** `window.confirm`.
- La confirmación solo aplica a la sección ADD-ONS (`AddonToggle`), nunca a MÓDULOS (`FeatureToggle`), y solo al **activar** (`next === true`), nunca al desactivar.
- `fotos` NO pasa por `confirm()` — su prompt de cantidad (ya implementado) cumple ese rol.
- Los tests corren con `npm test` (vitest); typecheck con `npx tsc --noEmit`. No hay lógica pura nueva que amerite un test unitario — se verifica con typecheck + prueba manual, siguiendo la convención ya usada para el resto de `superadmin/actions.ts`.

## Datos del código existente que necesitas saber

- `app/(dashboard)/superadmin/actions.ts` — `createClinic` (líneas 24-48): el insert a `clinics` está en la línea ~41: `.insert({ name: clinicName, plan, features: { whatsapp: whatsappAddon } })`.
- `components/superadmin/AddonToggle.tsx` — ya fue modificado hoy mismo para pedir la cantidad de fotos vía `window.prompt` al activar `fotos` (líneas 27-56). Esa lógica NO se toca; se le agrega un paso adicional para el resto de los add-ons.
- `lib/confirm.ts` — `confirm(options: { title?, message, confirmText?, cancelText?, tone?: "danger" | "default" }): Promise<boolean>`. Convención de uso en todo el proyecto: `const ok = await confirm({...}); if (!ok) return;` (ver `components/patients/DeletePatientButton.tsx:21` como ejemplo mínimo).
- `<ConfirmHost/>` ya está montado globalmente en `app/(dashboard)/layout.tsx` — no hace falta montarlo ni importarlo en `AddonToggle.tsx`, solo usar `confirm()`.

---

### Task 1: Tope de 500 pacientes en clínicas nuevas

**Files:**
- Modify: `app/(dashboard)/superadmin/actions.ts:41` (dentro de `createClinic`)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada consumido por otras tareas de este plan (independiente de la Task 2).

- [ ] **Step 1: Agregar `max_patients: 500` al insert**

En `app/(dashboard)/superadmin/actions.ts`, dentro de `createClinic`, reemplazar:

```typescript
  const { data: clinic, error: clinicErr } = await admin
    .from("clinics")
    .insert({ name: clinicName, plan, features: { whatsapp: whatsappAddon } })
    .select("id")
    .single();
```

por:

```typescript
  const { data: clinic, error: clinicErr } = await admin
    .from("clinics")
    // Tope de pacientes por defecto para clínicas nuevas (editable después
    // desde el badge de MaxPatientsInput). Las clínicas existentes no se
    // tocan — esto solo aplica hacia adelante, al momento de creación.
    .insert({ name: clinicName, plan, features: { whatsapp: whatsappAddon }, max_patients: 500 })
    .select("id")
    .single();
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Prueba manual**

Con el stack local corriendo (`npx supabase start` si hace falta) y sesión de superadmin: crear una clínica nueva desde `/superadmin` → "+ Crear clínica". Verificar en la tarjeta de la clínica recién creada que el badge de pacientes muestra "0 / 500 pacientes" (no "0 pacientes" sin tope).

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/superadmin/actions.ts"
git commit -m "feat(superadmin): tope de 500 pacientes por defecto en clinicas nuevas"
```

---

### Task 2: Confirmación al activar un add-on (excepto fotos)

**Files:**
- Modify: `components/superadmin/AddonToggle.tsx`

**Interfaces:**
- Consumes: `confirm(options): Promise<boolean>` de `@/lib/confirm` (ya existe, no se crea nada nuevo).
- Produces: nada consumido por otras tareas de este plan.

- [ ] **Step 1: Importar `confirm`**

En `components/superadmin/AddonToggle.tsx`, agregar al bloque de imports (después de la línea 4, `import { toggleFeature } from "@/app/(dashboard)/superadmin/actions";`):

```typescript
import { confirm } from "@/lib/confirm";
```

- [ ] **Step 2: Hacer `flip` async y agregar el paso de confirmación**

Reemplazar la función `flip` completa (líneas 27-56) por:

```typescript
  async function flip() {
    const next = !optimisticEnabled;

    // Al activar el addon de fotos, se pregunta el cupo en el momento en vez
    // de dejarlo en el default hasta que alguien lo edite aparte. Ese prompt
    // ya cumple el rol de "¿estás seguro?" para fotos — no se le suma un
    // segundo diálogo.
    let fotosMax: number | null = null;
    if (featureKey === "fotos" && next) {
      const input = window.prompt(
        "¿Cuántas fotos incluye este plan?",
        String(FOTOS_DEFAULT_QUOTA),
      );
      if (input === null) return; // canceló: no se activa el addon
      const n = Number(input);
      if (!Number.isInteger(n) || n <= 0) {
        window.alert("Número inválido. El addon no se activó.");
        return;
      }
      fotosMax = n;
    } else if (next) {
      // Resto de los add-ons: confirmación explícita al activar, para que
      // no se "escape de las manos" un clic accidental. Desactivar sigue
      // siendo instantáneo (reversible, bajo riesgo).
      const ok = await confirm({
        title: "Activar add-on",
        message: `¿Activar "${label}" para esta clínica?`,
        confirmText: "Activar",
        cancelText: "Cancelar",
        tone: "default",
      });
      if (!ok) return;
    }

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
```

- [ ] **Step 3: Actualizar el `onClick` del botón**

En el JSX del componente (línea ~63), `onClick={flip}` ya funciona sin cambios: React acepta un handler async en `onClick` (la promesa se ignora, no hay warning). No hace falta tocar el `<button>`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Prueba manual**

Con el stack local corriendo y sesión de superadmin en `/superadmin`:
1. Click para activar un add-on que NO sea "Fotos de pacientes" (ej. "WhatsApp Manual"): debe aparecer el diálogo de confirmación con el mensaje `¿Activar "WhatsApp Manual" para esta clínica?`. Cancelar: el addon NO se activa (el botón vuelve a su estado apagado). Confirmar: el addon se activa normalmente.
2. Click para desactivar un add-on ya activo: debe desactivarse al instante, sin diálogo.
3. Click para activar "Fotos de pacientes": debe seguir mostrando el `window.prompt` de cantidad (comportamiento de hoy, sin cambios), sin el diálogo de `confirm()` adicional.

- [ ] **Step 6: Commit**

```bash
git add components/superadmin/AddonToggle.tsx
git commit -m "feat(superadmin): confirmacion al activar add-ons (excepto fotos)"
```

---

### Task 3: Verificación final

**Files:**
- Ninguno nuevo (verificación).

- [ ] **Step 1: Suite completa y typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: todo verde, sin regresiones.

- [ ] **Step 2: Commit final si hubo ajustes**

```bash
git add -A
git commit -m "test: verificacion final defaults y confirmacion add-ons"
```
