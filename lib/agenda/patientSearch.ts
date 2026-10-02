import type { SupabaseClient } from "@supabase/supabase-js";
import type { MonthAppt } from "@/components/agenda/apptHelpers";

export type PatientOption = { id: string; full_name: string; national_id: string | null };

export type PatientSearch = (query: string) => Promise<PatientOption[]>;

const RESULT_LIMIT = 8;

// Búsqueda de pacientes para los selectores de la Agenda, resuelta en el
// servidor (search_agenda_patients, 0126). Antes se cargaban todos los
// pacientes al navegador y PostgREST cortaba en 1000 filas, dejando fuera a
// los últimos del orden alfabético. Un doctor solo busca entre los pacientes
// que puede ver (mismos criterios que visible_patients_for_doctor).
export function createPatientSearch(
  supabase: SupabaseClient,
  opts: { doctor?: { dentistName: string; doctorId: string } } = {},
): PatientSearch {
  return async (query) => {
    const { data, error } = await supabase.rpc("search_agenda_patients", {
      p_query: query.trim(),
      p_limit: RESULT_LIMIT,
      p_dentist_name: opts.doctor?.dentistName ?? null,
      p_doctor_id: opts.doctor?.doctorId ?? null,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as PatientOption[];
  };
}

// Paciente registrado ligado a una cita, armado con los datos que ya trae la
// propia cita (join patients). No depende de que el paciente esté en ninguna
// lista precargada.
export function patientOptionFromAppt(appt: MonthAppt | undefined): PatientOption | null {
  if (!appt?.patient_id) return null;
  return {
    id: appt.patient_id,
    full_name: appt.patients?.full_name ?? appt.patient_name ?? "Paciente",
    national_id: appt.patients?.national_id ?? null,
  };
}
