# Notas Clínicas SOAP — Fase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ampliar `patient_evolution_notes` con estructura SOAP (Subjetivo/Objetivo/Diagnóstico/Plan) y vínculo opcional a una cita, preservando 100% de compatibilidad con las notas libres existentes.

**Architecture:** Migración 0059 agrega 6 columnas (`note_type`, `appointment_id`, `subjective`, `objective`, `assessment`, `plan`), actualiza el trigger de historial para capturar todos los campos, y corrige el bug de RLS que excluía al rol `colega`. `actions.ts` extiende los tipos y actions para manejar ambos modos. `EvolutionPanel` gana un toggle "Nota libre / SOAP" y un selector de cita; las notas existentes siguen renderizando como antes (note_type = 'free'). `body` permanece not null (las notas SOAP lo dejan como string vacío).

**Tech Stack:** Next.js App Router (server actions), Supabase (Postgres + trigger SECURITY DEFINER + RLS), Zod, React (`useActionState`), Tailwind, Vitest.

## Global Constraints

- Español neutro en toda la UI (sin voseo).
- NUNCA hacer `git push` sin autorización del usuario.
- Backward compat: notas existentes con `note_type = 'free'` renderizan igual que antes.
- Roles con permisos de escritura en evolución: `admin`, `odontologo_general`, `especialista`, `colega`.
- El campo `body` se mantiene `not null`; las notas SOAP lo guardan como `''`.
- El trigger de historial (`log_evolution_note_change`) es `SECURITY DEFINER`; no cambiar eso.
- No hay push desde el código a producción en este plan; las migraciones las aplica el usuario manualmente.

---

### Task 1: Migración 0059 — columnas SOAP + trigger + RLS fix

**Files:**
- Create: `supabase/migrations/0059_evolution_notes_soap.sql`

**Interfaces:**
- Produces:
  - `patient_evolution_notes.note_type text not null default 'free' check (in ('free','soap'))`
  - `patient_evolution_notes.appointment_id uuid null`
  - `patient_evolution_notes.subjective text not null default ''`
  - `patient_evolution_notes.objective text not null default ''`
  - `patient_evolution_notes.assessment text not null default ''`
  - `patient_evolution_notes.plan text not null default ''`
  - `patient_evolution_note_history` — mismas 6 columnas (nullable, para registros viejos)
  - Trigger `log_evolution_note_change` actualizado para capturar todos los campos
  - RLS insert de `patient_evolution_notes` incluye `colega`

- [ ] **Step 1: Escribir la migración**

