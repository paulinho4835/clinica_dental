"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can, canEditAnamnesis, isReceptionistLike } from "@/lib/rbac";
import { AnamnesisSchema, parseAnamnesis } from "@/lib/schemas/anamnesis";
import { PatientIntakeSchema } from "@/lib/schemas/patient-intake";

export type InvitationState =
  | { ok: true; url: string }
  | { ok: false; error: string };

export type ReviewState = { ok?: boolean; error?: string; patientId?: string };

// Días de validez del enlace. Suficiente para que el paciente lo complete
// con calma sin dejar tokens vivos para siempre.
const EXPIRES_DAYS = 7;

function buildToken(): string {
  // 32 bytes en base64url → ~43 chars, imposible de adivinar.
  return randomBytes(32).toString("base64url");
}

// Genera (o reutiliza) una invitación de historial para el paciente y devuelve
// la URL pública. El enlace se entrega manualmente (copiar / WhatsApp): no envía
// nada por sí solo.
//
// Por defecto reutiliza la invitación pendiente vigente (no completada, no
// expirada) para no dejar tokens huérfanos cada vez que se abre el modal.
// Con `force = true` (regenerar) borra las pendientes y crea una nueva, lo que
// invalida cualquier enlace anterior aún no usado.
export async function createAnamnesisInvitation(
  patientId: string,
  force = false,
): Promise<InvitationState> {
  const profile = await getProfile();
  if (!profile) return { ok: false, error: "Sesión expirada." };
  if (!canEditAnamnesis(profile.role))
    return { ok: false, error: "Sin permiso para solicitar el historial." };

  const supabase = await createClient();

  // Confirmar que el paciente pertenece a la clínica del usuario (defensa en
  // profundidad además de RLS).
  const { data: patient } = await supabase
    .from("patients")
    .select("id")
    .eq("id", patientId)
    .eq("clinic_id", profile.clinicId)
    .maybeSingle();
  if (!patient) return { ok: false, error: "Paciente no encontrado." };

  const nowIso = new Date().toISOString();

  if (force) {
    // Regenerar: invalidar enlaces pendientes (no completados) borrándolos.
    await supabase
      .from("anamnesis_invitations")
      .delete()
      .eq("patient_id", patientId)
      .is("completed_at", null);
  } else {
    // Reutilizar la invitación pendiente vigente si existe.
    const { data: existing } = await supabase
      .from("anamnesis_invitations")
      .select("token")
      .eq("patient_id", patientId)
      .is("completed_at", null)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.token) return { ok: true, url: `/h/${existing.token}` };
  }

  const token = buildToken();
  const expiresAt = new Date(
    Date.now() + EXPIRES_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error } = await supabase.from("anamnesis_invitations").insert({
    token,
    patient_id: patientId,
    clinic_id: profile.clinicId,
    created_by: profile.userId,
    expires_at: expiresAt,
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true, url: `/h/${token}` };
}

