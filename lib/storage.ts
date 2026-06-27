import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================================
// Uso de almacenamiento de Supabase (base de datos + Storage) para el panel de
// superadmin. Sirve para anticipar cuándo el proyecto superará el free tier y
// habrá que pasar al plan Pro (de pago). Las fotos de pacientes NO cuentan aquí:
// viven en Cloudflare R2 (ver lib/r2.ts), se miden aparte.
// ============================================================================

// Límites del free tier de Supabase (al 2026). Al superarlos el proyecto debe
// pasar a plan Pro. Se muestran en el panel para avisar con tiempo.
export const SUPABASE_FREE_DB_BYTES = 500 * 1024 ** 2; // 500 MB
export const SUPABASE_FREE_STORAGE_BYTES = 1024 ** 3; // 1 GB

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

// Formatea bytes a MB o GB legible (es-BO usa coma decimal, pero aquí basta el
// punto para no complicar; los números son chicos).
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / 1024 ** 2;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}
