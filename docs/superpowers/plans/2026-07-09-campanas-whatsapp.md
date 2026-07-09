# Campañas de WhatsApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new opt-in "Campañas" section where staff create a WhatsApp
campaign (name + message with a `{nombre}` placeholder), see every patient
with a phone number, and click "Enviar" per patient to open a prefilled
`wa.me` chat while the send is recorded in the database (button flips to
"Enviado ✓" and stays that way across reloads).

**Architecture:** New Postgres tables (`campaigns`, `campaign_sends`) with
RLS scoped by clinic, a new opt-in feature flag `campanas` (independent of
Baileys/`wa_masivo`), server actions for CRUD + marking sends, and two pages
(`/campanas` list, `/campanas/[id]` detail) following the existing
Next.js App Router + Supabase server-action patterns already used by
`anamnesis-invitation-actions.ts` and `RequestAnamnesisModal.tsx`.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS), TypeScript,
Tailwind, Vitest.

## Global Constraints

- Español neutro en toda la UI (sin voseo): "haz" no "hacé", "puedes" no "podés".
- NUNCA hacer push sin autorización explícita del usuario.
- No tocar `wa_masivo` ni el servicio Baileys (`whatsapp-service/`) — esta
  función es completamente manual vía `wa.me`, independiente de Baileys.
- Reusar `normalizePhone` de `lib/phone-utils.ts` tal cual, sin modificarlo.
- Migraciones nuevas van numeradas después de la última existente
  (`0078_anamnesis_invitations_delete.sql` → esta es `0079_campaigns.sql`).
- RLS es la fuente de verdad; los server actions añaden filtros explícitos de
  `clinic_id` como defensa en profundidad (patrón ya usado en todo el repo).

---

### Task 1: Migración de base de datos — `campaigns` y `campaign_sends`

**Files:**
- Create: `supabase/migrations/0079_campaigns.sql`

**Interfaces:**
- Produces: tablas `campaigns` (`id`, `clinic_id`, `name`, `message`,
  `created_by`, `created_at`) y `campaign_sends` (`id`, `campaign_id`,
  `patient_id`, `sent_by`, `sent_at`), con RLS activa. Estas son las tablas
  que consumen todas las tareas siguientes.

- [ ] **Step 1: Escribir la migración**

```sql
-- 0079_campaigns.sql — Campañas de WhatsApp (envío manual vía wa.me)
-- La clínica redacta un mensaje (con placeholder {nombre}) y lo envía manualmente,
-- paciente por paciente, abriendo wa.me con el chat prellenado. Esta tabla NO
-- envía nada por sí sola: solo registra qué mensaje se definió y a quién ya se
-- le envió, para que el progreso persista si el usuario cierra la página o
-- continúa la campaña otro día. Independiente de Baileys/wa_masivo.

create table if not exists campaigns (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  name       text not null,
  message    text not null, -- puede contener el placeholder literal "{nombre}"
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists campaigns_clinic_idx on campaigns (clinic_id);

create table if not exists campaign_sends (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  sent_by     uuid references profiles(id) on delete set null,
  sent_at     timestamptz not null default now(),
  unique (campaign_id, patient_id)
);

create index if not exists campaign_sends_campaign_idx on campaign_sends (campaign_id);

alter table campaigns enable row level security;
alter table campaign_sends enable row level security;

-- campaigns: admin, recepcionista y colega (mismos roles que ven wa_masivo)
-- pueden leer, crear y borrar campañas de su propia clínica.
drop policy if exists campaigns_select on campaigns;
create policy campaigns_select on campaigns
  for select
  using (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) in ('admin', 'recepcionista', 'colega')
  );

drop policy if exists campaigns_insert on campaigns;
create policy campaigns_insert on campaigns
  for insert
  with check (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) in ('admin', 'recepcionista', 'colega')
  );

drop policy if exists campaigns_delete on campaigns;
create policy campaigns_delete on campaigns
  for delete
  using (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) in ('admin', 'recepcionista', 'colega')
  );

-- campaign_sends: no tiene clinic_id propio; se valida vía join a campaigns.
drop policy if exists campaign_sends_select on campaign_sends;
create policy campaign_sends_select on campaign_sends
  for select
  using (
    exists (
      select 1 from campaigns c
      where c.id = campaign_sends.campaign_id
        and c.clinic_id = (select auth_clinic_id())
    )
    and (select auth_role()) in ('admin', 'recepcionista', 'colega')
  );

drop policy if exists campaign_sends_insert on campaign_sends;
create policy campaign_sends_insert on campaign_sends
  for insert
  with check (
    exists (
      select 1 from campaigns c
      where c.id = campaign_sends.campaign_id
        and c.clinic_id = (select auth_clinic_id())
    )
    and (select auth_role()) in ('admin', 'recepcionista', 'colega')
  );

drop policy if exists campaign_sends_delete on campaign_sends;
create policy campaign_sends_delete on campaign_sends
  for delete
  using (
    exists (
      select 1 from campaigns c
      where c.id = campaign_sends.campaign_id
        and c.clinic_id = (select auth_clinic_id())
    )
    and (select auth_role()) in ('admin', 'recepcionista', 'colega')
  );

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Verificar que la migración corre limpia en local**

Run: `npx supabase migration up` (o el comando que uses habitualmente para
aplicar migraciones locales — revisar `docs/DEPLOY-MIGRACIONES.md` si hay
dudas del flujo del proyecto).
Expected: la migración se aplica sin errores y las tablas `campaigns` /
`campaign_sends` aparecen en el esquema local.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0079_campaigns.sql
git commit -m "feat(campanas): tablas campaigns y campaign_sends con RLS"
```

