# Addon Consentimientos Informados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el addon opt-in `consentimientos` que permite emitir, firmar digitalmente y archivar consentimientos informados por paciente, con plantillas de sistema predefinidas y gestión de plantillas propias por clínica.

**Architecture:** Nueva FeatureKey `consentimientos` (opt-in). Dos tablas nuevas: `consent_templates` (plantillas globales de sistema + propias de clínica) y `consents` (consentimientos emitidos, con snapshot del texto y firma base64). Panel en ficha del paciente + gestión de plantillas en Ajustes + página de impresión propia por consentimiento.

**Tech Stack:** Next.js 15 App Router, Supabase (RLS con `auth_clinic_id()`), TypeScript, Tailwind CSS, HTML5 Canvas (sin librerías externas), Vitest.

---

## File Map

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `supabase/migrations/0037_consents.sql` | Crear | Tablas, RLS, seed 8 plantillas sistema |
| `lib/features.ts` | Modificar | Agregar FeatureKey `consentimientos` |
| `components/superadmin/AddonToggle.tsx` | Modificar | Agregar ícono 📝 para `consentimientos` |
| `lib/consent-utils.ts` | Crear | `fillPlaceholders()` — reemplazo de placeholders |
| `lib/__tests__/consent-utils.test.ts` | Crear | Unit tests de `fillPlaceholders()` |
| `app/(dashboard)/pacientes/consent-actions.ts` | Crear | Server actions: `createConsent`, `deleteConsent` |
| `app/(dashboard)/ajustes/consent-template-actions.ts` | Crear | Server actions: `createTemplate`, `updateTemplate`, `deleteTemplate`, `forkTemplate` |
| `components/consents/SignaturePad.tsx` | Crear | Canvas HTML5 nativo con pointer events |
| `components/consents/ConsentModal.tsx` | Crear | Modal de creación con selector de plantilla y firma |
| `components/consents/ConsentsPanel.tsx` | Crear | Lista de consentimientos del paciente + botón crear |
| `components/ajustes/ConsentTemplatesPanel.tsx` | Crear | Gestión de plantillas en Ajustes |
| `app/(print)/pacientes/[id]/consentimiento/[consentId]/page.tsx` | Crear | Página de impresión/PDF por consentimiento |
| `app/(dashboard)/pacientes/[id]/page.tsx` | Modificar | Agregar queries + sección Consentimientos |
| `app/(dashboard)/ajustes/page.tsx` | Modificar | Agregar sección plantillas de consentimiento |

---

## Task 1: Migración SQL — tablas, RLS y seed

