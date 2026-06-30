"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import {
  isR2Configured,
  presignUpload,
  deleteObject,
  headObjectSize,
} from "@/lib/r2";

// Subida del logo de la clínica a R2. Mismo flujo que las fotos de pacientes
// (presign PUT directo del navegador → registrar la referencia), pero a nivel
// clínica: el binario vive bajo {clinicId}/branding/ y la referencia se guarda en
// clinics.logo_storage_key.

const ALLOWED_TYPES = ["image/webp", "image/png", "image/jpeg", "image/svg+xml"];
// Tope de peso. El front comprime a ~150 KB; esto es el techo de seguridad por si
// alguien sube saltándose la compresión (la URL firmada de PUT no limita tamaño).
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const EXT: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
};

export type LogoUploadState =
  | { ok: true; uploadUrl: string; key: string }
  | { ok: false; error: string };

export type LogoActionState = { ok?: boolean; error?: string };

// Paso 1: el navegador pide una URL firmada para subir el logo directo a R2.
export async function requestLogoUpload(
  contentType: string,
): Promise<LogoUploadState> {
  const profile = await getProfile();
  if (!profile) return { ok: false, error: "Sesión expirada." };
  if (!can(profile.role, "settings:write"))
    return { ok: false, error: "Sin permiso para cambiar el logo." };
  if (!isR2Configured())
    return { ok: false, error: "El almacenamiento no está configurado." };
  if (!ALLOWED_TYPES.includes(contentType))
    return { ok: false, error: "Formato no permitido (usa PNG, JPG, WebP o SVG)." };

  // Path con aislamiento por clínica: {clinicId}/branding/logo-{uuid}.ext
  const key = `${profile.clinicId}/branding/logo-${randomUUID()}.${EXT[contentType]}`;
  const uploadUrl = await presignUpload(key, contentType);
  return { ok: true, uploadUrl, key };
}

// Paso 2: tras subir el binario, se valida el peso REAL y se guarda la referencia,
// borrando el logo anterior si lo había (no dejar objetos huérfanos).
export async function registerLogo(key: string): Promise<LogoActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "settings:write")) return { error: "Sin permiso." };

  // El key debe pertenecer a la carpeta de branding de ESTA clínica.
  if (!key.startsWith(`${profile.clinicId}/branding/`))
    return { error: "Referencia de archivo inválida." };

  // Validar el peso real subido. Si excede o no existe, se borra y se rechaza.
  const realSize = await headObjectSize(key);
  if (realSize === null) return { error: "No se encontró el logo subido." };
  if (realSize > MAX_LOGO_BYTES) {
    await deleteObject(key).catch(() => {});
    return { error: "El logo supera el tamaño máximo permitido (2 MB)." };
  }

  const supabase = await createClient();
  const { data: prev } = await supabase
    .from("clinics")
    .select("logo_storage_key")
    .eq("id", profile.clinicId)
    .single();

  const { error } = await supabase
    .from("clinics")
    .update({ logo_storage_key: key })
    .eq("id", profile.clinicId);
  if (error) return { error: error.message };

  // Borrar el logo anterior de R2 (si existía y es distinto) para no acumular.
  const oldKey = prev?.logo_storage_key as string | null;
  if (oldKey && oldKey !== key && isR2Configured()) {
    await deleteObject(oldKey).catch(() => {});
  }

  revalidatePath("/ajustes");
  return { ok: true };
}

// Quitar el logo: borra el objeto de R2 y limpia la referencia.
export async function removeLogo(): Promise<LogoActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "settings:write")) return { error: "Sin permiso." };

  const supabase = await createClient();
  const { data } = await supabase
    .from("clinics")
    .select("logo_storage_key")
    .eq("id", profile.clinicId)
    .single();

  const key = data?.logo_storage_key as string | null;
  if (key && isR2Configured()) {
    await deleteObject(key).catch(() => {});
  }

  const { error } = await supabase
    .from("clinics")
    .update({ logo_storage_key: null })
    .eq("id", profile.clinicId);
  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return { ok: true };
}