---

### Task 2: Helper puro de mensaje — placeholder `{nombre}` y link `wa.me`

**Files:**
- Create: `lib/campaign-message.ts`
- Test: `tests/campaign-message.test.ts`

**Interfaces:**
- Consumes: `normalizePhone` de `lib/phone-utils.ts` (`(raw: string | null | undefined) => string | null`).
- Produces:
  - `firstName(fullName: string): string`
  - `applyNamePlaceholder(message: string, fullName: string): string`
  - `buildCampaignWaLink(phone: string | null | undefined, message: string, fullName: string): string | null`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// tests/campaign-message.test.ts
import { describe, it, expect } from "vitest";
import {
  firstName,
  applyNamePlaceholder,
  buildCampaignWaLink,
} from "@/lib/campaign-message";

describe("firstName", () => {
  it("devuelve la primera palabra del nombre completo", () => {
    expect(firstName("Juan Pérez López")).toBe("Juan");
  });

  it("recorta espacios extra", () => {
    expect(firstName("  María   Fernanda Gómez")).toBe("María");
  });

  it("nombre de una sola palabra se devuelve tal cual", () => {
    expect(firstName("Pedro")).toBe("Pedro");
  });

  it("cadena vacía devuelve cadena vacía", () => {
    expect(firstName("")).toBe("");
  });
});

describe("applyNamePlaceholder", () => {
  it("reemplaza {nombre} por el primer nombre del paciente", () => {
    expect(applyNamePlaceholder("Hola {nombre}, tenemos una promo", "Juan Pérez")).toBe(
      "Hola Juan, tenemos una promo",
    );
  });

  it("reemplaza TODAS las ocurrencias de {nombre}", () => {
    expect(applyNamePlaceholder("{nombre}, hola {nombre}!", "Ana López")).toBe(
      "Ana, hola Ana!",
    );
  });

  it("mensaje sin placeholder se devuelve sin cambios", () => {
    expect(applyNamePlaceholder("Promo para todos", "Juan Pérez")).toBe(
      "Promo para todos",
    );
  });
});