**Files:**
- Create: `supabase/migrations/0037_consents.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- 0037_consents.sql — Addon Consentimientos Informados
-- Dos tablas:
--   consent_templates: plantillas globales (clinic_id NULL) + propias de clínica
--   consents:          consentimientos emitidos por paciente (snapshot + firma base64)

-- ─── consent_templates ───────────────────────────────────────────────────────

create table if not exists consent_templates (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid references clinics(id) on delete cascade,
  title       text not null,
  body        text not null,
  is_system   boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- RLS especial: clinic_id puede ser NULL (plantillas del sistema visibles a todos)
alter table consent_templates enable row level security;

create policy consent_templates_select on consent_templates
  for select
  using (clinic_id = (select auth_clinic_id()) or clinic_id is null);

create policy consent_templates_insert on consent_templates
  for insert
  with check (clinic_id = (select auth_clinic_id()));

create policy consent_templates_update on consent_templates
  for update
  using (clinic_id = (select auth_clinic_id()))
  with check (clinic_id = (select auth_clinic_id()));

create policy consent_templates_delete on consent_templates
  for delete
  using (clinic_id = (select auth_clinic_id()));

-- ─── consents ────────────────────────────────────────────────────────────────

create table if not exists consents (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics(id) on delete cascade,
  patient_id      uuid not null references patients(id) on delete cascade,
  appointment_id  uuid references appointments(id) on delete set null,
  template_id     uuid references consent_templates(id) on delete set null,
  title           text not null,
  body            text not null,
  created_by      uuid references profiles(id) on delete set null,
  signature_data  text,
  signed_at       timestamptz,
  status          text not null default 'pendiente'
                  check (status in ('pendiente', 'firmado')),
  created_at      timestamptz not null default now()
);

alter table consents enable row level security;

create policy tenant_isolation on consents
  for all
  using  (clinic_id = (select auth_clinic_id()))
  with check (clinic_id = (select auth_clinic_id()));

-- ─── Seed: 8 plantillas del sistema ──────────────────────────────────────────

insert into consent_templates (clinic_id, title, body, is_system, sort_order) values

(null, 'Extracción dental simple',
$$Yo, {{nombre_paciente}}, declaro que he recibido información sobre el procedimiento de EXTRACCIÓN DENTAL SIMPLE que realizará el/la Dr./Dra. {{doctor}} en {{clinica}}.

He sido informado/a sobre los siguientes riesgos inherentes al procedimiento:
• Sangrado post-operatorio
• Inflamación y dolor durante la recuperación
• Riesgo de infección post-operatoria
• Posibilidad de alveolitis (dolor severo tardío)
• Lesión temporal de estructuras adyacentes

He recibido instrucciones de cuidado post-operatorio y mis preguntas han sido respondidas satisfactoriamente. Doy mi consentimiento libre y voluntario para la realización del procedimiento.

Fecha: {{fecha}}$$,
true, 1),

(null, 'Extracción de terceros molares',
$$Yo, {{nombre_paciente}}, declaro que he recibido información sobre el procedimiento de EXTRACCIÓN DE TERCEROS MOLARES (CORDALES) que realizará el/la Dr./Dra. {{doctor}} en {{clinica}}.

He sido informado/a sobre los siguientes riesgos:
• Sangrado e inflamación post-operatoria significativa
• Dolor durante varios días posteriores al procedimiento
• Riesgo de infección que puede requerir antibióticos
• Posibilidad de parestesia temporal de labio o mentón
• Comunicación con el seno maxilar (en molares superiores)
• Necesidad de reposo y dieta blanda por varios días

He recibido instrucciones post-operatorias y autorizo la realización del procedimiento.

Fecha: {{fecha}}$$,
true, 2),

(null, 'Anestesia local',
$$Yo, {{nombre_paciente}}, declaro que he sido informado/a sobre la aplicación de ANESTESIA LOCAL que realizará el/la Dr./Dra. {{doctor}} en {{clinica}}.

Comprendo que la anestesia local puede presentar los siguientes efectos:
• Sensación de adormecimiento temporal en labios, lengua o mejilla
• Molestia transitoria en el punto de inyección
• Raramente: reacción alérgica al anestésico (muy poco frecuente)
• Hematoma en el sitio de punción

Declaro no ser alérgico/a a anestésicos locales del tipo amida (lidocaína, articaína). En caso de ser alérgico/a, lo he comunicado al profesional antes de firmar este documento.

Doy mi consentimiento para la aplicación de anestesia local.

Fecha: {{fecha}}$$,
true, 3),

(null, 'Endodoncia (tratamiento de conducto)',
$$Yo, {{nombre_paciente}}, declaro que he sido informado/a sobre el procedimiento de ENDODONCIA (TRATAMIENTO DE CONDUCTO) que realizará el/la Dr./Dra. {{doctor}} en {{clinica}}.

He comprendido que:
• El tratamiento puede requerir varias sesiones
• Es posible sentir molestias entre sesiones
• Existe riesgo de fractura de instrumentos dentro del conducto
• La pieza dental puede requerir corona protésica posterior al tratamiento
• En casos complejos, puede ser necesario derivar a un especialista
• El pronóstico depende del estado previo de la pieza dental

Doy mi consentimiento para iniciar y completar el tratamiento de endodoncia.

Fecha: {{fecha}}$$,
true, 4),

(null, 'Implante dental',
$$Yo, {{nombre_paciente}}, declaro que he sido informado/a sobre el procedimiento de IMPLANTE DENTAL que realizará el/la Dr./Dra. {{doctor}} en {{clinica}}.

He comprendido los siguientes aspectos del tratamiento:
• El procedimiento es quirúrgico y requiere anestesia local
• El proceso de oseointegración puede tardar 3 a 6 meses
• Existe riesgo de fracaso de la oseointegración (pérdida del implante)
• Puede presentarse inflamación, dolor e infección post-operatoria
• El tratamiento consta de varias etapas: cirugía, oseointegración y corona
• Fumar y ciertas enfermedades sistémicas reducen el pronóstico del implante
• El costo incluye únicamente la fase quirúrgica; la corona protésica es adicional

Doy mi consentimiento informado para la colocación del implante dental.

Fecha: {{fecha}}$$,
true, 5),

(null, 'Blanqueamiento dental',
$$Yo, {{nombre_paciente}}, declaro que he sido informado/a sobre el procedimiento de BLANQUEAMIENTO DENTAL que realizará el/la Dr./Dra. {{doctor}} en {{clinica}}.

Comprendo que:
• Puede producirse sensibilidad dental transitoria durante y después del tratamiento
• Los resultados varían según el tipo de coloración y la estructura dental
• Restauraciones existentes (coronas, resinas) no se blanquean con el tratamiento
• El efecto no es permanente; los hábitos alimentarios influyen en la duración
• No se recomienda en mujeres embarazadas o en período de lactancia

Doy mi consentimiento para la realización del blanqueamiento dental.

Fecha: {{fecha}}$$,
true, 6),

(null, 'Cirugía oral menor',
$$Yo, {{nombre_paciente}}, declaro que he sido informado/a sobre el procedimiento de CIRUGÍA ORAL MENOR que realizará el/la Dr./Dra. {{doctor}} en {{clinica}}.

He sido informado/a sobre los siguientes riesgos:
• Sangrado e inflamación post-operatoria
• Riesgo de infección que puede requerir antibióticos
• Posibilidad de dehiscencia (apertura) de la sutura
• Molestias durante el período de cicatrización
• Necesidad de sutura y posterior retiro de puntos

He recibido indicaciones sobre medicación y cuidados post-operatorios. Doy mi consentimiento libre y voluntario para la realización del procedimiento quirúrgico.

Fecha: {{fecha}}$$,
true, 7),

(null, 'Ortodoncia',
$$Yo, {{nombre_paciente}}, declaro que he sido informado/a sobre el TRATAMIENTO DE ORTODONCIA que supervisará el/la Dr./Dra. {{doctor}} en {{clinica}}.

Comprendo y acepto que:
• El tratamiento puede durar entre 12 y 36 meses dependiendo del caso
• Se requieren controles periódicos cada 3 a 6 semanas
• La higiene dental debe ser rigurosa durante todo el tratamiento
• Pueden presentarse molestias o dolor los primeros días tras cada ajuste
• El incumplimiento en el uso de aparatos removibles alarga el tratamiento
• Una vez finalizada la fase activa, se requiere el uso de retenedores indefinidamente
• Los resultados dependen en parte de la colaboración del paciente

Doy mi consentimiento para iniciar el tratamiento de ortodoncia.

Fecha: {{fecha}}$$,
true, 8);
```

- [ ] **Step 2: Aplicar la migración**

