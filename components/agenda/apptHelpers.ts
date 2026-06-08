// Tipos y helpers compartidos por las vistas de la agenda.

export type MonthAppt = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  dentist_name: string | null;
  patient_id: string | null; // expediente vinculado (null en consulta rápida)
  patient_name: string | null; // nombre suelto (paciente no registrado)
  reason: string | null;
  consult_price: number | null;
  deposit: number | null;
  deposit_method: string | null;
  patients: { full_name?: string; national_id?: string | null } | null;
};

export type DoctorOption = { id: string; full_name: string };

// Nombre a mostrar: paciente registrado o, si no, el nombre suelto.
export const apptName = (a: MonthAppt) =>
  a.patients?.full_name ?? a.patient_name ?? "Cita";

// CI del paciente (solo registrados lo tienen).
export const apptCI = (a: MonthAppt) => a.patients?.national_id ?? null;

// Consulta rápida = sin paciente registrado pero con nombre suelto.
export const isQuickConsult = (a: MonthAppt) =>
  !a.patients?.full_name && !!a.patient_name;

// ─── Color por estado de cita ───────────────────────────────────────────────
export function apptRowStyle(status: string) {
  if (status === "finished") return "border-l-2 border-emerald-400 bg-emerald-50/60";
  if (status === "no_show") return "border-l-2 border-slate-300 bg-slate-50/60 opacity-60";
  return "border-l-2 border-clinic/60 bg-clinic/5"; // scheduled
}

export const apptNameColor = (status: string) =>
  status === "finished"
    ? "text-emerald-700"
    : status === "no_show"
      ? "text-slate-400 line-through"
      : "text-slate-800";

// Fondo del bloque en las vistas Día/Semana, por estado.
export function apptBlockStyle(status: string) {
  if (status === "finished") return "border-emerald-400 bg-emerald-50 text-emerald-800";
  if (status === "no_show") return "border-slate-300 bg-slate-100 text-slate-400";
  return "border-clinic/50 bg-clinic/10 text-slate-800"; // scheduled
}
