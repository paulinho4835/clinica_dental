# Pagos a personal — Maestro-detalle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar `/pagos` con el layout maestro-detalle de `/cuentas`: lista de personas a la izquierda (con badge de comisión pendiente), detalle por persona a la derecha (tarjetas, trabajos pendientes, formulario, historial).

**Architecture:** Cambio solo de UI sobre las queries existentes. Se extrae la agregación de comisiones pendientes a `lib/pagos.ts` (lógica pura, testeable con Vitest). `PagosFilter` queda solo con el filtro de mes, `StaffPaymentForm` recibe un `payee` fijo en vez del dropdown, y `page.tsx` se reescribe al patrón de dos paneles de `cuentas/page.tsx`. Server actions (`actions.ts`, `work-actions.ts`) y componentes `DisbursedToggle`, `DeletePaymentButton`, `PrintPagosButton` quedan intactos.

**Tech Stack:** Next.js App Router (Server Components + client components), Supabase (server client con RLS), Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-14-pagos-personal-maestro-detalle-design.md`

## Global Constraints

- Español neutro en toda la UI (sin voseo: "haz" no "hacé", "puedes" no "podés").
- Aislamiento por clínica EXPLÍCITO en toda query nueva: `.eq("clinic_id", profile!.clinicId)` — no depender solo de RLS.
- NUNCA hacer push sin autorización explícita del usuario. Commits locales sí.
- Sin migraciones SQL. Sin cambios en `app/(dashboard)/pagos/actions.ts` ni `app/(dashboard)/pagos/work-actions.ts`.
- Para "hoy" usar `boliviaTodayISO()` de `lib/format` (nunca `new Date().toISOString()`).
- Selección de persona vía URL con IDs compuestos: `p=p:<uuid>` (perfil) / `p=r:<uuid>` (recepcionista).
- La barra de progreso del paciente SE MANTIENE, con rótulo explícito "Pago del paciente".
- Nombre del paciente en trabajos pendientes SIN truncar (quitar `max-w-[8rem] truncate`).
- Tests con Vitest: `npm test` (tests en `tests/`, lógica pura en `lib/`).

---

### Task 1: Lógica pura — `lib/pagos.ts` (comisiones pendientes por doctor)

**Files:**
- Create: `lib/pagos.ts`
- Test: `tests/pagos.test.ts`

**Interfaces:**
- Consumes: nada (lógica pura).
- Produces:
  - `COMMISSION_ROLES: Set<string>` — roles que ganan comisión (`"odontologo_general" | "especialista" | "colega" | "admin"`). La Task 2 lo importa tanto en el server component como en el client component.
  - `type PendingCommissionRow = { doctor_id: string; commission_amount: number; lab_commission_amount: number; commission_paid_amount: number }`
  - `sumPendingCommissions(rows: PendingCommissionRow[]): Map<string, number>` — suma por `doctor_id` el restante (`commission_amount + lab_commission_amount − commission_paid_amount`), ignorando restos ≤ 0.005, redondeando a 2 decimales.

- [ ] **Step 1: Write the failing test**

Crear `tests/pagos.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { COMMISSION_ROLES, sumPendingCommissions } from "@/lib/pagos";

describe("COMMISSION_ROLES", () => {
  it("incluye a los roles clínicos y al admin, no a recepcionista/asistente", () => {
    expect(COMMISSION_ROLES.has("odontologo_general")).toBe(true);
    expect(COMMISSION_ROLES.has("especialista")).toBe(true);
    expect(COMMISSION_ROLES.has("colega")).toBe(true);
    expect(COMMISSION_ROLES.has("admin")).toBe(true);
    expect(COMMISSION_ROLES.has("recepcionista")).toBe(false);
    expect(COMMISSION_ROLES.has("asistente")).toBe(false);
  });
});