```bash
npx supabase db reset
```

Verificar que las tablas existen y las 8 filas de seed están en `consent_templates`:
```bash
npx supabase db --help
# O desde el SQL Editor de Supabase dashboard:
# SELECT id, title FROM consent_templates WHERE is_system = true ORDER BY sort_order;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0037_consents.sql
git commit -m "feat(db): tablas consent_templates y consents con RLS y seed"
```

---

## Task 2: Feature flag y ícono de addon

**Files:**
- Modify: `lib/features.ts`
- Modify: `components/superadmin/AddonToggle.tsx`

- [ ] **Step 1: Agregar FeatureKey en `lib/features.ts`**

En el tipo `FeatureKey` agregar `"consentimientos"`:

```typescript
export type FeatureKey =
  | "agenda"
  | "pacientes"
  | "mis_trabajos"
  | "tratamientos"
  | "caja"
  | "inventario"
  | "ajustes"
  | "whatsapp"
  | "recetas"
  | "pagos"
  | "perfil"
  | "consentimientos";  // ← agregar esta línea
```

En el array `FEATURES`, agregar al final (antes del cierre `]`):

```typescript
  { key: "consentimientos", label: "Consentimientos", href: "/pacientes", optIn: true },
```

- [ ] **Step 2: Agregar ícono en `AddonToggle.tsx`**

En el objeto `ICONS`:

```typescript
const ICONS: Partial<Record<FeatureKey, string>> = {
  whatsapp: "💬",
  recetas: "📄",
  consentimientos: "📝",  // ← agregar esta línea
};
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add lib/features.ts components/superadmin/AddonToggle.tsx
git commit -m "feat(features): add consentimientos addon opt-in"
```

---

## Task 3: Utilidad de placeholders + test

**Files:**
- Create: `lib/consent-utils.ts`
- Create: `lib/__tests__/consent-utils.test.ts`

- [ ] **Step 1: Escribir el test primero**

```typescript
// lib/__tests__/consent-utils.test.ts
import { describe, it, expect } from "vitest";
import { fillPlaceholders } from "../consent-utils";

describe("fillPlaceholders", () => {
  const vars = {
    nombre_paciente: "Juan Pérez",
    fecha: "13/06/2026",
    doctor: "Dra. Ana Gómez",
    clinica: "Clínica Dental Norte",
  };

  it("reemplaza todos los placeholders conocidos", () => {
    const body =
      "Yo, {{nombre_paciente}}, autorizo a {{doctor}} de {{clinica}}. Fecha: {{fecha}}.";
    expect(fillPlaceholders(body, vars)).toBe(
      "Yo, Juan Pérez, autorizo a Dra. Ana Gómez de Clínica Dental Norte. Fecha: 13/06/2026."
    );
  });

  it("reemplaza múltiples ocurrencias del mismo placeholder", () => {
    const body = "{{nombre_paciente}} — firmado por {{nombre_paciente}}";
    expect(fillPlaceholders(body, vars)).toBe(
      "Juan Pérez — firmado por Juan Pérez"
    );
  });

  it("deja intactos los placeholders no definidos", () => {
    const body = "Hola {{nombre_paciente}} — {{desconocido}}";
    expect(fillPlaceholders(body, vars)).toBe(
      "Hola Juan Pérez — {{desconocido}}"
    );
  });

  it("devuelve el texto sin cambios si no hay placeholders", () => {
    const body = "Texto sin variables.";
    expect(fillPlaceholders(body, vars)).toBe("Texto sin variables.");
  });

  it("maneja body vacío", () => {
    expect(fillPlaceholders("", vars)).toBe("");
  });
});
```

- [ ] **Step 2: Ejecutar el test (debe fallar)**

```bash
npx vitest run lib/__tests__/consent-utils.test.ts
```

Expected: error `Cannot find module '../consent-utils'`.

- [ ] **Step 3: Implementar `lib/consent-utils.ts`**

```typescript
// lib/consent-utils.ts

export type PlaceholderVars = {
  nombre_paciente: string;
  fecha: string;
  doctor: string;
  clinica: string;
};

export function fillPlaceholders(body: string, vars: PlaceholderVars): string {
  return body
    .replace(/\{\{nombre_paciente\}\}/g, vars.nombre_paciente)
    .replace(/\{\{fecha\}\}/g, vars.fecha)
    .replace(/\{\{doctor\}\}/g, vars.doctor)
    .replace(/\{\{clinica\}\}/g, vars.clinica);
}

export function todayFormatted(): string {
  return new Date().toLocaleDateString("es-BO", {
    timeZone: "America/La_Paz",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
```

- [ ] **Step 4: Ejecutar el test (debe pasar)**

```bash
npx vitest run lib/__tests__/consent-utils.test.ts
```

Expected: 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/consent-utils.ts lib/__tests__/consent-utils.test.ts
git commit -m "feat(consents): utilidad fillPlaceholders con tests"
```

---

## Task 4: Server actions — consents

**Files:**
- Create: `app/(dashboard)/pacientes/consent-actions.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
// app/(dashboard)/pacientes/consent-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";

export type ConsentActionResult = { error?: string; id?: string };