describe("buildCampaignWaLink", () => {
  it("arma el link wa.me con el teléfono normalizado y el mensaje codificado", () => {
    const link = buildCampaignWaLink("71234567", "Hola {nombre}!", "Juan Pérez");
    expect(link).toBe(
      "https://wa.me/59171234567?text=" + encodeURIComponent("Hola Juan!"),
    );
  });

  it("teléfono inválido devuelve null", () => {
    expect(buildCampaignWaLink("abc", "Hola {nombre}", "Juan Pérez")).toBeNull();
  });

  it("teléfono null devuelve null", () => {
    expect(buildCampaignWaLink(null, "Hola {nombre}", "Juan Pérez")).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar el test para confirmar que falla**

Run: `npx vitest run tests/campaign-message.test.ts`
Expected: FAIL — `Cannot find module '@/lib/campaign-message'`

- [ ] **Step 3: Implementar `lib/campaign-message.ts`**

```typescript
// lib/campaign-message.ts
// Helpers puros para armar el mensaje y el link de wa.me de una campaña.
// Reutiliza normalizePhone (mismo criterio que el resto de la app para
// distinguir celulares bolivianos de números internacionales).
import { normalizePhone } from "@/lib/phone-utils";

// Primer nombre de un nombre completo, para no sonar demasiado formal en el
// saludo ("Hola Juan" en vez de "Hola Juan Pérez López").
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

// Reemplaza TODAS las ocurrencias del placeholder literal "{nombre}" por el
// primer nombre del paciente. Si el mensaje no lo trae, se devuelve tal cual.
export function applyNamePlaceholder(message: string, fullName: string): string {
  return message.split("{nombre}").join(firstName(fullName));
}

// Arma el link de wa.me con el mensaje ya personalizado y codificado. Null si
// el teléfono no es válido (el llamador debe entonces ocultar el botón de
// enviar y mostrar el aviso de "sin teléfono").
export function buildCampaignWaLink(
  phone: string | null | undefined,
  message: string,
  fullName: string,
): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const text = applyNamePlaceholder(message, fullName);
  return `https://wa.me/${normalized.replace("+", "")}?text=${encodeURIComponent(text)}`;
}
```

- [ ] **Step 4: Ejecutar el test para confirmar que pasa**

Run: `npx vitest run tests/campaign-message.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/campaign-message.ts tests/campaign-message.test.ts
git commit -m "feat(campanas): helper de mensaje con placeholder {nombre} y link wa.me"
```

---

### Task 3: Feature flag `campanas` + acceso por rol

**Files:**
- Modify: `lib/features.ts`
- Modify: `lib/rbac.ts`
- Test: `tests/features.test.ts` (agregar casos, no reemplazar los existentes)

**Interfaces:**
- Consumes: nada nuevo (usa el patrón existente de `FeatureKey`, `FEATURES`,
  `normalizeFeatures`, `canSeeNav`).
- Produces: `FeatureKey` incluye `"campanas"`; `FEATURES` incluye la entrada
  correspondiente; `NAV_WHITELIST` de `admin`, `recepcionista` y `colega`
  incluye `"campanas"`.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `tests/features.test.ts`:

```typescript
describe("campanas (addon independiente de Baileys)", () => {
  it("apagado por defecto (opt-in)", () => {
    expect(normalizeFeatures({}).campanas).toBe(false);
  });

  it("se enciende con true explícito", () => {
    expect(normalizeFeatures({ campanas: true }).campanas).toBe(true);
  });

  it("encender campanas NO enciende whatsapp (Baileys)", () => {
    expect(normalizeFeatures({ campanas: true }).whatsapp).toBe(false);
  });

  it("está en el catálogo FEATURES como opt-in", () => {
    const entry = FEATURES.find((f) => f.key === "campanas");
    expect(entry?.optIn).toBe(true);
    expect(entry?.href).toBe("/campanas");
  });
});
```

- [ ] **Step 2: Ejecutar el test para confirmar que falla**

Run: `npx vitest run tests/features.test.ts`
Expected: FAIL — `campanas` no existe en `Features`/`FEATURES` (TypeScript
error o `undefined` en las aserciones).

- [ ] **Step 3: Agregar la key en `lib/features.ts`**

En el `type FeatureKey` (línea 5), agregar `| "campanas"` después de
`"wa_masivo"`:

```typescript
  | "wa_masivo"
  | "campanas"
  | "aviso_doctores"
```

En el arreglo `FEATURES` (después de la entrada de `wa_masivo`, línea 70),
agregar:

```typescript
  { key: "wa_masivo", label: "WhatsApp Masivo", href: "/wa-masivo", optIn: true },
  // Addon: campañas/promociones enviadas manualmente por WhatsApp (wa.me), sin
  // depender de Baileys. Independiente de wa_masivo: no enciende Baileys.
  { key: "campanas", label: "Campañas de WhatsApp", href: "/campanas", optIn: true },
```

No tocar `normalizeFeatures()` — `campanas` sigue el camino genérico opt-in
(`obj[f.key] === true`), y no se agrega a la línea que deriva `whatsapp`.

- [ ] **Step 4: Agregar el rol en `lib/rbac.ts`**

En `NAV_WHITELIST` (líneas 20-22), agregar `"campanas"` a `admin`,
`recepcionista` y `colega`:

```typescript
  admin:              ["inicio", "agenda", "pacientes", "mis_trabajos", "tratamientos", "inventario", "caja", "cuentas", "pagos", "ajustes", "auditoria", "calificaciones", "wa_masivo", "campanas"],
  recepcionista:      ["inicio", "agenda", "pacientes", "mis_trabajos", "wa_masivo", "campanas"],
  colega:             ["inicio", "agenda", "pacientes", "mis_trabajos", "calificaciones", "wa_masivo", "campanas"],
```

- [ ] **Step 5: Ejecutar el test para confirmar que pasa**

Run: `npx vitest run tests/features.test.ts`
Expected: PASS (todos los tests, incluidos los 4 nuevos)

- [ ] **Step 6: Correr el typecheck completo**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 7: Commit**

```bash
git add lib/features.ts lib/rbac.ts tests/features.test.ts
git commit -m "feat(campanas): feature flag campanas opt-in y acceso por rol"
```

---

### Task 4: Server actions de campañas

**Files:**
- Create: `app/(dashboard)/campanas/actions.ts`

**Interfaces:**
- Consumes: `getProfile()` de `lib/auth.ts` (`Promise<CurrentProfile | null>`
  con `{ userId, clinicId, role, fullName }`); `createClient()` de
  `lib/supabase/server.ts`; `getClinicFeatures()` de `lib/superadmin.ts`.
- Produces (usadas por las Tasks 5 y 6):
  - `type CampaignListItem = { id: string; name: string; message: string; createdAt: string; sentCount: number; totalPatients: number }`
  - `listCampaigns(): Promise<CampaignListItem[]>`
  - `type CreateCampaignState = { ok: true; id: string } | { ok: false; error: string }`
  - `createCampaign(name: string, message: string): Promise<CreateCampaignState>`
  - `type CampaignDetail = { id: string; name: string; message: string } | null`
  - `getCampaign(campaignId: string): Promise<CampaignDetail>`
  - `type CampaignPatientRow = { id: string; fullName: string; phone: string | null; sentAt: string | null }`
  - `listPatientsForCampaign(campaignId: string): Promise<CampaignPatientRow[]>` —
    devuelve TODOS los pacientes de la clínica (con y sin teléfono); el
    llamador separa por `phone` para mostrar a los que no tienen teléfono
    aparte, con aviso, sin botón de enviar.
  - `type SendState = { ok: true } | { ok: false; error: string }`
  - `markSent(campaignId: string, patientId: string): Promise<SendState>`
  - `unmarkSent(campaignId: string, patientId: string): Promise<SendState>`

- [ ] **Step 1: Implementar `app/(dashboard)/campanas/actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { getClinicFeatures } from "@/lib/superadmin";

export type CampaignListItem = {
  id: string;
  name: string;
  message: string;
  createdAt: string;
  sentCount: number;
  totalPatients: number;
};

export type CreateCampaignState =
  | { ok: true; id: string }
  | { ok: false; error: string };

export type CampaignDetail = { id: string; name: string; message: string } | null;

export type CampaignPatientRow = {
  id: string;
  fullName: string;
  phone: string | null;
  sentAt: string | null;
};

export type SendState = { ok: true } | { ok: false; error: string };

// Roles que pueden crear/enviar campañas (mismo criterio que wa_masivo).
const CAMPAIGN_ROLES = new Set(["admin", "recepcionista", "colega"]);

async function requireCampaignAccess() {
  const [profile, features] = await Promise.all([getProfile(), getClinicFeatures()]);
  if (!profile) return { error: "Sesión expirada." } as const;
  if (!features.campanas) return { error: "Módulo de campañas no habilitado." } as const;
  if (!CAMPAIGN_ROLES.has(profile.role)) return { error: "Sin permiso para campañas." } as const;
  return { profile } as const;
}

// Cuenta cuántos pacientes de la clínica tienen teléfono registrado — el
// universo total contra el que se calcula el progreso de una campaña.
async function countPatientsWithPhone(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicId: string,
): Promise<number> {
  const { count } = await supabase
    .from("patients")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .not("phone", "is", null)
    .neq("phone", "");
  return count ?? 0;
}

export async function listCampaigns(): Promise<CampaignListItem[]> {
  const access = await requireCampaignAccess();
  if ("error" in access) return [];
  const { profile } = access;

  const supabase = await createClient();
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name, message, created_at")
    .eq("clinic_id", profile.clinicId)
    .order("created_at", { ascending: false });

  if (!campaigns || campaigns.length === 0) return [];

  const totalPatients = await countPatientsWithPhone(supabase, profile.clinicId);

  const results: CampaignListItem[] = [];
  for (const c of campaigns) {
    const { count } = await supabase
      .from("campaign_sends")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", c.id);
    results.push({
      id: c.id,
      name: c.name,
      message: c.message,
      createdAt: c.created_at,
      sentCount: count ?? 0,
      totalPatients,
    });
  }
  return results;
}

export async function createCampaign(
  name: string,
  message: string,
): Promise<CreateCampaignState> {
  const access = await requireCampaignAccess();
  if ("error" in access) return { ok: false, error: access.error };
  const { profile } = access;

  const trimmedName = name.trim();
  const trimmedMessage = message.trim();
  if (!trimmedName) return { ok: false, error: "El nombre de la campaña es requerido." };
  if (!trimmedMessage) return { ok: false, error: "El mensaje es requerido." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      clinic_id: profile.clinicId,
      name: trimmedName,
      message: trimmedMessage,
      created_by: profile.userId,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo crear la campaña." };

  revalidatePath("/campanas");
  return { ok: true, id: data.id };
}

export async function getCampaign(campaignId: string): Promise<CampaignDetail> {
  const access = await requireCampaignAccess();
  if ("error" in access) return null;
  const { profile } = access;

  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("id, name, message")
    .eq("id", campaignId)
    .eq("clinic_id", profile.clinicId)
    .maybeSingle();

  return data ?? null;
}

// Devuelve TODOS los pacientes de la clínica (con y sin teléfono). El
// llamador (página de detalle) separa por `phone` para mostrar a los que no
// tienen teléfono en una sección aparte, con aviso y sin botón de enviar —
// no se filtran aquí para que ese conteo quede visible en la UI.
export async function listPatientsForCampaign(
  campaignId: string,
): Promise<CampaignPatientRow[]> {
  const access = await requireCampaignAccess();
  if ("error" in access) return [];
  const { profile } = access;

  const supabase = await createClient();

  const { data: patients } = await supabase
    .from("patients")
    .select("id, full_name, phone")
    .eq("clinic_id", profile.clinicId)
    .order("full_name", { ascending: true });

  if (!patients || patients.length === 0) return [];

  const { data: sends } = await supabase
    .from("campaign_sends")
    .select("patient_id, sent_at")
    .eq("campaign_id", campaignId);

  const sentMap = new Map((sends ?? []).map((s) => [s.patient_id, s.sent_at]));

  return patients.map((p) => ({
    id: p.id,
    fullName: p.full_name,
    phone: p.phone,
    sentAt: sentMap.get(p.id) ?? null,
  }));
}

export async function markSent(campaignId: string, patientId: string): Promise<SendState> {
  const access = await requireCampaignAccess();
  if ("error" in access) return { ok: false, error: access.error };
  const { profile } = access;

  const supabase = await createClient();

  // Confirmar que la campaña pertenece a la clínica (defensa en profundidad).
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .eq("clinic_id", profile.clinicId)
    .maybeSingle();
  if (!campaign) return { ok: false, error: "Campaña no encontrada." };

  // Upsert idempotente: si dos pestañas marcan el mismo paciente casi a la
  // vez, la segunda no falla ni duplica la fila.
  const { error } = await supabase
    .from("campaign_sends")
    .upsert(
      { campaign_id: campaignId, patient_id: patientId, sent_by: profile.userId },
      { onConflict: "campaign_id,patient_id", ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/campanas/${campaignId}`);
  revalidatePath("/campanas");
  return { ok: true };
}

export async function unmarkSent(campaignId: string, patientId: string): Promise<SendState> {
  const access = await requireCampaignAccess();
  if ("error" in access) return { ok: false, error: access.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("campaign_sends")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("patient_id", patientId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/campanas/${campaignId}`);
  revalidatePath("/campanas");
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores en `app/(dashboard)/campanas/actions.ts`.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/campanas/actions.ts"
git commit -m "feat(campanas): server actions de campañas (crear, listar, marcar envío)"
```

---

### Task 5: Página de lista `/campanas` + modal "Nueva campaña"

**Files:**
- Create: `app/(dashboard)/campanas/page.tsx`
- Create: `components/campaigns/NewCampaignModal.tsx`

**Interfaces:**
- Consumes: `requireNavAccess` de `lib/guard.ts`; `getClinicFeatures` de
  `lib/superadmin.ts`; `listCampaigns`, `createCampaign` de
  `./actions.ts` (Task 4); `PageHeader`, `EmptyState`, `Button`, `Modal`,
  `Field`, `fieldInputClass` de `components/ui/*`; `toast` de `lib/toast.ts`.
- Produces: ruta `/campanas` navegable desde el sidebar (vía `FEATURES`/
  `NAV_WHITELIST` ya configurados en Task 3).

- [ ] **Step 1: Crear `components/campaigns/NewCampaignModal.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Field, FieldLabel, fieldInputClass } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { createCampaign } from "@/app/(dashboard)/campanas/actions";

export function NewCampaignModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await createCampaign(name, message);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast("Campaña creada.");
    setName("");
    setMessage("");
    onClose();
    router.push(`/campanas/${res.id}`);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva campaña"
      subtitle="Usa {nombre} en el mensaje para saludar a cada paciente por su nombre."
    >
      <div className="space-y-4">
        <Field
          label="Nombre de la campaña"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Promo limpieza julio"
        />
        <label className="block text-sm">
          <FieldLabel>Mensaje</FieldLabel>
          <textarea
            className={fieldInputClass}
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Hola {nombre}, tenemos una promoción especial para ti..."
          />
        </label>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Creando..." : "Crear campaña"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Crear `app/(dashboard)/campanas/page.tsx`**

```tsx
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { requireNavAccess } from "@/lib/guard";
import { getClinicFeatures } from "@/lib/superadmin";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { listCampaigns } from "./actions";
import { CampaignListClient } from "@/components/campaigns/CampaignListClient";

export default async function CampanasPage() {
  await requireNavAccess("campanas");
  const features = await getClinicFeatures();

  if (!features.campanas) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-700">
        El módulo <strong>Campañas de WhatsApp</strong> no está habilitado
        para esta clínica. Actívalo desde el panel de Superadmin.
      </div>
    );
  }

  const campaigns = await listCampaigns();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campañas de WhatsApp"
        subtitle="Envía promociones y avisos a tus pacientes por WhatsApp, uno por uno."
      />

      <CampaignListClient />

      {campaigns.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-6 w-6" />}
          title="Aún no hay campañas"
          description="Crea la primera campaña para empezar a enviar promociones a tus pacientes."
        />
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/campanas/${c.id}`}
              className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm first:border-t-0 hover:bg-slate-50"
            >
              <div>
                <p className="font-medium text-slate-800">{c.name}</p>
                <p className="mt-0.5 max-w-md truncate text-xs text-slate-400">{c.message}</p>
              </div>
              <span className="shrink-0 text-xs font-medium text-slate-500">
                {c.sentCount} de {c.totalPatients} enviados
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Crear `components/campaigns/CampaignListClient.tsx`**

Componente cliente pequeño que solo controla el modal de "Nueva campaña"
(el server component de arriba no puede manejar `useState`).

```tsx
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { NewCampaignModal } from "@/components/campaigns/NewCampaignModal";

export function CampaignListClient() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex justify-end">
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nueva campaña
      </Button>
      <NewCampaignModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 4: Levantar el dev server y verificar manualmente**

Run: `npm run dev`
Visitar `/campanas` con una clínica que tenga el addon `campanas` encendido
(activar manualmente vía SQL local si hace falta:
`update clinics set features = features || '{"campanas": true}'::jsonb where id = '<clinicId>';`).
Expected: aparece el estado vacío, el botón "Nueva campaña" abre el modal,
al crear una campaña redirige a `/campanas/<id>` (esta ruta se implementa en
la Task 6 — es esperable un 404 momentáneo hasta completarla).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/campanas/page.tsx" components/campaigns/NewCampaignModal.tsx components/campaigns/CampaignListClient.tsx
git commit -m "feat(campanas): página de lista y modal de nueva campaña"
```

---

### Task 6: Página de detalle `/campanas/[id]` + botón de envío por paciente

**Files:**
- Create: `app/(dashboard)/campanas/[id]/page.tsx`
- Create: `components/campaigns/CampaignSendRow.tsx`

**Interfaces:**
- Consumes: `getCampaign`, `listPatientsForCampaign`, `markSent`, `unmarkSent`
  de `../actions.ts` (Task 4); `buildCampaignWaLink` de `lib/campaign-message.ts`
  (Task 2); `notFound` de `next/navigation`; `PageHeader`, `EmptyState` de
  `components/ui/*`.
- Produces: ruta `/campanas/[id]` completa — cierre del flujo de campañas.

- [ ] **Step 1: Crear `components/campaigns/CampaignSendRow.tsx`**

```tsx
"use client";

import { useState } from "react";
import { ExternalLink, Check, Undo2 } from "lucide-react";
import { buildCampaignWaLink } from "@/lib/campaign-message";
import { markSent, unmarkSent } from "@/app/(dashboard)/campanas/actions";
import { cn } from "@/lib/cn";

export function CampaignSendRow({
  campaignId,
  patientId,
  fullName,
  phone,
  message,
  initialSentAt,
}: {
  campaignId: string;
  patientId: string;
  fullName: string;
  phone: string | null;
  message: string;
  initialSentAt: string | null;
}) {
  const [sentAt, setSentAt] = useState(initialSentAt);
  const [pending, setPending] = useState(false);

  const waLink = buildCampaignWaLink(phone, message, fullName);

  async function handleSend() {
    if (!waLink) return;
    window.open(waLink, "_blank", "noopener,noreferrer");
    // Optimista: marcamos enviado de inmediato; revertimos si la action falla.
    const prev = sentAt;
    setSentAt(new Date().toISOString());
    setPending(true);
    const res = await markSent(campaignId, patientId);
    setPending(false);
    if (!res.ok) setSentAt(prev);
  }

  async function handleUndo() {
    const prev = sentAt;
    setSentAt(null);
    setPending(true);
    const res = await unmarkSent(campaignId, patientId);
    setPending(false);
    if (!res.ok) setSentAt(prev);
  }

  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-sm first:border-t-0">
      <div>
        <p className="font-medium text-slate-800">{fullName}</p>
        <p className="text-xs text-slate-400">{phone}</p>
      </div>
      {sentAt ? (
        <button
          onClick={handleUndo}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          title="Deshacer"
        >
          <Check className="h-3.5 w-3.5" />
          Enviado
          <Undo2 className="h-3 w-3 opacity-60" />
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={!waLink || pending}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
            waLink
              ? "bg-green-600 text-white hover:bg-green-700"
              : "cursor-not-allowed bg-slate-100 text-slate-400",
          )}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Enviar
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Crear `app/(dashboard)/campanas/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { requireNavAccess } from "@/lib/guard";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { getCampaign, listPatientsForCampaign } from "../actions";
import { CampaignSendRow } from "@/components/campaigns/CampaignSendRow";
import { PhoneOff } from "lucide-react";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireNavAccess("campanas");
  const { id } = await params;

  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  const allPatients = await listPatientsForCampaign(id);
  const withPhone = allPatients.filter((p) => p.phone && p.phone.trim());
  const withoutPhone = allPatients.filter((p) => !p.phone || !p.phone.trim());
  const sentCount = withPhone.filter((p) => p.sentAt).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.name}
        subtitle={`${sentCount} de ${withPhone.length} pacientes con teléfono ya recibieron este mensaje.`}
      />

      <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
        {campaign.message}
      </div>

      {withPhone.length === 0 ? (
        <EmptyState
          icon={<PhoneOff className="h-6 w-6" />}
          title="No hay pacientes con teléfono registrado"
          description="Agrega el teléfono en la ficha del paciente para poder enviarle campañas."
        />
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          {withPhone.map((p) => (
            <CampaignSendRow
              key={p.id}
              campaignId={id}
              patientId={p.id}
              fullName={p.fullName}
              phone={p.phone}
              message={campaign.message}
              initialSentAt={p.sentAt}
            />
          ))}
        </div>
      )}

      {withoutPhone.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
            <PhoneOff className="h-3.5 w-3.5" />
            {withoutPhone.length} paciente{withoutPhone.length !== 1 ? "s" : ""} sin
            teléfono registrado (no se les puede enviar):
          </p>
          <div className="overflow-hidden rounded-lg bg-slate-50 ring-1 ring-slate-200">
            {withoutPhone.map((p) => (
              <div
                key={p.id}
                className="border-t border-slate-200 px-4 py-2 text-sm text-slate-500 first:border-t-0"
              >
                {p.fullName}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificación manual end-to-end**

Run: `npm run dev`
1. Ir a `/campanas`, crear una campaña con mensaje `Hola {nombre}, tenemos
   una promoción especial 🦷`.
2. Confirmar redirección a `/campanas/<id>` y que la lista de pacientes con
   teléfono aparece.
3. Clic en "Enviar" en un paciente: se abre una pestaña nueva a
   `https://wa.me/...` con el mensaje ya con el primer nombre reemplazado, y
   el botón cambia a "Enviado" (verde) sin recargar la página.
4. Recargar la página (`F5`): el paciente sigue marcado "Enviado" (persistió
   en DB).
5. Clic en "Enviado" para deshacer: vuelve a "Enviar".
6. Volver a `/campanas`: el contador de la campaña refleja "1 de N enviados".
Expected: todos los pasos se comportan como se describe, sin errores en
consola del navegador ni del servidor.

- [ ] **Step 4: Typecheck y suite completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin errores de tipos; todos los tests (incluidos los nuevos de
`campaign-message.test.ts` y `features.test.ts`) pasan.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/campanas/[id]/page.tsx" components/campaigns/CampaignSendRow.tsx
git commit -m "feat(campanas): página de detalle con envío por paciente vía wa.me"
```

---

## Pendiente tras este plan (fuera de alcance, no implementar aquí)

- Activar el addon `campanas` para clínicas específicas desde el panel de
  Superadmin (ya funciona automáticamente vía el mecanismo genérico de
  `FEATURES`/superadmin — no requiere código nuevo, solo que el usuario lo
  encienda por clínica).
- Aplicar la migración `0079_campaigns.sql` en producción (dashboard de
  Supabase, según `docs/DEPLOY-MIGRACIONES.md`) antes de que cualquier
  clínica use el módulo.
