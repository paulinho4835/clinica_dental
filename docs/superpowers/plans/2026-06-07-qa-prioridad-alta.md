# QA Prioridad Alta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cubrir los tres gaps de calidad más críticos antes del lanzamiento: error boundaries para pantalla blanca, validación client-side con errores por campo, y suite E2E con Playwright.

**Architecture:** Tres subsistemas independientes: (1) `error.tsx` en App Router que envuelve módulos del dashboard; (2) schemas Zod extraídos a `lib/schemas/` reutilizados en react-hook-form para feedback inmediato; (3) Playwright apuntando a `localhost:3000` + Supabase local con usuario seed `admin@sonrisa.com / password123`.

**Tech Stack:** Next.js 15 App Router, React 19 `useActionState`, Zod, `react-hook-form`, `@hookform/resolvers/zod`, Playwright `@playwright/test`.

---

## Task 1: Error Boundaries

**Files:**
- Create: `app/error.tsx` (global fallback)
- Create: `app/(dashboard)/error.tsx` (cubre todos los módulos del dashboard)

- [ ] **Step 1: Crear `app/error.tsx`**

```tsx
"use client";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html>
      <body className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md rounded-lg border border-red-200 bg-white p-8 text-center shadow">
          <h1 className="mb-2 text-xl font-semibold text-slate-800">
            Algo salió mal
          </h1>
          <p className="mb-6 text-sm text-slate-500">
            Ocurrió un error inesperado. Si el problema persiste, contacta al soporte.
          </p>
          <button
            onClick={reset}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Intentar de nuevo
          </button>
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Crear `app/(dashboard)/error.tsx`**

```tsx
"use client";
import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <AlertCircle className="h-12 w-12 text-red-400" />
      <div>
        <h2 className="mb-1 text-lg font-semibold text-slate-800">
          Error al cargar este módulo
        </h2>
        <p className="text-sm text-slate-500">
          {error.message || "Ocurrió un error inesperado."}
        </p>
      </div>
      <button
        onClick={reset}
        className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        Reintentar
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Verificar que la app compila**

```bash
npm run typecheck && npm run build
```
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/error.tsx "app/(dashboard)/error.tsx"
git commit -m "feat: error boundaries para módulos del dashboard"
```

---

## Task 2: Validación client-side con react-hook-form + Zod

**Files:**
- Create: `lib/schemas/patient.ts` (schema Zod compartido, sin "use server")
- Create: `lib/schemas/payment.ts` (schema de pago para el cliente)
- Modify: `app/(dashboard)/pacientes/actions.ts` (importa desde lib/schemas)
- Modify: `app/(dashboard)/caja/actions.ts` (importa desde lib/schemas)
- Modify: `components/patients/NewPatientForm.tsx` (react-hook-form + errors inline)
- Modify: `components/patients/EditPatientForm.tsx` (react-hook-form + errors inline)
- Modify: `components/caja/PaymentForm.tsx` (validación de monto/paciente client-side)

- [ ] **Step 1: Instalar dependencia**

```bash
npm install @hookform/resolvers
```
Expected: `@hookform/resolvers` aparece en `package.json` dependencies. (`react-hook-form` ya está en el proyecto.)

- [ ] **Step 2: Crear `lib/schemas/patient.ts`**

```ts
import { z } from "zod";

export const PatientSchema = z.object({
  full_name: z.string().min(1, "Nombre requerido"),
  national_id: z.string().optional().nullable(),
  dob: z.string().optional().nullable(),
  sex: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z
    .string()
    .email("Email inválido")
    .optional()
    .or(z.literal("")),
  address: z.string().optional().nullable(),
  allergies: z.string().optional().nullable(),
  medical_alerts: z.string().optional().nullable(),
});

export type PatientInput = z.infer<typeof PatientSchema>;
```

- [ ] **Step 3: Crear `lib/schemas/payment.ts`**

```ts
import { z } from "zod";

export const PaymentSchema = z.object({
  patient_id: z.string().uuid("Selecciona un paciente"),
  amount: z.coerce
    .number({ invalid_type_error: "Monto requerido" })
    .positive("Monto debe ser mayor a 0"),
  method: z.enum(["cash", "qr", "card"]),
  kind: z.enum(["payment", "credit"]).default("payment"),
  note: z.string().max(120).optional().nullable(),
  doctor_id: z.string().uuid().optional().nullable(),
});

export type PaymentInput = z.infer<typeof PaymentSchema>;
```

- [ ] **Step 4: Actualizar `app/(dashboard)/pacientes/actions.ts`**

Reemplazar la definición inline de `PatientSchema` por:

```ts
import { PatientSchema } from "@/lib/schemas/patient";
```

Y eliminar el bloque `const PatientSchema = z.object({ ... })` que ya existía en el archivo.

- [ ] **Step 5: Actualizar `app/(dashboard)/caja/actions.ts`**

Reemplazar la definición inline de `PaymentSchema` por:

```ts
import { PaymentSchema } from "@/lib/schemas/payment";
```

Y eliminar el bloque `const PaymentSchema = z.object({ ... })` del archivo.

- [ ] **Step 6: Reescribir `components/patients/NewPatientForm.tsx`**

```tsx
"use client";

