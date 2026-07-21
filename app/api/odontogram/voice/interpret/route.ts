import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { canEditAnamnesis } from "@/lib/rbac";
import { getClinicFeatures } from "@/lib/superadmin";
import { withinClinicalHours } from "@/lib/clinicalHours";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, tooManyRequestsMessage } from "@/lib/ratelimit";
import { interpretOdontogramVoice } from "@/lib/odontogram/voice-interpretation";
import { transcribeOdontogramAudio } from "@/lib/odontogram/voice-transcription";
import { validateVoiceOperations, type Dentition } from "@/lib/odontogram/voice";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DURATION_MS = 60_000;
const ALLOWED_AUDIO = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"]);
const noStore = { "Cache-Control": "no-store" };

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: noStore });
}

export async function POST(request: Request) {
  const profile = await getProfile();
  if (!profile || !canEditAnamnesis(profile.role)) return error("No tienes permiso para dictar cambios.", 403);
  const features = await getClinicFeatures();
  if (!features.odontogram_dictado_voz) return error("El dictado por voz no está habilitado para esta clínica.", 403);

  const supabase = await createClient();
  if (profile.role !== "admin" && features.bloqueo_horario) {
    const { data: clinic } = await supabase.from("clinics").select("settings").eq("id", profile.clinicId).single();
    if (!withinClinicalHours(clinic?.settings)) return error("Fuera del horario de edición permitido.", 403);
  }
  const limit = await checkRateLimit("odontogram-voice", `${profile.clinicId}:${profile.userId}`);
  if (!limit.ok) return NextResponse.json({ error: tooManyRequestsMessage(limit.retryAfterSeconds) }, { status: 429, headers: { ...noStore, "Retry-After": String(limit.retryAfterSeconds) } });

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data")) return error("Formato de solicitud inválido.", 415);
  let form: FormData;
  try { form = await request.formData(); } catch { return error("Audio inválido.", 400); }
  const audio = form.get("audio");
  const patientId = form.get("patientId");
  const durationMs = Number(form.get("durationMs"));
  if (!(audio instanceof Blob) || typeof patientId !== "string" || !patientId) return error("Faltan datos del dictado.", 400);
  if (!ALLOWED_AUDIO.has(audio.type) || audio.size === 0 || audio.size > MAX_BYTES || !Number.isFinite(durationMs) || durationMs < 1 || durationMs > MAX_DURATION_MS) return error("El audio debe ser válido, durar hasta 60 segundos y pesar hasta 5 MB.", 400);

  const { data: patient } = await supabase.from("patients").select("id").eq("id", patientId).eq("clinic_id", profile.clinicId).maybeSingle();
  if (!patient) return error("Paciente no encontrado.", 404);
  try {
    const transcript = await transcribeOdontogramAudio(audio);
    if (transcript.trim().length < 2) return error("No se detectó texto útil. Intenta nuevamente.", 422);
    const interpreted = await interpretOdontogramVoice(transcript, "permanent" as Dentition);
    const validated = validateVoiceOperations(interpreted.operations, "permanent");
    const operations = validated.filter((item): item is Extract<typeof item, { valid: true }> => item.valid).map((item) => item.operation);
    const warnings = validated.filter((item) => !item.valid).map((item) => item.reason);
    return NextResponse.json({ transcript, operations, uncertainties: interpreted.uncertainties, warnings }, { headers: noStore });
  } catch {
    // Nunca registrar audio ni transcript: solo un error genérico recuperable.
    return error("No se pudo interpretar el dictado. Intenta nuevamente.", 502);
  }
}
