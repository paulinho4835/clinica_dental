"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";

export type ActionState = { error?: string; ok?: boolean };

const ApptSchema = z.object({
  patient_id: z.string().uuid("Paciente requerido"),
  dentist_id: z.string().uuid("Odontólogo requerido"),
  operatory_id: z.string().uuid().optional().nullable(),
  starts_at: z.string().min(1, "Hora requerida"),
  duration_min: z.coerce.number().int().min(5).max(480).default(30),
  reason: z.string().optional().nullable(),
  overbooked: z.boolean().default(false),
});

export async function createAppointment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "appointments:write"))
    return { error: "Sin permiso para agendar." };

  const parsed = ApptSchema.safeParse({
    patient_id: formData.get("patient_id"),
    dentist_id: formData.get("dentist_id"),
    operatory_id: formData.get("operatory_id") || null,
    starts_at: formData.get("starts_at"),
    duration_min: formData.get("duration_min") || 30,
    reason: formData.get("reason") || null,
    overbooked: formData.get("overbooked") === "on",
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const starts = new Date(parsed.data.starts_at);
  const ends = new Date(starts.getTime() + parsed.data.duration_min * 60_000);

  const supabase = await createClient();

  // Detección de solapamiento para el mismo odontólogo (a menos que sea sobre-cupo explícito).
  if (!parsed.data.overbooked) {
    const { data: clash } = await supabase
      .from("appointments")
      .select("id")
      .eq("dentist_id", parsed.data.dentist_id)
      .neq("status", "cancelled")
      .lt("starts_at", ends.toISOString())
      .gt("ends_at", starts.toISOString())
      .limit(1);
    if (clash && clash.length > 0)
      return { error: "El odontólogo ya tiene una cita en ese horario. Marca sobre-cupo para forzar." };
  }

  const { error } = await supabase.from("appointments").insert({
    clinic_id: profile.clinicId,
    patient_id: parsed.data.patient_id,
    dentist_id: parsed.data.dentist_id,
    operatory_id: parsed.data.operatory_id,
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    reason: parsed.data.reason,
    overbooked: parsed.data.overbooked,
  });
  if (error) return { error: error.message };

  revalidatePath("/agenda");
  return { ok: true };
}

const STATUSES = [
  "scheduled", "confirmed", "waiting", "in_chair", "finished", "cancelled", "no_show",
] as const;

export async function setAppointmentStatus(id: string, status: string): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "appointments:write"))
    return { error: "Sin permiso." };
  if (!STATUSES.includes(status as (typeof STATUSES)[number]))
    return { error: "Estado inválido." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", id); // RLS limita a la clínica del usuario
  if (error) return { error: error.message };

  revalidatePath("/agenda");
  return { ok: true };
}