import { useActionState, useEffect, useRef, startTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useState } from "react";
import { createPatient, type ActionState } from "@/app/(dashboard)/pacientes/actions";
import { PatientSchema, type PatientInput } from "@/lib/schemas/patient";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { fieldInputClass, FieldLabel } from "@/components/ui/Field";

const initial: ActionState = {};

export function NewPatientForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createPatient, initial);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PatientInput>({ resolver: zodResolver(PatientSchema) });

  useEffect(() => {
    if (state.ok) {
      reset();
      setOpen(false);
      router.refresh();
      toast("Paciente guardado", "success");
    }
  }, [state.ok, router, reset]);

  const onSubmit = (data: PatientInput) => {
    const fd = new FormData();
    (Object.entries(data) as [string, string | null | undefined][]).forEach(
      ([k, v]) => { if (v != null) fd.append(k, v); },
    );
    startTransition(() => formAction(fd));
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Nuevo paciente
      </Button>
    );
  }

  return (
    <Card className="p-4">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { name: "full_name" as const, label: "Nombre completo *" },
            { name: "national_id" as const, label: "Cédula de identidad (CI)" },
            { name: "phone" as const, label: "Teléfono" },
            { name: "dob" as const, label: "Fecha de nacimiento", type: "date" },
            { name: "email" as const, label: "Email", type: "email" },
            { name: "sex" as const, label: "Sexo" },
            { name: "address" as const, label: "Dirección" },
            { name: "allergies" as const, label: "Alergias (separadas por coma)" },
            { name: "medical_alerts" as const, label: "Alertas médicas (coma)" },
          ].map(({ name, label, type }) => (
            <label key={name} className="block text-sm">
              <FieldLabel>{label}</FieldLabel>
              <input
                {...register(name)}
                type={type ?? "text"}
                className={fieldInputClass}
              />
              {errors[name] && (
                <p className="mt-0.5 text-xs text-red-600">{errors[name]?.message}</p>
              )}
            </label>
          ))}
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
```

- [ ] **Step 7: Reescribir `components/patients/EditPatientForm.tsx`** (solo la parte del form)

Aplicar el mismo patrón que `NewPatientForm` pero con `defaultValues` desde `patient`:

```tsx
const {
  register,
  handleSubmit,
  formState: { errors },
} = useForm<PatientInput>({
  resolver: zodResolver(PatientSchema),
  defaultValues: {
    full_name: patient.full_name,
    national_id: patient.national_id ?? "",
    phone: patient.phone ?? "",
    dob: patient.dob ?? "",
    email: patient.email ?? "",
    sex: patient.sex ?? "",
    address: patient.address ?? "",
    allergies: Array.isArray(patient.allergies) ? patient.allergies.join(", ") : "",
    medical_alerts: Array.isArray(patient.medical_alerts) ? patient.medical_alerts.join(", ") : "",
  },
});

const onSubmit = (data: PatientInput) => {
  const fd = new FormData();
  (Object.entries(data) as [string, string | null | undefined][]).forEach(
    ([k, v]) => { if (v != null) fd.append(k, v); },
  );
  startTransition(() => formAction(fd));
};
```

El JSX del form cambia `action={formAction}` → `onSubmit={handleSubmit(onSubmit)}` y cada `<Field>` se reemplaza por `<input {...register(name)} className={fieldInputClass} />` con su `<p>` de error.

- [ ] **Step 8: Añadir validación de paciente en `PaymentForm.tsx`**

Agregar al inicio del componente:

```tsx
const { handleSubmit: validatePayment } = useForm<{ patient_id: string; amount: number }>({
  resolver: zodResolver(PaymentSchema.pick({ patient_id: true, amount: true })),
});
```

Y mostrar error inline para `amount`:

```tsx
<input
  name="amount"
  type="number"
  step="0.01"
  min="0.01"
  required
  className={fieldInputClass}
  onChange={(e) => {
    const v = parseFloat(e.target.value);
    setAmountError(isNaN(v) || v <= 0 ? "Monto debe ser mayor a 0" : "");
  }}
/>
{amountError && <p className="mt-0.5 text-xs text-red-600">{amountError}</p>}
```

Agregar `const [amountError, setAmountError] = useState("")` al estado.

- [ ] **Step 9: Typecheck**

```bash
npm run typecheck
```
Expected: 0 errores.

- [ ] **Step 10: Commit**

```bash
git add lib/schemas/ "app/(dashboard)/pacientes/actions.ts" "app/(dashboard)/caja/actions.ts" components/patients/ components/caja/PaymentForm.tsx
git commit -m "feat: validación client-side con react-hook-form + Zod schemas compartidos"
```

---

## Task 3: E2E con Playwright

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/global-setup.ts` (guarda auth state)
- Create: `e2e/auth.setup.ts`
- Create: `e2e/agenda.spec.ts`
- Create: `e2e/patients.spec.ts`
- Create: `e2e/caja.spec.ts`

