"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getPlatformAdminIds } from "@/lib/platformAdmins";

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
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
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
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { email, full_name, password, role } = parsed.data;

  const admin = createAdminClient();

  // Verificar límite de usuarios antes de crear (excluye superadmins en vista previa).
  const [platformAdminIds, { data: clinicRow }] = await Promise.all([
    getPlatformAdminIds(),
    admin.from("clinics").select("max_users").eq("id", profile.clinicId).single(),
  ]);
  let countQuery = admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", profile.clinicId);
  if (platformAdminIds.length > 0) {
    countQuery = countQuery.not("id", "in", `(${platformAdminIds.join(",")})`);
  }
  const { count } = await countQuery;
  const maxUsers = clinicRow?.max_users ?? 10;
  if ((count ?? 0) >= maxUsers) {
    return { error: `Límite de ${maxUsers} usuarios alcanzado. Contacta al administrador de la plataforma.` };
  }

  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userErr || !created.user)
    return { error: `No se pudo crear el usuario: ${userErr?.message}` };

  // clinic_id forzado al del admin: nunca se confía en el formulario.
  const { error: profErr } = await admin.from("profiles").insert({
    id: created.user.id,
    clinic_id: profile.clinicId,
    role,
    full_name,
  });
  if (profErr) {
    await admin.auth.admin.deleteUser(created.user.id); // rollback
    return { error: `No se pudo crear el perfil: ${profErr.message}` };
  }

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
