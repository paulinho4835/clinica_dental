"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import { can, type Role } from "@/lib/rbac";
import { getPlatformAdminIds } from "@/lib/platformAdmins";
import { inviteClinicUser } from "@/lib/inviteUser";

export type ActionState = { error?: string; ok?: boolean };

const DoctorSchema = z.object({
  full_name: z.string().trim().min(1, "Nombre requerido"),
  specialty: z.string().trim().optional().nullable(),
});

export async function createDoctor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "settings:write"))
    return { error: "Sin permiso para gestionar doctores." };

  const parsed = DoctorSchema.safeParse({
    full_name: formData.get("full_name"),
    specialty: formData.get("specialty") || null,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { error } = await supabase.from("doctors").insert({
    clinic_id: profile.clinicId,
    full_name: parsed.data.full_name,
    specialty: parsed.data.specialty ?? null,
  });
  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return { ok: true };
}

export async function toggleDoctorActive(
  doctorId: string,
  active: boolean,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "settings:write"))
    return { error: "Sin permiso." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("doctors")
    .update({ active })
    .eq("id", doctorId);
  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return { ok: true };
}

// ============================================================================
// Gestión de usuarios del equipo (cuentas con login) por el ADMIN DE CLÍNICA.
// El admin de clínica crea/edita/elimina usuarios SOLO dentro de su clínica y
// NO puede crear otros admins (eso queda reservado al superadmin de plataforma).
// Usa el cliente service-role (bypasa RLS) pero TODO se acota al clinic_id del
// propio admin: el clinic_id nunca viene del formulario, y en update/delete se
// verifica que el objetivo pertenezca a la misma clínica.
// ============================================================================

// Roles que un admin de clínica puede asignar (admin queda excluido a propósito).
const TEAM_ROLES = [
  "recepcionista",
  "colega",
  "odontologo_general",
  "especialista",
  "asistente",
] as const;

// Solo el admin de la clínica gestiona su equipo. Devuelve el perfil o un error.
async function assertClinicAdmin() {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." as const };
  if (profile.role !== "admin")
    return { error: "Solo el administrador de la clínica puede gestionar usuarios." as const };
  return { profile };
}

const NewUserSchema = z.object({
  email: z.string().trim().email("Email inválido"),
  full_name: z.string().trim().min(2, "Nombre muy corto"),
  role: z.enum(TEAM_ROLES, { errorMap: () => ({ message: "Rol inválido" }) }),
});