describe("sumPendingCommissions", () => {
  it("suma el restante por doctor (comisión + lab − abonado)", () => {
    const map = sumPendingCommissions([
      { doctor_id: "a", commission_amount: 100, lab_commission_amount: 20, commission_paid_amount: 0 },
      { doctor_id: "a", commission_amount: 50, lab_commission_amount: 0, commission_paid_amount: 30 },
      { doctor_id: "b", commission_amount: 200, lab_commission_amount: 0, commission_paid_amount: 0 },
    ]);
    expect(map.get("a")).toBe(140); // 120 + 20
    expect(map.get("b")).toBe(200);
  });

  it("ignora trabajos con comisión saldada (restante ≤ 0.005)", () => {
    const map = sumPendingCommissions([
      { doctor_id: "a", commission_amount: 100, lab_commission_amount: 0, commission_paid_amount: 100 },
      { doctor_id: "a", commission_amount: 50, lab_commission_amount: 0, commission_paid_amount: 49.996 },
    ]);
    expect(map.has("a")).toBe(false);
  });

  it("redondea a 2 decimales los acumulados con flotantes", () => {
    const map = sumPendingCommissions([
      { doctor_id: "a", commission_amount: 0.1, lab_commission_amount: 0, commission_paid_amount: 0 },
      { doctor_id: "a", commission_amount: 0.2, lab_commission_amount: 0, commission_paid_amount: 0 },
    ]);
    expect(map.get("a")).toBe(0.3);
  });

  it("devuelve mapa vacío sin filas", () => {
    expect(sumPendingCommissions([]).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pagos.test.ts`
Expected: FAIL — `Cannot find module '@/lib/pagos'` (o equivalente).

- [ ] **Step 3: Write minimal implementation**

Crear `lib/pagos.ts`:

```ts
// Lógica pura del módulo Pagos a personal (sin dependencias de Supabase/React
// para poder testearla con Vitest).

// Roles que ganan comisión por trabajos clínicos. El admin se incluye porque en
// clínicas chicas suele atender pacientes además de administrar (tiene
// doctor_works y comisiones, igual que un doctor). Un admin puramente
// administrativo no tendrá trabajos pendientes → sin badge, sin daño.
export const COMMISSION_ROLES = new Set([
  "odontologo_general",
  "especialista",
  "colega",
  "admin",
]);

export type PendingCommissionRow = {
  doctor_id: string;
  commission_amount: number;
  lab_commission_amount: number;
  commission_paid_amount: number;
};

// Suma por doctor la comisión aún no pagada (comisión + lab − abonos previos).
// Alimenta el badge "Bs X pendiente" de la lista de personas en /pagos.
export function sumPendingCommissions(
  rows: PendingCommissionRow[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const remaining =
      r.commission_amount + r.lab_commission_amount - r.commission_paid_amount;
    if (remaining <= 0.005) continue;
    const next = (map.get(r.doctor_id) ?? 0) + remaining;
    map.set(r.doctor_id, Math.round(next * 100) / 100);
  }
  return map;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pagos.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run full suite and commit**

Run: `npm test` — Expected: todos los tests del proyecto en verde.

```bash
git add lib/pagos.ts tests/pagos.test.ts
git commit -m "feat(pagos): lógica pura de comisiones pendientes por doctor"
```

---

### Task 2: UI maestro-detalle — `PagosFilter`, `StaffPaymentForm`, `page.tsx`

Los tres archivos cambian juntos y solo compilan juntos (las nuevas props del
form y el filtro las provee la página nueva), por eso son una sola tarea con
un solo commit.

**Files:**
- Modify: `components/pagos/PagosFilter.tsx` (reescritura completa: solo mes)
- Modify: `components/pagos/StaffPaymentForm.tsx` (reescritura completa: payee fijo)
- Modify: `app/(dashboard)/pagos/page.tsx` (reescritura completa: dos paneles)

**Interfaces:**
- Consumes (de Task 1): `COMMISSION_ROLES`, `sumPendingCommissions`, `PendingCommissionRow` de `@/lib/pagos`.
- Consumes (existentes, sin cambios): `createStaffPayment` y `ActionState` de `@/app/(dashboard)/pagos/actions`; `fetchDoctorUnpaidWorks` y `UnpaidWork` de `@/app/(dashboard)/pagos/work-actions`; `DisbursedToggle`, `DeletePaymentButton`, `PrintPagosButton`/`PrintPaymentRow`; `TreatmentProgressBar`; primitivos `PageHeader`, `Stat`, `EmptyState`; `boliviaTodayISO`, `bs`, `fmtBoliviaTime` de `@/lib/format`; `toast` de `@/lib/toast`.
- Produces:
  - `PagosFilter({ selectedMonth }: { selectedMonth: string })` — solo filtro de mes (param URL `month`).
  - `StaffPaymentForm({ payee, today }: { payee: Payee; today: string })` con `type Payee = { key: string; id: string; full_name: string; role: string; kind: "profile" | "receptionist" }` (exportado como `export type Payee`).

- [ ] **Step 1: Reescribir `components/pagos/PagosFilter.tsx`**

Contenido completo del archivo:

```tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

// Filtro de mes del historial de pagos. El filtro por persona ya no existe:
// la persona se elige en el panel izquierdo (layout maestro-detalle).
export function PagosFilter({ selectedMonth }: { selectedMonth: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const isAllMonths = selectedMonth === "all";
  const todayMonth = new Date().toLocaleDateString("en-CA").slice(0, 7);

  function update(value: string) {
    const next = new URLSearchParams(params.toString());
    next.set("month", value);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="month-filter" className="text-sm font-medium text-slate-600 whitespace-nowrap">
        Mes:
      </label>
      {!isAllMonths && (
        <input
          id="month-filter"
          type="month"
          value={selectedMonth}
          onChange={(e) => update(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-clinic/40"
        />
      )}
      <button
        type="button"
        onClick={() => update(isAllMonths ? todayMonth : "all")}
        className={`rounded-full px-3 py-1 text-xs font-medium transition ${
          isAllMonths
            ? "bg-clinic text-white"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        Todos los meses
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Reescribir `components/pagos/StaffPaymentForm.tsx`**

Cambios respecto a la versión actual: (1) recibe `payee` único en vez del
array `payees` — desaparecen el `<select>`, el estado `payeeKey`,
`onPayeeChange`, `profilePayees`/`receptionistPayees` y `ROLE_LABEL`;
(2) `COMMISSION_ROLES` se importa de `@/lib/pagos` (se elimina la copia
local); (3) los trabajos pendientes se cargan con un `useEffect` al montar;
(4) el nombre del paciente ya no se trunca; (5) la barra del paciente lleva
el rótulo "Pago del paciente".

Contenido completo del archivo:

```tsx
"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStaffPayment, type ActionState } from "@/app/(dashboard)/pagos/actions";
import { fetchDoctorUnpaidWorks, type UnpaidWork } from "@/app/(dashboard)/pagos/work-actions";
import { TreatmentProgressBar } from "@/components/treatments/TreatmentProgressBar";
import { COMMISSION_ROLES } from "@/lib/pagos";
import { bs } from "@/lib/format";
import { toast } from "@/lib/toast";

// Agrupación de trabajos pendientes por ítem del plan de tratamiento.
// Varias cuotas/sesiones del mismo tratamiento se muestran como una sola
// barra de progreso (el avance del pago del paciente es por tratamiento).
type WorkGroup = {
  key: string;
  name: string;
  // Trabajos del grupo ordenados del más antiguo al más nuevo; los abonos
  // parciales se asignan en ese orden (primero se salda la cuota más vieja).
  works: { id: string; remaining: number }[];
  commission: number;
  // Comisión ya abonada (adelantos) y restante por pagar del grupo.
  commissionPaid: number;
  remaining: number;
  planItemPrice: number;
  planItemPaid: number;
  performed_at: string;
  patient_name: string | null;
  hasBar: boolean;
};

// Destinatario de un pago: un empleado con cuenta (profiles) o una recepcionista
// sin cuenta (clinic_receptionists). `key` es el id compuesto ("p:uuid"/"r:uuid").
export type Payee = {
  key: string;
  id: string;
  full_name: string;
  role: string;
  kind: "profile" | "receptionist";
};

const initial: ActionState = {};

function fmtShortDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "2-digit",
  });
}

// La persona viene fijada por la selección del panel izquierdo (layout
// maestro-detalle) — este form ya no tiene dropdown "Pagar a". El padre debe
// montarlo con key={payee.key} para resetear el estado al cambiar de persona.
export function StaffPaymentForm({
  payee,
  today,
}: {
  payee: Payee;
  today: string;
}) {
  const [state, formAction, pending] = useActionState(createStaffPayment, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const [amount, setAmount] = useState("");
  const [concept, setConcept] = useState("");
  const [unpaidWorks, setUnpaidWorks] = useState<UnpaidWork[]>([]);
  // Grupos seleccionados y el monto a abonar a cada uno (editable: permite
  // adelantos parciales). key del grupo → monto como string del input.
  const [groupAmounts, setGroupAmounts] = useState<Map<string, string>>(new Map());
  const [fetching, startFetch] = useTransition();

  const isProfile = payee.kind === "profile";
  const earnsCommission = isProfile && COMMISSION_ROLES.has(payee.role);

  // Cargar los trabajos pendientes de la persona al montar. Solo los empleados
  // con cuenta (profiles) que ganan comisión tienen trabajos que cargar.
  useEffect(() => {
    if (!earnsCommission) return;
    startFetch(async () => {
      const works = await fetchDoctorUnpaidWorks(payee.id);
      setUnpaidWorks(works);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payee.id]);

  // Agrupar trabajos por treatment_item_id → una barra por tratamiento.
  // Los trabajos sin plan (manuales) quedan como grupo individual sin barra.
  const groups = useMemo<WorkGroup[]>(() => {
    const map = new Map<string, WorkGroup>();
    for (const w of unpaidWorks) {
      const key = w.planItemId ?? `work:${w.id}`;
      const comm = w.commission_amount + w.lab_commission_amount;
      const paid = w.commission_paid_amount;
      const remaining = Math.max(0, Math.round((comm - paid) * 100) / 100);
      const existing = map.get(key);
      if (existing) {
        existing.works.push({ id: w.id, remaining });
        existing.commission += comm;
        existing.commissionPaid += paid;
        existing.remaining = Math.round((existing.remaining + remaining) * 100) / 100;
        if (w.performed_at > existing.performed_at) existing.performed_at = w.performed_at;
      } else {
        map.set(key, {
          key,
          name: w.planItemId ? w.planItemName : w.description,
          works: [{ id: w.id, remaining }],
          commission: comm,
          commissionPaid: paid,
          remaining,
          planItemPrice: w.planItemPrice,
          planItemPaid: w.planItemPaid,
          performed_at: w.performed_at,
          patient_name: w.patient_name,
          hasBar: w.planItemPrice > 0,
        });
      }
    }
    // Dentro de cada grupo, cuota más antigua primero: los abonos se asignan
    // en ese orden. unpaidWorks llega del server ordenado descendente.
    for (const g of map.values()) g.works.reverse();
    return Array.from(map.values());
  }, [unpaidWorks]);

  // Reparte el abono de cada grupo seleccionado entre sus trabajos (cuota más
  // antigua primero, hasta el restante de cada una) → pares work_ids/work_amounts
  // que viajan como hidden inputs al server action.
  const allocations = useMemo(() => {
    const out: { workId: string; amount: number }[] = [];
    for (const g of groups) {
      const raw = groupAmounts.get(g.key);
      if (raw === undefined) continue;
      let left = Math.round((Number(raw) || 0) * 100) / 100;
      for (const w of g.works) {
        if (left <= 0) break;
        const alloc = Math.min(left, w.remaining);
        if (alloc > 0) out.push({ workId: w.id, amount: Math.round(alloc * 100) / 100 });
        left = Math.round((left - alloc) * 100) / 100;
      }
    }
    return out;
  }, [groups, groupAmounts]);

  const allocatedTotal = useMemo(
    () => Math.round(allocations.reduce((s, a) => s + a.amount, 0) * 100) / 100,
    [allocations],
  );
  const hasSelection = groupAmounts.size > 0;

  function syncDerived(next: Map<string, string>) {
    setGroupAmounts(next);
    const selected = groups.filter((g) => next.has(g.key));
    const total = selected.reduce((s, g) => s + (Number(next.get(g.key)) || 0), 0);
    setAmount(total > 0 ? String(Math.round(total * 100) / 100) : "");
    const descs = [...new Set(selected.map((g) => g.name).filter(Boolean))];
    const conceptStr =
      descs.length > 4
        ? `Comisiones: ${descs.slice(0, 4).join(", ")} (+${descs.length - 4} más)`
        : descs.length > 0
          ? `Comisiones: ${descs.join(", ")}`
          : "";
    setConcept(conceptStr);
  }

  function toggleGroup(g: WorkGroup) {
    const next = new Map(groupAmounts);
    if (next.has(g.key)) next.delete(g.key);
    else next.set(g.key, String(g.remaining)); // por defecto: saldar el restante
    syncDerived(next);
  }

  function setGroupAmount(g: WorkGroup, value: string) {
    const next = new Map(groupAmounts);
    next.set(g.key, value);
    syncDerived(next);
  }

  function selectAll() {
    const next = new Map<string, string>();
    for (const g of groups) if (g.remaining > 0) next.set(g.key, String(g.remaining));
    syncDerived(next);
  }

  function clearSelection() {
    setGroupAmounts(new Map());
    setAmount("");
    setConcept("");
  }

  // Un abono inválido (vacío, 0 o mayor al restante) bloquea el submit.
  const invalidGroup = groups.find((g) => {
    const raw = groupAmounts.get(g.key);
    if (raw === undefined) return false;
    const n = Number(raw);
    return !Number.isFinite(n) || n <= 0 || n > g.remaining + 0.005;
  });

  useEffect(() => {
    if (state.ok) {
      toast("Pago registrado", "success");
      formRef.current?.reset();
      setAmount("");
      setConcept("");
      setGroupAmounts(new Map());
      // Refrescar los trabajos pendientes de la persona, para que los que se
      // acaban de pagar desaparezcan sin necesidad de F5.
      if (earnsCommission) {
        startFetch(async () => {
          const works = await fetchDoctorUnpaidWorks(payee.id);
          setUnpaidWorks(works);
        });
      }
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"
    >
      <p className="text-sm font-medium text-slate-700">
        Registrar pago a {payee.full_name}
      </p>

      {/* Destinatario + work_ids via hidden inputs (valores controlados).
          Se manda employee_id O receptionist_id según el tipo de destinatario. */}
      <input type="hidden" name="employee_id" value={isProfile ? payee.id : ""} />
      <input
        type="hidden"
        name="receptionist_id"
        value={payee.kind === "receptionist" ? payee.id : ""}
      />
      {/* Abonos por trabajo: pares alineados work_ids[i] ↔ work_amounts[i]. */}
      {allocations.map((a) => (
        <span key={a.workId}>
          <input type="hidden" name="work_ids" value={a.workId} />
          <input type="hidden" name="work_amounts" value={a.amount} />
        </span>
      ))}

      {/* Panel de trabajos — para quienes ganan comisión (doctores y admin clínico) */}
      {earnsCommission && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Trabajos pendientes de comisión
            </span>
            {unpaidWorks.length > 0 && (
              <div className="flex gap-3">
                <button type="button" onClick={selectAll} className="text-xs text-clinic hover:underline">
                  Seleccionar todos
                </button>
                {hasSelection && (
                  <button type="button" onClick={clearSelection} className="text-xs text-slate-400 hover:underline">
                    Limpiar
                  </button>
                )}
              </div>
            )}
          </div>

          {fetching && (
            <p className="py-2 text-xs text-slate-400">Cargando trabajos…</p>
          )}

          {!fetching && unpaidWorks.length === 0 && (
            <p className="py-1 text-xs text-slate-400">Sin comisiones pendientes.</p>
          )}

          {!fetching && unpaidWorks.length > 0 && (
            <div className="overflow-hidden rounded border border-slate-200 bg-white">
              {groups.map((g) => {
                const checked = groupAmounts.has(g.key);
                const rawAmount = groupAmounts.get(g.key) ?? "";
                const amountNum = Number(rawAmount);
                const amountInvalid =
                  checked &&
                  (!Number.isFinite(amountNum) || amountNum <= 0 || amountNum > g.remaining + 0.005);
                const sessions = g.works.length;
                return (
                  <div
                    key={g.key}
                    className={`flex flex-col gap-1 border-b border-slate-100 px-3 py-2 text-sm last:border-0 transition ${
                      checked ? "bg-clinic/5" : "hover:bg-slate-50"
                    }`}
                  >
                    <label
                      className={`flex items-center gap-3 ${
                        g.remaining > 0 ? "cursor-pointer" : "cursor-default"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={g.remaining <= 0}
                        onChange={() => toggleGroup(g)}
                        className="accent-clinic shrink-0 disabled:opacity-30"
                      />
                      <span className="whitespace-nowrap tabular-nums text-xs text-slate-400">
                        {fmtShortDate(g.performed_at)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-slate-700">
                        {g.name}
                        {sessions > 1 && (
                          <span className="ml-1.5 text-xs text-slate-400">({sessions} cuotas)</span>
                        )}
                      </span>
                      {g.patient_name && (
                        <span className="shrink-0 text-xs text-slate-400">
                          {g.patient_name}
                        </span>
                      )}
                      <span
                        className={`whitespace-nowrap tabular-nums text-xs font-medium ${
                          g.remaining <= 0 ? "text-emerald-600" : "text-clinic"
                        }`}
                      >
                        {g.remaining <= 0
                          ? "Comisión saldada ✓"
                          : g.commissionPaid > 0
                            ? bs(g.remaining)
                            : bs(g.commission)}
                      </span>
                    </label>
                    {/* Comisión con abono previo: mostrar el avance del doctor */}
                    {g.commissionPaid > 0 && g.remaining > 0 && (
                      <p className="ml-6 text-xs text-amber-600">
                        Abonado {bs(g.commissionPaid)} de {bs(g.commission)} — restan {bs(g.remaining)}
                      </p>
                    )}
                    {/* Barra del PACIENTE (pagos del tratamiento): informativa,
                        independiente de la comisión — no desaparece hasta que
                        el paciente salde, sin importar los adelantos al doctor.
                        El rótulo evita confundirla con la comisión del doctor. */}
                    {g.hasBar && (
                      <div className="ml-6">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          Pago del paciente
                        </span>
                        <TreatmentProgressBar paid={g.planItemPaid} total={g.planItemPrice} />
                      </div>
                    )}
                    {/* Monto a abonar (editable → adelanto parcial) */}
                    {checked && (
                      <div className="ml-6 flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1.5 text-xs text-slate-500">
                          Abonar Bs
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max={g.remaining}
                            value={rawAmount}
                            onChange={(e) => setGroupAmount(g, e.target.value)}
                            className={`w-24 rounded border bg-white px-2 py-1 text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-1 ${
                              amountInvalid
                                ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                                : "border-slate-300 focus:border-clinic focus:ring-clinic"
                            }`}
                          />
                        </label>
                        {amountNum > 0 && amountNum < g.remaining - 0.005 && !amountInvalid && (
                          <span className="text-xs text-slate-400">
                            adelanto parcial — quedarán {bs(Math.round((g.remaining - amountNum) * 100) / 100)} pendientes
                          </span>
                        )}
                        {amountInvalid && (
                          <span className="text-xs text-red-600">
                            máximo {bs(g.remaining)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {hasSelection && (
            <div className="flex items-center justify-between rounded-md bg-clinic/5 px-3 py-2 text-sm ring-1 ring-clinic/20">
              <span className="text-xs text-slate-500">
                {groupAmounts.size} tratamiento{groupAmounts.size !== 1 ? "s" : ""} seleccionado{groupAmounts.size !== 1 ? "s" : ""}
              </span>
              <span className="tabular-nums font-semibold text-clinic">{bs(allocatedTotal)}</span>
            </div>
          )}
        </div>
      )}

      {/* Campos del pago: Fecha + Monto + Método + Concepto */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs">
          <span className="mb-1 block text-slate-500">Fecha</span>
          <input
            name="paid_at"
            type="date"
            defaultValue={today}
            required
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none"
          />
        </label>

        <label className="text-xs">
          <span className="mb-1 block text-slate-500">
            Monto (Bs) *
            {hasSelection && (
              <span className="ml-1 text-slate-400">(suma de los abonos)</span>
            )}
          </span>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="0.00"
            value={amount}
            readOnly={hasSelection}
            onChange={(e) => setAmount(e.target.value)}
            className={`w-28 rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic ${
              hasSelection ? "bg-slate-50 text-slate-500" : "bg-white"
            }`}
          />
        </label>

        <label className="text-xs">
          <span className="mb-1 block text-slate-500">Método</span>
          <select
            name="method"
            defaultValue="cash"
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none"
          >
            <option value="cash">Efectivo</option>
            <option value="qr">QR</option>
            <option value="card">Tarjeta</option>
          </select>
        </label>

        <label className="flex-1 text-xs">
          <span className="mb-1 block text-slate-500">Concepto</span>
          <input
            name="concept"
            type="text"
            maxLength={200}
            placeholder="ej. Salario junio, Bono, Comisión semana..."
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            className="w-full min-w-[200px] rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending || Boolean(invalidGroup)}
          className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
        >
          {pending ? "…" : "Registrar pago"}
        </button>
        {invalidGroup && (
          <span className="text-xs text-red-600">
            Corrige el abono de "{invalidGroup.name}" (máximo {bs(invalidGroup.remaining)}).
          </span>
        )}
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
```

- [ ] **Step 3: Reescribir `app/(dashboard)/pagos/page.tsx`**

Contenido completo del archivo:

```tsx
import Link from "next/link";
import { requireNavAccess } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { getPlatformAdminIds } from "@/lib/platformAdmins";
import { boliviaTodayISO, bs, fmtBoliviaTime } from "@/lib/format";
import { COMMISSION_ROLES, sumPendingCommissions } from "@/lib/pagos";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import { EmptyState } from "@/components/ui/EmptyState";
import { Banknote, Receipt, Users } from "lucide-react";
import { StaffPaymentForm, type Payee } from "@/components/pagos/StaffPaymentForm";
import { PagosFilter } from "@/components/pagos/PagosFilter";
import { DeletePaymentButton } from "@/components/pagos/DeletePaymentButton";
import { DisbursedToggle } from "@/components/pagos/DisbursedToggle";
import { PrintPagosButton, type PrintPaymentRow } from "@/components/pagos/PrintPagosButton";

const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  qr: "QR",
  card: "Tarjeta",
  transfer: "Transferencia",
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  odontologo_general: "Odontólogo",
  especialista: "Especialista",
  recepcionista: "Recepcionista",
  colega: "Colega",
  asistente: "Asistente",
};

// Tabla del historial (una sola persona → sin columnas Trabajador/Rol).
const GRID =
  "grid grid-cols-[7rem_minmax(0,1.5fr)_7rem_8rem_8rem_2.5rem] items-center gap-x-4";

type WorkDetail = {
  description: string;
  patient_name: string | null;
  performed_at: string;
  // Monto abonado a este trabajo EN ESTE pago (bitácora staff_payment_works).
  // Con adelantos parciales ya no coincide con la comisión total del trabajo.
  paid_amount: number;
  // true si el abono no cubrió la comisión completa del trabajo (adelanto).
  is_partial: boolean;
};

type PaymentRow = {
  id: string;
  amount: number;
  method: string;
  concept: string | null;
  paid_at: string;
  created_at: string;
  disbursed: boolean;
  works: WorkDetail[];
};

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtShortDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "2-digit",
  });
}

export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; p?: string; month?: string }>;
}) {
  await requireNavAccess("pagos");
  const supabase = await createClient();
  const profile = await getProfile();

  const { q = "", p: selectedKey, month } = await searchParams;
  const today = boliviaTodayISO();
  const currentMonth = today.slice(0, 7);
  const selectedMonth = month ?? currentMonth;
  const isAllMonths = selectedMonth === "all";

  const [year, monthNum] = isAllMonths ? [0, 0] : selectedMonth.split("-").map(Number);
  const monthStart = isAllMonths ? "" : `${selectedMonth}-01`;
  const nextMonthStart = isAllMonths ? "" : new Date(year, monthNum, 1).toISOString().slice(0, 10);

  // ── Panel izquierdo: personas + comisiones pendientes ─────────────────
  const platformAdminIds = await getPlatformAdminIds();
  let empQuery = supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("clinic_id", profile!.clinicId)
    .order("full_name");
  if (platformAdminIds.length > 0) {
    empQuery = empQuery.not("id", "in", `(${platformAdminIds.join(",")})`);
  }
  if (q.trim()) empQuery = empQuery.ilike("full_name", `%${q.trim()}%`);

  // Recepcionistas sin cuenta de login (tabla clinic_receptionists). Se les
  // puede registrar pagos (sueldo) aunque no hagan trabajos clínicos.
  let recepQuery = supabase
    .from("clinic_receptionists")
    .select("id, name")
    .eq("clinic_id", profile!.clinicId)
    .eq("active", true)
    .order("name");
  if (q.trim()) recepQuery = recepQuery.ilike("name", `%${q.trim()}%`);

  // Comisiones no saldadas de toda la clínica → badge "Bs X pendiente" por
  // persona. Query liviana: solo trabajos con commission_paid=false.
  const pendingQuery = supabase
    .from("doctor_works")
    .select("doctor_id, commission_amount, lab_commission_amount, commission_paid_amount")
    .eq("clinic_id", profile!.clinicId)
    .eq("commission_paid", false);

  const [{ data: employees }, { data: receptionists }, { data: pendingRaw }] =
    await Promise.all([empQuery, recepQuery, pendingQuery]);

  const pendingByDoctor = sumPendingCommissions(
    (pendingRaw ?? []).map((r) => ({
      doctor_id: r.doctor_id as string,
      commission_amount: Number(r.commission_amount),
      lab_commission_amount: Number(r.lab_commission_amount),
      commission_paid_amount: Number(r.commission_paid_amount ?? 0),
    })),
  );

  const payees: Payee[] = [
    ...(employees ?? []).map((e) => ({
      key: `p:${e.id}`,
      id: e.id as string,
      full_name: e.full_name as string,
      role: e.role as string,
      kind: "profile" as const,
    })),
    ...(receptionists ?? []).map((r) => ({
      key: `r:${r.id}`,
      id: r.id as string,
      full_name: r.name as string,
      role: "recepcionista",
      kind: "receptionist" as const,
    })),
  ];

  // Persona inexistente o de otra clínica → no está en payees → placeholder.
  const selectedPayee = payees.find((pp) => pp.key === selectedKey) ?? null;

  // ── Panel derecho: detalle de la persona seleccionada ─────────────────
  let rows: PaymentRow[] = [];
  let paidMonth = 0;
  let pendingDisburse = 0;

  if (selectedPayee) {
    let paymentsQuery = supabase
      .from("staff_payments")
      .select("id, amount, method, concept, paid_at, created_at, disbursed")
      .order("paid_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (selectedPayee.kind === "receptionist") {
      paymentsQuery = paymentsQuery.eq("receptionist_id", selectedPayee.id);
    } else {
      paymentsQuery = paymentsQuery.eq("employee_id", selectedPayee.id);
    }
    if (!isAllMonths) {
      paymentsQuery = paymentsQuery.gte("paid_at", monthStart).lt("paid_at", nextMonthStart);
    }

    const { data: rawPayments } = await paymentsQuery;

    const baseRows = (rawPayments ?? []).map((p) => ({
      id: p.id as string,
      amount: Number(p.amount),
      method: p.method as string,
      concept: p.concept as string | null,
      paid_at: p.paid_at as string,
      created_at: p.created_at as string,
      disbursed: Boolean(p.disbursed),
    }));

    // Traer los abonos asociados a los pagos visibles.
    // Fuente principal: la bitácora staff_payment_works (monto abonado real, que
    // con adelantos parciales difiere de la comisión total). Fallback legacy:
    // pagos anteriores a la bitácora, vinculados solo por doctor_works.staff_payment_id.
    const paymentIds = baseRows.map((r) => r.id);
    const worksByPayment = new Map<string, WorkDetail[]>();

    if (paymentIds.length > 0) {
      const [{ data: ledgerRaw }, { data: legacyRaw }] = await Promise.all([
        supabase
          .from("staff_payment_works")
          .select(
            "staff_payment_id, amount, work:doctor_works(description, patient_name, performed_at, commission_amount, lab_commission_amount)",
          )
          .in("staff_payment_id", paymentIds),
        supabase
          .from("doctor_works")
          .select(
            "id, staff_payment_id, description, patient_name, performed_at, commission_amount, lab_commission_amount",
          )
          .in("staff_payment_id", paymentIds)
          .order("performed_at", { ascending: false }),
      ]);

      const ledgeredPayments = new Set<string>();
      for (const row of ledgerRaw ?? []) {
        const pid = row.staff_payment_id as string;
        ledgeredPayments.add(pid);
        const w = row.work as {
          description?: string;
          patient_name?: string | null;
          performed_at?: string;
          commission_amount?: number;
          lab_commission_amount?: number;
        } | null;
        if (!w) continue;
        const commTotal = Number(w.commission_amount) + Number(w.lab_commission_amount);
        if (!worksByPayment.has(pid)) worksByPayment.set(pid, []);
        worksByPayment.get(pid)!.push({
          description: (w.description as string) ?? "",
          patient_name: (w.patient_name as string | null) ?? null,
          performed_at: (w.performed_at as string) ?? "",
          paid_amount: Number(row.amount),
          is_partial: Number(row.amount) < commTotal - 0.005,
        });
      }
      for (const list of worksByPayment.values()) {
        list.sort((a, b) => (a.performed_at < b.performed_at ? 1 : -1));
      }

      // Legacy: solo pagos SIN filas en la bitácora (el flujo viejo marcaba la
      // comisión completa, así que el abono mostrado es la comisión total).
      for (const w of legacyRaw ?? []) {
        const pid = w.staff_payment_id as string;
        if (ledgeredPayments.has(pid)) continue;
        if (!worksByPayment.has(pid)) worksByPayment.set(pid, []);
        worksByPayment.get(pid)!.push({
          description: w.description as string,
          patient_name: w.patient_name as string | null,
          performed_at: w.performed_at as string,
          paid_amount: Number(w.commission_amount) + Number(w.lab_commission_amount),
          is_partial: false,
        });
      }
    }

    rows = baseRows.map((r) => ({ ...r, works: worksByPayment.get(r.id) ?? [] }));
    paidMonth = rows.filter((p) => p.disbursed).reduce((s, p) => s + p.amount, 0);
    pendingDisburse = rows.filter((p) => !p.disbursed).reduce((s, p) => s + p.amount, 0);
  }

  const monthLabel = isAllMonths
    ? "Todos los meses"
    : new Date(monthStart + "T12:00:00").toLocaleDateString("es-BO", {
        month: "long",
        year: "numeric",
      });

  const pendingCommission =
    selectedPayee && selectedPayee.kind === "profile" && COMMISSION_ROLES.has(selectedPayee.role)
      ? (pendingByDoctor.get(selectedPayee.id) ?? 0)
      : null;

  const printRows: PrintPaymentRow[] = rows.map((r) => ({
    id: r.id,
    employeeName: selectedPayee?.full_name ?? "—",
    employeeRole: selectedPayee?.role ?? "",
    amount: r.amount,
    method: r.method,
    concept: r.concept,
    paid_at: r.paid_at,
    disbursed: r.disbursed,
    works: r.works,
  }));

  const qParam = q.trim() ? `q=${encodeURIComponent(q.trim())}&` : "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pagos a personal"
        subtitle="Registra y controla los pagos realizados a doctores, recepcionistas y personal de la clínica."
      />

      <div className="flex flex-col items-start gap-6 md:flex-row">
        {/* Panel izquierdo: búsqueda + lista de personas. En móvil se oculta al
            elegir a alguien (evita el layout de 2 columnas apretado). */}
        <div
          className={`w-full space-y-3 md:w-72 md:shrink-0 ${
            selectedPayee ? "hidden md:block" : ""
          }`}
        >
          <form method="get">
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar por nombre…"
              autoComplete="off"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
            />
          </form>

          <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
            {payees.length === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title={q ? `Sin resultados para “${q}”` : "Aún no hay personal"}
                description={
                  q
                    ? "Prueba con otro nombre."
                    : "Registra doctores o recepcionistas para pagarles aquí."
                }
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {payees.map((pp) => {
                  const pending =
                    pp.kind === "profile" && COMMISSION_ROLES.has(pp.role)
                      ? (pendingByDoctor.get(pp.id) ?? 0)
                      : 0;
                  return (
                    <Link
                      key={pp.key}
                      href={`/pagos?${qParam}p=${pp.key}`}
                      className={`block px-4 py-3 transition-colors hover:bg-slate-50 ${
                        selectedKey === pp.key
                          ? "border-l-2 border-clinic bg-clinic/5"
                          : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-800">
                            {pp.full_name}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-400">
                            {ROLE_LABEL[pp.role] ?? pp.role}
                          </div>
                        </div>
                        {pending > 0 && (
                          <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium tabular-nums text-amber-700 dark:bg-amber-500/10">
                            {bs(pending)} pendiente
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Panel derecho: detalle de pagos. En móvil solo se muestra cuando
            hay alguien elegido (ver arriba). */}
        <div className={`min-w-0 flex-1 ${!selectedPayee ? "hidden md:block" : ""}`}>
          {!selectedPayee ? (
            <div className="flex h-64 items-center justify-center rounded-lg bg-white text-sm text-slate-400 ring-1 ring-slate-200">
              Selecciona a una persona para ver sus pagos
            </div>
          ) : (
            <div className="space-y-4">
              <Link
                href={`/pagos?${qParam}`}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-clinic md:hidden"
              >
                ← Volver a la lista
              </Link>

              <div>
                <h2 className="text-lg font-semibold">{selectedPayee.full_name}</h2>
                <p className="text-xs text-slate-400">
                  {ROLE_LABEL[selectedPayee.role] ?? selectedPayee.role}
                </p>
              </div>

              {/* Tarjetas de resumen */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {pendingCommission !== null && (
                  <Stat
                    label="Comisión pendiente"
                    value={bs(pendingCommission)}
                    icon={<Receipt className="h-5 w-5" />}
                    valueClassName={pendingCommission > 0 ? "text-amber-600" : "text-emerald-600"}
                  />
                )}
                <Stat
                  label={`Pagado — ${monthLabel}`}
                  value={bs(paidMonth)}
                  icon={<Banknote className="h-5 w-5" />}
                  valueClassName="text-emerald-600"
                />
                {pendingDisburse > 0 && (
                  <Stat
                    label="Pendiente de desembolso"
                    value={bs(pendingDisburse)}
                    icon={<Receipt className="h-5 w-5" />}
                    valueClassName="text-amber-600"
                  />
                )}
              </div>

              {/* Formulario (incluye el panel de trabajos pendientes).
                  key={...} resetea el estado del form al cambiar de persona. */}
              <StaffPaymentForm key={selectedPayee.key} payee={selectedPayee} today={today} />

              {/* Historial de pagos de la persona */}
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <PagosFilter selectedMonth={selectedMonth} />
                  <PrintPagosButton rows={printRows} monthLabel={monthLabel} />
                </div>

                {/* ── Lista en tarjetas (solo móvil) ───────────────────── */}
                <div className="space-y-2 sm:hidden">
                  {rows.map((p) => (
                    <div key={p.id} className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-700">
                            {p.concept ?? "Pago"}
                          </p>
                          <p className="text-xs text-slate-400">{fmtDate(p.paid_at)}</p>
                        </div>
                        <span className="shrink-0 whitespace-nowrap text-right tabular-nums font-semibold text-emerald-600">
                          {bs(p.amount)}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-500">
                          {METHOD_LABEL[p.method] ?? p.method}
                        </span>
                        <DisbursedToggle id={p.id} disbursed={p.disbursed} />
                      </div>

                      {p.works.length > 0 && (
                        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                          {p.works.map((w, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
                              <span className="shrink-0 tabular-nums text-slate-400">
                                {fmtShortDate(w.performed_at)}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-slate-600">
                                {w.description || "—"}
                                {w.patient_name && (
                                  <span className="text-slate-400"> · {w.patient_name}</span>
                                )}
                              </span>
                              {w.is_partial && (
                                <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/10">
                                  abono
                                </span>
                              )}
                              <span className="shrink-0 whitespace-nowrap tabular-nums font-medium text-clinic">
                                {bs(w.paid_amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-2 flex justify-end border-t border-slate-100 pt-2">
                        <DeletePaymentButton id={p.id} />
                      </div>
                    </div>
                  ))}
                  {rows.length === 0 && (
                    <EmptyState
                      icon={<Receipt className="h-6 w-6" />}
                      title="Sin pagos en este período"
                      description="Ajusta el mes o registra un pago con el formulario."
                    />
                  )}
                </div>

                {/* ── Tabla (escritorio) ───────────────────────────────── */}
                <div className="hidden overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-slate-200 sm:block">
                  <div className="min-w-[42rem]">
                    <div className={`${GRID} px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500`}>
                      <span>Fecha</span>
                      <span>Concepto</span>
                      <span>Método</span>
                      <span className="text-right">Monto</span>
                      <span>Desembolso</span>
                      <span />
                    </div>
                    <div className="divide-y divide-slate-100">
                      {rows.map((p) => (
                        <div key={p.id}>
                          {/* Fila principal del pago */}
                          <div
                            className={`${GRID} px-4 py-2.5 text-sm transition hover:bg-slate-50/70 ${p.works.length > 0 ? "" : "border-b border-slate-100 last:border-b-0"}`}
                          >
                            <div className="whitespace-nowrap tabular-nums text-xs text-slate-400">
                              <div>{fmtDate(p.paid_at)}</div>
                              <div className="text-slate-300">{fmtBoliviaTime(p.created_at)}</div>
                            </div>
                            <span className="truncate text-slate-600">
                              {p.concept ?? <span className="text-slate-400">—</span>}
                            </span>
                            <span className="text-slate-500 whitespace-nowrap">
                              {METHOD_LABEL[p.method] ?? p.method}
                            </span>
                            <span className="text-right tabular-nums font-semibold text-emerald-600 whitespace-nowrap">
                              {bs(p.amount)}
                            </span>
                            <div>
                              <DisbursedToggle id={p.id} disbursed={p.disbursed} />
                            </div>
                            <div className="flex justify-end">
                              <DeletePaymentButton id={p.id} />
                            </div>
                          </div>

                          {/* Sub-filas: trabajos incluidos en este pago */}
                          {p.works.length > 0 && (
                            <div className="border-b border-slate-100 bg-slate-50/50 px-4 pb-2.5 last:border-b-0">
                              <div className="ml-[7.5rem] space-y-0.5">
                                {p.works.map((w, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center gap-3 rounded px-2 py-1 text-xs text-slate-500"
                                  >
                                    <span className="w-10 shrink-0 tabular-nums text-slate-400">
                                      {fmtShortDate(w.performed_at)}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-slate-600">
                                      {w.description || "—"}
                                    </span>
                                    {w.patient_name && (
                                      <span className="shrink-0 text-slate-400">
                                        {w.patient_name}
                                      </span>
                                    )}
                                    {w.is_partial && (
                                      <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/10">
                                        abono parcial
                                      </span>
                                    )}
                                    <span className="tabular-nums font-medium text-clinic whitespace-nowrap">
                                      {bs(w.paid_amount)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      {rows.length === 0 && (
                        <EmptyState
                          icon={<Receipt className="h-6 w-6" />}
                          title="Sin pagos en este período"
                          description="Ajusta el mes o registra un pago con el formulario."
                        />
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck y suite completa**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npm test`
Expected: todos los tests en verde (incluidos los de `tests/pagos.test.ts` de Task 1).

- [ ] **Step 5: Verificación manual en dev (local)**

Con el dev server local corriendo (`npm run dev`, Supabase local activo),
como `admin@sonrisa.com` / `password123`:

1. `/pagos` → lista de personas a la izquierda, placeholder a la derecha.
2. Doctor con comisiones sin pagar → badge ámbar "Bs X pendiente" en la lista.
3. Clic en un doctor → tarjetas (Comisión pendiente / Pagado — mes / Pendiente de desembolso), formulario con trabajos pendientes (nombre del paciente completo, rótulo "Pago del paciente" sobre la barra), historial abajo.
4. Seleccionar un trabajo, registrar el pago → toast "Pago registrado", el trabajo desaparece del panel, aparece en el historial con sub-fila.
5. Clic en una recepcionista → sin panel de trabajos ni tarjeta de comisión; registrar un pago simple funciona.
6. Buscador filtra la lista; persona seleccionada se conserva en la URL.
7. Filtro de mes y "Todos los meses" actualizan el historial; imprimir abre la vista de impresión.
8. Ventana angosta (móvil): lista → detalle → "← Volver a la lista".

- [ ] **Step 6: Commit**

```bash
git add components/pagos/PagosFilter.tsx components/pagos/StaffPaymentForm.tsx "app/(dashboard)/pagos/page.tsx"
git commit -m "feat(pagos): layout maestro-detalle por persona con badge de comisión pendiente"
```

---

## Self-review del plan (hecho)

- **Cobertura del spec:** panel izquierdo con buscador/badge/IDs compuestos (Task 2 Step 3), tarjetas por persona (Step 3), trabajos sin truncar + rótulo "Pago del paciente" (Step 2), formulario sin dropdown (Step 2), historial sin columnas Trabajador/Rol con filtro de mes e impresión (Step 3), casos borde (persona inválida → placeholder; recepcionista → sin comisión; EmptyStates). Sin migraciones, server actions intactos. ✓
- **Placeholders:** ninguno — código completo en cada paso. ✓
- **Consistencia de tipos:** `Payee` se exporta de `StaffPaymentForm` y lo importa `page.tsx`; `COMMISSION_ROLES`/`sumPendingCommissions` de `lib/pagos` se usan con las firmas de Task 1. ✓
