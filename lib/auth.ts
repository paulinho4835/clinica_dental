import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/rbac";

export interface CurrentProfile {
  userId: string;
  clinicId: string;
  role: Role;
  fullName: string;
}

export interface SessionClinic {
  id: string;
  name: string | null;
  features: unknown;
  active: boolean | null;
  currency: string | null;
}

export interface SessionRow {
  userId: string;
  clinicId: string;
  role: Role;
  fullName: string;
  active: boolean;
  termsAcceptedAt: string | null;
  termsAcceptedVersion: string | null;
  clinic: SessionClinic | null;
}

// Usuario autenticado (JWT verificado contra Supabase Auth). Cacheado por
// request: evita repetir ese round-trip cuando varios helpers de sesión
// (getProfile, isPlatformAdmin, getClinicFeatures, el layout del dashboard...)
// se llaman en el mismo render — antes eran hasta 5-6 llamadas independientes
// por navegación.
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

// Fila de sesión completa (perfil + clínica) en UNA sola query, cacheada por
// request. Antes cada helper de lib/superadmin.ts hacía su propia consulta a
// profiles/clinics con los mismos datos; ahora todos leen de aquí.
export const getSessionRow = cache(async (): Promise<SessionRow | null> => {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "clinic_id, role, full_name, active, terms_accepted_at, terms_accepted_version, clinics(id, name, features, active, currency)",
    )
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  return {
    userId: user.id,
    clinicId: profile.clinic_id,
    role: profile.role as Role,
    fullName: profile.full_name,
    active: profile.active ?? true,
    termsAcceptedAt: profile.terms_accepted_at,
    termsAcceptedVersion: profile.terms_accepted_version,
    clinic: profile.clinics as unknown as SessionClinic | null,
  };
});

// Perfil del usuario autenticado (clinic_id + rol). Cacheado por request.
// RLS sigue siendo la fuente de verdad; esto sirve para gates de UI y
// para rellenar clinic_id en inserts (defensa en profundidad).
export const getProfile = cache(async (): Promise<CurrentProfile | null> => {
  const session = await getSessionRow();
  if (!session) return null;
  return {
    userId: session.userId,
    clinicId: session.clinicId,
    role: session.role,
    fullName: session.fullName,
  };
});
