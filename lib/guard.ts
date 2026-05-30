import { redirect } from "next/navigation";
import { getClinicFeatures } from "@/lib/superadmin";
import type { FeatureKey } from "@/lib/features";

// Bloquea el acceso directo (por URL) a un módulo apagado para la clínica.
// El menú ya lo oculta; esto cierra la puerta de entrar a mano a /caja, etc.
export async function requireFeature(key: FeatureKey) {
  const features = await getClinicFeatures();
  if (!features[key]) redirect("/ajustes");
}
