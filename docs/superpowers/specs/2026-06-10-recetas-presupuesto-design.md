# Recetas Médicas y Presupuesto de Tratamientos — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Agregar dos documentos imprimibles a la ficha del paciente: una receta médica (guardada en historial) y un presupuesto de tratamientos (mejora del botón "Imprimir plan" existente).

**Architecture:** El presupuesto reutiliza la página de impresión existente con ajuste cosmético. La receta agrega una tabla `prescriptions` en Supabase, un modal de edición client-side, una Server Action para guardar, y una página de impresión en el route group `(print)`.

**Tech Stack:** Next.js App Router, TypeScript strict, Supabase (Postgres + RLS), Tailwind CSS, Server Actions, `(print)` route group existente.

---

## 1. Base de datos

### Tabla `prescriptions`

```sql
create table prescriptions (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  doctor_id   uuid references profiles(id) on delete set null,
  medications jsonb not null default '[]'::jsonb,
  -- cada elemento: { name: string, dosage: string, instructions: string }
  notes       text,
  issued_at   timestamptz not null default now()
);

create index idx_prescriptions_patient on prescriptions(patient_id);
create index idx_prescriptions_clinic  on prescriptions(clinic_id);
```

### RLS

- `select`: `clinic_id = auth.jwt()->>'clinic_id'`
- `insert`: mismo check + `doctor_id = auth.uid()`
- `delete`: `doctor_id = auth.uid()` (solo el autor puede borrar)

---

## 2. Modelo de datos — TypeScript

```ts
// En prescription-actions.ts
export type Medication = {
  name: string;
  dosage: string;
  instructions: string;
};

export type PrescriptionRow = {
  id: string;
  patientId: string;
  doctorName: string | null;
  medications: Medication[];
  notes: string | null;
  issuedAt: string; // ISO
};
```

---

## 3. Server Actions — `prescription-actions.ts`

Ubicación: `app/(dashboard)/pacientes/prescription-actions.ts`

### `createPrescription`

```ts
export async function createPrescription(
  patientId: string,
  medications: Medication[],
  notes: string
): Promise<{ id: string } | { error: string }>
```

- Valida: `patientId` no vacío, `medications` con al menos 1 item.
- Obtiene `clinic_id` y `doctor_id` del perfil autenticado.
- Inserta en `prescriptions`.
- Retorna `{ id }` o `{ error }`.

---

## 4. Componentes UI

### `PrescriptionModal` — `components/patients/PrescriptionModal.tsx`

Modal client-side con:
- Lista dinámica de medicamentos (botón "+ Agregar medicamento")
- Cada fila: `nombre` (text, required) + `dosis` (text, required) + `instrucciones` (text, opcional)
- Botón "✕" por fila para eliminar
- Textarea "Notas generales" (opcional)
- Botón "Guardar y generar receta" → llama `createPrescription` → en éxito abre `/pacientes/[id]/receta/[recetaId]` en nueva pestaña + cierra modal + hace `router.refresh()`
- Estado de error visible si falla

### `PrescriptionsPanel` — `components/patients/PrescriptionsPanel.tsx`

Panel de solo lectura que lista recetas pasadas:
- Props: `patientId: string`, `prescriptions: PrescriptionRow[]`, `canWrite: boolean`
- Muestra tabla: Fecha | Doctor | N° medicamentos | [Botón "Ver/imprimir"]
- Botón "Ver/imprimir" abre `/pacientes/[id]/receta/[recetaId]` en nueva pestaña
- Si no hay recetas: "Sin recetas emitidas."
- Botón "Emitir Receta" visible solo si `canWrite`; al clic abre `PrescriptionModal`

---

## 5. Página de impresión de receta

Ruta: `app/(print)/pacientes/[id]/receta/[recetaId]/page.tsx`

Membrete (igual al presupuesto existente):
- Nombre de la clínica (`clinics.name`)
- Título: "RECETA MÉDICA"
- Doctor: nombre del doctor que la emitió
- Fecha de emisión

Cuerpo:
- Datos del paciente: nombre, CI
- Tabla de medicamentos: # | Medicamento | Dosis | Indicaciones
- Notas generales (si existen)
- Línea de firma del odontólogo

Comportamiento: `<AutoPrint />` (misma que el presupuesto), botón "Imprimir" / "Cerrar" con `no-print`.

---

## 6. Integración en ficha del paciente

### `app/(dashboard)/pacientes/[id]/page.tsx`

Cambios:
1. Consulta adicional: `prescriptions` del paciente (ordenadas por `issued_at desc`)
2. Nueva sección al final (después de "Historial de pagos"):
   ```tsx
   <section>
     <h2 className="mb-3 text-lg font-semibold">Recetas emitidas</h2>
     <PrescriptionsPanel
       patientId={patient.id}
       prescriptions={prescriptionRows}
       canWrite={canClinical}
     />
   </section>
   ```

### `components/treatments/TreatmentPlanPanel.tsx`

Cambio mínimo: renombrar el botón "Imprimir plan" → "Presupuesto" y agregar icono de documento. El enlace `/pacientes/${patientId}/imprimir` no cambia.

---

## 7. Página de impresión de presupuesto (mejora menor)

`app/(print)/pacientes/[id]/imprimir/page.tsx` — cambio cosmético:

- Título interno: cambiar `"Plan de Tratamiento"` → `"Presupuesto de Tratamiento"`
- Sin cambios funcionales; el documento ya incluye tabla, totales y saldo.

---

## 8. Flujo completo

```
Ficha del paciente
  └─ Sección "Recetas emitidas"
       ├─ [Emitir Receta] → PrescriptionModal
       │     ├─ Agrega medicamentos
       │     └─ [Guardar y generar] → Server Action → INSERT
       │                                └─ Abre /pacientes/[id]/receta/[recetaId]
       │                                       └─ AutoPrint → Imprime
       └─ Tabla de recetas anteriores → [Ver/imprimir] → abre página en nueva pestaña

  └─ Sección "Plan de tratamiento"
       └─ [Presupuesto] → /pacientes/[id]/imprimir (ya existente, renombrado)
```

---

## 9. Archivos

| Acción | Ruta |
|--------|------|
| Crear | `supabase/migrations/0028_prescriptions.sql` |
| Crear | `app/(dashboard)/pacientes/prescription-actions.ts` |
| Crear | `components/patients/PrescriptionModal.tsx` |
| Crear | `components/patients/PrescriptionsPanel.tsx` |
| Crear | `app/(print)/pacientes/[id]/receta/[recetaId]/page.tsx` |
| Modificar | `app/(dashboard)/pacientes/[id]/page.tsx` |
| Modificar | `components/treatments/TreatmentPlanPanel.tsx` |
| Modificar | `app/(print)/pacientes/[id]/imprimir/page.tsx` |

---

## 10. Lo que NO se incluye (YAGNI)

- Logo de la clínica (no hay campo de imagen en la BD según restricción del schema).
- Número de matrícula del doctor (no hay campo en `profiles`).
- Firma digital del paciente en la receta.
- Plantillas de recetas predefinidas.
- Editar o anular una receta ya emitida.
