"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { getClinicFeatures } from "@/lib/superadmin";

const EDIT_ROLES = new Set(["admin", "recepcionista"]);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type NewBlock = {
  dentistId: string;
  mode: "weekly" | "dated";
  weekday?: number; // requerido si weekly (0=lunes)
  dateFrom?: string; // requeridos si dated
  dateTo?: string;
  startTime: string; // "HH:MM"
  endTime: string;
  reason?: string;
};

async function guard() {
  const [profile, features] = await Promise.all([getProfile(), getClinicFeatures()]);
  if (!profile || !EDIT_ROLES.has(profile.role)) return { error: "Sin permisos." as const };
  if (!features.disponibilidad)
    return { error: "El módulo de disponibilidad no está habilitado." as const };
  return { profile };
}

export async function createAvailabilityBlock(
  input: NewBlock,
): Promise<{ ok?: true; error?: string }> {
  const g = await guard();
  if ("error" in g) return g;

  if (!TIME_RE.test(input.startTime) || !TIME_RE.test(input.endTime))
    return { error: "Horario inválido." };
  if (input.endTime <= input.startTime)
    return { error: "La hora fin debe ser mayor que la de inicio." };

  const row: Record<string, unknown> = {
    clinic_id: g.profile.clinicId,
    dentist_id: input.dentistId,
    start_time: input.startTime,
    end_time: input.endTime,
    reason: input.reason?.trim() || null,
    created_by: g.profile.userId,
  };

  if (input.mode === "weekly") {
    if (input.weekday == null || input.weekday < 0 || input.weekday > 6)
      return { error: "Día de semana inválido." };
    row.weekday = input.weekday;
  } else {
    if (!DATE_RE.test(input.dateFrom ?? "") || !DATE_RE.test(input.dateTo ?? ""))
      return { error: "Fechas inválidas." };
    if ((input.dateTo ?? "") < (input.dateFrom ?? ""))
      return { error: "La fecha fin debe ser igual o posterior a la de inicio." };
    row.date_from = input.dateFrom;
    row.date_to = input.dateTo;
  }

  const supabase = await createClient();
  // El doctor debe ser de la clínica (defensa además de RLS + FK).
  const { data: doc } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", input.dentistId)
    .eq("clinic_id", g.profile.clinicId)
    .single();
  if (!doc) return { error: "Doctor no encontrado." };

  const { error } = await supabase.from("doctor_availability").insert(row);
  if (error) return { error: "No se pudo guardar. Intenta de nuevo." };

  revalidatePath("/disponibilidad");
  revalidatePath("/agenda");
  return { ok: true };
}

export async function deleteAvailabilityBlock(
  id: string,
): Promise<{ ok?: true; error?: string }> {
  const g = await guard();
  if ("error" in g) return g;

  const supabase = await createClient();
  const { error } = await supabase
    .from("doctor_availability")
    .delete()
    .eq("id", id)
    .eq("clinic_id", g.profile.clinicId);
  if (error) return { error: "No se pudo eliminar." };

  revalidatePath("/disponibilidad");
  revalidatePath("/agenda");
  return { ok: true };
}
