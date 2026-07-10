"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile, type CurrentProfile } from "@/lib/auth";
import { getClinicFeatures } from "@/lib/superadmin";

export type CampaignListItem = {
  id: string;
  name: string;
  message: string;
  createdAt: string;
  sentCount: number;
  totalPatients: number;
};

export type CreateCampaignState =
  | { ok: true; id: string }
  | { ok: false; error: string };

export type CampaignDetail = { id: string; name: string; message: string } | null;

export type CampaignPatientRow = {
  id: string;
  fullName: string;
  phone: string | null;
  sentAt: string | null;
};

export type SendState = { ok: true } | { ok: false; error: string };

// Roles que pueden ver/enviar campañas (mismo criterio que wa_masivo).
const CAMPAIGN_ROLES = new Set(["admin", "recepcionista", "colega"]);
// Solo el admin puede crear campañas; el resto solo las ve y envía mensajes.
const CAMPAIGN_CREATE_ROLES = new Set(["admin"]);

async function requireCampaignAccess(): Promise<
  { error: string } | { profile: CurrentProfile }
> {
  const [profile, features] = await Promise.all([getProfile(), getClinicFeatures()]);
  if (!profile) return { error: "Sesión expirada." };
  if (!features.campanas) return { error: "Módulo de campañas no habilitado." };
  if (!CAMPAIGN_ROLES.has(profile.role)) return { error: "Sin permiso para campañas." };
  return { profile };
}

// Cuenta cuántos pacientes de la clínica tienen teléfono registrado — el
// universo total contra el que se calcula el progreso de una campaña.
async function countPatientsWithPhone(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicId: string,
): Promise<number> {
  const { count } = await supabase
    .from("patients")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .not("phone", "is", null)
    .neq("phone", "");
  return count ?? 0;
}

export async function listCampaigns(): Promise<CampaignListItem[]> {
  const access = await requireCampaignAccess();
  if ("error" in access) return [];
  const { profile } = access;

  const supabase = await createClient();
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name, message, created_at")
    .eq("clinic_id", profile.clinicId)
    .order("created_at", { ascending: false });

  if (!campaigns || campaigns.length === 0) return [];

  const totalPatients = await countPatientsWithPhone(supabase, profile.clinicId);

  const results: CampaignListItem[] = [];
  for (const c of campaigns) {
    const { count } = await supabase
      .from("campaign_sends")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", c.id);
    results.push({
      id: c.id,
      name: c.name,
      message: c.message,
      createdAt: c.created_at,
      sentCount: count ?? 0,
      totalPatients,
    });
  }
  return results;
}

export async function createCampaign(
  name: string,
  message: string,
): Promise<CreateCampaignState> {
  const access = await requireCampaignAccess();
  if ("error" in access) return { ok: false, error: access.error };
  const { profile } = access;
  if (!CAMPAIGN_CREATE_ROLES.has(profile.role)) {
    return { ok: false, error: "Solo el administrador puede crear campañas." };
  }

  const trimmedName = name.trim();
  const trimmedMessage = message.trim();
  if (!trimmedName) return { ok: false, error: "El nombre de la campaña es requerido." };
  if (!trimmedMessage) return { ok: false, error: "El mensaje es requerido." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      clinic_id: profile.clinicId,
      name: trimmedName,
      message: trimmedMessage,
      created_by: profile.userId,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo crear la campaña." };

  revalidatePath("/campanas");
  return { ok: true, id: data.id };
}

export async function getCampaign(campaignId: string): Promise<CampaignDetail> {
  const access = await requireCampaignAccess();
  if ("error" in access) return null;
  const { profile } = access;

  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("id, name, message")
    .eq("id", campaignId)
    .eq("clinic_id", profile.clinicId)
    .maybeSingle();

  return data ?? null;
}

// Devuelve TODOS los pacientes de la clínica (con y sin teléfono). El
// llamador (página de detalle) separa por `phone` para mostrar a los que no
// tienen teléfono en una sección aparte, con aviso y sin botón de enviar —
// no se filtran aquí para que ese conteo quede visible en la UI.
export async function listPatientsForCampaign(
  campaignId: string,
): Promise<CampaignPatientRow[]> {
  const access = await requireCampaignAccess();
  if ("error" in access) return [];
  const { profile } = access;

  const supabase = await createClient();

  const { data: patients } = await supabase
    .from("patients")
    .select("id, full_name, phone")
    .eq("clinic_id", profile.clinicId)
    .order("full_name", { ascending: true });

  if (!patients || patients.length === 0) return [];

  const { data: sends } = await supabase
    .from("campaign_sends")
    .select("patient_id, sent_at")
    .eq("campaign_id", campaignId);

  const sentMap = new Map((sends ?? []).map((s) => [s.patient_id, s.sent_at]));

  return patients.map((p) => ({
    id: p.id,
    fullName: p.full_name,
    phone: p.phone,
    sentAt: sentMap.get(p.id) ?? null,
  }));
}

export async function markSent(campaignId: string, patientId: string): Promise<SendState> {
  const access = await requireCampaignAccess();
  if ("error" in access) return { ok: false, error: access.error };
  const { profile } = access;

  const supabase = await createClient();

  // Confirmar que la campaña pertenece a la clínica (defensa en profundidad).
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .eq("clinic_id", profile.clinicId)
    .maybeSingle();
  if (!campaign) return { ok: false, error: "Campaña no encontrada." };

  // Confirmar que el paciente pertenece a la clínica (defensa en profundidad).
  const { data: patient } = await supabase
    .from("patients")
    .select("id")
    .eq("id", patientId)
    .eq("clinic_id", profile.clinicId)
    .maybeSingle();
  if (!patient) return { ok: false, error: "Paciente no encontrado." };

  // Upsert idempotente: si dos pestañas marcan el mismo paciente casi a la
  // vez, la segunda no falla ni duplica la fila.
  const { error } = await supabase
    .from("campaign_sends")
    .upsert(
      { campaign_id: campaignId, patient_id: patientId, sent_by: profile.userId },
      { onConflict: "campaign_id,patient_id", ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/campanas/${campaignId}`);
  revalidatePath("/campanas");
  return { ok: true };
}

export async function unmarkSent(campaignId: string, patientId: string): Promise<SendState> {
  const access = await requireCampaignAccess();
  if ("error" in access) return { ok: false, error: access.error };
  const { profile } = access;

  const supabase = await createClient();

  // Confirmar que la campaña pertenece a la clínica (defensa en profundidad).
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .eq("clinic_id", profile.clinicId)
    .maybeSingle();
  if (!campaign) return { ok: false, error: "Campaña no encontrada." };

  const { error } = await supabase
    .from("campaign_sends")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("patient_id", patientId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/campanas/${campaignId}`);
  revalidatePath("/campanas");
  return { ok: true };
}
