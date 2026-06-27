import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================================
// Uso de almacenamiento de Supabase (base de datos + Storage) para el panel de
// superadmin. Sirve para anticipar cuándo el proyecto superará el free tier y
// habrá que pasar al plan Pro (de pago). Las fotos de pacientes NO cuentan aquí:
// viven en Cloudflare R2 (ver lib/r2.ts), se miden aparte.
//
// La lógica pura (límites, niveles de alerta, formato) vive en ./storageLimits
// para poder testearla sin "server-only"; se re-exporta para no cambiar imports.
// ============================================================================

export * from "@/lib/storageLimits";

export type StorageStats = {
  databaseBytes: number;
  storageBytes: number;
};

// Lee el tamaño real de la base y del Storage vía la función SQL
// platform_storage_stats(). Devuelve null si la migración aún no se aplicó en
// producción (la función no existe) o si falla, para que el panel no reviente.
export async function getSupabaseStorageStats(): Promise<StorageStats | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("platform_storage_stats");
  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    databaseBytes: Number(row.database_bytes) || 0,
    storageBytes: Number(row.storage_bytes) || 0,
  };
}
