# Superadmin Panel — Complete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the superadmin panel so the SaaS operator can manage clinics, their users, roles, features, and plans from a single UI.

**Architecture:** Expand the existing `/superadmin` page (already has create-clinic, feature toggles, plan select) with user management per clinic, inline clinic name editing, and clinic deletion. All mutations go through server actions using `createAdminClient()` (service_role, bypasses RLS). The page fetches users alongside clinics at render time.

**Tech Stack:** Next.js 15 App Router, Supabase service_role, Server Actions, useActionState, useTransition, Zod, Tailwind, Lucide icons, `confirm()` from lib/confirm.ts.

---

## Existing foundation (do NOT re-implement)
- `app/(dashboard)/superadmin/page.tsx` — lists clinics, renders NewClinicForm, FeatureToggle, PlanSelect
- `app/(dashboard)/superadmin/actions.ts` — createClinic, toggleFeature, setPlan
- `components/superadmin/NewClinicForm.tsx`
- `components/superadmin/FeatureToggle.tsx`
- `components/superadmin/PlanSelect.tsx`
- `lib/superadmin.ts` — isPlatformAdmin()
- `lib/supabase/admin.ts` — createAdminClient()

## Files to create/modify

| File | Action | Purpose |
|------|--------|---------|
| `lib/supabase/middleware.ts` | Modify | Add /superadmin to PROTECTED |
| `app/(dashboard)/superadmin/actions.ts` | Modify | Add addClinicUser, removeClinicUser, updateUserRole, deleteClinic, updateClinicName |
| `app/(dashboard)/superadmin/page.tsx` | Modify | Fetch profiles per clinic, render new components |
| `components/superadmin/ClinicUsers.tsx` | Create | User list with role select + remove button |
| `components/superadmin/AddUserForm.tsx` | Create | Collapsible form to add user to existing clinic |
| `components/superadmin/EditClinicName.tsx` | Create | Inline name edit with pencil icon |
| `components/superadmin/DeleteClinicButton.tsx` | Create | Danger button with confirm() dialog |

---

## Task 1: Fix middleware — protect /superadmin

**Files:**
- Modify: `lib/supabase/middleware.ts:35`

- [ ] **Step 1: Add /superadmin to PROTECTED**

```typescript
// lib/supabase/middleware.ts — replace the PROTECTED array line
const PROTECTED = ["/agenda", "/pacientes", "/tratamientos", "/caja", "/inventario", "/ajustes", "/superadmin"];
```

