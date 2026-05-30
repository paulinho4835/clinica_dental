"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/superadmin";
import { FEATURES, type FeatureKey } from "@/lib/features";

// Toda action del panel exige ser operador de la plataforma.
async function assertSuperadmin() {
  if (!(await isPlatformAdmin())) {
    throw new Error("No autorizado");
  }
}

// ----------------------------------------------------------------------------
// Crear clínica + su usuario admin en un paso.
// service_role: crea el auth.user (email confirmado) y siembra clinic+profile.
// ----------------------------------------------------------------------------
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
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }
  const { clinicName, adminEmail, adminName, password, plan } = parsed.data;

  const admin = createAdminClient();

  // 1) clínica
  const { data: clinic, error: clinicErr } = await admin
    .from("clinics")
    .insert({ name: clinicName, plan })
    .select("id")
    .single();
  if (clinicErr || !clinic) {
    return { error: `No se pudo crear la clínica: ${clinicErr?.message}` };
  }

  // 2) usuario auth (admin de esa clínica), email ya confirmado
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
  });
  if (userErr || !created.user) {
    // rollback de la clínica para no dejar huérfana
    await admin.from("clinics").delete().eq("id", clinic.id);
    return { error: `No se pudo crear el usuario: ${userErr?.message}` };
  }

  // 3) profile que liga usuario -> clínica con rol admin
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

// ----------------------------------------------------------------------------
// Encender / apagar un módulo de una clínica.
// ----------------------------------------------------------------------------
export async function toggleFeature(formData: FormData) {
  await assertSuperadmin();

  const clinicId = String(formData.get("clinicId") ?? "");
  const key = String(formData.get("key") ?? "") as FeatureKey;
  const enabled = formData.get("enabled") === "true";

  const meta = FEATURES.find((f) => f.key === key);
  if (!clinicId || !meta) return;
  if (meta.core) return; // núcleo no se apaga

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

// ----------------------------------------------------------------------------
// Cambiar el plan de una clínica.
// ----------------------------------------------------------------------------
export async function setPlan(formData: FormData) {
  await assertSuperadmin();
  const clinicId = String(formData.get("clinicId") ?? "");
  const plan = String(formData.get("plan") ?? "");
  if (!clinicId || !["starter", "pro", "premium"].includes(plan)) return;

  const admin = createAdminClient();
  await admin.from("clinics").update({ plan }).eq("id", clinicId);
  revalidatePath("/superadmin");
}
