// Lógica PURA de límites/uso de almacenamiento (sin "server-only" ni dependencias
// de servidor), para poder testearla y reusarla. La consulta real a la base vive
// en lib/storage.ts (server-only), que re-exporta todo esto.

// Límites del free tier de Supabase (al 2026). Al superarlos el proyecto debe
// pasar a plan Pro. Se muestran en el panel para avisar con tiempo.
export const SUPABASE_FREE_DB_BYTES = 500 * 1024 ** 2; // 500 MB
export const SUPABASE_FREE_STORAGE_BYTES = 1024 ** 3; // 1 GB

// Free tier de Cloudflare R2 (donde viven las fotos de pacientes). Egress gratis,
// pero el almacenamiento se cobra pasados 10 GB.
export const R2_FREE_PHOTO_BYTES = 10 * 1024 ** 3; // 10 GB

// Umbrales de alerta de uso. warn = "vigilar", danger = "cerca del límite / pagar".
export const USAGE_WARN = 0.8; // 80%
export const USAGE_DANGER = 0.9; // 90%

export type UsageLevel = "ok" | "warn" | "danger";

// Nivel de uso de un recurso contra su límite. Lo comparten la barra de progreso
// y el banner de alerta del panel de superadmin para que el criterio sea único.
export function usageLevel(used: number, limit: number): UsageLevel {
  if (limit <= 0) return "ok";
  const ratio = used / limit;
  if (ratio >= USAGE_DANGER) return "danger";
  if (ratio >= USAGE_WARN) return "warn";
  return "ok";
}

// Formatea bytes a MB o GB legible.
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / 1024 ** 2;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}