- [ ] **Step 2: Verify build**
```
cd "c:\Users\pauli\OneDrive\Escritorio\Sistemas\Clinica Dental-Sistema"
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 3: Commit**
```
git add lib/supabase/middleware.ts
git commit -m "fix: protect /superadmin route in middleware"
```

---

## Task 2: Add server actions for user & clinic management

**Files:**
- Modify: `app/(dashboard)/superadmin/actions.ts`

- [ ] **Step 1: Replace actions.ts with extended version**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/superadmin";
import { FEATURES, type FeatureKey } from "@/lib/features";

async function assertSuperadmin() {
  if (!(await isPlatformAdmin())) throw new Error("No autorizado");
}

// ── Crear clínica + admin ────────────────────────────────────────────────────
const newClinicSchema = z.object({
  clinicName: z.string().min(2, "Nombre de clínica muy corto"),
  adminEmail: z.string().email("Email inválido"),
  adminName: z.string().min(2, "Nombre del admin muy corto"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  plan: z.enum(["starter", "pro", "premium"]).default("starter"),
});

export async function createClinic(_prev: unknown, formData: FormData) {
  await assertSuperadmin();
  const parsed = newClinicSchema.safeParse({
    clinicName: formData.get("clinicName"),
    adminEmail: formData.get("adminEmail"),
    adminName: formData.get("adminName"),
    password: formData.get("password"),
    plan: formData.get("plan") || "starter",
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { clinicName, adminEmail, adminName, password, plan } = parsed.data;

  const admin = createAdminClient();
  const { data: clinic, error: clinicErr } = await admin
    .from("clinics").insert({ name: clinicName, plan }).select("id").single();
  if (clinicErr || !clinic) return { error: `No se pudo crear la clínica: ${clinicErr?.message}` };

  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email: adminEmail, password, email_confirm: true,
  });
  if (userErr || !created.user) {
    await admin.from("clinics").delete().eq("id", clinic.id);
    return { error: `No se pudo crear el usuario: ${userErr?.message}` };
  }

  const { error: profErr } = await admin.from("profiles").insert({
    id: created.user.id, clinic_id: clinic.id, role: "admin", full_name: adminName,
  });
  if (profErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    await admin.from("clinics").delete().eq("id", clinic.id);
    return { error: `No se pudo crear el perfil: ${profErr.message}` };
  }

  revalidatePath("/superadmin");
  return { ok: `Clínica "${clinicName}" creada. Admin: ${adminEmail}` };
}

// ── Añadir usuario a clínica existente ──────────────────────────────────────
const addUserSchema = z.object({
  clinicId: z.string().uuid("Clínica inválida"),
  email: z.string().email("Email inválido"),
  fullName: z.string().min(2, "Nombre muy corto"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
  role: z.enum(["admin", "recepcionista", "odontologo_general", "especialista", "asistente"]),
});

export async function addClinicUser(_prev: unknown, formData: FormData) {
  await assertSuperadmin();
  const parsed = addUserSchema.safeParse({
    clinicId: formData.get("clinicId"),
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { clinicId, email, fullName, password, role } = parsed.data;

  const admin = createAdminClient();
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (userErr || !created.user) return { error: `Error creando usuario: ${userErr?.message}` };

  const { error: profErr } = await admin.from("profiles").insert({
    id: created.user.id, clinic_id: clinicId, role, full_name: fullName,
  });
  if (profErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: `Error creando perfil: ${profErr.message}` };
  }

  revalidatePath("/superadmin");
  return { ok: `Usuario ${email} añadido` };
}

// ── Cambiar rol de usuario ────────────────────────────────────────────────────
export async function updateUserRole(formData: FormData) {
  await assertSuperadmin();
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  const valid = ["admin", "recepcionista", "odontologo_general", "especialista", "asistente"];
  if (!userId || !valid.includes(role)) return;
  const admin = createAdminClient();
  await admin.from("profiles").update({ role }).eq("id", userId);
  revalidatePath("/superadmin");
}

// ── Eliminar usuario ─────────────────────────────────────────────────────────
export async function removeClinicUser(formData: FormData) {
  await assertSuperadmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(userId);
  revalidatePath("/superadmin");
}

// ── Renombrar clínica ────────────────────────────────────────────────────────
export async function updateClinicName(_prev: unknown, formData: FormData) {
  await assertSuperadmin();
  const clinicId = String(formData.get("clinicId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!clinicId || name.length < 2) return { error: "Nombre demasiado corto" };
  const admin = createAdminClient();
  await admin.from("clinics").update({ name }).eq("id", clinicId);
  revalidatePath("/superadmin");
  return { ok: true };
}

// ── Eliminar clínica ─────────────────────────────────────────────────────────
export async function deleteClinic(formData: FormData) {
  await assertSuperadmin();
  const clinicId = String(formData.get("clinicId") ?? "");
  if (!clinicId) return;
  const admin = createAdminClient();

  const { data: profiles } = await admin
    .from("profiles").select("id").eq("clinic_id", clinicId);
  for (const p of profiles ?? []) {
    await admin.auth.admin.deleteUser(p.id);
  }
  await admin.from("clinics").delete().eq("id", clinicId);
  revalidatePath("/superadmin");
}

// ── Feature toggle ───────────────────────────────────────────────────────────
export async function toggleFeature(formData: FormData) {
  await assertSuperadmin();
  const clinicId = String(formData.get("clinicId") ?? "");
  const key = String(formData.get("key") ?? "") as FeatureKey;
  const enabled = formData.get("enabled") === "true";
  const meta = FEATURES.find((f) => f.key === key);
  if (!clinicId || !meta || meta.core) return;
  const admin = createAdminClient();
  const { data: clinic } = await admin.from("clinics").select("features").eq("id", clinicId).single();
  const features = { ...(clinic?.features as Record<string, boolean> | null) };
  features[key] = enabled;
  await admin.from("clinics").update({ features }).eq("id", clinicId);
  revalidatePath("/superadmin");
}

// ── Plan ─────────────────────────────────────────────────────────────────────
export async function setPlan(formData: FormData) {
  await assertSuperadmin();
  const clinicId = String(formData.get("clinicId") ?? "");
  const plan = String(formData.get("plan") ?? "");
  if (!clinicId || !["starter", "pro", "premium"].includes(plan)) return;
  const admin = createAdminClient();
  await admin.from("clinics").update({ plan }).eq("id", clinicId);
  revalidatePath("/superadmin");
}
```