// Crea una invitación de ALTA: la clínica solo aporta el celular (y nombre
// opcional); el paciente llena el resto. El paciente se crea al aprobar.
export async function createPatientIntakeInvitation(input: {
  phone: string;
  name?: string;
}): Promise<InvitationState> {
  const profile = await getProfile();
  if (!profile) return { ok: false, error: "Sesión expirada." };
  // Solo admin y recepción envían el registro por WhatsApp (son quienes
  // manejan el teléfono del paciente; los doctores no ven ese dato).
  if (profile.role !== "admin" && !isReceptionistLike(profile.role))
    return { ok: false, error: "Sin permiso para enviar registros de pacientes." };

  const phone = input.phone?.trim() ?? "";
  if (!phone) return { ok: false, error: "Ingresa el celular del paciente." };

  const token = buildToken();
  const expiresAt = new Date(
    Date.now() + EXPIRES_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const supabase = await createClient();
  const { error } = await supabase.from("anamnesis_invitations").insert({
    token,
    kind: "new",
    patient_id: null,
    clinic_id: profile.clinicId,
    created_by: profile.userId,
    expires_at: expiresAt,
    contact_phone: phone,
    contact_name: input.name?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true, url: `/h/${token}` };
}

// Aplica la propuesta enviada por el paciente. Para 'existing' actualiza el
// expediente; para 'new' CREA el paciente con los datos personales + historial.
export async function applyAnamnesisInvitation(
  invitationId: string,
): Promise<ReviewState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };

  const supabase = await createClient();

  const { data: invite } = await supabase
    .from("anamnesis_invitations")
    .select(
      "id, kind, patient_id, clinic_id, completed_at, reviewed_at, submitted_data, submitted_personal, submitted_allergies, submitted_alerts",
    )
    .eq("id", invitationId)
    .maybeSingle();

  if (!invite) return { error: "Solicitud no encontrada." };
  if (!invite.completed_at)
    return { error: "El paciente aún no envió sus datos." };
  if (invite.reviewed_at) return { error: "Esta solicitud ya fue revisada." };

  const isNew = invite.kind === "new";
  const allowed = isNew
    ? can(profile.role, "patients:write")
    : canEditAnamnesis(profile.role);
  if (!allowed) return { error: "Sin permiso para aprobar esta solicitud." };

  const parsed = AnamnesisSchema.safeParse(invite.submitted_data);
  if (!parsed.success) return { error: "La propuesta tiene datos inválidos." };

  const anamnesis = {
    ...parseAnamnesis(parsed.data),
    actualizado_por: profile.fullName ?? "",
    actualizado_en: new Date().toISOString(),
  };
  const allergies = (invite.submitted_allergies as string[] | null) ?? [];
  const alerts = (invite.submitted_alerts as string[] | null) ?? [];

  let patientId = invite.patient_id as string | null;

  if (isNew) {
    const person = PatientIntakeSchema.safeParse(invite.submitted_personal);
    if (!person.success)
      return { error: "Los datos personales del paciente son inválidos." };
    const p = person.data;

    // Evitar duplicados por C.I. dentro de la clínica.
    if (p.national_id) {
      const { data: dup } = await supabase
        .from("patients")
        .select("id")
        .eq("clinic_id", profile.clinicId)
        .eq("national_id", p.national_id)
        .maybeSingle();
      if (dup)
        return {
          error: `Ya existe un paciente con C.I. ${p.national_id}. Revísalo manualmente.`,
        };
    }

    // Evitar duplicados por celular: un número = un paciente (si es un familiar
    // que comparte teléfono, regístralo a mano desde "Nuevo paciente").
    if (p.phone) {
      const { data: dupPhone } = await supabase
        .from("patients")
        .select("full_name")
        .eq("clinic_id", profile.clinicId)
        .eq("phone", p.phone)
        .limit(1)
        .maybeSingle();
      if (dupPhone)
        return {
          error: `El celular ${p.phone} ya pertenece a ${dupPhone.full_name}. Revísalo manualmente antes de crear otra ficha con ese número.`,
        };
    }

    const { data: created, error: createError } = await supabase
      .from("patients")
      .insert({
        clinic_id: profile.clinicId,
        full_name: p.full_name,
        national_id: p.national_id || null,
        dob: p.dob || null,
        sex: p.sex || null,
        phone: p.phone || null,
        email: p.email || null,
        address: p.address || null,
        anamnesis_data: anamnesis,
        allergies,
        medical_alerts: alerts,
      })
      .select("id")
      .single();
    if (createError || !created)
      return { error: createError?.message ?? "No se pudo crear el paciente." };
    patientId = created.id;

    // Vincular las citas futuras que quedaron sin ficha (agendadas por el
    // Asistente Virtual antes de esta aprobación) para que recordatorios y
    // agenda apunten a la ficha recién creada. Coincidencia por nombre exacto
    // (ilike sin comodines = igualdad sin distinguir mayúsculas).
    await supabase
      .from("appointments")
      .update({ patient_id: patientId })
      .eq("clinic_id", profile.clinicId)
      .is("patient_id", null)
      .ilike("patient_name", p.full_name)
      .gte("starts_at", new Date().toISOString());
  } else {
    if (!patientId) return { error: "La solicitud no tiene paciente asociado." };
    const { error: patientError } = await supabase
      .from("patients")
      .update({
        anamnesis_data: anamnesis,
        allergies,
        medical_alerts: alerts,
      })
      .eq("id", patientId)
      .eq("clinic_id", profile.clinicId);
    if (patientError) return { error: patientError.message };
  }

  const { error: reviewError } = await supabase
    .from("anamnesis_invitations")
    .update({
      reviewed_at: new Date().toISOString(),
      review_action: "applied",
      patient_id: patientId,
    })
    .eq("id", invite.id);
  if (reviewError) return { error: reviewError.message };

  revalidatePath("/pacientes");
  if (patientId) revalidatePath(`/pacientes/${patientId}`);
  return { ok: true, patientId: patientId ?? undefined };
}

// Elimina un enlace de alta PENDIENTE (el paciente nunca lo completó). Borra la
// fila, con lo que el enlace /h/<token> queda invalidado al instante. No aplica
// a solicitudes ya completadas: esas se resuelven con Revisar → aplicar/descartar.
export async function deletePendingIntakeInvitation(
  invitationId: string,
): Promise<ReviewState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "patients:write"))
    return { error: "Sin permiso para eliminar este registro." };

  const supabase = await createClient();

  const { data: invite } = await supabase
    .from("anamnesis_invitations")
    .select("id, kind, completed_at")
    .eq("id", invitationId)
    .eq("clinic_id", profile.clinicId)
    .maybeSingle();

  if (!invite) return { error: "Registro no encontrado." };
  if (invite.kind !== "new")
    return { error: "Este enlace pertenece a un paciente existente." };
  if (invite.completed_at)
    return { error: "El paciente ya completó este registro: revísalo en la lista." };

  const { error } = await supabase
    .from("anamnesis_invitations")
    .delete()
    .eq("id", invite.id)
    .eq("clinic_id", profile.clinicId);
  if (error) return { error: error.message };

  revalidatePath("/pacientes");
  return { ok: true };
}

// Descarta la propuesta del paciente sin crear/actualizar nada.
export async function discardAnamnesisInvitation(
  invitationId: string,
): Promise<ReviewState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };

  const supabase = await createClient();

  const { data: invite } = await supabase
    .from("anamnesis_invitations")
    .select("id, kind, patient_id, reviewed_at")
    .eq("id", invitationId)
    .maybeSingle();

  if (!invite) return { error: "Solicitud no encontrada." };
  if (invite.reviewed_at) return { error: "Esta solicitud ya fue revisada." };

  const allowed =
    invite.kind === "new"
      ? can(profile.role, "patients:write")
      : canEditAnamnesis(profile.role);
  if (!allowed) return { error: "Sin permiso para descartar esta solicitud." };

  const { error } = await supabase
    .from("anamnesis_invitations")
    .update({ reviewed_at: new Date().toISOString(), review_action: "discarded" })
    .eq("id", invite.id);
  if (error) return { error: error.message };

  revalidatePath("/pacientes");
  if (invite.patient_id) revalidatePath(`/pacientes/${invite.patient_id}`);
  return { ok: true };
}
