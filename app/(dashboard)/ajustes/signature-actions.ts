"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";

export type SignatureState = { ok?: boolean; error?: string };

// Cada doctor guarda su propia firma (dato personal, no de la clínica): la
// misma que puede firmar recetas la usa para autocompletar el documento.
// Mismo permiso que emitir recetas (createPrescription usa "clinical:write").
export async function saveMySignature(dataUrl: string): Promise<SignatureState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "clinical:write"))
    return { error: "Sin permiso para guardar una firma." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ signature: dataUrl || null })
    .eq("id", profile.userId);
  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return { ok: true };
}
