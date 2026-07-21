# Cobro de Suscripción por QR (Fase 0) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cobrar mensualmente a cada clínica por QR/transferencia manual (sin Stripe): generar un cargo el día 1 de cada mes, mostrar un aviso al admin de la clínica con el QR de Paulo, dejar que reporte el pago, que Paulo lo confirme desde Superadmin, y bloquear el acceso de forma suave (sin borrar datos) si nadie paga a tiempo.

**Architecture:** Una tabla `subscription_invoices` (una fila por clínica por mes) cuyo estado (`pending → reported → confirmed`) determina, junto con la fecha de hoy, si se bloquea el acceso — el bloqueo NUNCA se guarda, se calcula en cada carga con una función pura (`computeBillingGate`). Un cron mensual genera los cargos; toda escritura de estado pasa por server actions con service-role (la tabla solo tiene policy de SELECT). El diseño es agnóstico al medio de pago: cambiar a Stripe después solo cambiaría quién llama a `confirmPayment`.

**Tech Stack:** Next.js App Router (server actions + route handlers), Supabase (Postgres + RLS), Cloudflare R2 (comprobantes y QR, URLs firmadas), Vercel Cron, Vitest.

## Global Constraints

- **Sin Stripe, sin tarjetas.** Solo QR/transferencia manual confirmada a mano.
- **Nunca borrar datos** al bloquear: el acceso se restaura intacto al confirmar el pago.
- **Gatear siempre** (no es un addon apagable en `lib/features.ts`): una clínica sin `monthly_amount` configurado simplemente nunca se cobra ni se bloquea.
- **7 días de gracia** por defecto (`DEFAULT_GRACE_DAYS`), configurable por Paulo.
- **Comprobante opcional** al reportar un pago.
- **Sin aviso por WhatsApp en v1** — solo banner in-app.
- **Bloqueo completo** (no modo solo-lectura), pero solo el `admin` de la clínica ve el QR/instrucciones en la pantalla de bloqueo; otros roles ven un mensaje genérico.
- **El banner de recordatorio de pago solo lo ve el rol `admin`** — el tema de cobro es entre Paulo y el dueño de la clínica.
- Todas las fechas se comparan como strings `"YYYY-MM-DD"` (comparación lexicográfica), nunca con objetos `Date` en zona horaria ambigua — mismo criterio que `boliviaTodayISO()` en el resto del proyecto.
- Migraciones idempotentes (`create table if not exists`, `create index if not exists`, `drop policy if exists` antes de `create policy`), cerrando con `notify pgrst, 'reload schema';` (convención de `docs/DEPLOY-MIGRACIONES.md`).
- Spec completo: `docs/superpowers/specs/2026-07-06-suscripciones-cobro-qr-design.md`.

---

### Task 1: Migración — `subscription_invoices` + `platform_settings`

**Files:**
- Create: `supabase/migrations/0079_subscription_billing.sql`

**Interfaces:**
- Produces: tabla `subscription_invoices` (columnas: `id, clinic_id, period, amount, currency, status, due_date, reported_at, reported_by, receipt_key, confirmed_at, note, created_at`) y tabla `platform_settings` (`key, value, updated_at`). Todas las tareas siguientes leen/escriben estas dos tablas.

- [ ] **Step 1: Escribir la migración**

```sql
-- 0079_subscription_billing.sql
-- Cobro de suscripción (Fase 0, sin Stripe): una factura por clínica por mes,
-- pagada por QR/transferencia y confirmada a mano desde Superadmin. Ver diseño
-- en docs/superpowers/specs/2026-07-06-suscripciones-cobro-qr-design.md.

create table if not exists subscription_invoices (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  period        date not null,               -- primer día del mes cobrado
  amount        numeric(12,2) not null,       -- monto en Bs, congelado al generar
  currency      text not null default 'BOB',
  status        text not null default 'pending', -- pending | reported | confirmed
  due_date      date not null,                -- period + días de gracia
  reported_at   timestamptz,                  -- cuándo el admin tocó "Ya pagué"
  reported_by   uuid references profiles(id) on delete set null,
  receipt_key   text,                         -- comprobante en R2 (opcional)
  confirmed_at  timestamptz,                  -- cuándo Paulo confirmó
  note          text,                         -- nota interna (ej. motivo de rechazo)
  created_at    timestamptz not null default now(),
  unique (clinic_id, period)                  -- idempotencia del cron
);

create index if not exists subscription_invoices_clinic_idx
  on subscription_invoices (clinic_id, period desc);

alter table subscription_invoices enable row level security;

-- Solo SELECT para la propia clínica. A propósito NO hay policy de
-- insert/update/delete: ningún admin de clínica puede tocar su propio estado
-- de pago. Todas las escrituras van por server actions con service-role
-- (createAdminClient), acotadas explícitamente por clinic_id y rol.
drop policy if exists subinv_select_own on subscription_invoices;
create policy subinv_select_own on subscription_invoices for select
  using (clinic_id = (select auth_clinic_id()));

-- Configuración global de la plataforma (clave-valor). Aquí vive el QR de
-- pago de Paulo, las instrucciones y los días de gracia. RLS activa SIN
-- policies = denegado para anon/authenticated; solo el service-role
-- (Superadmin, cron) la toca.
create table if not exists platform_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table platform_settings enable row level security;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Aplicar en local y verificar**

Run: `npm run db:reset`

Expected: el reset corre todas las migraciones sin error, terminando en `0079_subscription_billing.sql` aplicada.

Verifica las tablas y policies con el SQL Editor de Supabase Studio local (`npm run db:start` deja Studio en `http://127.0.0.1:54323`):

```sql
select tablename, rowsecurity from pg_tables
where tablename in ('subscription_invoices', 'platform_settings');
-- ambas deben mostrar rowsecurity = true

select policyname, cmd from pg_policies where tablename = 'subscription_invoices';
-- debe mostrar únicamente: subinv_select_own | SELECT
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0079_subscription_billing.sql
git commit -m "feat(billing): migracion subscription_invoices + platform_settings"
```

---

### Task 2: Lógica pura de facturación (`lib/billingStatus.ts`)

**Files:**
- Create: `lib/billingStatus.ts`
- Test: `tests/billingStatus.test.ts`

**Interfaces:**
- Consumes: nada (módulo puro, sin dependencias de Supabase ni `server-only`).
- Produces (usado por Tasks 3–6):
  - `DEFAULT_GRACE_DAYS: number`
  - `type InvoiceStatus = "pending" | "reported" | "confirmed"`
  - `type InvoiceForGate = { status: InvoiceStatus; due_date: string }`
  - `type BillingGate = { blocked: boolean; banner: "none" | "pending" | "reported" }`
  - `computeBillingGate(invoice: InvoiceForGate | null, todayISO: string): BillingGate`
  - `type ClinicBillingConfig = { monthlyAmount: number; exempt: boolean; lineItems: string | null }`
  - `parseClinicBillingConfig(rawSettings: unknown): ClinicBillingConfig`
  - `shouldBillClinic(config: ClinicBillingConfig): boolean`
  - `periodStartISO(todayISO: string): string`
  - `dueDateISO(periodISO: string, graceDays: number): string`
  - `daysUntilDue(todayISO: string, dueISO: string): number`

- [ ] **Step 1: Escribir los tests (fallarán: el módulo no existe aún)**