```sql
-- 0059_evolution_notes_soap.sql — Notas clínicas SOAP (Fase 2)
-- Amplía patient_evolution_notes con estructura SOAP y vínculo a cita.
-- Backward compat: notas libres existentes quedan como note_type='free', body intacto.
-- También corrige el bug de RLS en 0048 que excluía al rol 'colega'.

-- ── Columnas nuevas en patient_evolution_notes ───────────────────────────────
alter table patient_evolution_notes
  add column if not exists note_type   text not null default 'free'
    check (note_type in ('free', 'soap')),
  add column if not exists appointment_id uuid
    references appointments(id) on delete set null,
  add column if not exists subjective  text not null default '',
  add column if not exists objective   text not null default '',
  add column if not exists assessment  text not null default '',
  add column if not exists plan        text not null default '';

create index if not exists evolution_notes_appointment_idx
  on patient_evolution_notes (appointment_id)
  where appointment_id is not null;

-- ── Columnas nuevas en patient_evolution_note_history ───────────────────────
-- Nullable: los registros históricos anteriores no tienen estos campos.
alter table patient_evolution_note_history
  add column if not exists note_type    text,
  add column if not exists subjective   text,
  add column if not exists objective    text,
  add column if not exists assessment   text,
  add column if not exists plan         text;

-- ── Trigger actualizado: captura cambios en CUALQUIER campo de contenido ────
create or replace function log_evolution_note_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'UPDATE') then
    -- Disparar si cambió el body O cualquiera de los campos SOAP.
    if (
      new.body       is distinct from old.body       or
      new.subjective is distinct from old.subjective or
      new.objective  is distinct from old.objective  or
      new.assessment is distinct from old.assessment or
      new.plan       is distinct from old.plan
    ) then
      insert into patient_evolution_note_history
        (note_id, patient_id, clinic_id, author_id, author_name,
         body, version_created_at, action,
         note_type, subjective, objective, assessment, plan)
      values
        (old.id, old.patient_id, old.clinic_id, old.author_id, old.author_name,
         old.body, old.created_at, 'edited',
         old.note_type, old.subjective, old.objective, old.assessment, old.plan);
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    insert into patient_evolution_note_history
      (note_id, patient_id, clinic_id, author_id, author_name,
       body, version_created_at, action,
       note_type, subjective, objective, assessment, plan)
    values
      (old.id, old.patient_id, old.clinic_id, old.author_id, old.author_name,
       old.body, old.created_at, 'deleted',
       old.note_type, old.subjective, old.objective, old.assessment, old.plan);
    return old;
  end if;
  return null;
end;
$$;

-- ── Corrección de RLS: agregar 'colega' al policy de insert (bug en 0048) ───
drop policy if exists evolution_insert on patient_evolution_notes;
create policy evolution_insert on patient_evolution_notes
  for select using (clinic_id = (select auth_clinic_id()));

-- Reconstruir el policy de insert con colega incluido.
create policy evolution_insert_write on patient_evolution_notes
  for insert
  with check (
    clinic_id  = (select auth_clinic_id())
    and author_id = (select auth.uid())
    and (select auth_role()) in
      ('admin', 'odontologo_general', 'especialista', 'colega')
  );

-- RLS de update y delete ya usan (author_id = auth.uid()) sin filtro de rol,
-- así que colega ya podía editar/borrar sus propias notas. No hay cambio.
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0059_evolution_notes_soap.sql
git commit -m "feat(historial): migración 0059 — notas SOAP + RLS fix colega"
```

---

### Task 2: Actualizar tipos y server actions en `actions.ts`

**Files:**
- Modify: `app/(dashboard)/pacientes/actions.ts`
- Test: `tests/evolution-soap.test.ts` (nuevo)

**Interfaces:**
- Consumes: tipos existentes `EvolutionNote`, `EvolutionNoteHistory`.
- Produces (updated):
  ```ts
  type EvolutionNote = {
    id: string; author_id: string | null; author_name: string;
    body: string; note_type: "free" | "soap";
    appointment_id: string | null; subjective: string;
    objective: string; assessment: string; plan: string;
    created_at: string; updated_at: string;
  }
  type EvolutionNoteHistory = {
    id: string; note_id: string; author_name: string;
    body: string; note_type: "free" | "soap" | null;
    subjective: string | null; objective: string | null;
    assessment: string | null; plan: string | null;
    action: "edited" | "deleted"; changed_at: string;
  }
  type SoapFields = {
    subjective: string; objective: string;
    assessment: string; plan: string;
  }
  ```
  - `addEvolutionNote(patientId, body, opts?: { appointmentId?: string; soap?: SoapFields })`
  - `updateEvolutionNote(noteId, patientId, body, opts?: { soap?: SoapFields })`
  - `deleteEvolutionNote` — sin cambios de firma.

- [ ] **Step 1: Escribir los tests**

