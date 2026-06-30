"use server";

import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LEGAL_VERSION } from "@/lib/legal";

// Registra la aceptación de los Términos y Condiciones por parte del admin de la
// clínica. Solo el rol 'admin' acepta (en nombre de toda la clínica). La policy
// profiles_admin_write permite que el admin actualice su propia fila vía RLS.
export async function acceptTerms(): Promise<{ ok: boolean; error?: string }> {
  const profile = await getProfile();
  if (!profile) return { ok: false, error: "Sesión no válida." };
  if (profile.role !== "admin") {
    return { ok: false, error: "Solo el administrador de la clínica acepta los términos." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      terms_accepted_at: new Date().toISOString(),
      terms_accepted_version: LEGAL_VERSION,
    })
    .eq("id", profile.userId);

  if (error) {
    console.error("acceptTerms:", error.message);
    return { ok: false, error: "No se pudo registrar la aceptación. Intenta de nuevo." };
  }
  return { ok: true };
}
