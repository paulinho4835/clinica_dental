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
  if (status === "no_show") return "border-l-2 border-slate-500 bg-slate-200/70";
  return "border-l-2 border-clinic/60 bg-clinic/5"; // scheduled
}

export const apptNameColor = (status: string) =>
  status === "finished"
    ? "text-emerald-700"
    : status === "no_show"
      ? "text-slate-600 line-through"
      : "text-slate-800";

// Fondo del bloque en las vistas Día/Semana, por estado.
export function apptBlockStyle(status: string) {
  if (status === "finished") return "border-emerald-400 bg-emerald-50 text-emerald-800";
  if (status === "no_show") return "border-slate-500 bg-slate-200 text-slate-600";
  return "border-clinic/50 bg-clinic/10 text-slate-800"; // scheduled
}

// Canal de estado puro — sin color de fondo (el color viene del doctor).
// Devuelve clases extra que se aplican sobre el color base del doctor.
export function apptBlockClass(status: string): string {
  if (status === "no_show")
    return "border-dashed !border-slate-500 !bg-slate-200 !text-slate-600";
  if (status === "in_chair")
    return "ring-2 ring-offset-0 animate-pulse-ring";
  if (status === "waiting")
    return "ring-2 ring-amber-400 ring-offset-0";
  if (status === "confirmed")
    return "ring-1 ring-sky-400 ring-offset-0";
  return "";
}

export const isFinished = (status: string) => status === "finished";

// ─── Estados visibles en la agenda (leyenda + filtro) ───────────────────────
// El orden refleja el flujo natural de una cita. `cancelled` se excluye en el
// servidor, por eso no aparece aquí. El `dot` es solo para la leyenda/filtro:
// da un color distinto e inequívoco a cada estado.
export const AGENDA_STATUSES = [
  { key: "scheduled", label: "Pendiente", dot: "bg-slate-400" },
  { key: "confirmed", label: "Confirmada", dot: "bg-sky-500" },
  { key: "waiting", label: "En sala", dot: "bg-amber-400" },
  { key: "in_chair", label: "En sillón", dot: "bg-violet-500" },
  { key: "finished", label: "Atendido", dot: "bg-emerald-500" },
  { key: "no_show", label: "No vino", dot: "bg-rose-400" },
] as const;