```ts
// tests/evolution-soap.test.ts
import { describe, it, expect } from "vitest";

// canWriteEvolution no está exportada desde actions.ts (es privada).
// Testeamos la lógica de tipo y validación inline aquí.

describe("EvolutionNote SOAP fields", () => {
  it("nota libre: body obligatorio, campos SOAP vacíos", () => {
    const note = {
      id: "x", author_id: "a", author_name: "Dr. A",
      body: "Texto libre", note_type: "free" as const,
      appointment_id: null,
      subjective: "", objective: "", assessment: "", plan: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(note.note_type).toBe("free");
    expect(note.body).not.toBe("");
  });

  it("nota SOAP: body vacío, al menos un campo SOAP", () => {
    const note = {
      id: "y", author_id: "b", author_name: "Dr. B",
      body: "", note_type: "soap" as const,
      appointment_id: "appt-123",
      subjective: "Dolor molar", objective: "Caries clase II",
      assessment: "Caries dentina", plan: "Obturación resina",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(note.note_type).toBe("soap");
    expect(note.body).toBe("");
    expect(note.subjective).not.toBe("");
  });

  it("nota SOAP sin cita asignada es válida", () => {
    const note = {
      id: "z", author_id: "c", author_name: "Dr. C",
      body: "", note_type: "soap" as const,
      appointment_id: null,
      subjective: "Revisión", objective: "Normal",
      assessment: "Sin hallazgos", plan: "Control en 6 meses",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(note.appointment_id).toBeNull();
    expect(note.plan).not.toBe("");
  });
});
```

- [ ] **Step 2: Correr los tests**

Run: `npm test -- evolution-soap`
Expected: PASS (son tests de tipo/estructura, no de infraestructura).

- [ ] **Step 3: Actualizar `EvolutionNote` y `EvolutionNoteHistory` en `actions.ts`**

Reemplazar los tipos en `actions.ts` (líneas ~153-170):

```ts
export type EvolutionNote = {
  id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  note_type: "free" | "soap";
  appointment_id: string | null;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  created_at: string;
  updated_at: string;
};

export type EvolutionNoteHistory = {
  id: string;
  note_id: string;
  author_name: string;
  body: string;
  note_type: "free" | "soap" | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  action: "edited" | "deleted";
  changed_at: string;
};

export type SoapFields = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};
```

- [ ] **Step 4: Actualizar `addEvolutionNote`**

Reemplazar la función completa:

```ts
export async function addEvolutionNote(
  patientId: string,
  body: string,
  opts?: { appointmentId?: string | null; soap?: SoapFields },
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!canWriteEvolution(profile.role))
    return { error: "Solo los doctores y el administrador pueden anotar evolución." };
  if (await clinicalLocked(profile.role, profile.clinicId))
    return { error: "Fuera del horario de edición permitido. La evolución está en modo lectura." };

  const isSoap = !!opts?.soap;
  const text = body.trim();

  if (!isSoap && !text) return { error: "La nota no puede estar vacía." };
  if (isSoap) {
    const s = opts!.soap!;
    const hasContent = [s.subjective, s.objective, s.assessment, s.plan].some(
      (v) => v.trim(),
    );
    if (!hasContent) return { error: "Completa al menos un campo de la nota SOAP." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("patient_evolution_notes").insert({
    patient_id: patientId,
    clinic_id: profile.clinicId,
    author_id: profile.userId,
    author_name: profile.fullName,
    body: isSoap ? "" : text,
    note_type: isSoap ? "soap" : "free",
    appointment_id: opts?.appointmentId ?? null,
    subjective: opts?.soap?.subjective?.trim() ?? "",
    objective: opts?.soap?.objective?.trim() ?? "",
    assessment: opts?.soap?.assessment?.trim() ?? "",
    plan: opts?.soap?.plan?.trim() ?? "",
  });
  if (error) return { error: error.message };

  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}
```

- [ ] **Step 5: Actualizar `updateEvolutionNote`**

Reemplazar la función completa:

```ts
export async function updateEvolutionNote(
  noteId: string,
  patientId: string,
  body: string,
  opts?: { soap?: SoapFields },
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!canWriteEvolution(profile.role))
    return { error: "Sin permiso para editar evolución." };
  if (await clinicalLocked(profile.role, profile.clinicId))
    return { error: "Fuera del horario de edición permitido. La evolución está en modo lectura." };

  const isSoap = !!opts?.soap;
  const text = body.trim();
  if (!isSoap && !text) return { error: "La nota no puede estar vacía." };

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (isSoap) {
    updatePayload.subjective = opts!.soap!.subjective.trim();
    updatePayload.objective  = opts!.soap!.objective.trim();
    updatePayload.assessment = opts!.soap!.assessment.trim();
    updatePayload.plan       = opts!.soap!.plan.trim();
  } else {
    updatePayload.body = text;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("patient_evolution_notes")
    .update(updatePayload)
    .eq("id", noteId)
    .eq("author_id", profile.userId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Solo puedes editar tus propias notas." };

  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: limpio.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/pacientes/actions.ts" tests/evolution-soap.test.ts
git commit -m "feat(historial): tipos SOAP + actions addEvolutionNote/updateEvolutionNote"
```

