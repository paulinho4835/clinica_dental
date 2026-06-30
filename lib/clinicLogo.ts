import "server-only";
import { createClient } from "@/lib/supabase/server";
import { normalizeFeatures } from "@/lib/features";
import { isR2Configured, presignDownload } from "@/lib/r2";

// Resuelve la URL del logo a mostrar en un documento impreso de la clínica, o
// null si no hay logo. Pensado para llamarse desde las páginas de impresión
// (server components): genera una URL firmada FRESCA en cada render, por lo que
// el bucket privado de R2 no es problema (la URL expira en minutos, pero el
// documento ya quedó renderizado).
//
// Prioridad:
//   1) Logo SUBIDO a R2 (addon "logo" encendido + logo_storage_key) → URL firmada.
//   2) URL pública pegada a mano en `logo_url` (addon "perfil") → tal cual.
//      Se mantiene como compatibilidad: clínicas que ya pegaron una URL siguen
//      viéndola sin necesidad del addon nuevo.
export async function getClinicLogoUrl(clinicId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clinics")
    .select("features, logo_storage_key, logo_url")
    .eq("id", clinicId)
    .single();
  if (!data) return null;

  const features = normalizeFeatures(data.features);

  if (features.logo && data.logo_storage_key && isR2Configured()) {
    try {
      return await presignDownload(data.logo_storage_key as string, 600);
    } catch {
      // Si falla la firma, caemos al logo_url manual si existe.
    }
  }

  return (data.logo_url as string | null) ?? null;
}