- [ ] **Step 2: Type-check**
```
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 3: Commit**
```
git add app/(dashboard)/superadmin/actions.ts
git commit -m "feat: superadmin actions — add user, remove user, change role, delete/rename clinic"
```

---

## Task 3: ClinicUsers component

**Files:**
- Create: `components/superadmin/ClinicUsers.tsx`

- [ ] **Step 1: Create component**

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { confirm } from "@/lib/confirm";
import { removeClinicUser, updateUserRole } from "@/app/(dashboard)/superadmin/actions";

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "recepcionista", label: "Recepcionista" },
  { value: "odontologo_general", label: "Odontólogo" },
  { value: "especialista", label: "Especialista" },
  { value: "asistente", label: "Asistente" },
];

export type ClinicUser = {
  id: string;
  full_name: string;
  role: string;
  email: string;
};

export function ClinicUsers({ users }: { users: ClinicUser[] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function handleRemove(userId: string, name: string) {
    const ok = await confirm({
      title: "Eliminar usuario",
      message: `¿Eliminar a ${name}? Esta acción no se puede deshacer.`,
      confirmText: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    const fd = new FormData();
    fd.set("userId", userId);
    startTransition(async () => {
      await removeClinicUser(fd);
      router.refresh();
    });
  }

  function handleRoleChange(userId: string, role: string) {
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("role", role);
    startTransition(async () => {
      await updateUserRole(fd);
      router.refresh();
    });
  }

  if (!users.length) {
    return <p className="text-xs text-slate-400">Sin usuarios registrados.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
      {users.map((u) => (
        <li key={u.id} className="flex items-center gap-3 px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{u.full_name}</div>
            <div className="truncate text-xs text-slate-400">{u.email}</div>
          </div>
          <select
            defaultValue={u.role}
            disabled={pending}
            onChange={(e) => handleRoleChange(u.id, e.target.value)}
            className="rounded border border-slate-200 px-2 py-1 text-xs focus:border-clinic focus:outline-none disabled:opacity-50"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending}
            onClick={() => handleRemove(u.id, u.full_name)}
            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            title="Eliminar usuario"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Type-check**
```
npx tsc --noEmit
```

---

## Task 4: AddUserForm component

**Files:**
- Create: `components/superadmin/AddUserForm.tsx`

- [ ] **Step 1: Create component**

```tsx
"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { addClinicUser } from "@/app/(dashboard)/superadmin/actions";

type State = { error?: string; ok?: string };
const initial: State = {};

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "recepcionista", label: "Recepcionista" },
  { value: "odontologo_general", label: "Odontólogo General" },
  { value: "especialista", label: "Especialista" },
  { value: "asistente", label: "Asistente" },
];

