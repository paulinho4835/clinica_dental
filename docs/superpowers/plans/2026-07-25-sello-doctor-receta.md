# Sello del doctor en recetas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admin/colega/odontólogo/especialista upload a photo of their physical stamp ("sello"), stored as a compressed data URL on their profile, and print it on their prescriptions ("recetas") alongside their existing digital signature.

**Architecture:** Exact same pattern as the existing digital-signature feature (`profiles.signature`): a new `profiles.stamp` text column holding a compressed base64 data URL, a server action to save/clear it, a client panel in Ajustes to capture it (file input + client-side compression, not a canvas), and a read in the prescription print page that renders it next to the signature.

**Tech Stack:** Next.js Server Actions, Supabase (Postgres + `@supabase/supabase-js`), `browser-image-compression` (already a project dependency, used by `PhotosPanel.tsx`), Tailwind CSS.

## Global Constraints

- Storage: data URL in `profiles.stamp`, NOT an R2-uploaded file (spec section "Modelo de datos" — clinics without R2 configured must still be able to use this).
- Permission gate: `can(profile.role, "clinical:write")` — same gate as the existing signature panel (spec section "Permisos"). Do not scope tighter or looser.
- Compression target: `maxSizeMB: 0.3`, `maxWidthOrHeight: 500`, `fileType: "image/webp"`, `useWebWorker: false` (spec section "Subida de imagen"; `useWebWorker: false` matches `PhotosPanel.tsx`'s CSP workaround — the library's web worker loads a script from a CDN, which the project's CSP blocks).
- Receta print page: stamp renders in its own block, side-by-side with the signature block, not overlapping it (spec section "Receta impresa", per user's explicit choice).
- If `profiles.stamp` is null, render nothing — no placeholder box (spec section "Receta impresa").
- No other printed document (`imprimir`, `imprimir-anamnesis`, `expediente`) reads or renders the stamp — receta only.

---

### Task 1: Database migration for `profiles.stamp`

**Files:**
- Create: `supabase/migrations/0104_profile_stamp.sql`

**Interfaces:**
- Produces: `profiles.stamp` column (`text`, nullable), consumed by Task 2 (write) and Task 5 (read).

- [ ] **Step 1: Write the migration file**

```sql
-- Sello digital del doctor (foto, data URL comprimida). Se autocompleta en
-- recetas médicas junto a la firma, usando prescriptions.doctor_id.
alter table profiles add column if not exists stamp text;
```

- [ ] **Step 2: Apply it to the local database**

Run: `npx supabase migration up --local`
Expected: output lists `0104_profile_stamp` as applied, no errors. (This applies only pending migrations — it does NOT reset/reseed the local database.)

- [ ] **Step 3: Verify the column exists**

Run: `docker exec supabase_db_dentalsaas psql -U postgres -d postgres -c "\d profiles" | grep stamp`
Expected: a line showing `stamp | text |`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0104_profile_stamp.sql
git commit -m "feat(db): agregar profiles.stamp para el sello del doctor"
```

---

### Task 2: Server action to save/clear the stamp

**Files:**
- Create: `app/(dashboard)/ajustes/stamp-actions.ts`

**Interfaces:**
- Consumes: `getProfile()` from `@/lib/auth` (returns `{ userId: string; role: Role; ... } | null`), `can()` from `@/lib/rbac`, `createClient()` from `@/lib/supabase/server`.
- Produces: `saveMyStamp(dataUrl: string): Promise<StampState>` where `StampState = { ok?: boolean; error?: string }`. Calling with `dataUrl: ""` clears the stamp (sets it to `null`). Consumed by Task 3.

- [ ] **Step 1: Write the action**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";

export type StampState = { ok?: boolean; error?: string };

// Cada doctor guarda su propio sello (dato personal, no de la clínica): se
// autocompleta en sus recetas médicas junto a la firma. Mismo permiso que
// firmar recetas (createPrescription / saveMySignature usan "clinical:write").
export async function saveMyStamp(dataUrl: string): Promise<StampState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "clinical:write"))
    return { error: "Sin permiso para guardar un sello." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ stamp: dataUrl || null })
    .eq("id", profile.userId);
  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (This file has no automated test — it's a thin wrapper matching the untested precedent `signature-actions.ts`; it's exercised manually in Task 4's verification step.)

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/ajustes/stamp-actions.ts"
git commit -m "feat(ajustes): server action para guardar el sello del doctor"
```

---

### Task 3: Stamp upload panel component

**Files:**
- Create: `components/ajustes/StampUploadPanel.tsx`

**Interfaces:**
- Consumes: `saveMyStamp` from Task 2 (`app/(dashboard)/ajustes/stamp-actions.ts`), `imageCompression` from `browser-image-compression`, `toast` from `@/lib/toast`.
- Produces: `StampUploadPanel({ currentStamp }: { currentStamp: string | null })` — a client component. Consumed by Task 4.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";
import { Upload, Trash2 } from "lucide-react";
import { saveMyStamp } from "@/app/(dashboard)/ajustes/stamp-actions";
import { toast } from "@/lib/toast";

const btn =
  "inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50";

// Comprime la foto del sello a un tamaño chico antes de guardarla como data
// URL — un sello no necesita más que unos cientos de KB. useWebWorker:false
// porque el worker de la librería carga su script desde un CDN externo, lo
// que viola la CSP del proyecto (script-src 'self'); en el hilo principal es
// instantáneo para una sola imagen.
async function fileToCompressedDataUrl(file: File): Promise<string> {
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.3,
    maxWidthOrHeight: 500,
    fileType: "image/webp",
    useWebWorker: false,
  });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(compressed);
  });
}

