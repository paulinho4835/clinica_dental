import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { normalizeFeatures, photoQuota, type Features } from "@/lib/features";
import { getAuthUser, getSessionRow } from "@/lib/auth";

// ¿El usuario autenticado es operador de la plataforma (dueño del SaaS)?
// Lee platform_admins con la sesión del usuario (policy self-select).
export const isPlatformAdmin = cache(async (): Promise<boolean> => {
  const user = await getAuthUser();
  if (!user) return false;

  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return !!data;
});

// Feature flags de la clínica del usuario actual. Cacheado por request.
export const getClinicFeatures = cache(async (): Promise<Features> => {
  const session = await getSessionRow();
  return normalizeFeatures(session?.clinic?.features ?? null);
});

// Moneda de la clínica del usuario actual. Cacheado por request.
export const getClinicCurrency = cache(async (): Promise<string> => {
  const session = await getSessionRow();
  return session?.clinic?.currency ?? "Bs";
});

// Tope de fotos por clínica del usuario actual (0 = módulo apagado). Cacheado
// por request. Lee el jsonb crudo de `features` (la clave numérica `fotos_max`).
export const getClinicPhotoQuota = cache(async (): Promise<number> => {
  const session = await getSessionRow();
  return photoQuota(session?.clinic?.features ?? null);
});
