import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/rbac";

export interface CurrentProfile {
  userId: string;
  clinicId: string;
  role: Role;
  fullName: string;
}

// Perfil del usuario autenticado (clinic_id + rol). Cacheado por request.
// RLS sigue siendo la fuente de verdad; esto sirve para gates de UI y
// para rellenar clinic_id en inserts (defensa en profundidad).
export const getProfile = cache(async (): Promise<CurrentProfile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("clinic_id, role, full_name")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  return {
    userId: user.id,
    clinicId: profile.clinic_id,
    role: profile.role as Role,
    fullName: profile.full_name,
  };
});