// Sello personal del doctor: se usa para autocompletar sus recetas médicas
// impresas (identificado por el doctor que emite la receta, no por paciente).
export function StampUploadPanel({ currentStamp }: { currentStamp: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      const res = await saveMyStamp(dataUrl);
      if (res.ok) {
        toast("Sello guardado", "success");
        router.refresh();
      } else {
        toast(res.error ?? "No se pudo guardar el sello", "error");
      }
    } catch {
      toast("No se pudo procesar la imagen", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    const res = await saveMyStamp("");
    setBusy(false);
    if (res.ok) {
      toast("Sello eliminado", "success");
      router.refresh();
    } else {
      toast(res.error ?? "No se pudo eliminar el sello", "error");
    }
  }

  return (
    <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="max-w-sm">
        {currentStamp && (
          <img
            src={currentStamp}
            alt="Mi sello"
            className="mb-2 h-32 w-full rounded-lg border border-slate-200 bg-[#ffffff] object-contain"
          />
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
        <div className="flex gap-2">
          <button
            type="button"
            className={btn}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            {busy ? "Procesando…" : currentStamp ? "Reemplazar" : "Subir foto del sello"}
          </button>
          {currentStamp && (
            <button type="button" className={btn} disabled={busy} onClick={remove}>
              <Trash2 className="h-3.5 w-3.5" /> Quitar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ajustes/StampUploadPanel.tsx
git commit -m "feat(ajustes): panel para subir el sello del doctor"
```

---

### Task 4: Wire the panel into the Ajustes page

**Files:**
- Modify: `app/(dashboard)/ajustes/page.tsx:39-51` (data fetch) and `app/(dashboard)/ajustes/page.tsx:220-230` (JSX)

**Interfaces:**
- Consumes: `StampUploadPanel` from Task 3, existing `canSignPrescriptions` and `profile` already computed in this file.

- [ ] **Step 1: Add the import**

In `app/(dashboard)/ajustes/page.tsx`, next to the existing `MySignaturePanel` import:

```typescript
import { StampUploadPanel } from "@/components/ajustes/StampUploadPanel";
```

- [ ] **Step 2: Extend the signature query to also select `stamp`**

Find this block (around line 39-51):

```typescript
  // Firma personal del doctor (recetas médicas) + estado de Google Calendar.
  let mySignature: string | null = null;
  let googleCalendarConnected = false;
  if (canSignPrescriptions && profile) {
    const { data } = await supabase
      .from("profiles")
      .select("signature, google_calendar_connected")
      .eq("id", profile.userId)
      .single();
    mySignature = (data?.signature as string | null) ?? null;
    googleCalendarConnected = data?.google_calendar_connected ?? false;
  }
```

Replace it with:

```typescript
  // Firma y sello personales del doctor (recetas médicas) + estado de Google Calendar.
  let mySignature: string | null = null;
  let myStamp: string | null = null;
  let googleCalendarConnected = false;
  if (canSignPrescriptions && profile) {
    const { data } = await supabase
      .from("profiles")
      .select("signature, stamp, google_calendar_connected")
      .eq("id", profile.userId)
      .single();
    mySignature = (data?.signature as string | null) ?? null;
    myStamp = (data?.stamp as string | null) ?? null;
    googleCalendarConnected = data?.google_calendar_connected ?? false;
  }
```

- [ ] **Step 3: Render the panel next to "Mi firma"**

Find this block (around line 220-230):

```tsx
      {canSignPrescriptions && (
        <section>
          <h2 className="text-lg font-semibold text-slate-800">Mi firma</h2>
          <p className="mb-3 text-sm text-slate-500">
            Se agrega automáticamente a las recetas médicas que emitas.
          </p>
          <MySignaturePanel currentSignature={mySignature} />
        </section>
      )}
```

Replace it with:

```tsx
      {canSignPrescriptions && (
        <section>
          <h2 className="text-lg font-semibold text-slate-800">Mi firma</h2>
          <p className="mb-3 text-sm text-slate-500">
            Se agrega automáticamente a las recetas médicas que emitas.
          </p>
          <MySignaturePanel currentSignature={mySignature} />
        </section>
      )}

      {canSignPrescriptions && (
        <section>
          <h2 className="text-lg font-semibold text-slate-800">Mi sello</h2>
          <p className="mb-3 text-sm text-slate-500">
            Foto de tu sello físico. Se agrega automáticamente a las recetas
            médicas que emitas, junto a tu firma.
          </p>
          <StampUploadPanel currentStamp={myStamp} />
        </section>
      )}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification against the running dev server**

With the local dev server up (`npx next dev`) and the local Supabase DB running:
1. Log in as `admin@sonrisa.com` / `password123`.
2. Go to `/ajustes`. Confirm a new "Mi sello" section appears below "Mi firma", with a "Subir foto del sello" button.
3. Upload any image file. Confirm the toast "Sello guardado" appears and the image preview shows up.
4. Reload the page. Confirm the preview persists (proves it saved to the DB, not just local state).
5. Click "Quitar". Confirm the toast "Sello eliminado" appears and the preview disappears.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/ajustes/page.tsx"
git commit -m "feat(ajustes): mostrar el panel de sello junto a la firma"
```

---

### Task 5: Render the stamp on the printed prescription

**Files:**
- Modify: `app/(print)/pacientes/[id]/receta/[recetaId]/page.tsx`

**Interfaces:**
- Consumes: `profiles.stamp` column from Task 1.

- [ ] **Step 1: Extend the prescription query and doctor type to include `stamp`**

Find (line 25):

```typescript
    .select("id, medications, notes, issued_at, doctor:profiles(full_name, signature)")
```

Replace with:

```typescript
    .select("id, medications, notes, issued_at, doctor:profiles(full_name, signature, stamp)")
```

Find (line 47):

```typescript
  const doctor = rx.doctor as { full_name?: string; signature?: string | null } | null;
  const doctorName = doctor?.full_name ?? null;
  const doctorSignature = doctor?.signature ?? null;
```

Replace with:

```typescript
  const doctor = rx.doctor as
    | { full_name?: string; signature?: string | null; stamp?: string | null }
    | null;
  const doctorName = doctor?.full_name ?? null;
  const doctorSignature = doctor?.signature ?? null;
  const doctorStamp = doctor?.stamp ?? null;
```

- [ ] **Step 2: Render the stamp block next to the signature block**

Find (lines 146-161):

```tsx
        {/* Firma del odontólogo (el paciente no firma la receta) */}
        <div className="mt-16 flex justify-center">
          <div className="w-64 text-center text-sm text-slate-500">
            {doctorSignature && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={doctorSignature}
                alt="Firma del odontólogo"
                className="mx-auto mb-2 h-20 object-contain"
              />
            )}
            <div className="border-t border-slate-400 pt-2">
              Firma del Odontólogo
            </div>
          </div>
        </div>
```

Replace with:

```tsx
        {/* Firma y sello del odontólogo (el paciente no firma la receta) */}
        <div className="mt-16 flex justify-center gap-12">
          <div className="w-64 text-center text-sm text-slate-500">
            {doctorSignature && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={doctorSignature}
                alt="Firma del odontólogo"
                className="mx-auto mb-2 h-20 object-contain"
              />
            )}
            <div className="border-t border-slate-400 pt-2">
              Firma del Odontólogo
            </div>
          </div>
          {doctorStamp && (
            <div className="w-64 text-center text-sm text-slate-500">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={doctorStamp}
                alt="Sello del odontólogo"
                className="mx-auto mb-2 h-20 object-contain"
              />
              <div className="border-t border-slate-400 pt-2">Sello</div>
            </div>
          )}
        </div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification against the running dev server**

With the stamp already saved from Task 4's verification (or upload one now):
1. Go to any patient's file → "Recetas emitidas" (or wherever a prescription can be printed from) and open/print a prescription issued by the doctor who has a stamp saved.
2. Confirm both "Firma del Odontólogo" and "Sello" blocks render side by side below the medications table, each showing its image.
3. Open/print a prescription issued by a doctor who has NOT uploaded a stamp. Confirm only the "Firma del Odontólogo" block renders — no empty "Sello" box.

- [ ] **Step 5: Run the full test suite to confirm nothing else broke**

Run: `npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add "app/(print)/pacientes/[id]/receta/[recetaId]/page.tsx"
git commit -m "feat(recetas): mostrar el sello del doctor junto a la firma"
```

---

## Self-Review Notes

- **Spec coverage:** migration (Task 1) ✓, upload UI + compression + save/remove (Tasks 2-3) ✓, Ajustes placement next to firma with same permission gate (Task 4) ✓, receta-only rendering with side-by-side layout and no-placeholder-when-missing (Task 5) ✓. "Fuera de alcance" items (R2, quota, recepcionista gate) are explicitly not touched by any task.
- **Type consistency:** `StampState` (Task 2) matches `saveMyStamp`'s return type used in Task 3. `currentStamp` prop name matches between Task 3's component definition and Task 4's usage. `doctor.stamp` field name matches the migration's column name (Task 1) and the query alias (Task 5).
- **No placeholders:** every step has literal code, not descriptions of code.