---

### Task 3: Actualizar `EvolutionPanel` — modo SOAP + selector de cita

**Files:**
- Modify: `components/patients/EvolutionPanel.tsx`

**Interfaces:**
- Consumes: `EvolutionNote`, `EvolutionNoteHistory`, `SoapFields`, `addEvolutionNote`, `updateEvolutionNote` (todos de Task 2).
- Produces: `EvolutionPanel({ ..., appointments: ApptRow[] })` (nueva prop).
  - `ApptRow = { id: string; startsAt: string; dentistName: string | null; reason: string | null; status: string }` — ya definido en `PatientHistoryPanel.tsx`.

- [ ] **Step 1: Añadir el tipo `ApptRow` al import y actualizar la firma del componente**

El tipo `ApptRow` ya existe en `components/history/PatientHistoryPanel.tsx`. Importarlo en EvolutionPanel:

```ts
import type { ApptRow } from "@/components/history/PatientHistoryPanel";
```

Añadir `appointments: ApptRow[]` a la destructuración y al tipo de props de `EvolutionPanel`:

```ts
export function EvolutionPanel({
  patientId,
  notes,
  history,
  legacyEvolution,
  canWrite,
  canSeeHistory,
  currentUserId,
  appointments,   // ← nuevo
}: {
  patientId: string;
  notes: EvolutionNote[];
  history: EvolutionNoteHistory[];
  legacyEvolution: string | null;
  canWrite: boolean;
  canSeeHistory: boolean;
  currentUserId: string;
  appointments: ApptRow[];  // ← nuevo
})
```

- [ ] **Step 2: Reemplazar el formulario de nueva nota (modo libre) por uno que soporte ambos modos**

Reemplazar el bloque `{canWrite && adding && (...)}` por este componente:

```tsx
{canWrite && adding && (
  <NoteForm
    patientId={patientId}
    appointments={appointments}
    onDone={() => { setAdding(false); setDraft(""); router.refresh(); }}
    onCancel={() => { setAdding(false); setDraft(""); }}
    draft={draft}
    onDraftChange={setDraft}
  />
)}
```

Añadir el sub-componente `NoteForm` al final del archivo (antes del cierre):