export function AddUserForm({ clinicId }: { clinicId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(addClinicUser, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-clinic hover:text-clinic-fg"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {open ? "Cancelar" : "+ Añadir usuario"}
      </button>

      {open && (
        <form ref={formRef} action={formAction} className="mt-3 space-y-2">
          <input type="hidden" name="clinicId" value={clinicId} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field name="fullName" label="Nombre completo" required />
            <Field name="email" label="Email" type="email" required />
            <Field name="password" label="Contraseña inicial" type="text" required />
            <label className="block text-xs">
              <span className="mb-1 block text-slate-500">Rol</span>
              <select
                name="role"
                defaultValue="recepcionista"
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-clinic focus:outline-none"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </label>
          </div>
          {state.error && <p className="text-xs text-red-600">{state.error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-clinic px-3 py-1.5 text-xs font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
          >
            {pending ? "Creando…" : "Crear usuario"}
          </button>
        </form>
      )}
    </div>
  );
}

function Field({ name, label, type = "text", required = false }: {
  name: string; label: string; type?: string; required?: boolean;
}) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block text-slate-500">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-clinic focus:outline-none"
      />
    </label>
  );
}
```

---

## Task 5: EditClinicName component

**Files:**
- Create: `components/superadmin/EditClinicName.tsx`

- [ ] **Step 1: Create component**

```tsx
"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";
import { updateClinicName } from "@/app/(dashboard)/superadmin/actions";

type State = { error?: string; ok?: boolean };
const initial: State = {};

export function EditClinicName({ clinicId, name }: { clinicId: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(updateClinicName, initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (state.ok) {
      setEditing(false);
      router.refresh();
    }
  }, [state.ok, router]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group flex items-center gap-1.5 font-semibold text-clinic-fg hover:text-clinic"
        title="Renombrar clínica"
      >
        {name}
        <Pencil className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="clinicId" value={clinicId} />
      <input
        ref={inputRef}
        name="name"
        defaultValue={name}
        className="rounded border border-clinic px-2 py-0.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-clinic"
        onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
      />
      <button type="submit" disabled={pending} className="rounded p-1 text-clinic hover:bg-clinic/10 disabled:opacity-50">
        <Check className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => setEditing(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100">
        <X className="h-4 w-4" />
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
```

---

## Task 6: DeleteClinicButton component

**Files:**
- Create: `components/superadmin/DeleteClinicButton.tsx`

- [ ] **Step 1: Create component**

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { confirm } from "@/lib/confirm";
import { deleteClinic } from "@/app/(dashboard)/superadmin/actions";

export function DeleteClinicButton({ clinicId, clinicName }: { clinicId: string; clinicName: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function handleDelete() {
    const ok = await confirm({
      title: "Eliminar clínica",
      message: `¿Eliminar "${clinicName}" y todos sus datos? Esta acción elimina permanentemente todos los pacientes, citas y registros. NO se puede deshacer.`,
      confirmText: "Eliminar clínica",
      tone: "danger",
    });
    if (!ok) return;
    const fd = new FormData();
    fd.set("clinicId", clinicId);
    startTransition(async () => {
      await deleteClinic(fd);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
      title="Eliminar clínica"
    >
      <Trash2 className="h-3.5 w-3.5" />
      {pending ? "Eliminando…" : "Eliminar"}
    </button>
  );
}
```

---

## Task 7: Update superadmin page to show user management

**Files:**
- Modify: `app/(dashboard)/superadmin/page.tsx`

- [ ] **Step 1: Rewrite page to include user management**

The page must:
1. Fetch profiles with user emails (join auth.users via service_role)
2. Group profiles by clinic_id
3. Render ClinicUsers, AddUserForm, EditClinicName, DeleteClinicButton per clinic

```tsx
import { redirect } from "next/navigation";
import { isPlatformAdmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { FEATURES, normalizeFeatures } from "@/lib/features";
import { NewClinicForm } from "@/components/superadmin/NewClinicForm";
import { FeatureToggle } from "@/components/superadmin/FeatureToggle";
import { PlanSelect } from "@/components/superadmin/PlanSelect";
import { ClinicUsers, type ClinicUser } from "@/components/superadmin/ClinicUsers";
import { AddUserForm } from "@/components/superadmin/AddUserForm";
import { EditClinicName } from "@/components/superadmin/EditClinicName";
import { DeleteClinicButton } from "@/components/superadmin/DeleteClinicButton";

export default async function SuperadminPage() {
  if (!(await isPlatformAdmin())) redirect("/agenda");

  const admin = createAdminClient();

  const { data: clinics } = await admin
    .from("clinics")
    .select("id, name, plan, features, created_at")
    .order("name", { ascending: true })
    .order("id", { ascending: true });

  // Profiles + emails (service_role can read auth.users via listUsers)
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, clinic_id, full_name, role");

  // Get emails from auth.users for each profile
  const userIds = (profiles ?? []).map((p) => p.id);
  const emailMap = new Map<string, string>();
  if (userIds.length > 0) {
    // Batch fetch emails via admin API (up to 1000)
    const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of authList?.users ?? []) {
      emailMap.set(u.id, u.email ?? "");
    }
  }

  // Group users by clinic
  const usersByClinic = new Map<string, ClinicUser[]>();
  for (const p of profiles ?? []) {
    const list = usersByClinic.get(p.clinic_id) ?? [];
    list.push({
      id: p.id,
      full_name: p.full_name,
      role: p.role,
      email: emailMap.get(p.id) ?? "",
    });
    usersByClinic.set(p.clinic_id, list);
  }

  const toggleable = FEATURES.filter((f) => !f.core);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Panel de plataforma</h1>
        <p className="text-sm text-slate-500">
          Gestión de clínicas, módulos y planes. Operas TODAS las clínicas; los clientes solo ven la suya.
        </p>
      </div>

      <section className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-4 text-lg font-semibold">Nueva clínica</h2>
        <NewClinicForm />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">
          Clínicas ({clinics?.length ?? 0})
        </h2>
        {clinics?.map((c) => {
          const features = normalizeFeatures(c.features);
          const users = usersByClinic.get(c.id) ?? [];
          return (
            <div key={c.id} className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
              {/* Header row */}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <EditClinicName clinicId={c.id} name={c.name} />
                  <div className="mt-0.5 text-xs text-slate-500">
                    {users.length} usuario{users.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <PlanSelect clinicId={c.id} plan={c.plan} />
                  <DeleteClinicButton clinicId={c.id} clinicName={c.name} />
                </div>
              </div>

              {/* Feature toggles */}
              <div className="mt-4 flex flex-wrap gap-2">
                {toggleable.map((f) => (
                  <FeatureToggle
                    key={f.key}
                    clinicId={c.id}
                    featureKey={f.key}
                    label={f.label}
                    enabled={features[f.key]}
                  />
                ))}
              </div>

              {/* Users */}
              <div className="mt-4 border-t border-slate-100 pt-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Usuarios
                </h3>
                <ClinicUsers users={users} />
                <AddUserForm clinicId={c.id} />
              </div>
            </div>
          );
        })}
        {!clinics?.length && (
          <p className="text-sm text-slate-500">Sin clínicas registradas aún.</p>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**
```
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 3: Commit**
```
git add app/(dashboard)/superadmin/page.tsx components/superadmin/
git commit -m "feat: superadmin — user management, edit/delete clinic"
```

---

## Task 8: Bootstrap SQL — registrarte como platform_admin

This is a one-time SQL command to run in Supabase Dashboard > SQL Editor **after** you've created your own user account via the login page.

- [ ] **Step 1: Find your user UUID**

In Supabase Dashboard → Authentication → Users, copy your UUID.

- [ ] **Step 2: Run this SQL** (replace the UUID)

```sql
-- Regístrarte como operador de la plataforma.
-- Ejecuta esto UNA VEZ con tu UUID real de auth.users.
INSERT INTO platform_admins (user_id, full_name)
VALUES ('TU-UUID-AQUI', 'Tu Nombre')
ON CONFLICT DO NOTHING;
```

- [ ] **Step 3: Verify**

Log out and log back in. The sidebar should show the **Superadmin** button with the Shield icon. Navigate to `/superadmin` — you should see the platform panel.
