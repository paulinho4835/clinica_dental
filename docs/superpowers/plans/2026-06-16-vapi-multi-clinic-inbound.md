# Vapi Multi-Clínica Inbound — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que cada clínica tenga su propio número Vapi con voz y saludo personalizados, configurables desde el panel superadmin.

**Architecture:** Se extiende el JSONB `clinics.settings` con 3 nuevas claves (`vapi_phone_number_id`, `vapi_voice_id`, `vapi_first_message`). El webhook ya rutea por `phone_number_id`; solo hay que enriquecer el builder del asistente y agregar la UI de configuración en el panel superadmin.

**Tech Stack:** Next.js App Router, Supabase (admin client), TypeScript, Tailwind CSS, `useTransition` para feedback optimista.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---------|--------|----------------|
| `lib/vapi.ts` | Modificar | Agregar tipo `VapiClinicConfig`, actualizar firma de `buildInboundAssistant()` |
| `app/api/vapi/webhook/route.ts` | Modificar | Fetch `settings` junto con `name`, pasar config al builder |
| `app/(dashboard)/superadmin/page.tsx` | Modificar | Incluir `settings` en query de clínicas y en `ClinicRow` |
| `app/(dashboard)/superadmin/actions.ts` | Modificar | Agregar server action `updateClinicVapiConfig` |
| `components/superadmin/ClinicList.tsx` | Modificar | Agregar `settings` a `ClinicRow`, renderizar `VapiConfigForm` en `ClinicCard` |
| `components/superadmin/VapiConfigForm.tsx` | Crear | Formulario client component para config Vapi por clínica |

---

## Task 1: Tipo `VapiClinicConfig` y actualización de `buildInboundAssistant()`

**Files:**
- Modify: `lib/vapi.ts`

- [ ] **Paso 1: Agregar el tipo y actualizar la firma**

En `lib/vapi.ts`, justo antes de la función `buildInboundAssistant`, agregar el tipo e insertar el parámetro `config`:

```typescript
// Agregar este tipo ANTES de buildInboundAssistant (línea ~163)
export type VapiClinicConfig = {
  vapi_phone_number_id?: string;
  vapi_voice_id?: string;
  vapi_first_message?: string;
};

// Reemplazar la firma actual:
// export function buildInboundAssistant(clinicName: string, todayISO?: string)
// Por esta:
export function buildInboundAssistant(
  clinicName: string,
  config: Pick<VapiClinicConfig, "vapi_voice_id" | "vapi_first_message"> = {},
  todayISO?: string,
) {
  const today = todayISO ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });
  return {
    model: {
      // ... (todo igual que hoy, sin cambios)
    },
    voice: {
      provider: "11labs",
      voiceId: config.vapi_voice_id ?? "paula",
    },
    firstMessage:
      config.vapi_first_message ??
      `Hola, gracias por llamar a ${clinicName}. ¿En qué puedo ayudarle?`,
  };
}
```

El interior del `model` (system prompt, tools) no cambia — solo cambian `voice.voiceId` y `firstMessage`.

- [ ] **Paso 2: Verificar tipos**

```powershell
npx tsc --noEmit
```

Esperado: sin errores. Si hay error en el caller del webhook (paso siguiente), es normal — se corrige en Task 2.

- [ ] **Paso 3: Commit**

```powershell
git add lib/vapi.ts
git commit -m "feat(vapi): tipo VapiClinicConfig y config por clínica en buildInboundAssistant"
```

---

## Task 2: Webhook — fetch `settings` y pasar config al builder

**Files:**
- Modify: `app/api/vapi/webhook/route.ts`

- [ ] **Paso 1: Importar el tipo**

Al inicio de `app/api/vapi/webhook/route.ts`, agregar `VapiClinicConfig` al import de vapi:

```typescript
import { buildInboundAssistant, VapiClinicConfig } from "@/lib/vapi";
```

- [ ] **Paso 2: Extender el query en el handler `assistant-request`**