Pre-requisitos: `supabase start` + `supabase db reset` corriendo, luego `npm run dev` en puerto 3000.
Credenciales del seed: `admin@sonrisa.com` / `password123`.

- [ ] **Step 1: Instalar Playwright**

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Crear `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 1,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/admin.json",
      },
      dependencies: ["setup"],
    },
  ],
});
```

- [ ] **Step 3: Crear `e2e/auth.setup.ts`**

```ts
import { test as setup } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, ".auth/admin.json");

setup("autenticar admin", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("admin@sonrisa.com");
  await page.getByLabel(/contraseña|password/i).fill("password123");
  await page.getByRole("button", { name: /iniciar sesión|entrar/i }).click();
  await page.waitForURL("**/agenda");
  await page.context().storageState({ path: authFile });
});
```

- [ ] **Step 4: Crear directorio `.auth` y gitignore**

```bash
mkdir e2e/.auth
echo "e2e/.auth/" >> .gitignore
```

- [ ] **Step 5: Crear `e2e/agenda.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test.describe("Agenda", () => {
  test("carga la agenda y muestra el calendario", async ({ page }) => {
    await page.goto("/agenda");
    await expect(page).toHaveURL(/\/agenda/);
    // El calendario muestra el mes actual
    await expect(page.getByRole("heading", { level: 2 })).toBeVisible();
  });

  test("el menú lateral muestra Agenda activa", async ({ page }) => {
    await page.goto("/agenda");
    // NavLink activo tiene aria-current=page
    await expect(page.getByRole("link", { name: /agenda/i, exact: false }).first()).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
```

- [ ] **Step 6: Crear `e2e/patients.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test.describe("Pacientes", () => {
  test("lista de pacientes carga sin error", async ({ page }) => {
    await page.goto("/pacientes");
    await expect(page).toHaveURL(/\/pacientes/);
    // El botón de nuevo paciente está visible
    await expect(page.getByRole("button", { name: /nuevo paciente/i })).toBeVisible();
  });

  test("abrir formulario de nuevo paciente", async ({ page }) => {
    await page.goto("/pacientes");
    await page.getByRole("button", { name: /nuevo paciente/i }).click();
    // El campo nombre aparece
    await expect(page.getByText(/nombre completo/i)).toBeVisible();
  });

  test("validación client-side: nombre requerido", async ({ page }) => {
    await page.goto("/pacientes");
    await page.getByRole("button", { name: /nuevo paciente/i }).click();
    // Submit sin llenar nada
    await page.getByRole("button", { name: /^guardar$/i }).click();
    await expect(page.getByText(/nombre requerido/i)).toBeVisible();
  });
});
```

- [ ] **Step 7: Crear `e2e/caja.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test.describe("Caja", () => {
  test("página de caja carga con stats", async ({ page }) => {
    await page.goto("/caja");
    await expect(page).toHaveURL(/\/caja/);
    await expect(page.getByRole("button", { name: /registrar pago/i })).toBeVisible();
  });

  test("abrir formulario de pago", async ({ page }) => {
    await page.goto("/caja");
    await page.getByRole("button", { name: /registrar pago/i }).click();
    await expect(page.getByText(/paciente/i).first()).toBeVisible();
    await expect(page.getByText(/monto/i)).toBeVisible();
  });

  test("dashboard de finanzas carga sin error", async ({ page }) => {
    await page.goto("/caja/dashboard");
    await expect(page).toHaveURL(/\/caja\/dashboard/);
    // El gráfico o su contenedor está en el DOM
    await expect(page.locator("main")).toBeVisible();
  });
});
```

- [ ] **Step 8: Agregar script en `package.json`**

En la sección `"scripts"`, agregar:

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

- [ ] **Step 9: Correr los tests E2E**

Precondición: `supabase start` + `supabase db reset` + `npm run dev` corriendo en otra terminal.

```bash
npm run test:e2e
```

Expected: setup pasa, 7 tests pasan en chromium.

- [ ] **Step 10: Commit**

```bash
git add playwright.config.ts e2e/ package.json package-lock.json .gitignore
git commit -m "feat: E2E con Playwright — login, agenda, pacientes, caja"
```

---

## Self-Review

**Spec coverage:**
- ✅ Error boundaries: `app/error.tsx` + `app/(dashboard)/error.tsx`
- ✅ Client validation: schemas extraídos, RHF en NewPatient + EditPatient, inline en Payment
- ✅ E2E: login auth, agenda, pacientes (incl. validación), caja + dashboard

**Placeholder scan:** ninguno encontrado — todos los pasos tienen código concreto.

**Type consistency:** `PatientInput`, `PaymentInput` definidos en Task 2 Step 2-3 y usados en Steps 6-8. `formAction` sigue siendo `useActionState` action en todos los componentes.
