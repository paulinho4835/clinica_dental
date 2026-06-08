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
    .from("clinics")
    .insert({ name: clinicName, plan })
    .select("id")
    .single();
  if (clinicErr || !clinic) {
    return { error: `No se pudo crear la clínica: ${clinicErr?.message}` };
  }

  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
  });
  if (userErr || !created.user) {
    await admin.from("clinics").delete().eq("id", clinic.id);
    return { error: `No se pudo crear el usuario: ${userErr?.message}` };
  }

  const { error: profErr } = await admin.from("profiles").insert({
    id: created.user.id,
    clinic_id: clinic.id,
    role: "admin",
    full_name: adminName,
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
    email,
    password,
    email_confirm: true,
  });
  if (userErr || !created.user) {
    return { error: `Error creando usuario: ${userErr?.message}` };
  }

  const { error: profErr } = await admin.from("profiles").insert({
    id: created.user.id,
    clinic_id: clinicId,
    role,
    full_name: fullName,
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

// ── Dar de baja / reactivar clínica (reversible) ─────────────────────────────
export async function setClinicActive(formData: FormData) {
  await assertSuperadmin();
  const clinicId = String(formData.get("clinicId") ?? "");
  const active = formData.get("active") === "true";
  if (!clinicId) return;
  const admin = createAdminClient();
  await admin.from("clinics").update({ active }).eq("id", clinicId);
  revalidatePath("/superadmin");
}

// ── Eliminar clínica (+ todos sus usuarios) ──────────────────────────────────
export async function deleteClinic(formData: FormData) {
  await assertSuperadmin();
  const clinicId = String(formData.get("clinicId") ?? "");
  if (!clinicId) return;
  const admin = createAdminClient();

  const { data: profiles } = await admin
    .from("profiles")
    .select("id")
    .eq("clinic_id", clinicId);

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
  const { data: clinic } = await admin
    .from("clinics")
    .select("features")
    .eq("id", clinicId)
    .single();

  const features = { ...(clinic?.features as Record<string, boolean> | null) };
  features[key] = enabled;

  await admin.from("clinics").update({ features }).eq("id", clinicId);
  revalidatePath("/superadmin");
}

// ── Cambiar plan ─────────────────────────────────────────────────────────────
export async function setPlan(formData: FormData) {
  await assertSuperadmin();
  const clinicId = String(formData.get("clinicId") ?? "");
  const plan = String(formData.get("plan") ?? "");
  if (!clinicId || !["starter", "pro", "premium"].includes(plan)) return;
  const admin = createAdminClient();
  await admin.from("clinics").update({ plan }).eq("id", clinicId);
  revalidatePath("/superadmin");
}