export async function createTeamUser(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await assertClinicAdmin();
  if ("error" in auth) return { error: auth.error };
  const { profile } = auth;

  const parsed = NewUserSchema.safeParse({
    email: formData.get("email"),
    full_name: formData.get("full_name"),
    role: formData.get("role"),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { email, full_name, role } = parsed.data;

  const admin = createAdminClient();

  // Verificar límite de usuarios antes de crear (excluye superadmins en vista previa).
  const [platformAdminIds, { data: clinicRow }] = await Promise.all([
    getPlatformAdminIds(),
    admin.from("clinics").select("max_users").eq("id", profile.clinicId).single(),
  ]);
  // Solo cuentan los usuarios activos para el cupo: un usuario desactivado
  // libera su lugar y la clínica puede crear otro.
  let countQuery = admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", profile.clinicId)
    .eq("active", true);
  if (platformAdminIds.length > 0) {
    countQuery = countQuery.not("id", "in", `(${platformAdminIds.join(",")})`);
  }
  const { count } = await countQuery;
  const maxUsers = clinicRow?.max_users ?? 10;
  if ((count ?? 0) >= maxUsers) {
    return { error: `Límite de ${maxUsers} usuarios alcanzado. Contacta al administrador de la plataforma.` };
  }

  // Invitación por correo: el usuario define su propia contraseña en /bienvenida.
  // clinic_id forzado al del admin: nunca se confía en el formulario.
  const invite = await inviteClinicUser(admin, {
    email,
    fullName: full_name,
    clinicId: profile.clinicId,
    role: role as Role,
  });
  if (!invite.ok) return { error: invite.error };

  revalidatePath("/ajustes");
  return { ok: true };
}

const UpdateRoleSchema = z.object({
  userId: z.string().uuid("Usuario inválido"),
  role: z.enum(TEAM_ROLES, { errorMap: () => ({ message: "Rol inválido" }) }),
});

export async function updateTeamUserRole(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await assertClinicAdmin();
  if ("error" in auth) return { error: auth.error };
  const { profile } = auth;

  const parsed = UpdateRoleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { userId, role } = parsed.data;

  if (userId === profile.userId)
    return { error: "No puedes cambiar tu propio rol." };

  const admin = createAdminClient();

  // Verifica que el objetivo exista, sea de la MISMA clínica y no sea admin.
  const { data: target } = await admin
    .from("profiles")
    .select("clinic_id, role")
    .eq("id", userId)
    .single();
  if (!target || target.clinic_id !== profile.clinicId)
    return { error: "Usuario no encontrado en tu clínica." };
  if (target.role === "admin")
    return { error: "No puedes modificar a otro administrador." };

  const { error } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return { ok: true };
}

// Teléfono del doctor (addon "aviso_doctores"): número al que la recepción le
// manda por WhatsApp Web el resumen de su agenda del día. Vacío = borrar.
const UpdatePhoneSchema = z.object({
  userId: z.string().uuid("Usuario inválido"),
  phone: z.string().trim().max(30, "Teléfono demasiado largo").optional().nullable(),
});

export async function updateTeamUserPhone(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await assertClinicAdmin();
  if ("error" in auth) return { error: auth.error };
  const { profile } = auth;

  const parsed = UpdatePhoneSchema.safeParse({
    userId: formData.get("userId"),
    phone: formData.get("phone"),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { userId, phone } = parsed.data;

  const admin = createAdminClient();

  // El objetivo debe existir y ser de la MISMA clínica (defensa en profundidad).
  const { data: target } = await admin
    .from("profiles")
    .select("clinic_id")
    .eq("id", userId)
    .single();
  if (!target || target.clinic_id !== profile.clinicId)
    return { error: "Usuario no encontrado en tu clínica." };

  const { error } = await admin
    .from("profiles")
    .update({ phone: phone && phone.length > 0 ? phone : null })
    .eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return { ok: true };
}

// ============================================================================
// Perfil público de la clínica (addon "perfil").
// ============================================================================

const ClinicProfileSchema = z.object({
  name:     z.string().trim().min(1, "El nombre de la clínica es requerido"),
  address:  z.string().trim().optional().nullable(),
  phone:    z.string().trim().optional().nullable(),
  nit:      z.string().trim().optional().nullable(),
  logo_url: z.string().trim().url("URL de logo inválida").optional().nullable().or(z.literal("")),
  currency: z.string().trim().min(1).max(5, "Máximo 5 caracteres"),
});

export async function updateClinicProfile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await assertClinicAdmin();
  if ("error" in auth) return { error: auth.error };
  const { profile } = auth;

  const parsed = ClinicProfileSchema.safeParse({
    name:     formData.get("name"),
    address:  formData.get("address") || null,
    phone:    formData.get("phone") || null,
    nit:      formData.get("nit") || null,
    logo_url: formData.get("logo_url") || null,
    currency: formData.get("currency") || "Bs",
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("clinics")
    .update({
      name:     parsed.data.name,
      address:  parsed.data.address ?? null,
      phone:    parsed.data.phone ?? null,
      nit:      parsed.data.nit ?? null,
      logo_url: parsed.data.logo_url || null,
      currency: parsed.data.currency,
    })
    .eq("id", profile.clinicId);
  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return { ok: true };
}

export async function removeTeamUser(formData: FormData): Promise<ActionState> {
  const auth = await assertClinicAdmin();
  if ("error" in auth) return { error: auth.error };
  const { profile } = auth;

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Usuario inválido." };
  if (userId === profile.userId)
    return { error: "No puedes eliminar tu propia cuenta." };

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("clinic_id, role")
    .eq("id", userId)
    .single();
  if (!target || target.clinic_id !== profile.clinicId)
    return { error: "Usuario no encontrado en tu clínica." };
  if (target.role === "admin")
    return { error: "No puedes eliminar a otro administrador." };

  // Borra la cuenta auth; el perfil cae por ON DELETE CASCADE.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return { ok: true };
}

// ============================================================================
// Recordatorios WhatsApp (addon "recordatorios").
// ============================================================================

export async function saveRemindersConfig(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await assertClinicAdmin();
  if ("error" in auth) return { error: auth.error };
  const { profile } = auth;

  const h24 = formData.get("reminders_h24") === "on";
  const h2  = formData.get("reminders_h2")  === "on";

  const admin = createAdminClient();
  const { data: clinic } = await admin
    .from("clinics")
    .select("settings")
    .eq("id", profile.clinicId)
    .single();

  const existing = (clinic?.settings ?? {}) as Record<string, unknown>;
  const { error } = await admin
    .from("clinics")
    .update({ settings: { ...existing, reminders_h24: h24, reminders_h2: h2 } })
    .eq("id", profile.clinicId);

  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return { ok: true };
}

// ============================================================================
// Bloqueo por horario clínico (addon "bloqueo_horario").
// Define la ventana en la que los doctores pueden editar odontograma y
// evolución. Fuera de ella, esos registros quedan en modo lectura (el admin
// siempre puede editar). Se guarda en clinics.settings.clinical_hours.
// ============================================================================

export async function saveClinicalHours(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await assertClinicAdmin();
  if ("error" in auth) return { error: auth.error };
  const { profile } = auth;

  const enabled = formData.get("clinical_enabled") === "on";
  const from = String(formData.get("clinical_from") ?? "").trim();
  const to = String(formData.get("clinical_to") ?? "").trim();
  const hhmm = /^\d{2}:\d{2}$/;
  if (!hhmm.test(from) || !hhmm.test(to))
    return { error: "Las horas deben tener formato HH:MM." };
  if (from === to)
    return { error: "La hora de apertura y cierre no pueden ser iguales." };

  const admin = createAdminClient();
  const { data: clinic } = await admin
    .from("clinics")
    .select("settings")
    .eq("id", profile.clinicId)
    .single();

  const existing = (clinic?.settings ?? {}) as Record<string, unknown>;
  const { error } = await admin
    .from("clinics")
    .update({ settings: { ...existing, clinical_hours: { enabled, from, to } } })
    .eq("id", profile.clinicId);

  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return { ok: true };
}