export async function createConsent(
  patientId: string,
  params: {
    templateId: string | null;
    title: string;
    body: string;
    appointmentId: string | null;
    signatureData: string | null;
    status: "pendiente" | "firmado";
  }
): Promise<ConsentActionResult> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "clinical:write")) return { error: "Sin permiso clínico." };

  const title = params.title.trim();
  const body = params.body.trim();
  if (!title) return { error: "El título es requerido." };
  if (!body) return { error: "El cuerpo del consentimiento es requerido." };
  if (params.status === "firmado" && !params.signatureData) {
    return { error: "Se requiere firma para guardar como firmado." };
  }

  const supabase = await createClient();

  const { data: patientExists } = await supabase
    .from("patients")
    .select("id")
    .eq("id", patientId)
    .single();
  if (!patientExists) return { error: "Paciente no encontrado." };

  const { data, error } = await supabase
    .from("consents")
    .insert({
      clinic_id: profile.clinicId,
      patient_id: patientId,
      template_id: params.templateId ?? null,
      appointment_id: params.appointmentId ?? null,
      title,
      body,
      created_by: profile.userId,
      signature_data: params.signatureData ?? null,
      signed_at: params.status === "firmado" ? new Date().toISOString() : null,
      status: params.status,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Error al guardar el consentimiento." };

  revalidatePath(`/pacientes/${patientId}`);
  return { id: data.id };
}

export async function deleteConsent(
  consentId: string,
  patientId: string
): Promise<ConsentActionResult> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "clinical:write")) return { error: "Sin permiso clínico." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("consents")
    .delete()
    .eq("id", consentId);

  if (error) return { error: error.message };

  revalidatePath(`/pacientes/${patientId}`);
  return {};
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/"(dashboard)"/pacientes/consent-actions.ts
git commit -m "feat(consents): server actions createConsent y deleteConsent"
```

---

## Task 5: Server actions — plantillas de consentimiento

**Files:**
- Create: `app/(dashboard)/ajustes/consent-template-actions.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
// app/(dashboard)/ajustes/consent-template-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

type TemplateResult = { error?: string };

export async function createTemplate(
  title: string,
  body: string
): Promise<TemplateResult> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin") return { error: "Solo el administrador puede gestionar plantillas." };

  const t = title.trim();
  const b = body.trim();
  if (!t) return { error: "El título es requerido." };
  if (!b) return { error: "El cuerpo es requerido." };

  const supabase = await createClient();

  const { error } = await supabase.from("consent_templates").insert({
    clinic_id: profile.clinicId,
    title: t,
    body: b,
    is_system: false,
  });

  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return {};
}

export async function updateTemplate(
  templateId: string,
  title: string,
  body: string
): Promise<TemplateResult> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin") return { error: "Solo el administrador puede gestionar plantillas." };

  const t = title.trim();
  const b = body.trim();
  if (!t) return { error: "El título es requerido." };
  if (!b) return { error: "El cuerpo es requerido." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("consent_templates")
    .update({ title: t, body: b })
    .eq("id", templateId)
    .eq("clinic_id", profile.clinicId); // RLS + explicit guard

  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return {};
}

export async function deleteTemplate(templateId: string): Promise<TemplateResult> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin") return { error: "Solo el administrador puede gestionar plantillas." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("consent_templates")
    .delete()
    .eq("id", templateId)
    .eq("clinic_id", profile.clinicId);

  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return {};
}

export async function forkTemplate(templateId: string): Promise<TemplateResult> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin") return { error: "Solo el administrador puede gestionar plantillas." };

  const supabase = await createClient();

  const { data: source, error: fetchErr } = await supabase
    .from("consent_templates")
    .select("title, body")
    .eq("id", templateId)
    .single();

  if (fetchErr || !source) return { error: "Plantilla no encontrada." };

  const { error: insertErr } = await supabase.from("consent_templates").insert({
    clinic_id: profile.clinicId,
    title: `(Copia) ${source.title}`,
    body: source.body,
    is_system: false,
  });

  if (insertErr) return { error: insertErr.message };

  revalidatePath("/ajustes");
  return {};
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/"(dashboard)"/ajustes/consent-template-actions.ts
git commit -m "feat(consents): server actions CRUD de plantillas de consentimiento"
```

---

## Task 6: Componente SignaturePad (canvas HTML5)

**Files:**
- Create: `components/consents/SignaturePad.tsx`

- [ ] **Step 1: Crear el componente**

```typescript
// components/consents/SignaturePad.tsx
"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from "react";

export type SignaturePadRef = {
  toDataURL: () => string;
  isEmpty: () => boolean;
  clear: () => void;
};

function getPos(
  e: React.PointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement
) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
  };
}

export const SignaturePad = forwardRef<SignaturePadRef>(
  function SignaturePad(_props, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawing = useRef(false);
    const hasDrawn = useRef(false);

    useImperativeHandle(ref, () => ({
      toDataURL: () => canvasRef.current?.toDataURL("image/png") ?? "",
      isEmpty: () => !hasDrawn.current,
      clear: () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        hasDrawn.current = false;
      },
    }));

    const onPointerDown = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        isDrawing.current = true;
        const ctx = canvas.getContext("2d")!;
        const { x, y } = getPos(e, canvas);
        ctx.beginPath();
        ctx.moveTo(x, y);
      },
      []
    );

    const onPointerMove = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d")!;
        const { x, y } = getPos(e, canvas);
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#1e293b";
        ctx.lineTo(x, y);
        ctx.stroke();
        hasDrawn.current = true;
      },
      []
    );

    const stopDrawing = useCallback(() => {
      isDrawing.current = false;
    }, []);

    return (
      <canvas
        ref={canvasRef}
        width={400}
        height={160}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
        style={{ touchAction: "none" }}
        className="w-full rounded border border-slate-300 bg-white cursor-crosshair"
      />
    );
  }
);
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/consents/SignaturePad.tsx
git commit -m "feat(consents): SignaturePad canvas HTML5 nativo con pointer events"
```

---

## Task 7: ConsentModal y ConsentsPanel

**Files:**
- Create: `components/consents/ConsentModal.tsx`
- Create: `components/consents/ConsentsPanel.tsx`

- [ ] **Step 1: Crear `ConsentModal.tsx`**

```typescript
// components/consents/ConsentModal.tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SignaturePad, type SignaturePadRef } from "./SignaturePad";
import { createConsent } from "@/app/(dashboard)/pacientes/consent-actions";
import { fillPlaceholders, todayFormatted } from "@/lib/consent-utils";

