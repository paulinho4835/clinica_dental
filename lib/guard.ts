import { redirect } from "next/navigation";
import { getClinicFeatures } from "@/lib/superadmin";
import type { FeatureKey } from "@/lib/features";
import { getProfile } from "@/lib/auth";
import { canSeeNav } from "@/lib/rbac";

// Bloquea el acceso directo (por URL) a un módulo apagado para la clínica.
// El menú ya lo oculta; esto cierra la puerta de entrar a mano a /caja, etc.
export async function requireFeature(key: FeatureKey) {
  const features = await getClinicFeatures();
  if (!features[key]) redirect("/ajustes");
}

// Verifica feature habilitada Y que el rol del usuario pueda ver ese módulo.
// Usar en lugar de requireFeature() para módulos con restricción por rol.
export async function requireNavAccess(key: FeatureKey) {
  const [features, profile] = await Promise.all([getClinicFeatures(), getProfile()]);
  if (!features[key] || !canSeeNav(profile?.role, key)) redirect("/agenda");
}
