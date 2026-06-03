"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";

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