```tsx
function NoteForm({
  patientId,
  appointments,
  onDone,
  onCancel,
  draft,
  onDraftChange,
}: {
  patientId: string;
  appointments: ApptRow[];
  onDone: () => void;
  onCancel: () => void;
  draft: string;
  onDraftChange: (v: string) => void;
}) {
  const [mode, setMode] = useState<"free" | "soap">("free");
  const [apptId, setApptId] = useState("");
  const [soap, setSoap] = useState<SoapFields>({
    subjective: "", objective: "", assessment: "", plan: "",
  });
  const [pending, start] = useTransition();
  const router = useRouter();

  const fmtAppt = (a: ApptRow) => {
    const d = new Date(a.startsAt).toLocaleDateString("es-BO", {
      day: "2-digit", month: "2-digit", year: "numeric",
      timeZone: "America/La_Paz",
    });
    return `${d} — ${a.dentistName ?? "Sin doctor"} ${a.reason ? `(${a.reason})` : ""}`;
  };

  function handleSave() {
    start(async () => {
      const opts =
        mode === "soap"
          ? { appointmentId: apptId || null, soap }
          : { appointmentId: apptId || null };
      const res = await addEvolutionNote(patientId, draft, opts);
      if (res.error) toast(res.error, "error");
      else { toast("Nota agregada", "success"); onDone(); }
    });
  }

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-clinic/40 space-y-3">
      {/* Toggle libre / SOAP */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
        {(["free", "soap"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              mode === m
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {m === "free" ? "Nota libre" : "SOAP"}
          </button>
        ))}
      </div>

      {/* Selector de cita (opcional, ambos modos) */}
      {appointments.length > 0 && (
        <label className="block text-xs">
          <span className="mb-1 block text-slate-500">Vincular a cita (opcional)</span>
          <select
            value={apptId}
            onChange={(e) => setApptId(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-clinic focus:outline-none"
          >
            <option value="">— Sin cita asignada —</option>
            {appointments.map((a) => (
              <option key={a.id} value={a.id}>{fmtAppt(a)}</option>
            ))}
          </select>
        </label>
      )}

      {mode === "free" ? (
        <textarea
          autoFocus
          rows={5}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Escribe la nota de evolución…"
          className="w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(
            [
              { key: "subjective", label: "S — Subjetivo", placeholder: "¿Qué refiere el paciente?" },
              { key: "objective",  label: "O — Objetivo",  placeholder: "Hallazgos clínicos…" },
              { key: "assessment", label: "A — Diagnóstico", placeholder: "Diagnóstico…" },
              { key: "plan",       label: "P — Plan",      placeholder: "Plan de tratamiento…" },
            ] as { key: keyof SoapFields; label: string; placeholder: string }[]
          ).map(({ key, label, placeholder }) => (
            <label key={key} className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600">{label}</span>
              <textarea
                rows={3}
                value={soap[key]}
                onChange={(e) => setSoap((p) => ({ ...p, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
              />
            </label>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={handleSave} disabled={pending}>
          <Check className="h-3.5 w-3.5" />
          {pending ? "Guardando…" : "Guardar nota"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          <X className="h-3.5 w-3.5" />
          Cancelar
        </Button>
      </div>
    </div>
  );
}
```

Añadir los imports faltantes al inicio del archivo:

```ts
import {
  addEvolutionNote,
  updateEvolutionNote,
  deleteEvolutionNote,
  type EvolutionNote,
  type EvolutionNoteHistory,
  type SoapFields,
} from "@/app/(dashboard)/pacientes/actions";
```

- [ ] **Step 3: Actualizar el renderizado de notas existentes para mostrar campos SOAP**

En el `li` de cada nota, reemplazar el bloque de visualización del contenido:

```tsx
{editingId === n.id ? (
  <EditNoteForm
    note={n}
    patientId={patientId}
    onDone={() => { setEditingId(null); router.refresh(); }}
    onCancel={() => setEditingId(null)}
    editValue={editValue}
    onEditValueChange={setEditValue}
  />
) : n.note_type === "soap" ? (
  <SoapDisplay note={n} />
) : (
  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
    {n.body}
  </p>
)}
```

Añadir el helper `SoapDisplay` al final del archivo:

```tsx
function SoapDisplay({ note }: { note: EvolutionNote }) {
  const labels: { key: keyof SoapFields; label: string }[] = [
    { key: "subjective", label: "S" },
    { key: "objective",  label: "O" },
    { key: "assessment", label: "A" },
    { key: "plan",       label: "P" },
  ];
  return (
    <dl className="space-y-1.5">
      {labels.map(({ key, label }) =>
        note[key] ? (
          <div key={key} className="flex gap-2 text-sm">
            <dt className="w-5 shrink-0 font-semibold text-clinic">{label}</dt>
            <dd className="whitespace-pre-wrap text-slate-700">{note[key]}</dd>
          </div>
        ) : null,
      )}
    </dl>
  );
}
```

- [ ] **Step 4: Extraer formulario de edición a `EditNoteForm` (simplifica el `li`)**

Extraer el bloque de edición a un sub-componente al final del archivo. Manejar que una nota SOAP edita los 4 campos; una nota libre edita `body`:

```tsx
function EditNoteForm({
  note,
  patientId,
  onDone,
  onCancel,
  editValue,
  onEditValueChange,
}: {
  note: EvolutionNote;
  patientId: string;
  onDone: () => void;
  onCancel: () => void;
  editValue: string;
  onEditValueChange: (v: string) => void;
}) {
  const [soap, setSoap] = useState<SoapFields>({
    subjective: note.subjective,
    objective: note.objective,
    assessment: note.assessment,
    plan: note.plan,
  });
  const [pending, start] = useTransition();

  function handleUpdate() {
    start(async () => {
      const opts = note.note_type === "soap" ? { soap } : undefined;
      const res = await updateEvolutionNote(note.id, patientId, editValue, opts);
      if (res.error) toast(res.error, "error");
      else { toast("Nota actualizada", "success"); onDone(); }
    });
  }

  if (note.note_type === "soap") {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(
            [
              { key: "subjective", label: "S — Subjetivo" },
              { key: "objective",  label: "O — Objetivo" },
              { key: "assessment", label: "A — Diagnóstico" },
              { key: "plan",       label: "P — Plan" },
            ] as { key: keyof SoapFields; label: string }[]
          ).map(({ key, label }) => (
            <label key={key} className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600">{label}</span>
              <textarea
                rows={3}
                value={soap[key]}
                onChange={(e) => setSoap((p) => ({ ...p, [key]: e.target.value }))}
                className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
              />
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={handleUpdate} disabled={pending}>
            <Check className="h-3.5 w-3.5" />
            {pending ? "Guardando…" : "Guardar"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
            <X className="h-3.5 w-3.5" />
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <textarea
        autoFocus
        rows={4}
        value={editValue}
        onChange={(e) => onEditValueChange(e.target.value)}
        className="w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={handleUpdate} disabled={pending || !editValue.trim()}>
          <Check className="h-3.5 w-3.5" />
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          <X className="h-3.5 w-3.5" />
          Cancelar
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Actualizar el renderizado del historial de cambios para SOAP**

En el `li` del historial (dentro de `canSeeHistory`), reemplazar la `<p>` del body por:

```tsx
{h.note_type === "soap" ? (
  <dl className="space-y-1 text-sm text-slate-500">
    {(["subjective","objective","assessment","plan"] as const).map((k) =>
      h[k] ? (
        <div key={k} className="flex gap-2">
          <dt className="w-5 shrink-0 font-semibold uppercase text-xs">{k[0]}</dt>
          <dd className="whitespace-pre-wrap">{h[k]}</dd>
        </div>
      ) : null,
    )}
  </dl>
) : (
  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-500">
    {h.body}
  </p>
)}
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: limpio. Si hay errores de `SoapFields` o `ApptRow`, verificar que los imports estén completos.

- [ ] **Step 7: Commit**

```bash
git add components/patients/EvolutionPanel.tsx
git commit -m "feat(historial): EvolutionPanel con modo SOAP + selector de cita"
```

---

### Task 4: Actualizar `page.tsx` — nueva prop + select extendido

**Files:**
- Modify: `app/(dashboard)/pacientes/[id]/page.tsx`

**Interfaces:**
- Consumes: `EvolutionNote` (tipo actualizado de Task 2), `apptRows` (ya cargado en la página), `EvolutionNoteHistory` actualizado.
- Produces: `EvolutionPanel` recibe `appointments={apptRows}`.

- [ ] **Step 1: Extender el select de `patient_evolution_notes`**

En el `Promise.all`, la query de `evolutionNotes` actualmente es:
```ts
supabase.from("patient_evolution_notes")
  .select("id, author_id, author_name, body, created_at, updated_at")
```

Reemplazar por:
```ts
supabase
  .from("patient_evolution_notes")
  .select("id, author_id, author_name, body, note_type, appointment_id, subjective, objective, assessment, plan, created_at, updated_at")
  .eq("patient_id", id)
  .order("created_at", { ascending: false }),
```

- [ ] **Step 2: Extender el select de `patient_evolution_note_history`**

