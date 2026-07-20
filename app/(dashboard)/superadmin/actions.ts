"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/superadmin";
import { FEATURES, MODULE_KEYS, MODULE_PRESETS, type FeatureKey, type ModulePreset } from "@/lib/features";
import { inviteClinicUser } from "@/lib/inviteUser";
import type { VapiClinicConfig } from "@/lib/vapi";

async function assertSuperadmin() {
  if (!(await isPlatformAdmin())) throw new Error("No autorizado");
}

// ── Crear clínica + admin ────────────────────────────────────────────────────
const newClinicSchema = z.object({
  clinicName: z.string().min(2, "Nombre de clínica muy corto"),
  adminEmail: z.string().email("Email inválido"),
  adminName: z.string().min(2, "Nombre del admin muy corto"),
  plan: z.enum(["starter", "pro", "premium"]).default("starter"),
});

export async function createClinic(_prev: unknown, formData: FormData) {
  await assertSuperadmin();

  const parsed = newClinicSchema.safeParse({
    clinicName: formData.get("clinicName"),
    adminEmail: formData.get("adminEmail"),
    adminName: formData.get("adminName"),
    plan: formData.get("plan") || "starter",
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { clinicName, adminEmail, adminName, plan } = parsed.data;

  const whatsappAddon = formData.get("whatsapp_addon") === "true";

  const admin = createAdminClient();

  const { data: clinic, error: clinicErr } = await admin
    .from("clinics")
    .insert({ name: clinicName, plan, features: { whatsapp: whatsappAddon } })
    .select("id")
    .single();
  if (clinicErr || !clinic) {
    return { error: `No se pudo crear la clínica: ${clinicErr?.message}` };
  }

  // El admin se crea por INVITACIÓN: Supabase le envía un correo y él define su
  // propia contraseña en /bienvenida. Si falla, se revierte la clínica.
  const invite = await inviteClinicUser(admin, {
    email: adminEmail,
    fullName: adminName,
    clinicId: clinic.id,
    role: "admin",
  });
  if (!invite.ok) {
    await admin.from("clinics").delete().eq("id", clinic.id);
    return { error: invite.error };
  }

  revalidatePath("/superadmin");
  return { ok: `Clínica "${clinicName}" creada. Invitación enviada a ${adminEmail}.` };
}

// ── Añadir usuario a clínica existente ──────────────────────────────────────
const addUserSchema = z.object({
  clinicId: z.string().uuid("Clínica inválida"),
  email: z.string().email("Email inválido"),
  fullName: z.string().min(2, "Nombre muy corto"),
  role: z.enum(["admin", "recepcionista", "colega", "odontologo_general", "especialista", "asistente"]),
});

export async function addClinicUser(_prev: unknown, formData: FormData) {
  await assertSuperadmin();

  const parsed = addUserSchema.safeParse({
    clinicId: formData.get("clinicId"),
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { clinicId, email, fullName, role } = parsed.data;

  const admin = createAdminClient();
  const invite = await inviteClinicUser(admin, { email, fullName, clinicId, role });
  if (!invite.ok) return { error: invite.error };

  revalidatePath("/superadmin");
  return { ok: `Invitación enviada a ${email}` };
}

// ── Cambiar rol de usuario ────────────────────────────────────────────────────
export async function updateUserRole(formData: FormData) {
  await assertSuperadmin();
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  const valid = ["admin", "recepcionista", "colega", "odontologo_general", "especialista", "asistente"];
  if (!userId || !valid.includes(role)) return;
  const admin = createAdminClient();
  await admin.from("profiles").update({ role }).eq("id", userId);
  revalidatePath("/superadmin");
}

// ── Desactivar / reactivar usuario (reversible, solo superadmin) ─────────────
// A diferencia de eliminar, NO borra la cuenta: el usuario deja de poder entrar
// (el layout le muestra un aviso), pero conserva TODO su rastro clínico (citas,
// trabajos, comisiones, notas). El admin de clínica NO tiene esta opción.
export async function setUserActive(formData: FormData) {
  await assertSuperadmin();
  const userId = String(formData.get("userId") ?? "");
  const active = formData.get("active") === "true";
  if (!userId) return;
  const admin = createAdminClient();
  await admin.from("profiles").update({ active }).eq("id", userId);
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
  revalidatePath("/", "layout");
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

  // Nunca eliminar cuentas de platform admins aunque tengan perfil en esta clínica
  // (puede ocurrir si el superadmin estaba en modo vista previa de la clínica).
  const { data: platformAdmins } = await admin
    .from("platform_admins")
    .select("user_id");
  const safeIds = new Set((platformAdmins ?? []).map((pa) => pa.user_id));

  for (const p of profiles ?? []) {
    if (safeIds.has(p.id)) continue;
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
  revalidatePath("/agenda");
  revalidatePath("/", "layout");
}

// ── Preset de módulos (Consultorio / Clínica completa) ───────────────────────
// Enciende/apaga de golpe los módulos (no-core, no-opt-in) según el plan.
// Los add-ons opt-in NO se tocan: se venden aparte en cualquier plan.
export async function applyModulePreset(formData: FormData) {
  await assertSuperadmin();
  const clinicId = String(formData.get("clinicId") ?? "");
  const preset = String(formData.get("preset") ?? "") as ModulePreset;
  if (!clinicId || !(preset in MODULE_PRESETS)) return;

  const admin = createAdminClient();
  const { data: clinic } = await admin
    .from("clinics")
    .select("features")
    .eq("id", clinicId)
    .single();

  const features = { ...(clinic?.features as Record<string, boolean> | null) };
  const on = new Set(MODULE_PRESETS[preset]);
  for (const key of MODULE_KEYS) features[key] = on.has(key);

  await admin.from("clinics").update({ features }).eq("id", clinicId);
  revalidatePath("/superadmin");
  revalidatePath("/agenda");
  revalidatePath("/", "layout");
}

// ── Límite de usuarios por clínica ───────────────────────────────────────────
export async function setMaxUsers(_prev: unknown, formData: FormData) {
  await assertSuperadmin();
  const clinicId = String(formData.get("clinicId") ?? "");
  const maxUsers = Number(formData.get("maxUsers"));
  if (!clinicId || !Number.isInteger(maxUsers) || maxUsers < 1)
    return { error: "Valor inválido" };
  const admin = createAdminClient();
  await admin.from("clinics").update({ max_users: maxUsers }).eq("id", clinicId);
  revalidatePath("/superadmin");
  return { ok: true };
}

// ── Tope de fotos por clínica ────────────────────────────────────────────────
// Se guarda en el jsonb `features` (clave numérica `fotos_max`), junto a los
// toggles booleanos. No requiere migración. 0 = sin fotos permitidas.
export async function setPhotoQuota(_prev: unknown, formData: FormData) {
  await assertSuperadmin();
  const clinicId = String(formData.get("clinicId") ?? "");
  const quota = Number(formData.get("quota"));
  if (!clinicId || !Number.isInteger(quota) || quota < 0)
    return { error: "Valor inválido" };

  const admin = createAdminClient();
  const { data: clinic } = await admin
    .from("clinics")
    .select("features")
    .eq("id", clinicId)
    .single();

  const features = { ...(clinic?.features as Record<string, unknown> | null) };
  features.fotos_max = quota;

  await admin.from("clinics").update({ features }).eq("id", clinicId);
  revalidatePath("/superadmin");
  return { ok: true };
}

// ── Tope de pacientes por clínica (upsell) ───────────────────────────────────
// Campo vacío = sin tope (null, columna clinics.max_patients). El superadmin
// lo usa como palanca comercial: activa el número cuando quiere que la
// clínica vea el aviso de upgrade en /pacientes.
export async function setMaxPatients(_prev: unknown, formData: FormData) {
  await assertSuperadmin();
  const clinicId = String(formData.get("clinicId") ?? "");
  if (!clinicId) return { error: "Valor inválido" };

  const raw = String(formData.get("maxPatients") ?? "").trim();
  let maxPatients: number | null;
  if (raw === "") {
    maxPatients = null;
  } else {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) return { error: "Valor inválido" };
    maxPatients = n;
  }

  const admin = createAdminClient();
  await admin.from("clinics").update({ max_patients: maxPatients }).eq("id", clinicId);
  revalidatePath("/superadmin");
  return { ok: true };
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

// ── Vista previa de clínica ──────────────────────────────────────────────────
// Inserta un perfil temporal del superadmin en la clínica objetivo para que el
// custom_access_token_hook inyecte el clinic_id correcto en el JWT tras el
// refreshSession(). Así todas las queries RLS del dashboard funcionan sin
// ninguna modificación adicional.
export async function enterClinic(
  clinicId: string,
): Promise<{ access_token: string; refresh_token: string }> {
  await assertSuperadmin();

  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) throw new Error("No hay sesión activa");

  const admin = createAdminClient();

  // Verificar que la clínica existe
  const { data: clinic } = await admin
    .from("clinics")
    .select("id")
    .eq("id", clinicId)
    .single();
  if (!clinic) throw new Error("Clínica no encontrada");

  // Upsert: si ya tiene perfil (preview de otra clínica) lo actualiza;
  // si no, lo inserta.
  await admin.from("profiles").upsert({
    id: user.id,
    clinic_id: clinicId,
    role: "admin",
    full_name: "Superadmin",
  });

  // Forzar un JWT nuevo: el hook leerá el perfil recién insertado e inyectará
  // clinic_id. DEVOLVEMOS los tokens para que el navegador los aplique con
  // setSession() (mismo patrón que el login). Un server action NO propaga de
  // forma fiable las cookies escritas por refreshSession() al navegador, así que
  // dejar que el cliente fije la sesión es la única vía confiable.
  const { data, error } = await serverClient.auth.refreshSession();
  if (error || !data.session) {
    throw new Error(`No se pudo refrescar la sesión: ${error?.message ?? "sin sesión"}`);
  }
  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  };
}

// ── Configuración Vapi por clínica ───────────────────────────────────────────
export async function updateClinicVapiConfig(
  clinicId: string,
  config: VapiClinicConfig,
): Promise<{ ok: boolean; error?: string }> {
  await assertSuperadmin();
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("clinics")
    .select("settings")
    .eq("id", clinicId)
    .single();
  const merged = {
    ...(existing?.settings as Record<string, unknown> ?? {}),
    ...(config.vapi_phone_number_id !== undefined && { vapi_phone_number_id: config.vapi_phone_number_id }),
    ...(config.vapi_voice_id !== undefined && { vapi_voice_id: config.vapi_voice_id }),
    ...(config.vapi_first_message !== undefined && { vapi_first_message: config.vapi_first_message }),
  };
  const { error } = await admin.from("clinics").update({ settings: merged }).eq("id", clinicId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/superadmin");
  return { ok: true };
}

// Elimina el perfil temporal del superadmin y restaura el JWT sin clinic_id.
export async function exitClinic(): Promise<{
  access_token: string;
  refresh_token: string;
}> {
  await assertSuperadmin();

  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) throw new Error("No hay sesión activa");

  const admin = createAdminClient();
  await admin.from("profiles").delete().eq("id", user.id);

  // Mismo motivo que en enterClinic: devolvemos el JWT ya SIN clinic_id (el hook
  // no encuentra perfil) para que el navegador lo fije con setSession().
  const { data, error } = await serverClient.auth.refreshSession();
  if (error || !data.session) {
    throw new Error(`No se pudo refrescar la sesión: ${error?.message ?? "sin sesión"}`);
  }
  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  };
}
