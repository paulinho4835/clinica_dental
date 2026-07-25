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