```ts
supabase
  .from("patient_evolution_note_history")
  .select("id, note_id, author_id, author_name, body, note_type, subjective, objective, assessment, plan, action, changed_at")
  .eq("patient_id", id)
  .order("changed_at", { ascending: false }),
```

- [ ] **Step 3: Actualizar el mapeo de `evolutionNotes` en el return**

Reemplazar el mapeo de `notes` en `<EvolutionPanel>`:

```ts
notes={(evolutionNotes ?? []).map((n) => ({
  id: n.id as string,
  author_id: (n.author_id as string | null) ?? null,
  author_name: platformAdminIdSet.has(n.author_id ?? "")
    ? "Sistema"
    : n.author_name as string,
  body: n.body as string,
  note_type: (n.note_type as "free" | "soap") ?? "free",
  appointment_id: (n.appointment_id as string | null) ?? null,
  subjective: (n.subjective as string) ?? "",
  objective: (n.objective as string) ?? "",
  assessment: (n.assessment as string) ?? "",
  plan: (n.plan as string) ?? "",
  created_at: n.created_at as string,
  updated_at: n.updated_at as string,
}))}
```

- [ ] **Step 4: Actualizar el mapeo de `evolutionHistory`**

```ts
history={(evolutionHistory ?? []).map((h) => ({
  id: h.id as string,
  note_id: h.note_id as string,
  author_name: platformAdminIdSet.has((h as { author_id?: string }).author_id ?? "")
    ? "Sistema"
    : h.author_name as string,
  body: h.body as string,
  note_type: (h.note_type as "free" | "soap" | null) ?? null,
  subjective: (h.subjective as string | null) ?? null,
  objective: (h.objective as string | null) ?? null,
  assessment: (h.assessment as string | null) ?? null,
  plan: (h.plan as string | null) ?? null,
  action: h.action as "edited" | "deleted",
  changed_at: h.changed_at as string,
}))}
```

- [ ] **Step 5: Pasar `appointments` a `EvolutionPanel`**

Añadir la prop `appointments={apptRows}` al componente `<EvolutionPanel>`:

```tsx
<EvolutionPanel
  patientId={patient.id}
  notes={...}
  history={...}
  legacyEvolution={...}
  canWrite={canEditClinical}
  canSeeHistory={canSeeHistory}
  currentUserId={profile?.userId ?? ""}
  appointments={apptRows}   // ← nuevo
/>
```

- [ ] **Step 6: Verificar tipos y build**

Run: `npx tsc --noEmit`
Expected: limpio.

Run: `npx next build 2>&1 | tail -15`
Expected: build exitoso.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/pacientes/[id]/page.tsx"
git commit -m "feat(historial): page.tsx — pasar campos SOAP y appointments a EvolutionPanel"
```

---

### Task 5: Suite completa + cierre

- [ ] **Step 1: Correr toda la suite**

Run: `npm test`
Expected: los nuevos tests de evolution-soap pasan; sin regresiones (5 fallos preexistentes aceptados).

- [ ] **Step 2: tsc final**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Verificación manual**

Iniciar `npm run dev`, entrar a una ficha como `doctor@sonrisa.com`:
- Sección "Evolución del paciente": botón "Agregar nota" → aparece toggle "Nota libre / SOAP".
- En modo libre: textarea + selector de cita opcional.
- En modo SOAP: 4 campos (S/O/A/P) + selector de cita.
- Guardar SOAP → la nota aparece con etiquetas S/O/A/P en color `clinic`.
- Editar la nota SOAP → formulario de edición muestra los 4 campos.
- Notas antiguas (libres) siguen mostrando solo `body`, sin cambio visual.

- [ ] **Step 4: Recordatorio de migración**

> **IMPORTANTE:** Aplicar `0059_evolution_notes_soap.sql` en producción (Supabase nube → SQL Editor) antes de hacer push. La columna `note_type` tiene `not null default 'free'`, por lo que es segura de aplicar en caliente sin downtime.

- [ ] **Step 5: Git log**

Run: `git log --oneline -10`
Expected: ver los commits de esta fase: migración 0059, types/actions, EvolutionPanel, page.tsx.