```typescript
// tests/billingStatus.test.ts
import { describe, it, expect } from "vitest";
import {
  computeBillingGate,
  parseClinicBillingConfig,
  shouldBillClinic,
  periodStartISO,
  dueDateISO,
  daysUntilDue,
  DEFAULT_GRACE_DAYS,
} from "@/lib/billingStatus";

describe("computeBillingGate", () => {
  it("sin factura: sin aviso, sin bloqueo", () => {
    expect(computeBillingGate(null, "2026-07-15")).toEqual({ blocked: false, banner: "none" });
  });

  it("confirmed: sin aviso, sin bloqueo", () => {
    expect(
      computeBillingGate({ status: "confirmed", due_date: "2026-07-08" }, "2026-07-20"),
    ).toEqual({ blocked: false, banner: "none" });
  });

  it("reported: banner de verificación, nunca bloquea", () => {
    expect(
      computeBillingGate({ status: "reported", due_date: "2026-07-08" }, "2026-07-20"),
    ).toEqual({ blocked: false, banner: "reported" });
  });

  it("pending antes del vencimiento: banner, sin bloqueo", () => {
    expect(
      computeBillingGate({ status: "pending", due_date: "2026-07-08" }, "2026-07-05"),
    ).toEqual({ blocked: false, banner: "pending" });
  });

  it("pending el mismo día del vencimiento: bloquea", () => {
    expect(
      computeBillingGate({ status: "pending", due_date: "2026-07-08" }, "2026-07-08"),
    ).toEqual({ blocked: true, banner: "pending" });
  });

  it("pending después del vencimiento: bloquea", () => {
    expect(
      computeBillingGate({ status: "pending", due_date: "2026-07-08" }, "2026-07-15"),
    ).toEqual({ blocked: true, banner: "pending" });
  });
});

describe("parseClinicBillingConfig", () => {
  it("sin settings.billing: monto 0, no exenta", () => {
    expect(parseClinicBillingConfig(null)).toEqual({ monthlyAmount: 0, exempt: false, lineItems: null });
    expect(parseClinicBillingConfig({})).toEqual({ monthlyAmount: 0, exempt: false, lineItems: null });
  });

  it("lee monto, exempt y line_items", () => {
    expect(
      parseClinicBillingConfig({
        billing: { monthly_amount: 350, exempt: false, line_items: "Plan base" },
      }),
    ).toEqual({ monthlyAmount: 350, exempt: false, lineItems: "Plan base" });
  });

  it("monto negativo o no numérico se trata como 0", () => {
    expect(parseClinicBillingConfig({ billing: { monthly_amount: -10 } }).monthlyAmount).toBe(0);
    expect(parseClinicBillingConfig({ billing: { monthly_amount: "abc" } }).monthlyAmount).toBe(0);
  });
});

describe("shouldBillClinic", () => {
  it("true si hay monto positivo y no está exenta", () => {
    expect(shouldBillClinic({ monthlyAmount: 350, exempt: false, lineItems: null })).toBe(true);
  });
  it("false sin monto", () => {
    expect(shouldBillClinic({ monthlyAmount: 0, exempt: false, lineItems: null })).toBe(false);
  });
  it("false si está exenta aunque tenga monto", () => {
    expect(shouldBillClinic({ monthlyAmount: 350, exempt: true, lineItems: null })).toBe(false);
  });
});

describe("periodStartISO", () => {
  it("devuelve el primer día del mes de la fecha dada", () => {
    expect(periodStartISO("2026-07-15")).toBe("2026-07-01");
    expect(periodStartISO("2026-01-31")).toBe("2026-01-01");
  });
});

describe("dueDateISO", () => {
  it("suma los días de gracia al período", () => {
    expect(dueDateISO("2026-07-01", 7)).toBe("2026-07-08");
    expect(dueDateISO("2026-07-01", DEFAULT_GRACE_DAYS)).toBe("2026-07-08");
  });

  it("cruza el fin de mes correctamente", () => {
    expect(dueDateISO("2026-01-01", 31)).toBe("2026-02-01");
  });
});

describe("daysUntilDue", () => {
  it("positivo si falta para vencer", () => {
    expect(daysUntilDue("2026-07-01", "2026-07-08")).toBe(7);
  });
  it("cero el día del vencimiento", () => {
    expect(daysUntilDue("2026-07-08", "2026-07-08")).toBe(0);
  });
  it("negativo si ya venció", () => {
    expect(daysUntilDue("2026-07-10", "2026-07-08")).toBe(-2);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run tests/billingStatus.test.ts`

Expected: FAIL — `Cannot find module '@/lib/billingStatus'` (el archivo aún no existe).

- [ ] **Step 3: Implementar `lib/billingStatus.ts`**

```typescript
// lib/billingStatus.ts
// Lógica pura de facturación de suscripción (Fase 0, cobro por QR manual).
// Sin "server-only" ni dependencias de Supabase para poder testearla directo
// (mismo patrón que lib/storageLimits.ts, re-exportado por lib/storage.ts).

export const DEFAULT_GRACE_DAYS = 7;

export type InvoiceStatus = "pending" | "reported" | "confirmed";

export type InvoiceForGate = {
  status: InvoiceStatus;
  due_date: string; // "YYYY-MM-DD"
};

export type BillingGate = {
  blocked: boolean;
  banner: "none" | "pending" | "reported";
};

// El bloqueo NUNCA se guarda: se deriva de la factura más reciente + la fecha
// de hoy. "confirmed" nunca bloquea; "reported" nunca bloquea (confía en el
// reporte hasta que Paulo lo rechace); "pending" bloquea solo si ya venció.
export function computeBillingGate(
  invoice: InvoiceForGate | null,
  todayISO: string,
): BillingGate {
  if (!invoice) return { blocked: false, banner: "none" };
  if (invoice.status === "confirmed") return { blocked: false, banner: "none" };
  if (invoice.status === "reported") return { blocked: false, banner: "reported" };
  // status === "pending": comparación lexicográfica de "YYYY-MM-DD" (sin Date).
  const blocked = todayISO >= invoice.due_date;
  return { blocked, banner: "pending" };
}

export type ClinicBillingConfig = {
  monthlyAmount: number;
  exempt: boolean;
  lineItems: string | null;
};

// Lee clinics.settings.billing (jsonb). Sin monto configurado = no se cobra.
export function parseClinicBillingConfig(rawSettings: unknown): ClinicBillingConfig {
  const settings = (rawSettings ?? {}) as Record<string, unknown>;
  const billing = (settings.billing ?? {}) as Record<string, unknown>;
  const amount = Number(billing.monthly_amount);
  return {
    monthlyAmount: Number.isFinite(amount) && amount > 0 ? amount : 0,
    exempt: billing.exempt === true,
    lineItems: typeof billing.line_items === "string" ? billing.line_items : null,
  };
}

export function shouldBillClinic(config: ClinicBillingConfig): boolean {
  return config.monthlyAmount > 0 && !config.exempt;
}

// "2026-07-15" -> "2026-07-01"
export function periodStartISO(todayISO: string): string {
  return `${todayISO.slice(0, 7)}-01`;
}

// "2026-07-01" + 7 -> "2026-07-08". Suma en UTC (solo se manejan fechas
// calendario, sin hora), evita cualquier ambigüedad de zona horaria.
export function dueDateISO(periodISO: string, graceDays: number): string {
  const d = new Date(`${periodISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + graceDays);
  return d.toISOString().slice(0, 10);
}

