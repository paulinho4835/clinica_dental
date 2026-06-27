"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { getClinicPhotoQuota } from "@/lib/superadmin";
import { isR2Configured, presignUpload, deleteObject, headObjectSize } from "@/lib/r2";

// Solo el personal clínico gestiona fotos (no recepción). Mismo criterio que el
// resto del registro clínico: admin, doctores y colega.
function canManage(role?: string): boolean {
  return ["admin", "odontologo_general", "especialista", "colega"].includes(role ?? "");
}

const ALLOWED_TYPES = ["image/webp", "image/jpeg", "image/png"];
const KINDS = ["intraoral", "radiografia", "antes", "despues", "otro"];
// Tope de peso por foto. El front comprime a ~300 KB; esto es el techo de
// seguridad por si alguien sube saltándose la compresión (la URL firmada de PUT
// no limita tamaño). 6 MB deja margen para radiografías sin permitir abusos.
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

export type PhotoUploadState =
  | { ok: true; uploadUrl: string; key: string }
  | { ok: false; error: string };

// Paso 1: el navegador pide una URL firmada para subir directo a R2 (el binario
// NO pasa por el servidor). Devuelve también el `key` que luego registra.
export async function requestPhotoUpload(
  patientId: string,
  contentType: string,
): Promise<PhotoUploadState> {
  const profile = await getProfile();
  if (!profile) return { ok: false, error: "Sesión expirada." };
  if (!canManage(profile.role))
    return { ok: false, error: "Sin permiso para subir fotos." };
  if (!isR2Configured())
    return { ok: false, error: "El almacenamiento de fotos no está configurado." };
  if (!ALLOWED_TYPES.includes(contentType))
    return { ok: false, error: "Formato no permitido (usa JPG, PNG o WebP)." };

  const quota = await getClinicPhotoQuota();
  if (quota <= 0)
    return { ok: false, error: "El módulo de fotos no está habilitado para esta clínica." };

  const supabase = await createClient();
  const { data: patient } = await supabase
    .from("patients")
    .select("id")
    .eq("id", patientId)
    .eq("clinic_id", profile.clinicId)
    .maybeSingle();
  if (!patient) return { ok: false, error: "Paciente no encontrado." };

  // Tope POR CLÍNICA. Se valida ANTES de firmar la URL para no dejar objetos
  // huérfanos en R2 si se excede el tope.
  const { count } = await supabase
    .from("patient_photos")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", profile.clinicId);
  if ((count ?? 0) >= quota)
    return {
      ok: false,
      error: "Tope de fotos de la clínica alcanzado. Contacta al administrador para ampliarlo.",
    };

  const ext =
    contentType === "image/webp" ? "webp" : contentType === "image/png" ? "png" : "jpg";
  // Path con aislamiento por clínica/paciente: {clinic_id}/{patient_id}/{uuid}.ext
  const key = `${profile.clinicId}/${patientId}/${randomUUID()}.${ext}`;
  const uploadUrl = await presignUpload(key, contentType);
  return { ok: true, uploadUrl, key };
}

export type PhotoActionState = { ok?: boolean; error?: string };

// Paso 2: tras subir el binario a R2, se registra la referencia + metadatos.
export async function registerPhoto(input: {
  patientId: string;
  key: string;
  kind?: string;
  caption?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  takenAt?: string;
}): Promise<PhotoActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!canManage(profile.role)) return { error: "Sin permiso." };

  const supabase = await createClient();
  const { data: patient } = await supabase
    .from("patients")
    .select("id")
    .eq("id", input.patientId)
    .eq("clinic_id", profile.clinicId)
    .maybeSingle();
  if (!patient) return { error: "Paciente no encontrado." };

  // El key debe pertenecer al path de esta clínica/paciente (evita registrar un
  // objeto ajeno).
  if (!input.key.startsWith(`${profile.clinicId}/${input.patientId}/`))
    return { error: "Referencia de archivo inválida." };

  // Validar el peso REAL subido (no el reportado por el cliente). Si excede el
  // tope o no existe, se borra el objeto y se rechaza: así un PUT gigante a la
  // URL firmada no queda almacenado ni registrado.
  const realSize = await headObjectSize(input.key);
  if (realSize === null) return { error: "No se encontró la imagen subida." };
  if (realSize > MAX_PHOTO_BYTES) {
    await deleteObject(input.key).catch(() => {});
    return { error: "La imagen supera el tamaño máximo permitido (6 MB)." };
  }

  const kind = KINDS.includes(input.kind ?? "") ? input.kind : null;

  const { error } = await supabase.from("patient_photos").insert({
    clinic_id: profile.clinicId,
    patient_id: input.patientId,
    storage_key: input.key,
    kind,
    caption: input.caption?.trim().slice(0, 200) || null,
    width: input.width ?? null,
    height: input.height ?? null,
    size_bytes: realSize,
    taken_at: input.takenAt || null,
    uploaded_by: profile.userId,
  });
  if (error) return { error: error.message };

  revalidatePath(`/pacientes/${input.patientId}`);
  return { ok: true };
}

// Editar la etiqueta (kind) y/o la descripción (caption) de una foto ya subida.
export async function updatePhotoMeta(input: {
  photoId: string;
  kind?: string;
  caption?: string;
}): Promise<PhotoActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!canManage(profile.role)) return { error: "Sin permiso." };

  const supabase = await createClient();
  const { data: photo } = await supabase
    .from("patient_photos")
    .select("id, patient_id, clinic_id")
    .eq("id", input.photoId)
    .maybeSingle();
  if (!photo || photo.clinic_id !== profile.clinicId)
    return { error: "Foto no encontrada." };

  const kind = KINDS.includes(input.kind ?? "") ? input.kind : null;

  const { error } = await supabase
    .from("patient_photos")
    .update({
      kind,
      caption: input.caption?.trim().slice(0, 200) || null,
    })
    .eq("id", input.photoId)
    .eq("clinic_id", profile.clinicId);
  if (error) return { error: error.message };

  revalidatePath(`/pacientes/${photo.patient_id}`);
  return { ok: true };
}

export async function deletePhoto(photoId: string): Promise<PhotoActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!canManage(profile.role)) return { error: "Sin permiso." };

  const supabase = await createClient();
  const { data: photo } = await supabase
    .from("patient_photos")
    .select("id, patient_id, storage_key, clinic_id")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo || photo.clinic_id !== profile.clinicId)
    return { error: "Foto no encontrada." };

  // Borra el objeto en R2 primero; si falla, igual quitamos la referencia para
  // no dejar una foto rota visible.
  if (isR2Configured()) {
    try {
      await deleteObject(photo.storage_key);
    } catch {
      /* ignoramos: seguimos borrando la fila */
    }
  }

  const { error } = await supabase.from("patient_photos").delete().eq("id", photoId);
  if (error) return { error: error.message };

  revalidatePath(`/pacientes/${photo.patient_id}`);
  return { ok: true };
}
