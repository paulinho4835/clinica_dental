"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { withinClinicalHours } from "@/lib/clinicalHours";
import { getClinicFeatures } from "@/lib/superadmin";
import type { TeethMap } from "@/lib/odontogram/types";

export type ActionState = { error?: string; ok?: boolean };

// Mismos roles que el odontograma de adultos (NO recepcionista).
const ODONTOGRAM_ROLES = ["admin", "odontologo_general", "especialista", "colega"] as const;
function canEditOdontogram(role: string | undefined): boolean {
  return ODONTOGRAM_ROLES.includes(role as (typeof ODONTOGRAM_ROLES)[number]);
}

const SURFACES = ["O", "M", "D", "V", "L"] as const;

type EventRow = {
  clinic_id: string;
  patient_id: string;
  tooth_fdi: string;
  surface: string | null;
  prev_state: string | null;
  new_state: string | null;
  actor_id: string;
};

// Compara estado previo vs nuevo y produce un evento por cada cambio
// (cara o diente completo) -> log inmutable de auditoría.
function diffTeeth(
  prev: TeethMap,
  next: TeethMap,
  base: Omit<EventRow, "tooth_fdi" | "surface" | "prev_state" | "new_state">,
): EventRow[] {
  const events: EventRow[] = [];
  const fdis = new Set([...Object.keys(prev), ...Object.keys(next)]);

  for (const fdi of fdis) {
    const a = prev[fdi];
    const b = next[fdi];

    const aWhole = a?.whole ?? null;
    const bWhole = b?.whole ?? null;
    if (aWhole !== bWhole) {
      events.push({ ...base, tooth_fdi: fdi, surface: null, prev_state: aWhole, new_state: bWhole });
    }

    for (const s of SURFACES) {
      const aS = a?.surfaces?.[s] ?? null;
      const bS = b?.surfaces?.[s] ?? null;
      if (aS !== bS) {
        events.push({ ...base, tooth_fdi: fdi, surface: s, prev_state: aS, new_state: bS });
      }
    }
  }
  return events;
}

export async function savePediatricOdontogram(
  patientId: string,
  prevTeeth: TeethMap,
  nextTeeth: TeethMap,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!canEditOdontogram(profile.role))
    return { error: "Solo los doctores y el administrador pueden modificar el odontograma." };

  const supabase = await createClient();

  // Bloqueo horario (addon "bloqueo_horario"): mismo comportamiento que el
  // odontograma de adultos.
  if (profile.role !== "admin") {
    const features = await getClinicFeatures();
    if (features.bloqueo_horario) {
      const { data: clinic } = await supabase
        .from("clinics")
        .select("settings")
        .eq("id", profile.clinicId)
        .single();
      if (!withinClinicalHours(clinic?.settings))
        return { error: "Fuera del horario de edición permitido. El odontograma está en modo lectura." };
    }
  }

  // 1) Estado actual (1 fila por paciente).
  const { error: upErr } = await supabase.from("odontograms_pediatric").upsert(
    {
      clinic_id: profile.clinicId,
      patient_id: patientId,
      teeth: nextTeeth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "patient_id" },
  );
  if (upErr) return { error: upErr.message };

  // 2) Log inmutable de los cambios.
  const events = diffTeeth(prevTeeth, nextTeeth, {
    clinic_id: profile.clinicId,
    patient_id: patientId,
    actor_id: profile.userId,
  });
  if (events.length > 0) {
    const { error: evErr } = await supabase.from("odontogram_pediatric_events").insert(events);
    if (evErr) return { error: evErr.message };
  }

  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}