// Días enteros hasta el vencimiento (negativo si ya venció). Para escalar el
// color del banner de recordatorio.
export function daysUntilDue(todayISO: string, dueISO: string): number {
  const a = new Date(`${todayISO}T00:00:00Z`).getTime();
  const b = new Date(`${dueISO}T00:00:00Z`).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run tests/billingStatus.test.ts`

Expected: PASS — 15 tests verdes (6 + 3 + 3 + 1 + 2 + 3... cuenta exacta no importa, deben pasar todos sin fallos).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add lib/billingStatus.ts tests/billingStatus.test.ts
git commit -m "feat(billing): logica pura de gate y config de facturacion"
```

---

### Task 3: Helpers de servidor (`lib/billing.ts`)

**Files:**
- Create: `lib/billing.ts`

**Interfaces:**
- Consumes: `DEFAULT_GRACE_DAYS`, `InvoiceStatus` de `lib/billingStatus.ts` (Task 2); `createClient` de `lib/supabase/server`; `createAdminClient` de `lib/supabase/admin`; `presignDownload` de `lib/r2`.
- Produces (usado por Tasks 5, 6, 8):
  - `type LatestInvoice = { id: string; period: string; amount: number; currency: string; status: InvoiceStatus; due_date: string; reported_at: string | null; receipt_key: string | null; confirmed_at: string | null; note: string | null }`
  - `getLatestInvoice(clinicId: string): Promise<LatestInvoice | null>` (cacheado por request con `cache()`)
  - `type PlatformPaymentSettings = { qrKey: string | null; instructions: string; graceDays: number }`
  - `getPlatformPaymentSettings(): Promise<PlatformPaymentSettings>` (cacheado por request)
  - `getPlatformQrUrl(): Promise<string | null>`
  - Re-exporta todo `lib/billingStatus.ts` (mismo patrón que `lib/storage.ts` re-exporta `lib/storageLimits.ts`).

- [ ] **Step 1: Implementar `lib/billing.ts`**

```typescript
// lib/billing.ts
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { presignDownload } from "@/lib/r2";
import { DEFAULT_GRACE_DAYS, type InvoiceStatus } from "@/lib/billingStatus";

export * from "@/lib/billingStatus";

export type LatestInvoice = {
  id: string;
  period: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  due_date: string;
  reported_at: string | null;
  receipt_key: string | null;
  confirmed_at: string | null;
  note: string | null;
};

// La factura más reciente de la clínica = su estado de cobro actual. Cacheado
// por request: el layout (gate) y la página /suscripcion piden lo mismo en la
// misma carga.
export const getLatestInvoice = cache(async (clinicId: string): Promise<LatestInvoice | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscription_invoices")
    .select("id, period, amount, currency, status, due_date, reported_at, receipt_key, confirmed_at, note")
    .eq("clinic_id", clinicId)
    .order("period", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as LatestInvoice | null) ?? null;
});

export type PlatformPaymentSettings = {
  qrKey: string | null;
  instructions: string;
  graceDays: number;
};

// platform_settings no tiene policy de SELECT para authenticated (a propósito):
// se lee con service-role. Es información pública dentro del dashboard (el QR
// de pago), no sensible por clínica.
export const getPlatformPaymentSettings = cache(async (): Promise<PlatformPaymentSettings> => {
  const admin = createAdminClient();
  const { data } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "payment")
    .maybeSingle();
  const v = (data?.value ?? {}) as Record<string, unknown>;
  const graceDays = Number(v.grace_days);
  return {
    qrKey: typeof v.qr_r2_key === "string" ? v.qr_r2_key : null,
    instructions: typeof v.instructions === "string" ? v.instructions : "",
    graceDays: Number.isFinite(graceDays) && graceDays > 0 ? graceDays : DEFAULT_GRACE_DAYS,
  };
});

export async function getPlatformQrUrl(): Promise<string | null> {
  const { qrKey } = await getPlatformPaymentSettings();
  if (!qrKey) return null;
  return presignDownload(qrKey, 600);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add lib/billing.ts
git commit -m "feat(billing): helpers de servidor para factura y config de pago"
```

---

### Task 4: Cron de generación mensual

**Files:**
- Create: `app/api/cron/subscriptions/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `parseClinicBillingConfig, shouldBillClinic, periodStartISO, dueDateISO, DEFAULT_GRACE_DAYS` de `lib/billingStatus.ts` (Task 2); `boliviaTodayISO` de `lib/format`; `createAdminClient` de `lib/supabase/admin`.
- Produces: endpoint `GET /api/cron/subscriptions` (protegido con `CRON_SECRET`, mismo patrón que `/api/cron/backup`).

- [ ] **Step 1: Implementar la ruta del cron**

```typescript
// app/api/cron/subscriptions/route.ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { boliviaTodayISO } from "@/lib/format";
import {
  parseClinicBillingConfig,
  shouldBillClinic,
  periodStartISO,
  dueDateISO,
  DEFAULT_GRACE_DAYS,
} from "@/lib/billingStatus";

// Cron mensual (ver vercel.json): genera la factura del mes para cada clínica
// con monto configurado. Idempotente vía upsert con ignoreDuplicates sobre el
// unique (clinic_id, period) — correr el cron dos veces el mismo día no duplica.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const { data: clinics, error } = await admin.from("clinics").select("id, settings");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const today = boliviaTodayISO();
  const period = periodStartISO(today);

  let generated = 0;
  let skipped = 0;

  for (const c of clinics ?? []) {
    const config = parseClinicBillingConfig(c.settings);
    if (!shouldBillClinic(config)) {
      skipped++;
      continue;
    }

    const due = dueDateISO(period, DEFAULT_GRACE_DAYS);
    const { data: inserted, error: insErr } = await admin
      .from("subscription_invoices")
      .upsert(
        { clinic_id: c.id, period, amount: config.monthlyAmount, due_date: due },
        { onConflict: "clinic_id,period", ignoreDuplicates: true },
      )
      .select("id");

    if (insErr) {
      console.error(`No se pudo generar factura para clínica ${c.id}:`, insErr.message);
      continue;
    }
    if (inserted && inserted.length > 0) generated++;
    else skipped++; // ya existía la factura de este período (idempotencia)
  }

  return NextResponse.json({ clinics: clinics?.length ?? 0, period, generated, skipped });
}
```

- [ ] **Step 2: Agregar el cron a `vercel.json`**

En `vercel.json`, agregar la entrada al array `crons` (08:00 Bolivia = 12:00 UTC, día 1 de cada mes):

```json
{
  "crons": [
    {
      "path": "/api/cron/reminders",
      "schedule": "0 13 * * *"
    },
    {
      "path": "/api/cron/photo-cleanup",
      "schedule": "0 4 * * 0"
    },
    {
      "path": "/api/cron/backup",
      "schedule": "0 5 * * 0"
    },
    {
      "path": "/api/cron/subscriptions",
      "schedule": "0 12 1 * *"
    }
  ]
}
```

- [ ] **Step 3: Verificación manual contra Supabase local**

Con `npm run db:start` corriendo y al menos una clínica con `settings.billing.monthly_amount` fijado (a mano por SQL mientras no existe aún el panel de Superadmin de Task 8):

```sql
update clinics set settings = jsonb_set(settings, '{billing}', '{"monthly_amount": 350}') where name = 'Sonrisa';
```

Levanta el server (`npm run dev`) y llama al cron (sin `CRON_SECRET` en local, o con el valor de tu `.env.local` si lo definiste):

```bash
curl http://localhost:3000/api/cron/subscriptions
```

Expected: `{"clinics":N,"period":"2026-07-01","generated":1,"skipped":N-1}` (ajusta el mes al actual). Repite el `curl`: la segunda vez `generated` debe ser `0` y esa clínica sumar a `skipped` (idempotencia). Verifica la fila en Studio:

```sql
select clinic_id, period, amount, status, due_date from subscription_invoices;
```

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/subscriptions/route.ts vercel.json
git commit -m "feat(billing): cron mensual de generacion de facturas"
```

---

### Task 5: Gate en el layout + pantalla de bloqueo + banner

**Files:**
- Create: `components/billing/SubscriptionBlockedScreen.tsx`
- Create: `components/billing/SubscriptionBanner.tsx`
- Create: `components/billing/ReportPaymentPanel.tsx` (usado también por Task 6, aquí solo el esqueleto sin las acciones reales — ver Step 3)
- Modify: `app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `getLatestInvoice, getPlatformPaymentSettings, getPlatformQrUrl, LatestInvoice` de `lib/billing.ts` (Task 3); `computeBillingGate, daysUntilDue, BillingGate` de `lib/billingStatus.ts` (Task 2); `boliviaTodayISO` de `lib/format`; `Role` de `lib/rbac`.
- Produces: `SubscriptionBlockedScreen({ clinicName, role, invoice })`, `SubscriptionBanner({ banner, amount, daysLeft })`, `ReportPaymentPanel({ invoice, qrUrl, instructions })` (esta última queda con un placeholder de acciones que Task 6 completa — su firma no cambia).

- [ ] **Step 1: `components/billing/ReportPaymentPanel.tsx`**

Este componente se usa tanto en la pantalla de bloqueo (admin) como en `/suscripcion` (Task 6). Las acciones del servidor (`requestReceiptUpload`, `reportPayment`) se crean recién en Task 6; aquí se importan con su firma ya fijada para que ambas tareas encajen sin retocar este archivo después.

```tsx
// components/billing/ReportPaymentPanel.tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, QrCode } from "lucide-react";
import { toast } from "@/lib/toast";
import { bs } from "@/lib/format";
import {
  requestReceiptUpload,
  reportPayment,
} from "@/app/(dashboard)/suscripcion/actions";
import type { LatestInvoice } from "@/lib/billing";

const ALLOWED_TYPES = ["image/webp", "image/png", "image/jpeg"];