export type ConsentTemplate = { id: string; title: string; body: string };
export type ConsentAppointment = { id: string; startsAt: string; reason: string | null };

export function ConsentModal({
  patientId,
  patientName,
  doctorName,
  clinicName,
  templates,
  appointments,
  onClose,
}: {
  patientId: string;
  patientName: string;
  doctorName: string;
  clinicName: string;
  templates: ConsentTemplate[];
  appointments: ConsentAppointment[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPad, setShowPad] = useState(false);
  const padRef = useRef<SignaturePadRef>(null);

  const [selectedTemplateId, setSelectedTemplateId] = useState(
    templates[0]?.id ?? ""
  );
  const [title, setTitle] = useState(templates[0]?.title ?? "");
  const [body, setBody] = useState(() =>
    templates[0]
      ? fillPlaceholders(templates[0].body, {
          nombre_paciente: patientName,
          fecha: todayFormatted(),
          doctor: doctorName,
          clinica: clinicName,
        })
      : ""
  );
  const [appointmentId, setAppointmentId] = useState("");

  function handleTemplateChange(templateId: string) {
    setSelectedTemplateId(templateId);
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    setTitle(tpl.title);
    setBody(
      fillPlaceholders(tpl.body, {
        nombre_paciente: patientName,
        fecha: todayFormatted(),
        doctor: doctorName,
        clinica: clinicName,
      })
    );
  }

  function handleSave(status: "pendiente" | "firmado") {
    setError(null);
    const signatureData =
      status === "firmado" && padRef.current && !padRef.current.isEmpty()
        ? padRef.current.toDataURL()
        : null;

    if (status === "firmado" && !signatureData) {
      setError("Dibuja la firma en el canvas antes de guardar como firmado.");
      return;
    }

    startTransition(async () => {
      const result = await createConsent(patientId, {
        templateId: selectedTemplateId || null,
        title,
        body,
        appointmentId: appointmentId || null,
        signatureData,
        status,
      });
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
        onClose();
      }
    });
  }

  const fmtAppt = (iso: string) =>
    new Date(iso).toLocaleDateString("es-BO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold">Nuevo consentimiento</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Plantilla */}
          {templates.length > 0 && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Plantilla</span>
              <select
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </label>
          )}

          {/* Título */}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Título</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none"
            />
          </label>

          {/* Cuerpo editable */}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              Texto del consentimiento
              <span className="ml-1 font-normal text-slate-400">(editable)</span>
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none"
            />
          </label>

          {/* Vincular a cita */}
          {appointments.length > 0 && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                Vincular a cita
                <span className="ml-1 font-normal text-slate-400">(opcional)</span>
              </span>
              <select
                value={appointmentId}
                onChange={(e) => setAppointmentId(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none"
              >
                <option value="">— Sin vincular —</option>
                {appointments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {fmtAppt(a.startsAt)}{a.reason ? ` — ${a.reason}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Firma digital */}
          <div className="text-sm">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium text-slate-700">Firma digital</span>
              <button
                type="button"
                onClick={() => setShowPad((v) => !v)}
                className="text-xs text-clinic hover:underline"
              >
                {showPad ? "Ocultar" : "Firmar ahora"}
              </button>
            </div>
            {showPad && (
              <div className="space-y-2">
                <SignaturePad ref={padRef} />
                <button
                  type="button"
                  onClick={() => padRef.current?.clear()}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Limpiar firma
                </button>
              </div>
            )}
            {!showPad && (
              <p className="text-xs text-slate-400">
                Omite para guardar sin firma (se imprime línea en blanco).
              </p>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => handleSave("pendiente")}
            disabled={pending}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {pending ? "…" : "Guardar sin firma"}
          </button>
          <button
            type="button"
            onClick={() => handleSave("firmado")}
            disabled={pending || !showPad}
            className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
          >
            {pending ? "…" : "Guardar firmado"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Crear `ConsentsPanel.tsx`**

```typescript
// components/consents/ConsentsPanel.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ConsentModal,
  type ConsentTemplate,
  type ConsentAppointment,
} from "./ConsentModal";
import { deleteConsent } from "@/app/(dashboard)/pacientes/consent-actions";

export type ConsentRow = {
  id: string;
  title: string;
  status: "pendiente" | "firmado";
  createdAt: string;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-BO", {
    timeZone: "America/La_Paz",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

function StatusBadge({ status }: { status: "pendiente" | "firmado" }) {
  return status === "firmado" ? (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
      Firmado
    </span>
  ) : (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
      Pendiente
    </span>
  );
}

export function ConsentsPanel({
  patientId,
  patientName,
  doctorName,
  clinicName,
  consents,
  templates,
  appointments,
  canWrite,
}: {
  patientId: string;
  patientName: string;
  doctorName: string;
  clinicName: string;
  consents: ConsentRow[];
  templates: ConsentTemplate[];
  appointments: ConsentAppointment[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleDelete(consentId: string) {
    if (!confirm("¿Eliminar este consentimiento?")) return;
    startTransition(async () => {
      await deleteConsent(consentId, patientId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-clinic px-3 py-1.5 text-sm font-medium text-white hover:bg-clinic-fg"
          >
            + Nuevo consentimiento
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="hidden grid-cols-[9rem_1fr_7rem_8rem_2rem] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium uppercase text-slate-400 sm:grid">
          <span>Fecha</span>
          <span>Título</span>
          <span>Estado</span>
          <span />
          <span />
        </div>

        <div className="divide-y divide-slate-100">
          {consents.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-2 items-center gap-3 px-4 py-2.5 text-sm sm:grid-cols-[9rem_1fr_7rem_8rem_2rem]"
            >
              <span className="tabular-nums text-slate-500">
                {fmtDate(c.createdAt)}
              </span>
              <span className="font-medium">{c.title}</span>
              <StatusBadge status={c.status} />
              <a
                href={`/pacientes/${patientId}/consentimiento/${c.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-clinic hover:underline"
              >
                Ver / imprimir
              </a>
              <div className="text-right">
                {canWrite && (
                  <button
                    disabled={pending}
                    onClick={() => handleDelete(c.id)}
                    className="text-slate-300 hover:text-red-500 disabled:opacity-50"
                    title="Eliminar"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}

          {consents.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">
              Sin consentimientos emitidos.
            </p>
          )}
        </div>
      </div>

      {showModal && (
        <ConsentModal
          patientId={patientId}
          patientName={patientName}
          doctorName={doctorName}
          clinicName={clinicName}
          templates={templates}
          appointments={appointments}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add components/consents/ConsentModal.tsx components/consents/ConsentsPanel.tsx
git commit -m "feat(consents): ConsentModal y ConsentsPanel con firma digital"
```

---

## Task 8: ConsentTemplatesPanel (Ajustes)

**Files:**
- Create: `components/ajustes/ConsentTemplatesPanel.tsx`

- [ ] **Step 1: Crear el componente**

```typescript
// components/ajustes/ConsentTemplatesPanel.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  forkTemplate,
} from "@/app/(dashboard)/ajustes/consent-template-actions";

export type TemplateRow = {
  id: string;
  title: string;
  body: string;
  isSystem: boolean;
  clinicId: string | null;
};

function PlaceholderHint() {
  return (
    <p className="mt-1 text-xs text-slate-400">
      Placeholders disponibles:{" "}
      <code className="rounded bg-slate-100 px-1">{"{{nombre_paciente}}"}</code>{" "}
      <code className="rounded bg-slate-100 px-1">{"{{fecha}}"}</code>{" "}
      <code className="rounded bg-slate-100 px-1">{"{{doctor}}"}</code>{" "}
      <code className="rounded bg-slate-100 px-1">{"{{clinica}}"}</code>
    </p>
  );
}

function TemplateForm({
  initial,
  onSave,
  onCancel,
  pending,
}: {
  initial?: { title: string; body: string };
  onSave: (title: string, body: string) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <input
        type="text"
        placeholder="Título de la plantilla"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none"
      />
      <div>
        <textarea
          placeholder="Texto del consentimiento..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none"
        />
        <PlaceholderHint />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => onSave(title, body)}
          className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
        >
          {pending ? "…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function ConsentTemplatesPanel({
  systemTemplates,
  clinicTemplates,
}: {
  systemTemplates: TemplateRow[];
  clinicTemplates: TemplateRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Plantillas del sistema */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-600">
          Plantillas del sistema
        </h3>
        <div className="overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
          <div className="divide-y divide-slate-100">
            {systemTemplates.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <span className="font-medium">{t.title}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => forkTemplate(t.id))}
                  className="shrink-0 text-xs text-clinic hover:underline disabled:opacity-50"
                >
                  Usar como base
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Plantillas de la clínica */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-600">
            Plantillas de esta clínica
          </h3>
          <button
            type="button"
            onClick={() => { setShowNew(true); setEditingId(null); }}
            className="text-xs text-clinic hover:underline"
          >
            + Nueva plantilla
          </button>
        </div>

        {showNew && (
          <div className="mb-3">
            <TemplateForm
              pending={pending}
              onCancel={() => setShowNew(false)}
              onSave={(title, body) =>
                run(async () => {
                  const res = await createTemplate(title, body);
                  if (!res.error) setShowNew(false);
                  return res;
                })
              }
            />
          </div>
        )}

        <div className="overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
          <div className="divide-y divide-slate-100">
            {clinicTemplates.map((t) => (
              <div key={t.id} className="px-4 py-2.5 text-sm">
                {editingId === t.id ? (
                  <TemplateForm
                    initial={{ title: t.title, body: t.body }}
                    pending={pending}
                    onCancel={() => setEditingId(null)}
                    onSave={(title, body) =>
                      run(async () => {
                        const res = await updateTemplate(t.id, title, body);
                        if (!res.error) setEditingId(null);
                        return res;
                      })
                    }
                  />
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{t.title}</span>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setEditingId(t.id)}
                        className="text-xs text-slate-500 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (!confirm("¿Eliminar esta plantilla?")) return;
                          run(() => deleteTemplate(t.id));
                        }}
                        className="text-xs text-red-400 hover:underline disabled:opacity-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {clinicTemplates.length === 0 && !showNew && (
              <p className="px-4 py-3 text-sm text-slate-500">
                Sin plantillas propias. Crea una nueva o usa como base una del sistema.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/ajustes/ConsentTemplatesPanel.tsx
git commit -m "feat(consents): ConsentTemplatesPanel para gestión de plantillas en Ajustes"
```

---

## Task 9: Página de impresión por consentimiento

**Files:**
- Create: `app/(print)/pacientes/[id]/consentimiento/[consentId]/page.tsx`

- [ ] **Step 1: Crear el archivo**

Reutilizar `AutoPrint` y `PrintButtons` del mismo grupo de rutas de impresión:

```typescript
// app/(print)/pacientes/[id]/consentimiento/[consentId]/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AutoPrint, PrintButtons } from "../../imprimir/AutoPrint";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-BO", {
    timeZone: "America/La_Paz",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

export default async function ConsentPrintPage({
  params,
}: {
  params: Promise<{ id: string; consentId: string }>;
}) {
  const { id: patientId, consentId } = await params;
  const supabase = await createClient();

  const { data: consent } = await supabase
    .from("consents")
    .select("id, title, body, status, signature_data, signed_at, created_at, clinic_id, patient_id")
    .eq("id", consentId)
    .eq("patient_id", patientId)
    .single();

  if (!consent) notFound();

  const [{ data: patient }, { data: clinic }] = await Promise.all([
    supabase
      .from("patients")
      .select("full_name, national_id, phone")
      .eq("id", patientId)
      .single(),
    supabase
      .from("clinics")
      .select("name, address, phone, nit, logo_url")
      .eq("id", consent.clinic_id)
      .single(),
  ]);

  if (!patient) notFound();

  return (
    <>
      <AutoPrint />
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        body { margin: 0; font-family: Arial, Helvetica, sans-serif; }
      `}</style>

      <div className="mx-auto max-w-3xl px-8 py-8 text-slate-800">
        <PrintButtons />

        {/* Encabezado clínica */}
        <div className="mb-6 flex items-start justify-between border-b-2 border-slate-800 pb-4">
          <div className="flex items-start gap-4">
            {clinic?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={clinic.logo_url}
                alt="Logo"
                className="h-16 w-16 object-contain"
              />
            )}
            <div>
              <p className="text-xl font-bold uppercase tracking-wide">
                {clinic?.name ?? "Clínica Dental"}
              </p>
              {clinic?.address && (
                <p className="text-sm text-slate-500">{clinic.address}</p>
              )}
              {clinic?.phone && (
                <p className="text-sm text-slate-500">Tel.: {clinic.phone}</p>
              )}
              {clinic?.nit && (
                <p className="text-sm text-slate-500">NIT: {clinic.nit}</p>
              )}
            </div>
          </div>
          <div className="text-right text-sm text-slate-500">
            <p className="font-semibold uppercase">Consentimiento Informado</p>
            <p className="mt-1">Emitido: {fmtDate(consent.created_at as string)}</p>
          </div>
        </div>

        {/* Datos del paciente */}
        <div className="mb-6 grid grid-cols-2 gap-x-8 gap-y-1 rounded-lg bg-slate-50 px-5 py-4 text-sm">
          <div>
            <span className="text-slate-500">Paciente: </span>
            <span className="font-semibold">{patient.full_name}</span>
          </div>
          <div>
            <span className="text-slate-500">CI: </span>
            <span className="font-semibold">{patient.national_id ?? "—"}</span>
          </div>
          {patient.phone && (
            <div>
              <span className="text-slate-500">Teléfono: </span>
              <span>{patient.phone}</span>
            </div>
          )}
        </div>

        {/* Título */}
        <h1 className="mb-6 text-center text-xl font-bold uppercase tracking-wide">
          {consent.title}
        </h1>

        {/* Cuerpo */}
        <div className="mb-8 whitespace-pre-wrap text-sm leading-relaxed">
          {consent.body}
        </div>

        {/* Firma */}
        <div className="mt-12">
          {consent.status === "firmado" && consent.signature_data ? (
            <div className="flex flex-col items-start gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={consent.signature_data as string}
                alt="Firma del paciente"
                className="h-24 border-b border-slate-400 object-contain"
              />
              <p className="text-sm text-slate-500">
                Firma digital — {fmtDate(consent.signed_at as string)}
              </p>
            </div>
          ) : (
            <div className="mt-8 border-t border-slate-400 pt-2 text-center text-sm text-slate-500">
              Firma del paciente
            </div>
          )}
        </div>

        {/* Firma del doctor */}
        <div className="mt-16 border-t border-slate-400 pt-2 text-center text-sm text-slate-500">
          Firma del odontólogo
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "app/(print)/pacientes/[id]/consentimiento/[consentId]/page.tsx"
git commit -m "feat(consents): página de impresión PDF por consentimiento"
```

---

## Task 10: Integración en ficha del paciente

**Files:**
- Modify: `app/(dashboard)/pacientes/[id]/page.tsx`

- [ ] **Step 1: Agregar imports**

Al inicio del archivo, agregar los nuevos imports tras los existentes:

```typescript
import {
  ConsentsPanel,
  type ConsentRow,
} from "@/components/consents/ConsentsPanel";
import type {
  ConsentTemplate,
  ConsentAppointment,
} from "@/components/consents/ConsentModal";
```

- [ ] **Step 2: Actualizar la query de `clinicRow` para incluir el nombre**

Buscar la query existente:
```typescript
supabase
  .from("clinics")
  .select("features")
  .eq("id", patient.clinic_id)
  .single(),
```

Cambiarla a:
```typescript
supabase
  .from("clinics")
  .select("features, name")
  .eq("id", patient.clinic_id)
  .single(),
```

- [ ] **Step 3: Agregar queries de consentimientos al bloque `Promise.all`**

Antes del cierre del array en `Promise.all([...])`, agregar (dentro del mismo bloque, como nuevos elementos):

```typescript
    supabase
      .from("consents")
      .select("id, title, status, created_at")
      .eq("patient_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("consent_templates")
      .select("id, title, body")
      .order("sort_order"),
```

Actualizar la destructuración del `Promise.all` para incluir los nuevos resultados:
```typescript
  const [
    { data: rawPlans },
    { data: payments },
    { data: appointments },
    { data: dentists },
    { data: rawPrescriptions },
    { data: clinicRow },
    { data: recepData },
    { data: rawConsents },       // ← nuevo
    { data: consentTemplates },  // ← nuevo
  ] = await Promise.all([
    // ... queries existentes ...
    supabase
      .from("consents")
      .select("id, title, status, created_at")
      .eq("patient_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("consent_templates")
      .select("id, title, body")
      .order("sort_order"),
  ]);
```

- [ ] **Step 4: Mapear los datos y leer el feature flag**

Después de la línea `const recetasEnabled = features.recetas;`, agregar:

```typescript
  const consentimientosEnabled = features.consentimientos;

  const consentRows: ConsentRow[] = (rawConsents ?? []).map((c) => ({
    id: c.id as string,
    title: c.title as string,
    status: c.status as "pendiente" | "firmado",
    createdAt: c.created_at as string,
  }));

  const consentTemplateList: ConsentTemplate[] = (consentTemplates ?? []).map((t) => ({
    id: t.id as string,
    title: t.title as string,
    body: t.body as string,
  }));

  const consentAppts: ConsentAppointment[] = apptRows.map((a) => ({
    id: a.id,
    startsAt: a.startsAt,
    reason: a.reason,
  }));

  const clinicName = (clinicRow as { name?: string } | null)?.name ?? "";
```

- [ ] **Step 5: Agregar la sección en el JSX**

Al final del JSX, después de la sección de Recetas emitidas:

```typescript
      {consentimientosEnabled && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Consentimientos</h2>
          <ConsentsPanel
            patientId={patient.id}
            patientName={patient.full_name}
            doctorName={profile?.fullName ?? ""}
            clinicName={clinicName}
            consents={consentRows}
            templates={consentTemplateList}
            appointments={consentAppts}
            canWrite={canClinical}
          />
        </section>
      )}
```

- [ ] **Step 6: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/pacientes/[id]/page.tsx"
git commit -m "feat(consents): sección Consentimientos en ficha del paciente"
```

---

## Task 11: Integración en Ajustes

**Files:**
- Modify: `app/(dashboard)/ajustes/page.tsx`

- [ ] **Step 1: Agregar import**

```typescript
import {
  ConsentTemplatesPanel,
  type TemplateRow,
} from "@/components/ajustes/ConsentTemplatesPanel";
```

- [ ] **Step 2: Agregar query de plantillas (gateada por feature + isAdmin)**

Después del bloque que carga `doctors` y antes de la carga de `team`, agregar:

```typescript
  let systemTemplates: TemplateRow[] = [];
  let clinicTemplates: TemplateRow[] = [];

  if (isClinicAdmin && features.consentimientos && profile) {
    const { data: allTemplates } = await supabase
      .from("consent_templates")
      .select("id, title, body, is_system, clinic_id")
      .order("sort_order");

    systemTemplates = (allTemplates ?? [])
      .filter((t) => t.is_system && t.clinic_id === null)
      .map((t) => ({
        id: t.id as string,
        title: t.title as string,
        body: t.body as string,
        isSystem: true,
        clinicId: null,
      }));

    clinicTemplates = (allTemplates ?? [])
      .filter((t) => !t.is_system && t.clinic_id !== null)
      .map((t) => ({
        id: t.id as string,
        title: t.title as string,
        body: t.body as string,
        isSystem: false,
        clinicId: t.clinic_id as string,
      }));
  }
```

- [ ] **Step 3: Agregar sección en el JSX**

Después de la sección de Doctores (antes de Usuarios del equipo):

```typescript
      {isClinicAdmin && features.consentimientos && profile && (
        <section>
          <h2 className="text-lg font-semibold text-slate-800">
            Plantillas de consentimiento
          </h2>
          <p className="mb-3 text-sm text-slate-500">
            Gestiona las plantillas de consentimiento informado de tu clínica.
            Puedes usar las plantillas del sistema como base o crear las tuyas propias.
          </p>
          <ConsentTemplatesPanel
            systemTemplates={systemTemplates}
            clinicTemplates={clinicTemplates}
          />
        </section>
      )}
```

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 5: Build final**

```bash
npx next build
```

Expected: compilación sin errores. Advertencias de tipos o lint son aceptables si no son errores de compilación.

- [ ] **Step 6: Commit final**

```bash
git add "app/(dashboard)/ajustes/page.tsx"
git commit -m "feat(consents): sección plantillas de consentimiento en Ajustes"
```

---

## Verificación manual post-implementación

1. Desde superadmin: activar el addon `consentimientos` para una clínica de prueba.
2. Entrar a la ficha de un paciente → verificar que aparece la sección "Consentimientos" al final.
3. Clic "Nuevo consentimiento" → verificar que el modal carga las 8 plantillas del sistema.
4. Seleccionar una plantilla → verificar que el texto se pre-rellena con nombre del paciente, fecha, doctor y clínica.
5. Clic "Firmar ahora" → verificar que aparece el canvas; dibujar una firma.
6. "Guardar firmado" → verificar que el consentimiento aparece en la lista con badge "Firmado".
7. "Ver / imprimir" → verificar que el PDF muestra la firma correctamente.
8. Guardar uno sin firma → verificar badge "Pendiente" y que el PDF muestra línea en blanco.
9. Ir a Ajustes → verificar sección "Plantillas de consentimiento" con las 8 plantillas del sistema.
10. "Usar como base" en una plantilla → verificar que aparece en "Plantillas de esta clínica" con prefijo "(Copia)".
11. Editar y eliminar una plantilla propia → verificar que funciona.
12. Desactivar el addon desde superadmin → verificar que la sección desaparece de la ficha y de Ajustes.
