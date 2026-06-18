"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

export type ActionState = { error?: string; ok?: boolean };

export async function addReceptionista(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") return { error: "Sin permiso." };

  const parsed = z
    .object({ name: z.string().trim().min(1, "Ingresa un nombre.").max(80) })
    .safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Nombre inválido." };

  const supabase = await createClient();
  const { error } = await supabase.from("clinic_receptionists").insert({
    clinic_id: profile.clinicId,
    name: parsed.data.name,
  });
  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  revalidatePath("/mis-trabajos");
  return { ok: true };
}

export async function removeReceptionista(id: string): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") return { error: "Sin permiso." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("clinic_receptionists")
    .delete()
    .eq("id", id)
    .eq("clinic_id", profile.clinicId);
  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  revalidatePath("/mis-trabajos");
  return { ok: true };
}