export function ReportPaymentPanel({
  invoice,
  qrUrl,
  instructions,
}: {
  invoice: LatestInvoice;
  qrUrl: string | null;
  instructions: string;
}) {
  const [receiptKey, setReceiptKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  if (invoice.status === "reported") {
    return (
      <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
        Gracias, estamos verificando tu pago de {bs(invoice.amount)}. El acceso
        se reactivará apenas se confirme.
      </p>
    );
  }

  async function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast("Formato no permitido (usa PNG, JPG o WebP)", "error");
      return;
    }
    setUploading(true);
    const res = await requestReceiptUpload(invoice.id, file.type);
    if (!res.ok) {
      toast(res.error, "error");
      setUploading(false);
      return;
    }
    try {
      const put = await fetch(res.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!put.ok) throw new Error(`HTTP ${put.status}`);
      setReceiptKey(res.key);
      toast("Comprobante adjuntado", "success");
    } catch {
      toast("No se pudo subir el comprobante", "error");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleReportPayment() {
    startTransition(async () => {
      const res = await reportPayment(invoice.id, receiptKey);
      if (res.error) {
        toast(res.error, "error");
        return;
      }
      toast("Reportado. Estamos verificando tu pago.", "success");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-slate-50 p-4 text-center">
        {qrUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={qrUrl} alt="QR de pago" className="mx-auto h-48 w-48 object-contain" />
        ) : (
          <div className="flex h-48 items-center justify-center gap-2 text-slate-400">
            <QrCode className="h-6 w-6" /> QR no configurado aún
          </div>
        )}
        <p className="mt-2 text-lg font-bold text-slate-800">{bs(invoice.amount)}</p>
        {instructions && <p className="mt-1 text-xs text-slate-500">{instructions}</p>}
      </div>

      <div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Paperclip className="h-3.5 w-3.5" />
          )}
          {receiptKey ? "Comprobante adjuntado ✓" : "Adjuntar comprobante (opcional)"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => handleFile(e.target.files)}
        />
      </div>

      <button
        type="button"
        onClick={handleReportPayment}
        disabled={pending || uploading}
        className="w-full rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
      >
        {pending ? "Enviando…" : "Ya pagué"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: `components/billing/SubscriptionBlockedScreen.tsx`**

```tsx
// components/billing/SubscriptionBlockedScreen.tsx
import { ReportPaymentPanel } from "@/components/billing/ReportPaymentPanel";
import { getPlatformPaymentSettings, getPlatformQrUrl, type LatestInvoice } from "@/lib/billing";
import type { Role } from "@/lib/rbac";
import { bs } from "@/lib/format";

// Pantalla de bloqueo suave: el acceso se pausa pero los datos quedan
// intactos. Solo el admin ve el QR/instrucciones — el resto del equipo ve un
// mensaje genérico (el tema de cobro es entre Paulo y el dueño de la clínica).
export async function SubscriptionBlockedScreen({
  clinicName,
  role,
  invoice,
}: {
  clinicName: string;
  role: Role;
  invoice: LatestInvoice;
}) {
  if (role !== "admin") {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md rounded-xl bg-white p-8 text-center shadow ring-1 ring-slate-200">
          <h1 className="text-xl font-bold text-slate-800">Acceso en pausa</h1>
          <p className="mt-2 text-sm text-slate-500">
            El acceso de {clinicName} está temporalmente en pausa. Contacta al
            administrador de tu clínica para reactivarlo.
          </p>
        </div>
      </main>
    );
  }

  const [{ instructions }, qrUrl] = await Promise.all([
    getPlatformPaymentSettings(),
    getPlatformQrUrl(),
  ]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow ring-1 ring-slate-200">
        <h1 className="text-xl font-bold text-slate-800">Suscripción vencida</h1>
        <p className="mt-2 text-sm text-slate-500">
          El acceso de {clinicName} está en pausa por falta de pago de la
          suscripción de {bs(invoice.amount)}. Tus datos están intactos: se
          reactiva apenas se confirme el pago.
        </p>
        <div className="mt-5">
          <ReportPaymentPanel invoice={invoice} qrUrl={qrUrl} instructions={instructions} />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: `components/billing/SubscriptionBanner.tsx`**

```tsx
// components/billing/SubscriptionBanner.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import { bs } from "@/lib/format";

// Recordatorio no bloqueante (solo se renderiza para el rol admin — ver
// layout). Descartable por sesión: si sigue pendiente, reaparece al recargar
// la página (no persiste en localStorage, a propósito).
export function SubscriptionBanner({
  banner,
  amount,
  daysLeft,
}: {
  banner: "pending" | "reported";
  amount: number;
  daysLeft: number;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const urgent = banner === "pending" && daysLeft <= 2;

  return (
    <div
      className={`fixed inset-x-3 bottom-3 z-40 rounded-xl p-4 shadow-lg ring-1 md:inset-x-auto md:bottom-4 md:right-4 md:w-96 ${
        urgent
          ? "bg-amber-50 ring-amber-300"
          : banner === "reported"
            ? "bg-sky-50 ring-sky-200"
            : "bg-white ring-slate-200"
      }`}
    >
      <div className="flex items-start gap-3">
        {urgent ? (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        ) : (
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-clinic" />
        )}
        <div className="min-w-0 flex-1 text-sm">
          {banner === "reported" ? (
            <>
              <p className="font-semibold text-slate-800">Verificando tu pago</p>
              <p className="mt-1 text-slate-500">
                Reportaste el pago de {bs(amount)}. Te avisamos cuando se confirme.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-slate-800">Suscripción: {bs(amount)}</p>
              <p className="mt-1 text-slate-500">
                {daysLeft > 0 ? `Vence en ${daysLeft} día${daysLeft === 1 ? "" : "s"}.` : "Vence hoy."}
              </p>
              <Link
                href="/suscripcion"
                className="mt-2 inline-block text-xs font-medium text-clinic hover:underline"
              >
                Ver y pagar →
              </Link>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Cerrar"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          ×
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Modificar `app/(dashboard)/layout.tsx`**

Combinar el import de `getInitials` con `boliviaTodayISO` (ambos de `lib/format`):

```diff
- import { getInitials } from "@/lib/format";
+ import { getInitials, boliviaTodayISO } from "@/lib/format";
```

Agregar los imports nuevos junto a los existentes:

```diff
  import { TermsGate } from "@/components/legal/TermsGate";
  import { LEGAL_VERSION } from "@/lib/legal";
+ import { getLatestInvoice, type LatestInvoice } from "@/lib/billing";
+ import { computeBillingGate, daysUntilDue, type BillingGate } from "@/lib/billingStatus";
+ import { SubscriptionBanner } from "@/components/billing/SubscriptionBanner";
+ import { SubscriptionBlockedScreen } from "@/components/billing/SubscriptionBlockedScreen";
```

Agregar `clinic_id` al select del perfil:

```diff
  const { data: profile } = await supabase
    .from("profiles")
-   .select("full_name, role, active, terms_accepted_at, terms_accepted_version, clinics(name, features, active)")
+   .select("full_name, role, active, clinic_id, terms_accepted_at, terms_accepted_version, clinics(name, features, active)")
    .eq("id", user.id)
    .single();
```

Insertar el gate de suscripción justo después del bloque de `TermsGate` (que termina en `}` antes de `const clinicName = ...`):

```diff
    if (!superadmin && profile && profile.role === "admin" && !termsAccepted) {
      return (
        <>
          <TermsGate clinicName={clinic?.name ?? "tu clínica"} />
          <Toaster />
        </>
      );
    }

+   // Suscripción de la plataforma: SIEMPRE se evalúa (no es un feature
+   // apagable — una clínica sin monto asignado simplemente nunca se cobra ni
+   // se bloquea). No aplica al superadmin (no tiene clínica propia) ni en
+   // vista previa (entra a operar/dar soporte, no debe bloquearse por la
+   // mora de la clínica que está revisando).
+   let billingGate: BillingGate = { blocked: false, banner: "none" };
+   let latestInvoice: LatestInvoice | null = null;
+   const clinicId = (profile as { clinic_id?: string } | null)?.clinic_id;
+   if (!superadmin && profile && clinicId) {
+     latestInvoice = await getLatestInvoice(clinicId);
+     billingGate = computeBillingGate(
+       latestInvoice
+         ? { status: latestInvoice.status, due_date: latestInvoice.due_date }
+         : null,
+       boliviaTodayISO(),
+     );
+     if (billingGate.blocked) {
+       return (
+         <>
+           <SubscriptionBlockedScreen
+             clinicName={clinic?.name ?? "tu clínica"}
+             role={profile.role as Role}
+             invoice={latestInvoice!}
+           />
+           <Toaster />
+         </>
+       );
+     }
+   }
+
    const clinicName = isPreview
```

Agregar el banner al final del árbol renderizado (después de `<InstallAppBanner />`):

```diff
          <main className="flex-1 p-4 md:p-8">{children}</main>
          <Toaster />
          <ConfirmHost />
          <InstallAppBanner />
+         {!superadmin && profile?.role === "admin" && billingGate.banner !== "none" && latestInvoice && (
+           <SubscriptionBanner
+             banner={billingGate.banner}
+             amount={latestInvoice.amount}
+             daysLeft={daysUntilDue(boliviaTodayISO(), latestInvoice.due_date)}
+           />
+         )}
        </div>
      </div>
    );
  }
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`

Expected: fallará señalando que `@/app/(dashboard)/suscripcion/actions` no existe todavía — es esperado, `ReportPaymentPanel` lo importa pero Task 6 lo crea. **No continuar** hasta completar Task 6; este typecheck se vuelve a correr al final de esa tarea.

- [ ] **Step 6: Commit**

```bash
git add components/billing/ app/(dashboard)/layout.tsx
git commit -m "feat(billing): gate de bloqueo/aviso en el layout del dashboard"
```

---

### Task 6: Página `/suscripcion` + acciones del admin

**Files:**
- Create: `app/(dashboard)/suscripcion/actions.ts`
- Create: `app/(dashboard)/suscripcion/page.tsx`

**Interfaces:**
- Consumes: `getProfile` de `lib/auth`; `getLatestInvoice, getPlatformPaymentSettings, getPlatformQrUrl, LatestInvoice` de `lib/billing`; `isR2Configured, presignUpload` de `lib/r2`; `ReportPaymentPanel` de Task 5 (ya espera exactamente `requestReceiptUpload` y `reportPayment` con las firmas de abajo).
- Produces:
  - `requestReceiptUpload(invoiceId: string, contentType: string): Promise<{ ok: true; uploadUrl: string; key: string } | { ok: false; error: string }>`
  - `reportPayment(invoiceId: string, receiptKey: string | null): Promise<{ ok?: boolean; error?: string }>`

- [ ] **Step 1: `app/(dashboard)/suscripcion/actions.ts`**

```typescript
// app/(dashboard)/suscripcion/actions.ts
"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isR2Configured, presignUpload } from "@/lib/r2";

const EXT: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export type ReceiptUploadState =
  | { ok: true; uploadUrl: string; key: string }
  | { ok: false; error: string };

// Paso 1: URL firmada para subir el comprobante directo a R2 (mismo flujo que
// el logo de la clínica).
export async function requestReceiptUpload(
  invoiceId: string,
  contentType: string,
): Promise<ReceiptUploadState> {
  const profile = await getProfile();
  if (!profile) return { ok: false, error: "Sesión expirada." };
  if (profile.role !== "admin")
    return { ok: false, error: "Solo un administrador puede reportar el pago." };
  if (!isR2Configured())
    return { ok: false, error: "El almacenamiento no está configurado." };
  const ext = EXT[contentType];
  if (!ext) return { ok: false, error: "Formato no permitido." };

  // La factura debe ser de esta clínica. subscription_invoices solo tiene
  // policy de SELECT propio, así que este check con el cliente normal (RLS)
  // ya verifica pertenencia sin necesitar service-role.
  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("subscription_invoices")
    .select("id")
    .eq("id", invoiceId)
    .eq("clinic_id", profile.clinicId)
    .maybeSingle();
  if (!invoice) return { ok: false, error: "Factura no encontrada." };

  const key = `receipts/${profile.clinicId}/${invoiceId}-${randomUUID()}.${ext}`;
  const uploadUrl = await presignUpload(key, contentType);
  return { ok: true, uploadUrl, key };
}

export type ActionState = { ok?: boolean; error?: string };

// Paso 2: el admin marca "Ya pagué". Pasa la factura a 'reported' — NUNCA a
// 'confirmed' (eso solo lo hace Paulo desde Superadmin tras verificar la
// transferencia; ver Task 7).
export async function reportPayment(
  invoiceId: string,
  receiptKey: string | null,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin")
    return { error: "Solo un administrador puede reportar el pago." };

  // subscription_invoices no tiene policy de UPDATE (solo SELECT propio): el
  // admin de la clínica no puede escribir su propio estado de pago con el
  // cliente normal. Se usa service-role, acotado explícitamente a esta
  // clínica y solo si la factura sigue 'pending' (no pisa un estado ya
  // confirmado o ya reportado por otra pestaña).
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("subscription_invoices")
    .update({
      status: "reported",
      reported_at: new Date().toISOString(),
      reported_by: profile.userId,
      receipt_key: receiptKey,
    })
    .eq("id", invoiceId)
    .eq("clinic_id", profile.clinicId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "La factura ya no está pendiente de pago." };

  revalidatePath("/suscripcion");
  revalidatePath("/", "layout");
  return { ok: true };
}
```

- [ ] **Step 2: `app/(dashboard)/suscripcion/page.tsx`**

```tsx
// app/(dashboard)/suscripcion/page.tsx
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { getLatestInvoice, getPlatformPaymentSettings, getPlatformQrUrl } from "@/lib/billing";
import { PageHeader } from "@/components/ui/PageHeader";
import { ReportPaymentPanel } from "@/components/billing/ReportPaymentPanel";
import { bs } from "@/lib/format";

const STATUS_LABEL: Record<string, { text: string; tone: string }> = {
  pending: { text: "Pendiente de pago", tone: "text-amber-600" },
  reported: { text: "Verificando pago", tone: "text-sky-600" },
  confirmed: { text: "Al día", tone: "text-emerald-600" },
};

export default async function SuscripcionPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/agenda");

  const invoice = await getLatestInvoice(profile.clinicId);

  if (!invoice) {
    return (
      <div className="space-y-6">
        <PageHeader title="Suscripción" subtitle="Estado de pago de la plataforma." />
        <p className="text-sm text-slate-500">
          Aún no hay ningún cargo generado para tu clínica.
        </p>
      </div>
    );
  }

  const [{ instructions }, qrUrl] = await Promise.all([
    getPlatformPaymentSettings(),
    getPlatformQrUrl(),
  ]);

  const label = STATUS_LABEL[invoice.status];

  return (
    <div className="space-y-6">
      <PageHeader title="Suscripción" subtitle="Estado de pago de la plataforma." />

      <div className="max-w-md rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">Período {invoice.period.slice(0, 7)}</span>
          <span className={`text-sm font-semibold ${label.tone}`}>{label.text}</span>
        </div>
        <p className="mt-1 text-2xl font-bold text-slate-800">{bs(invoice.amount)}</p>

        {invoice.status !== "confirmed" && (
          <div className="mt-4">
            <ReportPaymentPanel invoice={invoice} qrUrl={qrUrl} instructions={instructions} />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck (ahora sí debe pasar, incluyendo lo pendiente de Task 5)**

Run: `npm run typecheck`

Expected: sin errores.

- [ ] **Step 4: Verificación manual**

Con el server corriendo (`npm run dev`) y la factura de prueba generada en Task 4:

1. Inicia sesión como `admin` de la clínica con la factura `pending`.
2. Verifica que el banner de recordatorio aparece abajo a la derecha con el monto y "Vence en N días".
3. Entra a `/suscripcion`: debe mostrar el estado, el QR (si ya subiste uno a R2 manualmente, o el mensaje "QR no configurado aún"), y el botón "Ya pagué".
4. Adjunta un comprobante (PNG/JPG) y confirma que dice "Comprobante adjuntado ✓".
5. Toca "Ya pagué": debe mostrar el toast de éxito y el panel cambiar a "Gracias, estamos verificando tu pago...".
6. Verifica en Studio: `select status, reported_at, receipt_key from subscription_invoices where id = '<id>';` → `status = 'reported'`, `reported_at` y `receipt_key` con valores.
7. Inicia sesión con otro rol (recepcionista/doctor) de la misma clínica: **no** debe ver el banner de recordatorio (solo lo ve `admin`).

- [ ] **Step 5: Commit**

```bash
git add app/(dashboard)/suscripcion/
git commit -m "feat(billing): pagina /suscripcion y flujo de reportar pago"
```

---

### Task 7: Acciones de Superadmin (confirmar, rechazar, configurar)

**Files:**
- Create: `app/(dashboard)/superadmin/billing-actions.ts`

**Interfaces:**
- Consumes: `isPlatformAdmin` de `lib/superadmin`; `createAdminClient` de `lib/supabase/admin`; `isR2Configured, presignUpload, presignDownload, deleteObject, headObjectSize` de `lib/r2`.
- Produces (usado por Task 8):
  - `confirmPayment(invoiceId: string): Promise<{ ok?: boolean; error?: string }>`
  - `rejectPayment(invoiceId: string, note?: string): Promise<{ ok?: boolean; error?: string }>`
  - `setClinicBilling(clinicId: string, input: { monthlyAmount: number; exempt: boolean; lineItems: string }): Promise<{ ok?: boolean; error?: string }>`
  - `requestPlatformQrUpload(contentType: string): Promise<{ ok: true; uploadUrl: string; key: string } | { ok: false; error: string }>`
  - `registerPlatformQr(key: string): Promise<{ ok?: boolean; error?: string }>`
  - `setPaymentSettings(input: { instructions: string; graceDays: number }): Promise<{ ok?: boolean; error?: string }>`
  - `getReceiptDownloadUrl(key: string): Promise<string | null>`

- [ ] **Step 1: Implementar el archivo completo**

```typescript
// app/(dashboard)/superadmin/billing-actions.ts
"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/superadmin";
import {
  isR2Configured,
  presignUpload,
  presignDownload,
  deleteObject,
  headObjectSize,
} from "@/lib/r2";

async function assertSuperadmin() {
  if (!(await isPlatformAdmin())) throw new Error("No autorizado");
}

export type ActionState = { ok?: boolean; error?: string };

// ── Confirmar un pago reportado ──────────────────────────────────────────
export async function confirmPayment(invoiceId: string): Promise<ActionState> {
  await assertSuperadmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("subscription_invoices")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", invoiceId);
  if (error) return { error: error.message };
  revalidatePath("/superadmin/cobranza");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ── Rechazar un reporte que resultó falso ("dijo que pagó pero no llegó") ─
// Vuelve la factura a 'pending': si ya pasó el due_date, el bloqueo aplica de
// inmediato en el próximo request de esa clínica.
export async function rejectPayment(invoiceId: string, note?: string): Promise<ActionState> {
  await assertSuperadmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("subscription_invoices")
    .update({
      status: "pending",
      reported_at: null,
      reported_by: null,
      receipt_key: null,
      note: note?.trim() || null,
    })
    .eq("id", invoiceId);
  if (error) return { error: error.message };
  revalidatePath("/superadmin/cobranza");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ── Monto mensual / exención por clínica (clinics.settings.billing) ─────
export async function setClinicBilling(
  clinicId: string,
  input: { monthlyAmount: number; exempt: boolean; lineItems: string },
): Promise<ActionState> {
  await assertSuperadmin();
  if (!Number.isFinite(input.monthlyAmount) || input.monthlyAmount < 0)
    return { error: "Monto inválido." };

  const admin = createAdminClient();
  const { data: clinicRow } = await admin
    .from("clinics")
    .select("settings")
    .eq("id", clinicId)
    .single();

  const settings = { ...(clinicRow?.settings as Record<string, unknown> | null) };
  settings.billing = {
    monthly_amount: input.monthlyAmount,
    exempt: input.exempt,
    line_items: input.lineItems.trim() || null,
  };

  const { error } = await admin.from("clinics").update({ settings }).eq("id", clinicId);
  if (error) return { error: error.message };
  revalidatePath("/superadmin");
  revalidatePath("/superadmin/cobranza");
  return { ok: true };
}

// ── QR de pago de la plataforma (platform_settings, key='payment') ──────
const ALLOWED_TYPES: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
};
const MAX_QR_BYTES = 2 * 1024 * 1024;

export type QrUploadState =
  | { ok: true; uploadUrl: string; key: string }
  | { ok: false; error: string };

export async function requestPlatformQrUpload(contentType: string): Promise<QrUploadState> {
  await assertSuperadmin();
  if (!isR2Configured()) return { ok: false, error: "El almacenamiento no está configurado." };
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) return { ok: false, error: "Formato no permitido (usa PNG, JPG o WebP)." };

  const key = `platform/payment-qr-${randomUUID()}.${ext}`;
  const uploadUrl = await presignUpload(key, contentType);
  return { ok: true, uploadUrl, key };
}

export async function registerPlatformQr(key: string): Promise<ActionState> {
  await assertSuperadmin();
  if (!key.startsWith("platform/payment-qr-"))
    return { error: "Referencia de archivo inválida." };

  const realSize = await headObjectSize(key);
  if (realSize === null) return { error: "No se encontró el QR subido." };
  if (realSize > MAX_QR_BYTES) {
    await deleteObject(key).catch(() => {});
    return { error: "El QR supera el tamaño máximo permitido (2 MB)." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "payment")
    .maybeSingle();

  const prevValue = (existing?.value as Record<string, unknown> | null) ?? {};
  const oldKey = typeof prevValue.qr_r2_key === "string" ? prevValue.qr_r2_key : null;

  const { error } = await admin.from("platform_settings").upsert({
    key: "payment",
    value: { ...prevValue, qr_r2_key: key },
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };

  if (oldKey && oldKey !== key) await deleteObject(oldKey).catch(() => {});

  revalidatePath("/superadmin/cobranza");
  return { ok: true };
}

// ── Instrucciones de pago + días de gracia (platform_settings) ──────────
export async function setPaymentSettings(input: {
  instructions: string;
  graceDays: number;
}): Promise<ActionState> {
  await assertSuperadmin();
  if (!Number.isInteger(input.graceDays) || input.graceDays < 1)
    return { error: "Días de gracia inválidos." };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "payment")
    .maybeSingle();
  const prevValue = (existing?.value as Record<string, unknown> | null) ?? {};

  const { error } = await admin.from("platform_settings").upsert({
    key: "payment",
    value: {
      ...prevValue,
      instructions: input.instructions.trim(),
      grace_days: input.graceDays,
    },
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  revalidatePath("/superadmin/cobranza");
  return { ok: true };
}

// ── URL firmada para que Paulo vea un comprobante subido por una clínica ─
export async function getReceiptDownloadUrl(key: string): Promise<string | null> {
  await assertSuperadmin();
  return presignDownload(key, 300);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/superadmin/billing-actions.ts
git commit -m "feat(billing): acciones de superadmin para cobranza"
```

---

### Task 8: Panel `/superadmin/cobranza`

**Files:**
- Create: `components/superadmin/CobranzaPanel.tsx`
- Create: `components/superadmin/ClinicBillingForm.tsx`
- Create: `components/superadmin/PlatformQrUploader.tsx`
- Create: `components/superadmin/PaymentSettingsForm.tsx`
- Create: `app/(dashboard)/superadmin/cobranza/page.tsx`

**Interfaces:**
- Consumes: todas las acciones de Task 7 (`confirmPayment, rejectPayment, setClinicBilling, requestPlatformQrUpload, registerPlatformQr, setPaymentSettings, getReceiptDownloadUrl`); `getPlatformPaymentSettings, getPlatformQrUrl` de `lib/billing`; `parseClinicBillingConfig, periodStartISO` de `lib/billingStatus`; `isPlatformAdmin` de `lib/superadmin`; `createAdminClient` de `lib/supabase/admin`.
- Produces: `type CobranzaRow` (consumida por `CobranzaPanel`), página `/superadmin/cobranza`.

- [ ] **Step 1: `components/superadmin/ClinicBillingForm.tsx`**

```tsx
// components/superadmin/ClinicBillingForm.tsx
"use client";

import { useState, useTransition } from "react";
import { setClinicBilling } from "@/app/(dashboard)/superadmin/billing-actions";

export function ClinicBillingForm({
  clinicId,
  monthlyAmount,
  exempt,
  lineItems,
}: {
  clinicId: string;
  monthlyAmount: number;
  exempt: boolean;
  lineItems: string;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(monthlyAmount || ""));
  const [isExempt, setIsExempt] = useState(exempt);
  const [items, setItems] = useState(lineItems);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-0.5 text-xs text-slate-400 hover:text-clinic hover:underline"
      >
        {monthlyAmount > 0 ? `Bs ${monthlyAmount.toFixed(2)}/mes` : "Fijar monto mensual"}
        {exempt && " · exenta"}
      </button>
    );
  }

  function save() {
    setError("");
    startTransition(async () => {
      const res = await setClinicBilling(clinicId, {
        monthlyAmount: Number(amount) || 0,
        exempt: isExempt,
        lineItems: items,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setEditing(false);
    });
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-slate-400">Bs</span>
      <input
        type="number"
        min="0"
        step="10"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-20 rounded border border-slate-300 px-2 py-0.5"
      />
      <span className="text-slate-400">/mes</span>
      <label className="flex items-center gap-1 text-slate-500">
        <input type="checkbox" checked={isExempt} onChange={(e) => setIsExempt(e.target.checked)} />
        Exenta
      </label>
      <input
        type="text"
        placeholder="Detalle (ej. Plan base + Agente IA)"
        value={items}
        onChange={(e) => setItems(e.target.value)}
        className="w-48 rounded border border-slate-300 px-2 py-0.5"
      />
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="rounded bg-clinic px-2 py-0.5 font-medium text-white disabled:opacity-50"
      >
        Guardar
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-slate-400">
        Cancelar
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 2: `components/superadmin/CobranzaPanel.tsx`**

```tsx
// components/superadmin/CobranzaPanel.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Paperclip } from "lucide-react";
import { bs } from "@/lib/format";
import { ClinicBillingForm } from "@/components/superadmin/ClinicBillingForm";
import {
  confirmPayment,
  rejectPayment,
  getReceiptDownloadUrl,
} from "@/app/(dashboard)/superadmin/billing-actions";

export type CobranzaRow = {
  clinicId: string;
  clinicName: string;
  monthlyAmount: number;
  exempt: boolean;
  lineItems: string | null;
  invoice: {
    id: string;
    amount: number;
    status: "pending" | "reported" | "confirmed";
    dueDate: string;
    reportedAt: string | null;
    receiptKey: string | null;
  } | null;
};

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  pending: { text: "Pendiente", className: "bg-slate-100 text-slate-500" },
  reported: { text: "Reportado", className: "bg-sky-50 text-sky-600 dark:bg-sky-500/10" },
  confirmed: { text: "Confirmado", className: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10" },
};

export function CobranzaPanel({ rows }: { rows: CobranzaRow[] }) {
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <CobranzaRowItem key={r.clinicId} row={r} />
      ))}
    </div>
  );
}

function CobranzaRowItem({ row }: { row: CobranzaRow }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleConfirm() {
    startTransition(async () => {
      await confirmPayment(row.invoice!.id);
      router.refresh();
    });
  }

  function handleReject() {
    startTransition(async () => {
      await rejectPayment(row.invoice!.id);
      router.refresh();
    });
  }

  async function handleViewReceipt() {
    if (!row.invoice?.receiptKey) return;
    const url = await getReceiptDownloadUrl(row.invoice.receiptKey);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  const status = row.invoice ? STATUS_LABEL[row.invoice.status] : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="min-w-0">
        <p className="font-medium text-slate-800">{row.clinicName}</p>
        <ClinicBillingForm
          clinicId={row.clinicId}
          monthlyAmount={row.monthlyAmount}
          exempt={row.exempt}
          lineItems={row.lineItems ?? ""}
        />
      </div>

      <div className="flex items-center gap-2">
        {row.exempt ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
            Exenta
          </span>
        ) : row.monthlyAmount <= 0 ? (
          <span className="text-xs text-slate-400">Sin monto asignado</span>
        ) : !row.invoice ? (
          <span className="text-xs text-slate-400">Sin factura este mes aún</span>
        ) : (
          <>
            <span className="text-sm font-semibold text-slate-700">{bs(row.invoice.amount)}</span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status!.className}`}>
              {status!.text}
            </span>
            {row.invoice.receiptKey && (
              <button
                type="button"
                onClick={handleViewReceipt}
                title="Ver comprobante"
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <Paperclip className="h-4 w-4" />
              </button>
            )}
            {row.invoice.status !== "confirmed" && (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={pending}
                title="Confirmar pago"
                className="rounded-md p-1 text-emerald-500 hover:bg-emerald-50 disabled:opacity-50"
              >
                <CheckCircle2 className="h-5 w-5" />
              </button>
            )}
            {row.invoice.status === "reported" && (
              <button
                type="button"
                onClick={handleReject}
                disabled={pending}
                title="Rechazar (el pago no llegó)"
                className="rounded-md p-1 text-red-500 hover:bg-red-50 disabled:opacity-50"
              >
                <XCircle className="h-5 w-5" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `components/superadmin/PlatformQrUploader.tsx`**

```tsx
// components/superadmin/PlatformQrUploader.tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  requestPlatformQrUpload,
  registerPlatformQr,
} from "@/app/(dashboard)/superadmin/billing-actions";

export function PlatformQrUploader({ currentQrUrl }: { currentQrUrl: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    const res = await requestPlatformQrUpload(file.type);
    if (!res.ok) {
      toast(res.error, "error");
      setBusy(false);
      return;
    }
    try {
      const put = await fetch(res.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!put.ok) throw new Error(`HTTP ${put.status}`);
      const reg = await registerPlatformQr(res.key);
      if (reg.error) throw new Error(reg.error);
      toast("QR actualizado", "success");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo subir el QR", "error");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2">
        {currentQrUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={currentQrUrl} alt="QR de pago" className="max-h-full max-w-full object-contain" />
        ) : (
          <QrCode className="h-8 w-8 text-slate-300" />
        )}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-md bg-clinic px-3 py-1.5 text-xs font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
        {currentQrUrl ? "Cambiar QR" : "Subir QR"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => handleFile(e.target.files)}
      />
    </div>
  );
}
```

- [ ] **Step 4: `components/superadmin/PaymentSettingsForm.tsx`**

```tsx
// components/superadmin/PaymentSettingsForm.tsx
"use client";

import { useState, useTransition } from "react";
import { setPaymentSettings } from "@/app/(dashboard)/superadmin/billing-actions";

export function PaymentSettingsForm({
  instructions,
  graceDays,
}: {
  instructions: string;
  graceDays: number;
}) {
  const [text, setText] = useState(instructions);
  const [days, setDays] = useState(String(graceDays));
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function save() {
    startTransition(async () => {
      await setPaymentSettings({ instructions: text, graceDays: Number(days) || 7 });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-slate-600">
        Instrucciones de pago (banco, cuenta, etc.)
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700"
      />
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-600">Días de gracia</label>
        <input
          type="number"
          min="1"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="w-16 rounded border border-slate-300 px-2 py-0.5 text-xs"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-full bg-clinic px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
        >
          Guardar
        </button>
        {saved && <span className="text-xs text-emerald-600">Guardado</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: `app/(dashboard)/superadmin/cobranza/page.tsx`**

```tsx
// app/(dashboard)/superadmin/cobranza/page.tsx
import { redirect } from "next/navigation";
import { CircleDollarSign } from "lucide-react";
import { isPlatformAdmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformPaymentSettings, getPlatformQrUrl } from "@/lib/billing";
import { parseClinicBillingConfig, periodStartISO } from "@/lib/billingStatus";
import { boliviaTodayISO, bs } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { CobranzaPanel, type CobranzaRow } from "@/components/superadmin/CobranzaPanel";
import { PlatformQrUploader } from "@/components/superadmin/PlatformQrUploader";
import { PaymentSettingsForm } from "@/components/superadmin/PaymentSettingsForm";

export default async function CobranzaPage() {
  if (!(await isPlatformAdmin())) redirect("/agenda");

  const admin = createAdminClient();
  const period = periodStartISO(boliviaTodayISO());

  const [{ data: clinics }, { data: invoices }, paymentSettings, qrUrl] = await Promise.all([
    admin.from("clinics").select("id, name, settings").order("name"),
    admin
      .from("subscription_invoices")
      .select("id, clinic_id, amount, status, due_date, reported_at, receipt_key")
      .eq("period", period),
    getPlatformPaymentSettings(),
    getPlatformQrUrl(),
  ]);

  const invoiceByClinic = new Map((invoices ?? []).map((i) => [i.clinic_id as string, i]));

  const rows: CobranzaRow[] = (clinics ?? []).map((c) => {
    const config = parseClinicBillingConfig(c.settings);
    const invoice = invoiceByClinic.get(c.id);
    return {
      clinicId: c.id,
      clinicName: c.name,
      monthlyAmount: config.monthlyAmount,
      exempt: config.exempt,
      lineItems: config.lineItems,
      invoice: invoice
        ? {
            id: invoice.id as string,
            amount: Number(invoice.amount),
            status: invoice.status as "pending" | "reported" | "confirmed",
            dueDate: invoice.due_date as string,
            reportedAt: invoice.reported_at as string | null,
            receiptKey: invoice.receipt_key as string | null,
          }
        : null,
    };
  });

  const billed = rows.filter((r) => r.monthlyAmount > 0 && !r.exempt);
  const confirmedTotal = billed
    .filter((r) => r.invoice?.status === "confirmed")
    .reduce((sum, r) => sum + r.monthlyAmount, 0);
  const expectedTotal = billed.reduce((sum, r) => sum + r.monthlyAmount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cobranza"
        subtitle={`Período ${period.slice(0, 7)} · Recaudado ${bs(confirmedTotal)} de ${bs(expectedTotal)} esperado`}
      />

      <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">QR de pago de la plataforma</h2>
        <PlatformQrUploader currentQrUrl={qrUrl} />
        <div className="mt-4 border-t border-slate-100 pt-4">
          <PaymentSettingsForm
            instructions={paymentSettings.instructions}
            graceDays={paymentSettings.graceDays}
          />
        </div>
      </section>

      {billed.length === 0 && (
        <EmptyState
          icon={<CircleDollarSign className="h-6 w-6" />}
          title="Ninguna clínica tiene monto asignado"
          description="Fija un monto mensual por clínica abajo para empezar a cobrar."
        />
      )}

      <CobranzaPanel rows={rows} />
    </div>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`

Expected: sin errores.

- [ ] **Step 7: Verificación manual end-to-end**

1. Entra como superadmin a `/superadmin/cobranza`. Debe listar todas las clínicas.
2. Sube un QR de prueba (PNG) con "Subir QR" — confirma que se ve la vista previa.
3. En la fila de la clínica de prueba, fija un monto (ej. Bs 350) con "Fijar monto mensual" → Guardar.
4. Corre el cron de nuevo (`curl http://localhost:3000/api/cron/subscriptions`) para que genere la factura del mes con el monto recién fijado.
5. Recarga `/superadmin/cobranza`: la fila debe mostrar el monto, estado "Pendiente".
6. Como admin de esa clínica, entra a `/suscripcion`, reporta el pago (Task 6, Step 4).
7. Vuelve como superadmin a `/superadmin/cobranza`: el estado debe ser "Reportado", con el ícono de comprobante clicable (ábrelo, debe mostrar la imagen).
8. Toca "Confirmar pago" (✓ verde) → estado pasa a "Confirmado", "Recaudado" sube en el subtítulo.
9. Prueba el camino de rechazo: fuerza otra factura a `reported` (repite pasos 4–6 en otra clínica de prueba) y toca "Rechazar" (✗ roja) → vuelve a "Pendiente".

- [ ] **Step 8: Commit**

```bash
git add components/superadmin/CobranzaPanel.tsx components/superadmin/ClinicBillingForm.tsx components/superadmin/PlatformQrUploader.tsx components/superadmin/PaymentSettingsForm.tsx "app/(dashboard)/superadmin/cobranza/"
git commit -m "feat(billing): panel de cobranza en superadmin"
```

---

### Task 9: Nav para el admin + enlace desde Superadmin + verificación de bloqueo completa

**Files:**
- Modify: `lib/features.ts`
- Modify: `lib/rbac.ts`
- Modify: `app/(dashboard)/superadmin/page.tsx`

**Interfaces:**
- Consumes: `FEATURES, FeatureKey` de `lib/features.ts`; `NAV_WHITELIST` (interno de `lib/rbac.ts`).
- Produces: entrada de menú "Suscripción" visible solo para `admin`; link a `/superadmin/cobranza` desde el panel principal de Superadmin.

- [ ] **Step 1: Agregar `"suscripcion"` como `FeatureKey` core (siempre encendido, no apagable)**

En `lib/features.ts`, agregar al union type:

```diff
  export type FeatureKey =
    | "inicio"
    | "agenda"
    | "pacientes"
    | "mis_trabajos"
    | "tratamientos"
    | "caja"
    | "cuentas"
    | "inventario"
    | "ajustes"
    | "auditoria"
+   | "suscripcion"
    | "bloqueo_horario"
```

Y en el array `FEATURES` (junto a `ajustes`, que también es `core: true`):

```diff
    { key: "ajustes", label: "Ajustes", href: "/ajustes", core: true },
    { key: "auditoria", label: "Auditoría", href: "/auditoria" },
+   // Estado de pago de la plataforma. Siempre encendido (no es un addon
+   // apagable): una clínica sin monto asignado simplemente nunca se cobra.
+   { key: "suscripcion", label: "Suscripción", href: "/suscripcion", core: true },
    { key: "bloqueo_horario", label: "Bloqueo por horario", href: "/ajustes", optIn: true },
```

- [ ] **Step 2: Restringir la nav a `admin`**

En `lib/rbac.ts`, agregar `"suscripcion"` únicamente a la lista de `admin`:

```diff
  const NAV_WHITELIST: Record<Role, FeatureKey[]> = {
-   admin:              ["inicio", "agenda", "pacientes", "mis_trabajos", "tratamientos", "inventario", "caja", "cuentas", "pagos", "ajustes", "auditoria", "calificaciones", "wa_masivo"],
+   admin:              ["inicio", "agenda", "pacientes", "mis_trabajos", "tratamientos", "inventario", "caja", "cuentas", "pagos", "ajustes", "auditoria", "suscripcion", "calificaciones", "wa_masivo"],
    recepcionista:      ["inicio", "agenda", "pacientes", "mis_trabajos", "wa_masivo"],
```

- [ ] **Step 3: Enlace desde el panel principal de Superadmin**

En `app/(dashboard)/superadmin/page.tsx`, agregar el import y el enlace junto al título de la página:

```diff
  import { redirect } from "next/navigation";
- import { Building2, CheckCircle2, PauseCircle, Users, Camera, Database, HardDrive, AlertTriangle, DatabaseBackup } from "lucide-react";
+ import { Building2, CheckCircle2, PauseCircle, Users, Camera, Database, HardDrive, AlertTriangle, DatabaseBackup, CircleDollarSign } from "lucide-react";
+ import Link from "next/link";
```

```diff
      <div>
        <h1 className="text-2xl font-bold">Panel de plataforma</h1>
        <p className="text-sm text-slate-500">
          Gestión de clínicas, módulos y planes. Operas TODAS las clínicas; los
          clientes solo ven la suya.
        </p>
      </div>
+
+     <Link
+       href="/superadmin/cobranza"
+       className="inline-flex items-center gap-2 rounded-full bg-clinic/10 px-4 py-2 text-sm font-medium text-clinic-fg hover:bg-clinic/20"
+     >
+       <CircleDollarSign className="h-4 w-4" />
+       Ir a Cobranza
+     </Link>
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`

Expected: sin errores.

- [ ] **Step 5: Correr toda la suite de tests**

Run: `npm test`

Expected: todos los tests pasan, incluyendo los nuevos de `tests/billingStatus.test.ts`.

- [ ] **Step 6: Verificación manual final (bloqueo completo)**

1. En Studio local, fuerza el vencimiento de una factura de prueba: `update subscription_invoices set due_date = (current_date - 1) where clinic_id = '<id>';` (ya con `status = 'pending'`).
2. Recarga cualquier página del dashboard como `admin` de esa clínica: debe aparecer la pantalla "Suscripción vencida" con el QR y "Ya pagué", **en vez del dashboard normal**.
3. Recarga como `recepcionista`/doctor de la misma clínica: debe ver "Acceso en pausa" genérico, sin QR.
4. Reporta el pago desde la pantalla de bloqueo (botón "Ya pagué") → confirma desde `/superadmin/cobranza` → recarga como admin: el dashboard debe volver a aparecer normal, con todos los datos intactos.
5. Confirma que un superadmin en **vista previa** de esa misma clínica (botón "Entrar" desde `/superadmin`) NO ve la pantalla de bloqueo aunque la factura siga vencida.

- [ ] **Step 7: Commit**

```bash
git add lib/features.ts lib/rbac.ts "app/(dashboard)/superadmin/page.tsx"
git commit -m "feat(billing): nav Suscripcion para admin y enlace a Cobranza desde Superadmin"
```

---

## Después de este plan

- **Producción:** la migración `0079_subscription_billing.sql` debe aplicarse en el mismo deploy que este código (ver `docs/DEPLOY-MIGRACIONES.md` — hoy a mano por el SQL Editor del dashboard de Supabase). Sin ella, el layout rompe con "Could not find the table 'subscription_invoices'".
- **Configuración manual pendiente en producción:** Paulo debe (a) subir el QR real desde `/superadmin/cobranza`, (b) escribir las instrucciones de pago reales, y (c) fijar el `monthly_amount` de cada clínica ya activa — sin esto último ninguna clínica se cobra (comportamiento seguro por diseño).
- **Fuera de alcance de este plan** (posibles siguientes fases, no implementar aquí): aviso por WhatsApp del cargo mensual, acumulación de meses impagos más allá del más reciente, y la integración con Stripe (cuando aplique, solo necesitaría un webhook que llame internamente a la misma lógica de `confirmPayment`).
