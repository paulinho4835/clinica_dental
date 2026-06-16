# Diseño: Vapi Multi-Clínica Inbound (v1)

**Fecha:** 2026-06-16  
**Estado:** Aprobado  
**Alcance:** Recepcionista IA 24/7 por clínica — configuración desde el panel superadmin

---

## Objetivo

Permitir que cada clínica tenga su propio número de teléfono Vapi con un asistente de voz personalizado (voz y saludo). El asistente atiende llamadas entrantes las 24 horas. La configuración la gestiona exclusivamente el superadmin.

---

## Lo que NO entra en esta versión

- Recordatorios outbound multi-clínica (siguen con env vars)
- Horarios de atención (el asistente es 24/7 por diseño)
- Gestión de asistentes en la API de Vapi (no usamos Management API)
- Configuración por parte del admin de la clínica

---

## Modelo de datos

Sin migración nueva. Se extienden las claves del JSONB `clinics.settings`:

```typescript
// Tipo en lib/vapi.ts (o lib/vapi-config.ts)
export type VapiClinicConfig = {
  vapi_phone_number_id?: string;  // ID del número comprado en Vapi dashboard
  vapi_voice_id?: string;         // ID de voz 11labs (default: "paula")
  vapi_first_message?: string;    // Saludo personalizado (default: genérico con nombre de clínica)
};
```

Las claves coexisten sin conflicto con el resto de `settings` (whatsapp, etc.).

### Voces disponibles

| `vapi_voice_id` | Etiqueta en UI |
|----------------|---------------|
| `paula`        | Paula (femenina) — **default** |
| `bella`        | Bella (femenina, cálida) |
| `diego`        | Diego (masculino, formal) |
| `valentina`    | Valentina (femenina, enérgica) |

---

## Cambios en `lib/vapi.ts`

### `buildInboundAssistant()`

Firma actual:
```typescript
buildInboundAssistant(clinicName: string, todayISO?: string)
```

Nueva firma:
```typescript
buildInboundAssistant(
  clinicName: string,
  config: Pick<VapiClinicConfig, "vapi_voice_id" | "vapi_first_message"> = {},
  todayISO?: string
)
```

Cambios internos:
- `voice.voiceId` usa `config.vapi_voice_id ?? "paula"`
- `firstMessage` usa `config.vapi_first_message ?? \`Hola, gracias por llamar a ${clinicName}. ¿En qué puedo ayudarle?\``

---

## Cambios en `app/api/vapi/webhook/route.ts`

### Handler `assistant-request`

```typescript
// Antes
const { data: clinic } = await admin
  .from("clinics")
  .select("name")
  .eq("id", clinicId)
  .single();

// Después
const { data: clinic } = await admin
  .from("clinics")
  .select("name, settings")
  .eq("id", clinicId)
  .single();

const vapiConfig = (clinic?.settings ?? {}) as VapiClinicConfig;

return NextResponse.json({
  assistant: {
    ...buildInboundAssistant(clinic?.name ?? "la clínica", vapiConfig),
    serverMessages: ["tool-calls", "end-of-call-report"],
    metadata: { clinicId },
  },
});
```

Sin lógica de horarios. El asistente siempre está disponible.

---

## Nuevos archivos

### `components/superadmin/VapiConfigForm.tsx`

Client component con `useTransition`. Muestra:
- **Input texto**: ID de número Vapi (`vapi_phone_number_id`)
- **Select**: Voz (`vapi_voice_id`) — 4 opciones curadas
- **Textarea**: Saludo (`vapi_first_message`, max 200 chars)
- **Botón**: "Guardar configuración Vapi"

Al guardar llama a la server action `updateClinicVapiConfig`. Muestra feedback inline (guardando… / guardado / error).

### Server action `updateClinicVapiConfig` en `app/(dashboard)/superadmin/actions.ts`

```typescript
export async function updateClinicVapiConfig(
  clinicId: string,
  config: VapiClinicConfig
): Promise<{ ok: boolean; error?: string }>
```

Hace `update` al campo `settings` usando merge con el valor existente:

```sql
UPDATE clinics
SET settings = settings || '{"vapi_phone_number_id": "...", ...}'::jsonb
WHERE id = $1
```

En Supabase: `.update({ settings: { ...existingSettings, ...config } })`.

Requiere verificación de `isPlatformAdmin()` antes de ejecutar.

---

## Cambios en `components/superadmin/ClinicList.tsx`

- `ClinicRow` incluye `settings: Record<string, unknown>` (ya se puede traer en el query de la página)
- Dentro del card de cada clínica se agrega la sección colapsable **"Recepcionista IA (Vapi)"** que renderiza `<VapiConfigForm>`

---

## Cambios en `app/(dashboard)/superadmin/page.tsx`

El query de clínicas pasa a incluir `settings`:

```typescript
admin.from("clinics").select("id, name, plan, features, active, max_users, created_at, settings")
```

---

## Flujo completo end-to-end

```
Paciente llama al número Vapi de la clínica
  → Vapi detecta el phoneNumberId
  → Vapi llama al webhook POST /api/vapi/webhook
  → handler assistant-request
      → resolveClinicId(phoneNumberId)   // lee settings.vapi_phone_number_id
      → fetch clinic (name + settings)
      → buildInboundAssistant(name, { vapi_voice_id, vapi_first_message })
  → Vapi recibe el asistente personalizado
  → Paciente habla con la recepcionista IA de SU clínica
```

---

## Archivos a tocar

| Archivo | Tipo de cambio |
|---------|---------------|
| `lib/vapi.ts` | Modificar `buildInboundAssistant()`, agregar tipo `VapiClinicConfig` |
| `app/api/vapi/webhook/route.ts` | Extender query + pasar config al builder |
| `app/(dashboard)/superadmin/page.tsx` | Agregar `settings` al query de clínicas |
| `app/(dashboard)/superadmin/actions.ts` | Nueva action `updateClinicVapiConfig` |
| `components/superadmin/ClinicList.tsx` | Agregar `settings` a `ClinicRow`, renderizar `VapiConfigForm` |
| `components/superadmin/VapiConfigForm.tsx` | **Nuevo** — formulario de config Vapi |

---

## Criterios de éxito

1. El superadmin puede guardar `phone_number_id`, voz y saludo por clínica sin tocar código ni env vars
2. Una llamada al número de la clínica A recibe el asistente con la voz y saludo de la clínica A
3. Una llamada al número de la clínica B recibe el asistente con la voz y saludo de la clínica B
4. Sin número configurado, el asistente responde "Clínica no encontrada" (comportamiento actual)
5. Sin voz o saludo configurados, usa los defaults (Paula + saludo genérico con nombre de clínica)