Ubicar el bloque (línea ~43):
```typescript
const { data: clinic } = await admin
  .from("clinics")
  .select("name")
  .eq("id", clinicId)
  .single();
```

Reemplazarlo por:
```typescript
const { data: clinic } = await admin
  .from("clinics")
  .select("name, settings")
  .eq("id", clinicId)
  .single();

const vapiConfig = ((clinic?.settings ?? {}) as Record<string, unknown>) as VapiClinicConfig;
```

- [ ] **Paso 3: Pasar `vapiConfig` al builder**

Reemplazar la llamada actual al builder (línea ~49):
```typescript
// Antes:
...buildInboundAssistant(clinic?.name ?? "la clínica"),

// Después:
...buildInboundAssistant(clinic?.name ?? "la clínica", vapiConfig),
```

- [ ] **Paso 4: Verificar tipos**

```powershell
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Paso 5: Commit**

```powershell
git add app/api/vapi/webhook/route.ts
git commit -m "feat(vapi): webhook pasa config por clínica (voz y saludo) al asistente"
```

---

## Task 3: Server action `updateClinicVapiConfig`

**Files:**
- Modify: `app/(dashboard)/superadmin/actions.ts`

- [ ] **Paso 1: Agregar el import del tipo**

Al inicio de `actions.ts` agregar:
```typescript
import type { VapiClinicConfig } from "@/lib/vapi";
```

- [ ] **Paso 2: Agregar la action al final del archivo**

```typescript
// ── Configuración Vapi por clínica ───────────────────────────────────────────
export async function updateClinicVapiConfig(
  clinicId: string,
  config: VapiClinicConfig,
): Promise<{ ok: boolean; error?: string }> {
  await assertSuperadmin();

  const admin = createAdminClient();

  // Leer settings actuales para no perder otras claves (ej. whatsapp)
  const { data: existing } = await admin
    .from("clinics")
    .select("settings")
    .eq("id", clinicId)
    .single();

  const merged = {
    ...(existing?.settings as Record<string, unknown> ?? {}),
    ...(config.vapi_phone_number_id !== undefined && { vapi_phone_number_id: config.vapi_phone_number_id }),
    ...(config.vapi_voice_id !== undefined && { vapi_voice_id: config.vapi_voice_id }),
    ...(config.vapi_first_message !== undefined && { vapi_first_message: config.vapi_first_message }),
  };

  const { error } = await admin
    .from("clinics")
    .update({ settings: merged })
    .eq("id", clinicId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/superadmin");
  return { ok: true };
}
```

- [ ] **Paso 3: Verificar tipos**

```powershell
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Paso 4: Commit**

```powershell
git add app/(dashboard)/superadmin/actions.ts
git commit -m "feat(vapi): server action updateClinicVapiConfig para superadmin"
```

---

## Task 4: Componente `VapiConfigForm`

**Files:**
- Create: `components/superadmin/VapiConfigForm.tsx`

- [ ] **Paso 1: Crear el componente**

```typescript
"use client";

import { useTransition, useState } from "react";
import { updateClinicVapiConfig } from "@/app/(dashboard)/superadmin/actions";
import type { VapiClinicConfig } from "@/lib/vapi";

const VOICES = [
  { id: "paula",     label: "Paula (femenina)" },
  { id: "bella",     label: "Bella (femenina, cálida)" },
  { id: "diego",     label: "Diego (masculino, formal)" },
  { id: "valentina", label: "Valentina (femenina, enérgica)" },
] as const;

export function VapiConfigForm({
  clinicId,
  initial,
}: {
  clinicId: string;
  initial: VapiClinicConfig;
}) {
  const [phoneNumberId, setPhoneNumberId] = useState(initial.vapi_phone_number_id ?? "");
  const [voiceId, setVoiceId] = useState(initial.vapi_voice_id ?? "paula");
  const [firstMessage, setFirstMessage] = useState(initial.vapi_first_message ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      setStatus("saving");
      const result = await updateClinicVapiConfig(clinicId, {
        vapi_phone_number_id: phoneNumberId.trim() || undefined,
        vapi_voice_id: voiceId,
        vapi_first_message: firstMessage.trim() || undefined,
      });
      setStatus(result.ok ? "saved" : "error");
      if (result.ok) setTimeout(() => setStatus("idle"), 2000);
    });
  }

  return (
    <div className="space-y-3">
      {/* ID de número Vapi */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          ID de número Vapi
        </label>
        <input
          type="text"
          value={phoneNumberId}
          onChange={(e) => setPhoneNumberId(e.target.value)}
          placeholder="phn_xxxxxxxxxxxxxxxx"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-300 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
        />
        <p className="mt-0.5 text-[11px] text-slate-400">
          Encuéntralo en Vapi Dashboard → Phone Numbers → ID.
        </p>
      </div>

      {/* Voz */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Voz del asistente
        </label>
        <select
          value={voiceId}
          onChange={(e) => setVoiceId(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
        >
          {VOICES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {/* Saludo personalizado */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Saludo personalizado{" "}
          <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <textarea
          value={firstMessage}
          onChange={(e) => setFirstMessage(e.target.value.slice(0, 200))}
          placeholder="Hola, gracias por llamar a [Clínica]. ¿En qué puedo ayudarle?"
          rows={2}
          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-300 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
        />
        <p className="mt-0.5 text-[11px] text-slate-400">
          {firstMessage.length}/200 caracteres. Si se deja vacío se usa el saludo por defecto.
        </p>
      </div>

      {/* Botón guardar */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded-lg bg-clinic px-4 py-2 text-sm font-medium text-white transition hover:bg-clinic/90 disabled:opacity-60"
        >
          {isPending ? "Guardando…" : "Guardar configuración Vapi"}
        </button>
        {status === "saved" && (
          <span className="text-xs font-medium text-emerald-600">¡Guardado!</span>
        )}
        {status === "error" && (
          <span className="text-xs font-medium text-red-500">Error al guardar.</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Paso 2: Verificar tipos**

```powershell
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Paso 3: Commit**

```powershell
git add components/superadmin/VapiConfigForm.tsx
git commit -m "feat(vapi): componente VapiConfigForm para superadmin"
```

---

## Task 5: Integrar en `ClinicList` y `superadmin/page.tsx`

**Files:**
- Modify: `components/superadmin/ClinicList.tsx`
- Modify: `app/(dashboard)/superadmin/page.tsx`

- [ ] **Paso 1: Agregar `settings` a `ClinicRow`**

En `components/superadmin/ClinicList.tsx`, localizar el tipo `ClinicRow` (línea ~21) y agregar el campo:

```typescript
export type ClinicRow = {
  id: string;
  name: string;
  plan: string;
  features: Features;
  active: boolean;
  max_users: number;
  created_at: string;
  users: ClinicUser[];
  settings: Record<string, unknown>;   // ← agregar esta línea
};
```

- [ ] **Paso 2: Agregar import de `VapiConfigForm` en `ClinicList.tsx`**

Al inicio del archivo junto a los otros imports de componentes:

```typescript
import { VapiConfigForm } from "@/components/superadmin/VapiConfigForm";
import type { VapiClinicConfig } from "@/lib/vapi";
```

- [ ] **Paso 3: Agregar sección Vapi en `ClinicCard`**

Dentro del `ClinicCard`, después del bloque de Backup (alrededor de la línea donde termina la sección Backup, antes del cierre del `div` de detalle), agregar:

```typescript
{/* Recepcionista IA (Vapi) */}
<div className="border-t border-slate-100 pt-4">
  <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
    Recepcionista IA (Vapi)
  </h3>
  <VapiConfigForm
    clinicId={c.id}
    initial={c.settings as VapiClinicConfig}
  />
</div>
```

- [ ] **Paso 4: Actualizar `superadmin/page.tsx` — query y mapping**

En `app/(dashboard)/superadmin/page.tsx`, actualizar el query de clínicas:

```typescript
// Antes:
admin.from("clinics").select("id, name, plan, features, active, max_users, created_at")

// Después:
admin.from("clinics").select("id, name, plan, features, active, max_users, created_at, settings")
```

En el mapping de `rows` (alrededor de línea 82), agregar `settings`:

```typescript
const rows: ClinicRow[] = (clinics ?? []).map((c) => ({
  id: c.id,
  name: c.name,
  plan: c.plan,
  features: normalizeFeatures(c.features),
  active: c.active !== false,
  max_users: c.max_users ?? 10,
  created_at: c.created_at,
  users: usersByClinic.get(c.id) ?? [],
  settings: (c.settings as Record<string, unknown>) ?? {},   // ← agregar esta línea
}));
```

- [ ] **Paso 5: Verificar tipos**

```powershell
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Paso 6: Commit**

```powershell
git add components/superadmin/ClinicList.tsx app/(dashboard)/superadmin/page.tsx
git commit -m "feat(vapi): sección Recepcionista IA en panel superadmin por clínica"
```

---

## Task 6: Prueba manual end-to-end

- [ ] **Paso 1: Levantar el servidor de desarrollo**

```powershell
npm run dev
```

- [ ] **Paso 2: Verificar UI superadmin**

1. Ir a `http://localhost:3000/superadmin`
2. Expandir cualquier clínica (clic en el chevron)
3. Verificar que aparece la sección **"Recepcionista IA (Vapi)"** al final del detalle
4. Completar los 3 campos y presionar "Guardar configuración Vapi"
5. Verificar que aparece "¡Guardado!" en verde
6. Recargar la página y verificar que los valores persisten

- [ ] **Paso 3: Verificar en Supabase**

En Supabase SQL Editor (proyecto local o nube):

```sql
SELECT id, name, settings
FROM clinics
WHERE settings->>'vapi_phone_number_id' IS NOT NULL;
```

Esperado: la clínica configurada aparece con las 3 claves en `settings`.

- [ ] **Paso 4: Verificar que settings preexistentes no se pierden**

Si la clínica ya tenía otras claves en `settings` (ej. WhatsApp), verificar que siguen ahí después de guardar la config Vapi.

```sql
SELECT settings FROM clinics WHERE id = '<tu-clinic-id>';
```

Esperado: JSONB con las claves previas más las nuevas de Vapi.

- [ ] **Paso 5: Verificar el webhook (si hay número Vapi disponible)**

Hacer una llamada de prueba al número configurado o simular el `assistant-request` con curl:

```powershell
curl -X POST https://localhost:3000/api/vapi/webhook `
  -H "Content-Type: application/json" `
  -d '{"message":{"type":"assistant-request","call":{"phoneNumberId":"phn_tuId"}}}'
```

Esperado: respuesta con `assistant.voice.voiceId` igual al configurado y `assistant.firstMessage` igual al saludo guardado.

- [ ] **Paso 6: Commit final**

```powershell
git add -A
git commit -m "test(vapi): verificación manual end-to-end completada"
```

---

## Resumen de cambios

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `lib/vapi.ts` | Tipo `VapiClinicConfig` + parámetro `config` en `buildInboundAssistant` |
| 2 | `app/api/vapi/webhook/route.ts` | Query incluye `settings`, se pasa `vapiConfig` al builder |
| 3 | `app/(dashboard)/superadmin/actions.ts` | Nueva action `updateClinicVapiConfig` |
| 4 | `components/superadmin/VapiConfigForm.tsx` | Nuevo componente formulario |
| 5 | `components/superadmin/ClinicList.tsx` | `settings` en `ClinicRow`, sección Vapi en `ClinicCard` |
| 6 | `app/(dashboard)/superadmin/page.tsx` | `settings` en query y mapping |
